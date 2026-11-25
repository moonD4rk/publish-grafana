# publish-grafana demo

A sample service dashboard on Grafana's built-in TestData data source: it shows data with no exporter and nothing to set up. The publish-grafana GitHub Action publishes this listing from its own repository and runs its tests against it.

## Requirements

- Grafana with the TestData data source added: **Connections → Add new connection → TestData**. Tested with Grafana 13.2.

## Import

Import the dashboard by its ID and choose the TestData data source when Grafana asks for it.

## Panels

- Requests per second, error rate, p95 latency and services up
- Requests by service and latency over time
- Queue depth per service
- The services with their version, status and replicas

Each panel says what it shows in its description, behind the info icon next to its title.
