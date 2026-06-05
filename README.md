# Catalog Seed v1

Dieser Ordner ist ein upload-fähiger Seed für ein öffentliches APMDB-
Catalog-Repository im `ruleset-catalog-v1`-Format mit separaten
Locale-Dateien, maschinenlesbaren Regelkernen und lokalisierter
AI-Review-Hilfe.

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

- `ruleset.yaml` enthält sprachneutrale Struktur-, Governance- und
  Enforcement-Daten.
- `i18n/<locale>.yaml` enthält nur Anzeigeinhalte, Beispiele und
  AI-Review-Hinweise.
- Locale-Dateien referenzieren Regeln immer über `id`.
- Locale-Dateien dürfen keine strukturellen Felder wie `type`, `scope`,
  `status`, `severity` oder `relationships` überschreiben.

## Modell

- `rules[*].severity`, `enforcementLevel`, `detectability` und `priority`
  machen Regeln priorisierbar und operationalisierbar.
- `classification`, `appliesTo` und `constraints` bilden einen
  maschinenlesbaren Regelkern für spätere statische Analysen,
  AI-Reviews und Governance-Checks.
- `relationships` sind auf feste Typen begrenzt, damit Konflikte und
  Verfeinerungen konsistent modelliert werden können.
- `aiGuidance` ergänzt pro lokalisierter Regel Review-Fragen, Positiv- und
  Negativbeispiele sowie Remediation.

## Vor dem Upload anpassen

- `publisher`
- `status` und `approvals`, sobald echte Review-Artefakte existieren
- Scope-Werte für echte Zieltechnologien und Artefakte
- Regel-Constraints für projektspezifische Durchsetzung

## Validierung

```bash
npm install
npm test
npm run validate
```

Der Validator prüft unter anderem:

- referenzierte RuleSet- und Locale-Dateien
- Schema-Konformität
- Locale-/RuleSet-ID-Konsistenz
- doppelte Rule-IDs
- fehlende oder überzählige Lokalisierungen
- SemVer für `ruleSetVersion`
- Platzhalter-URLs in Governance-Feldern
- Relationships auf existierende Regeln
- Tags und Keywords in jeder lokalisierten Regel

## Consumer-Regel

1. `ruleset.yaml` laden
2. passende `i18n/<locale>.yaml` laden
3. falls nicht vorhanden, auf `defaultLocale` oder Basislocale ausweichen
