# s478-conf-semicolon-migration — progress

Lane: migrate conformance case SOURCES to `;` termination (SPEC §7.2.2 rules 1/3/8, S469 dpa-073
F1/F3/F5) and `,` arm separators (§18.2 S469 amendment, dpa-073 F2), so the bootstrap stops
rejecting them for E-STMT-MISSING-SEMICOLON / E-MATCH-ARM-SEPARATOR. Case-side only; no compiler code.

## Method
- Candidates: every case whose bootstrap verdict (base `bun scripts/bootstrap-conformance.ts --json`)
  emitted E-STMT-MISSING-SEMICOLON (163), plus the arm-separator cases.
- Tool (out of tree, `~/.cache/scrml/review/s478-semi/tool/semi2.ts`): insert `;` at the bootstrap's
  own E-STMT-MISSING-SEMICOLON spans in the LEGACY source (case + aux), iterate; then twin the source
  (`twinOf`, the harness's test-time §66 twin — twins are generated, never committed) and map the
  twin's spans back to identical legacy lines; iterate.
- Skipped: cases asserting E-STMT-MISSING-SEMICOLON (negative tests of the rule); rule-8 INTERIM
  `return⏎expr` / `lift⏎expr` sites. A bare `return` directly before `}` became `return;` (no value
  follows, so the meaning is unchanged — TRIAGE L1 "`return }` → `return; }`").
- Hand review of every inserted line; reverted bootstrap misreads (`props={ label;: string }`,
  `function(v); {`, `for=Signup;`, `yield; 99;`) and hand-migrated those statements where clear.

## Status
- [x] edits applied and reviewed
- [x] impl#1 `bun conformance/run.ts`: 1750/1868 pass, 118 xfail — identical per-case to base
- [x] bootstrap: PASS 422 → 428, FAIL 142 → 136, 0 PASS→FAIL
- [x] commits by directory batch (4 batches, hook green each)
- [ ] PR
