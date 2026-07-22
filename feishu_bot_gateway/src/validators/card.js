import { requiredString, httpError } from "../lib/errors.js";
import { DEFAULT_MAX_BODY_BYTES } from "../lib/http.js";

export function validateTemplateCardPayload(payload, env, getDefaultReceiveIdType, getDefaultReceiveId) {
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "request body must be a JSON object");
  }
  requiredString(payload.appId, "appId");
  if (payload.messageId !== undefined && (typeof payload.messageId !== "string" || payload.messageId.trim() === "")) {
    throw httpError(400, "messageId must be a non-empty string");
  }
  if (payload.messageId) {
    validateTemplateCardContentFields(payload);
    return;
  }
  const receiveIdType = payload.receiveIdType || getDefaultReceiveIdType(payload.appId, env);
  const receiveId = payload.receiveId || getDefaultReceiveId(payload.appId, env);
  requiredString(receiveIdType, "receiveIdType");
  requiredString(receiveId, "receiveId");
  if (!["open_id", "user_id", "union_id", "email", "chat_id"].includes(receiveIdType)) {
    throw httpError(400, "unsupported receiveIdType");
  }
  validateTemplateCardContentFields(payload);
}

export function validateTemplateCardContentFields(payload) {
  if (!payload.content) {
    requiredString(payload.templateId, "templateId");
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
