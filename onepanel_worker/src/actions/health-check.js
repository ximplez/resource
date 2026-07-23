import { ACTION_HEALTH_CHECK } from "../constants.js";
import { resolveHealthCheckTargets, resolveOnePanelConfig } from "../config/onepanel.js";
import { httpError } from "../lib/errors.js";
import { normalizeState } from "../lib/object.js";
import { OnePanelClient } from "../onepanel/client.js";

export async function runHealthCheck(payload, env, options = {}) {
  const onepanel = resolveOnePanelConfig(payload, ACTION_HEALTH_CHECK, env);
  const client = new OnePanelClient(onepanel);
  const targets = resolveHealthCheckTargets(payload, env);

  if (targets.length === 0) {
    if (options.allowMissingContainerName) {
      return {
        healthy: false,
        skipped: true,
        reason: "healthCheck containers are not configured",
      };
    }
    throw httpError(400, "healthCheck containers are required");
  }

  try {
    await client.healthCheck();
  } catch (error) {
    const message = `1Panel health check failed. baseURL=${onepanel.baseURL} err=${error.message}`;
    return {
      healthy: false,
      stage: "onepanel",
      containerName: targets[0] || "",
      containers: [],
      total: targets.length,
      message,
    };
  }

  const results = [];
  for (const containerName of targets) {
    try {
      const container = await client.findContainerByName(containerName);
      if (!container) {
        results.push({
          healthy: false,
          stage: "container",
          containerName,
          message: `container not found: ${containerName}`,
        });
        continue;
      }
      if (normalizeState(container.state) !== "running") {
        results.push({
          healthy: false,
          stage: "container",
          containerName: container.name,
          message: `container is not running. name=${container.name} state=${container.state} image=${container.imageName || ""}`,
          container,
        });
        continue;
      }
      results.push({
        healthy: true,
        stage: "container",
        containerName: container.name,
        container,
      });
    } catch (error) {
      results.push({
        healthy: false,
        stage: "container",
        containerName,
        message: `Container health check failed. container=${containerName} err=${error.message}`,
      });
    }
  }

  if (targets.length === 1) {
    return results[0];
  }

  const unhealthyResults = results.filter((item) => item.healthy === false);
  if (unhealthyResults.length > 0) {
    const failedNames = unhealthyResults.map((item) => item.containerName).filter(Boolean);
    return {
      healthy: false,
      stage: "container",
      containerName: failedNames[0] || targets[0] || "",
      containers: results,
      total: results.length,
      healthyCount: results.length - unhealthyResults.length,
      unhealthyCount: unhealthyResults.length,
      message: `health check failed for containers: ${failedNames.join(", ")}`,
    };
  }

  return {
    healthy: true,
    stage: "container",
    containerName: results[0] && results[0].containerName ? results[0].containerName : "",
    containers: results,
    total: results.length,
    healthyCount: results.length,
  };
}
