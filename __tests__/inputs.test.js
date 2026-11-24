import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";
import { dashboard } from "../__fixtures__/grafana.js";
import { createWorkspace } from "../__fixtures__/workspace.js";

jest.unstable_mockModule("@actions/core", () => core);

const { readInputs } = await import("../src/inputs.js");
const { PARTS } = await import("../src/plan.js");

const removeWorkspace = createWorkspace({
  "dashboard.json": JSON.stringify(dashboard),
  "fixed.json": JSON.stringify({ panels: [{ datasource: { uid: "abc" } }] }),
  "resource.json": JSON.stringify({ apiVersion: "v2", kind: "D", spec: {} }),
  "broken.json": "{",
  "README.md": "# Demo\n",
  "shots/a.png": "a",
  "shots/b.png": "b",
  "shots/c.JPG": "c",
  "shots/notes.txt": "notes",
  "big/huge.png": Buffer.alloc(1024 * 1024 + 1),
  "logo.svg": "<svg/>",
  "logo.gif": "gif",
});

afterAll(removeWorkspace);

const read = (inputs) => {
  core.setInputs({ "dashboard-id": "26104", ...inputs });
  return readInputs();
};

describe("readInputs", () => {
  it("reads every part that was passed", () => {
    const { dashboardId, wanted } = read({
      "dashboard-file": "dashboard.json",
      name: "Demo",
      description: "A demo",
      "readme-file": "README.md",
      screenshots: "shots/b.png\nshots/*.png\nshots/c.JPG",
      logo: "logo.svg",
      categories: "docker\nhostmetrics\ndocker",
      "collector-type": "telegraf",
      "collector-plugins": "cpu\nmem",
      "collector-config": "apt install telegraf",
    });

    expect(dashboardId).toBe("26104");
    expect(Object.keys(wanted)).toEqual(PARTS);
    expect(wanted).toEqual({
      revision: {
        path: "dashboard.json",
        type: "application/json",
        bytes: Buffer.from(JSON.stringify(dashboard)),
        dashboard,
      },
      name: "Demo",
      description: "A demo",
      readme: "# Demo\n",
      screenshots: [
        { path: "shots/b.png", type: "image/png", bytes: Buffer.from("b") },
        { path: "shots/a.png", type: "image/png", bytes: Buffer.from("a") },
        { path: "shots/c.JPG", type: "image/jpeg", bytes: Buffer.from("c") },
      ],
      logo: {
        path: "logo.svg",
        type: "image/svg+xml",
        bytes: Buffer.from("<svg/>"),
        svg: true,
      },
      categories: ["docker", "hostmetrics"],
      "collector-type": "Telegraf",
      "collector-plugins": ["cpu", "mem"],
      "collector-config": "apt install telegraf",
    });
    expect(core.warning).not.toHaveBeenCalled();
  });

  it.each([
    ["no token", { name: "Demo" }, true],
    ["a token", { name: "Demo", token: "secret" }, false],
    [
      "a token and dry-run",
      { name: "Demo", token: "secret", "dry-run": "true" },
      true,
    ],
    [
      "a token and no dry-run",
      { name: "Demo", token: "secret", "dry-run": "false" },
      false,
    ],
  ])("with %s, dryRun is %s", (_, inputs, dryRun) => {
    expect(read(inputs).dryRun).toBe(dryRun);
  });

  it("masks the token", () => {
    expect(read({ name: "Demo", token: "secret" }).token).toBe("secret");
    expect(core.setSecret).toHaveBeenCalledWith("secret");
  });

  it("warns about a dashboard with a fixed data source, on its file", () => {
    read({ "dashboard-file": "fixed.json" });

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("fixed.json refers to a data source"),
      { file: "fixed.json", title: "Dashboard" },
    );
  });

  it.each([
    [{ "dashboard-id": "" }, "Input required and not supplied: dashboard-id"],
    [{ "dashboard-id": "26104-demo", name: "x" }, 'dashboard-id: "26104-demo"'],
    [{}, "nothing to publish: pass one of dashboard-file, name"],
    [
      { "dashboard-file": "missing.json" },
      "dashboard-file: cannot read missing.json (ENOENT)",
    ],
    [
      { "dashboard-file": "shots" },
      "dashboard-file: cannot read shots (EISDIR)",
    ],
    [
      { "dashboard-file": "broken.json" },
      "dashboard-file: broken.json is not JSON",
    ],
    [
      { "dashboard-file": "resource.json" },
      "dashboard-file: resource.json is a dashboard in the resource model",
    ],
    [{ "readme-file": "missing.md" }, "readme-file: cannot read missing.md"],
    [
      { screenshots: "shots/*.webp" },
      "screenshots: no file matches shots/*.webp",
    ],
    [
      { screenshots: "shots/missing.png" },
      "screenshots: no file matches shots/missing.png",
    ],
    [
      { screenshots: "shots/notes.txt" },
      "screenshots: shots/notes.txt is not one of .png, .jpg",
    ],
    [{ screenshots: "big/huge.png" }, "screenshots: big/huge.png is 1.0 MiB"],
    [
      { logo: "logo.gif" },
      "logo: logo.gif is not one of .png, .jpg, .jpeg, .svg",
    ],
    [{ categories: "docker, aws" }, 'categories: "docker, aws" has a comma'],
    [
      { "collector-type": "prometheus" },
      'collector-type: "prometheus" is not one of collectd',
    ],
    [
      { name: "x", token: "t", "dry-run": "maybe" },
      "Input does not meet YAML 1.2: dry-run",
    ],
  ])("fails on %j", (inputs, message) => {
    expect(() => read(inputs)).toThrow(message);
  });
});
