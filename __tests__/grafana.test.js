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

  it("retries a read that got no answer, then says why", async () => {
    const fetch = jest.fn(async () => {
      throw new TypeError("fetch failed", { cause: new Error("ENOTFOUND") });
    });

    await expect(createClient({ fetch, wait }).listing("1")).rejects.toThrow(
      "GET /dashboards/1 got no answer from grafana.com: ENOTFOUND",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("uploads a revision as a multipart request with the token", async () => {
    const fetch = fakeFetch({
      "POST /dashboards/26104/revisions": { revision: 10 },
    });
    const file = {
      path: "grafana/dashboard.json",
      type: "application/json",
      bytes: Buffer.from('{"title":"Demo"}'),
    };

    const answer = await createClient({
      fetch,
      token: "secret",
    }).publishRevision("26104", [["json", file]]);

    const [url, request] = fetch.mock.calls[0];
    const part = request.body.get("json");
    expect(answer).toEqual({ revision: 10 });
    expect(url).toBe("https://grafana.com/api/dashboards/26104/revisions");
    expect(request).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer secret" },
      redirect: "error",
    });
    expect([part.name, part.type, await part.text()]).toEqual([
      "dashboard.json",
      "application/json",
      '{"title":"Demo"}',
    ]);
  });

  it("updates the listing with texts and files in one request", async () => {
    const fetch = fakeFetch({ "POST /dashboards/26104": {} });
    const image = (name) => ({
      path: `shots/${name}`,
      type: "image/png",
      bytes: Buffer.from(name),
    });

    await createClient({ fetch, token: "secret" }).updateListing("26104", [
      ["name", "Demo"],
      ["screenshotsToRemove", "1,2"],
      ["screenshots", image("a.png")],
      ["screenshots", image("b.png")],
    ]);

    const { body } = fetch.mock.calls[0][1];
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body.get("name")).toBe("Demo");
    expect(body.get("screenshotsToRemove")).toBe("1,2");
    expect(body.getAll("screenshots").map((file) => file.name)).toEqual([
      "a.png",
      "b.png",
    ]);
  });

  it("never retries a write", async () => {
    const fetch = jest.fn(failing(500));
    const client = createClient({ fetch, wait, token: "secret" });

    const writing = client.updateListing("26104", [["name", "Demo"]]);

    await expect(writing).rejects.toBeInstanceOf(GrafanaError);
    expect(fetch).toHaveBeenCalledTimes(1);
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
