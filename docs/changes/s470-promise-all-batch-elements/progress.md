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

## R26 (scripts/corpus-emit-differential.ts; roots examples,samples,conformance,stdlib,benchmarks,compiler/samples,docs)

Base = `git worktree` at ffbcf4432 (~/.cache/scrml/s470/laneJ/basewt), head = 2c0957381; each tree's own
in-tree stdlib. 3618 sources enumerated on both sides, same set.
- Compile outcome: 0 newly failing / 0 newly passing; 0 diagnostic-code changes; 0 text-only changes.
- Syntax (effective goggles): 0 failing on both sides; 0 load-context changes.
- Bare client server-fn call sites: base 49 → head 37 (−12, in 6 sources — the call sites now awaited).
- Artifact content diffs: 214 of 11068. 202 are `*.server.js` files whose only difference is the
  absolute compiler root embedded in them (+29 bytes = the length difference of the two roots; identical
  after replacing each root with `<ROOT>` — ~/.cache/scrml/s470/laneJ/r26check.mjs). The other 12 are
  6 programs × (client.js + html), every one a reproducer of THIS gap:
  - docs/changes/s441-async-escape-f4-f5/repro/blast-fnbody2.scrml — `[isOk(1) ? "t" : "f", isOk(1) && true]`
    batch → two in-place awaited decls;
  - docs/changes/s441-async-escape-f4-f5/review-repro/c-batch-{and,arr,not,obj,ternary}/case.scrml — the
    review's five reproducers: `{b: isOk(2)}` / `[isOk(2)]` / `!isOk(2)` / `isOk(2) && …` / `isOk(2) ? … : …`
    batch element → the bare `const a = await isOk(1)` then the operator decl awaited in place.
  - Each html diff is only `data-scrml-build`, the build id derived from the client bundle's content (it
    also changes the `_scrml_build_admit` / `_scrml_build_owns` literals in the client.js).
  No other program in the corpus changed: no batch in examples / samples / benchmarks / stdlib held a
  "mixed" independent decl, so the §13.2 parallelism of the corpus is unchanged.

## Status

- [x] fix + unit tests (compiler/tests/unit/s470-promise-all-batch-elements.test.js — 27 tests; 21 FAIL on base)
- [x] pack r21
- [x] R26 corpus diff (above)
- [x] CI job commands (on 2c0957381), all rc=0: types-gate --check (181 diagnostics, unchanged); root
  `compiler/tests/*.test.js`; snippet-gate; claim-gate; corpus-compile-floor --check; gen-md-shim --check;
  conflict-marker-gate; regen-spec-index --check; delta-lint; ci-shards needs; s34-census --check-new
  --base origin/main (no new §34 rows); unit + conformance 31792 pass / 0 fail; integration + lsp +
  commands 10969 pass / 0 fail; TodoMVC compile + node --check; browser-baseline --check (name set
  matches, 8 asserted); slices (lint + m1 / m2 / m1-lowered / m3 / m4 / codec); e2e-render-map 259 pass;
  host-global-scan --check (0 violations); gen-bootstrap-severity --check.
- [x] merged origin/main 4cefa45c2 (#1568 s470-bang-catch-try-body r10 n29/s13/f16/l8/t8 +360): the pack
  count / README conflicts resolved to 3561 shapes (3454 + 107); r21 re-classified after the merge —
  identical (f27 50 FAIL→PASS, 2 KNOWN_FAIL, 55 controls PASS).

## Candidate gaps (not filed — known-gaps.md is the PA's)

- `g-value-position-bang-arm-server-call-sync-iife-s470` — an expression-position `!{}` whose subject
  is a local `!` function and whose arm calls a server function lowers to a SYNC IIFE whose result is
  the pending Promise (`(() => { … r = _scrml_fetch_isOk(p) … })() ? …`), so the wrong password logs in.
  Base, no batch (review p5 shape compiled on ffbcf4432). The h2/002 shapes are KNOWN_FAIL on it.
  Locus: the guarded-expr value lowering (emit-logic / emit-expr), not scheduling.ts.
- The decl batch's array element is still `extractInitExpr` (a plain `{ mode: "client" }` ctx), not the
  statement's own emit context (map / set / synth-cell / engine facts). Only bare and inert elements reach
  it now; a bare call's argument or an inert `@m[k]` read could still lower differently from the
  sequential path. Not measured to fail; worth a probe.
- `scripts/corpus-emit-differential.ts` compares `*.server.js` byte-exact while the bundle embeds the
  absolute compiler root: two checkouts at different path lengths report every server bundle as
  differing (202 here). Normalising the compiler root in artifacts (as the stream path already does)
  would remove the noise.

## Fix round 1 (review of 03a2ef2ed: FIX)

- **F1 (HIGH, landing order):** an expression-position `!{}` whose value IS the waiting value, next to a
  seed (review s1 R1/R3/R4/R5). On base it was a batch element that `Promise.all` resolved by accident.
  Since round 0 it is mixed, emitted in place, and hits the sync-IIFE defect. Lane
  s470-nested-handler-await fixes that root defect, so this lane lands AFTER lane I. No change to
  scheduling.ts here. After lane I lands: merge, delete the two h2/002 KNOWN_FAIL entries, and add R1–R6
  to r21, pinned PASS.
- **F2 (HIGH, pre-existing):** a batch element was re-emitted by `extractInitExpr` under a bare
  `{ mode: "client" }` context, so `@deny[p]` on a map cell lowered to `_scrml_cs_reactive_get("deny")[p]`,
  which is undefined, and the deny-list missed. Now each decl member's element is the RHS of its own
  `emitLogicNode` emission:
  - The statement was already emitted at that point, so the emission count and order are unchanged.
  - A bare member's one leading `await` is dropped, because `Promise.all` awaits the element.
  - If a member's emission is not one clean `const|let NAME = <rhs>;` line with no `await` left (a
    refinement check, a multi-line lowering), the whole group falls back to the sequential emissions in
    source order. This fails closed.
  - Review s2 M1/M2: FAIL on base and on 03a2ef2ed, PASS now.
- **F4 (LOW):** a destructuring decl (the name is a pattern) is no longer decl-shaped for the batch. It is
  a boundary and is emitted in place. Review s1 B4/B5: E-CODEGEN-INVALID-LOGIC on base, PASS now.
- **F5:** pack shapes added — B6, B7, B8, B9, B11, B19 from s1 and I4 from s3. All FAIL on base and
  PASS on head.
- **F3:** left alone, per the coordinator (S212 dependent-skip ordering; the PA is filing it).
- **r21:** +22 shapes on f27 (F5 7, F2 2, F4 2, each in msg and gate views); pack total 3583. f27 on
  base → head: 68 FAIL→PASS, 2 FAIL→FAIL (KNOWN_FAIL h2/002), 4 PASS-REFUSED→PASS (F4), 22 PASS→PASS.
  s24, l19 and t19 are unchanged.
- **Unit tests:** +4 (F2 ×2, F4 ×2), all 4 FAIL on base.
- **R26 (round 1, head 9ad6d4d2f vs base ffbcf4432, 3618 sources):** identical to round 0.
  - 0 compile or diagnostic changes; 0 syntax deltas; bare call sites 49 → 37.
  - 214 artifact diffs: 202 are path-only `*.server.js`, and the other 12 are the same 6 gap reproducers.
  - Taking the element from the statement's own emission is byte-identical for every other batch in the
    corpus.
- **WAITING** for lane s470-nested-handler-await (lane I) to land on main. Then: merge, delete the two
  h2/002 KNOWN_FAIL entries, add F1 R1–R6 pinned PASS, and re-run f27 / r21 / R26.

## Merge of lane I (#1576) and the F1 landing

- **Merge:** origin/main at 8e6f2063f+ (#1571 r16, #1572 r20, #1575, #1576 r18). `scheduling.ts`
  auto-merged. Lane I's `holdsExprGuard` (an expression-position `!{}` whose arms name a waiting function
  is an `isControlFlowBoundary`) and this lane's element-shape test compose like this:
  - The guard rule runs first and is a hard boundary for any such statement, dependent or not.
  - The element rule then keeps every other call-under-operator decl from being an element: an
    independent one ends the batch in place, and a dependent one keeps the S212 skip.
  - A guard decl that slips past both (sync-only arms, a bare guard call) gets its element from its own
    emission (F2). A multi-line or awaited guard lowering is not a clean element, so the group falls back
    to sequential.
- **Pack conflicts:** pinned-class.js keeps R20 and R21; README keeps both rows and sections;
  EXPECTED_SHAPE_COUNT was re-summed from a `loadFamilies()` run: 5195 (5050 on main + r21 145).
- **Lane I's unit test "R3: a sync-only expression guard is still batched"** asserted that
  `const b = (local(p) !{ _ :> false }) == true` between two server calls rides the batch. Under this lane
  that decl is "mixed" (a call under `==`): it is emitted in place and ends the batch. That loses only
  parallelism; it is the fail-closed rule's documented cost. I restated the test to keep R3's
  discriminating property:
  - The guard decl is now DEPENDENT (`local(a)`). A sync-only guard there is skipped and the neighbours
    still batch.
  - A new twin with a waiting arm is a boundary, so there is no batch.
  - Both pass; the twin fails if `holdsExprGuard` is removed.
  This is the one edit to another lane's file: compiler/tests/unit/nested-handler-await-s470.test.js.
- **KNOWN_FAIL:** both h2/002 entries deleted. They PASS now.
- **r21 +16 (F1):** R1, R1 no batch, R3, R4, R5, R5b, R5 no batch and R6 no batch, each × msg / gate, all
  pinned PASS. R2 / R2b are E-TYPE-025 on every tree and are not added. The F5 shapes were already in.
- **f27 on base ffbcf4432 → head (112 shapes):** 74 FAIL→PASS, 34 PASS→PASS, 4 PASS-REFUSED→PASS; 0 FAIL
  at head. s24, l19 and t19 are 11 PASS→PASS each.
- **Reviewer probes at head:**
  - s1: every R and B shape PASS or PASS-REFUSED, except B18 (`isOk(p) is not`), which logs in by the
    probe's own logic on every tree (false is not absent).
  - s2: M1, M2 and both nobatch twins PASS.
  - s3: I1–I4 PASS.
- **Re-pinned 4 r16 / f22 shapes** (lane s470-unit-variant-tag-read): "22 H1 object pattern default",
  "array pattern default" and "default member of an object" go PASS-REFUSED → PASS; "default literal key"
  goes PASS-REFUSED → PASS-DENY.
  - They were refused only because the batch emitted a destructuring decl as a `const [...]` name, which
    is invalid JS (E-CODEGEN-INVALID-LOGIC); that is exactly F4. Their no-batch twins compile on main.
  - The PASS-DENY one now reaches a pre-existing defect that its twin also has on main: a quoted key in
    a pattern default loses its quotes (`{ a = x["variant"] }` → `x[variant]`). That is a ReferenceError,
    so it fails closed.
  - Candidate gap: `g-pattern-default-quoted-key-unquoted-s470`.
  - Full pack run before the re-pin: 5194 pass / 4 fail (exactly these 4).
