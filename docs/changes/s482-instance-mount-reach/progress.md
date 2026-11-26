# s482-instance-mount-reach — progress

Lane brief: ~/.cache/scrml/review/s482-briefs/instance-mount-reach.md. Branch from origin/main 153bd0334.
Gap: g-boot-instance-mount-reach-later-binding-s482 (MED).
Artefacts: ~/.cache/scrml/review/s482-instance-mount-reach/ (base tree `base/`, probes `p/`, logs).

- [x] read code: analyze.scrml bodyReachDiags / bodyElemReach / codeReach / cellReach
- [x] build: analyze.scrml mountReach — a component use judges the code its mount runs at the use's place
      (field seeds less the use's attributes, render displays / attribute values / statements, derived
      fields the render reads (instCellOf hop), nested instances; handlers / effects / requests not judged).
      BodyCx carries `at` (the mount's place) + the outermost use for the diagnostic. print.scrml untouched.
      Not touched: serverInitsRound / constReads (lane s482-write-only-secret).
- [x] tests: slice-m4/instance-mount-reach-s482.test.js (15); related slices 215 pass
- [x] probes: p/m (m01–m18) + y01–y04, y10–y13, z01–z09 base vs head in Chromium (m-base.txt / m-head.txt)
- [x] SPEC (§7.6 R2 mount paragraph, R1 NIT-1 list, §34 row, §66.7.6 pointer) / known-gaps (resolved)
- [x] small (a): §7.6 R1 newly-rejected list — derived→later-const (n09, n03b)
- [x] small (b): cherry-picked 6bacb5990 (seed-timing gates table) as b71504033
- [x] gates (table below)
- corpus: 2977 files, 0 newly rejected / accepted, 0 byte diffs (corpus-base.json / corpus-head.json)

## Gates (code at c564ce803, docs 2c071a9af; base 153bd0334)

| gate | result |
|---|---|
| pre-commit (sharded, slices ON) | PASS — 58543 pass / 0 fail |
| pretest | exit 0 |
| bootstrap-conformance --json | PASS 851 / FAIL 3 / CRASH 0 — 0 bucket/emitted diffs vs base (1973 cases) |
| slices seed-reach, outer-cell-place, value-no-write, body-run-order (+ runorder-followups, handler-reach, instance-mount-reach) | 215 pass / 0 fail |
| Chromium seed-timing + use-site-row (SCRML_BROWSER_TESTS=1) | 24 pass / 0 fail |
| #2105 probe sets r1rev/r2rev/r3rev (302 unique), head vs base | 205 same value, 94 same refusal, 3 VALUE→REFUSED (y10/y11/y12 copies — intended), 0 value changes |
| lane probes (37: y01–y04, y10–y13, z01–z09, m01–m18, i01–i02) | see the PR body |
| corpus differential + byte-compare (2977 files) | 0 newly rejected / accepted, 0 byte diffs among the 326 that compile |
| s34-census --check-new --base 153bd0334 | PASS (1 changed row, well-formed) |
| types-gate --check | OK, unchanged |
| host-global-scan 1/2, 2/2 | 0 violations each |
| e2e-render-map | 259 pass / 0 fail |
| retired-forms-lint --base-ref 153bd0334 | OK, counts equal baseline |

## Fix round r1 (review ~/.cache/scrml/review/s482-2112/review.md, verdict FIX)

Brief: ~/.cache/scrml/review/s482-briefs/fix-2112-r1.md. Branch verified at 47648f0bf before work.

### Reproduction on 47648f0bf (Chromium, review probe.mjs)

| probe | observed | finding |
|---|---|---|
| d/a18-field-renders | `{"o":"1","o2":"1"}` — compiles, silent wrong | MED-1 reproduces |
| a/a03-state-child | `{"o":"1","o2":"1"}` — compiles, silent wrong | MED-2 reproduces |
| d/a03b-state-child-display | `{"o":"1","o2":"1"}` — compiles, silent wrong | MED-2 (plain display) reproduces |
| d/a03c-state-child-in-decl | REFUSED E-COMPONENT-ENGINE-SCOPE, E-SCOPE-001 | (control) |
| a/a14-shared-instance-read | `{"o":"1","o2":"1"}` — compiles, silent wrong | MED-4 reproduces |
| a/a11-outer-derived-to-inner-attr | REFUSED E-SCOPE-001 ("a attribute value") | NIT-1 reproduces |

- [x] item 1 MED-1 — FIXED (c8d478b9a): analyze.scrml starReach walks the markup a `<*f/>` renders
      (MInline: a child field's own `renders`) where the `<*f/>` stands — in a mount at the use's place.
      a18 → E-SCOPE-001. r09 (field `renders` no `<*v/>` shows) stays legal (1 | 5).
- [x] item 2 MED-2 — FIXED (c8d478b9a): starReach also walks MStateView arm bodies; at body level at
      the `<*ph/>`'s own place (not where the state child is written). a03 / a03b / r05 → E-SCOPE-001;
      r03 / r04 (after `k`) legal, 5 | 5. Every arm judged (the conditional bound, item 3).
- [x] item 3 MED-3 — SPEC §7.6 R2 paragraph: ⚑ INTERIM, prov=pa-ruled, gap g-boot-conditional-mount-bound-s482
      (new known-gaps entry, LOW) with the capable alternative + who pays; §66.7.6 sentence qualified to an
      unconditional mount; m06 / m09 listed as refused by the bound (137f6b904, 6f599ce79).
- [x] item 4 MED-4 — PARTIAL FIX + GAP. Fixed (bounded, proven path): sharedReach — a read `@card` /
      `@card.v` of a shared instance constructs it at the read (R4); its seeds and a derived field's formula
      are judged there (a14 / r06 / r15 → E-SCOPE-001). NOT an outerCellOf extension: in the body walk
      outerCellOf never matches (cx.cells holds only body cells), and `@card` carries NInst, not NField.
      Remaining → INTERIM gap g-boot-shared-instance-reach-hoist-s482 (MED): the printer constructs a
      shared-referenced declaration before the body (print.scrml bodyInits constructedElsewhere → pre →
      reachOf), so the body bindings it reaches run at module init: r01 / r07 / r08 / r12 / r14 (a read
      AFTER `k`) still `1 | 1` — pre-existing on base, a run-order change in print.scrml is not bounded.
      Also not judged at their place: a read through a function (r10), `<*card/>` of the shared instance (r11).
- [x] item 5 NIT-1 — FIXED: "an attribute value (`w=` on `<inner>`) of `<outer>`" (a11).
- [x] item 6 — known-gaps resolved text narrowed to what is fixed; the rest in the two new gaps.
- [x] gates (below)

### r1 newly-rejected (vs base 153bd0334, beyond the PR head's set)

| probe | base (Chromium) | r1 | note |
|---|---|---|---|
| d/a18-field-renders | 1 \| 1 (wrong) | E-SCOPE-001 | MED-1 |
| a/a03-state-child | 1 \| 1 (wrong) | E-SCOPE-001 | MED-2 |
| d/a03b-state-child-display | 1 \| 1 (wrong) | E-SCOPE-001 | MED-2 |
| r1/r05-state-decl-after-star-before | 1 \| 1 (wrong) | E-SCOPE-001 | MED-2, `<*ph/>`'s place |
| a/a14-shared-instance-read | 1 \| 1 (wrong) | E-SCOPE-001 | MED-4 |
| r1/r06-shared-derived-before | 2 \| 1 (wrong; 6 \| 5) | E-SCOPE-001 | MED-4 |
| r1/r15-shared-static-const-after | 5 \| 5 (CORRECT) | E-SCOPE-001 | R4 demand point before `const k = 5` |

Refusal-code changes (already refused, +E-SCOPE-001): a03c, a07, a12, a17, m12, b11 — all already
refused on base; a07/a12/a17/m12/a03c already gained E-SCOPE-001 on the PR head (review table).

### Probe sets (475 unique: s482-2112/p + #2105 r1rev/r2rev/r3rev + #2082/#2088/#2096 + lane m/ + r1/p), head vs base

258 same value, 180 same refusal, 31 VALUE→REFUSED (the PR's set + the 7 above), 0 REFUSED→VALUE,
**0 value changes**, 6 refusal-code changes (above). Results: ~/.cache/scrml/review/s482-2112-r1/head-*.out.

### Gates (r1, code at c8d478b9a, docs 6f599ce79; base 153bd0334)

| gate | result |
|---|---|
| pre-commit (SCRML_HOOK_SHARDS=8, 6144 MB) | PASS on each r1 commit |
| pretest | exit 0 |
| bootstrap-conformance --json | PASS 851 / FAIL 3 / CRASH 0 — identical to base (only the timing line differs) |
| slice instance-mount-reach (24, +9 r1) + body-run-order, handler-reach, outer-cell-place, runorder-followups, seed-reach, value-no-write | 224 pass / 0 fail |
| Chromium seed-timing + use-site-row (SCRML_BROWSER_TESTS=1) | 24 pass / 0 fail |
| probe sets head vs base | 0 value changes; new refusals listed above |
| corpus differential + byte-compare (2977) | 0 newly rejected / accepted, 0 code changes, 0 output diffs (326 ok) |
| s34-census --check-new --base 153bd0334 | PASS (1 row, well-formed) |
| types-gate --check | OK, 182 unchanged |
| retired-forms-lint --base-ref 153bd0334 | OK |
| host-global-scan 1/2, 2/2 | 0 violations (2/2: 162 threw — same on base) |
| e2e-render-map | 259 pass / 0 fail |
