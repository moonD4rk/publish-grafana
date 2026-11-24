import * as core from "@actions/core";

const CHANGED = ["published", "would publish"];

export async function report(entries, { dryRun, revision, url }) {
  const changes = entries
    .filter((entry) => CHANGED.includes(entry.outcome))
    .map((entry) => entry.part);
  for (const { part, outcome } of entries) core.info(`${part}: ${outcome}`);

  core.setOutput("changed", changes.length > 0);
  core.setOutput("changes", changes.join(","));
  core.setOutput("revision", revision);
  core.setOutput("url", url);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await core.summary
      .addHeading(dryRun ? "Dry run: nothing was published" : "Published", 3)
      .addTable([
        [
          { data: "Part", header: true },
          { data: "Outcome", header: true },
        ],
        ...entries.map(({ part, outcome }) => [part, outcome]),
      ])
      .addLink(url, url)
      .write();
  }
}
