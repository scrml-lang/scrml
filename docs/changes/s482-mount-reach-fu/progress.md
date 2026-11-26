# s482-mount-reach-fu — progress

Lane brief: ~/.cache/scrml/review/s482-briefs/mount-reach-fu.md. Branch s482-mount-reach-fu from origin/main 3535bad9b
(#2112 merged). Source: #2112 r1 re-review ~/.cache/scrml/review/s482-2112-r1rev/review.md (F/U-1, F/U-2, NIT-2).
Artefacts: ~/.cache/scrml/review/s482-mrfu/ (base tree `base/` = git archive 3535bad9b, probes `p/` `p2/`, results, logs).
Bootstrap only (compiler/self-host-v2/); compiler/src untouched. Not touched: print.scrml constUse / clientConsts /
serverInitsRound / bodyInits clientRead (PR #2113); parse / fix-it text (lane s482-escapes-ruled).

Rulings: §7.6 R4 "A lazy shared instance is constructed at its first reference. Each is judged by R2 at the demand
point."; R2 "Code that runs at place p (or at a demand point p, R4) may reach … only bindings whose place is before p.
Otherwise E-SCOPE-001."; ⭐⭐ S482-runorder-model-c.

- [x] item 1 F/U-1 — CAPABLE FIX (7f3ae1bd2). print.scrml: `constructedElsewhere(p, marked)` counts a shared reference
      only where it may run before the body or outside its order — a function, a server function, a file-scope binding
      the body does not place, a declaration constructed elsewhere (transitively, `sharedIdsIn`). A reference in the
      program's body (display, attribute, statement, placed binding, program cell seed, the code of an instance the body
      mounts, `<*card/>`, a handler) is constructed where it stands — `shared_<decl>()` was already printed at the
      reference; only bodyInits' `pre` hoisted its reach. `reachOf` follows a shared reference into every field of the
      record (the whole instance is constructed at the first reference, R4). bodyInits' code path is the shared-instance
      construction path only (the `elsewhere` call); clientRead untouched.
      r01 / r12 / r14 `1|1` → `5|5`, r07 `2|1` → `6|5`, r08 after-click `1` → `5`.
      Not fixed (gap narrowed, still open): a FUNCTION referencing the instance still hoists (n02, n11 `1|1`); r10 / r11
      before-`k` not judged.
- [x] item 2 F/U-2 — analyze.scrml: resolveStarField refuses a `<*f/>` inside the markup it renders (starRendersSelf:
      direct, or through another already-resolved `<*g/>` — mutual pairs) with a named E-BOOTSTRAP-UNSUPPORTED; Rule C —
      not judged in a file with a parse error (failclosed.test.js debris twin). starReach keeps `stars` (the `<*f/>`
      element nids it is inside) and never walks one twice. s08 / s08b / c01 / c03: internal RangeError → named.
      New gap g-boot-star-self-render-s482 (LOW, INTERIM: no ruling names the construct).
- [x] item 3 NIT-2 — a14: "reads `@card.v`, a field of the shared instance of `<card>`, which is constructed at its first
      reference"; s06 / a18: "its mount runs a display in the markup `<card>`'s render shows through `<*ph/>`"
      (BodyCx.via).
- [x] item 4 — known-gaps: hoist gap narrowed (the a14 → r01 trap recorded; closed for body reads, still open when a
      function references the instance — n11); the resolved paragraph of g-boot-instance-mount-reach-later-binding-s482
      points at the narrowing. SPEC §7.6 R2 paragraph: INTERIM narrowed to a function's reference.
- [x] tests: slice-m4/instance-mount-reach-s482.test.js +10 (F/U-1 values, F/U-2 refusals + no-cycle twin, NIT-2),
      2 message expectations updated (a14, a18).

## Probe union (498: #2112 p, r1/p, r1rev/p, #2105 r1rev/r2rev/r3rev, #2082, #2096, lane m/), Chromium, main → head

257 same value, 233 same refusal, 5 value changes (all F/U-1 fixes, R4), 2 refusal-code changes (s08 / s08b: internal
crash → E-BOOTSTRAP-UNSUPPORTED), 0 VALUE→REFUSED, 0 REFUSED→VALUE. Lane probes (p/, p2/, 25): 14 value changes (all
R4 fixes), 2 crash → named refusal, the rest unchanged. Results: B.txt / F.txt, oB.txt / oH.txt.

## Gates (code at e80790595 + comments; base 3535bad9b)

| gate | result |
|---|---|
| pre-commit (SCRML_HOOK_SHARDS=8, 6144 MB) | PASS on every commit — 58579 pass / 0 fail |
| pretest | exit 0 |
| bootstrap-conformance --json | PASS 851 / FAIL 3 / CRASH 0 — identical to base (timing line only) |
| slices instance-mount-reach, seed-reach, outer-cell-place, value-no-write, body-run-order, handler-reach, runorder-followups | 234 pass / 0 fail |
| Chromium seed-timing + use-site-row (SCRML_BROWSER_TESTS=1) | 24 pass / 0 fail |
| corpus differential + byte-compare (2977) | 0 newly rejected / accepted, 0 code changes, 0 output diffs (326 ok) |
| s34-census --check-new --base 3535bad9b | PASS (no new/changed rows) |
| types-gate --check | OK, 182 unchanged |
| host-global-scan 1/2, 2/2 | 0 violations (1/2: 2 threw, 2/2: 162 threw — impl#1, untouched) |
| e2e-render-map | 259 pass / 0 fail |
| retired-forms-lint --base-ref 3535bad9b | OK, counts equal baseline |

## r1 (S483) — fix round on review s482-2116 (FIX-small)

- Merged origin/main (2d40d8407) into the branch, no conflicts. Merge proof: 3-way over the review's
  795-probe union (475 compile), hash-normalized artifacts: every probe the PR changed (19) and every
  probe main changed (15, #2113 write-only-secret family) is disjoint; merged == the changing side for
  each, == base for the rest. 0 bad.
- F1 reproduced on the merged tree (Chromium): x01 1|1, x01c 1|1 1, x12 1|1. Locus confirmed: reachOf's
  shared-ref branch pushed every field incl. derived. Fix: filter by `f3.wcap is given || constSeedField(p, f3)`
  (bodyInits' `pre` predicate). After: x01 1|5, x01c 1|5 5, x12 1|5; controls x01b 1|5, x01d 1|5 5 unchanged.
- Pinned: slice instance-mount-reach-s482 "F1" describe (x01, x01c, x12 + derived read before `k` still
  refused) — 3 red on 9fdaa7925, 38/38 green; new Chromium file
  compiler/tests/browser/shared-instance-reach-chromium-s482.browser.test.js — 3 red on 9fdaa7925, 3/3 green.
