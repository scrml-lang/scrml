# s482-rulings-records — progress

Lane: records + small code for the S482 owner rulings of 2026-11-24 (user-voice-scrml.md, S482 section).
Branch `s482-rulings-records` from origin/main a81d8cc80. Bootstrap-only (compiler/self-host-v2/); compiler/src/ frozen.

## Items

1. S482-circular-server-only (Q1) — §7.6 rule (b) sentence. No code: the bootstrap's `serverInitsExposing`
   (print.scrml) already iterates to the greatest fixed point; probe s482-2061-r1rev p/f1 compiled on a81d8cc80:
   `zz-f1-h` only in program.server.js (reading B). Pinned by client-roots-s482.test.js d2.
2. S482-meta-get-typed (Q4) — §22.5.1 row; conformance meta/meta-proto-cell-name-pos cell → `"c"` (PASS on the
   bootstrap, was FAIL); gap g-boot-meta-get-typed-cell-s482 resolved.
3. S482-meta-let-write (Q5) — §22.5.2 sentence; residue gap text updated; tests in meta-runtime-s482.test.js.
4. S482-mixed-alternates (Q7) — §18.2 sentence; bootstrap already accepts `.Draft | not` and refuses `.Draft | 3`
   (E-TYPE-028); tests in match-alternation-s482.test.js; carried impl#1 gap for its E-PARSE-001.
5. S482-typeinfo-empty-list (Q9) — §22.5.4 ⚑ OPEN replaced; gap resolved; carried impl#1 gap.
6. S482-of-adjacency (Q2) + S482-is-qualified-variant (Q3) — BUILT: lex.scrml `dotLastKind` (`of` like `as`),
   parse.scrml `qualVariantTest` (accept, qualifier kept on the arm pattern; analyze's §18.13 check judges it).
   Tests in selfhost-residue-s482.test.js.

## Log

- records: SPEC §7.6 (b), §18.2, §18.17, §22.5.1, §22.5.2, §22.5.4, §49.2.4 with provenance; known-gaps:
  4 gaps resolved (meta-get-typed, typeinfo-absent-member, of-name-member-read, is-qualified-variant),
  residue gap text updated, 2 carried impl#1 gaps (g-impl1-mixed-alternates-refused-s482,
  g-impl1-typeinfo-absent-member-s482); coverage rows §22.5 / §18.17 / §49.2.4.
- impl#1 test compiler/tests/unit/meta-final-s458.test.js reads the case file: expects `<p>c</p>` now.
- hook: first attempts failed on load (shard timeouts, stale `_tmp_server_fn_calls` from killed shards);
  one real failure — corpus-bridge requires each carried gap to be pinned by an xfail case: added
  conformance match-codes/match-mixed-alternates-not-pos and meta/meta-typeinfo-absent-member-empty-pos
  (impl#1 xfail signatures captured with `conformance/run.ts --xfail-signature`).
- a8f5b8add committed (hook PASS: 58195 pass, 0 fail, SCRML_HOOK_SHARDS=5).

## Gates (base a81d8cc80 vs head a8f5b8add)

| gate | result |
|---|---|
| pre-commit hook (full suite) | PASS — 58195 pass / 0 fail |
| bootstrap-conformance --json | PASS 845 → 848, FAIL 4 → 3 (meta-proto-cell-name-pos FAIL → PASS; +2 new cases PASS), CRASH 0 |
| corpus differential (2974 files: examples, samples, benchmarks, conformance/cases) | 0 newly rejected, 0 newly accepted, 0 code changes; html/js/server byte-identical |
| s34-census --check-new --base a81d8cc80 | PASS (no new/changed §34 rows) |
| types-gate --check | OK — 182 diagnostics, unchanged |
| corpus-compile-floor --check | PASS |
| snippet-gate / claim-gate | 120 pass, 0 fail / 26 pass, 0 fail |
| spec-coverage-check | 0 violations (4 pre-existing warnings) |
| e2e-render-map | 259 pass, 0 fail |

Artifacts: ~/.cache/scrml/review/s482-rulings-records/ (conf-base/head.json, corpus-base/head.json, h/).

- code + tests committed (items 4, 6, 3 tests); targeted test files green (selfhost-residue 20/20,
  match-alternation 34/34, meta-runtime 43 pass / 4 skip).

## r1 (fix round — #2092 review ~/.cache/scrml/review/s482-2092/review.md)

- 0: merged origin/main (SPEC §7.6 hunk: main's line + the S482 largest-set sentence; known-gaps: main's new entries kept, the meta-get entry kept resolved). ad3ef2a4d.
- MED-1: §22.5.2 let-write narrowed to a spine place + re-runs; inside a construct SHALL NOT write (S482-runorder-model-c rider Q5), ⚑ INTERIM not yet built (lane s482-value-no-write, A1); gap g-boot-meta-let-write-in-construct-s482 (probe p/mc.scrml).
- MED-2: §18.17 says only what the ruling says; (a) `T | not`, (b) non-enum / no type → E-TYPE-VARIANT, (c) `m.T.V` labelled prov=pa-ruled lane decisions; false §18.13 wrong-enum citation struck; §34 E-TYPE-VARIANT row covers `is T.V`.
- LOW-1: §49.2.4 direction corrected to newly-rejecting at most; E-PARSE-EXPR hint for an operand touching `of` (parse.scrml parsePrimary fallback).
- LOW-2: client-roots d2b pins probe f1; §7.6 provenance cites d2b.
- LOW-3: `x is m.T.V` accepted (parse.scrml isQualVariantTest / qualVariantTest via nsHeadAt); alias case message "no type `T` is in scope here — … under another name (an import alias)" (analyze.scrml plainArm, shared with match arms).
