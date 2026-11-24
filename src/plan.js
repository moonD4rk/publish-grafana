import { sameDashboard } from "./dashboard.js";

const normalize = (text) => (text ?? "").replace(/\r\n?/g, "\n").trim();

const text = (field) => (wanted, current) =>
  normalize(wanted) === normalize(current[field])
    ? null
    : [[field, normalize(wanted)]];

const set = (field) => (wanted, current) =>
  wanted.length === new Set(current[field]).size &&
  wanted.every((item) => current[field].includes(item))
    ? null
    : [[field, wanted.join(",")]];

// grafana.com lists a new image after the ones it holds, so only a leading run of the wanted list can stay
function screenshots(files, current) {
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
}

function logo(file, current) {
  const same = file.svg || (current.logo && file.bytes.equals(current.logo));
  return current.hasLogo && same ? null : [["logo", file]];
}

const DIFF = {
  revision: (file, current) =>
    sameDashboard(file.dashboard, current.dashboard) ? null : [["json", file]],
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

export const PARTS = Object.keys(DIFF);

export const plan = (wanted, current) =>
  PARTS.filter((part) => part in wanted).map((part) => ({
    part,
    change: DIFF[part](wanted[part], current),
  }));
