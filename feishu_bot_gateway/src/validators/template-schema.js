import { httpError } from "../lib/errors.js";
import { parseTemplateCardContent } from "../services/card-content.js";

const STRONG_BOOLEAN_FIELDS = new Set([
  "disabled",
  "preview",
  "transparent",
]);

export function validateTemplateSchemaVariables(payload, env) {
  const schemaContext = resolveTemplateSchemaContext(payload, env);
  if (!schemaContext) {
    return;
  }
  const { templateId, schema } = schemaContext;
  const requirements = extractStrongVariableRequirements(schema);
  if (requirements.size === 0) {
    return;
  }

  const templateVariable = resolveTemplateVariable(payload);
  for (const requirement of requirements.values()) {
    validateRequirement(templateId, templateVariable, requirement);
  }
}

export function fillMissingTemplateSchemaImages(payload, env) {
  const schemaContext = resolveTemplateSchemaContext(payload, env);
  if (!schemaContext) {
    return payload;
  }
  const imageVariables = extractImageVariables(schemaContext.schema);
  if (imageVariables.length === 0) {
    return payload;
  }

  const templateVariable = resolveTemplateVariable(payload);
  const images = Array.isArray(payload.images) ? [...payload.images] : [];
  const imageVariablesInRequest = new Set(
    images
      .map((image) => image && typeof image.variable === "string" ? image.variable.trim() : "")
      .filter(Boolean),
  );

  let changed = false;
  for (const variable of imageVariables) {
    if (hasTemplateVariable(templateVariable, variable) || imageVariablesInRequest.has(variable)) {
      continue;
    }
    images.push({ variable });
    imageVariablesInRequest.add(variable);
    changed = true;
  }
  if (!changed) {
    return payload;
  }
  return {
    ...payload,
    images,
  };
}

export function templateSchemaEnvNames(templateId) {
  const normalized = normalizeTemplateIdForEnv(templateId);
  if (!normalized) {
    return [];
  }
  const exact = `CARD_TEMPLATE_SCHEMA_${normalized}`;
  const upper = `CARD_TEMPLATE_SCHEMA_${normalized.toUpperCase()}`;
  return exact === upper ? [exact] : [exact, upper];
}

function resolveTemplateSchemaContext(payload, env) {
  const templateId = resolveTemplateId(payload);
  if (!templateId) {
    return undefined;
  }
  const schemaConfig = readTemplateSchemaConfig(templateId, env);
  if (!schemaConfig) {
    return undefined;
  }
  return {
    templateId,
    schema: parseTemplateSchema(schemaConfig.value, schemaConfig.envName),
  };
}

function readTemplateSchemaConfig(templateId, env) {
  if (!env) {
    return undefined;
  }
  for (const envName of templateSchemaEnvNames(templateId)) {
    const value = env[envName];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    return {
      envName,
      value,
    };
  }
  return undefined;
}

function parseTemplateSchema(value, envName) {
  if (typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") {
    throw httpError(500, `${envName} must be a JSON string`);
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw httpError(500, `${envName} must be valid JSON: ${error.message}`);
  }
}

function resolveTemplateId(payload) {
  if (payload.content) {
    return parseTemplateCardContent(payload.content).data.template_id;
  }
  return payload.templateId;
}

function resolveTemplateVariable(payload) {
  if (payload.content) {
    const content = parseTemplateCardContent(payload.content);
    return content.data.template_variable || {};
  }
  return payload.templateVariable || {};
}

function extractImageVariables(schema) {
  return [...extractStrongVariableRequirements(schema).values()]
    .filter((requirement) => requirement.type === "image")
    .map((requirement) => requirement.variable);
}

function extractStrongVariableRequirements(schema) {
  const requirements = new Map();
  walkSchema(schema, [], (node, key, value, ancestors) => {
    const variable = parseVariablePlaceholder(value);
    if (!variable) {
      return;
    }
    const requirement = inferRequirement(node, key, ancestors);
    if (!requirement) {
      return;
    }
    addRequirement(requirements, {
      variable,
      ...requirement,
    });
  });
  return requirements;
}

function walkSchema(value, ancestors, visit) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkSchema(item, ancestors, visit);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const nextAncestors = [...ancestors, value];
  for (const [key, child] of Object.entries(value)) {
    visit(value, key, child, ancestors);
    walkSchema(child, nextAncestors, visit);
  }
}

function inferRequirement(node, key, ancestors) {
  if (key === "img_key") {
    return {
      type: "image",
      source: "img_key",
    };
  }
  if (STRONG_BOOLEAN_FIELDS.has(key)) {
    return {
      type: "boolean",
      source: key,
    };
  }
  if (key === "value" && isCallbackBehavior(node, ancestors)) {
    return {
      type: "object",
      source: "callback.value",
    };
  }
  return undefined;
}

function addRequirement(requirements, requirement) {
  const existing = requirements.get(requirement.variable);
  if (!existing || priority(requirement.type) > priority(existing.type)) {
    requirements.set(requirement.variable, requirement);
  }
}

function priority(type) {
  return {
    image: 3,
    object: 2,
    boolean: 1,
  }[type] || 0;
}

function isCallbackBehavior(node, ancestors) {
  return (node && node.type === "callback") ||
    ancestors.some((ancestor) => ancestor && ancestor.type === "callback");
}

function parseVariablePlaceholder(value) {
  if (typeof value !== "string") {
    return "";
  }
  const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value.trim());
  return match ? match[1] : "";
}

function validateRequirement(templateId, templateVariable, requirement) {
  const value = templateVariable[requirement.variable];
  if (value === undefined || value === null) {
    throw httpError(
      400,
      `template ${templateId} requires ${requirement.type} variable ${requirement.variable}`,
    );
  }
  if (requirement.type === "image") {
    validateImageVariable(templateId, requirement.variable, value);
    return;
  }
  if (requirement.type === "boolean" && typeof value !== "boolean") {
    throw httpError(
      400,
      `template ${templateId} variable ${requirement.variable} must be boolean`,
    );
    return;
  }
  if (requirement.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) {
    throw httpError(
      400,
      `template ${templateId} variable ${requirement.variable} must be object`,
    );
  }
}

function hasTemplateVariable(templateVariable, variable) {
  if (!templateVariable || typeof templateVariable !== "object" || Array.isArray(templateVariable)) {
    return false;
  }
  const value = templateVariable[variable];
  return value !== undefined && value !== null;
}

function validateImageVariable(templateId, variable, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(
      400,
      `template ${templateId} image variable ${variable} must be an object with img_key`,
    );
  }
  if (typeof value.img_key !== "string" || value.img_key.trim() === "") {
    throw httpError(
      400,
      `template ${templateId} image variable ${variable}.img_key is required`,
    );
  }
}

function normalizeTemplateIdForEnv(templateId) {
  return String(templateId || "").trim().replace(/[^A-Za-z0-9_]/g, "_");
}
