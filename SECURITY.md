# Security policy

## Supported versions

Security fixes go into the latest release of the current major version.

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/moond4rk/publish-grafana/security/advisories/new), not in a public issue. Say what you found, how to reproduce it and what it lets someone do.

## What the action does with your token

The action sends the token to `https://grafana.com` only, in the `Authorization` header, and never writes it to the log, the job summary or an output. A Grafana Cloud access policy token with the `dashboards:write` scope is all it needs.
