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

These belong in optional profiles, not in `rulesets/*`.

## What Belongs in Optional Profiles

Optional profiles may contain:

- concrete framework mappings
- static-analysis hints
- package or namespace patterns
- tool configurations
- technology-specific examples

Example structure:

```text
profiles/
├─ java/
├─ java-quarkus/
└─ java-spring-boot/
```

Profiles are companion artifacts. They are not part of the generic core
catalog and should not be registered in `catalog.yaml`.

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

## Profile Authoring Checklist

For optional profiles:

- keep them outside the core catalog
- name the base rules they refine
- document the target language/framework clearly
- keep concrete dependency patterns in the profile only
- treat suggested tools as hints, not as part of the core rule meaning
