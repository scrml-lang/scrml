# s482-value-no-write — progress

Lane: run-order model (c) — ruling:user-voice-scrml.md-S482-runorder-model-c ("yes, adopt (c) with
the riders"); study ~/.cache/scrml/review/s482-runorder-study/study.md. Bootstrap-only
(compiler/self-host-v2/), SPEC + gaps. Base: origin/main 30058448c. impl#1 not changed (S471).

- [x] merged origin/main a6889bf61 (#2092 on main): §22.5.2 INTERIM struck, gap
      g-boot-meta-let-write-in-construct-s482 resolved; mc.scrml pinned (value-no-write-s482.test.js)
- [x] 1. A1 — §6.15 value-position judge widened to file-scope `let`s (+ placeless initializers,
      runtime `^{}` in a construct (Q5 rider), writing locked-field / attribute default (Q13 rider))
- [x] 2. A2 — spine writers stay legal (tests: S479 tick(), S481 P1–P3)
- [x] 3. A3 (§34 row pending — step 5) — E-DERIVED-READS-UNTRACKED (§34 row, gen-bootstrap-severity)
- [x] 4. INTERIM removal: construct write-side enumeration cut to the `<request>` route only (Q6 hold not
      built — g-boot-request-runs-in-body-s482): new INTERIM g-boot-construct-request-write-s482.
      cell-seed-bound-s482.test.js retired → value-no-write-s482.test.js.
      Probes (~/.cache/scrml/review/s482-value-no-write/probes-{base,head}.txt, probes-diff.txt): 389 unique
      of 775 (p/ q/ s*/ xf/ of s482-2076/2079/2082*/2088 + 2092 mc.scrml): 62 same value, 54 same refusal,
      186 refused both (code moves), 86 value → refused (all E-VALUE-WRITES-STATE), 1 refused → value
      (2076 e-viafn: 5, the source order), 0 values changed.
      Corpus (2974 files): 1 newly rejected — conformance/cases/body-top/seed-computed-in-place (a seed
      calling `note`; rewritten); 0 newly accepted; 4 code moves (2 conformance neg cases updated to
      E-VALUE-WRITES-STATE; 2 gauntlet samples lose an E-FILE-SCOPE-INIT-IN-CONSTRUCT); 0 output diffs.
- [x] 5. SPEC §6.15 widened + A3 + riders; §7.6 (b) one-page model R1–R6 (old construct paragraphs struck);
      §6.7.4 write list amended; §34 rows (E-VALUE-WRITES-STATE, E-DERIVED-READS-UNTRACKED new,
      E-FILE-SCOPE-INIT-IN-CONSTRUCT); severity.scrml regenerated; s34-census PASS; claim-gate 0 failed
- [x] browser pins updated (rcdata-init-place / effect-deps-mount Chromium; measured 17 tests / 29 expects + 5 tests / 10 expects, all pass — r1 corrects the "27 + 23" the lane reported, #2096 review INFO)
- [x] gates (head 2d07faba1; base = merge base a6889bf61): pretest exit 0 both; bootstrap-conformance
      --json PASS 848 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 / INVALID 0 on both — 2 per-case
      emitted moves (the two acting-init neg cases, E-FILE-SCOPE-INIT-IN-CONSTRUCT → E-VALUE-WRITES-STATE,
      PASS both); corpus differential + byte-compare (2974): 1 newly rejected, 0 newly accepted, 0 output
      diffs; s34-census --check-new PASS (5 rows); types-gate OK (182 unchanged); corpus-compile-floor PASS;
      snippet-gate 0 failed; claim-gate 0 failed; gen-bootstrap-severity current; e2e-render-map 259 pass;
      pre-commit full suite + slices PASS on every commit. New test file red on base: 19 fail / 9 pass.
- [x] PR #2096 opened (not merged)

## Fix round r1 (#2096 review, S482)
- [x] merged origin/main (#2093 + bot regen; no conflicts)
- [x] HIGH-1: request INTERIM read side transitive (initReadWritten / ReadCx: A3 `reads` closure for bindings, `usesR` for cells, unresolvable call fails closed); q01/t08/t09/t10 + cell-via-call refused; positive twin k = 3 (happy-dom + Chromium); gap text states the rule, drops the component-renders claim
- [x] LOW-1: lockedWhat — "the default of prop `@cp.v`" / "the initializer of locked field `@card.v`" when no cell is read, directly or via callReach
- [x] LOW-2/3/4: SPEC rows, PA-reading labels, §22.5.2 cell-write direction note
- [x] INFO: seed-computed-in-place restored (non-writing seed `k + n`, place pinned by `n` 5 → 11 vs 9 after); writing seed split to seed-computed-in-place-writes-neg
