import { ACTION_CREATE_CONTAINER, ACTION_HEALTH_CHECK, ACTION_UPGRADE_CONTAINER } from "../constants.js";
import { stringifyForError, trimString } from "../lib/object.js";

export function newOnePanelCardMessage({
  appName,
  action,
  title,
  subTitle,
  content,
  foot,
  mainButtonText,
  mainButtonDisabled,
  subButtonText,
  subButtonDisabled,
  successContent,
  failureInfo,
  status,
  containerName,
  image,
  targetImage,
  currentImage,
  baseUrl,
  repoSync,
  detail,
}) {
  const normalizedStatus = trimString(status) || (failureInfo ? "failed" : "success");
  const normalizedTitle = trimString(title) || buildDefaultTitle(action, normalizedStatus, containerName);
  return {
    appName: trimString(appName) || "1PanelWorker",
    title: normalizedTitle,
    subTitle: trimString(subTitle),
    content: stringifyMessage(content),
    foot: stringifyMessage(foot),
    mainButtonText: trimString(mainButtonText),
    mainButtonDisabled: Boolean(mainButtonDisabled),
    subButtonText: trimString(subButtonText),
    subButtonDisabled: Boolean(subButtonDisabled),
    status: normalizedStatus,
    action: trimString(action),
    containerName: trimString(containerName),
    image: trimString(image),
    currentImage: trimString(currentImage),
    targetImage: trimString(targetImage),
    successContent: stringifyMessage(successContent),
    failureInfo: stringifyMessage(failureInfo),
    baseUrl: trimString(baseUrl),
    repoSync: repoSync || null,
    detail: detail || null,
    timestamp: new Date().toISOString(),
  };
}

export function buildActionSuccessCardMessage(action, result, context) {
  if (action === ACTION_UPGRADE_CONTAINER) {
    if (result.mode === "created" && result.createResult) {
      const content = buildStructuredContent([
        ["动作", "升级时自动创建"],
        ["容器", result.containerName],
        ["镜像", result.createResult.image],
        ["自动补建", yesNoZh(result.createIfMissing)],
        ["1Panel 地址", context.baseUrl],
      ]);
      return newOnePanelCardMessage({
        appName: context.appName,
        action,
        status: "success",
        title: `🟢 升级兜底已创建容器`,
        subTitle: `容器 ${result.containerName} 不存在，已自动创建`,
        containerName: result.containerName,
        image: result.createResult.image,
        baseUrl: context.baseUrl,
        repoSync: result.createResult.repoSync,
        content,
        foot: context.card.successFoot,
        mainButtonText: context.card.mainButtonText,
        mainButtonDisabled: context.card.mainButtonDisabled,
        subButtonText: context.card.subButtonText,
        subButtonDisabled: context.card.subButtonDisabled,
        successContent: `容器 **${result.containerName}** 原本不存在，已按配置创建，镜像为 **${result.createResult.image}**。`,
        detail: {
          mode: result.mode,
          createIfMissing: result.createIfMissing,
          createResult: result.createResult,
        },
      });
    }
    const content = buildStructuredContent([
      ["动作", "升级容器"],
      ["容器", result.containerName],
      ["当前镜像", result.currentImage],
      ["目标镜像", result.targetImage],
      ["强制拉取", yesNoZh(result.forcePull)],
      ["仓库同步", summarizeRepoSync(result.repoSync)],
      ["1Panel 地址", context.baseUrl],
    ]);
    return newOnePanelCardMessage({
      appName: context.appName,
      action,
      status: "success",
      title: `🟢 容器升级成功`,
      subTitle: `容器 ${result.containerName} 已完成镜像升级`,
      containerName: result.containerName,
      currentImage: result.currentImage,
      targetImage: result.targetImage,
      baseUrl: context.baseUrl,
      repoSync: result.repoSync,
      content,
      foot: context.card.successFoot,
      mainButtonText: context.card.mainButtonText,
      mainButtonDisabled: context.card.mainButtonDisabled,
      subButtonText: context.card.subButtonText,
      subButtonDisabled: context.card.subButtonDisabled,
      successContent: `容器 **${result.containerName}** 已升级到 **${result.targetImage}**。`,
      detail: {
        mode: result.mode,
        forcePull: result.forcePull,
      },
    });
  }

  if (action === ACTION_CREATE_CONTAINER) {
    const content = buildStructuredContent([
      ["动作", "创建容器"],
      ["容器", result.containerName],
      ["镜像", result.image],
      ["强制拉取", yesNoZh(result.forcePull)],
      ["仓库同步", summarizeRepoSync(result.repoSync)],
      ["1Panel 地址", context.baseUrl],
    ]);
    return newOnePanelCardMessage({
      appName: context.appName,
      action,
      status: "success",
      title: `🟢 容器创建成功`,
      subTitle: `容器 ${result.containerName} 已创建完成`,
      containerName: result.containerName,
      image: result.image,
      baseUrl: context.baseUrl,
      repoSync: result.repoSync,
      content,
      foot: context.card.successFoot,
      mainButtonText: context.card.mainButtonText,
      mainButtonDisabled: context.card.mainButtonDisabled,
      subButtonText: context.card.subButtonText,
      subButtonDisabled: context.card.subButtonDisabled,
      successContent: `容器 **${result.containerName}** 已创建，使用镜像 **${result.image}**。`,
      detail: {
        created: result.created,
        forcePull: result.forcePull,
      },
    });
  }

  if (action === ACTION_HEALTH_CHECK) {
    return buildHealthCheckCardMessage(result, context);
  }

  return newOnePanelCardMessage({
    appName: context.appName,
    action,
    status: "success",
    title: `🟢 操作执行成功`,
    subTitle: `动作 ${action} 已完成`,
    baseUrl: context.baseUrl,
    content: buildStructuredContent([
      ["动作", action],
      ["1Panel 地址", context.baseUrl || "-"],
    ]),
    foot: context.card.successFoot,
    mainButtonText: context.card.mainButtonText,
    mainButtonDisabled: context.card.mainButtonDisabled,
    subButtonText: context.card.subButtonText,
    subButtonDisabled: context.card.subButtonDisabled,
    successContent: stringifyForError(result),
    detail: result,
  });
}

export function buildActionPreviewCardMessage(action, payload, context) {
  if (action === ACTION_UPGRADE_CONTAINER) {
    const containerName = payload.containerName || context.containerName || "-";
    const targetImage = payload.image || "沿用当前镜像";
    return newOnePanelCardMessage({
      appName: context.appName,
      action,
      status: "running",
      title: "🟡 容器升级开始",
      subTitle: `准备升级容器 ${containerName}`,
      containerName,
      targetImage,
      baseUrl: context.baseUrl,
      content: buildStructuredContent([
        ["动作", "升级容器"],
        ["容器", containerName],
        ["目标镜像", targetImage],
        ["1Panel 地址", context.baseUrl || "-"],
      ]),
      foot: "⏳ **执行中**\n任务已开始，卡片结果将自动更新。",
      mainButtonText: context.card.mainButtonText,
      mainButtonDisabled: true,
      subButtonText: context.card.subButtonText,
      subButtonDisabled: context.card.subButtonDisabled,
      detail: {
        phase: "preview",
      },
    });
  }

  if (action === ACTION_CREATE_CONTAINER) {
    const config = payload.containerConfig || payload.dockerConfig || payload;
    const containerName = config.name || payload.containerName || context.containerName || "-";
    const image = config.image || payload.image || "-";
    return newOnePanelCardMessage({
      appName: context.appName,
      action,
      status: "running",
      title: "🟡 容器创建开始",
      subTitle: `准备创建容器 ${containerName}`,
      containerName,
      image,
      baseUrl: context.baseUrl,
      content: buildStructuredContent([
        ["动作", "创建容器"],
        ["容器", containerName],
        ["镜像", image],
        ["1Panel 地址", context.baseUrl || "-"],
      ]),
      foot: "⏳ **执行中**\n任务已开始，卡片结果将自动更新。",
      mainButtonText: context.card.mainButtonText,
      mainButtonDisabled: true,
      subButtonText: context.card.subButtonText,
      subButtonDisabled: context.card.subButtonDisabled,
      detail: {
        phase: "preview",
      },
    });
  }

  return newOnePanelCardMessage({
    appName: context.appName,
    action,
    status: "running",
    title: "🟡 操作开始",
    subTitle: `动作 ${action} 已开始执行`,
    baseUrl: context.baseUrl,
    content: buildStructuredContent([
      ["动作", action],
      ["1Panel 地址", context.baseUrl || "-"],
    ]),
    foot: "⏳ **执行中**\n任务已开始，卡片结果将自动更新。",
    mainButtonText: context.card.mainButtonText,
    mainButtonDisabled: true,
    subButtonText: context.card.subButtonText,
    subButtonDisabled: context.card.subButtonDisabled,
    detail: {
      phase: "preview",
    },
  });
}

export function buildActionFailureCardMessage(action, error, context) {
  const failureMessage = error && error.message ? error.message : String(error);
  const content = buildStructuredContent([
    ["动作", action],
    ["容器", context.containerName || "-"],
    ["1Panel 地址", context.baseUrl || "-"],
    ["状态码", error && error.status ? String(error.status) : "-"],
    ["失败摘要", truncateText(failureMessage, 180)],
  ]) + `\n\n**完整错误**\n\`\`\`text\n${failureMessage}\n\`\`\``;
  return newOnePanelCardMessage({
    appName: context.appName,
    action,
    status: "failed",
    title: `🔴 操作执行失败`,
    subTitle: `动作 ${action} 执行失败`,
    content,
    foot: context.card.failureFoot,
    mainButtonText: context.card.mainButtonText,
    mainButtonDisabled: context.card.mainButtonDisabled,
    subButtonText: context.card.subButtonText,
    subButtonDisabled: context.card.subButtonDisabled,
    containerName: context.containerName,
    baseUrl: context.baseUrl,
    failureInfo: failureMessage,
    detail: {
      status: error && error.status ? error.status : undefined,
      message: failureMessage,
    },
  });
}

export function buildHealthCheckCardMessage(result, context) {
  const container = result.container || {};
  const summary = buildHealthCheckSummary(result);
  const content = Array.isArray(result.containers) && result.containers.length > 0
    ? buildGroupedHealthCheckContent(result, context)
    : buildStructuredContent([
      ["动作", "健康检查"],
      ["容器", result.containerName || context.containerName || "-"],
      ["状态", normalizeContainerState(container.state || "-")],
      ["镜像", container.imageName || "-"],
      ["运行时长", container.runTime || "-"],
      ["1Panel 地址", context.baseUrl || "-"],
    ]);
  return newOnePanelCardMessage({
    appName: context.appName,
    action: ACTION_HEALTH_CHECK,
    status: result.healthy ? "success" : "failed",
    title: result.healthy
      ? `🟢 健康检查通过`
      : `🔴 健康检查异常`,
    subTitle: result.healthy
      ? buildHealthCheckSuccessSubtitle(result, context)
      : buildHealthCheckFailureSubtitle(result, context),
    content,
    foot: result.healthy ? context.card.successFoot : context.card.failureFoot,
    mainButtonText: context.card.mainButtonText,
    mainButtonDisabled: context.card.mainButtonDisabled,
    subButtonText: context.card.subButtonText,
    subButtonDisabled: context.card.subButtonDisabled,
    containerName: result.containerName || container.name || context.containerName,
    image: container.imageName,
    baseUrl: context.baseUrl,
    successContent: result.healthy
      ? summary.successContent
      : "",
    failureInfo: result.healthy ? "" : summary.failureInfo,
    detail: {
      stage: result.stage,
      state: container.state,
      runTime: container.runTime,
      ports: container.ports,
      network: container.network,
      total: result.total,
      healthyCount: result.healthyCount,
      unhealthyCount: result.unhealthyCount,
      containers: result.containers,
    },
  });
}

export function buildHealthCheckFailureCardMessage(result, context) {
  return buildHealthCheckCardMessage({
    ...result,
    healthy: false,
  }, context);
}

export function toFeishuTemplateVariable(message) {
  return {
    app_name: message.appName,
    appName: message.appName,
    title: message.title,
    sub_title: message.subTitle,
    subTitle: message.subTitle,
    content: message.content,
    foot: message.foot,
    main_button_text: message.mainButtonText,
    mainButtonText: message.mainButtonText,
    main_button: message.mainButtonDisabled,
    mainButton: message.mainButtonDisabled,
    sub_button_text: message.subButtonText,
    subButtonText: message.subButtonText,
    sub_button: message.subButtonDisabled,
    subButton: message.subButtonDisabled,
    status: message.status,
    action: message.action,
    container_name: message.containerName,
    containerName: message.containerName,
    image: message.image,
    current_image: message.currentImage,
    currentImage: message.currentImage,
    target_image: message.targetImage,
    targetImage: message.targetImage,
    success_content: message.successContent,
    successContent: message.successContent,
    failure_info: message.failureInfo,
    failureInfo: message.failureInfo,
    base_url: message.baseUrl,
    baseUrl: message.baseUrl,
    timestamp: message.timestamp,
    detail: JSON.stringify(message.detail || {}),
    repo_sync: JSON.stringify(message.repoSync || {}),
    repoSync: JSON.stringify(message.repoSync || {}),
  };
}

function buildDefaultTitle(action, status, containerName) {
  const actionText = trimString(action) || "操作";
  const containerText = trimString(containerName);
  const suffix = containerText ? `: ${containerText}` : "";
  return `${status === "success" ? "🟢" : "🔴"} ${actionText}${suffix}`;
}

function stringifyMessage(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return stringifyForError(value);
}

function buildHealthCheckSummary(result) {
  if (Array.isArray(result.containers) && result.containers.length > 0) {
    const healthyItems = result.containers.filter((item) => item.healthy);
    const unhealthyItems = result.containers.filter((item) => item.healthy === false);
    return {
      successContent: `本次共检查 **${result.containers.length}** 个容器，全部健康。`,
      failureInfo: unhealthyItems.length > 0
        ? `发现 **${unhealthyItems.length}/${result.containers.length}** 个容器异常：${unhealthyItems.map((item) => item.containerName).filter(Boolean).join("、")}`
        : result.message || "",
    };
  }
  return {
    successContent: `容器 **${result.containerName}** 当前运行正常。`,
    failureInfo: result.message || "",
  };
}

function buildStructuredContent(lines) {
  return lines
    .filter((item) => Array.isArray(item) && trimString(item[0]) && item[1] !== undefined && item[1] !== null && `${item[1]}` !== "")
    .map(([label, value]) => `- **${label}**：${value}`)
    .join("\n");
}

function buildGroupedHealthCheckContent(result, context) {
  const healthyItems = result.containers.filter((item) => item.healthy);
  const unhealthyItems = result.containers.filter((item) => item.healthy === false);

  const sections = [];

  sections.push("**检查概览**");
  sections.push(buildStructuredContent([
    ["动作", "健康检查"],
    ["检查容器数", String(result.total || result.containers.length)],
    ["健康数量", String(result.healthyCount || healthyItems.length)],
    ["异常数量", String(result.unhealthyCount || unhealthyItems.length)],
    ["1Panel 地址", context.baseUrl || "-"],
  ]));

  if (unhealthyItems.length > 0) {
    sections.push("");
    sections.push("**异常容器**");
    sections.push(
      unhealthyItems
        .map((item) => {
          const container = item.container || {};
          const lines = [
            `- 🔴 **${item.containerName || "未知容器"}**`,
          ];
          if (container.imageName) {
            lines.push(`  - 镜像：${container.imageName}`);
          }
          if (container.state) {
            lines.push(`  - 状态：${normalizeContainerState(container.state)}`);
          }
          if (item.message) {
            lines.push(`  - 原因：${item.message}`);
          }
          return lines.join("\n");
        })
        .join("\n"),
    );
  }

  if (healthyItems.length > 0) {
    sections.push("");
    sections.push("**正常容器**");
    sections.push(
      healthyItems
        .map((item) => {
          const container = item.container || {};
          const runTime = container.runTime ? `（${container.runTime}）` : "";
          return `- 🟢 **${item.containerName || "未知容器"}**${runTime}`;
        })
        .join("\n"),
    );
  }

  return sections.filter(Boolean).join("\n");
}

function yesNoZh(value) {
  return value ? "是" : "否";
}

function summarizeRepoSync(repoSync) {
  if (!repoSync) {
    return "—";
  }
  if (repoSync.skipped) {
    return `已跳过（${translateRepoSkipReason(repoSync.reason)}）`;
  }
  return `仓库=${repoSync.repoName || "—"}，状态=${translateRepoStatus(repoSync.status)}，已更新=${yesNoZh(repoSync.updated)}`;
}

function normalizeContainerState(state) {
  const normalized = trimString(state).toLowerCase();
  if (normalized === "running") {
    return "🟢 running";
  }
  if (!normalized) {
    return "—";
  }
  return `🔴 ${normalized}`;
}

function buildHealthCheckSuccessSubtitle(result, context) {
  if (Array.isArray(result.containers) && result.containers.length > 1) {
    return `已检查 ${result.containers.length} 个容器，全部健康`;
  }
  return `容器 ${result.containerName || context.containerName} 运行正常`;
}

function buildHealthCheckFailureSubtitle(result, context) {
  if (Array.isArray(result.containers) && result.containers.length > 1) {
    return `共 ${result.total || result.containers.length} 个容器，异常 ${result.unhealthyCount || 0} 个`;
  }
  return `容器 ${result.containerName || context.containerName} 存在异常`;
}

function translateRepoStatus(status) {
  const normalized = trimString(status).toLowerCase();
  if (normalized === "success") {
    return "成功";
  }
  return status || "未知";
}

function translateRepoSkipReason(reason) {
  const normalized = trimString(reason).toLowerCase();
  if (normalized === "docker.io does not require repo sync") {
    return "docker.io 无需同步";
  }
  return reason || "无需同步";
}

function truncateText(text, maxLength) {
  const value = trimString(text);
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}
