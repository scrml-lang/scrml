# progress s476-boot-call-source-types

- 2026-11-08T09:40:43-07:00 start: startup checks pass; base f92d1a8fb == origin/main.

- 2026-11-08 done — survey. Locus HELD (refined): analyze.scrml `resolveEach` (each `in=` source typed by `r.x.ty`), `resolveIter`/`resolveIterSrc` (for-of), `recvType` (method/`.length` receiver). A named call resolves to `plain(not, …)` (resolveCall); recvType already typed a CALL receiver by the callee's declared `ret`, but the loop sources did not use it. An array literal resolves to its expected type only (resolveArray), so with no position type the receiver was untyped.

## Governing SPEC text
- §17.7.2: "**The `in=` value SHALL be a sequence (S440 ruling #3).**" (`<each in=expr>`, any expression)
- §49.3.5: "1. The iterable is evaluated once. 2. For each element, in the iterable's order, the binder is bound to the element and the body executes."
- §48.8: "`fn` declarations MAY carry an explicit return type annotation using the `->` syntax" … "When a return type annotation is absent: … The compiler infers the return type from the `return` statements."
- §66.3 rule 5 table: "(a) a **literal**: … and a non-empty sequence literal `[…]` whose elements are all such literals of one base type | the literal's (rule 3); `[1, 2, 3]` → `int[]`, `[1, 2.5]` → `number[]`" · "(g) a **call** `f(…)` of a function whose return type is DECLARED (`-> T`) or INFERRED-AND-PROVEN (below) | that return type"
- ⚑ PA reading: §66.3 rule 5 is written for own-value inference; I read its (a)/(g) typing of a literal / a declared-return call as THE type of that expression wherever the bootstrap needs one (a receiver, a loop source) — it is the only sentence in SPEC that types an untyped-position array literal. Not a language-surface change (both forms were already SPEC-legal; this is a conformance restoration).
- §66.12 `.join` on `int[]`: kept E-TYPE-031 (g-bootstrap-int-to-string-conversion-unruled-s469); a typed `int[]` local gets the identical message (pinned in the test).

## Changes (analyze.scrml)
- `recvType`: a literal receiver is typed by `literalType` (§66.3 rule 5 (a)).
- `resolveEach`: source type = `recvType` (call → declared ret, literal → its type). `resolveIterSrc`: `srcTyped` does the same for for-of.
- `LocalB` / `RowB` gain `via: string` — the untyped callee's name when a loop source is a call of a fn with NO `-> T` (srcWhy); `viaText` gives the INTERIM refusal at a member access / method call on that binder: "an each/for source that is a call …", naming `fn mk(…) -> T[]` and bind-first `const xs: T[] = mk(…)`.
- `litRecvText`: a method on an array literal that is not typed names why — empty `[]`, mixed base types (not INTERIM: not a tape of one type), or non-literal elements (INTERIM, typed-local workaround).
- provenance: no language-surface change; conformance restoration of §17.7.2 / §49.3.5 / §66.3 rule 5 (a),(g).

## Verification
- slice-m4/call-source-types-s476.test.js: base 3 pass / 10 fail (of the 13 then present) → after 15/15 pass.
- conformance --json: PASS 302→302, FAIL 243→244, UNSUPPORTED 658→657, CRASH 0→0. One case UNSUPPORTED→FAIL: match-leave/given-arm-in-lambda-body-reads-param-no-false-scope-error — `["p"].map(…)` is now a typed receiver so its E-BOOTSTRAP-UNSUPPORTED is gone; the case still fails on its pre-existing legacy-syntax parse errors + a forbidden E-SCOPE-001 that fired on base too. No PASS→FAIL.
- R26: repro 1 (each) and repro 2 (for) compile, node --check OK; repro 3 now gives exactly E-TYPE-031 (join on int[], ruled-pending) — sort is accepted; lotto analyzer output byte-identical before/after (it uses `@cell` sources, no workaround to remove), node --check OK.

## Deferred
- §48.8 inference of an UNTYPED callee's return for a loop source (and receivers). Path: `failableSuccs` already proves `!` fns' returns via `ownProvenReturn` (§66.3 rule 5 (g) "INFERRED-AND-PROVEN"); widening it to non-failable, non-server fns would type these. Refused INTERIM meanwhile.
- `const xs = mk()` (no annotation) leaves `xs` untyped in the resolver (resolveCall returns no type) — the same root; not in this brief.
