# publish-grafana

A GitHub Action that publishes your Grafana dashboard to [grafana.com](https://grafana.com/grafana/dashboards/) and keeps its page there up to date: the JSON, the README, the screenshots, the logo and more.

> **Status:** in development — nothing is released yet. This README describes v1.

## Usage

```yaml
on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: moond4rk/publish-grafana@v1
        with:
          token: ${{ secrets.GRAFANA_COM_TOKEN }}
          dashboard-id: 12345
          dashboard-file: grafana/dashboard.json
          readme-file: grafana/README.md
          screenshots: grafana/screenshots/*.png
```

Before the first run:

1. Upload the dashboard once on grafana.com, at `grafana.com/orgs/<your-org>/dashboards`. Its ID is the number in its URL: `grafana.com/grafana/dashboards/12345-…`.
2. In the Grafana Cloud portal, create an access policy with the `dashboards:write` scope, add a token to it, and save the token as the repository secret `GRAFANA_COM_TOKEN`.

Besides `dashboard-id`, each input is one part of the page. Pass the parts you want kept up to date; the rest stay as they are on grafana.com.

## Inputs

| Input | Description |
| --- | --- |
| `dashboard-id` | **Required.** The dashboard's ID on grafana.com |
| `token` | A Grafana Cloud access policy token with the `dashboards:write` scope. Without it the run is a dry run |
| `dashboard-file` | The dashboard JSON, published as a new revision when it changed |
| `name` | The name on the dashboard's page |
| `description` | The short description on the dashboard's page |
| `readme-file` | A Markdown file for the page's README |
| `screenshots` | Image files or globs, one per line, in the order to show them |
| `logo` | A PNG or JPEG file for the logo |
| `categories` | Category slugs, one per line, such as `docker` |
| `collector-type` | The collector that feeds the dashboard: `collectd`, `nodeExporter`, `Snap`, `Telegraf`, `Beats`, `Icinga` or `Other` |
| `collector-plugins` | The collector's plugins, one per line |
| `collector-config` | A text on how to set the collector up |
| `dry-run` | `true` publishes nothing and reports what would change. Default `false` |

## Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when something was published, or would have been in a dry run |
| `changes` | What changed, comma-separated, such as `revision,readme,screenshots` |
| `revision` | The latest revision number after the run |
| `url` | The dashboard's page on grafana.com |

## Good to know

- **Safe on every push.** Only what changed is published, so an unchanged dashboard never gets a new revision.
- **No token, no changes.** Without `token` the run reports what it would publish and changes nothing, so pull requests from forks can run it.
- **One dashboard per step.** For several, repeat the step or use a matrix.
- **The catalog only.** It does not create a dashboard, and it does not deploy one to a Grafana instance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The design is in [`rfcs/`](rfcs/0001-design.md).

## License

[Apache-2.0](LICENSE). This project is not affiliated with, endorsed by or sponsored by Grafana Labs. Grafana is a trademark of Grafana Labs.
