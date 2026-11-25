import * as core from "@actions/core";

const CHANGED = ["published", "would publish"];

const oneLine = (text) => (text ?? "").replace(/\s+/g, " ");
const escapeHtml = (text) =>
  text.replace(/[&<>]/g, (char) => `&#${char.charCodeAt(0)};`);

function heading(outcomes, dryRun) {
  if (dryRun) return "Dry run: nothing was published";
  if (outcomes.includes("not published")) {
    return "Failed: not everything was published";
  }
  if (outcomes.includes("published")) return "Published";
  return "Up to date: nothing to publish";
}

export async function report(entries, { dryRun, revision, url }) {
  const rows = entries.map(({ part, outcome, detail }) => [
    part,
    outcome,
    oneLine(detail),
  ]);
  for (const [part, outcome, detail] of rows) {
    core.info(`${part}: ${outcome}${detail && ` (${detail})`}`);
  }

  const changes = rows
    .filter(([, outcome]) => CHANGED.includes(outcome))
    .map(([part]) => part);
  core.setOutput("changed", changes.length > 0);
  core.setOutput("changes", changes.join(","));
  core.setOutput("revision", revision);
  core.setOutput("url", url);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const outcomes = rows.map(([, outcome]) => outcome);
    await core.summary
      .addHeading(heading(outcomes, dryRun), 3)
      .addTable([
        ["Part", "Outcome", "Details"].map((data) => ({ data, header: true })),
        ...rows.map(([part, outcome, detail]) => [
          part,
          outcome,
          escapeHtml(detail),
        ]),
      ])
      .addLink(url, url)
      .write();
  }
}
