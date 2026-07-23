import { safeJson } from "../lib/http.js";
import { stringifyForError, trimString } from "../lib/object.js";
import { httpError } from "../lib/errors.js";
import { toFeishuTemplateVariable } from "./card-message.js";

export async function sendCardNotification(notificationConfig, message) {
  if (!notificationConfig || !notificationConfig.enabled || !message) {
    return {
      attempted: false,
      sent: false,
      reason: "notification is disabled or message is empty",
    };
  }

  try {
    validateGatewayConfig(notificationConfig);
    const payload = {
      appId: notificationConfig.appId,
      templateId: notificationConfig.templateId,
      templateVersionName: notificationConfig.templateVersionName || undefined,
      templateVariable: toFeishuTemplateVariable(message),
      receiveIdType: notificationConfig.receiveIdType || undefined,
      receiveId: notificationConfig.receiveId || undefined,
    };
    const resp = await fetch(`${normalizeGatewayBaseUrl(notificationConfig.gatewayBaseUrl)}/send_card`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notificationConfig.gatewayAuthToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(resp);
    if (!resp.ok || !data.success) {
      throw httpError(resp.status || 502, `feishu bot gateway send_card failed: ${stringifyForError(data)}`);
    }
    return {
      attempted: true,
      sent: true,
      messageId: data.data && data.data.messageId ? data.data.messageId : "",
      gateway: data,
    };
  } catch (error) {
    console.error(`[FeishuCardNotify] err=${error && error.message ? error.message : String(error)} message=${JSON.stringify(message)}`);
    return {
      attempted: true,
      sent: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

export async function updateCardNotification(notificationConfig, messageId, message) {
  if (!notificationConfig || !notificationConfig.enabled || !messageId || !message) {
    return {
      attempted: false,
      sent: false,
      reason: "notification is disabled or messageId/message is empty",
    };
  }

  try {
    validateGatewayConfig(notificationConfig);
    const payload = {
      appId: notificationConfig.appId,
      messageId,
      templateId: notificationConfig.templateId,
      templateVersionName: notificationConfig.templateVersionName || undefined,
      templateVariable: toFeishuTemplateVariable(message),
    };
    const resp = await fetch(`${normalizeGatewayBaseUrl(notificationConfig.gatewayBaseUrl)}/send_card`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${notificationConfig.gatewayAuthToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(resp);
    if (!resp.ok || !data.success) {
      throw httpError(resp.status || 502, `feishu bot gateway update card failed: ${stringifyForError(data)}`);
    }
    return {
      attempted: true,
      sent: true,
      messageId,
      gateway: data,
      updated: true,
    };
  } catch (error) {
    console.error(`[FeishuCardUpdate] err=${error && error.message ? error.message : String(error)} messageId=${messageId} message=${JSON.stringify(message)}`);
    return {
      attempted: true,
      sent: false,
      error: error && error.message ? error.message : String(error),
      updated: false,
    };
  }
}

function validateGatewayConfig(config) {
  if (!trimString(config.gatewayBaseUrl)) {
    throw httpError(500, "FEISHU_BOT_GATEWAY_BASE_URL is not configured");
  }
  if (!trimString(config.gatewayAuthToken)) {
    throw httpError(500, "FEISHU_BOT_GATEWAY_AUTH_TOKEN is not configured");
  }
  if (!trimString(config.appId)) {
    throw httpError(500, "FEISHU_BOT_APP_ID is not configured");
  }
  if (!trimString(config.templateId)) {
    throw httpError(500, "FEISHU_BOT_TEMPLATE_ID is not configured");
  }
}

function normalizeGatewayBaseUrl(baseUrl) {
  return trimString(baseUrl).replace(/\/+$/, "");
}
