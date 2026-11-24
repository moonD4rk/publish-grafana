import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";
import { fakeFetch, listing, notFound } from "../__fixtures__/grafana.js";

jest.unstable_mockModule("@actions/core", () => core);

const { createClient, GrafanaError } = await import("../src/grafana.js");

const wait = jest.fn();
const failing = (status) => () => Response.json({}, { status });

describe("the grafana.com client", () => {
  it("reads the listing without a token", async () => {
    const fetch = fakeFetch({ "/dashboards/26104": listing() });

    const answer = await createClient({ fetch }).listing("26104");

    expect(answer.slug).toBe("publish-grafana-demo");
    expect(fetch).toHaveBeenCalledWith(
      "https://grafana.com/api/dashboards/26104",
      expect.objectContaining({
        method: "GET",
        headers: {},
        redirect: "error",
      }),
    );
  });

  it("sends the token as a bearer token", async () => {
    const fetch = fakeFetch({ "/dashboards/26104": listing() });

    await createClient({ fetch, token: "secret" }).listing("26104");

    expect(fetch.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer secret",
    });
  });

  it("reads a screenshot, the logo and the category slugs", async () => {
    const client = createClient({
      fetch: fakeFetch({
        "/dashboards/26104/images/7/image": Buffer.from("shot"),
        "/dashboards/26104/logos/large": Buffer.from("logo"),
        "/categories": { items: [{ slug: "aws" }, { slug: "docker" }] },
      }),
    });

    expect(await client.screenshot("26104", 7)).toEqual(Buffer.from("shot"));
    expect(await client.logo("26104")).toEqual(Buffer.from("logo"));
    expect(await client.categories()).toEqual(["aws", "docker"]);
  });

  it("fails on an error with its code, message and request ID, without retrying", async () => {
    const fetch = fakeFetch({});

    const reading = createClient({ fetch, wait }).listing("1");

    await expect(reading).rejects.toThrow(
      "grafana.com answered 404 to GET /dashboards/1: NotFound: Dashboard not found (request req-1)",
    );
    await expect(reading).rejects.toMatchObject({
      status: 404,
      code: "NotFound",
      requestId: "req-1",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails on an error that is not JSON", async () => {
    const fetch = jest.fn(async () => new Response("<html>", { status: 403 }));

    await expect(createClient({ fetch }).listing("1")).rejects.toThrow(
      "grafana.com answered 403 to GET /dashboards/1: no details",
    );
  });

  it.each([[500], [503], [429]])(
    "retries a read after a %i",
    async (status) => {
      const fetch = jest
        .fn()
        .mockImplementationOnce(failing(status))
        .mockImplementationOnce(failing(status))
        .mockImplementation(async () => Response.json(listing()));

      await createClient({ fetch, wait }).listing("26104");

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(wait.mock.calls).toEqual([[1000], [2000]]);
    },
  );

  it("gives up after three attempts", async () => {
    const fetch = jest.fn(failing(502));

    const reading = createClient({ fetch, wait }).listing("26104");

    await expect(reading).rejects.toBeInstanceOf(GrafanaError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries a request that did not reach grafana.com, then says why", async () => {
    const fetch = jest.fn(async () => {
      throw new TypeError("fetch failed", { cause: new Error("ENOTFOUND") });
    });

    await expect(createClient({ fetch, wait }).listing("1")).rejects.toThrow(
      "GET /dashboards/1 did not reach grafana.com: ENOTFOUND",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("waits between attempts by default", async () => {
    jest.useFakeTimers();
    const fetch = jest
      .fn()
      .mockImplementationOnce(async () => notFound().clone())
      .mockImplementationOnce(failing(500))
      .mockImplementation(async () => Response.json(listing()));
    const client = createClient({ fetch });

    await expect(client.listing("1")).rejects.toThrow("404");
    const reading = client.listing("26104");
    await jest.advanceTimersByTimeAsync(1000);

    expect((await reading).revision).toBe(9);
    jest.useRealTimers();
  });
});
