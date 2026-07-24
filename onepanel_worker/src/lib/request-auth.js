import { httpError } from "./errors.js";

export function requireAuth(request, env) {
  const token = env && (env.API_AUTH_TOKEN || env.apiToken);
  if (!token) {
    throw httpError(500, "API_AUTH_TOKEN is not configured");
  }
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${token}`;
  if (auth !== expected) {
    throw httpError(401, "unauthorized");
  }
}
