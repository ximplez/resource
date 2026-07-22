import { requiredString, httpError } from "../lib/errors.js";
import { DEFAULT_MAX_BODY_BYTES } from "../lib/http.js";

export function validateSendPayload(payload) {
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
