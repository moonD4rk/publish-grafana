import * as core from "@actions/core";
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { checkDashboard } from "./dashboard.js";

const COLLECTOR_TYPES = [
  "collectd",
  "nodeExporter",
  "Snap",
  "Telegraf",
  "Beats",
  "Icinga",
  "Other",
];
const LOGO_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};
const SCREENSHOT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};
const MAX_SCREENSHOT_BYTES = 1024 * 1024;
const BEFORE_A_MERGE = /^(pull_request|merge_group)/;

const workspace = () => process.env.GITHUB_WORKSPACE || process.cwd();

function readFile(input, file) {
  try {
    return readFileSync(path.resolve(workspace(), file));
  } catch (error) {
    throw new Error(`${input}: cannot read ${file} (${error.code})`, {
      cause: error,
    });
  }
}

function readImage(input, file, types) {
  const type = types[path.extname(file).toLowerCase()];
  if (!type) {
    throw new Error(
      `${input}: ${file} is not one of ${Object.keys(types).join(", ")}`,
    );
  }
  return { path: file, type, bytes: readFile(input, file) };
}

function readDashboard(file) {
  const bytes = readFile("dashboard-file", file);
  let dashboard;
  try {
    dashboard = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`dashboard-file: ${file} is not JSON: ${error.message}`, {
      cause: error,
    });
  }
  const { error, warning } = checkDashboard(dashboard);
  if (error) throw new Error(`dashboard-file: ${file} ${error}`);
  if (warning) core.warning(`${file} ${warning}`, { file, title: "Dashboard" });
  return { path: file, type: "application/json", bytes, dashboard };
}

function readScreenshots(patterns) {
  const cwd = workspace();
  const isFile = (file) =>
    statSync(path.resolve(cwd, file), { throwIfNoEntry: false })?.isFile();
  const files = new Set();
  for (const pattern of patterns) {
    const matches = isFile(pattern)
      ? [pattern]
      : globSync(pattern, { cwd }).filter(isFile).sort();
    if (matches.length === 0) {
      throw new Error(`screenshots: no file matches ${pattern}`);
    }
    for (const match of matches) files.add(path.normalize(match));
  }
  return [...files].map((file) => {
    const image = readImage("screenshots", file, SCREENSHOT_TYPES);
    if (image.bytes.length > MAX_SCREENSHOT_BYTES) {
      const size = (image.bytes.length / MAX_SCREENSHOT_BYTES).toFixed(1);
      throw new Error(
        `screenshots: ${file} is ${size} MiB, and grafana.com takes 1 MiB at most`,
      );
    }
    return image;
  });
}

function readLogo(file) {
  const logo = readImage("logo", file, LOGO_TYPES);
  return { ...logo, svg: logo.type === "image/svg+xml" };
}

function readCollectorType(value) {
  const type = COLLECTOR_TYPES.find(
    (known) => known.toLowerCase() === value.toLowerCase(),
  );
  if (!type) {
    throw new Error(
      `collector-type: "${value}" is not one of ${COLLECTOR_TYPES.join(", ")}`,
    );
  }
  return type;
}

const readList = (input) => (items) => {
  const comma = items.find((item) => item.includes(","));
  if (comma)
    throw new Error(`${input}: "${comma}" has a comma: put one per line`);
  return [...new Set(items)];
};

const SOURCES = {
  revision: { input: "dashboard-file", read: readDashboard },
  name: { input: "name" },
  description: { input: "description" },
  readme: {
    input: "readme-file",
    read: (file) => readFile("readme-file", file).toString("utf8"),
  },
  screenshots: { input: "screenshots", lines: true, read: readScreenshots },
  logo: { input: "logo", read: readLogo },
  categories: {
    input: "categories",
    lines: true,
    read: readList("categories"),
  },
  "collector-type": { input: "collector-type", read: readCollectorType },
  "collector-plugins": {
    input: "collector-plugins",
    lines: true,
    read: readList("collector-plugins"),
  },
  "collector-config": { input: "collector-config" },
};

function readDryRun(token) {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  const unset = core.getInput("dry-run") === "";
  const dryRun = unset
    ? BEFORE_A_MERGE.test(event)
    : core.getBooleanInput("dry-run");
  if (unset && dryRun) {
    core.info(
      `dry-run is not set and the event is ${event}, so nothing is published. To publish from it, pass dry-run: false`,
    );
  }
  if (!dryRun && !token) {
    throw new Error(
      "token: it is empty, so the run cannot publish. Check the secret's name, and that this run may read it: a pull request from a fork may not. A run with dry-run: true needs no token",
    );
  }
  return dryRun;
}

export function readInputs() {
  const dashboardId = core.getInput("dashboard-id", { required: true });
  if (!/^[1-9]\d*$/.test(dashboardId)) {
    throw new Error(
      `dashboard-id: "${dashboardId}" is not the number grafana.com gave the dashboard`,
    );
  }
  const token = core.getInput("token");
  if (token) core.setSecret(token);
  const dryRun = readDryRun(token);

  const wanted = {};
  for (const [part, source] of Object.entries(SOURCES)) {
    const value = source.lines
      ? core.getMultilineInput(source.input)
      : core.getInput(source.input);
    if (value.length > 0) wanted[part] = source.read?.(value) ?? value;
  }
  if (Object.keys(wanted).length === 0) {
    const inputs = Object.values(SOURCES).map((source) => source.input);
    throw new Error(`nothing to publish: pass one of ${inputs.join(", ")}`);
  }
  // grafana.com serves the listing's description inside the dashboard, so the file's own is the default
  const own = wanted.revision?.dashboard.description;
  if (!wanted.description && typeof own === "string" && own.trim()) {
    wanted.description = own;
  }
  return { dashboardId, token, dryRun, wanted };
}
