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

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isStructuredStringListBinding(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.type === "stringList" &&
    typeof value.source === "string" &&
    value.source.length > 0 &&
    Number.isInteger(value.minItems) &&
    value.minItems > 0
  );
}

function hasNonEmptyIntersection(left, right) {
  const leftValues = ensureArray(left);
  const rightValues = ensureArray(right);
  if (leftValues.length === 0 || rightValues.length === 0) {
    return true;
  }

  const rightSet = new Set(rightValues);
  return leftValues.some((entry) => rightSet.has(entry));
}

function isTemplateCompatibleWithProfile(template, profileDoc) {
  const templateAppliesTo = ensureObject(template.appliesTo);
  if (Object.keys(templateAppliesTo).length === 0) {
    return true;
  }

  const profileAppliesTo = ensureObject(profileDoc.appliesTo);
  for (const dimension of ["languages", "frameworks", "architectureStyles", "runtimes"]) {
    const templateDimension = ensureArray(templateAppliesTo[dimension]);
    if (templateDimension.length === 0) {
      continue;
    }

    const profileDimension = ensureArray(profileAppliesTo[dimension]);
    if (!hasNonEmptyIntersection(templateDimension, profileDimension)) {
      return false;
    }
  }

  return true;
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
  const profileSchemaPath = path.join(rootDir, "schemas", "profile.schema.json");

  const [catalog, rulesetSchema, localeSchema, profileSchema] = await Promise.all([
    loadYaml(catalogPath),
    loadJson(rulesetSchemaPath),
    loadJson(localeSchemaPath),
    loadJson(profileSchemaPath)
  ]);

  const validateRuleset = ajv.compile(rulesetSchema);
  const validateLocale = ajv.compile(localeSchema);
  const validateProfile = ajv.compile(profileSchema);

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

    visitStrings(
      {
        ruleSetId: ruleset.ruleSetId,
        publisher: ruleset.publisher,
        license: ruleset.license,
        rules: ruleset.rules
      },
      (text) => {
      const marker = findForbiddenMarker(text);
      if (marker) {
        errors.push(`${ruleSetRef.path}: core catalog must not contain technology-specific marker '${marker}'.`);
      }
      }
    );

    const ruleIds = new Set();
    const templateIds = new Map();
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

    for (const template of ensureArray(ruleset.verificationTemplates)) {
      if (templateIds.has(template.templateId)) {
        errors.push(`${ruleSetRef.path}: duplicate verification template id '${template.templateId}'.`);
      } else {
        templateIds.set(template.templateId, template);
      }

      for (const ruleId of ensureArray(template.ruleIds)) {
        if (!ruleIds.has(ruleId)) {
          errors.push(
            `${ruleSetRef.path}: verification template '${template.templateId}' references unknown rule '${ruleId}'.`
          );
        }
      }

      const templatePath = path.join(rootDir, "rulesets", ruleSetRef.id, template.templateRef ?? "");
      try {
        await fs.access(templatePath);
      } catch {
        errors.push(
          `${ruleSetRef.path}: verification template '${template.templateId}' references missing template artifact '${template.templateRef}'.`
        );
      }
    }

    if (ruleset.status === "published") {
      if (ensureArray(ruleset.approvals).length === 0) {
        errors.push(`${ruleSetRef.path}: published rulesets require at least one approval.`);
      }

      for (const rule of ensureArray(ruleset.rules)) {
        if (rule.status === "draft") {
          errors.push(`${ruleSetRef.path}: published rulesets must not contain rules in status 'draft' (rule '${rule.id}').`);
        }
      }
    }

    const profilesDir = path.join(rootDir, "rulesets", ruleSetRef.id, "profiles");
    try {
      await fs.access(profilesDir);
      const technologyDirs = await fs.readdir(profilesDir, { withFileTypes: true });
      for (const technologyDir of technologyDirs) {
        if (!technologyDir.isDirectory()) {
          continue;
        }

        const profilePath = path.join(profilesDir, technologyDir.name, "profile.yaml");
        try {
          await fs.access(profilePath);
        } catch {
          errors.push(`${ruleSetRef.path}: missing profile.yaml under rulesets/${ruleSetRef.id}/profiles/${technologyDir.name}/.`);
          continue;
        }

        const profileDoc = await loadYaml(profilePath);
        const relativeProfilePath = path.relative(rootDir, profilePath);
        if (!validateProfile(profileDoc)) {
          errors.push(...formatAjvErrors(relativeProfilePath, validateProfile.errors));
        }

        if (profileDoc.ruleSetId !== ruleset.ruleSetId) {
          errors.push(`${relativeProfilePath}: ruleSetId '${profileDoc.ruleSetId}' does not match '${ruleset.ruleSetId}'.`);
        }

        if (profileDoc.profileId !== technologyDir.name) {
          errors.push(`${relativeProfilePath}: profileId '${profileDoc.profileId}' does not match enclosing technology directory '${technologyDir.name}'.`);
        }

        if (profileDoc.schemaVersion === "ruleset-profile-v2") {
          for (const mapping of ensureArray(profileDoc.ruleMappings)) {
            if (!ruleIds.has(mapping.ruleId)) {
              errors.push(`${relativeProfilePath}: mapping rule '${mapping.ruleId}' does not exist in ruleset '${ruleset.ruleSetId}'.`);
            }

            for (const templateSelection of ensureArray(mapping.verificationTemplates)) {
              const template = templateIds.get(templateSelection.templateId);
              if (!template) {
                errors.push(
                  `${relativeProfilePath}: mapping rule '${mapping.ruleId}' references unknown verification template '${templateSelection.templateId}'.`
                );
                continue;
              }

              if (!ensureArray(template.ruleIds).includes(mapping.ruleId)) {
                errors.push(
                  `${relativeProfilePath}: verification template '${templateSelection.templateId}' does not support rule '${mapping.ruleId}'.`
                );
              }

              if (!isTemplateCompatibleWithProfile(template, profileDoc)) {
                errors.push(
                  `${relativeProfilePath}: verification template '${templateSelection.templateId}' is not compatible with profile appliesTo.`
                );
              }

              const bindings = ensureObject(templateSelection.parameterBindings);
              for (const requiredParameter of ensureArray(template.requiredParameters)) {
                if (!(requiredParameter in bindings)) {
                  errors.push(
                    `${relativeProfilePath}: verification template '${templateSelection.templateId}' is missing required parameter binding '${requiredParameter}'.`
                  );
                  continue;
                }

                if (requiredParameter.endsWith("List") && !isStructuredStringListBinding(bindings[requiredParameter])) {
                  errors.push(
                    `${relativeProfilePath}: verification template '${templateSelection.templateId}' must bind list parameter '${requiredParameter}' as type 'stringList' with source and minItems.`
                  );
                }
              }
            }
          }
        } else {
          for (const mapping of ensureArray(profileDoc.mappings)) {
            if (!ruleIds.has(mapping.ruleId)) {
              errors.push(`${relativeProfilePath}: mapping rule '${mapping.ruleId}' does not exist in ruleset '${ruleset.ruleSetId}'.`);
            }
          }
        }
      }
    } catch {
      // Profiles are optional per ruleset.
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
