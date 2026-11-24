import { checkDashboard, sameDashboard } from "../src/dashboard.js";

describe("sameDashboard", () => {
  const file = {
    title: "Demo",
    description: "from the file",
    gnetId: null,
    panels: [{ id: 1, gridPos: { h: 4, w: 6 } }, { id: 2 }],
  };

  it.each([
    ["the key order differs", { panels: file.panels, title: "Demo" }, true],
    [
      "grafana.com set gnetId and the listing's description",
      { ...file, gnetId: 26104, description: "from the listing" },
      true,
    ],
    [
      "a nested key order differs",
      { ...file, panels: [{ gridPos: { w: 6, h: 4 }, id: 1 }, { id: 2 }] },
      true,
    ],
    ["a value differs", { ...file, title: "Other" }, false],
    ["a panel was removed", { ...file, panels: [file.panels[0]] }, false],
    [
      "the panels are in another order",
      { ...file, panels: [file.panels[1], file.panels[0]] },
      false,
    ],
  ])("when %s", (_, served, same) => {
    expect(sameDashboard(file, served)).toBe(same);
  });
});

describe("checkDashboard", () => {
  it("accepts data source variables and built-in data sources", () => {
    const dashboard = {
      annotations: { list: [{ datasource: { uid: "-- Grafana --" } }] },
      panels: [
        { datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" } },
        { datasource: "$datasource" },
        { datasource: null },
        { datasource: { type: "prometheus" } },
        { datasource: { uid: "-- Mixed --" } },
      ],
    };

    expect(checkDashboard(dashboard)).toEqual({});
  });

  it("warns about each data source with a fixed UID, once", () => {
    const dashboard = {
      panels: [
        { datasource: { uid: "abc123" }, targets: [{ datasource: "Loki" }] },
        { datasource: { uid: "abc123" } },
      ],
    };

    expect(checkDashboard(dashboard).warning).toContain("(abc123, Loki)");
  });

  it("refuses a dashboard in the resource model", () => {
    const dashboard = { apiVersion: "v2beta1", kind: "Dashboard", spec: {} };

    expect(checkDashboard(dashboard).error).toContain("resource model");
  });

  it.each([[null], [[]], ["text"], [42]])("refuses %j", (value) => {
    expect(checkDashboard(value).error).toContain("not a dashboard");
  });
});
