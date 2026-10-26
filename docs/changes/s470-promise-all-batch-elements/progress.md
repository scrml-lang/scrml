# s470-promise-all-batch-elements — progress

Lane: fix the client scheduler's `Promise.all` batch so a waiting call nested in a batched initializer is
awaited. Gap `g-promise-all-batch-puts-unawaited-call-under-sync-operator` (HIGH, S441c). Security fix
under the S435 impl#1 policy (security / bootstrap only). Base `ffbcf4432` (origin/main at dispatch).

## Governing SPEC (quoted from compiler/SPEC.md)

§13.2 (SPEC.md:10662, :10666):

> - The compiler SHALL insert `await` at every call site where a server-generated fetch call is made.
> - Server calls in the same function body SHALL be parallelized in generated code only when they are
>   independent (no data dependency between them) **and each of them is provably read-only**. Otherwise
>   they SHALL run in source order, each awaited before the next starts.

§13.2 carried impl#1 gaps (SPEC.md:10727): *"`g-promise-all-batch-puts-unawaited-call-under-sync-operator`
(a client function's parallel batch tests an un-awaited call under `?`/`!`/`&&`, object/array literals)"*.

§13.8 "The rule" (SPEC.md:11247):

> **The rule.** A waiting value SHALL stand only in one of two places:
>
> - **(i) At a suspension point of an action position, where the compiler awaits it.** The action positions
>   are the ones §13.7 lists under "What is not affected": an event-handler value, a function body (client
>   or server), … A suspension point is a place where the compiler can end a statement, wait, and resume
>   with what follows (§13.2 inserts the `await` there).
> - **(ii) As the initializer of a cell DECLARED `(not to T)`** (§13.9).

In a `const [a, v] = await Promise.all([e1, e2])` the only suspension point is the element ITSELF: an
element `isOk(p) ? x : y` has a waiting value under `?`, at no suspension point.

## Fix (compiler/src/codegen/scheduling.ts, scheduleStatements)

A decl may be a batch member only when its element (`extractInitExpr`, the whole initializer) is:
- **bare** — exactly one call, the whole initializer: non-optional, plain-name callee, arguments with no
  call anywhere. Its value is the binding; `Promise.all` awaits it (a sync callee's value passes through);
- **inert** — no call anywhere (literals, names, `@` reads, `!`/binary/ternary/member/index/array/object/
  spread/cast over them). A template literal with `${…}` is NOT inert (its interpolations are not on the
  enumerable tree) — fail closed.

Anything else is **mixed**. A mixed SEED batches with nothing; an INDEPENDENT mixed candidate ENDS the
batch (`break`, like a non-decl) — it is emitted in place by the existing sequential path (`emitLogicNode`
+ `_autoAwaitFnBody`, the U1 / S320 call-site await), and nothing after it is hoisted over it. A DEPENDENT
decl never joined, mixed or not, and keeps the S212 skip (so the transitive-TDZ fixture's `qtf` still
batches across `profiles = rows.map(…)`). The test is structural: it never asks whether a nested call
waits, so a callee the async-name facts miss (an async combinator, `globalThis.fetch`, a `!{}` IIFE, a
`match`, an escape hatch) cannot slip in un-awaited. Cost: only parallelism — a sync call under an operator
beside a server call now runs in place. TDZ exclusion (depClosure), the reassigned-`let` skip, the #165
control-flow fence, the non-decl break and the s441 cell-write rules are untouched.

Order: the "hoist bare calls, keep the operator outside" alternative was not taken — it needs temporaries
and re-emission of the operator around them, and it is not simpler; in-place keeps source order exactly.

## Shapes (security-failable-pack r21: s24 / f27 / l19 / t19 — 107 shapes)

See compiler/tests/integration/security-failable-pack/README.md "Measured (S470 s470-promise-all-batch-
elements)". f27 BAD 52 (26 × msg / gate): base 52 FAIL → head 50 PASS + 2 KNOWN_FAIL (h2/002, the
sequential `!{}` lowering — a sync IIFE whose arm returns the pending Promise; the same on base with no
batch). Controls 55: PASS → PASS on all four sides. No other side batches (scheduleStatements' only
caller is the client plain-function loop): the BAD shapes PASS on s24 / l19 / t19 on base, so they are
fullstack only.

## Status

- [x] fix + unit tests (compiler/tests/unit/s470-promise-all-batch-elements.test.js — 27 tests; 21 FAIL on base)
- [x] pack r21
- [ ] R26 corpus diff
- [ ] CI job commands
- [ ] merge origin/main
