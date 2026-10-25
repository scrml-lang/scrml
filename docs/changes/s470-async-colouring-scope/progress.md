# s470-async-colouring-scope — progress

Gap: `g-impl1-async-colouring-ignores-local-shadow-s469` (HIGH, security). Base `6081e0685`.
Policy: S435 — an impl#1 fix for security.

## What the over-colouring caused (measured on base, pack families s12 / f15 / l7 / t7)

- fullstack client: a helper whose only `check(…)` call names a LOCAL that shadows `server function
  check` was coloured async. After #1547 / #1554 that is fail-CLOSED: a render gate / derived cell over
  the helper is E-VALUE-SERVER-CALL, a parameter default E-PARAM-DEFAULT-AWAIT (32 shapes refused on base,
  accepted and correct on head). The shadowed call itself was emitted `await check(p)`.
- library: the helper's export became `async` (a Promise to a JS consumer); a parameter default over it
  refused (10 shapes).
- tool: same over-refusal (10 shapes), AND a fail-OPEN of the same root in the other direction: every
  tool function body shared one `declaredNames` set, so a `const check` in ONE function made a LATER
  function's call of the async `check` read as that local; it was emitted without `await` and tested a
  pending Promise — `t7/dual shadow in a sibling top-level function, direct`: FAIL on base, PASS on head.
- server: no observable change (the server's in-process peer awaits do not read this colouring).

## Fix

1. `collectFreeCalleeIdents` (emit-library-shared.ts) — the colouring's callee walk resolves each call
   against the function's own scopes through `walkScoped` (local-async-fns.ts; the scope model
   free-name.ts and the nested-helper marks already share). New `walkScoped` options:
   `stopAtNestedFns` (the guarded library walk), `skipRootParams` (defaults stay out of the body walk, as
   before), `sequentialLocals` (a `let`/`const`/`lin`/tilde local shadows only the calls after its
   declaration — the body emitter's `declaredNames` resolves a call that way, so a call before the
   declaration keeps the outer function's colour). Unmodelled binders (destructuring, loop, match arm)
   stay FREE: the fail-closed direction.
2. `computeAsyncFnNames` reads it; the guarded walk's directly-called nested helpers contribute their own
   FREE callees (which helpers are reached is still read by name).
3. The text-level await injector (scheduling.ts `_autoAwaitFnBody`) drops, in a SYNC host only, the names
   the body calls only as a local (`locallyBoundOnlyCalleeNames`) — else a de-coloured helper got
   `await check(p)` in a sync function (E-CODEGEN-INVALID-LOGIC).
4. emit-tool.ts — each function body gets its own `declaredNames` (module names + its params) and, when
   sync, an await set without its local-only names (`toolFnBodyOpts`).

## R26

Base = extracted `6081e0685` compiler + its in-tree stdlib + scrml.toml (`~/.cache/scrml/s470/laneD/base`);
head = this worktree; corpus files = this worktree for both, stdlib = each compiler's own copy.
examples, samples, compiler/samples (incl. mcp-v0-fixture), benchmarks, conformance, compiler/tests/
conformance, docs: 3564 files; stdlib: 54 files — **3618 files, 0 diagnostic-code diffs** (0 newly rejected,
0 newly clean). Emitted artifacts (a digest of every JS / HTML output per file, write:false): 2 files differ,
both artefacts — `conformance/cases/components/missing-required-slot-reject/case.scrml` (the build-admit id,
which differs between two head runs too) and `stdlib/auth/templates/login.scrml` (`_scrml_project_root`, the
tree path). No corpus program changes emission.

## Log

- WIP 1: fix + pack families s12 / f15 / l7 / t7 (354 shapes, r9-shapes.js, r9-pinned.js) + unit tests
  `compiler/tests/unit/async-colouring-scope-s470.test.js` (25).
