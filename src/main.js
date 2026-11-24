import * as core from "@actions/core";
import { createClient } from "./grafana.js";
import { readInputs } from "./inputs.js";
import { checkCategories, readListing } from "./listing.js";
import { plan } from "./plan.js";
import { report } from "./report.js";

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
    if (!dryRun) {
      core.warning(
        "publishing is not implemented yet: this run only reports what would change",
      );
    }
    await report(entries, { ...current, dryRun: true });
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
