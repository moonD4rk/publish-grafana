import { jest } from "@jest/globals";
import * as core from "../__fixtures__/core.js";
import { dashboard, fakeClient, listing } from "../__fixtures__/grafana.js";

jest.unstable_mockModule("@actions/core", () => core);

const { apply } = await import("../src/apply.js");
const { GrafanaError } = await import("../src/grafana.js");
const { readListing } = await import("../src/listing.js");
const { plan } = await import("../src/plan.js");

const image = (content) => ({
  path: `${content}.png`,
  type: "image/png",
  bytes: Buffer.from(content),
});
const file = (changes = {}) => ({
  path: "dashboard.json",
  type: "application/json",
  dashboard: { ...dashboard, ...changes },
});
const media = () => ({
  screenshots: [
    [1, Buffer.from("overview")],
    [2, Buffer.from("requests")],
  ],
  logo: Buffer.from("logo"),
});

const changes = async (client, wanted) => {
  const current = await readListing(client, "26104", wanted);
  return plan(wanted, current)
    .filter((entry) => entry.change)
    .map((entry) => entry.part);
};

const wait = jest.fn();

async function publish(client, wanted) {
  const current = await readListing(client, "26104", wanted);
  const entries = plan(wanted, current);
  const result = await apply(client, "26104", {
    wanted,
    current,
    entries,
    wait,
  });
  return {
    ...result,
    outcomes: Object.fromEntries(
      result.entries.map((entry) => [entry.part, entry.outcome]),
    ),
  };
}

// grafana.com can serve the listing as it was to the first read after an update
async function lagging(client) {
  const read = client.listing.getMockImplementation();
  const old = await read();
  client.listing.mockImplementationOnce(read).mockResolvedValueOnce(old);
}

const offline = () => new Error("POST got no answer from grafana.com");
const nothingToUpdate = () =>
  new GrafanaError("POST", "/dashboards/26104", 409, {
    code: "InvalidArgument",
    message: "Nothing to update",
  });

describe("apply", () => {
  it("sends nothing when the listing matches", async () => {
    const client = fakeClient(listing(), media());
    const wanted = {
      revision: file(),
      name: "publish-grafana demo",
      screenshots: [image("overview"), image("requests")],
      logo: image("logo"),
    };

    const result = await publish(client, wanted);

    expect(result.error).toBeUndefined();
    expect(result.revision).toBe(9);
    expect(new Set(Object.values(result.outcomes))).toEqual(
      new Set(["unchanged"]),
    );
    expect(client.publishRevision).not.toHaveBeenCalled();
    expect(client.updateListing).not.toHaveBeenCalled();
    expect(client.listing).toHaveBeenCalledTimes(1);
  });

  it("publishes every part of the listing in one request", async () => {
    const client = fakeClient(listing(), media());
    const wanted = {
      name: "Renamed",
      description: "Another description",
      readme: "# Renamed\n",
      screenshots: [image("requests"), image("new")],
      logo: image("another logo"),
      categories: ["docker", "aws"],
      "collector-type": "Telegraf",
      "collector-plugins": ["cpu", "mem"],
      "collector-config": "apt install telegraf",
    };

    const result = await publish(client, wanted);

    expect(result.error).toBeUndefined();
    expect(new Set(Object.values(result.outcomes))).toEqual(
      new Set(["published"]),
    );
    expect(client.updateListing).toHaveBeenCalledTimes(1);
    expect(client.updateListing.mock.calls[0][1]).toEqual([
      ["name", "Renamed"],
      ["description", "Another description"],
      ["readme", "# Renamed"],
      ["screenshotsToRemove", "1"],
      ["screenshots", wanted.screenshots[1]],
      ["logo", wanted.logo],
      ["categories", "docker,aws"],
      ["collectorType", "Telegraf"],
      ["collectorPlugins", "cpu,mem"],
      ["collectorConfig", "apt install telegraf"],
    ]);
    expect(await changes(client, wanted)).toEqual([]);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("publishes a revision and puts back the description that the upload replaced", async () => {
    const client = fakeClient();
    const wanted = { revision: file({ title: "A new title" }) };

    const result = await publish(client, wanted);

    expect(result.error).toBeUndefined();
    expect(result.revision).toBe(10);
    expect(result.outcomes).toEqual({ revision: "published" });
    expect(client.publishRevision.mock.calls[0][1]).toEqual([
      ["json", wanted.revision],
    ]);
    expect(client.updateListing.mock.calls[0][1]).toEqual([
      ["description", "Sample service dashboard"],
    ]);
    expect((await client.listing()).description).toBe(
      "Sample service dashboard",
    );
    expect(await changes(client, wanted)).toEqual([]);
  });

  it("does not update the listing when the upload left the description as it was", async () => {
    const client = fakeClient();
    const wanted = {
      revision: file({ title: "New", description: "Sample service dashboard" }),
    };

    await publish(client, wanted);

    expect(client.updateListing).not.toHaveBeenCalled();
  });

  it("sends the description that was passed after a revision", async () => {
    const client = fakeClient();
    const wanted = { revision: file({ title: "New" }), description: "Mine" };

    const result = await publish(client, wanted);

    expect(result.outcomes).toEqual({
      revision: "published",
      description: "published",
    });
    expect(client.updateListing.mock.calls[0][1]).toEqual([
      ["description", "Mine"],
    ]);
    expect(await changes(client, wanted)).toEqual([]);
  });

  it("counts a description as published when the revision upload set it", async () => {
    const client = fakeClient();
    const wanted = {
      revision: file({ title: "New" }),
      description: dashboard.description,
    };

    const result = await publish(client, wanted);

    expect(result.outcomes.description).toBe("published");
    expect(client.updateListing).not.toHaveBeenCalled();
    expect(await changes(client, wanted)).toEqual([]);
  });

  it("does not update the listing when the revision is refused", async () => {
    const client = fakeClient();
    const refused = new GrafanaError("POST", "/revisions", 401, {
      code: "Unauthorized",
    });
    client.publishRevision.mockRejectedValue(refused);

    const result = await publish(client, {
      revision: file({ title: "New" }),
      name: "Renamed",
    });

    expect(result.error).toBe(refused);
    expect(result.revision).toBe(9);
    expect(result.outcomes).toEqual({
      revision: "not published",
      name: "not published",
    });
    expect(client.updateListing).not.toHaveBeenCalled();
  });

  it("reads the listing again when a revision upload got no answer, and goes on when it landed", async () => {
    const client = fakeClient();
    const upload = client.publishRevision.getMockImplementation();
    client.publishRevision.mockImplementation(async (...request) => {
      await upload(...request);
      throw offline();
    });
    const wanted = { revision: file({ title: "New" }), name: "Renamed" };

    const result = await publish(client, wanted);

    expect(result.error).toBeUndefined();
    expect(result.revision).toBe(10);
    expect(result.outcomes).toEqual({
      revision: "published",
      name: "published",
    });
    expect(client.publishRevision).toHaveBeenCalledTimes(1);
    expect(await changes(client, wanted)).toEqual([]);
  });

  it("fails when a revision upload got no answer and did not land", async () => {
    const client = fakeClient();
    client.publishRevision.mockRejectedValue(offline());

    const result = await publish(client, { revision: file({ title: "New" }) });

    expect(result.error.message).toContain("got no answer");
    expect(result.outcomes).toEqual({ revision: "not published" });
    expect(client.publishRevision).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls).toEqual([[1000], [2000], [4000]]);
  });

  it("takes a write that got no answer as landed when a later read shows it", async () => {
    const client = fakeClient();
    const update = client.updateListing.getMockImplementation();
    client.updateListing.mockImplementation(async (...request) => {
      await update(...request);
      throw offline();
    });
    await lagging(client);

    const result = await publish(client, { name: "Renamed" });

    expect(result.error).toBeUndefined();
    expect(result.outcomes).toEqual({ name: "published" });
    expect(client.updateListing).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls).toEqual([[1000]]);
  });

  it("takes a refusal for nothing to update as done when the listing matches", async () => {
    const client = fakeClient(listing(), media());
    const update = client.updateListing.getMockImplementation();
    client.updateListing.mockImplementation(async (...request) => {
      await update(...request);
      throw nothingToUpdate();
    });
    const wanted = { name: "Renamed", screenshots: [image("requests")] };

    const result = await publish(client, wanted);

    expect(result.error).toBeUndefined();
    expect(result.outcomes).toEqual({
      name: "published",
      screenshots: "published",
    });
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("the listing holds what was sent"),
    );
  });

  it("fails when the listing update is refused and the listing does not match", async () => {
    const client = fakeClient();
    client.updateListing.mockRejectedValue(nothingToUpdate());

    const result = await publish(client, { name: "Renamed" });

    expect(result.error.message).toContain("Nothing to update");
    expect(result.outcomes).toEqual({ name: "not published" });
    expect(client.updateListing).toHaveBeenCalledTimes(1);
  });

  it("says what the description was when it cannot be put back", async () => {
    const client = fakeClient();
    client.updateListing.mockRejectedValue(
      new GrafanaError("POST", "/dashboards/26104", 500, {}),
    );

    const result = await publish(client, {
      revision: file({ title: "New" }),
      name: "Renamed",
    });

    expect(result.error.message).toContain(
      'the revision upload replaced the listing\'s description, which was "Sample service dashboard"',
    );
    expect(result.revision).toBe(10);
    expect(result.outcomes).toEqual({
      revision: "published",
      name: "not published",
    });
  });

  it("reads the listing again when grafana.com still serves the old one", async () => {
    const client = fakeClient();
    await lagging(client);

    const result = await publish(client, { name: "Renamed" });

    expect(result.error).toBeUndefined();
    expect(result.outcomes).toEqual({ name: "published" });
    expect(wait.mock.calls).toEqual([[1000]]);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("warns when grafana.com still holds something else after three more reads", async () => {
    const client = fakeClient();
    client.updateListing.mockResolvedValue({});

    const result = await publish(client, { name: "Renamed", readme: "# New" });

    expect(result.error).toBeUndefined();
    expect(wait.mock.calls).toEqual([[1000], [2000], [4000]]);
    expect(core.warning).toHaveBeenCalledWith(
      'grafana.com holds something else than what was sent, so the next run will publish it again: name ("publish-grafana demo" → "Renamed"), readme ("# publish-grafana demo" → "# New")',
    );
  });

  it("warns when the listing cannot be read back", async () => {
    const client = fakeClient();
    client.listing
      .mockImplementationOnce(client.listing.getMockImplementation())
      .mockRejectedValue(new Error("GET got no answer from grafana.com"));

    const result = await publish(client, { name: "Renamed" });

    expect(result.error).toBeUndefined();
    expect(result.outcomes).toEqual({ name: "published" });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("could not be read back"),
    );
  });
});
