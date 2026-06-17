# Catalog Seed v1

This repository contains a generic architecture-rule catalog seed for APMDB.
It is intentionally technology-, framework-, and programming-language-neutral
in its core.

The core catalog is meant for:

- human architecture reviews
- AI-assisted requirement reviews
- AI-assisted ticket and testable-artifact generation
- AI-assisted code reviews
- architecture governance
- later companion profiles and marketplace-style catalog scenarios

It is not primarily a linter rule set. The core catalog describes architectural
intent, typical violation signals, review questions, rationale, exceptions, and
remediation guidance.

## Generic Core

The files under `rulesets/*/ruleset.yaml` contain only technology-neutral rule
metadata:

- rule identity and lifecycle
- abstraction level
- rule strength and decision impact
- generic scope
- generic `appliesTo` categories
- generic `violationSignals`
- source and rule relationships

The files under `rulesets/*/i18n/*.yaml` contain localized rule content:

- title and summary
- rule description
- rationale
- review questions
- positive and negative examples
- documented exceptions
- remediation guidance
- tags and keywords

The generic core catalog must not contain:

- framework package names
- language-specific syntax
- tool-specific lint rules
- concrete dependency patterns
- framework-only rules

## Optional Profiles

Technology-specific mappings live next to the ruleset they refine under
`rulesets/<ruleSetId>/profiles/`.

Those profiles may contain:

- framework-specific dependency patterns
- concrete annotations or namespace hints
- suggested static-analysis tooling
- technology-specific examples
- verification-template selections and parameter bindings

Example structure:

```text
rulesets/
  clean-architecture/
    profiles/
      java/
      java-quarkus/
      java-spring-boot/
  clean-code/
    profiles/
      java/
  security-baseline/
    profiles/
      java-quarkus/
      java-spring-boot/
```

These profiles are intentionally not registered in `catalog.yaml`. They are
rule-set-local companion artifacts, not part of the generic core catalog.

Profile compatibility:

- `ruleset-profile-v1` keeps the original detection-hint-only model
- `ruleset-profile-v2` adds toolchain requirements and concrete verification-template mappings

## Verification Templates

Rules can now optionally expose reusable verification templates through
`verificationTemplates` in `rulesets/*/ruleset.yaml`.

Structure:

```text
rulesets/
  <ruleSetId>/
    ruleset.yaml
    i18n/
    templates/
      archunit/
      semgrep/
      spectral/
      junit/
      gitleaks/
      checklists/
      ai-review/
    profiles/
      <profileId>/
        profile.yaml
```

A verification template is not the rule itself:

- Rule: technology-neutral architectural intent
- Template: reusable technical verification artifact with explicit limits
- Profile: project- or stack-specific selection and parametrization of templates

Templates are stored as versioned catalog artifacts under `rulesets/<ruleSetId>/templates/...`.
They are versioned together with the owning ruleset release (`ruleSetVersion`) and the
repository revision. This keeps template evolution aligned with catalog evolution without
embedding large code blocks directly into rule definitions.

`verificationTemplates` use `ruleIds` instead of nesting under each rule. The pragmatic
reason is reuse: one template can support several rules later without duplicating metadata
or fragmenting template lookup logic. Rules stay small and only refer to available template
metadata.

Each template declares:

- supported `ruleIds`
- optional target-stack `appliesTo` metadata such as languages, frameworks, architecture styles, or runtimes
- `coverage` and `determinism`
- generated artifact target
- required parameters
- covered violation signals
- explicit limitations
- required toolchain

Template applicability:

- Templates stay in the owning `ruleset.yaml` as reusable, versioned catalog artifacts.
- Profiles remain the only activation mechanism for project-specific use.
- When a template declares `appliesTo`, the validator checks that every declared dimension intersects with the referencing profile's `appliesTo`.
- This keeps templates discoverable at rule-set level without implying that every template is valid for every stack.

Coverage values mean:

- `full`: strong evidence for the stated verification scope, but still not a blanket proof outside that scope
- `partial`: verifies an important subset of the rule
- `heuristic`: useful signal with expected false negatives or contextual gaps
- `supporting`: supporting artifact for review or evidence collection, not a direct rule check
- `notAutomatable`: template supports manual verification only

Why templates are not full rule verification:

- architecture rules often include semantic intent that static structure alone cannot prove
- technical checks usually observe proxies such as package dependencies, annotations, or contract shapes
- runtime behavior, business meaning, and socio-technical decisions still need review context

## Contributing Templates

To add a new verification template:

1. Add the versioned artifact under `rulesets/<ruleSetId>/templates/...`.
2. Add metadata under `verificationTemplates` in the owning `ruleset.yaml`.
3. Reference only existing `ruleIds`.
4. Keep all project-specific values in `requiredParameters`.
5. Document limitations and choose the narrowest honest `coverage`.
6. If needed, activate the template from a `ruleset-profile-v2` profile via `ruleMappings`.

## Identity Model

Rule IDs remain readable inside each ruleset, for example `AR-101` or `AR-301`.
For global identification, combine `ruleSetId` and `rule.id`, for example:

- `clean-architecture:AR-101`
- `clean-code:AR-201`
- `security-baseline:AR-301`

## Validation

```bash
npm install
npm test
npm run validate
```

The validator checks:

- `catalog.yaml` structure
- referenced ruleset and locale files
- schema compliance
- locale and ruleset ID consistency
- duplicate rule IDs
- missing or extra localized rules
- SemVer for `ruleSetVersion`
- placeholder governance URLs
- relationship targets
- required localized review fields
- forbidden technology markers in the generic core catalog
- optional profile schema compliance and profile-to-ruleset rule mappings
- verification template schema compliance and artifact references
- duplicate verification template IDs
- template-to-rule consistency
- profile-to-template consistency including required parameter bindings
- optional template-to-profile `appliesTo` compatibility

## Authoring

See [docs/rule-authoring-guidelines.md](C:/Users/jpnac/OneDrive/Desktop/catalog-seed/docs/rule-authoring-guidelines.md) for guidance on adding new generic rules or optional technology profiles.
