import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const fixtureRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function renderMustache(template, context) {
  const renderedSections = template.replace(/{{#([A-Za-z0-9_]+)}}([\s\S]*?){{\/\1}}/g, (_match, key, inner) => {
    const value = context[key];
    if (!Array.isArray(value) || value.length === 0) {
      return "";
    }

    return value
      .map((entry) =>
        inner
          .replace(/{{\.}}/g, String(entry))
          .replace(/{{{([A-Za-z0-9_]+)}}}/g, (_triple, nestedKey) => String(context[nestedKey] ?? ""))
          .replace(/{{([A-Za-z0-9_]+)}}/g, (_double, nestedKey) => String(context[nestedKey] ?? ""))
      )
      .join("");
  });

  return renderedSections
    .replace(/{{{([A-Za-z0-9_]+)}}}/g, (_match, key) => String(context[key] ?? ""))
    .replace(/{{([A-Za-z0-9_]+)}}/g, (_match, key) => String(context[key] ?? ""));
}

function assertNoUnresolvedPlaceholders(rendered, templateRef) {
  assert.equal(rendered.includes("{{"), false, `${templateRef} still contains unresolved mustache placeholders`);
}

function assertJavaTemplateLooksRenderable(rendered, templateRef) {
  assert.match(rendered, /class\s+[A-Za-z0-9_]+/u, `${templateRef} should contain a Java class`);
  assert.equal(/,\s*\)/u.test(rendered), false, `${templateRef} contains a trailing comma before ')'`);
  assert.equal(/resideInAnyPackage\(\s*\)/u.test(rendered), false, `${templateRef} contains an empty resideInAnyPackage call`);
}

function parseTomlValue(rawValue, templateRef, lineNumber) {
  const value = rawValue.trim();

  if (value.startsWith('"""') || value.startsWith("'''")) {
    const quote = value.slice(0, 3);
    assert.equal(
      value.endsWith(quote),
      true,
      `${templateRef}:${lineNumber} contains an unterminated multiline TOML string`
    );
    return value.slice(3, -3);
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => parseTomlValue(entry, templateRef, lineNumber));
  }

  assert.match(
    value,
    /^(true|false|-?[0-9]+(?:\.[0-9]+)?)$/u,
    `${templateRef}:${lineNumber} contains an unsupported TOML scalar`
  );
  return value;
}

function assertTomlTemplateParses(rendered, templateRef) {
  const lines = rendered.split(/\r?\n/u);
  let currentSection = null;
  let sawSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const lineNumber = index + 1;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const tableMatch = trimmed.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/u);
    if (tableMatch) {
      currentSection = tableMatch[1];
      sawSection = true;
      continue;
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u);
    assert.notEqual(keyMatch, null, `${templateRef}:${lineNumber} is not valid TOML key syntax`);
    parseTomlValue(keyMatch[2], templateRef, lineNumber);
  }

  assert.equal(sawSection, true, `${templateRef} should contain at least one TOML array table`);
}

const templateFixtures = {
  "rulesets/clean-architecture/templates/archunit/java/quarkus-clean-architecture-dependency-rule.java.mustache": {
    basePackage: "com.example.catalog",
    businessCorePackagePatterns: '"..domain..", "..application.."',
    forbiddenFrameworkDependencyPatterns: '"io.quarkus..", "jakarta.ws.rs..", "io.quarkus.hibernate.orm.panache.."'
  },
  "rulesets/clean-architecture/templates/archunit/java/quarkus-dependency-direction-rule.java.mustache": {
    basePackage: "com.example.catalog",
    domainPackagePatterns: '"..domain.."',
    applicationPackagePatterns: '"..application.."',
    outerLayerPackagePatterns: '"..application..", "..adapter..", "..infrastructure..", "..entrypoint.."',
    technicalBoundaryPackagePatterns: '"..adapter..", "..infrastructure..", "..entrypoint.."'
  },
  "rulesets/clean-architecture/templates/archunit/java/quarkus-ports-and-adapters-rule.java.mustache": {
    basePackage: "com.example.catalog",
    innerLayerPackagePatterns: '"..domain..", "..application.."',
    adapterAndPanachePackagePatterns: '"..adapter..", "..panache.."',
    outboundAdapterImplementationPackagePatterns: '"..adapter.outbound..", "..adapter.persistence.."',
    portPackagePatterns: '"..application.port..", "..domain.port.."'
  },
  "rulesets/clean-architecture/templates/archunit/java/quarkus-interface-adapters-rule.java.mustache": {
    basePackage: "com.example.catalog",
    interfaceAdapterPackagePatterns: '"..adapter.inbound..", "..adapter.web.."',
    domainAndPersistencePackagePatterns: '"..domain.impl..", "..persistence.."'
  },
  "rulesets/clean-architecture/templates/archunit/java/quarkus-cross-cutting-concern-placement-rule.java.mustache": {
    basePackage: "com.example.catalog",
    businessCorePackagePatterns: '"..domain..", "..application.."',
    forbiddenCrossCuttingDependencyPatterns: '"jakarta.transaction..", "io.opentelemetry..", "io.quarkus.cache.."'
  },
  "rulesets/api-design/templates/archunit/java/quarkus-representation-encapsulation-rule.java.mustache": {
    basePackage: "com.example.catalog",
    apiRepresentationPackagePatterns: '"..api..", "..dto.."',
    persistenceAndPanachePackagePatterns: '"..entity..", "io.quarkus.hibernate.orm.panache.."'
  },
  "rulesets/api-design/templates/junit/java/quarkus-large-result-control-test.java.mustache": {
    basePackage: "com.example.catalog",
    resourcePath: "/api/orders",
    pageParameterName: "page",
    pageSizeParameterName: "size",
    maxPageSize: "25",
    minimumDatasetSize: "60",
    maxUnpagedResultThreshold: "500",
    responseCollectionSizePath: "items.size()",
    pagedControlEchoPath: "page.size",
    expectedPagedControlEchoValue: "25"
  },
  "rulesets/api-design/templates/junit/java/quarkus-consistent-error-contracts-test.java.mustache": {
    basePackage: "com.example.catalog",
    firstErrorPath: "/api/orders/missing",
    secondErrorPath: "/api/payments/missing",
    expectedStatusCode: "404",
    expectedContentType: "application/problem+json",
    expectedErrorCodeField: "error.code",
    expectedErrorCode: "RESOURCE_NOT_FOUND",
    expectedErrorMeaningField: "error.category",
    expectedErrorMeaning: "not-found"
  },
  "rulesets/api-design/templates/junit/java/quarkus-idempotency-awareness-test.java.mustache": {
    basePackage: "com.example.catalog",
    commandPath: "/api/orders",
    idempotencyHeaderName: "Idempotency-Key",
    idempotencyKeyValue: "repeatable-request-key",
    requestFixtureExpression: "\"{\\\"orderId\\\":\\\"42\\\"}\"",
    expectedInitialStatusCode: "201",
    expectedReplayStatusCode: "200",
    stableResponseField: "id",
    replayIndicatorField: "meta.replayed",
    expectedReplayIndicatorValue: "true",
    duplicateEffectCountField: "meta.effectCount",
    expectedDuplicateEffectCount: "1"
  },
  "rulesets/security-baseline/templates/archunit/java/quarkus-authentication-authorization-separation-rule.java.mustache": {
    basePackage: "com.example.catalog",
    businessServicePackagePatterns: '"..application.."',
    identityBoundaryPackagePatterns: '"..adapter.authn..", "..entrypoint.security.."',
    authorizationPackagePatterns: '"..security.authorization.."'
  },
  "rulesets/security-baseline/templates/semgrep/java/quarkus-boundary-validation.yml.mustache": {
    boundaryDtoTypeRegex: ".*Request$",
    validationAnnotationName: "Valid"
  },
  "rulesets/security-baseline/templates/gitleaks/quarkus-secret-protection-gitleaks.toml.mustache": {
    configTitle: "catalog-service",
    quarkusConfigPathRegex: ".*application(-[a-z]+)?\\.properties$",
    additionalSecretRulesToml: "[[rules]]\nid = \"custom-client-secret\"\ndescription = \"Client secret\"\nregex = '''(?i)client-secret\\s*[:=]\\s*.+'''\ntags = [\"secret\"]",
    allowlistsToml: "[[allowlists]]\ndescription = \"Fixture secret\"\nregexes = ['''TEST_ONLY_SECRET''']"
  },
  "rulesets/security-baseline/templates/checklists/quarkus-least-privilege-checklist.md.mustache": {
    serviceName: "catalog-service",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    runtimeIdentities: ["svc-catalog", "svc-catalog-migration"],
    datasourceNames: ["catalogdb"],
    externalSystems: ["payments-api", "search-index"]
  },
  "rulesets/security-baseline/templates/checklists/quarkus-secure-defaults-checklist.md.mustache": {
    serviceName: "catalog-service",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    configFiles: ["application.properties", "application-prod.properties"],
    publicEndpoints: ["/q/health", "/api/catalog"],
    sensitiveFeatures: ["dev-services", "debug logging"]
  },
  "rulesets/data-management/templates/archunit/java/quarkus-derived-data-integrity-rule.java.mustache": {
    basePackage: "com.example.catalog",
    projectionPackagePatterns: '"..projection..", "..readmodel.."',
    sourceOfTruthMutatorPackagePatterns: '"..application.command..", "..persistence.write.."'
  },
  "rulesets/data-management/templates/junit/java/quarkus-access-path-awareness-test.java.mustache": {
    basePackage: "com.example.catalog",
    resourcePath: "/api/catalog/search",
    maxExpectedItems: "50",
    responseCollectionSizePath: "items.size()",
    queryCountHeaderName: "X-Test-Query-Count",
    expectedQueryBudget: "5",
    queryBudgetProbeDescription: "Expected SQL statement budget for seeded search scenario"
  },
  "rulesets/modularity-and-dependency-governance/templates/archunit/java/quarkus-module-boundary-rule.java.mustache": {
    basePackage: "com.example.catalog",
    moduleSlicePattern: "com.example.catalog.(*)..",
    moduleInternalPackagePatterns: '"..catalog.*.internal.."',
    allowedInternalAccessPackagePatterns: '"..catalog.*..", "..architecture.."'
  },
  "rulesets/architecture-decision-governance/templates/checklists/decision-record-review.md.mustache": {
    decisionId: "ADR-001",
    decisionTitle: "Catalog module ownership",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    decisionRecordPath: "docs/architecture/adr-001.md"
  },
  "rulesets/integration-and-messaging-architecture/templates/junit/java/quarkus-duplicate-message-safety-test.java.mustache": {
    basePackage: "com.example.catalog",
    messageEndpointPath: "/internal/messages/orders",
    messageIdHeaderName: "X-Message-Id",
    messageIdValue: "message-42",
    messageBodyExpression: "\"{\\\"orderId\\\":\\\"42\\\"}\"",
    expectedStatusCode: "202",
    effectCountProbePath: "/test/probes/order-effects/message-42",
    expectedEffectCount: "1",
    stableResultProbePath: "/test/probes/order-results/message-42",
    stableResultField: "resultId",
    expectedStableResultValueExpression: "\"order-42\"",
    assertEventuallyTimeoutSeconds: "5",
    assertPollIntervalMillis: "100"
  },
  "rulesets/delivery-and-runtime-architecture/templates/checklists/runtime-readiness-review.md.mustache": {
    serviceName: "catalog-service",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    runtimeEnvironmentsList: ["dev", "prod"],
    criticalConfigurationItemsList: ["database url", "message broker endpoint"],
    readinessSignalsList: ["/q/health/ready"],
    runtimeSwitchesList: ["new-search-flow"]
  },
  "rulesets/performance-and-scalability-architecture/templates/junit/java/quarkus-critical-path-budget-test.java.mustache": {
    basePackage: "com.example.catalog",
    criticalPath: "/api/catalog/search?q=seed",
    iterations: "3",
    warmupIterations: "1",
    minMeasuredIterations: "3",
    maxAverageMillis: "250",
    maxPercentileMillis: "400",
    maxSingleCallMillis: "500",
    percentileRank: "95",
    expectedStatusCode: "200"
  },
  "rulesets/agentic-system-architecture/templates/archunit/java/quarkus-agent-tool-policy-boundary-rule.java.mustache": {
    basePackage: "com.example.catalog",
    sideEffectAgentToolPackagePatterns: '"..agent.tools.sideeffect.."',
    policyBoundaryPackagePatterns: '"..agent.policy.."',
    sideEffectAdapterPackagePatterns: '"..adapter.outbound..", "..deployment.."'
  },
  "rulesets/ai-context-and-knowledge-governance/templates/semgrep/java/prompt-context-sensitive-data.yml.mustache": {
    sensitiveFieldRegex: "(?i).*(password|token|secret|ssn).*",
    contextBuilderTypeRegex: ".*(Prompt|Context).*",
    sanitizerMethodPatterns: ["redact(...)", "sanitize(...)", "summarize(...)"]
  },
  "rulesets/ai-evaluation-and-regression-governance/templates/checklists/ai-evaluation-gate-review.md.mustache": {
    systemName: "catalog-agent",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    scenarioSuitesList: ["tool-policy-regression", "answer-quality-regression"],
    releaseGateName: "ai-release-gate",
    knownFailureCasesList: ["unsafe delete request", "stale context answer"]
  },
  "rulesets/agentic-system-architecture/templates/checklists/agentic-handoff-audit-review.md.mustache": {
    systemName: "catalog-agent",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    highImpactActionsList: ["delete catalog item", "publish generated release"],
    auditEventsList: ["agent.tool.requested", "agent.policy.decided", "agent.tool.completed"]
  },
  "rulesets/ai-context-and-knowledge-governance/templates/checklists/context-source-evidence-review.md.mustache": {
    systemName: "catalog-agent",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    contextSourcesList: ["requirements index", "architecture decisions"],
    generatedOutputsList: ["implementation plan", "code review finding"]
  },
  "rulesets/performance-and-scalability-architecture/templates/checklists/overload-and-cache-review.md.mustache": {
    serviceName: "catalog-service",
    reviewer: "architect@example.test",
    reviewedAt: "2026-06-17",
    loadBoundariesList: ["search request queue", "outbound recommendation call"],
    cachesList: ["catalog summary cache", "availability projection cache"]
  }
};

test("quarkus verification templates render without unresolved placeholders", async () => {
  for (const [relativePath, context] of Object.entries(templateFixtures)) {
    const template = await fs.readFile(path.join(fixtureRoot, relativePath), "utf8");
    const rendered = renderMustache(template, context);

    assertNoUnresolvedPlaceholders(rendered, relativePath);

    if (relativePath.endsWith(".java.mustache")) {
      assertJavaTemplateLooksRenderable(rendered, relativePath);
      continue;
    }

    if (relativePath.endsWith(".yml.mustache")) {
      assert.doesNotThrow(() => YAML.parse(rendered), `${relativePath} should render valid YAML`);
      continue;
    }

    if (relativePath.endsWith(".toml.mustache")) {
      assertTomlTemplateParses(rendered, relativePath);
      assert.match(rendered, /\[\[rules\]\]/u, `${relativePath} should render at least one gitleaks rule`);
      continue;
    }

    assert.match(rendered, /Overall decision: TBD/u, `${relativePath} should render checklist review status`);
  }
});

test("new governance templates encode the reviewed guard rails honestly", async () => {
  const [
    agentBoundaryTemplate,
    sensitiveContextTemplate,
    moduleBoundaryTemplate,
    duplicateMessageTemplate,
    criticalPathBudgetTemplate
  ] = await Promise.all([
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/agentic-system-architecture/templates/archunit/java/quarkus-agent-tool-policy-boundary-rule.java.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/ai-context-and-knowledge-governance/templates/semgrep/java/prompt-context-sensitive-data.yml.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/modularity-and-dependency-governance/templates/archunit/java/quarkus-module-boundary-rule.java.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/integration-and-messaging-architecture/templates/junit/java/quarkus-duplicate-message-safety-test.java.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/performance-and-scalability-architecture/templates/junit/java/quarkus-critical-path-budget-test.java.mustache"
      ),
      "utf8"
    )
  ]);

  const renderedAgentBoundary = renderMustache(
    agentBoundaryTemplate,
    templateFixtures[
      "rulesets/agentic-system-architecture/templates/archunit/java/quarkus-agent-tool-policy-boundary-rule.java.mustache"
    ]
  );
  const renderedSensitiveContext = renderMustache(
    sensitiveContextTemplate,
    templateFixtures[
      "rulesets/ai-context-and-knowledge-governance/templates/semgrep/java/prompt-context-sensitive-data.yml.mustache"
    ]
  );
  const renderedModuleBoundary = renderMustache(
    moduleBoundaryTemplate,
    templateFixtures[
      "rulesets/modularity-and-dependency-governance/templates/archunit/java/quarkus-module-boundary-rule.java.mustache"
    ]
  );
  const renderedDuplicateMessage = renderMustache(
    duplicateMessageTemplate,
    templateFixtures[
      "rulesets/integration-and-messaging-architecture/templates/junit/java/quarkus-duplicate-message-safety-test.java.mustache"
    ]
  );
  const renderedCriticalPathBudget = renderMustache(
    criticalPathBudgetTemplate,
    templateFixtures[
      "rulesets/performance-and-scalability-architecture/templates/junit/java/quarkus-critical-path-budget-test.java.mustache"
    ]
  );

  assert.match(
    renderedAgentBoundary,
    /side_effect_agent_tools_should_depend_on_policy_boundaries/u,
    "AR-951 template should assert that selected side-effect tools depend on policy boundaries"
  );
  assert.match(
    renderedAgentBoundary,
    /side_effect_agent_tools_should_not_call_side_effect_adapters_directly/u,
    "AR-951 template should still block direct side-effect adapter access"
  );

  assert.equal(
    /\$SANITIZER/u.test(renderedSensitiveContext),
    false,
    "AR-962 Semgrep template should not constrain metavariables introduced only in negative patterns"
  );
  assert.match(
    renderedSensitiveContext,
    /pattern-not-either:/u,
    "AR-962 Semgrep template should exempt sanitizer patterns consistently across builder methods"
  );

  assert.match(
    renderedModuleBoundary,
    /caller whitelist/u,
    "AR-901 template should document that internal access protection depends on the configured caller whitelist"
  );
  assert.match(
    renderedDuplicateMessage,
    /await\(\)/u,
    "AR-922 template should use eventual assertions for asynchronous message processing"
  );
  assert.match(
    renderedDuplicateMessage,
    /stableResultProbePath/u,
    "AR-922 template should optionally assert stable replay result semantics"
  );
  assert.match(
    renderedCriticalPathBudget,
    /warmupIterations/u,
    "AR-941 template should include warmup iterations before measuring"
  );
  assert.match(
    renderedCriticalPathBudget,
    /percentileDuration/u,
    "AR-941 template should prefer percentile-style regression budgets over a single raw maximum only"
  );
});

test("quarkus template metadata and supporting contracts stay aligned with the reviewed findings", async () => {
  const [cleanArchitectureRuleset, securityRuleset, dataManagementRuleset, dataManagementProfile, apiDesignRuleset] =
    await Promise.all([
      fs.readFile(path.join(fixtureRoot, "rulesets/clean-architecture/ruleset.yaml"), "utf8"),
      fs.readFile(path.join(fixtureRoot, "rulesets/security-baseline/ruleset.yaml"), "utf8"),
      fs.readFile(path.join(fixtureRoot, "rulesets/data-management/ruleset.yaml"), "utf8"),
      fs.readFile(path.join(fixtureRoot, "rulesets/data-management/profiles/java-quarkus/profile.yaml"), "utf8"),
      fs.readFile(path.join(fixtureRoot, "rulesets/api-design/ruleset.yaml"), "utf8")
    ]);

  const cleanArchitectureCatalog = YAML.parse(cleanArchitectureRuleset);
  const securityCatalog = YAML.parse(securityRuleset);
  const dataManagementCatalog = YAML.parse(dataManagementRuleset);
  const dataManagementQuarkusProfile = YAML.parse(dataManagementProfile);
  const apiDesignCatalog = YAML.parse(apiDesignRuleset);

  const ar104Template = cleanArchitectureCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-104-ARCHUNIT-QUARKUS-002"
  );
  assert.match(
    ar104Template.limitations.join("\n"),
    /Bind outboundAdapterImplementationPackagePatterns narrowly/u,
    "AR-104 Quarkus template should explicitly warn about narrow outbound adapter bindings"
  );

  const ar303Template = securityCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-303-SEMGREP-QUARKUS-002"
  );
  assert.match(
    ar303Template.limitations.join("\n"),
    /class-level or method-level JAX-RS/u,
    "AR-303 Quarkus template should describe its JAX-RS matching scope honestly"
  );

  const ar301Template = securityCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-301-GITLEAKS-QUARKUS-002"
  );
  assert.match(
    ar301Template.limitations.join("\n"),
    /prevalidated TOML fragments/u,
    "AR-301 Quarkus gitleaks template should document the TOML fragment contract"
  );

  const ar505Template = dataManagementCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-505-ARCHUNIT-QUARKUS-002"
  );
  assert.match(
    ar505Template.description,
    /selected source-of-truth mutation paths/u,
    "AR-505 Quarkus template should describe itself as a structural proxy over selected mutation paths"
  );
  assert.match(
    ar505Template.limitations.join("\n"),
    /structural proxy rule/u,
    "AR-505 Quarkus template should document that it is a structural proxy rule"
  );

  const ar506Template = dataManagementCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-506-JUNIT-QUARKUS-002"
  );
  assert.match(
    ar506Template.limitations.join("\n"),
    /[Ff]ails fast with a clear message when the query-count signal is unavailable/u,
    "AR-506 Quarkus template should document its explicit instrumentation failure mode"
  );

  const ar506Mapping = dataManagementQuarkusProfile.ruleMappings.find((mapping) => mapping.ruleId === "AR-506");
  assert.equal(
    ar506Mapping.verificationTemplates[0].coverage,
    "supporting",
    "AR-506 Quarkus profile should not overstate the supporting template coverage"
  );

  const ar402Template = apiDesignCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-402-JUNIT-QUARKUS-002"
  );
  assert.match(
    ar402Template.description,
    /status code, content type, and selected stable error semantics/u,
    "AR-402 Quarkus template should describe the actual error-contract depth it asserts"
  );
  assert.match(
    ar402Template.limitations.join("\n"),
    /selected fields, not full payload equality/u,
    "AR-402 Quarkus template should document that it checks selected stable fields only"
  );

  const ar405Template = apiDesignCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-405-JUNIT-QUARKUS-002"
  );
  assert.match(
    ar405Template.description,
    /explicit replay indicator, and a project-defined duplicate-effect signal/u,
    "AR-405 Quarkus template should document its replay and duplicate-effect checks"
  );
  assert.match(
    ar405Template.limitations.join("\n"),
    /project-specific replay and effect signals/u,
    "AR-405 Quarkus template should document the need for explicit replay and effect signals"
  );

  const ar406Template = apiDesignCatalog.verificationTemplates.find(
    (template) => template.templateId === "VT-AR-406-JUNIT-QUARKUS-002"
  );
  assert.match(
    ar406Template.description,
    /recognizes the requested size control and returns fewer items than the comparable unpaged call/u,
    "AR-406 Quarkus template should describe the stronger paging comparison it performs"
  );
  assert.match(
    ar406Template.limitations.join("\n"),
    /[Rr]equires a response field or envelope signal that echoes the applied paging control/u,
    "AR-406 Quarkus template should document the paging-control echo requirement"
  );
});

test("quarkus supporting templates include the expected guard rails in rendered output", async () => {
  const [boundaryValidationTemplate, accessPathTemplate, errorContractTemplate, idempotencyTemplate, largeResultTemplate] = await Promise.all([
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/security-baseline/templates/semgrep/java/quarkus-boundary-validation.yml.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/data-management/templates/junit/java/quarkus-access-path-awareness-test.java.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/api-design/templates/junit/java/quarkus-consistent-error-contracts-test.java.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/api-design/templates/junit/java/quarkus-idempotency-awareness-test.java.mustache"
      ),
      "utf8"
    ),
    fs.readFile(
      path.join(
        fixtureRoot,
        "rulesets/api-design/templates/junit/java/quarkus-large-result-control-test.java.mustache"
      ),
      "utf8"
    )
  ]);

  const renderedBoundaryValidation = renderMustache(
    boundaryValidationTemplate,
    templateFixtures[
      "rulesets/security-baseline/templates/semgrep/java/quarkus-boundary-validation.yml.mustache"
    ]
  );
  const renderedAccessPath = renderMustache(
    accessPathTemplate,
    templateFixtures["rulesets/data-management/templates/junit/java/quarkus-access-path-awareness-test.java.mustache"]
  );
  const renderedErrorContract = renderMustache(
    errorContractTemplate,
    templateFixtures["rulesets/api-design/templates/junit/java/quarkus-consistent-error-contracts-test.java.mustache"]
  );
  const renderedIdempotency = renderMustache(
    idempotencyTemplate,
    templateFixtures["rulesets/api-design/templates/junit/java/quarkus-idempotency-awareness-test.java.mustache"]
  );
  const renderedLargeResult = renderMustache(
    largeResultTemplate,
    templateFixtures["rulesets/api-design/templates/junit/java/quarkus-large-result-control-test.java.mustache"]
  );

  assert.match(
    renderedBoundaryValidation,
    /pattern-either:/u,
    "AR-303 Quarkus template should support more than one JAX-RS boundary shape"
  );
  assert.match(
    renderedBoundaryValidation,
    /@(POST|PUT|PATCH|GET|DELETE)/u,
    "AR-303 Quarkus template should cover method-level JAX-RS annotations"
  );
  assert.match(
    renderedAccessPath,
    /assertNotNull/u,
    "AR-506 Quarkus template should fail clearly when query-count instrumentation is missing"
  );
  assert.match(
    renderedAccessPath,
    /assertDoesNotThrow/u,
    "AR-506 Quarkus template should diagnose malformed query-count instrumentation clearly"
  );
  assert.match(
    renderedErrorContract,
    /contentType\(/u,
    "AR-402 Quarkus template should assert a stable content type"
  );
  assert.match(
    renderedErrorContract,
    /body\("error\.category", equalTo\("not-found"\)\)/u,
    "AR-402 Quarkus template should compare a second stable error semantic field"
  );
  assert.match(
    renderedIdempotency,
    /body\("meta\.replayed", equalTo\(true\)\)/u,
    "AR-405 Quarkus template should assert an explicit replay indicator"
  );
  assert.match(
    renderedIdempotency,
    /body\("meta\.effectCount", equalTo\(1\)\)/u,
    "AR-405 Quarkus template should assert a project-defined duplicate-effect signal"
  );
  assert.match(
    renderedLargeResult,
    /greaterThan\(pagedResultSize\)/u,
    "AR-406 Quarkus template should prove the paged call returns fewer items than the unpaged call"
  );
  assert.match(
    renderedLargeResult,
    /body\("page\.size", org\.hamcrest\.Matchers\.equalTo\(25\)\)/u,
    "AR-406 Quarkus template should assert that the service echoes the requested paging control"
  );
});
