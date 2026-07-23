import { httpError } from "./errors.js";

export function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeState(value) {
  return trimString(value).toLowerCase();
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const text = trimString(value);
    if (text) {
      return text;
    }
  }
  return "";
}

export function toNumberOrUndefined(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function toBooleanOrUndefined(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return Boolean(value);
}

export function normalizeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const mapKey = trimString(key);
    const mapValue = trimString(item);
    if (mapKey) {
      result[mapKey] = mapValue;
    }
  }
  return result;
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function compactObject(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function parseMaybeJsonObject(raw, field, allowEmpty = false) {
  if (raw === undefined || raw === null || raw === "") {
    if (allowEmpty) {
      return {};
    }
    throw httpError(400, `${field} is required`);
  }
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw httpError(400, `${field} must be valid JSON`);
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw httpError(400, `${field} must be a JSON object`);
  }
  return raw;
}

export function stringifyForError(value) {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function mergeConfig(left, right) {
  const merged = {
    ...left,
    ...right,
  };
  merged.onepanel = {
    ...asObject(left.onepanel),
    ...asObject(right.onepanel),
  };
  merged.notification = {
    ...asObject(left.notification),
    ...asObject(right.notification),
  };
  if (right.containerConfig !== undefined) {
    merged.containerConfig = right.containerConfig;
  } else if (left.containerConfig !== undefined) {
    merged.containerConfig = left.containerConfig;
  }
  if (right.dockerConfig !== undefined) {
    merged.dockerConfig = right.dockerConfig;
  } else if (left.dockerConfig !== undefined) {
    merged.dockerConfig = left.dockerConfig;
  }
  if (right.dockerRegistryConfig !== undefined) {
    merged.dockerRegistryConfig = right.dockerRegistryConfig;
  } else if (left.dockerRegistryConfig !== undefined) {
    merged.dockerRegistryConfig = left.dockerRegistryConfig;
  }
  return merged;
}
