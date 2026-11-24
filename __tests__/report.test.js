import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";

jest.unstable_mockModule("@actions/core", () => core);

const { report } = await import("../src/report.js");

const url = "https://grafana.com/grafana/dashboards/26104-demo/";
const entries = [
  { part: "revision", change: [["json", {}]] },
  { part: "name", change: null },
  { part: "readme", change: [["readme", "# Demo"]] },
];

describe("report", () => {
  beforeEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
  });

  it("sets the outputs and logs each part of a dry run", async () => {
    await report(entries, { dryRun: true, revision: 9, url });

    expect(core.setOutput.mock.calls).toEqual([
      ["changed", true],
      ["changes", "revision,readme"],
      ["revision", 9],
      ["url", url],
    ]);
    expect(core.info.mock.calls).toEqual([
      ["revision: would publish"],
      ["name: unchanged"],
      ["readme: would publish"],
    ]);
    expect(core.summary.write).not.toHaveBeenCalled();
  });

  it("reports nothing changed", async () => {
    await report([entries[1]], { dryRun: false, revision: 9, url });

    expect(core.setOutput).toHaveBeenCalledWith("changed", false);
    expect(core.setOutput).toHaveBeenCalledWith("changes", "");
  });

  it("writes the job summary when the runner has one", async () => {
    process.env.GITHUB_STEP_SUMMARY = "/tmp/summary";

    await report(entries, { dryRun: false, revision: 10, url });

    expect(core.summary.addHeading).toHaveBeenCalledWith("Published", 3);
    expect(core.summary.addTable.mock.calls[0][0].slice(1)).toEqual([
      ["revision", "published"],
      ["name", "unchanged"],
      ["readme", "published"],
    ]);
    expect(core.summary.addLink).toHaveBeenCalledWith(url, url);
    expect(core.summary.write).toHaveBeenCalled();
  });
});
