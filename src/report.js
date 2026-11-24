import * as core from "@actions/core";

export async function report(entries, { dryRun, revision, url }) {
  const changes = entries.filter((entry) => entry.change);
  const published = dryRun ? "would publish" : "published";
  const rows = entries.map(({ part, change }) => {
    const outcome = change ? published : "unchanged";
    core.info(`${part}: ${outcome}`);
    return [part, outcome];
  });

  core.setOutput("changed", changes.length > 0);
  core.setOutput("changes", changes.map((entry) => entry.part).join(","));
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
        ...rows,
      ])
      .addLink(url, url)
      .write();
  }
}
