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

Technology-specific mappings live outside the core in `profiles/`.

Those profiles may contain:

- framework-specific dependency patterns
- concrete annotations or namespace hints
- suggested static-analysis tooling
- technology-specific examples

Current starter profiles:

- `profiles/java/`
- `profiles/java-quarkus/`
- `profiles/java-spring-boot/`

These profiles are intentionally not registered in `catalog.yaml`. They are
companion artifacts, not part of the generic core catalog.

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

## Authoring

See [docs/rule-authoring-guidelines.md](C:/Users/jpnac/OneDrive/Desktop/catalog-seed/docs/rule-authoring-guidelines.md) for guidance on adding new generic rules or optional technology profiles.
