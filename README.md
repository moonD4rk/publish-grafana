# publish-grafana

A GitHub Action that publishes your Grafana dashboard to [grafana.com](https://grafana.com/grafana/dashboards/) and keeps its page there up to date: the JSON, the README, the screenshots, the logo and more.

See it at work: this action publishes the [demo dashboard](https://grafana.com/grafana/dashboards/26104-publish-grafana-demo/) from [`demo/`](demo/).

## Usage

Save this as `.github/workflows/publish-grafana.yml`:

```yaml
on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency: publish-grafana # one publish at a time

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: moond4rk/publish-grafana@v1
        with:
          token: ${{ secrets.GRAFANA_COM_TOKEN }} # a Grafana Cloud token
          dashboard-id: 12345 # the number in the dashboard's URL
          dashboard-file: grafana/dashboard.json # exported from Grafana
          readme-file: grafana/README.md
          screenshots: grafana/screenshots/*.png
```

[Setup](#setup) says where the first three values come from. With them alone, the dashboard JSON is kept up to date, and the listing's Short Description follows the `description` inside it. Each further part you pass, here the README and the screenshots, is kept equal to the repository. A part you leave out stays as it is on grafana.com.

A run publishes only what differs, so it is safe on every push. Its job summary shows what it did:

| Part        | Outcome   | Details                                            |
| ----------- | --------- | -------------------------------------------------- |
| revision    | published | panels changed: Requests / s; panels added: Errors |
| readme      | published | +3 -1 lines                                        |
| screenshots | unchanged |                                                    |

## Setup

### Dashboard ID

The action updates a dashboard that is already on grafana.com, so upload it there once by hand: sign in, open **My dashboards** and select **Upload dashboard**. Its ID is the number in its URL: `26104` in `grafana.com/grafana/dashboards/26104-publish-grafana-demo`.

### Token

A Grafana Cloud access policy token. An admin of the organization that owns the dashboard creates it:

1. Sign in to the Grafana Cloud portal at grafana.com and select the organization. Then open **Security** and **Access policies**, and select **New access policy**.
2. Fill in the form:
   - **Display name**: any name, such as `publish-grafana`. **Name** follows it.
   - **Realms**: the organization (all stacks).
   - **Scopes**: none of those listed. Under **Add scope**, add `dashboards:write`, the only scope the action needs.
   - **Label selectors** and **IP ranges**: empty.
3. On the new policy, select **Add token** and give it any name. An expiration date is optional: once it passes, runs fail until the secret holds a new token.
4. Copy the token, which is shown only once. In the GitHub repository, open **Settings**, **Secrets and variables**, **Actions** and **New repository secret**, and save it as `GRAFANA_COM_TOKEN`.

Grafana's guide shows these steps with pictures: [Create access policies and tokens](https://grafana.com/docs/grafana-cloud/security-and-account-management/authentication-and-permissions/access-policies/create-access-policies/).

### Dashboard file

Export the dashboard from Grafana and commit the file. In the dashboard's toolbar, select **Export** and **Export as code**, choose the **Classic** model and switch on **Share dashboard with another instance**. grafana.com takes the Classic model only, and with the switch on, whoever imports the dashboard chooses their own data source. Grafana's guide is [Export a dashboard as code](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/#export-a-dashboard-as-code).

## Recipes

<details>
<summary>Preview in pull requests</summary>

Add `pull_request` to the triggers. In a pull request the step publishes nothing, and its job summary shows what merging would publish. It needs no token there, so it also works in a pull request from a fork, which cannot read the secret.

```yaml
on:
  pull_request:
  push:
    branches: [main]

concurrency: publish-grafana-${{ github.ref }}
```

With the ref in its concurrency group, a preview never takes the place of a publish that is waiting.

</details>

<details>
<summary>Publish when a release is published</summary>

```yaml
on:
  release:
    types: [published]
```

</details>

<details>
<summary>Several dashboards</summary>

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - id: 12345
            file: grafana/overview.json
          - id: 12346
            file: grafana/details.json
    steps:
      - uses: actions/checkout@v7
      - uses: moond4rk/publish-grafana@v1
        with:
          token: ${{ secrets.GRAFANA_COM_TOKEN }}
          dashboard-id: ${{ matrix.id }}
          dashboard-file: ${{ matrix.file }}
```

</details>

## Inputs

The names in bold are the fields of the dashboard's edit page, `grafana.com/orgs/<your-org>/dashboards/<id>/edit`.

| Input | Description |
| --- | --- |
| `dashboard-id` | **Required.** The dashboard's [ID](#dashboard-id) on grafana.com |
| `token` | The [token](#token) of an access policy with the `dashboards:write` scope. Required unless `dry-run` is `true` |
| `dashboard-file` | The [dashboard JSON](#dashboard-file), published as a new revision when it changed. Its `__inputs` are the page's **Data source config** |
| `name` | The **Dashboard Name** |
| `description` | The **Short Description**. Default: the `description` inside the dashboard file |
| `readme-file` | A Markdown file for the **README** |
| `screenshots` | The **Screenshots**: image files or globs, one per line, in the order to show them. PNG, JPEG, GIF or WebP, 1 MiB each at most |
| `logo` | A PNG or JPEG file for the **Logo** |
| `categories` | The **Categories**: slugs from [grafana.com/api/categories](https://grafana.com/api/categories), one per line, such as `docker` |
| `collector-type` | Under **Collector/Agent Details**, the collector that feeds the dashboard: `collectd`, `nodeExporter`, `Snap`, `Telegraf`, `Beats`, `Icinga` or `Other` |
| `collector-plugins` | The collector's plugins, one per line |
| `collector-config` | A text on how to set the collector up |
| `dry-run` | `true` publishes nothing and reports what would change, and needs no token. Default: `true` in a pull request or a merge queue, `false` otherwise |

## Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when something was published, or would have been in a dry run |
| `changes` | What changed, comma-separated, such as `revision,readme,screenshots` |
| `revision` | The latest revision number after the run |
| `url` | The dashboard's page on grafana.com |

## Good to know

- **Safe on every push.** Only what changed is published, so an unchanged dashboard never gets a new revision.
- **A pull request only previews.** There the run is a dry run unless you pass `dry-run: false`, so a branch is not published before it is merged.
- **A missing token fails the run.** So a secret with a mistyped name shows on the first run. Only a dry run needs no token.
- **The token goes to grafana.com only.** It is masked in the log, and the action has no other dependency at run time than GitHub's own toolkit.
- **One dashboard per step.** For several, repeat the step or use a matrix.
- **The catalog only.** It does not create a dashboard, and it does not deploy one to a Grafana instance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The design is in [`rfcs/`](rfcs/0001-design.md).

## License

[Apache-2.0](LICENSE). This project is not affiliated with, endorsed by or sponsored by Grafana Labs. Grafana is a trademark of Grafana Labs.
