import {
  ACTION_CREATE_CONTAINER,
  ACTION_HEALTH_CHECK,
  ACTION_UPGRADE_CONTAINER,
} from "../constants.js";
import { resolveNotificationConfig, resolveOnePanelConfig } from "../config/onepanel.js";
import { httpError } from "../lib/errors.js";
import { asObject, firstNonEmpty } from "../lib/object.js";
import {
  buildActionPreviewCardMessage,
  buildActionFailureCardMessage,
  buildActionSuccessCardMessage,
  buildHealthCheckFailureCardMessage,
} from "../notifications/card-message.js";
import { sendCardNotification, updateCardNotification } from "../notifications/feishu.js";
import { runCreateContainer } from "./create-container.js";
import { runHealthCheck } from "./health-check.js";
import { runUpgradeContainer } from "./upgrade-container.js";

export const actionHandlers = {
  runCreateContainer,
  runHealthCheck,
  runUpgradeContainer,
};

export async function runAction(action, payload, env, options = {}) {
  const notifyOnSuccess = payload.notifyOnSuccess === undefined ? action !== ACTION_HEALTH_CHECK : Boolean(payload.notifyOnSuccess);
  const notifyOnFailure = payload.notifyOnFailure === undefined ? true : Boolean(payload.notifyOnFailure);
  const notificationConfig = resolveNotificationConfig(payload, action, env);
  const onepanel = resolveOnePanelConfig(payload, action, env);
  const context = {
    appName: notificationConfig.appName,
    baseUrl: onepanel.baseURL,
    containerName: firstNonEmpty(payload.containerName, payload.name, asObject(env.onepanel).defaultContainerName, env.DEFAULT_CONTAINER_NAME),
    card: notificationConfig.card,
  };
  const shouldUsePreviewUpdateFlow = notificationConfig.enabled && isPreviewUpdateAction(action);
  let previewNotification = null;

  try {
    if (shouldUsePreviewUpdateFlow) {
      const previewMessage = buildActionPreviewCardMessage(action, payload, context);
      previewNotification = await sendCardNotification(notificationConfig, previewMessage, env);
    }
    const result = await dispatchAction(action, payload, env, options);
    if (notificationConfig.enabled && shouldNotifyFailureResult(action, result, notifyOnFailure)) {
      const message = buildHealthCheckFailureCardMessage(result, context);
      result.notification = await sendCardNotification(notificationConfig, message, env);
      return result;
    }
    if (notificationConfig.enabled && shouldNotifySuccess(action, result, notifyOnSuccess)) {
      const message = buildActionSuccessCardMessage(action, result, context);
      result.notification = previewNotification && previewNotification.sent && previewNotification.messageId
        ? await updateCardNotification(notificationConfig, previewNotification.messageId, message, env)
        : await sendCardNotification(notificationConfig, message, env);
      if (previewNotification) {
        result.previewNotification = previewNotification;
      }
    }
    return result;
  } catch (error) {
    if (notificationConfig.enabled && notifyOnFailure) {
      const message = buildActionFailureCardMessage(action, error, context);
      error.notification = previewNotification && previewNotification.sent && previewNotification.messageId
        ? await updateCardNotification(notificationConfig, previewNotification.messageId, message, env)
        : await sendCardNotification(notificationConfig, message, env);
      if (previewNotification) {
        error.previewNotification = previewNotification;
      }
    }
    throw error;
  }
}

export async function runScheduledHealthCheck(env, controller) {
  try {
    const result = await runAction(ACTION_HEALTH_CHECK, {
      notifyOnSuccess: false,
      notifyOnFailure: true,
    }, env, {
      allowMissingContainerName: true,
      scheduledTime: controller && controller.scheduledTime ? controller.scheduledTime : Date.now(),
    });
    if (result.skipped) {
      console.log(`[scheduled] health-check skipped. reason=${result.reason}`);
      return;
    }
    if (!result.healthy) {
      console.error(`[scheduled] health-check unhealthy. message=${result.message}`);
      return;
    }
    if (Array.isArray(result.containers) && result.containers.length > 0) {
      const summary = result.containers
        .map((item) => `${item.containerName}:${item.healthy ? "healthy" : "unhealthy"}`)
        .join(", ");
      console.log(`[scheduled] health-check healthy. containers=${summary}`);
      return;
    }
    console.log(`[scheduled] health-check healthy. container=${result.containerName} state=${result.container && result.container.state ? result.container.state : "unknown"}`);
  } catch (error) {
    console.error(`[scheduled] health-check failed. ${error && error.stack ? error.stack : String(error)}`);
  }
}

async function dispatchAction(action, payload, env, options = {}) {
  switch (action) {
    case ACTION_UPGRADE_CONTAINER:
      return await runUpgradeContainer(payload, env, actionHandlers);
    case ACTION_CREATE_CONTAINER:
      return await runCreateContainer(payload, env, actionHandlers);
    case ACTION_HEALTH_CHECK:
      return await runHealthCheck(payload, env, {
        allowMissingContainerName: options.allowMissingContainerName === true,
        scheduledTime: options.scheduledTime,
      });
    default:
      throw httpError(400, `unsupported action: ${action}`);
  }
}

function shouldNotifySuccess(action, result, notifyOnSuccess) {
  if (!notifyOnSuccess) {
    return false;
  }
  if (action === ACTION_HEALTH_CHECK) {
    return Boolean(result && result.healthy);
  }
  return true;
}

function shouldNotifyFailureResult(action, result, notifyOnFailure) {
  if (!notifyOnFailure) {
    return false;
  }
  if (action !== ACTION_HEALTH_CHECK) {
    return false;
  }
  return Boolean(result && result.healthy === false && result.skipped !== true);
}

function isPreviewUpdateAction(action) {
  return action === ACTION_UPGRADE_CONTAINER || action === ACTION_CREATE_CONTAINER;
}
