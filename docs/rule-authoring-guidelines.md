# Rule Authoring Guidelines

## Purpose

The generic core catalog exists to capture architecture intent in a way that is
useful for human reviewers and AI agents across many technologies.

## What Makes a Good Generic Rule

A good generic architecture rule is:

- technology-independent
- concrete enough to be usable in reviews
- more than an abstract ideal
- described through typical violation signals
- operationalized through review questions
- accompanied by rationale
- explicit about legitimate exceptions
- supported by remediation guidance

## What Must Stay Out of the Generic Core

Do not put the following into the generic core catalog:

- concrete framework package names
- concrete programming-language syntax
- tool-specific linter or analyzer rules
- technology-specific dependency lists
- rules that only make sense for one framework
- framework-specific annotations, base classes, or namespace patterns

These belong in optional profiles or reusable verification templates under
`rulesets/<ruleSetId>/profiles/` and `rulesets/<ruleSetId>/templates/`, not in
the generic `ruleset.yaml` rule body or `i18n/*.yaml`.

## What Belongs in Optional Profiles

Optional profiles may contain:

- concrete framework mappings
- static-analysis hints
- package or namespace patterns
- tool configurations
- technology-specific examples
- verification-template activation and parameter bindings

Example structure:

```text
rulesets/
├─ clean-architecture/
│  └─ profiles/
│     ├─ java/
│     ├─ java-quarkus/
│     └─ java-spring-boot/
├─ clean-code/
│  └─ profiles/
│     └─ java/
└─ security-baseline/
   └─ profiles/
      ├─ java-quarkus/
      └─ java-spring-boot/
```

Profiles are rule-set-local companion artifacts. They are not part of the
generic core catalog and should not be registered in `catalog.yaml`.

`ruleset-profile-v1` is for detection hints only. `ruleset-profile-v2` is for
template activation, toolchain selection, and parameter bindings.

## Verification Template Authoring

Verification templates are reusable technical artifacts that support, but do
not replace, architectural rule verification.

Author templates under `rulesets/<ruleSetId>/templates/...` and reference them
from `verificationTemplates` in the owning `ruleset.yaml`.

Use templates for things such as:

- ArchUnit tests
- Semgrep or Spectral rules
- Gitleaks configurations
- JUnit or integration-test skeletons
- manual review checklists
- AI review prompts

Every template should:

- support one or more existing `ruleIds`
- keep project-specific values in `requiredParameters`
- declare generated output and required toolchain
- list covered violation signals
- state explicit limitations
- use the narrowest honest coverage label

Coverage labels:

- `full`
- `partial`
- `heuristic`
- `supporting`
- `notAutomatable`

Prefer the top-level `verificationTemplates[*].ruleIds` model over storing
templates inside individual rules. It keeps template artifacts reusable and
avoids duplicating metadata when one verification approach supports multiple
rules.

## Quality Check for a New Generic Rule

Every new rule should answer:

1. Which architectural intent does the rule protect?
2. What are typical violation signals?
3. Which review questions make the rule actionable?
4. Which exceptions are legitimate?
5. How can a violation be remediated?
6. Is the rule truly generic?

## Core Rule Authoring Checklist

For `ruleset.yaml`:

- keep metadata technology-neutral
- use only generic scope values
- use only generic `appliesTo` categories
- describe generic `violationSignals`
- avoid concrete dependency patterns

For `i18n/*.yaml`:

- provide `summary`
- provide `rationale`
- provide `reviewQuestions`
- provide `positiveExamples`
- provide `negativeExamples`
- provide `exceptions`
- provide `remediation`

## Publication Readiness

Before a generic ruleset moves to `published`:

- record at least one non-placeholder approval in `approvals`
- keep all contained rules out of `draft`
- run `npm run validate`
- run `npm test`

## Profile Authoring Checklist

For optional profiles:

- keep them outside the core catalog payload
- place them under the ruleset they refine
- name the base rules they refine
- document the target language/framework clearly
- keep concrete dependency patterns in the profile only
- treat suggested tools as hints, not as part of the core rule meaning
- for `ruleset-profile-v2`, bind every template `requiredParameter`
- only activate templates that explicitly support the mapped `ruleId`
