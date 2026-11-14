# BRIEF — s477-tool-arrow-return

change-id `s477-tool-arrow-return`. scrml repo: a SPEC text amendment + mechanical conformance-case migration. No compiler source changes.

## THE RULING (bryan S477, verbatim in `scrml-support/user-voice-scrml.md` §S477 "⭐ RULED — tool `main` return type spelled `->`")
SPEC §64 is amended to `->`: `function main(args: string[]) -> number`. §7's "`->` is the sole return-type annotation syntax" governs; `): number` in §64 / §64.2 was a stray spelling. Newly-rejecting for `): T` returns; legacy cases migrate mechanically (`): T` → `-> T`).

## TASK
1. SPEC: replace every `): number` / `): T` return spelling in §64 (and any other SPEC section that shows a `function …(…): T` RETURN annotation — grep the whole SPEC for `\): *[A-Za-z]` in function-signature context; do not touch parameter annotations `x: T` or object literals) with `-> T`. Add under the §64 heading a `> **Amended S477:** … ` line + `> **Provenance:** ruling:user-voice-scrml.md S477 "⭐ RULED — tool main return type spelled ->" · supersedes: the §64 / §64.2 `): number` spelling`. If the SPEC elsewhere (e.g. §34 E-TOOL rows, §68 DRAFT examples, kickstarter docs under docs/) shows `): number`, fix those too and list them.
2. Conformance: migrate every case under `conformance/cases/` whose source uses a `): T` return spelling (the known 9: print/tool-println-clean-stdout, server-fn/session-value-in-tool-neg, sql/prepare-tool-in-block-e-sql-006-neg, and six foreign/* slice cases — find them all by grep). Rewrite ONLY the return spelling; keep each case's expected codes/outcome unless the expected outcome itself depended on the spelling (report any such case and do not guess — STOP and report it). Also grep `samples/`, `examples/`, `stdlib/`, `docs/` for `): number`-style tool mains and migrate those that are scrml sources.
3. Verify: `bun conformance/run.ts` (impl#1) — no new failures vs base (impl#1 also must accept `->`; if impl#1 REJECTS `-> number` on a tool main, report it — do not change compiler/src); `bun scripts/bootstrap-conformance.ts` — report bucket deltas (the bootstrap on main may not build kind=tool yet — #1828 is landing it; report what you see). `bun scripts/host-global-scan.ts --check --mode-shard 1/2` and `2/2` exit 0 (pin nothing new without reporting it).
4. Do not hand-edit generated blocks (SPEC-INDEX totals, docs/generated/*, FACTS).
