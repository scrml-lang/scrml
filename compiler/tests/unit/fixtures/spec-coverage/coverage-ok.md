# Bootstrap SPEC coverage (fixture)

## Totals

<!-- @generated:coverage-totals START (do not edit — `bun scripts/spec-coverage-check.ts --write`) -->
| status | rows |
|---|---:|
| BUILT | 1 |
| PARTIAL | 1 |
| REFUSED-LOUD | 0 |
| DEFERRED-RULED | 0 |
| N/A | 2 |
| SILENT-ACCEPT | 1 |
| SILENT-ABSENT | 1 |
| UNVERIFIED | 0 |
| **total** | **6** |

SILENT rows carrying a gap id: 2 of 2.
<!-- @generated:coverage-totals END -->

## §1 — Overview

| § | title | status | evidence | gap ids | note |
|---|---|---|---|---|---|
| §1 | Overview | N/A | prose | — | (P1) |
| §1.2 | A pipe \| inside a cell | BUILT | x.scrml:f; t.test.js | — | (P1) escaped pipe stays one cell |

## §2 — Widgets

| § | title | status | evidence | gap ids | note |
|---|---|---|---|---|---|
| §2.1 | Widget accepts junk | SILENT-ACCEPT | probe w.scrml | g-fix-open-one | (P1) |
| §2.2 | Widget lint | SILENT-ABSENT | grep = 0 | g-fix-narrowed, g-fix-open-one | (P1) |
| §2.3 | Widget half | PARTIAL | half built | g-fix-open-one | (P1) |

## Appendix A — Matrix

| § | title | status | evidence | gap ids | note |
|---|---|---|---|---|---|
| App. A | Matrix | N/A | summary table | — | (P3) |
