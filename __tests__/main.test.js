import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";
import { dashboard, fakeFetch, listing } from "../__fixtures__/grafana.js";
import { createWorkspace } from "../__fixtures__/workspace.js";

jest.unstable_mockModule("@actions/core", () => core);

const { run } = await import("../src/main.js");

const removeWorkspace = createWorkspace({
  "dashboard.json": JSON.stringify({
    ...dashboard,
    description: "Sample service dashboard",
  }),
  "described.json": JSON.stringify({
    ...dashboard,
    description: "A new description",
  }),
  "README.md": "# publish-grafana demo\n",
  "overview.png": "overview",
  "requests.png": "requests",
  "logo.png": "logo",
});

afterAll(removeWorkspace);

const everything = {
  "dashboard-id": "26104",
  "dashboard-file": "dashboard.json",
  name: "publish-grafana demo",
  "readme-file": "README.md",
  screenshots: "overview.png\nrequests.png",
  logo: "logo.png",
  categories: "hostmetrics",
};

const grafana = (answer = listing()) =>
  fakeFetch({
    "/dashboards/26104": answer,
    "/dashboards/26104/images/22446/image": Buffer.from("overview"),
    "/dashboards/26104/images/22448/image": Buffer.from("requests"),
    "/dashboards/26104/logos/large": Buffer.from("logo"),
    "/categories": { items: [{ slug: "docker" }, { slug: "hostmetrics" }] },
  });

const outputs = () => Object.fromEntries(core.setOutput.mock.calls);

describe("run", () => {
  it("reports a listing that matches the repository as unchanged", async () => {
    core.setInputs(everything);

    await run({ fetch: grafana() });

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalled();
    expect(outputs()).toEqual({
      changed: false,
      changes: "",
      revision: 9,
      url: "https://grafana.com/grafana/dashboards/26104-publish-grafana-demo/",
    });
  });

  it("reports the parts that differ", async () => {
    core.setInputs({
      ...everything,
      name: "Another name",
      screenshots: "requests.png",
      categories: "docker",
    });

    await run({ fetch: grafana() });

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(outputs().changes).toBe("name,screenshots,categories");
    expect(core.info).toHaveBeenCalledWith(
      "screenshots: would publish (removes 1)",
    );
  });

  it("fails on a category that grafana.com does not have", async () => {
    core.setInputs({ ...everything, categories: "kubernetes" });

    await run({ fetch: grafana() });

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("grafana.com has no kubernetes"),
    );
    expect(core.setOutput).not.toHaveBeenCalled();
  });

  it("warns that a pending listing is not shown", async () => {
    core.setInputs({ "dashboard-id": "26104", name: "publish-grafana demo" });

    await run({ fetch: grafana(listing({ statusCode: "pending" })) });

    expect(core.warning).toHaveBeenCalledWith(
      "the listing is pending, so grafana.com does not show it yet",
    );
  });

  it("publishes with a token and reports what it published", async () => {
    let name = "publish-grafana demo";
    const fetch = fakeFetch({
      "/dashboards/26104": () => listing({ name }),
      "POST /dashboards/26104": () => {
        name = "Renamed";
        return {};
      },
    });
    core.setInputs({ "dashboard-id": "26104", name: "Renamed", token: "t" });

    await run({ fetch });

    const update = fetch.mock.calls.find(([, { method }]) => method === "POST");
    expect(update[1].body.get("name")).toBe("Renamed");
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(
      'name: published ("publish-grafana demo" → "Renamed")',
    );
    expect(outputs()).toMatchObject({ changed: true, changes: "name" });
  });

  it("publishes the description of the dashboard file", async () => {
    let description = "Sample service dashboard";
    const fetch = fakeFetch({
      "/dashboards/26104": () => listing({ description }),
      "POST /dashboards/26104": () => {
        description = "A new description";
        return {};
      },
    });
    core.setInputs({
      "dashboard-id": "26104",
      "dashboard-file": "described.json",
      token: "t",
    });

    await run({ fetch });

    const update = fetch.mock.calls.find(([, { method }]) => method === "POST");
    expect(update[1].body.get("description")).toBe("A new description");
    expect(core.info).toHaveBeenCalledWith(
      'the listing\'s description so far: "Sample service dashboard"',
    );
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalled();
    expect(outputs()).toMatchObject({ changed: true, changes: "description" });
  });

  it("publishes nothing in a dry run with a token", async () => {
    const fetch = grafana();
    core.setInputs({
      "dashboard-id": "26104",
      name: "Renamed",
      token: "t",
      "dry-run": "true",
    });

    await run({ fetch });

    expect(fetch.mock.calls.map(([, { method }]) => method)).toEqual(["GET"]);
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("name: would publish"),
    );
    expect(core.notice).not.toHaveBeenCalled();
  });

  it("fails before any request when dry-run is false and the token is empty", async () => {
    const fetch = grafana();
    core.setInputs({
      "dashboard-id": "26104",
      name: "Renamed",
      "dry-run": "false",
    });

    await run({ fetch });

    expect(fetch).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("token: it is empty"),
    );
  });

  it("reports what was not published before it fails", async () => {
    core.setInputs({ "dashboard-id": "26104", name: "Renamed", token: "t" });

    await run({ fetch: grafana() });

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("name: not published"),
    );
    expect(outputs().changed).toBe(false);
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("answered 404 to POST /dashboards/26104"),
    );
  });

  it("fails when the dashboard does not exist", async () => {
    core.setInputs({ "dashboard-id": "404", name: "Demo" });

    await run({ fetch: grafana() });

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(
        "dashboard-id: grafana.com finds no dashboard 404",
      ),
    );
  });

  it("fails with the text of a thrown value that is not an error", async () => {
    core.getInput.mockImplementation(() => {
      throw "no input";
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("no input");
  });
});
