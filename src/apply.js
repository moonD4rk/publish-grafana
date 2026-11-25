import * as core from "@actions/core";
import { GrafanaError, pause } from "./grafana.js";
import { readListing } from "./listing.js";
import { plan } from "./plan.js";

const MEDIA = ["screenshots", "logo"];
const REREAD_AFTER_MS = [1000, 2000, 4000];

const without = (object, keys) =>
  Object.fromEntries(
    Object.entries(object).filter(([key]) => !keys.includes(key)),
  );

const differing = (wanted, current) =>
  plan(wanted, current).filter((entry) => entry.change);

// grafana.com can serve the old listing for a moment after it answered a write, so a difference is read again
async function readSettled(read, wanted, wait) {
  let fresh = await read();
  let off = differing(wanted, fresh);
  for (const ms of REREAD_AFTER_MS) {
    if (off.length === 0) break;
    const parts = off.map((entry) => entry.part).join(", ");
    core.debug(`the listing differs in ${parts}: reading it again in ${ms} ms`);
    await wait(ms);
    fresh = await read();
    off = differing(wanted, fresh);
  }
  return { fresh, off };
}

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

export async function apply(
  client,
  id,
  { wanted, current, entries, wait = pause },
) {
  const settled = (parts) =>
    readSettled(() => readListing(client, id, parts), parts, wait);
  const landed = (parts) => async () => (await settled(parts)).off.length === 0;
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
        landed(file),
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
      await sendOnce(() => client.updateListing(id, fields), landed(listing));
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
      const { fresh, off } = await settled(without(expected, MEDIA));
      revision = fresh.revision;
      if (off.length > 0) {
        const parts = off
          .map(({ part, detail }) => `${part}${detail && ` (${detail})`}`)
          .join(", ")
          .replace(/\s+/g, " ");
        core.warning(
          `grafana.com holds something else than what was sent, so the next run will publish it again: ${parts}`,
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
