import { compactObject } from "../lib/object.js";
import { httpError, requiredString } from "../lib/errors.js";

export function parseTemplateCardContent(content) {
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
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
  if (
    content.data.template_variable !== undefined &&
    (!content.data.template_variable ||
      typeof content.data.template_variable !== "object" ||
      Array.isArray(content.data.template_variable))
  ) {
    throw httpError(400, "content.data.template_variable must be a JSON object");
  }
  return content;
}

export function buildTemplateCardContent(payload) {
  return payload.content
    ? parseTemplateCardContent(payload.content)
    : compactObject({
        type: "template",
        data: compactObject({
          template_id: payload.templateId,
          template_version_name: payload.templateVersionName,
          template_variable: payload.templateVariable || {},
        }),
      });
}
