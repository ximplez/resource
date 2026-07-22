import { httpError } from "../lib/errors.js";

export function requireAuth(request, env) {
  if (!env.API_AUTH_TOKEN) {
    throw httpError(500, "API_AUTH_TOKEN is not configured");
  }
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.API_AUTH_TOKEN}`;
  if (auth !== expected) {
    throw httpError(401, "unauthorized");
  }
}
