import * as core from "@actions/core";
import { GrafanaError } from "./grafana.js";
import { readListing } from "./listing.js";
import { plan } from "./plan.js";

const MEDIA = ["screenshots", "logo"];

const without = (object, keys) =>
  Object.fromEntries(
    Object.entries(object).filter(([key]) => !keys.includes(key)),
  );

const differing = (wanted, current) =>
  plan(wanted, current)
    .filter((entry) => entry.change)
    .map((entry) => entry.part);

// A write is sent once: when its outcome is unknown, the listing as read again decides
async function sendOnce(write, landed) {
  try {
    return await write();
  } catch (error) {
    const unknown = !(error instanceof GrafanaError) || error.status === 409;
    if (!unknown || !(await landed())) throw error;
    core.info(`the listing holds what was sent, although ${error.message}`);
    return undefined;
  }
}

export async function apply(client, id, { wanted, current, entries }) {
  const read = (parts) => readListing(client, id, parts);
  const published = new Set();
  let revision = current.revision;
  let expected = wanted;
  let restoring = false;
  let error;

  try {
    let state = current;
    const upload = entries.find((entry) => entry.part === "revision")?.change;
    if (upload) {
      const file = { revision: wanted.revision };
      const answer = await sendOnce(
        () => client.publishRevision(id, upload),
        async () => differing(file, await read({})).length === 0,
      );
      published.add("revision");
      revision = answer?.revision ?? revision;
      // The upload replaced the listing's description with the file's, so what was there is sent again
      const { description } = current;
      state = { ...current, description: file.revision.dashboard.description };
      expected = { description, ...wanted };
      restoring =
        !("description" in wanted) &&
        differing({ description }, state).length > 0;
    }

    const listing = without(expected, ["revision"]);
    const fields = plan(listing, state).flatMap((entry) => entry.change ?? []);
    if (fields.length > 0) {
      await sendOnce(
        () => client.updateListing(id, fields),
        async () => differing(listing, await read(listing)).length === 0,
      );
    }
    for (const entry of entries) if (entry.change) published.add(entry.part);
  } catch (caught) {
    error = restoring
      ? new Error(
          `${caught.message}; the revision upload replaced the listing's description, which was ${JSON.stringify(current.description)}`,
          { cause: caught },
        )
      : caught;
  }

  if (!error && published.size > 0) {
    try {
      const fresh = await read({});
      revision = fresh.revision;
      const off = differing(without(expected, MEDIA), fresh);
      if (off.length > 0) {
        core.warning(
          `grafana.com holds something else than what was sent for ${off.join(", ")}, so the next run will publish it again`,
        );
      }
    } catch (caught) {
      core.warning(`the listing could not be read back: ${caught.message}`);
    }
  }

  const outcome = ({ part, change }) => {
    if (!change) return "unchanged";
    return published.has(part) ? "published" : "not published";
  };
  return {
    entries: entries.map((entry) => ({ ...entry, outcome: outcome(entry) })),
    revision,
    error,
  };
}
