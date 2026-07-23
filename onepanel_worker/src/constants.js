export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export const ACTION_UPGRADE_CONTAINER = "upgrade-container";
export const ACTION_CREATE_CONTAINER = "create-container";
export const ACTION_HEALTH_CHECK = "health-check";

export const ACTION_DEFAULT_KEY = {
  [ACTION_UPGRADE_CONTAINER]: "upgradeContainer",
  [ACTION_CREATE_CONTAINER]: "createContainer",
  [ACTION_HEALTH_CHECK]: "healthCheck",
};
