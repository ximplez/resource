import { httpError, requiredString } from "../lib/errors.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_JSON_BYTES = 14 * 1024 * 1024;
export const MAX_CARD_WITH_IMAGES_BYTES = 28 * 1024 * 1024;
export const MAX_CARD_IMAGES = 5;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export function validateUploadImagePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(400, "request body must be a JSON object");
  }
  requiredString(payload.appId, "appId");
  validateImageSource(payload, "image", { allowEmpty: false });
}

export function validateCardImages(images) {
  if (images === undefined) {
    return;
  }
  if (!Array.isArray(images) || images.length === 0) {
    throw httpError(400, "images must be a non-empty array");
  }
  if (images.length > MAX_CARD_IMAGES) {
    throw httpError(400, `images cannot contain more than ${MAX_CARD_IMAGES} items`);
  }
  const variables = new Set();
  images.forEach((image, index) => {
    const field = `images[${index}]`;
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      throw httpError(400, `${field} must be a JSON object`);
    }
    requiredString(image.variable, `${field}.variable`);
    if (variables.has(image.variable)) {
      throw httpError(400, `${field}.variable is duplicated`);
    }
    variables.add(image.variable);
    validateImageSource(image, field, { allowEmpty: true });
  });
}

export function hasImageSource(image) {
  return imageSourceCount(image) > 0;
}

export function validateImageFile(file, field = "image") {
  if (!isFileLike(file)) {
    throw httpError(400, `${field} file is required`);
  }
  if (file.size <= 0) {
    throw httpError(400, `${field} file cannot be empty`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw httpError(413, `${field} exceeds the 10 MB Feishu image limit`);
  }
  if (normalizeContentType(file.type) !== "application/octet-stream") {
    validateContentType(file.type, field);
  }
}

export function validateImageBytes(bytes, contentType, field = "image") {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) {
    throw httpError(400, `${field} cannot be empty`);
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw httpError(413, `${field} exceeds the 10 MB Feishu image limit`);
  }
  validateContentType(contentType, field);
}

export function validateImageContentType(contentType, field = "image") {
  validateContentType(contentType, field);
}

function validateImageSource(image, field, options = {}) {
  const sources = imageSourceCount(image);
  if (sources === 0 && options.allowEmpty) {
    validateOptionalEmptySource(image, field);
    return;
  }
  if (sources !== 1) {
    throw httpError(400, `${field} must provide exactly one of url, base64, or file`);
  }
  if (hasNonEmptyString(image.url)) {
    validateHttpURL(image.url, `${field}.url`);
  }
  if (hasNonEmptyString(image.base64)) {
    requiredString(image.base64, `${field}.base64`);
  }
  if (image.file !== undefined) {
    validateImageFile(image.file, `${field}.file`);
  }
  if (image.contentType !== undefined) {
    requiredString(image.contentType, `${field}.contentType`);
    validateContentType(image.contentType, `${field}.contentType`);
  }
  if (image.fileName !== undefined) {
    requiredString(image.fileName, `${field}.fileName`);
  }
}

function validateOptionalEmptySource(image, field) {
  if (!isEmptySourceValue(image.url)) {
    requiredString(image.url, `${field}.url`);
  }
  if (!isEmptySourceValue(image.base64)) {
    requiredString(image.base64, `${field}.base64`);
  }
  if (image.file !== undefined) {
    validateImageFile(image.file, `${field}.file`);
  }
  if (image.contentType !== undefined) {
    requiredString(image.contentType, `${field}.contentType`);
    validateContentType(image.contentType, `${field}.contentType`);
  }
  if (image.fileName !== undefined) {
    requiredString(image.fileName, `${field}.fileName`);
  }
}

function imageSourceCount(image) {
  return [
    hasNonEmptyString(image.url),
    hasNonEmptyString(image.base64),
    isFileLike(image.file),
  ].filter(Boolean).length;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isEmptySourceValue(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function validateHttpURL(value, field) {
  requiredString(value, field);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(400, `${field} must be a valid URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw httpError(400, `${field} must use http or https`);
  }
}

function validateContentType(contentType, field) {
  if (!contentType) {
    return;
  }
  const normalized = normalizeContentType(contentType);
  if (!SUPPORTED_IMAGE_TYPES.has(normalized)) {
    throw httpError(400, `${field} has unsupported image content type: ${normalized}`);
  }
}

function normalizeContentType(contentType) {
  return (contentType || "").split(";", 1)[0].trim().toLowerCase();
}

function isFileLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.arrayBuffer === "function" &&
      Number.isFinite(value.size),
  );
}
