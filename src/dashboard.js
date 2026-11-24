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

function comparable(dashboard) {
  const copy = { ...dashboard };
  delete copy.gnetId;
  delete copy.description;
  return JSON.stringify(canonical(copy));
}

export const sameDashboard = (file, served) =>
  comparable(file) === comparable(served);
