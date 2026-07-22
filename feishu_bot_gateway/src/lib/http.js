import { httpError } from "./errors.js";

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export async function readJson(request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > DEFAULT_MAX_BODY_BYTES) {
    throw httpError(413, "request body is too large");
  }
  try {
    return await request.json();
  } catch {
    throw httpError(400, "invalid JSON body");
  }
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
