import { jest } from "@jest/globals";

export const dashboard = {
  __inputs: [{ name: "DS_TESTDATA", type: "datasource" }],
  id: null,
  title: "publish-grafana demo",
  description: "The description inside the file",
  panels: [{ id: 1, datasource: { uid: "${DS_TESTDATA}" } }],
};

// The fields of a real answer to GET /api/dashboards/26104 that the action reads
export const listing = (overrides = {}) => ({
  id: 26104,
  statusCode: "active",
  slug: "publish-grafana-demo",
  revision: 9,
  name: "publish-grafana demo",
  description: "Sample service dashboard",
  readme: "# publish-grafana demo\n",
  collectorType: "",
  collectorConfig: null,
  screenshots: [
    { id: 22446, filename: "overview.png" },
    { id: 22448, filename: "requests.png" },
  ],
  categories: { items: [{ id: 945, categorySlug: "hostmetrics" }] },
  collectorPlugins: { items: [{ id: 3020, name: "Other" }] },
  hasLogo: true,
  json: {
    ...dashboard,
    gnetId: 26104,
    description: "Sample service dashboard",
  },
  ...overrides,
});

export const notFound = () =>
  Response.json(
    { code: "NotFound", message: "Dashboard not found", requestId: "req-1" },
    { status: 404 },
  );

export const fakeFetch = (routes) =>
  jest.fn(async (url) => {
    const body = routes[url.replace("https://grafana.com/api", "")];
    if (body === undefined) return notFound();
    return Buffer.isBuffer(body) ? new Response(body) : Response.json(body);
  });
