# s476-boot-tape-inplace — progress (append-only)

## 2026-11-08 — start
- F4 checks passed: worktree `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-aa0286ee9c80eeabc`, HEAD == origin/main == f92d1a8fb, tree clean, bun install + pretest done.
- First commit c6afb2cae (BRIEF.md). Hook baseline on that commit: 47411 pass / 125 skip / 13 todo / 0 fail (1198 s).
- Conformance baseline (`bun scripts/bootstrap-conformance.ts --json ~/.cache/scrml/s476-boot-tape-inplace/conf-base.json`): 1827 attempted, PASS 302, FAIL 243, NOT-TWINNED 624, UNSUPPORTED 658, CRASH 0.

## Governing SPEC sentences (quoted)
- §66.10 item 1: "**AXIOM: scrml has value semantics.** A binding, argument or field initialized from a cell (or from any value) holds a **snapshot** of that value."
- §66.10 item 2: "No write to a source is observable through a value taken from it earlier; no write through such a value is observable in its source — except item 4."
- §66.10 item 5 (non-normative): "The implementation lean is copy-on-write, so a snapshot costs nothing unless mutated. The copy strategy is not part of the contract."
- §66.12.1: "Non-mutating operations (`map`, `filter`, `slice`, `concat`, `find`, `some`, `every`, `reduce`, …) are always allowed; they return new values."
- §66.12.6 rule 3 (as carried in the s475 test header): "A tape is edited in place only by the methods named for the grant each one uses … Each method is a write: it is checked against the target's grants exactly as a whole-value write is".
- §19.16.2 (defer): a deferred body runs when the block is left — "a `return` (after the value is evaluated)".
- Conclusion: the copy strategy is explicitly NOT part of the contract (item 5), so an in-place write is legal exactly when it is unobservable (items 1-2). No language-surface change: no program's acceptance or meaning changes. provenance: n/a (implementation-only; semantics-inert).

## Locus check (PA-located-verify)
- `runtime.js:2425 tapeAppend` — HELD (copyOf + push).
- `runtime.js ~:1476 writePath` — HELD (line 1476; `obj.slice()` per step).
- `sortBy` / `tapePrepend` / `tapeConcat` — HELD (copy per call). Those are VALUE ops (a new tape is their meaning) except tapePrepend as a local edit, which this lane covers.

## Base measurements (bun + happy-dom, this machine)
- new test `slice-m4/tape-inplace-s476.test.js` on base: section A (alias shapes) all green; B (printed shape) red by design; C: 100,000 appends in a pure fn = 4941 ms; 2 x 100,000 slot writes on a 10,000-slot table + 20,000 appends = 1433 ms.

## Design (chosen: (a) compile-time proof + a per-binding ownership flag; NOT a runtime refcount)
- The decision is made in the printer on Core (print.scrml), per function body (`ownedLocals`), flow-INsensitive and whole-body: a `let` local is OWNED when every read of it anywhere in the body is one that keeps no reference to its value. Kept-nothing reads: `Prim` receivers of Length / IndexRead / AtRead / Join / TapeIncludes / IsSome / IsNot / SortNum / SortStr / Reverse / the Tape* edits (arg 0), EqStruct / NeqStruct / TapeConcat (both), a `map`/`filter`/`some`/`every`/`sortBy` receiver whose function is a Lambda of <= 2 params (JS passes the array itself as a 3rd arg), `return x`. EVERYTHING ELSE reached by the generic walk (call argument, binding init, cell write, struct / tape element, `for … of` iterable, `match` scrutinee, a Lambda body returning it, Lift, Fail, server call) disqualifies the local for the whole body — so a read in iteration k and a write in k+1 can never meet. A `defer` body referencing it disqualifies it (a defer runs after `return` evaluated its value). A local bound or assigned in a counted-loop head, or by an assignment-expression, is disqualified (those print elsewhere).
- Fresh vs not: a binding of a FRESH value (array / struct literal, or a Tape* / sort / reverse / map / filter result — each a new object) needs no flag (`rt.tapeAppendOwned(true, xs, v)`); a local ever bound to a non-fresh value (a parameter, a field read, a call result) carries `xs$own` — false after such a binding, true after any edit (each edit's result is a new object when it copied) — so the FIRST write copies and the rest are in place.
- Why not a runtime owned flag on the array (option b): ownership is a property of the BINDING, not the object; a returned array would carry its flag into a caller that aliases it (`let ys = f(); let zs = ys`) — fail-open. Rejected.
- Client functions that WAIT are not optimized (their bodies print as continuations; out of scope — copy, as before). Server bodies print natively (await inline) and are optimized.

## next
- runtime helpers (+ server-runtime exports), print.scrml analysis + printing, run tests, conformance, R26.

## 2026-11-08 — implementation landed in the tree (uncommitted until the slice run is green)
- runtime.js: `tapeAppendOwned` / `tapePrependOwned` / `tapeDropEndOwned` / `tapeDropFrontOwned` / `tapeRemoveAtOwned` / `writePathOwned` (owned=false is the copying writer exactly; a step the copying writer refuses is delegated to it so the trap text is identical and nothing is written). server-runtime.js re-exports them.
- print.scrml: `ownedLocals` (the proof), `letStmtsJs` / `assignStmtsJs` (printing), Ctx.owned (set by fnJs for non-waiting client fns, serverFnJs, envelopedFnJs; [] everywhere else). walk.scrml: `nodeKids` (an importable alias of `kids`; print.scrml has `kids` locals).
- Extension after reading the R26 app: `return { a: x, b: [y] }` — a local held by a struct / tape literal the `return` builds is safe exactly as `return x` is (the frame ends; defers are already excluded). The lotto app's `learn()` returns its eight tables that way.
- New test file first run after: 29/29 green. 100,000 appends: 4941 ms -> 1.2 ms; 2 x 100,000 slot writes on 10,000 slots + 20,000 appends: 1433 ms -> 3.6 ms.
- R26 first pass (before the return-literal extension): base and after both `ALL CHECKS PASSED` on the app's own tests/verify.mjs; `node --check` ok on all 8 emitted .js. after-build: 41 owned edits, 16 copies left (out_11 passed to `freshLine` — a real escape; `next`/`ways` in patternChance — `ways = next` aliases; the rest returned in struct literals -> fixed by the extension).
