import { httpError, requiredString } from "../lib/errors.js";
import { isMultipartRequest, readFormData, readJson } from "../lib/http.js";
import {
  MAX_CARD_WITH_IMAGES_BYTES,
  MAX_IMAGE_JSON_BYTES,
  MAX_IMAGE_BYTES,
  validateCardImages,
  validateImageFile,
  validateUploadImagePayload,
} from "../validators/image.js";

export async function parseUploadImageRequest(request) {
  if (!isMultipartRequest(request)) {
    const payload = await readJson(request, MAX_IMAGE_JSON_BYTES);
    validateUploadImagePayload(payload);
    return payload;
  }

  const form = await readFormData(request, MAX_IMAGE_BYTES + 1024 * 1024);
  const file = form.get("image") || form.get("file");
  const payload = {
    appId: formValue(form, "appId"),
    file,
    fileName: optionalFormValue(form, "fileName"),
    contentType: optionalFormValue(form, "contentType"),
  };
  requiredString(payload.appId, "appId");
  validateImageFile(file);
  return payload;
}

export async function parseCardRequest(request) {
  if (!isMultipartRequest(request)) {
    const payload = await readJson(request, MAX_CARD_WITH_IMAGES_BYTES);
    validateCardImages(payload.images);
    return payload;
  }

  const form = await readFormData(request, MAX_CARD_WITH_IMAGES_BYTES);
  const payload = parseCardPayloadField(form.get("payload"));
  const imageMap = parseImageMap(form.get("imageMap"));
  const files = form.getAll("image");
  if (files.length === 0) {
    throw httpError(400, "multipart send_card requires at least one image field");
  }
  if (imageMap.length !== files.length) {
    throw httpError(400, "imageMap length must match image field count");
  }
  const totalImageBytes = files.reduce((total, file) => total + (Number(file.size) || 0), 0);
  if (totalImageBytes > MAX_CARD_WITH_IMAGES_BYTES) {
    throw httpError(413, "multipart card images are too large");
  }
  payload.images = files.map((file, index) => ({
    ...imageMap[index],
    file,
  }));
  validateCardImages(payload.images);
  return payload;
}

function parseCardPayloadField(value) {
  requiredString(value, "payload");
  let payload;
  try {
    payload = JSON.parse(value);
  } catch {
    throw httpError(400, "payload must be valid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "payload must be a JSON object");
  }
  return payload;
}

function parseImageMap(value) {
  requiredString(value, "imageMap");
  let imageMap;
  try {
    imageMap = JSON.parse(value);
  } catch {
    throw httpError(400, "imageMap must be valid JSON");
  }
  if (!Array.isArray(imageMap) || imageMap.length === 0) {
    throw httpError(400, "imageMap must be a non-empty array");
  }
  return imageMap;
}

function formValue(form, field) {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

function optionalFormValue(form, field) {
  const value = formValue(form, field);
  return value || undefined;
}
