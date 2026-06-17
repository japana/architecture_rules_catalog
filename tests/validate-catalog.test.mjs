import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { validateCatalog } from "../scripts/validate-catalog.mjs";

const fixtureRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function copyDir(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function withCatalogFixture(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-seed-"));
  await copyDir(fixtureRoot, tempDir);
  try {
    await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("catalog fixture validates successfully", async () => {
  await withCatalogFixture(async (tempDir) => {
    const errors = await validateCatalog(tempDir);
    assert.deepEqual(errors, []);
  });
});

test("catalog includes developer and agentic architecture governance rulesets", async () => {
  await withCatalogFixture(async (tempDir) => {
    const catalog = await fs.readFile(path.join(tempDir, "catalog.yaml"), "utf8");

    for (const ruleSetId of [
      "modularity-and-dependency-governance",
      "architecture-decision-governance",
      "integration-and-messaging-architecture",
      "delivery-and-runtime-architecture",
      "performance-and-scalability-architecture",
      "agentic-system-architecture",
      "ai-context-and-knowledge-governance",
      "ai-evaluation-and-regression-governance"
    ]) {
      assert.match(catalog, new RegExp(`id: "${ruleSetId}"`, "u"));

      const rulesetPath = path.join(tempDir, "rulesets", ruleSetId, "ruleset.yaml");
      const ruleset = await fs.readFile(rulesetPath, "utf8");
      assert.match(ruleset, /verificationTemplates:/u, `${ruleSetId} should expose verification templates`);
    }
  });
});

test("validator rejects placeholder approval references", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-code", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace(
      "https://github.com/japana/architecture_rules_catalog/commit/2d941e2045be814ea7961d4fc3f07e89cbdadbe9",
      "https://example.org/catalog/reviews/clean-code-v1"
    );
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("must not use example.org")));
  });
});

test("validator rejects published rulesets without approvals", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-code", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace(
      [
        "approvals:",
        "  - maintainer: \"japana\"",
        "    approvedAt: \"2026-06-06T10:00:00Z\"",
        "    referenceType: \"commit\"",
        "    reference: \"https://github.com/japana/architecture_rules_catalog/commit/2d941e2045be814ea7961d4fc3f07e89cbdadbe9\""
      ].join("\n"),
      "approvals: []"
    );
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("published rulesets require at least one approval")));
  });
});

test("validator rejects published rulesets with draft rules", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-code", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content
      .replace('    status: "active"', '    status: "draft"')
      ;
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("published rulesets must not contain rules in status 'draft'")));
  });
});

test("validator rejects locale and ruleset id mismatches", async () => {
  await withCatalogFixture(async (tempDir) => {
    const localePath = path.join(tempDir, "rulesets", "security-baseline", "i18n", "en.yaml");
    const content = await fs.readFile(localePath, "utf8");
    const mutated = content.replace("- id: \"AR-301\"", "- id: \"AR-999\"");
    await fs.writeFile(localePath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("missing localized rule 'AR-301'")));
    assert.ok(errors.some((error) => error.includes("localized rule 'AR-999' does not exist")));
  });
});

test("validator rejects technology markers in the generic core catalog", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-architecture", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace(
      "Business core logic depends on user-interface, persistence, messaging, web, framework, or infrastructure concepts.",
      "Business core logic depends on Spring infrastructure concepts."
    );
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("technology-specific marker 'spring'")));
  });
});

test("validator rejects profile mappings that reference unknown rules", async () => {
  await withCatalogFixture(async (tempDir) => {
    const profilePath = path.join(
      tempDir,
      "rulesets",
      "clean-architecture",
      "profiles",
      "java",
      "profile.yaml"
    );
    const content = await fs.readFile(profilePath, "utf8");
    const mutated = content.replace('ruleId: "AR-101"', 'ruleId: "AR-999"');
    await fs.writeFile(profilePath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("mapping rule 'AR-999' does not exist")));
  });
});

test("validator rejects duplicate verification template ids", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-architecture", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const duplicateTemplate = [
      "  - templateId: \"VT-AR-101-ARCHUNIT-001\"",
      "    ruleIds: [\"AR-102\"]",
      "    type: \"archunit\"",
      "    language: \"java\"",
      "    framework: \"archunit\"",
      "    coverage: \"partial\"",
      "    determinism: \"deterministic\"",
      "    templateRef: \"templates/archunit/java/clean-architecture-dependency-direction-rule.java.mustache\"",
      "    description: \"Duplicate test template.\"",
      "    requiredParameters: [\"basePackage\"]",
      "    verifiesViolationSignals:",
      "      - \"Inner business layers depend on outer technical layers.\"",
      "    limitations:",
      "      - \"Checks package-level dependencies only.\"",
      "    generates:",
      "      description: \"Duplicate output.\"",
      "      pathTemplate: \"src/test/java/example/Duplicate.java\"",
      "    toolchain:",
      "      - type: \"archunit\"",
      "        version: \">=1.3.0\""
    ].join("\n");
    const mutated = `${content}\n${duplicateTemplate}\n`;
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("duplicate verification template id 'VT-AR-101-ARCHUNIT-001'")));
  });
});

test("validator rejects verification templates that reference unknown rules", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-architecture", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace('ruleIds: ["AR-101"]', 'ruleIds: ["AR-999"]');
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("verification template 'VT-AR-101-ARCHUNIT-001' references unknown rule 'AR-999'")));
  });
});

test("validator rejects verification templates with missing template artifacts", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-architecture", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace(
      'templateRef: "templates/archunit/java/clean-architecture-dependency-rule.java.mustache"',
      'templateRef: "templates/archunit/java/missing-template.java.mustache"'
    );
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("references missing template artifact")));
  });
});

test("validator rejects invalid verification template coverage values", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "security-baseline", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace('coverage: "partial"', 'coverage: "complete"');
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("/verificationTemplates/0/coverage must be equal to one of the allowed values")));
  });
});

test("validator rejects v2 profile mappings with unknown template ids", async () => {
  await withCatalogFixture(async (tempDir) => {
    const profilePath = path.join(
      tempDir,
      "rulesets",
      "clean-architecture",
      "profiles",
      "java-spring-boot",
      "profile.yaml"
    );
    const content = await fs.readFile(profilePath, "utf8");
    const mutated = content.replace('templateId: "VT-AR-101-ARCHUNIT-001"', 'templateId: "VT-AR-999-ARCHUNIT-001"');
    await fs.writeFile(profilePath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("references unknown verification template 'VT-AR-999-ARCHUNIT-001'")));
  });
});

test("validator rejects v2 profile mappings with missing required parameter bindings", async () => {
  await withCatalogFixture(async (tempDir) => {
    const profilePath = path.join(
      tempDir,
      "rulesets",
      "clean-architecture",
      "profiles",
      "java-spring-boot",
      "profile.yaml"
    );
    const content = await fs.readFile(profilePath, "utf8");
    const mutated = content.replace(/^\s*adapterPackages:.*\r?\n/m, "");
    await fs.writeFile(profilePath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("missing required parameter binding 'adapterPackages'")));
  });
});

test("validator rejects v2 list parameter bindings without structured list contract", async () => {
  await withCatalogFixture(async (tempDir) => {
    const profilePath = path.join(
      tempDir,
      "rulesets",
      "ai-context-and-knowledge-governance",
      "profiles",
      "java",
      "profile.yaml"
    );
    const content = await fs.readFile(profilePath, "utf8");
    const mutated = content.replace(
      [
        "          sanitizerMethodPatternsList:",
        '            type: "stringList"',
        '            source: "{{project.aiContext.sanitizerMethodPatternsList}}"',
        "            minItems: 1"
      ].join("\n"),
      '          sanitizerMethodPatternsList: "{{project.aiContext.sanitizerMethodPatternsList}}"'
    );
    await fs.writeFile(profilePath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(
      errors.some((error) =>
        error.includes(
          "must bind list parameter 'sanitizerMethodPatternsList' as type 'stringList' with source and minItems"
        )
      )
    );
  });
});

test("validator rejects v2 profile mappings that use templates incompatible with the profile appliesTo", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(
      tempDir,
      "rulesets",
      "clean-architecture",
      "ruleset.yaml"
    );
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace(
      [
        '    appliesTo:',
        '      languages: ["java"]',
        '      frameworks: ["quarkus"]',
        '      architectureStyles: ["clean-architecture", "hexagonal"]'
      ].join("\n"),
      [
        '    appliesTo:',
        '      languages: ["python"]',
        '      frameworks: ["fastapi"]',
        '      architectureStyles: ["clean-architecture", "hexagonal"]'
      ].join("\n")
    );
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(
      errors.some((error) => error.includes("is not compatible with profile appliesTo")),
      `expected incompatibility error, got: ${errors.join("\n")}`
    );
  });
});

test("ruleset schema accepts verification template appliesTo metadata", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-architecture", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace(
      [
        '    appliesTo:',
        '      languages: ["java"]',
        '      architectureStyles: ["clean-architecture", "hexagonal", "layered"]',
        '    coverage: "partial"'
      ].join("\n"),
      [
        '    appliesTo:',
        '      languages: ["java"]',
        '      architectureStyles: ["clean-architecture", "hexagonal", "layered"]',
        '      runtimes: ["jvm"]',
        '    coverage: "partial"'
      ].join("\n")
    );
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.deepEqual(errors, []);
  });
});
