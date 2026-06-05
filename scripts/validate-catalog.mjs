import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRootDir = path.resolve(__dirname, "..");
const bannedCoreMarkers = [
  "quarkus",
  "spring",
  "jakarta",
  "javax",
  "hibernate",
  "aspnet",
  "entityframework",
  "angular",
  "react",
  "vue",
  "fastapi",
  "django",
  "archunit",
  "eslint",
  "sonar",
  "roslyn"
];

export async function loadYaml(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return YAML.parse(content);
}

async function loadJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function formatAjvErrors(filePath, errors = []) {
  return errors.map((error) => {
    const location = error.instancePath || "/";
    return `${filePath}: ${location} ${error.message}`;
  });
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function visitStrings(value, visitor) {
  if (typeof value === "string") {
    visitor(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      visitStrings(entry, visitor);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      visitStrings(nested, visitor);
    }
  }
}

function findForbiddenMarker(value) {
  const lower = value.toLowerCase();
  return bannedCoreMarkers.find((marker) => lower.includes(marker)) ?? null;
}

export async function validateCatalog(rootDir = defaultRootDir) {
  const ajv = createAjv();
  const catalogPath = path.join(rootDir, "catalog.yaml");
  const rulesetSchemaPath = path.join(rootDir, "schemas", "ruleset.schema.json");
  const localeSchemaPath = path.join(rootDir, "schemas", "ruleset-locale.schema.json");

  const [catalog, rulesetSchema, localeSchema] = await Promise.all([
    loadYaml(catalogPath),
    loadJson(rulesetSchemaPath),
    loadJson(localeSchemaPath)
  ]);

  const validateRuleset = ajv.compile(rulesetSchema);
  const validateLocale = ajv.compile(localeSchema);

  const errors = [];
  const seenRuleIds = new Map();
  const supportedLocales = new Set(ensureArray(catalog.supportedLocales));

  if (typeof catalog.documentationBaseUrl === "string" && catalog.documentationBaseUrl.includes("example.org")) {
    errors.push("catalog.yaml: documentationBaseUrl must not use example.org placeholder URLs.");
  }

  for (const ruleSetRef of ensureArray(catalog.ruleSets)) {
    const rulesetPath = path.join(rootDir, ruleSetRef.path);

    try {
      await fs.access(rulesetPath);
    } catch {
      errors.push(`catalog.yaml: referenced ruleset path does not exist: ${ruleSetRef.path}`);
      continue;
    }

    const ruleset = await loadYaml(rulesetPath);
    if (!validateRuleset(ruleset)) {
      errors.push(...formatAjvErrors(ruleSetRef.path, validateRuleset.errors));
    }

    if (ruleset.ruleSetId !== ruleSetRef.id) {
      errors.push(`${ruleSetRef.path}: ruleSetId '${ruleset.ruleSetId}' does not match catalog id '${ruleSetRef.id}'.`);
    }

    visitStrings(ruleset, (text) => {
      const marker = findForbiddenMarker(text);
      if (marker) {
        errors.push(`${ruleSetRef.path}: core catalog must not contain technology-specific marker '${marker}'.`);
      }
    });

    const ruleIds = new Set();
    for (const rule of ensureArray(ruleset.rules)) {
      if (rule.abstractionLevel === "technology-profile") {
        errors.push(`${ruleSetRef.path}: rule '${rule.id}' must not use abstractionLevel 'technology-profile' in the generic core catalog.`);
      }

      if (ruleIds.has(rule.id)) {
        errors.push(`${ruleSetRef.path}: duplicate rule id '${rule.id}' within the same ruleset.`);
      }

      if (seenRuleIds.has(rule.id)) {
        errors.push(`${ruleSetRef.path}: duplicate rule id '${rule.id}' also exists in '${seenRuleIds.get(rule.id)}'.`);
      } else {
        seenRuleIds.set(rule.id, ruleSetRef.path);
      }

      ruleIds.add(rule.id);
    }

    for (const approval of ensureArray(ruleset.approvals)) {
      if (typeof approval.reference === "string" && approval.reference.includes("example.org")) {
        errors.push(`${ruleSetRef.path}: approval reference for maintainer '${approval.maintainer}' must not use example.org.`);
      }
    }

    for (const relationshipOwner of ensureArray(ruleset.rules)) {
      for (const relationship of ensureArray(relationshipOwner.relationships)) {
        if (!ruleIds.has(relationship.target)) {
          errors.push(`${ruleSetRef.path}: relationship target '${relationship.target}' referenced by '${relationshipOwner.id}' does not exist in the same ruleset.`);
        }
      }
    }

    const availableLocales = new Set(ensureArray(ruleset.availableLocales));
    const catalogLocales = new Set(ensureArray(ruleSetRef.locales));

    for (const locale of availableLocales) {
      if (!supportedLocales.has(locale)) {
        errors.push(`${ruleSetRef.path}: available locale '${locale}' is not listed in catalog.supportedLocales.`);
      }
      if (!catalogLocales.has(locale)) {
        errors.push(`${ruleSetRef.path}: available locale '${locale}' is missing from catalog ruleSets entry.`);
      }
    }

    for (const locale of catalogLocales) {
      const localePath = path.join(rootDir, "rulesets", ruleSetRef.id, "i18n", `${locale}.yaml`);
      try {
        await fs.access(localePath);
      } catch {
        errors.push(`${ruleSetRef.path}: locale file is missing: rulesets/${ruleSetRef.id}/i18n/${locale}.yaml`);
        continue;
      }

      const localeDoc = await loadYaml(localePath);
      if (!validateLocale(localeDoc)) {
        errors.push(...formatAjvErrors(path.relative(rootDir, localePath), validateLocale.errors));
      }

      visitStrings(localeDoc, (text) => {
        const marker = findForbiddenMarker(text);
        if (marker) {
          errors.push(`${path.relative(rootDir, localePath)}: core catalog locale content must not contain technology-specific marker '${marker}'.`);
        }
      });

      if (localeDoc.ruleSetId !== ruleset.ruleSetId) {
        errors.push(`${path.relative(rootDir, localePath)}: ruleSetId '${localeDoc.ruleSetId}' does not match '${ruleset.ruleSetId}'.`);
      }

      const localeRuleIds = new Set(ensureArray(localeDoc.rules).map((rule) => rule.id));
      for (const ruleId of ruleIds) {
        if (!localeRuleIds.has(ruleId)) {
          errors.push(`${path.relative(rootDir, localePath)}: missing localized rule '${ruleId}'.`);
        }
      }

      for (const localizedRule of ensureArray(localeDoc.rules)) {
        if (!ruleIds.has(localizedRule.id)) {
          errors.push(`${path.relative(rootDir, localePath)}: localized rule '${localizedRule.id}' does not exist in ruleset metadata.`);
        }
        if (ensureArray(localizedRule.tags).length === 0) {
          errors.push(`${path.relative(rootDir, localePath)}: localized rule '${localizedRule.id}' must define at least one tag.`);
        }
        if (ensureArray(localizedRule.keywords).length === 0) {
          errors.push(`${path.relative(rootDir, localePath)}: localized rule '${localizedRule.id}' must define at least one keyword.`);
        }
        if (ensureArray(localizedRule.reviewQuestions).length === 0) {
          errors.push(`${path.relative(rootDir, localePath)}: localized rule '${localizedRule.id}' must define at least one review question.`);
        }
        if (ensureArray(localizedRule.exceptions).length === 0) {
          errors.push(`${path.relative(rootDir, localePath)}: localized rule '${localizedRule.id}' must define at least one documented exception.`);
        }
        if (ensureArray(localizedRule.remediation).length === 0) {
          errors.push(`${path.relative(rootDir, localePath)}: localized rule '${localizedRule.id}' must define at least one remediation hint.`);
        }
      }
    }
  }

  return errors;
}

async function runCli() {
  const errors = await validateCatalog();
  if (errors.length > 0) {
    console.error("Catalog validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Catalog validation passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
