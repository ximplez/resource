const FEISHU_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const FEISHU_MESSAGE_URL = "https://open.feishu.cn/open-apis/im/v1/messages";
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

const tokenCache = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ success: true, service: "feishu-bot-gateway" });
      }
      if (request.method === "POST" && url.pathname === "/send") {
        requireAuth(request, env);
        const payload = await readJson(request);
        const result = await sendMessage(payload, env);
        return json({
          success: true,
          data: result,
        });
      }
      if (request.method === "POST" && url.pathname === "/send_card") {
        requireAuth(request, env);
        const payload = await readJson(request);
        const result = await sendTemplateCard(payload, env);
        return json({
          success: true,
          data: result,
        });
      }

      return json({ success: false, error: "not found" }, 404);
    } catch (error) {
      const status = error.status || 500;
      return json({
        success: false,
        error: error.message || "internal server error",
      }, status);
    }
  },
};

async function sendTemplateCard(payload, env) {
  validateTemplateCardPayload(payload, env);
  const content = payload.content ? parseTemplateCardContent(payload.content) : compactObject({
    type: "template",
    data: compactObject({
      template_id: payload.templateId,
      template_version_name: payload.templateVersionName,
      template_variable: payload.templateVariable || {},
    }),
  });
  return sendMessage({
    appId: payload.appId,
    receiveIdType: payload.receiveIdType || getDefaultReceiveIdType(payload.appId, env),
    receiveId: payload.receiveId || getDefaultReceiveId(payload.appId, env),
    msgType: "interactive",
    content,
  }, env);
}

async function sendMessage(payload, env) {
  validateSendPayload(payload);

  const apps = getApps(env);
  const app = apps[payload.appId];
  if (!app) {
    throw httpError(400, `unsupported appId: ${payload.appId}`);
  }

  const token = await getTenantAccessToken(payload.appId, app, env);
  const receiveIdType = payload.receiveIdType;
  const feishuPayload = {
    receive_id: payload.receiveId,
    msg_type: payload.msgType,
    content: JSON.stringify(payload.content),
  };

  const resp = await fetch(`${FEISHU_MESSAGE_URL}?receive_id_type=${encodeURIComponent(receiveIdType)}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(feishuPayload),
  });

  const data = await safeJson(resp);
  if (!resp.ok || data.code !== 0) {
    throw httpError(502, `feishu send message failed: ${JSON.stringify(data)}`);
  }

  return {
    messageId: data.data && data.data.message_id ? data.data.message_id : "",
    feishu: data,
  };
}

async function getTenantAccessToken(appId, app, env) {
  const cacheKey = `tenant:${appId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expireAt > Date.now() + 60_000) {
    return cached.token;
  }

  let kvToken = null;
  if (env.FEISHU_TOKEN_KV) {
    kvToken = await env.FEISHU_TOKEN_KV.get(cacheKey, "json");
    if (kvToken && kvToken.expireAt > Date.now() + 60_000) {
      tokenCache.set(cacheKey, kvToken);
      return kvToken.token;
    }
  }

  const resp = await fetch(FEISHU_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: app.appId,
      app_secret: app.appSecret,
    }),
  });
  const data = await safeJson(resp);
  if (!resp.ok || data.code !== 0 || !data.tenant_access_token) {
    throw httpError(502, `feishu token failed: ${JSON.stringify(data)}`);
  }

  const expireSeconds = Number(data.expire) > 0 ? Number(data.expire) : 7200;
  const tokenRecord = {
    token: data.tenant_access_token,
    expireAt: Date.now() + Math.max(expireSeconds - 120, 60) * 1000,
  };
  tokenCache.set(cacheKey, tokenRecord);
  if (env.FEISHU_TOKEN_KV) {
    await env.FEISHU_TOKEN_KV.put(cacheKey, JSON.stringify(tokenRecord), {
      expirationTtl: Math.max(expireSeconds - 60, 60),
    });
  }
  return tokenRecord.token;
}

function validateSendPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "request body must be a JSON object");
  }
  requiredString(payload.appId, "appId");
  requiredString(payload.receiveIdType, "receiveIdType");
  requiredString(payload.receiveId, "receiveId");
  requiredString(payload.msgType, "msgType");
  if (!["open_id", "user_id", "union_id", "email", "chat_id"].includes(payload.receiveIdType)) {
    throw httpError(400, "unsupported receiveIdType");
  }
  if (!["text", "post", "interactive"].includes(payload.msgType)) {
    throw httpError(400, "unsupported msgType");
  }
  if (!payload.content || typeof payload.content !== "object") {
    throw httpError(400, "content must be a JSON object");
  }
  if (JSON.stringify(payload.content).length > DEFAULT_MAX_BODY_BYTES) {
    throw httpError(400, "content is too large");
  }
  if (payload.msgType === "text" && typeof payload.content.text !== "string") {
    throw httpError(400, "text message content.text is required");
  }
}

function validateTemplateCardPayload(payload, env) {
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "request body must be a JSON object");
  }
  requiredString(payload.appId, "appId");
  const receiveIdType = payload.receiveIdType || getDefaultReceiveIdType(payload.appId, env);
  const receiveId = payload.receiveId || getDefaultReceiveId(payload.appId, env);
  requiredString(receiveIdType, "receiveIdType");
  requiredString(receiveId, "receiveId");
  if (!payload.content) {
    requiredString(payload.templateId, "templateId");
  }
  if (!["open_id", "user_id", "union_id", "email", "chat_id"].includes(receiveIdType)) {
    throw httpError(400, "unsupported receiveIdType");
  }
  if (payload.templateVariable !== undefined) {
    if (!payload.templateVariable || typeof payload.templateVariable !== "object" || Array.isArray(payload.templateVariable)) {
      throw httpError(400, "templateVariable must be a JSON object");
    }
    if (JSON.stringify(payload.templateVariable).length > DEFAULT_MAX_BODY_BYTES) {
      throw httpError(400, "templateVariable is too large");
    }
  }
  if (payload.templateVersionName !== undefined && typeof payload.templateVersionName !== "string") {
    throw httpError(400, "templateVersionName must be a string");
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw httpError(400, `${field} is required`);
  }
}

function getApps(env) {
  if (!env.FEISHU_APPS_JSON) {
    throw httpError(500, "FEISHU_APPS_JSON is not configured");
  }
  let parsed;
  try {
    parsed = JSON.parse(env.FEISHU_APPS_JSON);
  } catch (error) {
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

function getDefaultReceiveIdType(appId, env) {
  const app = getApps(env)[appId];
  return app ? app.defaultIdType : "";
}

function getDefaultReceiveId(appId, env) {
  const app = getApps(env)[appId];
  return app ? app.defaultReceiveId : "";
}

function parseTemplateCardContent(content) {
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch (error) {
      throw httpError(400, "content must be valid JSON string");
    }
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw httpError(400, "content must be a JSON object");
  }
  if (content.type !== "template") {
    throw httpError(400, "send_card content.type must be template");
  }
  if (!content.data || typeof content.data !== "object" || Array.isArray(content.data)) {
    throw httpError(400, "send_card content.data must be a JSON object");
  }
  requiredString(content.data.template_id, "content.data.template_id");
  if (content.data.template_variable !== undefined && (!content.data.template_variable || typeof content.data.template_variable !== "object" || Array.isArray(content.data.template_variable))) {
    throw httpError(400, "content.data.template_variable must be a JSON object");
  }
  return content;
}

function requireAuth(request, env) {
  if (!env.API_AUTH_TOKEN) {
    throw httpError(500, "API_AUTH_TOKEN is not configured");
  }
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.API_AUTH_TOKEN}`;
  if (auth !== expected) {
    throw httpError(401, "unauthorized");
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > DEFAULT_MAX_BODY_BYTES) {
    throw httpError(413, "request body is too large");
  }
  try {
    return await request.json();
  } catch (error) {
    throw httpError(400, "invalid JSON body");
  }
}

async function safeJson(resp) {
  const text = await resp.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      raw: text,
    };
  }
}

function json(data, status = 200) {
  return withCors(new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  }));
}

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function compactObject(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
