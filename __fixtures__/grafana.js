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

// Routes are keyed by path for a GET and by "POST path" for a write; a function is called for each request
export const fakeFetch = (routes) =>
  jest.fn(async (url, { method = "GET" } = {}) => {
    const path = url.replace("https://grafana.com/api", "");
    const route = routes[method === "GET" ? path : `${method} ${path}`];
    const body = typeof route === "function" ? route() : route;
    if (body === undefined) return notFound();
    return Buffer.isBuffer(body) ? new Response(body) : Response.json(body);
  });

const items = (value, key) => ({
  items: value ? value.split(",").map((item) => ({ [key]: item })) : [],
});

// A client that behaves as grafana.com was measured to (rfcs/0002-grafana-api.md)
export function fakeClient(answer = listing(), media = {}) {
  const state = { ...answer };
  const images = new Map(media.screenshots ?? []);
  let logo = media.logo;
  let nextImage = 30000;

  return {
    listing: jest.fn(async () => ({
      ...state,
      screenshots: [...images.keys()].map((id) => ({ id })),
      json: { ...state.json, gnetId: state.id, description: state.description },
    })),
    screenshot: jest.fn(async (id, imageId) => images.get(imageId)),
    logo: jest.fn(async () => logo),
    categories: jest.fn(async () => ["aws", "docker", "hostmetrics"]),
    publishRevision: jest.fn(async (id, [[, file]]) => {
      state.revision += 1;
      state.json = file.dashboard;
      state.description = file.dashboard.description ?? "";
      return { revision: state.revision };
    }),
    updateListing: jest.fn(async (id, fields) => {
      for (const [name, value] of fields) {
        if (name === "screenshots") images.set(nextImage++, value.bytes);
        else if (name === "screenshotsToRemove") {
          for (const imageId of value.split(","))
            images.delete(Number(imageId));
        } else if (name === "logo") {
          logo = value.bytes;
          state.hasLogo = true;
        } else if (name === "categories") {
          state.categories = items(value, "categorySlug");
        } else if (name === "collectorPlugins") {
          state.collectorPlugins = items(value, "name");
        } else state[name] = value;
      }
      return {};
    }),
  };
}
