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
