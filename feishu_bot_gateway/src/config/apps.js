import { httpError } from "../lib/errors.js";

export function getApps(env) {
  if (!env.FEISHU_APPS_JSON) {
    throw httpError(500, "FEISHU_APPS_JSON is not configured");
  }
  let parsed;
  try {
    parsed = JSON.parse(env.FEISHU_APPS_JSON);
  } catch {
    throw httpError(500, "FEISHU_APPS_JSON is invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw httpError(500, "FEISHU_APPS_JSON must be an object");
  }

  const apps = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const appId = value.appId || key;
    const appSecret = value.appSecret;
    if (typeof appId === "string" && appId !== "" && typeof appSecret === "string" && appSecret !== "") {
      apps[appId] = {
        appId,
        appSecret,
        defaultIdType: value.defaultIdType || value.defaultReceiveIdType || "",
        defaultReceiveId: value.defaultReceiveId || "",
      };
    }
  }
  return apps;
}

export function getAppConfig(appId, env) {
  const app = getApps(env)[appId];
  if (!app) {
    throw httpError(400, `unsupported appId: ${appId}`);
  }
  return app;
}

export function getDefaultReceiveIdType(appId, env) {
  const app = getAppConfig(appId, env);
  return app.defaultIdType || "";
}

export function getDefaultReceiveId(appId, env) {
  const app = getAppConfig(appId, env);
  return app.defaultReceiveId || "";
}
