import { PARTS, plan } from "../src/plan.js";

const image = (content) => ({
  path: `${content}.png`,
  bytes: Buffer.from(content),
});

const current = {
  dashboard: { title: "Demo", gnetId: 26104, description: "listing" },
  name: "Demo",
  description: "A demo",
  readme: "# Demo\n\nText\n",
  screenshots: [
    { id: 1, bytes: Buffer.from("a") },
    { id: 2, bytes: Buffer.from("b") },
  ],
  hasLogo: true,
  logo: Buffer.from("logo"),
  categories: ["docker", "hostmetrics"],
  collectorType: "Telegraf",
  collectorPlugins: ["cpu", "mem"],
  collectorConfig: null,
};

const change = (part, wanted, state = current) =>
  plan({ [part]: wanted }, state)[0].change;
const detail = (part, wanted, state = current) =>
  plan({ [part]: wanted }, state)[0].detail;

describe("plan", () => {
  it("has one entry per part that was passed, in the order of PARTS", () => {
    const wanted = { readme: "# Demo\n\nText", name: "Demo", logo: image("x") };

    expect(plan(wanted, current).map((entry) => entry.part)).toEqual([
      "name",
      "readme",
      "logo",
    ]);
    expect(plan({}, current)).toEqual([]);
    expect(PARTS[0]).toBe("revision");
  });

  describe("revision", () => {
    it("is unchanged when only gnetId and description differ", () => {
      const file = { dashboard: { description: "file", title: "Demo" } };

      expect(change("revision", file)).toBeNull();
    });

    it("uploads the file when the dashboard differs", () => {
      const file = { dashboard: { title: "Demo 2" } };

      expect(change("revision", file)).toEqual([["json", file]]);
    });
  });

  describe("text", () => {
    it.each([
      ["name", "Demo", null],
      ["name", "  Demo\n", null],
      ["name", "Demo 2", [["name", "Demo 2"]]],
      ["description", "Another", [["description", "Another"]]],
      ["readme", "# Demo\r\n\r\nText\r\n", null],
      ["readme", "# Demo\n\nMore\n", [["readme", "# Demo\n\nMore"]]],
      ["collector-type", "Telegraf", null],
      ["collector-type", "Other", [["collectorType", "Other"]]],
      ["collector-config", "apt install", [["collectorConfig", "apt install"]]],
    ])("%s %j", (part, wanted, expected) => {
      expect(change(part, wanted)).toEqual(expected);
    });
  });

  describe("sets", () => {
    it.each([
      ["categories", ["hostmetrics", "docker"], null],
      ["categories", ["docker"], [["categories", "docker"]]],
      ["categories", ["docker", "aws"], [["categories", "docker,aws"]]],
      ["collector-plugins", ["mem", "cpu"], null],
      ["collector-plugins", ["cpu"], [["collectorPlugins", "cpu"]]],
    ])("%s %j", (part, wanted, expected) => {
      expect(change(part, wanted)).toEqual(expected);
    });
  });

  describe("screenshots", () => {
    const a = image("a");
    const b = image("b");
    const c = image("c");

    it.each([
      ["the same images in the same order", [a, b], null],
      ["one more image", [a, b, c], [["screenshots", c]]],
      ["the first image gone", [b], [["screenshotsToRemove", "1"]]],
      [
        "another order",
        [b, a],
        [
          ["screenshotsToRemove", "1"],
          ["screenshots", a],
        ],
      ],
      [
        "other images",
        [c],
        [
          ["screenshotsToRemove", "1,2"],
          ["screenshots", c],
        ],
      ],
      [
        "an image in the middle",
        [a, c, b],
        [
          ["screenshotsToRemove", "2"],
          ["screenshots", c],
          ["screenshots", b],
        ],
      ],
    ])("%s", (_, wanted, expected) => {
      expect(change("screenshots", wanted)).toEqual(expected);
    });

    it("uploads everything to a listing without screenshots", () => {
      const empty = { ...current, screenshots: [] };

      expect(change("screenshots", [a], empty)).toEqual([["screenshots", a]]);
    });

    it("removes an image that the listing holds twice", () => {
      const twice = {
        ...current,
        screenshots: [
          { id: 1, bytes: a.bytes },
          { id: 2, bytes: a.bytes },
        ],
      };

      expect(change("screenshots", [a], twice)).toEqual([
        ["screenshotsToRemove", "2"],
      ]);
    });
  });

  describe("logo", () => {
    const same = { bytes: Buffer.from("logo") };
    const other = { bytes: Buffer.from("other") };
    const svg = { bytes: Buffer.from("<svg/>"), svg: true };
    const none = { ...current, hasLogo: false, logo: undefined };

    it.each([
      ["the same file", same, current, null],
      ["another file", other, current, [["logo", other]]],
      ["no logo on the listing", same, none, [["logo", same]]],
      [
        "an SVG and a logo on the listing",
        svg,
        { ...current, logo: undefined },
        null,
      ],
      ["an SVG and no logo on the listing", svg, none, [["logo", svg]]],
    ])("%s", (_, wanted, state, expected) => {
      expect(change("logo", wanted, state)).toEqual(expected);
    });
  });

  describe("detail", () => {
    const a = image("a");
    const b = image("b");
    const c = image("c");
    const none = { ...current, hasLogo: false, logo: undefined };

    it.each([
      ["name", "Demo", null],
      ["name", "Demo 2", '"Demo" → "Demo 2"'],
      ["description", "x".repeat(61), `"A demo" → "${"x".repeat(59)}…"`],
      ["readme", "# Demo\n\nMore\nlines\n", "+2 -1 lines"],
      ["collector-config", "apt install", '"" → "apt install"'],
      ["collector-config", "apt update\napt install", "+2 -0 lines"],
      ["categories", ["docker", "aws"], "adds aws; removes hostmetrics"],
      ["collector-plugins", ["cpu"], "removes mem"],
      ["screenshots", [a, b, c], "uploads c.png"],
      ["screenshots", [b], "removes 1"],
      ["screenshots", [c, a], "removes 2; uploads c.png, a.png"],
      ["logo", image("x"), "replaces the listing's"],
      ["revision", { dashboard: { title: "Demo 2" } }, "fields changed: title"],
    ])("%s %j", (part, wanted, expected) => {
      expect(detail(part, wanted)).toBe(expected);
    });

    it("says that a listing has no logo yet", () => {
      expect(detail("logo", image("x"), none)).toBe("the listing has none");
    });
  });
});
