import { getAppConfig } from "../config/apps.js";
import { httpError } from "../lib/errors.js";

const clientCache = new Map();
let larkSdkPromise = null;
let defaultHttpConfigured = false;

export async function getLarkClient(appId, env) {
  const app = getAppConfig(appId, env);
  const cacheKey = `${app.appId}:${app.appSecret}`;
  const cached = clientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lark = await getLarkSdk();
  const httpInstance = getConfiguredHttpInstance(lark);
  const client = new lark.Client({
    appId: app.appId,
    appSecret: app.appSecret,
    httpInstance,
    cache: env.FEISHU_TOKEN_KV ? createKVCacheAdapter(env.FEISHU_TOKEN_KV) : undefined,
  });
  clientCache.set(cacheKey, client);
  return client;
}

export function unwrapLarkResponse(resp, prefix) {
  if (!resp) {
    throw httpError(502, `${prefix}: empty response`);
  }
  if (resp.code !== 0) {
    throw httpError(502, `${prefix}: ${JSON.stringify(resp)}`);
  }
  return resp.data || {};
}

export async function callLark(prefix, operation) {
  try {
    return await operation();
  } catch (error) {
    throw httpError(larkErrorStatus(error), `${prefix}: ${formatLarkError(error)}`);
  }
}

export function formatLarkError(error) {
  const parts = [];
  const message = error && error.message ? String(error.message).trim() : "";
  if (message) {
    parts.push(message);
  }

  const response = error && error.response ? error.response : undefined;
  const status = response && response.status ? response.status : error && (error.status || error.statusCode);
  if (status) {
    parts.push(`status=${status}`);
  }

  const body = response && response.data !== undefined
    ? response.data
    : response && response.body !== undefined
      ? response.body
      : error && error.data !== undefined
        ? error.data
        : undefined;
  const bodyText = stringifyErrorBody(body);
  if (bodyText) {
    parts.push(`body=${bodyText}`);
  }

  return parts.length > 0 ? parts.join("; ") : String(error);
}

export async function formatLarkPayload(appId, env, payload = {}, options = {}) {
  const client = await getLarkClient(appId, env);
  return await client.formatPayload(payload, options);
}

export async function requestLark(appId, env, request, payload = {}, options = {}) {
  const client = await getLarkClient(appId, env);
  const formatted = await client.formatPayload(payload, options);
  try {
    return await client.httpInstance.request({
      ...request,
      params: {
        ...formatted.params,
        ...(request.params || {}),
      },
      headers: {
        ...formatted.headers,
        ...(request.headers || {}),
      },
      data: request.data === undefined ? formatted.data : request.data,
    });
  } catch (error) {
    throw httpError(larkErrorStatus(error), `feishu request failed: ${formatLarkError(error)}`);
  }
}

async function getLarkSdk() {
  if (!larkSdkPromise) {
    // The SDK reads __dirname at module initialization. Cloudflare Workers do
    // not provide it, so define a harmless global before lazy-loading the SDK.
    if (globalThis.__dirname === undefined) {
      globalThis.__dirname = "/";
    }
    larkSdkPromise = import("@larksuiteoapi/node-sdk/lib/index.js").then((mod) => mod.default || mod);
  }
  return await larkSdkPromise;
}

function getConfiguredHttpInstance(lark) {
  if (!defaultHttpConfigured) {
    lark.defaultHttpInstance.defaults.adapter = "fetch";
    defaultHttpConfigured = true;
  }
  return lark.defaultHttpInstance;
}

function createKVCacheAdapter(kv) {
  return {
    async get(key, options) {
      const cacheKey = namespaceCacheKey(key, options);
      const value = await kv.get(cacheKey);
      if (!value) {
        return undefined;
      }
      return value;
    },
    async set(key, value, expiredTime, options) {
      const cacheKey = namespaceCacheKey(key, options);
      if (expiredTime && Number.isFinite(expiredTime)) {
        const ttlSeconds = Math.max(Math.floor((expiredTime - Date.now()) / 1000), 1);
        await kv.put(cacheKey, value, { expirationTtl: ttlSeconds });
      } else {
        await kv.put(cacheKey, value);
      }
      return true;
    },
  };
}

function namespaceCacheKey(key, options) {
  if (options && options.namespace) {
    return `${options.namespace}/${String(key)}`;
  }
  return String(key);
}

function larkErrorStatus(error) {
  const responseStatus = error && error.response && error.response.status;
  const status = responseStatus || error && (error.status || error.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
}

function stringifyErrorBody(body) {
  if (body === undefined || body === null) {
    return "";
  }
  if (typeof body === "string") {
    return truncate(body.trim());
  }
  try {
    return truncate(JSON.stringify(body));
  } catch {
    return truncate(String(body));
  }
}

function truncate(value, maxLength = 3000) {
  if (!value || value.length <= maxLength) {
    return value || "";
  }
  return `${value.slice(0, maxLength)}...`;
}
