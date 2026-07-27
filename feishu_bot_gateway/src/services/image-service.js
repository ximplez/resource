import { httpError } from "../lib/errors.js";
import { compactObject } from "../lib/object.js";
import {
  MAX_IMAGE_BYTES,
  hasImageSource,
  validateImageBytes,
  validateImageContentType,
  validateImageFile,
} from "../validators/image.js";
import { requestLark } from "./lark-client.js";
import { parseTemplateCardContent } from "./card-content.js";

const PLACEHOLDER_IMAGE_VERSION = "transparent-card-placeholder-1200x1:v1";
const PLACEHOLDER_IMAGE_FILE_NAME = "transparent-card-placeholder-1200x1.png";
const PLACEHOLDER_IMAGE_CONTENT_TYPE = "image/png";
const PLACEHOLDER_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAABLAAAAABCAYAAADO+FcMAAAAHElEQVR42u3BMQEAAADCoPVPbQ0PoAAAAADg2AASwQABPK+CjgAAAABJRU5ErkJggg==";

const placeholderImageKeyCache = new Map();
const placeholderImageUploadPromises = new Map();

export async function uploadImage(payload, env, options = {}) {
  const image = await resolveImageSource(payload, options.fetch || fetch);
  const data = await uploadImageToFeishu(payload.appId, image, env, options);
  return {
    imageKey: data.image_key,
    fileName: image.fileName,
    contentType: image.contentType,
    size: image.bytes.byteLength,
    feishu: {
      code: 0,
      data,
    },
  };
}

export async function uploadCardImages(payload, env, options = {}) {
  if (!payload.images || payload.images.length === 0) {
    return {
      payload,
      images: [],
    };
  }
  const uploaded = [];
  for (const image of payload.images) {
    const result = hasImageSource(image)
      ? await uploadImage({ appId: payload.appId, ...image }, env, {
        ...options,
      })
      : await getPlaceholderImage(payload.appId, env, options);
    uploaded.push({
      variable: image.variable,
      ...result,
    });
  }
  const imageTemplateVariables = Object.fromEntries(
    uploaded.map((image) => [image.variable, { img_key: image.imageKey }]),
  );
  const templateVariable = {
    ...(payload.templateVariable || {}),
    ...imageTemplateVariables,
  };
  const content = payload.content
    ? mergeContentTemplateVariables(payload.content, imageTemplateVariables)
    : payload.content;
  return {
    payload: {
      ...payload,
      templateVariable,
      content,
    },
    images: uploaded,
  };
}

async function getPlaceholderImage(appId, env, options = {}) {
  const cacheKey = `${appId}:${PLACEHOLDER_IMAGE_VERSION}`;
  const cachedImageKey = placeholderImageKeyCache.get(cacheKey);
  if (cachedImageKey) {
    return buildPlaceholderImageResult(cachedImageKey);
  }

  let uploadPromise = placeholderImageUploadPromises.get(cacheKey);
  if (!uploadPromise) {
    uploadPromise = uploadPlaceholderImage(appId, env, options)
      .then((imageKey) => {
        placeholderImageKeyCache.set(cacheKey, imageKey);
        return imageKey;
      })
      .finally(() => {
        placeholderImageUploadPromises.delete(cacheKey);
      });
    placeholderImageUploadPromises.set(cacheKey, uploadPromise);
  }

  return buildPlaceholderImageResult(await uploadPromise);
}

async function uploadPlaceholderImage(appId, env, options) {
  const data = await uploadImageToFeishu(appId, getPlaceholderImageBytes(), env, options);
  return data.image_key;
}

function getPlaceholderImageBytes() {
  return {
    bytes: Uint8Array.from(Buffer.from(PLACEHOLDER_IMAGE_BASE64, "base64")),
    contentType: PLACEHOLDER_IMAGE_CONTENT_TYPE,
    fileName: PLACEHOLDER_IMAGE_FILE_NAME,
  };
}

function buildPlaceholderImageResult(imageKey) {
  return {
    imageKey,
    fileName: PLACEHOLDER_IMAGE_FILE_NAME,
    contentType: PLACEHOLDER_IMAGE_CONTENT_TYPE,
    size: getPlaceholderImageBytes().bytes.byteLength,
    placeholder: true,
    feishu: {
      code: 0,
      data: {
        image_key: imageKey,
      },
    },
  };
}

async function resolveImageSource(payload, fetchImpl) {
  if (payload.file) {
    validateImageFile(payload.file);
    const fileName = payload.file.name || payload.fileName || "";
    const fileContentType = normalizeContentType(payload.file.type);
    const contentType = resolveContentType(
      fileContentType === "application/octet-stream"
        ? payload.contentType
        : fileContentType || payload.contentType,
      fileName,
    );
    if (!contentType) {
      throw httpError(400, "contentType is required when the image format cannot be inferred");
    }
    validateImageContentType(contentType);
    return {
      bytes: new Uint8Array(await payload.file.arrayBuffer()),
      contentType,
      fileName: fileName || defaultFileName(contentType),
    };
  }
  if (payload.url) {
    return await fetchImage(payload.url, payload, fetchImpl);
  }
  return decodeBase64Image(payload);
}

async function uploadImageToFeishu(appId, image, env, options) {
  const request = options.requestLark || requestLark;
  const form = new FormData();
  form.set("image_type", "message");
  form.set("image", new Blob([image.bytes], { type: image.contentType }), image.fileName);

  let data;
  try {
    data = await request(appId, env, {
      url: "https://open.feishu.cn/open-apis/im/v1/images",
      method: "POST",
      headers: compactObject({
        "Content-Type": "multipart/form-data",
      }),
      data: form,
    });
  } catch (error) {
    throw httpError(502, `feishu upload image failed: ${error.message || String(error)}`);
  }
  if (!data || data.code !== 0 || !data.data || !data.data.image_key) {
    throw httpError(502, `feishu upload image failed: ${JSON.stringify(data)}`);
  }
  return data.data;
}

async function fetchImage(url, payload, fetchImpl) {
  const response = await fetchRemoteImage(url, fetchImpl);
  if (!response.ok) {
    throw httpError(502, `fetch image failed with status ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw httpError(413, "image exceeds the 10 MB Feishu image limit");
  }
  const fileName = payload.fileName || fileNameFromURL(response.url || url);
  const responseContentType = normalizeContentType(response.headers.get("content-type"));
  const contentType = resolveContentType(
    responseContentType === "application/octet-stream"
      ? payload.contentType
      : responseContentType || payload.contentType,
    fileName,
  );
  validateImageContentType(contentType);
  const bytes = await readResponseBytes(response);
  validateImageBytes(bytes, contentType);
  return {
    bytes,
    contentType,
    fileName: fileName || defaultFileName(contentType),
  };
}

function decodeBase64Image(payload) {
  const parsed = parseBase64(payload.base64);
  const contentType = resolveContentType(payload.contentType || parsed.contentType, payload.fileName);
  if (!contentType) {
    throw httpError(400, "contentType is required for raw base64 images");
  }
  validateImageContentType(contentType);
  if (!isValidBase64(parsed.value)) {
    throw httpError(400, "base64 image is invalid");
  }
  const bytes = Uint8Array.from(Buffer.from(parsed.value, "base64"));
  validateImageBytes(bytes, contentType);
  return {
    bytes,
    contentType,
    fileName: payload.fileName || defaultFileName(contentType),
  };
}

function mergeContentTemplateVariables(content, templateVariable) {
  const parsed = parseTemplateCardContent(content);
  return {
    ...parsed,
    data: {
      ...parsed.data,
      template_variable: {
        ...(parsed.data.template_variable || {}),
        ...templateVariable,
      },
    },
  };
}

function parseBase64(value) {
  const trimmed = value.trim();
  const match = /^data:([^;,]+);base64,(.*)$/is.exec(trimmed);
  if (match) {
    return {
      contentType: match[1],
      value: match[2].replace(/\s+/g, ""),
    };
  }
  return {
    contentType: "",
    value: trimmed.replace(/\s+/g, ""),
  };
}

function normalizeContentType(contentType) {
  return (contentType || "").split(";", 1)[0].trim().toLowerCase();
}

async function fetchRemoteImage(rawURL, fetchImpl) {
  let currentURL = rawURL;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    assertSafeRemoteURL(currentURL);
    let response;
    try {
      response = await fetchImpl(currentURL, {
        redirect: "manual",
        headers: {
          Accept: "image/*",
        },
      });
    } catch (error) {
      throw httpError(502, `fetch image failed: ${error.message || String(error)}`);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location) {
      throw httpError(502, "fetch image redirect is missing location");
    }
    currentURL = new URL(location, currentURL).toString();
  }
  throw httpError(502, "fetch image exceeded redirect limit");
}

async function readResponseBytes(response) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw httpError(413, "image exceeds the 10 MB Feishu image limit");
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw httpError(413, "image exceeds the 10 MB Feishu image limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertSafeRemoteURL(rawURL) {
  let parsed;
  try {
    parsed = new URL(rawURL);
  } catch {
    throw httpError(400, "image URL must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw httpError(400, "image URL must use http or https");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isIPv6 = host.includes(":");
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    isPrivateIPv4(host) ||
    (isIPv6 && (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")))
  ) {
    throw httpError(400, "image URL cannot target a private network address");
  }
}

function isPrivateIPv4(host) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] === 0
  );
}

function resolveContentType(contentType, fileName = "") {
  const normalized = normalizeContentType(contentType);
  if (normalized) {
    return normalized;
  }
  const extension = fileName.toLowerCase().split("?")[0].split("#")[0].split(".").pop();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    tif: "image/tiff",
    tiff: "image/tiff",
    bmp: "image/bmp",
    ico: "image/x-icon",
  }[extension] || "";
}

function isValidBase64(value) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return false;
  }
  const paddingIndex = value.indexOf("=");
  return paddingIndex === -1 || paddingIndex >= value.length - 2;
}

function fileNameFromURL(rawURL) {
  try {
    const name = new URL(rawURL).pathname.split("/").pop();
    return name ? decodeURIComponent(name) : "";
  } catch {
    return "";
  }
}

function defaultFileName(contentType) {
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/tiff": "tiff",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
  }[contentType] || "img";
  return `image.${extension}`;
}
