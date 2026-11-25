# RFC 0001: Design

## Problem

A dashboard shared on grafana.com lives in two places: the repository, where it changes with every release, and its page on grafana.com (the listing), which someone updates by hand. The listing falls behind, and whoever imports the dashboard by its ID gets an old one. No Marketplace action fixes this, and the scripts other projects carry upload the JSON only, so the README and the screenshots still go stale.

## What the action does

One step makes one listing match the repository:

1. Check the inputs before anything is sent. The run fails on a missing token unless it is a dry run, a missing file, an unknown category or collector type, an image of a type grafana.com does not take or over 1 MiB, or a dashboard file that is not a classic dashboard JSON. A dashboard that refers to a data source by a fixed UID gets a warning, since another Grafana cannot import it.
2. Read the listing from grafana.com. One that is still pending, and so not shown there, gets a warning.
3. Compare it with each part passed as an input.
4. Publish only the parts that differ: the dashboard as a new revision, then everything else in one listing update.
5. Read the listing back, and warn when grafana.com holds something else than what was sent, since the next run would then publish it again. A difference is read again first, since grafana.com can serve the old listing for a moment after an update.
6. Report what changed and how each part differed, in the outputs and the job summary. A run that fails halfway still reports what it published.

| Part | Inputs | Compared |
| --- | --- | --- |
| Dashboard JSON | `dashboard-file` | As JSON values, without the two fields grafana.com rewrites |
| Name, description, README | `name`, `description`, `readme-file` | As text |
| Screenshots | `screenshots` | Byte for byte, in order |
| Logo | `logo` | Byte for byte |
| Categories | `categories` | As a set |
| Collector details | `collector-type`, `collector-plugins`, `collector-config` | As text, the plugins as a set |

## Principles

1. **The repository is the source.** After a run, each managed part equals what the repository holds.
2. **Idempotent.** A part that already matches is not published, so the action is safe on every push and the revision number moves only when the JSON changed.
3. **Opt-in by part.** An input that is not passed is a part that is never touched. The description is the one exception: grafana.com serves the listing's description inside the dashboard, so without `description` the dashboard file's own is published, and a file without one leaves the listing's as it is.
4. **Nothing is published by accident, and nothing is skipped in silence.** In a pull request or a merge queue the run is a dry run unless `dry-run: false` asks for more: a pull request from the repository itself can read the secret, and would otherwise publish a branch before it is merged. A dry run only reads and reports what it would publish, and needs no token, so pull requests from forks can run it. Any other run fails on a missing token, so a secret with a mistyped name is found on the first run rather than passing for a publish.
5. **An error names its cause.** A failure says which input is wrong and what to do about it, also when grafana.com refuses the token or finds no such dashboard.
6. **A write is sent once.** When its outcome is unknown, the action reads the listing again and decides from what it finds. Only reads are retried.
7. **The token goes to grafana.com only.** It is masked, and it never reaches the log, the summary or an output.

## Out of scope

- Creating or deleting a dashboard: the first upload is done once on the website, which assigns the ID.
- Emptying the categories or the collector details.
- Several dashboards in one step: a workflow uses a matrix.
- Deploying a dashboard to a Grafana instance.

## How it is built

- JavaScript, as ES modules, on the runner's `node24`. Rollup bundles it into `dist/`, which is committed, and CI rejects a stale bundle.
- The runtime dependencies are the `@actions/*` toolkit only. HTTP, multipart bodies and hashing come from Node.
- Deciding is kept apart from doing: the plan is a pure function of the inputs and the listing, tested as a table, and one module owns every request to grafana.com.
- Unit tests never touch the network. Whatever needs a real listing uses the demo listing in `demo/`, dashboard 26104, and never a project's own.
- A workflow publishes the demo listing on every push to `main` and once a week, with a token that has the `dashboards:write` scope alone, and fails when a second run publishes again. So a change in grafana.com's API shows within a week.
- A workflow declares the least permissions it needs and pins an outside action by its commit SHA.
- A release is a tag `vX.Y.Z` on `main`, and the tag `v1` moves to the newest one. The inputs and the outputs are the public interface, so breaking one needs a new major version.

## Open questions

- A changed SVG logo cannot be detected, since grafana.com rewrites an SVG. For now an SVG is uploaded only when the listing has no logo.

What the design relies on about grafana.com is in [RFC 0002](0002-grafana-api.md).
