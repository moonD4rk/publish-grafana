# RFC 0002: The grafana.com dashboard API

grafana.com does not document its dashboard API. This RFC holds what the design in [RFC 0001](0001-design.md) relies on, measured from 2026-11-23 to 2026-11-25 on the demo listing, dashboard 26104, with `demo/probe.sh` and with the action itself.

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
- A revision upload overwrites the listing's description with the file's top-level `description`, or empties it. So the action takes the file's description for the listing's, and when the file has none it sends the listing's again afterwards.
- A dashboard in the resource model (`apiVersion`, `kind`, `spec`) is accepted, but stored with an empty description. So the action refuses it itself.
- `GET /dashboards/<id>/revisions/<n>/download` counts as a download. Reading the listing does not, so the action takes the latest dashboard from the listing.

### Listing update

- It is partial: a part that is left out stays as it is. A request that changes nothing answers `409 InvalidArgument`, "Nothing to update".
- Its answer can still show the old `screenshots` and `hasLogo`. A read right after shows the new state.
- Screenshots are listed in upload order and cannot be reordered, and the same file uploaded twice makes two images. So a new order means removing images and uploading them again.
- A screenshot over 1 MiB answers `413 PayloadTooLarge`.
- A PNG or JPEG logo is served byte for byte, so it can be compared. An SVG is rewritten and cannot.
- A text is stored as sent, and an empty `description` or `readme` clears it. Node, like a browser, sends a multipart text with CRLF line breaks, so the action compares texts without regard to the kind of line break.
- `categories` replaces the set, an empty value clears it, and an unknown slug answers `404 NotFound`.
- `collectorPlugins` replaces the list, but an empty value leaves it as it is. `collectorType` and `collectorConfig` store any text unchecked.
- `inputs`, which the website's edit form sends, rewrites the labels of `__inputs` inside the latest revision, without adding one. The action does not send it, so after such an edit the next run publishes the file again.
- A listing created with a token is pending, and so hidden, until an update carries `publish=true`. Its public page then appears with a delay: it still answered `404` nineteen minutes later, and was there the next day.
- The public page shows the screenshots in upload order, the first one large, and lists each revision with the uploaded file's own `description`.

### Errors and limits

- An error is JSON with `code`, `message` and `requestId`.
- A token that grafana.com does not know answers `401 InvalidCredentials`, on a read as on a write. So a mistyped token fails the run before anything is sent.
- A token with the `dashboards:write` scope alone reads the listing, publishes a revision, updates the listing's texts, removes a screenshot, uploads one and replaces the logo. So the action asks for no other scope.
- No answer carries a rate-limit header, and 51 writes in 30 minutes were all accepted.
- No read is answered with a redirect, so the action refuses one rather than follow it with the token.

## Not verified

The rate limits, the size limit of a logo, and the answer to a token that lacks the scope or belongs to another organization.
