import { getDefaultReceiveId, getDefaultReceiveIdType } from "./config/apps.js";
import { httpError } from "./lib/errors.js";
import { json, readJson, withCors } from "./lib/http.js";
import { requireAuth } from "./validators/auth.js";
import { validateSendPayload } from "./validators/message.js";
import { validateTemplateCardPayload } from "./validators/card.js";
import {
  fillMissingTemplateSchemaImages,
  validateTemplateSchemaVariables,
} from "./validators/template-schema.js";
import { sendMessage, sendTemplateCard } from "./services/message-service.js";
import { uploadCardImages, uploadImage } from "./services/image-service.js";
import { parseCardRequest, parseUploadImageRequest } from "./services/image-request.js";

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
        validateSendPayload(payload);
        const result = await sendMessage(payload, env);
        return json({
          success: true,
          data: result,
        });
      }
      if (request.method === "POST" && url.pathname === "/upload_image") {
        requireAuth(request, env);
        const payload = await parseUploadImageRequest(request);
        const result = await uploadImage(payload, env);
        return json({
          success: true,
          data: result,
        });
      }
      if (request.method === "POST" && url.pathname === "/send_card") {
        requireAuth(request, env);
        const payload = fillMissingTemplateSchemaImages(await parseCardRequest(request), env);
        validateTemplateCardPayload(payload, env, getDefaultReceiveIdType, getDefaultReceiveId);
        const prepared = await uploadCardImages(payload, env);
        validateTemplateSchemaVariables(prepared.payload, env);
        const result = await sendTemplateCard(prepared.payload, env);
        return json({
          success: true,
          data: {
            ...result,
            images: prepared.images,
          },
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
