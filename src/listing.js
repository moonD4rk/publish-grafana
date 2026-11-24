import * as core from "@actions/core";

function parse(listing, id) {
  try {
    return {
      revision: listing.revision,
      status: listing.statusCode,
      url: `https://grafana.com/grafana/dashboards/${id}-${listing.slug}/`,
      dashboard: listing.json,
      name: listing.name,
      description: listing.description,
      readme: listing.readme,
      images: listing.screenshots
        .map((image) => image.id)
        .sort((a, b) => a - b),
      hasLogo: listing.hasLogo,
      categories: listing.categories.items.map((item) => item.categorySlug),
      collectorType: listing.collectorType,
      collectorPlugins: listing.collectorPlugins.items.map((item) => item.name),
      collectorConfig: listing.collectorConfig,
    };
  } catch (error) {
    throw new Error(
      `grafana.com's answer for dashboard ${id} is not what the action expects, so its API may have changed: ${error.message}`,
      { cause: error },
    );
  }
}

async function fetchListing(client, id) {
  try {
    return await client.listing(id);
  } catch (error) {
    if (error.status !== 404) throw error;
    throw new Error(
      `dashboard-id: grafana.com finds no dashboard ${id}. Use the number in the dashboard's URL, grafana.com/grafana/dashboards/<number>-…`,
      { cause: error },
    );
  }
}

export async function readListing(client, id, wanted) {
  const { images, ...current } = parse(await fetchListing(client, id), id);
  if (wanted.screenshots) {
    current.screenshots = await Promise.all(
      images.map(async (imageId) => ({
        id: imageId,
        bytes: await client.screenshot(id, imageId),
      })),
    );
  }
  if (wanted.logo && current.hasLogo) {
    if (wanted.logo.svg) {
      core.info(
        "logo: grafana.com rewrites an SVG, so it cannot be compared and the listing's logo stays as it is",
      );
    } else {
      current.logo = await client.logo(id);
    }
  }
  return current;
}

export async function checkCategories(client, wanted) {
  const known = await client.categories();
  const unknown = wanted.filter((slug) => !known.includes(slug));
  if (unknown.length > 0) {
    throw new Error(
      `categories: grafana.com has no ${unknown.join(", ")}; it has ${known.join(", ")}`,
    );
  }
}
