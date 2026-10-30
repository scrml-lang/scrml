# s473-boot-named-refusals — progress (lane B: D28 / D29 / D30)

Branch `s473-boot-named-refusals` off origin/main 2603affc6. Rulings: user-voice-scrml.md S473 D28/D29/D30
("your recs on all"); options in docs/changes/s473-spec-coverage/decisions.md; SPEC text PR #1682 (§62.2 grading
paragraph, §34.2 parser-spelling rows).

## Baseline (main 2603affc6, `bun scripts/bootstrap-conformance.ts`)
PASS 265 · FAIL 40 · NOT-TWINNED 685 · UNSUPPORTED 823 (bootstrap-unsupported 550 · parse-reject 273) · graded 305.

## Steps
- [x] D30 grader: parse-reject → FAIL; UNSUPPORTED only E-BOOTSTRAP-UNSUPPORTED; §34.2 parser spellings
      (E-PARSE-NO-NULL → E-SYNTAX-042, E-PARSE-STRICT-EQ → E-EQ-004) graded as the SPEC code.
      D30 alone: PASS 265 · FAIL 313 · UNSUPPORTED 550.
- [x] D29 re-codes (analyze.scrml): E-REACTIVE-003 → E-AUTH-001 (cell bound in a `?{}` write outside `server`);
      E-SCOPE-001 → E-STATE-UNDECLARED (`@x` read naming nothing); E-TYPE-041 → E-TYPE-043 (`return not` into a
      non-optional return); E-FN-003 → E-FN-004 (`fn` calls a clock reader / a `scrml:random` member).
      Tests updated (slice-m2 typer*, slice-m4 markup-failclosed/persist/server/core-additions, lsp boot-lsp).
- [ ] D28 named-refusal table (compiler/self-host-v2/refusals.scrml) + test
- [ ] module-case semicolons (e-import-002-*, e-export-001-*)
- [ ] regen docs/bootstrap-conformance.md, coverage rows, gaps
- [ ] gates, PR
