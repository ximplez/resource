import { httpError } from "../lib/errors.js";
import {
  normalizeState,
  trimString,
} from "../lib/object.js";

export async function ensureImageRepoForImage(client, image, dockerRegistryConfig) {
  const registryHost = extractRegistryHost(image);
  if (!registryHost || registryHost === "docker.io") {
    return {
      skipped: true,
      registryHost: registryHost || "docker.io",
      reason: "docker.io does not require repo sync",
    };
  }

  const repos = await client.searchImageRepos();
  for (const repo of repos) {
    if (normalizeRegistryHost(repo.downloadUrl) !== registryHost) {
      continue;
    }
    return await ensureExistingImageRepoReady(client, repo, registryHost, dockerRegistryConfig);
  }

  if (!dockerRegistryConfig) {
    throw httpError(400, `image repo ${registryHost} not found in 1panel, and DOCKER_REGISTRY_JSON is missing`);
  }

  const entry = findDockerRegistryEntryByHost(dockerRegistryConfig, registryHost);
  if (!entry) {
    throw httpError(400, `image repo ${registryHost} not found in 1panel, and no matching registry found in DOCKER_REGISTRY_JSON`);
  }

  await client.createImageRepo({
    name: entry.key,
    downloadUrl: normalizeRegistryHost(entry.secret.registry),
    protocol: "https",
    username: entry.secret.username,
    password: entry.secret.password,
    auth: Boolean(entry.secret.username || entry.secret.password),
  });

  const refreshedRepos = await client.searchImageRepos();
  for (const repo of refreshedRepos) {
    if (normalizeRegistryHost(repo.downloadUrl) !== registryHost) {
      continue;
    }
    const ready = await ensureExistingImageRepoReady(client, repo, registryHost, dockerRegistryConfig);
    return {
      ...ready,
      created: true,
    };
  }

  throw httpError(502, `image repo ${registryHost} created but not found in follow-up search`);
}

async function ensureExistingImageRepoReady(client, repo, registryHost, dockerRegistryConfig) {
  await client.checkImageRepoStatus(repo.id);
  const refreshedRepo = await reloadImageRepo(client, repo.id);
  if (isImageRepoReady(refreshedRepo)) {
    return {
      registryHost,
      repoName: refreshedRepo.name || "",
      repoId: refreshedRepo.id,
      status: refreshedRepo.status || "",
      updated: false,
    };
  }

  if (!dockerRegistryConfig) {
    validateImageRepo(refreshedRepo, registryHost);
  }

  const entry = findDockerRegistryEntryByHost(dockerRegistryConfig, registryHost);
  if (!entry) {
    validateImageRepo(refreshedRepo, registryHost);
  }

  await client.updateImageRepo({
    id: refreshedRepo.id,
    downloadUrl: normalizeRegistryHost(entry.secret.registry),
    protocol: pickProtocol(refreshedRepo.protocol),
    username: entry.secret.username,
    password: entry.secret.password,
    auth: Boolean(entry.secret.username || entry.secret.password),
  });
  await client.checkImageRepoStatus(refreshedRepo.id);

  const updatedRepo = await reloadImageRepo(client, refreshedRepo.id);
  validateImageRepo(updatedRepo, registryHost);
  return {
    registryHost,
    repoName: updatedRepo.name || "",
    repoId: updatedRepo.id,
    status: updatedRepo.status || "",
    updated: true,
  };
}

function validateImageRepo(repo, registryHost) {
  if (isImageRepoReady(repo)) {
    return;
  }
  throw httpError(
    502,
    `image repo is not ready. registry=${registryHost} repo=${repo && repo.name ? repo.name : ""} status=${repo && repo.status ? repo.status : ""} message=${repo && repo.message ? repo.message : ""}`,
  );
}

function isImageRepoReady(repo) {
  return normalizeState(repo && repo.status) === "success";
}

async function reloadImageRepo(client, repoId) {
  const repos = await client.searchImageRepos();
  for (const item of repos) {
    if (item.id === repoId) {
      return item;
    }
  }
  throw httpError(502, `image repo id=${repoId} not found in follow-up search`);
}

export function normalizeDockerRegistryConfig(rawConfig) {
  const result = {};
  for (const [key, secret] of Object.entries(rawConfig)) {
    if (!secret || typeof secret !== "object") {
      continue;
    }
    const registry = trimString(secret.registry);
    if (!registry) {
      continue;
    }
    result[key] = {
      registry,
      username: trimString(secret.username),
      password: trimString(secret.password),
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

function findDockerRegistryEntryByHost(config, host) {
  if (!config || !host) {
    return null;
  }
  const normalized = normalizeRegistryHost(host);
  for (const [key, secret] of Object.entries(config)) {
    if (normalizeRegistryHost(secret.registry) === normalized) {
      return { key, secret };
    }
  }
  return null;
}

function extractRegistryHost(image) {
  const value = trimString(image);
  if (!value) {
    return "";
  }
  const parts = value.split("/");
  if (parts.length < 2) {
    return "docker.io";
  }
  const first = parts[0];
  if (first.includes(".") || first.includes(":") || first === "localhost") {
    return normalizeRegistryHost(first);
  }
  return "docker.io";
}

function normalizeRegistryHost(host) {
  let value = trimString(host);
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/+$/, "");
  return value;
}

function pickProtocol(protocol) {
  return trimString(protocol) || "https";
}
