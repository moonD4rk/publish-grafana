import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";

jest.unstable_mockModule("@actions/core", () => core);

const { report } = await import("../src/report.js");

const url = "https://grafana.com/grafana/dashboards/26104-demo/";
const entries = (changed) => [
  { part: "revision", outcome: changed, detail: "panels changed: A <b>\nB" },
  { part: "name", outcome: "unchanged", detail: null },
  { part: "readme", outcome: changed, detail: "+2 -1 lines" },
  { part: "logo", outcome: "not published" },
];

describe("report", () => {
  beforeEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
  });

  it("sets the outputs and logs each part of a dry run on one line", async () => {
    await report(entries("would publish"), { dryRun: true, revision: 9, url });

    expect(core.setOutput.mock.calls).toEqual([
      ["changed", true],
      ["changes", "revision,readme"],
      ["revision", 9],
      ["url", url],
    ]);
    expect(core.info.mock.calls).toEqual([
      ["revision: would publish (panels changed: A <b> B)"],
      ["name: unchanged"],
      ["readme: would publish (+2 -1 lines)"],
      ["logo: not published"],
    ]);
    expect(core.summary.write).not.toHaveBeenCalled();
  });

  it("reports nothing changed", async () => {
    await report([{ part: "name", outcome: "unchanged" }], {
      dryRun: false,
      revision: 9,
      url,
    });

    expect(core.setOutput).toHaveBeenCalledWith("changed", false);
    expect(core.setOutput).toHaveBeenCalledWith("changes", "");
  });

  it("writes the job summary when the runner has one", async () => {
    process.env.GITHUB_STEP_SUMMARY = "/tmp/summary";

    await report(entries("published"), { dryRun: false, revision: 10, url });

    const [header, ...rows] = core.summary.addTable.mock.calls[0][0];
    expect(core.summary.addHeading).toHaveBeenCalledWith(
      "Failed: not everything was published",
      3,
    );
    expect(header.map((cell) => cell.data)).toEqual([
      "Part",
      "Outcome",
      "Details",
    ]);
    expect(rows).toEqual([
      ["revision", "published", "panels changed: A &#60;b&#62; B"],
      ["name", "unchanged", ""],
      ["readme", "published", "+2 -1 lines"],
      ["logo", "not published", ""],
    ]);
    expect(core.summary.addLink).toHaveBeenCalledWith(url, url);
    expect(core.summary.write).toHaveBeenCalled();
  });

  it("heads the summary of a dry run", async () => {
    process.env.GITHUB_STEP_SUMMARY = "/tmp/summary";

    await report(entries("would publish"), { dryRun: true, revision: 9, url });

    expect(core.summary.addHeading).toHaveBeenCalledWith(
      "Dry run: nothing was published",
      3,
    );
  });

  it.each([
    [["published", "unchanged"], "Published"],
    [["unchanged"], "Up to date: nothing to publish"],
    [["published", "not published"], "Failed: not everything was published"],
  ])("heads the summary of a run with %j as %j", async (outcomes, title) => {
    process.env.GITHUB_STEP_SUMMARY = "/tmp/summary";
    const parts = outcomes.map((outcome, i) => ({ part: `p${i}`, outcome }));

    await report(parts, { dryRun: false, revision: 10, url });

    expect(core.summary.addHeading).toHaveBeenCalledWith(title, 3);
  });
});
