import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";
import { dashboard, listing } from "../__fixtures__/grafana.js";

jest.unstable_mockModule("@actions/core", () => core);

const { checkCategories, readListing } = await import("../src/listing.js");

const client = (answer = listing()) => ({
  listing: jest.fn(async () => answer),
  screenshot: jest.fn(async (id, imageId) => Buffer.from(`image ${imageId}`)),
  logo: jest.fn(async () => Buffer.from("logo")),
  categories: jest.fn(async () => ["aws", "docker"]),
});

describe("readListing", () => {
  it("reads the parts of the listing from one request", async () => {
    const grafana = client();

    const current = await readListing(grafana, "26104", { name: "Demo" });

    expect(current).toEqual({
      revision: 9,
      status: "active",
      url: "https://grafana.com/grafana/dashboards/26104-publish-grafana-demo/",
      dashboard: {
        ...dashboard,
        gnetId: 26104,
        description: "Sample service dashboard",
      },
      name: "publish-grafana demo",
      description: "Sample service dashboard",
      readme: "# publish-grafana demo\n",
      hasLogo: true,
      categories: ["hostmetrics"],
      collectorType: "",
      collectorPlugins: ["Other"],
      collectorConfig: null,
    });
    expect(grafana.screenshot).not.toHaveBeenCalled();
    expect(grafana.logo).not.toHaveBeenCalled();
  });

  it("downloads the screenshots in the order of their IDs when they are wanted", async () => {
    const answer = listing({ screenshots: [{ id: 30 }, { id: 4 }] });

    const current = await readListing(client(answer), "26104", {
      screenshots: [],
    });

    expect(current.screenshots).toEqual([
      { id: 4, bytes: Buffer.from("image 4") },
      { id: 30, bytes: Buffer.from("image 30") },
    ]);
  });

  it("downloads the logo when a PNG or JPEG logo is wanted", async () => {
    const current = await readListing(client(), "26104", { logo: {} });

    expect(current.logo).toEqual(Buffer.from("logo"));
  });

  it("does not download the logo to compare it with an SVG", async () => {
    const grafana = client();

    const current = await readListing(grafana, "26104", {
      logo: { svg: true },
    });

    expect(current.logo).toBeUndefined();
    expect(grafana.logo).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining("SVG"));
  });

  it("does not download a logo that the listing does not have", async () => {
    const grafana = client(listing({ hasLogo: false }));

    await readListing(grafana, "26104", { logo: {} });

    expect(grafana.logo).not.toHaveBeenCalled();
  });

  it("names the input when grafana.com finds no such dashboard", async () => {
    const grafana = client();
    grafana.listing.mockRejectedValue(
      Object.assign(new Error("answered 404"), { status: 404 }),
    );

    await expect(readListing(grafana, "404", {})).rejects.toThrow(
      "dashboard-id: grafana.com finds no dashboard 404",
    );
  });

  it("passes on any other failure to read the listing", async () => {
    const grafana = client();
    grafana.listing.mockRejectedValue(new Error("got no answer"));

    await expect(readListing(grafana, "26104", {})).rejects.toThrow(
      "got no answer",
    );
  });

  it("says so when the answer is not a listing", async () => {
    const reading = readListing(client({ id: 26104 }), "26104", {});

    await expect(reading).rejects.toThrow(
      "grafana.com's answer for dashboard 26104 is not what the action expects",
    );
  });
});

describe("checkCategories", () => {
  it("accepts the categories that grafana.com has", async () => {
    await expect(
      checkCategories(client(), ["docker"]),
    ).resolves.toBeUndefined();
  });

  it("names the categories that grafana.com does not have", async () => {
    await expect(checkCategories(client(), ["docker", "k8s"])).rejects.toThrow(
      "categories: grafana.com has no k8s; it has aws, docker",
    );
  });
});
