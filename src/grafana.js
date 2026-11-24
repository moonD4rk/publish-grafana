import * as core from "@actions/core";

const API = "https://grafana.com/api";
const ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

export class GrafanaError extends Error {
  constructor(method, path, status, body) {
    const { code, message, requestId } = body ?? {};
    const detail = [code, message].filter(Boolean).join(": ") || "no details";
    const request = requestId ? ` (request ${requestId})` : "";
    super(
      `grafana.com answered ${status} to ${method} ${path}: ${detail}${request}`,
    );
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

export function createClient({
  token,
  fetch = globalThis.fetch,
  wait = pause,
} = {}) {
  async function send(method, path) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error.cause?.message ?? error.message;
      throw new Error(
        `${method} ${path} did not reach grafana.com: ${reason}`,
        { cause: error },
      );
    }
    core.debug(`${method} ${path} -> ${response.status}`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new GrafanaError(method, path, response.status, body);
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

  return {
    listing: (id) => json(`/dashboards/${id}`),
    screenshot: (id, imageId) =>
      bytes(`/dashboards/${id}/images/${imageId}/image`),
    logo: (id) => bytes(`/dashboards/${id}/logos/large`),
    categories: async () =>
      (await json("/categories")).items.map((category) => category.slug),
  };
}
