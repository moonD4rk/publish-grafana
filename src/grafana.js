import * as core from "@actions/core";
import { basename } from "node:path";

const API = "https://grafana.com/api";
const ATTEMPTS = 3;
const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 120_000;

const TOKEN_HINTS = {
  401: "token: grafana.com does not accept it, so it may be mistyped, expired, revoked or too new to work yet",
  403: "token: grafana.com does not let it do this, so its access policy may lack the dashboards:write scope or belong to another organization than the dashboard",
};

export class GrafanaError extends Error {
  constructor(method, path, status, body, hint) {
    const { code, message, requestId } = body ?? {};
    const detail = [code, message].filter(Boolean).join(": ") || "no details";
    const request = requestId ? ` (request ${requestId})` : "";
    const answer = `grafana.com answered ${status} to ${method} ${path}: ${detail}${request}`;
    super(hint ? `${hint}; ${answer}` : answer);
    this.name = "GrafanaError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const retryable = (error) =>
  !(error instanceof GrafanaError) ||
  error.status === 429 ||
  error.status >= 500;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function multipart(fields) {
  const form = new FormData();
  for (const [name, value] of fields) {
    if (typeof value === "string") {
      form.append(name, value);
    } else {
      const file = new Blob([value.bytes], { type: value.type });
      form.append(name, file, basename(value.path));
    }
  }
  return form;
}

export function createClient({
  token,
  fetch = globalThis.fetch,
  wait = pause,
} = {}) {
  async function send(method, path, body) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
        redirect: "error",
        signal: AbortSignal.timeout(body ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error.cause?.message ?? error.message;
      throw new Error(
        `${method} ${path} got no answer from grafana.com: ${reason}`,
        { cause: error },
      );
    }
    core.debug(`${method} ${path} -> ${response.status}`);
    if (!response.ok) {
      const answer = await response.json().catch(() => null);
      const hint = token && TOKEN_HINTS[response.status];
      throw new GrafanaError(method, path, response.status, answer, hint);
    }
    return response;
  }

  async function read(path) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await send("GET", path);
      } catch (error) {
        if (attempt === ATTEMPTS || !retryable(error)) throw error;
        core.debug(`retrying: ${error.message}`);
        await wait(attempt * 1000);
      }
    }
  }

  const json = async (path) => (await read(path)).json();
  const bytes = async (path) =>
    Buffer.from(await (await read(path)).arrayBuffer());
  const write = async (path, fields) =>
    (await send("POST", path, multipart(fields))).json();

  return {
    listing: (id) => json(`/dashboards/${id}`),
    screenshot: (id, imageId) =>
      bytes(`/dashboards/${id}/images/${imageId}/image`),
    logo: (id) => bytes(`/dashboards/${id}/logos/large`),
    categories: async () =>
      (await json("/categories")).items.map((category) => category.slug),
    publishRevision: (id, fields) =>
      write(`/dashboards/${id}/revisions`, fields),
    updateListing: (id, fields) => write(`/dashboards/${id}`, fields),
  };
}
