import * as core from "@actions/core";
import { apply } from "./apply.js";
import { createClient } from "./grafana.js";
import { readInputs } from "./inputs.js";
import { checkCategories, readListing } from "./listing.js";
import { plan } from "./plan.js";
import { report } from "./report.js";

const preview = (entry) => ({
  ...entry,
  outcome: entry.change ? "would publish" : "unchanged",
});

export async function run({ fetch } = {}) {
  try {
    const { dashboardId, token, dryRun, wanted } = readInputs();
    const client = createClient({ token, fetch });
    const current = await readListing(client, dashboardId, wanted);
    const entries = plan(wanted, current);

    if (entries.some(({ part, change }) => part === "categories" && change)) {
      await checkCategories(client, wanted.categories);
    }
    if (current.status !== "active") {
      core.warning(
        `the listing is ${current.status}, so grafana.com does not show it yet`,
      );
    }

    const { error, ...result } = dryRun
      ? { entries: entries.map(preview), revision: current.revision }
      : await apply(client, dashboardId, { wanted, current, entries });
    await report(result.entries, { ...current, ...result, dryRun });
    if (error) throw error;
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
