# Catalog Seed v1

Dieser Ordner ist ein upload-faehiger Seed fuer ein oeffentliches APMDB-
Catalog-Repository im echten `ruleset-catalog-v1`-Format mit separaten
Locale-Dateien.

## Struktur

```text
catalog-seed/
├─ catalog.yaml
├─ schemas/
│  ├─ ruleset.schema.json
│  └─ ruleset-locale.schema.json
└─ rulesets/
   ├─ clean-architecture/
   │  ├─ ruleset.yaml
   │  └─ i18n/
   │     ├─ de.yaml
   │     └─ en.yaml
   ├─ clean-code/
   │  ├─ ruleset.yaml
   │  └─ i18n/
   │     ├─ de.yaml
   │     └─ en.yaml
   └─ security-baseline/
      ├─ ruleset.yaml
      └─ i18n/
         ├─ de.yaml
         └─ en.yaml
```

## Prinzip

- `ruleset.yaml` enthaelt nur sprachneutrale Struktur- und Governance-Daten.
- `i18n/<locale>.yaml` enthaelt nur Anzeigeinhalte.
- Locale-Dateien referenzieren Regeln immer ueber `id`.
- Locale-Dateien duerfen keine strukturellen Felder wie `type`, `scope`,
  `status` oder `relationships` ueberschreiben.

## Vor dem Upload anpassen

- `publisher`
- `approvals[*].maintainer`
- `approvals[*].reference`
- optional `documentationBaseUrl` in `catalog.yaml`

## Consumer-Regel

1. `ruleset.yaml` laden
2. passende `i18n/<locale>.yaml` laden
3. falls nicht vorhanden, auf `defaultLocale` oder Basislocale ausweichen
