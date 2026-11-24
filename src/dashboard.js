const BUILT_IN_DATA_SOURCES = new Set([
  "-- Grafana --",
  "-- Mixed --",
  "-- Dashboard --",
  "grafana",
  "__expr__",
]);

function fixedDataSources(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) fixedDataSources(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const uid = key === "datasource" ? (child?.uid ?? child) : undefined;
      if (
        typeof uid === "string" &&
        !uid.startsWith("$") &&
        !BUILT_IN_DATA_SOURCES.has(uid)
      ) {
        found.add(uid);
      }
      fixedDataSources(child, found);
    }
  }
  return found;
}

export function checkDashboard(dashboard) {
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) {
    return { error: "is not a dashboard: its JSON is not an object" };
  }
  if ("apiVersion" in dashboard && "kind" in dashboard && "spec" in dashboard) {
    return {
      error:
        "is a dashboard in the resource model (apiVersion, kind, spec), which grafana.com cannot share: export it from Grafana in the classic JSON model",
    };
  }
  const fixed = [...fixedDataSources(dashboard)];
  if (fixed.length === 0) return {};
  return {
    warning: `refers to a data source by a fixed UID (${fixed.join(", ")}), which another Grafana does not have: export the dashboard for sharing externally, or use a data source variable`,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

const REWRITTEN = ["gnetId", "description"];

const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const differing = (file, served) =>
  Object.keys({ ...served, ...file }).filter(
    (field) =>
      !REWRITTEN.includes(field) && !same(file[field], served?.[field]),
  );

export const sameDashboard = (file, served) =>
  differing(file, served).length === 0;

const nested = (panels) =>
  (panels ?? []).flatMap((panel) => [panel, ...(panel.panels ?? [])]);
const key = (panel) => panel.id ?? panel.title;
const own = (panel) => ({ ...panel, panels: undefined });

function listed(panels) {
  const names = panels.map(
    (panel) => panel.title || `a ${panel.type ?? "panel"}`,
  );
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return names.slice(0, 3).join(", ") + more;
}

function panelChanges(file, served) {
  const wanted = nested(file);
  const held = new Map(nested(served).map((panel) => [key(panel), panel]));
  const kept = new Set(wanted.map(key));
  const groups = {
    changed: wanted.filter(
      (panel) =>
        held.has(key(panel)) && !same(own(panel), own(held.get(key(panel)))),
    ),
    added: wanted.filter((panel) => !held.has(key(panel))),
    removed: [...held.values()].filter((panel) => !kept.has(key(panel))),
  };
  const clauses = Object.entries(groups)
    .filter(([, panels]) => panels.length > 0)
    .map(([verb, panels]) => `panels ${verb}: ${listed(panels)}`);
  return clauses.length > 0 ? clauses : ["panels reordered"];
}

export function dashboardChanges(file, served) {
  const fields = differing(file, served);
  const others = fields.filter((field) => field !== "panels");
  return [
    ...(fields.includes("panels")
      ? panelChanges(file.panels, served?.panels)
      : []),
    ...(others.length > 0 ? [`fields changed: ${others.join(", ")}`] : []),
  ].join("; ");
}
