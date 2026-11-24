# RFC 0002: The grafana.com dashboard API

grafana.com does not document its dashboard API. This RFC holds what the design in [RFC 0001](0001-design.md) relies on, measured on 2026-11-23 on the demo listing, dashboard 26104, with `demo/probe.sh`.

Paths are under `https://grafana.com/api`. A write needs `Authorization: Bearer <token>`, from an access policy with the `dashboards:write` scope. A read needs nothing.

## Requests

| Request | Does |
| --- | --- |
| `GET /dashboards/<id>` | Returns the listing: its texts, categories, collector details, `revision`, `statusCode`, `hasLogo`, `screenshots`, which lists the images without checksums, and `json`, the dashboard of the latest revision |
| `GET /dashboards/<id>/images/<imageId>/image` | Serves a screenshot byte for byte |
| `GET /dashboards/<id>/logos/large` | Serves the logo |
| `GET /categories` | Lists the valid category slugs |
| `POST /dashboards/<id>/revisions` | Adds a revision from the multipart part `json`. The answer carries its number as `revision` |
| `POST /dashboards/<id>` | Updates the listing from the multipart parts it carries: `name`, `description`, `readme`, `logo`, `screenshots` (once per image), `screenshotsToRemove` (image IDs, comma-separated), `categories`, `collectorType`, `collectorPlugins`, `collectorConfig`, `inputs`, `publish` |

`POST /dashboards` creates a listing and `DELETE /dashboards/<id>` deletes one. The action uses neither.

## Behavior

### Revisions

- The served dashboard equals the uploaded file but for two top-level fields: `gnetId` becomes the dashboard's ID, and `description` the listing's description. So the action compares without them.
- An identical file is not refused: it becomes a duplicate revision. So the action compares before it uploads.
- A revision upload overwrites the listing's description with the file's top-level `description`, or empties it. So the action sends the description again afterwards.
- A dashboard in the resource model (`apiVersion`, `kind`, `spec`) is accepted, but stored with an empty description. So the action refuses it itself.
- `GET /dashboards/<id>/revisions/<n>/download` counts as a download. Reading the listing does not, so the action takes the latest dashboard from the listing.

### Listing update

- It is partial: a part that is left out stays as it is. A request that changes nothing answers `409 InvalidArgument`, "Nothing to update".
- Its answer can still show the old `screenshots` and `hasLogo`. A read right after shows the new state.
- Screenshots are listed in upload order and cannot be reordered, and the same file uploaded twice makes two images. So a new order means removing images and uploading them again.
- A screenshot over 1 MiB answers `413 PayloadTooLarge`.
- A PNG or JPEG logo is served byte for byte, so it can be compared. An SVG is rewritten and cannot.
- `categories` replaces the set, an empty value clears it, and an unknown slug answers `404 NotFound`.
- `collectorPlugins` replaces the list, but an empty value leaves it as it is. `collectorType` and `collectorConfig` store any text unchecked.
- `inputs`, which the website's edit form sends, rewrites the labels of `__inputs` inside the latest revision, without adding one. The action does not send it, so after such an edit the next run publishes the file again.
- A listing created with a token is pending, and so hidden, until an update carries `publish=true`.

### Errors and limits

- An error is JSON with `code`, `message` and `requestId`.
- No answer carries a rate-limit header, and 51 writes in 30 minutes were all accepted.
- No read is answered with a redirect, so the action refuses one rather than follow it with the token.

## Not verified

The rate limits, the size limit of a logo, whether the public page shows the screenshots in upload order, and how long a newly published listing takes to appear on its public page.
