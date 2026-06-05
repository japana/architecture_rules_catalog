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

test("validator rejects placeholder approval references", async () => {
  await withCatalogFixture(async (tempDir) => {
    const rulesetPath = path.join(tempDir, "rulesets", "clean-code", "ruleset.yaml");
    const content = await fs.readFile(rulesetPath, "utf8");
    const mutated = content.replace("approvals: []", [
      "approvals:",
      "  - maintainer: \"catalog-maintainer\"",
      "    approvedAt: \"2026-06-05T18:00:00Z\"",
      "    referenceType: \"review\"",
      "    reference: \"https://example.org/catalog/reviews/clean-code-v1\""
    ].join("\n"));
    await fs.writeFile(rulesetPath, mutated, "utf8");

    const errors = await validateCatalog(tempDir);
    assert.ok(errors.some((error) => error.includes("must not use example.org")));
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
