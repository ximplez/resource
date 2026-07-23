import { ACTION_DEFAULT_KEY, ACTION_HEALTH_CHECK } from "../constants.js";
import { httpError } from "../lib/errors.js";
import {
  asObject,
  compactObject,
  firstNonEmpty,
  mergeConfig,
  normalizeStringMap,
  parseMaybeJsonObject,
  pickDefined,
  toBooleanOrUndefined,
  toNumberOrUndefined,
  trimString,
} from "../lib/object.js";
import { normalizeDockerRegistryConfig } from "../onepanel/registry.js";

export function getActionDefaults(action, env) {
  const rawDefaults = parseMaybeJsonObject(
    pickDefined(getDefaultsModule(env), env.WORKER_DEFAULTS_JSON, {}),
    "WORKER_DEFAULTS_JSON",
    true,
  );
  const common = asObject(rawDefaults.common);
  const specific = asObject(rawDefaults[ACTION_DEFAULT_KEY[action]]);
  return mergeConfig(common, specific);
}

export function resolveOnePanelConfig(payload, action, env) {
  const defaults = getActionDefaults(action, env);
  const onepanelOverride = asObject(payload.onepanel);
  const defaultOnepanel = asObject(defaults.onepanel);
  const envOnepanel = getOnePanelModule(env);
  const apiPrefix = firstNonEmpty(
    onepanelOverride.apiPrefix,
    defaultOnepanel.apiPrefix,
    envOnepanel.apiPrefix,
    env.ONEPANEL_API_PREFIX,
    "/api/v1",
  );
  const baseUrl = firstNonEmpty(
    onepanelOverride.baseUrl,
    defaultOnepanel.baseUrl,
    envOnepanel.baseUrl,
    env.ONEPANEL_BASE_URL,
  );
  const apiKey = firstNonEmpty(
    onepanelOverride.apiKey,
    defaultOnepanel.apiKey,
    envOnepanel.apiKey,
    env.ONEPANEL_API_KEY,
  );

  if (!baseUrl) {
    throw httpError(500, "ONEPANEL_BASE_URL is not configured");
  }
  if (!apiKey) {
    throw httpError(500, "ONEPANEL_API_KEY is not configured");
  }

  return {
    apiPrefix,
    apiKey,
    baseURL: normalizeBaseURL(baseUrl, apiPrefix),
    consoleURL: normalizeConsoleURL(baseUrl, apiPrefix),
  };
}

export function resolveNotificationConfig(payload, action, env) {
  const override = asObject(payload.notification);
  const overrideCard = asObject(override.card);
  const envNotification = getNotificationModule(env);
  const envNotificationCard = asObject(envNotification.card);

  const gatewayBaseUrl = firstNonEmpty(
    override.gatewayBaseUrl,
    envNotification.gatewayBaseUrl,
    env.FEISHU_BOT_GATEWAY_BASE_URL,
  );
  const gatewayAuthToken = firstNonEmpty(
    override.gatewayAuthToken,
    envNotification.gatewayAuthToken,
    env.FEISHU_BOT_GATEWAY_AUTH_TOKEN,
  );
  const appId = firstNonEmpty(
    override.appId,
    envNotification.appId,
    env.FEISHU_BOT_APP_ID,
  );
  const templateId = firstNonEmpty(
    override.templateId,
    envNotification.templateId,
    env.FEISHU_BOT_TEMPLATE_ID,
  );
  const templateVersionName = firstNonEmpty(
    override.templateVersionName,
    envNotification.templateVersionName,
    env.FEISHU_BOT_TEMPLATE_VERSION_NAME,
  );
  const receiveIdType = firstNonEmpty(
    override.receiveIdType,
    envNotification.receiveIdType,
    env.FEISHU_BOT_RECEIVE_ID_TYPE,
  );
  const receiveId = firstNonEmpty(
    override.receiveId,
    envNotification.receiveId,
    env.FEISHU_BOT_RECEIVE_ID,
  );
  const appName = firstNonEmpty(
    override.appName,
    envNotification.appName,
    env.FEISHU_BOT_NOTIFY_APP_NAME,
    "1PanelWorker",
  );
  const enabledValue = pickDefined(
    override.enabled,
    envNotification.enabled,
    env.FEISHU_BOT_NOTIFY_ENABLED,
    undefined,
  );
  const mainButtonDisabled = toBooleanOrUndefined(pickDefined(
    overrideCard.mainButtonDisabled,
    envNotificationCard.mainButtonDisabled,
    true,
  ));
  const subButtonDisabled = toBooleanOrUndefined(pickDefined(
    overrideCard.subButtonDisabled,
    envNotificationCard.subButtonDisabled,
    false,
  ));

  return {
    enabled: enabledValue === undefined ? Boolean(gatewayBaseUrl && gatewayAuthToken && appId && templateId) : toBooleanOrUndefined(enabledValue) === true,
    gatewayBaseUrl,
    gatewayAuthToken,
    appId,
    templateId,
    templateVersionName,
    receiveIdType,
    receiveId,
    appName,
    card: {
      mainButtonText: firstNonEmpty(
        overrideCard.mainButtonText,
        envNotificationCard.mainButtonText,
      ),
      mainButtonDisabled: mainButtonDisabled === undefined ? true : mainButtonDisabled,
      mainButtonEvent: firstMainButtonEvent(
        overrideCard.mainButtonEvent,
        envNotificationCard.mainButtonEvent,
      ),
      subButtonText: firstNonEmpty(
        overrideCard.subButtonText,
        envNotificationCard.subButtonText,
        "打开 1Panel",
      ),
      subButtonDisabled: subButtonDisabled === undefined ? false : subButtonDisabled,
      subButtonUrl: firstNonEmpty(
        overrideCard.subButtonUrl,
        envNotificationCard.subButtonUrl,
      ),
      openId: firstNonEmpty(
        overrideCard.openId,
        envNotificationCard.openId,
        override.openId,
        envNotification.openId,
        env.FEISHU_BOT_OPEN_ID,
        receiveIdType === "open_id" ? receiveId : "",
      ),
      successFoot: firstNonEmpty(
        overrideCard.successFoot,
        envNotificationCard.successFoot,
      ),
      failureFoot: firstNonEmpty(
        overrideCard.failureFoot,
        envNotificationCard.failureFoot,
      ),
    },
  };
}

export function resolveDockerRegistryConfig(payload, defaults, env) {
  const raw = pickDefined(
    payload.dockerRegistryConfig,
    defaults.dockerRegistryConfig,
    getDockerRegistryModule(env),
    env.DOCKER_REGISTRY_JSON,
    null,
  );
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  return normalizeDockerRegistryConfig(parseMaybeJsonObject(raw, "DOCKER_REGISTRY_JSON"));
}

export function resolveContainerConfig(payload, action, env) {
  const defaults = getActionDefaults(action, env);
  const raw = pickDefined(
    payload.containerConfig,
    payload.dockerConfig,
    defaults.containerConfig,
    defaults.dockerConfig,
    extractDirectContainerConfig(payload),
    null,
  );
  if (!raw) {
    throw httpError(400, "containerConfig is required");
  }
  const config = normalizeContainerCreateConfig(raw);
  const name = firstNonEmpty(
    config.name,
    payload.containerName,
    payload.name,
    defaults.containerName,
    getOnePanelModule(env).defaultContainerName,
    env.DEFAULT_CONTAINER_NAME,
  );
  if (name && !config.name) {
    config.name = name;
  }
  const image = firstNonEmpty(
    config.image,
    payload.image,
    defaults.image,
  );
  if (image && !config.image) {
    config.image = image;
  }
  const forcePull = pickDefined(
    config.forcePull,
    payload.forcePull,
    defaults.forcePull,
    false,
  );
  config.forcePull = Boolean(forcePull);
  return config;
}

export function resolveHealthCheckTargets(payload, env) {
  const defaults = getActionDefaults(ACTION_HEALTH_CHECK, env);
  const explicitTargets = normalizeHealthCheckTargets(
    pickDefined(
      payload.containers,
      payload.containerNames,
      payload.healthCheckContainers,
      undefined,
    ),
  );
  if (explicitTargets.length > 0) {
    return explicitTargets;
  }

  const explicitSingleTarget = firstNonEmpty(
    payload.containerName,
    payload.name,
  );
  if (explicitSingleTarget) {
    return [explicitSingleTarget];
  }

  const defaultTargets = normalizeHealthCheckTargets(
    pickDefined(
      defaults.containers,
      defaults.containerNames,
      defaults.healthCheckContainers,
      undefined,
    ),
  );
  if (defaultTargets.length > 0) {
    return defaultTargets;
  }

  const fallbackName = firstNonEmpty(
    payload.containerName,
    payload.name,
    defaults.containerName,
    getOnePanelModule(env).defaultContainerName,
    env.DEFAULT_CONTAINER_NAME,
  );
  return fallbackName ? [fallbackName] : [];
}

function getOnePanelModule(env) {
  return parseOptionalModule(env.onepanel, env.ONEPANEL_CONFIG_JSON, "ONEPANEL_CONFIG_JSON");
}

function getNotificationModule(env) {
  return parseOptionalModule(env.notification, env.NOTIFICATION_CONFIG_JSON, "NOTIFICATION_CONFIG_JSON");
}

function getDockerRegistryModule(env) {
  return parseOptionalModule(env.dockerRegistry, env.DOCKER_REGISTRY_CONFIG_JSON, "DOCKER_REGISTRY_CONFIG_JSON");
}

function getDefaultsModule(env) {
  return parseOptionalModule(env.defaults, env.DEFAULTS_CONFIG_JSON, "DEFAULTS_CONFIG_JSON");
}

function parseOptionalModule(objectValue, jsonValue, field) {
  if (objectValue && typeof objectValue === "object" && !Array.isArray(objectValue)) {
    return objectValue;
  }
  if (jsonValue === undefined || jsonValue === null || jsonValue === "") {
    return {};
  }
  return parseMaybeJsonObject(jsonValue, field, true);
}

function firstMainButtonEvent(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function extractDirectContainerConfig(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const copy = { ...payload };
  delete copy.action;
  delete copy.onepanel;
  delete copy.notification;
  delete copy.notifyOnSuccess;
  delete copy.notifyOnFailure;
  delete copy.containerName;
  delete copy.createIfMissing;
  delete copy.dockerRegistryConfig;
  delete copy.forcePull;
  delete copy.image;
  delete copy.name;
  if (Object.keys(copy).length === 0) {
    return null;
  }
  const config = { ...copy };
  if (payload.name !== undefined && config.name === undefined) {
    config.name = payload.name;
  }
  if (payload.image !== undefined && config.image === undefined) {
    config.image = payload.image;
  }
  if (payload.forcePull !== undefined && config.forcePull === undefined) {
    config.forcePull = payload.forcePull;
  }
  return config;
}

function normalizeHealthCheckTargets(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = [];
  for (const item of value) {
    if (typeof item === "string") {
      const name = trimString(item);
      if (name) {
        result.push(name);
      }
      continue;
    }
    if (item && typeof item === "object") {
      const name = firstNonEmpty(item.containerName, item.name);
      if (name) {
        result.push(name);
      }
    }
  }
  return result;
}

export function normalizeContainerCreateConfig(raw) {
  const value = parseMaybeJsonObject(raw, "containerConfig");
  const wrapper = asObject(value.dockerConfig);
  const base = Object.keys(wrapper).length > 0 ? wrapper : value;
  const envValue = base.env;
  const labels = Array.isArray(base.labels) ? base.labels.map(String) : undefined;
  const cmd = Array.isArray(base.cmd) ? base.cmd.map(String) : undefined;
  const entrypoint = Array.isArray(base.entrypoint) ? base.entrypoint.map(String) : undefined;

  return compactObject({
    containerID: trimString(base.containerID),
    registryName: trimString(base.registryName),
    name: trimString(base.name),
    image: trimString(base.image),
    version: trimString(base.version),
    port: normalizeStringMap(base.port),
    env: Array.isArray(envValue) ? normalizeEnvArray(envValue) : normalizeStringMap(envValue),
    mount: normalizeStringMap(base.mount),
    networkName: trimString(base.networkName || base.network),
    forcePull: toBooleanOrUndefined(base.forcePull),
    publishAllPorts: toBooleanOrUndefined(base.publishAllPorts),
    tty: toBooleanOrUndefined(base.tty),
    openStdin: toBooleanOrUndefined(base.openStdin),
    cmd,
    entrypoint,
    cpuShares: toNumberOrUndefined(base.cpuShares),
    nanoCPUs: toNumberOrUndefined(base.nanoCPUs),
    memory: toNumberOrUndefined(base.memory),
    privileged: toBooleanOrUndefined(base.privileged),
    autoRemove: toBooleanOrUndefined(base.autoRemove),
    labels,
    restartPolicy: trimString(base.restartPolicy),
    exposedPorts: normalizePortHelpers(base.exposedPorts),
    volumes: normalizeVolumeHelpers(base.volumes),
    ipv4: trimString(base.ipv4),
    ipv6: trimString(base.ipv6),
  });
}

export function validateContainerCreateConfig(config) {
  if (!config || typeof config !== "object") {
    throw httpError(400, "container create config is nil");
  }
  if (!config.name) {
    throw httpError(400, "containerConfig.name is required");
  }
  if (!buildImageFullName(config)) {
    throw httpError(400, "containerConfig.image is required");
  }
}

export function toContainerCreateRequest(config) {
  const req = compactObject({
    containerID: config.containerID,
    name: config.name,
    image: buildImageFullName(config),
    forcePull: Boolean(config.forcePull),
    network: config.networkName,
    ipv4: config.ipv4,
    ipv6: config.ipv6,
    publishAllPorts: Boolean(config.publishAllPorts),
    exposedPorts: [],
    tty: Boolean(config.tty),
    openStdin: Boolean(config.openStdin),
    cmd: Array.isArray(config.cmd) ? config.cmd : [],
    entrypoint: Array.isArray(config.entrypoint) ? config.entrypoint : [],
    cpuShares: config.cpuShares !== undefined ? config.cpuShares : 0,
    nanoCPUs: config.nanoCPUs !== undefined ? config.nanoCPUs : 0,
    memory: config.memory !== undefined ? config.memory : 0,
    privileged: Boolean(config.privileged),
    autoRemove: Boolean(config.autoRemove),
    volumes: [],
    labels: Array.isArray(config.labels) ? config.labels : [],
    env: [],
    restartPolicy: config.restartPolicy,
  });

  if (Array.isArray(config.exposedPorts) && config.exposedPorts.length > 0) {
    req.exposedPorts = config.exposedPorts;
  } else {
    const portMap = normalizeStringMap(config.port);
    for (const [hostPort, containerPort] of Object.entries(portMap)) {
      req.exposedPorts.push({
        hostIP: "0.0.0.0",
        hostPort,
        containerPort,
        protocol: "tcp",
      });
    }
  }

  if (Array.isArray(config.volumes) && config.volumes.length > 0) {
    req.volumes = config.volumes;
  } else {
    const mountMap = normalizeStringMap(config.mount);
    for (const [sourceDir, containerDir] of Object.entries(mountMap)) {
      req.volumes.push({
        type: "bind",
        sourceDir,
        containerDir,
        mode: "rw",
      });
    }
  }

  if (Array.isArray(config.env)) {
    req.env = config.env;
  } else {
    const envMap = normalizeStringMap(config.env);
    for (const [key, value] of Object.entries(envMap)) {
      req.env.push(`${key}=${value}`);
    }
  }

  return req;
}

function buildImageFullName(config) {
  if (!config) {
    return "";
  }
  const image = trimString(config.image);
  if (!image) {
    return "";
  }
  if (hasImageTagOrDigest(image) || !trimString(config.version)) {
    return image;
  }
  return `${image}:${trimString(config.version)}`;
}

function hasImageTagOrDigest(image) {
  if (image.includes("@")) {
    return true;
  }
  const lastSlash = image.lastIndexOf("/");
  const lastSegment = lastSlash >= 0 ? image.slice(lastSlash + 1) : image;
  return lastSegment.includes(":");
}

function normalizePortHelpers(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    result.push(compactObject({
      hostIP: trimString(item.hostIP),
      hostPort: trimString(item.hostPort),
      containerPort: trimString(item.containerPort),
      protocol: trimString(item.protocol) || "tcp",
    }));
  }
  return result;
}

function normalizeVolumeHelpers(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    result.push(compactObject({
      type: trimString(item.type),
      sourceDir: trimString(item.sourceDir),
      containerDir: trimString(item.containerDir),
      mode: trimString(item.mode),
    }));
  }
  return result;
}

function normalizeEnvArray(value) {
  const result = [];
  for (const item of value) {
    const text = trimString(item);
    if (text) {
      result.push(text);
    }
  }
  return result;
}

function normalizeBaseURL(baseURL, apiPrefix) {
  const prefix = `/${trimString(apiPrefix).replace(/^\/*/, "").replace(/\/*$/, "") || "api/v1"}`;
  const trimmedBase = trimString(baseURL).replace(/\/*$/, "");
  if (!trimmedBase) {
    return "";
  }
  if (trimmedBase.endsWith("/api/v1") || trimmedBase.endsWith("/api/v2") || trimmedBase.endsWith(prefix)) {
    return trimmedBase;
  }
  return `${trimmedBase}${prefix}`;
}

function normalizeConsoleURL(baseURL, apiPrefix) {
  const prefix = `/${trimString(apiPrefix).replace(/^\/*/, "").replace(/\/*$/, "") || "api/v1"}`;
  const trimmedBase = trimString(baseURL).replace(/\/*$/, "");
  if (!trimmedBase) {
    return "";
  }
  for (const suffix of [prefix, "/api/v1", "/api/v2"]) {
    if (trimmedBase.endsWith(suffix)) {
      return trimmedBase.slice(0, -suffix.length) || trimmedBase;
    }
  }
  return trimmedBase;
}
