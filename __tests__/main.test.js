import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";
import { dashboard, fakeFetch, listing } from "../__fixtures__/grafana.js";
import { createWorkspace } from "../__fixtures__/workspace.js";

jest.unstable_mockModule("@actions/core", () => core);

const { run } = await import("../src/main.js");

const removeWorkspace = createWorkspace({
  "dashboard.json": JSON.stringify(dashboard),
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
    expect(core.info).toHaveBeenCalledWith("screenshots: would publish");
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

  it("warns that a run with a token does not publish yet", async () => {
    core.setInputs({ "dashboard-id": "26104", name: "New", token: "secret" });

    await run({ fetch: grafana() });

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("publishing is not implemented yet"),
    );
    expect(outputs().changed).toBe(true);
  });

  it("fails when the dashboard does not exist", async () => {
    core.setInputs({ "dashboard-id": "404", name: "Demo" });

    await run({ fetch: grafana() });

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("answered 404 to GET /dashboards/404"),
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
