# s483-invariant-1 — Q21 struct invariant, LANE 1 of 3 (parse + declaration-side analysis + static errors)

Rulings: `ruling:user-voice-scrml.md-S482-struct-invariant-contract`, `ruling:user-voice-scrml.md-S483-struct-invariant-syntax`.
Design: `~/.cache/scrml/review/s482-struct-invariant/proposal.md` (candidate A).
Bootstrap-only (compiler/self-host-v2/); impl#1 frozen (§66 Nominal there, §34.0).

## Log

- AST (ast.scrml): `AInvariant { nid, span, e, label, text }`; `ADecl.invs`; `ATypeBody.StructBody(fields, invs)`.
- Parse (parse.scrml): `invariant (e) [label]` after a declaration closer (loop with `renders`, any order,
  several clauses) — `declInvariant`; after a `type X:struct = { … }` body — `typeInvariants` / `invariantClause`.
  `invariant (…)` inside an opener: E-DECL-INVARIANT-IN-OPENER on a declaration opener (E-PARSE-ATTR on an
  element). `invariantsKept`: E-DECL-INVARIANT-NO-FIELDS on a declaration with no attribute and no child field;
  E-BOOTSTRAP-UNSUPPORTED (INTERIM, g-boot-invariant-nested-field-s483) on a child field with fields of its own.
- Analyze (analyze.scrml, block "s483 (Q21 lane 1) — DECLARATION INVARIANTS" before `phaseB`):
  - `InvInfo` recorded on `DeclInfo.invs` (user declarations; `declInvInfos`, rebuilt when `derivedCycles`
    drops fields) and `TypeInfo.invs` (`type X:struct`; `typeInvInfos`).
  - phaseB: `resolveDeclInvs` (declEnv with inRenders — the §66.5.2 renders resolver, fields bare) and
    `resolveTypeInvs` (fields bound as read-only locals); each preceded by `invPurity` (E-CONTRACT-003 for `@`
    / `@.`; E-DECL-INVARIANT-IMPURE for an outer binding, a `function` call, a method / host call, a write, a
    function value, a query, a handled failable, a foreign block, a `<#id>` read, a spread). A clause that fails
    purity is not resolved (no cascade).
  - Typer: `typeDeclInvs` (from `typeUserDecl`) and `typeTypeInvs` (per file, from `typePass`) — `invTypeCheck`
    (E-DECL-INVARIANT-NOT-BOOL on a known non-bool / `not`; skipped when an earlier error lies inside the clause).
  - Static zone (`invFold` over `FEnt` path → literal entries): the declaration's defaults (`typeDeclInvs`,
    reported at the declaration), a use site's literal attributes (`useInvs`, from `typeUse`), and an object
    literal into a value of a type / declaration with invariants (`literalInvs`, from `boundValue` — so every
    position boundValue judges: initializers, locals, assignments, arguments, returns, elements). A spread prop
    hides the props before it. Unknown ⇒ no static claim (lane 2's run-time check).
  - `programFields`: an invariant reaching a program cell is E-BOOTSTRAP-UNSUPPORTED (fail closed).

## THE READ SET — the field shape lane 2 consumes

```
export type InvInfo:struct = { nid: int, span: ASpan, label: string, text: string, e: AExpr, reads: string[], heads: int[] }
DeclInfo.invs: InvInfo[]      // a user declaration's clauses, source order
TypeInfo.invs: InvInfo[]      // a `type X:struct`'s clauses, source order
```

- `reads` — every field path the expression reads, dotted from the value's root (`"start"`, `"range.end"`),
  the LONGEST member path at each read, deduped, first-read order. A field passed whole to a `fn` is its bare
  name (`ok(range)` reads `"range"`).
- `heads` — the index of each top field read, into `DeclInfo.fields` (attributes first, then child fields —
  `userFields` order) or the StructDef's `fields`; first-read order, deduped.
- A write needs the check iff some path it writes is equal to, a prefix of, or an extension of a path in
  `reads` (a whole replace / spread writes every head; `@x.range.end = v` writes `range.end`).
- `e` is the parsed expression. Its names are resolved in phaseB: decl-form names carry `NField(declSym,
  Lexical(0), idx)` facts (the renders scope); type-form names carry `NLocal(sym)` facts with one fresh Sym per
  field per clause (minted in `resolveTypeInvs`; the typer re-binds them by name, `typeTypeInvs`). Lane 2 can
  lower `e` against the candidate value with those facts, or re-bind by `reads`.
- `text` / `label` — for the E-WRITE-INVARIANT(-RT) message: name the label when given, else the text.

## SPEC / ledgers (commit 1dd8d4c19)

- SPEC: new §66.13.5; amended §66.2.5 zone 3, §66.5.1, §66.13.1 (five kinds), §66.11.1 table row, §66.11.2 item 1,
  §14.2 (clause + grammar), §53.1, §53.3.2 row, §53.8.1 example, §53.8.2 order, §53.8.3 sibling-field advice
  (the bootstrap's E-CONTRACT-003 IDENT message now names `invariant`), §19.17 / §34 / §66.20 E-WRITE-INVARIANT[-RT]
  widened, four new §34 + §66.20 rows, the S477-supersedes-S440 line at §66.11.7.
- Not edited here (lane 3): §66.21 engine-row mapping, §38 receiver check (3), §53.9.4 server-param check.
- Retired-forms ledger: NO new row. The `<engine for=Struct> … given (self.a < self.b)` form is already counted
  by the `engine-element` SOFT row (one detector, `<engine\b`); a second row would double-count. Noted for lane 3
  in g-boot-invariant-boundaries-lints-s483. The §53.8.1 example's `<engine>` and `<booking>: … =` lines left
  the SPEC, so the engine-element and rhs-decl SPEC counts fell by one each (baseline lowered, `--update`).
- known-gaps: g-spec-struct-invariant-form-s482 RESOLVED; opened g-boot-invariant-write-checks-s483 (lane 2),
  g-boot-invariant-boundaries-lints-s483 (lane 3), g-boot-invariant-flow-discharge-s483 (INTERIM, ruled follow-up),
  g-boot-invariant-draft-form-s483 (owed capable form), g-boot-invariant-nested-field-s483 (INTERIM refusal),
  g-impl1-decl-invariant-unimplemented-s483 (carried; pins the 9 conformance cases' impl#1 xfail).

## Gates (head 1dd8d4c19 vs base origin/main 2d40d8407)

- pre-commit hook: 58631 pass / 0 fail / 255 skip, RESULT PASS (base commit's hook: 58596 pass / 0 fail / 255 skip).
- slice-m4/invariant-decl-s483.test.js: 26 pass. slice-m4/severity.test.js: 11 pass.
- bootstrap-conformance --json: base PASS 851 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 / INVALID 0;
  head PASS 860 (the 9 new invariant cases) / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 / INVALID 0;
  0 verdict or emitted-code changes on the 1973 existing cases.
- conformance/run.ts (impl#1): the 9 new cases XFAIL under g-impl1-decl-invariant-unimplemented-s483; no FAIL.
- Corpus differential + byte-compare (bootstrap compileSource over conformance/cases, examples, samples,
  benchmarks): 2977 files on both sides — 0 newly rejected, 0 newly accepted, 0 error-code changes, 0 warning
  changes, 0 artifact diffs, 0 crashes; 9 head-only files (the new cases). No corpus file writes `invariant (`.
- types-gate --check OK unchanged; s34-census --check-new --base origin/main PASS (12 new/changed rows);
  retired-forms-lint --base-ref origin/main OK; spec-coverage-check 0 violations; state.ts --check exit 4
  (generated block stale — bot-owned); gen-bootstrap-severity --check exit 4 (stale; severity.test.js passes, so
  the bot owns the regen, B7); regen-spec-index --check exit 4 (bot-owned).

## r1 — fix round for the #2120 review (verdict FIX; review at ~/.cache/scrml/review/s483-2120/review.md)

Each decision below is a PA reading (`prov=pa-ruled:…`), open to owner veto — not owner-ruled.

- F1 HIGH (prov=pa-ruled:S483-fn-chain-purity) — `invReachPass` (analyze.scrml, after the binder, in sinkDiags):
  a `fn` called from an invariant, directly or through other `fn`s (breadth-first over NFn facts, each once), that
  reads a cell (`@x`, `@.` — E-CONTRACT-003, the direct read's code) or an outer binding (a file-scope `let` or
  constant, a `<request>` / validity read, a declared value, a `<#id>` — E-DECL-INVARIANT-IMPURE) is refused at the
  call, naming the chain (`ok` → `inner`). Same set as the direct-read rule, exactly (a `fn` reading a const is
  refused, as a direct const read is). A called function whose body is not visible: refused (fail closed). SPEC
  §66.13.5 rules 6/7 rewritten; the "identically on client and server" sentence now true as shipped.
- F2 MED (prov=pa-ruled:S483-capture-never-silent) — new code E-DECL-INVARIANT-CAPTURES-CALL (`invCaptureWhy`):
  a binding named `invariant` (fn / function / const / file `let` / host binding) in scope at a clause position
  refuses the clause, fail closed (not purity-checked, not resolved, not typed or folded — `literalInvs` now skips a
  clause with an error in it, as `useInvs` did). SPEC rule 2 spells out the capture. Corpus: 0 files write a clause
  with such a binding (the corpus differential shows no change outside the invariant cases).
- F3 MED (prov=pa-ruled:S483-direct-equals-fn-purity) — a method call is no longer refused syntactically: its
  receiver is judged as any read; once resolved it must be a deterministic built-in (VMethod, VAt, VSeqCall,
  VToEnum, VConstruct, VParseVariant) with no write effect. A method on a host global (`Date.now()`,
  `Math.random()`) is refused before resolution (`invHostRoot`). A `x => expr` callback argument is judged as its
  body with its parameters bound; a block-bodied one is refused INTERIM (g-boot-invariant-block-lambda-s483).
- F4 MED — §53.8.1 Booking example uses `int` day numbers (`checkIn`, `checkOut`); the invariant half is proven by
  conformance `invariant/booking-accepted` and a slice test; its field refinement is the bootstrap's existing
  run-time-refinement INTERIM (g-boot-refinement-runtime-checks-s478).
- F5 LOW — §53.8.3 SHOULD marked prov=pa-ruled:S483-sibling-advice. F6 LOW — `constShown`: a file-scope `let` is
  "the file-scope `let` `x` (a mutable binding — a write can change it)". F7 LOW — the read set is not
  prefix-normalized (`range` and `range.lo` can both appear); lane 2's equal/prefix/extension rule tolerates it;
  noted in g-boot-invariant-write-checks-s483. Correction to the r0 note above: "LONGEST member path … deduped"
  means per read site — a whole-field read and its sub-path from another site coexist. F8 LOW — filed
  g-boot-invariant-malformed-tail-cascade-s483 (three parse sites; more than a small change).
- Tests: slice-m4/invariant-decl-s483.test.js 44 pass (26 → 44; two r0 tests re-pinned: the in-scope `fn invariant`
  test now has no clause position, the method-call IMPURE test is now a host-call test). Conformance: `accepted`
  re-authored (no `fn invariant`; adds a fn chain + `.every(x => …)`), 4 new cases (booking-accepted,
  captures-call-neg, fn-chain-cell-neg, fn-chain-let-neg); impl#1 xfail signatures recaptured.
