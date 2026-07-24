import assert from "node:assert/strict";
import test from "node:test";

import { requireAuth } from "../src/lib/request-auth.js";


function requestWithToken(token) {
  return new Request("https://worker.example.test/health-check", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test("requireAuth prefers API_AUTH_TOKEN over legacy apiToken", () => {
  const env = {
    API_AUTH_TOKEN: "cloudflare-secret",
    apiToken: "legacy-local-token",
  };

  assert.doesNotThrow(() => requireAuth(requestWithToken("cloudflare-secret"), env));
  assert.throws(
    () => requireAuth(requestWithToken("legacy-local-token"), env),
    (error) => error.status === 401 && error.message === "unauthorized",
  );
});

test("requireAuth supports local apiToken fallback", () => {
  const env = { apiToken: "local-token" };

  assert.doesNotThrow(() => requireAuth(requestWithToken("local-token"), env));
});

test("requireAuth rejects incorrect or missing authorization", () => {
  const env = { API_AUTH_TOKEN: "expected-token" };

  for (const token of ["incorrect-token", ""]) {
    assert.throws(
      () => requireAuth(requestWithToken(token), env),
      (error) => error.status === 401 && error.message === "unauthorized",
    );
  }
});

test("requireAuth rejects missing server configuration", () => {
  for (const env of [{}, undefined]) {
    assert.throws(
      () => requireAuth(requestWithToken("token"), env),
      (error) =>
        error.status === 500 &&
        error.message === "API_AUTH_TOKEN is not configured",
    );
  }
});
