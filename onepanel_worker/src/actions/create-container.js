import { ACTION_CREATE_CONTAINER } from "../constants.js";
import {
  getActionDefaults,
  resolveContainerConfig,
  resolveDockerRegistryConfig,
  resolveOnePanelConfig,
  toContainerCreateRequest,
  validateContainerCreateConfig,
} from "../config/onepanel.js";
import { httpError } from "../lib/errors.js";
import { OnePanelClient } from "../onepanel/client.js";
import { ensureImageRepoForImage } from "../onepanel/registry.js";

export async function runCreateContainer(payload, env) {
  const onepanel = resolveOnePanelConfig(payload, ACTION_CREATE_CONTAINER, env);
  const client = new OnePanelClient(onepanel);
  const defaults = getActionDefaults(ACTION_CREATE_CONTAINER, env);
  const dockerRegistryConfig = resolveDockerRegistryConfig(payload, defaults, env);
  const createConfig = resolveContainerConfig(payload, ACTION_CREATE_CONTAINER, env);

  validateContainerCreateConfig(createConfig);

  const existing = await client.findContainerByName(createConfig.name);
  if (existing) {
    throw httpError(409, `container already exists: ${createConfig.name}`);
  }

  const req = toContainerCreateRequest(createConfig);
  const repoSync = await ensureImageRepoForImage(client, req.image, dockerRegistryConfig);
  await client.createContainer(req);

  return {
    created: true,
    containerName: req.name,
    image: req.image,
    forcePull: req.forcePull,
    repoSync,
  };
}
