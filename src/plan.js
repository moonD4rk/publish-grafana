import { dashboardChanges, sameDashboard } from "./dashboard.js";

const normalize = (text) =>
  String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();

const clip = (text) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);
const lines = (text) => (text ? text.split("\n") : []);

function unmatched(from, to) {
  const left = [...to];
  return from.filter((line) => {
    const at = left.indexOf(line);
    if (at >= 0) left.splice(at, 1);
    return at < 0;
  }).length;
}

function textChange(wanted, held) {
  const [now, old] = [normalize(wanted), normalize(held)];
  if (!(now + old).includes("\n")) {
    return `${JSON.stringify(clip(old))} → ${JSON.stringify(clip(now))}`;
  }
  const added = unmatched(lines(now), lines(old));
  return `+${added} -${unmatched(lines(old), lines(now))} lines`;
}

const text = (field) => ({
  diff: (wanted, current) =>
    normalize(wanted) === normalize(current[field])
      ? null
      : [[field, normalize(wanted)]],
  detail: (wanted, current) => textChange(wanted, current[field]),
});

const clauses = (groups) =>
  groups
    .filter(([, items]) => items.length > 0)
    .map(([verb, items]) => `${verb} ${items.join(", ")}`)
    .join("; ");

const set = (field) => ({
  diff: (wanted, current) =>
    wanted.length === new Set(current[field]).size &&
    wanted.every((item) => current[field].includes(item))
      ? null
      : [[field, wanted.join(",")]],
  detail: (wanted, current) =>
    clauses([
      ["adds", wanted.filter((item) => !current[field].includes(item))],
      ["removes", current[field].filter((item) => !wanted.includes(item))],
    ]),
});

const screenshots = {
  // grafana.com lists a new image after the ones it holds, so only a leading run of the wanted list can stay
  diff(files, current) {
    const remove = [];
    let kept = 0;
    for (const image of current.screenshots) {
      if (kept < files.length && image.bytes.equals(files[kept].bytes)) kept++;
      else remove.push(image.id);
    }
    const upload = files.slice(kept).map((file) => ["screenshots", file]);
    if (remove.length > 0)
      upload.unshift(["screenshotsToRemove", remove.join(",")]);
    return upload.length > 0 ? upload : null;
  },
  detail(files, current, change) {
    const sent = (field) =>
      change.filter(([name]) => name === field).map(([, value]) => value);
    return clauses([
      [
        "removes",
        sent("screenshotsToRemove").map((ids) => ids.split(",").length),
      ],
      ["uploads", sent("screenshots").map((file) => file.path)],
    ]);
  },
};

const logo = {
  diff(file, current) {
    const same = file.svg || (current.logo && file.bytes.equals(current.logo));
    return current.hasLogo && same ? null : [["logo", file]];
  },
  detail: (file, current) =>
    current.hasLogo ? "replaces the listing's" : "the listing has none",
};

const revision = {
  diff: (file, current) =>
    sameDashboard(file.dashboard, current.dashboard) ? null : [["json", file]],
  detail: (file, current) =>
    dashboardChanges(file.dashboard, current.dashboard),
};

const PART = {
  revision,
  name: text("name"),
  description: text("description"),
  readme: text("readme"),
  screenshots,
  logo,
  categories: set("categories"),
  "collector-type": text("collectorType"),
  "collector-plugins": set("collectorPlugins"),
  "collector-config": text("collectorConfig"),
};

export const PARTS = Object.keys(PART);

export const plan = (wanted, current) =>
  PARTS.filter((part) => part in wanted).map((part) => {
    const change = PART[part].diff(wanted[part], current);
    const detail = change && PART[part].detail(wanted[part], current, change);
    return { part, change, detail };
  });
