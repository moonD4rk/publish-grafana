# publish-grafana

A GitHub Action that keeps a dashboard on [grafana.com](https://grafana.com/grafana/dashboards/) in step with the files in your repository: the dashboard JSON, the listing's name, description and README, its screenshots and logo, and its categories and collector details.

> **Status:** design stage — nothing to use yet. This README describes the goal for v1.0, and the design lives in [`rfcs/`](rfcs/README.md).

## What it does

- Publishes the dashboard JSON as a new revision, and only when it differs from the latest one.
- Updates the listing's name, short description and README from your repository.
- Uploads the screenshots and the logo.
- Sets the categories and the collector details.
- Touches only what you pass: a part you leave out stays as it is on grafana.com.
- Changes nothing without a token: the run then reports what it would publish, so pull requests from forks can run it too.
- Checks that the dashboard can be shared: the classic JSON model, declared inputs, no hard-coded data source.

## Usage

```yaml
- uses: actions/checkout@v7
- uses: moond4rk/publish-grafana@v1
  with:
    token: ${{ secrets.GRAFANA_COM_TOKEN }}
    dashboard-id: 12345
    dashboard-file: grafana/dashboard.json
    readme-file: grafana/README.md
    screenshots: |
      docs/images/overview.png
      docs/images/details.png
```

The dashboard must already exist on grafana.com: upload it once on the website, which assigns its ID.

## Inputs

| Input | Description |
| --- | --- |
| `dashboard-id` | **Required.** The dashboard's ID on grafana.com |
| `token` | A Grafana Cloud access policy token with the `dashboards:write` scope. Without it the run is a dry run |
| `dashboard-file` | The dashboard JSON, published as a new revision when it differs from the latest one |
| `name` | The listing's name |
| `description` | The listing's short description |
| `readme-file` | A Markdown file for the listing's README |
| `screenshots` | Image files or globs, one per line, in the order to show them |
| `logo` | A PNG or JPEG file for the listing's logo, uploaded when it differs from the listing's. An SVG is uploaded only when the listing has none |
| `categories` | Category slugs, one per line, such as `docker` or `hostmetrics` |
| `collector-type` | The collector that feeds the dashboard: `collectd`, `nodeExporter`, `Snap`, `Telegraf`, `Beats`, `Icinga` or `Other` |
| `collector-plugins` | The collector's plugins, one per line |
| `collector-config` | A text on how to set the collector up |
| `dry-run` | `true` reports what would change and publishes nothing, even with a token. Default `false` |

## Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when the run published something, or would have in a dry run |
| `changes` | What changed, comma-separated: `revision`, `name`, `description`, `readme`, `screenshots`, `logo`, `categories`, `collector-type`, `collector-plugins`, `collector-config` |
| `revision` | The latest revision number after the run |
| `url` | The dashboard's page on grafana.com |

## Several dashboards

One step publishes one dashboard. For several, use a matrix:

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        dashboard:
          - { id: 12345, file: dashboards/overview.json }
          - { id: 12346, file: dashboards/details.json }
    steps:
      - uses: actions/checkout@v7
      - uses: moond4rk/publish-grafana@v1
        with:
          token: ${{ secrets.GRAFANA_COM_TOKEN }}
          dashboard-id: ${{ matrix.dashboard.id }}
          dashboard-file: ${{ matrix.dashboard.file }}
```

## The token

In the Grafana Cloud portal, create an access policy with the scope `dashboards:write`, add a token to it, and save the token as a repository secret such as `GRAFANA_COM_TOKEN`. The policy belongs to the organization that owns the dashboard, and that organization must be public on grafana.com.

## What it does not do

- Create or delete a dashboard.
- Empty the categories or the collector details: an input you leave empty is a part the action does not touch.
- Deploy dashboards to a Grafana instance: this action publishes to the grafana.com catalog only.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[Apache-2.0](LICENSE)

## Disclaimer

This project is not affiliated with, endorsed by or sponsored by Grafana Labs or its affiliates. Grafana is a trademark of Grafana Labs.
