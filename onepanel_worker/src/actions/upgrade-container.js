import { ACTION_CREATE_CONTAINER, ACTION_UPGRADE_CONTAINER } from "../constants.js";
import { resolveContainerConfig, resolveDockerRegistryConfig, resolveOnePanelConfig, getActionDefaults } from "../config/onepanel.js";
import { requiredString, httpError } from "../lib/errors.js";
import { compactObject, firstNonEmpty, pickDefined } from "../lib/object.js";
import { OnePanelClient } from "../onepanel/client.js";
import { ensureImageRepoForImage } from "../onepanel/registry.js";

export async function runUpgradeContainer(payload, env, handlers) {
  const onepanel = resolveOnePanelConfig(payload, ACTION_UPGRADE_CONTAINER, env);
  const client = new OnePanelClient(onepanel);
  const defaults = getActionDefaults(ACTION_UPGRADE_CONTAINER, env);
  const dockerRegistryConfig = resolveDockerRegistryConfig(payload, defaults, env);
  const containerName = firstNonEmpty(
    payload.containerName,
    payload.name,
    defaults.containerName,
    env.DEFAULT_CONTAINER_NAME,
  );
  requiredString(containerName, "containerName");

  const createIfMissing = pickDefined(payload.createIfMissing, defaults.createIfMissing, false);
  const forcePull = pickDefined(payload.forcePull, defaults.forcePull, true);

  const container = await client.findContainerByName(containerName);
  if (!container) {
    if (createIfMissing) {
      if (!handlers || typeof handlers.runCreateContainer !== "function") {
        throw httpError(500, "runCreateContainer handler is not configured");
      }
      const createPayload = compactObject({
        ...payload,
        action: ACTION_CREATE_CONTAINER,
        containerConfig: resolveContainerConfig(payload, ACTION_UPGRADE_CONTAINER, env),
      });
      const createResult = await handlers.runCreateContainer(createPayload, env, handlers);
      return {
        mode: "created",
        containerName,
        createIfMissing: true,
        createResult,
      };
    }
    throw httpError(404, `container not found: ${containerName}`);
  }

  const targetImage = firstNonEmpty(payload.image, defaults.image, container.imageName);
  if (!targetImage) {
    throw httpError(400, `container current image is empty: ${containerName}`);
  }

  const repoSync = await ensureImageRepoForImage(client, targetImage, dockerRegistryConfig);
  await client.upgradeContainer(container.name, targetImage, forcePull);

  return {
    mode: "upgraded",
    containerName: container.name,
    currentImage: container.imageName || "",
    targetImage,
    forcePull,
    repoSync,
  };
}
