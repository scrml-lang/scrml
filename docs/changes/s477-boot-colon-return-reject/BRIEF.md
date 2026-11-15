# BRIEF — s477-boot-colon-return-reject

change-id `s477-boot-colon-return-reject`. scrml repo, BOOTSTRAP compiler (`compiler/self-host-v2/`).

## RULING + GOVERNING TEXT
bryan S477 (`/home/bmacs/scrmlMaster/scrml-support/user-voice-scrml.md` §S477 "⭐ RULED — tool main return type spelled ->"): a return type is written `->`; `): T` is newly rejected. SPEC §7 (~SPEC.md:8871): "`->` is the sole return-type annotation syntax"; §64 amended S477 (PR #1839).

## TASK
FAIL-OPEN found by lane s477-tool-arrow-return: the bootstrap SILENTLY IGNORES a written `) : T` return annotation (spaced form) — e.g. `function saveOrder(...) : number {` compiled as if it declared no return type. (`): number` unspaced is reported as a parse error, but verify.) A written type must never be dropped.
1. Find where the bootstrap parser reads a function head after the parameter list (`parse.scrml` parseFnDecl / function-head reader — PA-located-verify) and make BOTH `): T` and `) : T` (and any whitespace/newline variant, for `function`, `fn`, server functions, nested functions, lambdas/arrow if applicable, methods if any) a named compile error. Use an existing §34 code if one fits (check §34 for a return-annotation / E-PARSE code); otherwise E-PARSE-* the bootstrap already uses with a message that names the fix: "a return type is written `-> T` (§7) — write `function f(…) -> T`". Never a cascade, never silent.
2. Measure the corpus: compile every conformance case + samples + examples + stdlib with the bootstrap before and after; report every source that NEWLY fails (count + names). Non-zero outside the expected colon-return shapes → STOP and report (that is a separate ruling).
3. Tests: bootstrap unit tests for each spelling variant (error, message names `->`), a positive `->` control, and one conformance case `conformance/cases/fn/return-colon-spelling-neg` if impl#1 also rejects it — if impl#1 ACCEPTS `): T` (it does today), give the case an impl1 xfail pointing at a carried impl#1 gap you file: `g-impl1-colon-return-accepted-s477` (status deferred, S471 policy; no compiler/src change). If the new case throws in impl#1's host-global scan, pin it in `scripts/host-global-scan.known-throws.txt` (exact format, sorted; reason names this PR) and verify `bun scripts/host-global-scan.ts --check --mode-shard 1/2` and `2/2` exit 0.
4. Run slice-m4 + bootstrap conformance; report counts.
