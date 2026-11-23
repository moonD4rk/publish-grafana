import * as core from "@actions/core";

export async function run() {
  try {
    const dashboardId = core.getInput("dashboard-id", { required: true });
    core.warning(
      `publish-grafana is not implemented yet: dashboard ${dashboardId} was neither read nor published`,
    );
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
