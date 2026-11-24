import {
  checkDashboard,
  dashboardChanges,
  sameDashboard,
} from "../src/dashboard.js";

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

describe("dashboardChanges", () => {
  const requests = { id: 1, title: "Requests" };
  const errors = { id: 2, title: "Errors" };
  const latency = { id: 4, title: "Latency" };
  const row = { id: 3, type: "row", title: "More", panels: [latency] };
  const served = {
    title: "Demo",
    gnetId: 26104,
    description: "from the listing",
    panels: [requests, errors, row],
  };
  const fresh = (id) => ({ id, title: `Panel ${id}` });

  it.each([
    [
      "a panel and a field changed",
      { title: "Demo 2", panels: [{ ...requests, type: "stat" }, errors, row] },
      "panels changed: Requests; fields changed: title",
    ],
    [
      "a panel inside a row changed",
      {
        title: "Demo",
        panels: [requests, errors, { ...row, panels: [{ ...latency, w: 1 }] }],
      },
      "panels changed: Latency",
    ],
    [
      "panels were added and removed",
      { title: "Demo", panels: [requests, { id: 9, type: "text" }, { id: 8 }] },
      "panels added: a text, a panel; panels removed: Errors, More, Latency",
    ],
    [
      "many panels were added",
      {
        title: "Demo",
        panels: [requests, errors, row, ...[5, 6, 7, 8].map(fresh)],
      },
      "panels added: Panel 5, Panel 6, Panel 7 and 1 more",
    ],
    [
      "the panels are in another order",
      { title: "Demo", panels: [errors, requests, row] },
      "panels reordered",
    ],
    [
      "a field was added and the panels removed",
      { title: "Demo", tags: ["demo"] },
      "panels removed: Requests, Errors, More and 1 more; fields changed: tags",
    ],
  ])("when %s", (_, file, changes) => {
    expect(dashboardChanges(file, served)).toBe(changes);
  });

  it("compares with a listing that serves no dashboard", () => {
    expect(dashboardChanges({ title: "Demo" }, null)).toBe(
      "fields changed: title",
    );
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
