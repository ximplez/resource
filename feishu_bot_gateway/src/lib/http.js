import { httpError } from "./errors.js";

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export async function readJson(request, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const bytes = await readRequestBytes(request, maxBytes);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "invalid JSON body");
  }
}

export async function readFormData(request, maxBytes) {
  const bytes = await readRequestBytes(request, maxBytes);
  const contentType = request.headers.get("content-type") || "";
  try {
    return await new Response(bytes, {
      headers: {
        "Content-Type": contentType,
      },
    }).formData();
  } catch {
    throw httpError(400, "invalid multipart form body");
  }
}

export function isMultipartRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.toLowerCase().startsWith("multipart/form-data");
}

async function readRequestBytes(request, maxBytes) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > maxBytes) {
    throw httpError(413, "request body is too large");
  }
  if (!request.body || typeof request.body.getReader !== "function") {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw httpError(413, "request body is too large");
    }
    return bytes;
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw httpError(413, "request body is too large");
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

export async function safeJson(resp) {
  const text = await resp.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

export function withCors(resp) {
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

export function json(data, status = 200) {
  return withCors(new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  }));
}
