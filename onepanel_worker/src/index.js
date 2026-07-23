import {
  ACTION_CREATE_CONTAINER,
  ACTION_HEALTH_CHECK,
  ACTION_UPGRADE_CONTAINER,
} from "./constants.js";
import { runAction, runScheduledHealthCheck } from "./actions/index.js";
import { requiredString } from "./lib/errors.js";
import { json, readJson, withCors } from "./lib/http.js";
import { requireAuth } from "./lib/request-auth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          success: true,
          service: "onepanel-worker",
        });
      }

      if (request.method === "POST" && url.pathname === "/run") {
        requireAuth(request, env);
        const payload = await readJson(request);
        requiredString(payload.action, "action");
        const result = await runAction(payload.action, payload, env);
        return json({
          success: true,
          action: payload.action,
          data: result,
        });
      }

      if (request.method === "POST" && url.pathname === "/upgrade-container") {
        requireAuth(request, env);
        const payload = await readJson(request);
        const result = await runAction(ACTION_UPGRADE_CONTAINER, payload, env);
        return json({
          success: true,
          action: ACTION_UPGRADE_CONTAINER,
          data: result,
        });
      }

      if (request.method === "POST" && url.pathname === "/create-container") {
        requireAuth(request, env);
        const payload = await readJson(request);
        const result = await runAction(ACTION_CREATE_CONTAINER, payload, env);
        return json({
          success: true,
          action: ACTION_CREATE_CONTAINER,
          data: result,
        });
      }

      if (request.method === "POST" && url.pathname === "/health-check") {
        requireAuth(request, env);
        const payload = await readJson(request);
        const result = await runAction(ACTION_HEALTH_CHECK, payload, env);
        return json({
          success: true,
          action: ACTION_HEALTH_CHECK,
          data: result,
        });
      }

      return json({ success: false, error: "not found" }, 404);
    } catch (error) {
      const status = error && error.status ? error.status : 500;
      return json({
        success: false,
        error: error && error.message ? error.message : "internal server error",
      }, status);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledHealthCheck(env, controller));
  },
};
