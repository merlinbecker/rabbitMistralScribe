# Code Quality Report

## Quality Metrics Radar

```mermaid
---
title: "Code Quality Metrics"
---
radar-beta
  axis s["Sich"], r["Zuv"], m["Wart"], c["Abd"], d["Dupl"], l["LOC↓"]
  curve p_11_11_9k_LOC_["11.11 (9k LOC)"]{5, 3, 5, 0, 5, 1}
  curve p_12_11_8_3k_LOC_["12.11 (8.3k LOC)"]{5, 3, 5, 1, 5, 5}
  curve p_13_11_8_3k_LOC_["13.11 (8.3k LOC)"]{5, 3, 5, 1, 5, 5}
  curve p_Aktuell_8_6k_LOC_["Aktuell (8.6k LOC)"]{5, 3, 5, 1, 5, 3}
  max 5
  min 1
```

## Current Metrics

| Metrik | Aktueller Wert | Bewertung |
|--------|----------------|-----------|
| Security Rating | 1.0 | 🟩 |
| Reliability Rating | 3.0 | 🟨 |
| Maintainability Rating | 1.0 | 🟩 |
| Coverage | 16.6% | 🟥 |
| Code Duplication | 2.4% | 🟩 |
| Lines of Code | 8617 | 🟨 |

## SonarCloud Badges

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)

[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=coverage)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=merlinbecker_rabbitMistralScribe&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=merlinbecker_rabbitMistralScribe)

Generated on: 2025-11-13T14:06:35.880Z

> Fenster: offset=1, count=3. LOC relativ: min=8304 → 5, max=9027 → 1. Labels: dd.mm (deutsch) + kurze LOC (k).