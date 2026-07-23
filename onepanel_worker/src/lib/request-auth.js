import { httpError } from "./errors.js";

export function requireAuth(request, env) {
  const token = env && env.apiToken ? env.apiToken : env.API_AUTH_TOKEN;
  if (!token) {
    throw httpError(500, "API_AUTH_TOKEN is not configured");
  }
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${token}`;
  if (auth !== expected) {
    throw httpError(401, "unauthorized");
  }
}
