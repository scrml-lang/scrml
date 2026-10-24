# progress — s470-whole-error-binder-escapes

- 2026-10-24 start: worktree verified at base 915b6775f; bun install + pretest ok.
- 2026-10-24 REPRODUCED on base 915b6775f (run.mjs + r6a/r6b copied to scratch): r6a 33 FAIL, r6b 7 FAIL (r6b library-import case UNJUDGED: harness gap).
  Escape 1 (shadowed callee): fullstack/library/tool `shadow const arrow`, `shadow let fn`, `shadow arm-local const/fn`; all sides `shadow nested param`; library/tool `fn shadowed in fn by const`; r6b `import check + nested local check`, `top-level const check + nested fn check`, `fn declared after shadow param in fn` (lib/tool).
  Escape 2 (log inherited): `fn body log param` (server, library), `fn body local log` (server, fullstack, library; tool PASS-500).
  Escape 3 (ctor residual): `ctor data member` all 4 sides; `ctor extract match`, `ctor extract dot ctor`, `ctor extract match eq` (server, tool).
- 2026-10-24 DONE escapes 1+2 (type-system.ts): audit ctx now carries the LEXICAL scope + declaration frames;
  callee resolved via the existing `resolveFnBinding(name, scope, forExact=true)` (exactly one decl, else refuse);
  a name any frame declares (arm body, re-parsed nested body, callee params/body) is refused; callee body audited
  in its decl scope with its own frames; `log` builtin recomputed per body (auditLogIsBuiltin), and never the
  builtin if the file declares/imports `log` anywhere. r6a 33 -> 10 FAIL (all 10 = escape 3), r6b 7 -> 0.
  Locus hypothesis HELD (auditBinderCallArgs / auditWholeErrorBinderText).
  NEXT: escape 3.
- 2026-10-24 escape 3 — PREFERRED fix NOT reachable on the proven path: impl#1 has no expression typing for a
  ctor call (`Box.Wrap(e)`), types `const b = …` from literals only, and binds match payload binders as `asIs`
  (type-system.ts case "match-arm-block": "variant payload type inference is a separate concern"). So
  "refuse payload read on ANY enum-typed value, from the value's type" cannot see `b`, `i`, or the ctor result.
  Took the brief's FALLBACK: refuse a whole `e` into a variant constructor (E-TYPE-031, message labelled impl#1
  limitation). COST: this newly-rejects SPEC §18.6.1's own example `@state = .Failed(err)`.
- 2026-10-24 ADJACENT escape found (new, same family): `_ e :> match e { .Wrapped(i) :> i.reason == "bad" }` where a
  field of the variant holds an enum — i is an enum value read as a struct; logged in on server/tool (r7 probes).
  Fixed in-audit, fail closed: a `match <binder>` arm binding a payload of a variant with any enum-holding /
  unresolvable field is refused (E-TYPE-031, impl#1). COST: valid `.Wrapped(i) :> match i {…}` / `i is .Bad` refused.
  r6a 10 -> 0 FAIL, r7 (new, 28 shapes) 16 -> 0 FAIL.
  (the nested-binder refusal IS committed: 1145d53cf "refuse an enum-holding payload binder")
- 2026-10-24 STOP on escape 3 (brief's STOP rule): the ctor-refusal FALLBACK newly-rejects real corpus —
  examples/09-error-handling.scrml (`_ err :> { @phase = .Failed(err); return }`, lines 113/117; the canonical
  "hold the error in a state" idiom, and SPEC §18.6.1's own example) — and breaks
  compiler/tests/integration/s461-runtime-tree-shake.test.js (compiles examples/09). The commit carrying it was
  blocked by the pre-commit gate; the ctor refusal was REVERTED (never landed). Patch kept in scratch for the report.
  Escape 3 stays OPEN; its shapes are in the pack as KNOWN_FAIL (18: s11/t6 x6, f8/l6 x3).
- 2026-10-24 probe pack: + r8-shapes.js (s11 / f8 / l6 / t6, 128 shapes), EXPECTED_SHAPE_COUNT 1920 -> 2048, pins
  regenerated from a run (not hand-written classes). r8 on base: 54 FAIL; on branch: 18 FAIL (all escape 3, KNOWN_FAIL).
  NEXT: full gate, types:check, R26 corpus on base vs branch.
- 2026-10-24 gates: types:check OK (181 diagnostics, unchanged). R26: 913 files (examples/*.scrml + samples/**),
  base 915b6775f vs branch — diagnostic codes IDENTICAL for every file (0 newly-rejected). Only 3 corpus files
  use a whole binder (examples/09, 16, 29). Measured separately: the reverted ctor-refusal fallback
  newly-rejects examples/09-error-handling.scrml (E-TYPE-031 x2), nothing else.

## Gap status for the PA to file (do not edit known-gaps.md here)
- `g-impl1-whole-error-binder-allowlist-escapes-s469` (HIGH) -> PARTIAL. Escapes 1 (callee by name) and 2
  (`log` inherited) FIXED; the adjacent `match e { .Wrapped(i) :> i.reason }` FIXED (refused, impl#1). Escape 3
  (whole `e` into a variant constructor) OPEN: 18 KNOWN_FAIL shapes in r8 (s11/t6 x6, f8/l6 x3). Decision owed:
  (A) the fallback refusal (closes it; newly-rejects examples/09 and SPEC §18.6.1's `@state = .Failed(err)`), or
  (B) the typed path (below), which closes it AND the new gap.
- NEW `g-impl1-enum-value-member-read-unchecked-s470` (HIGH). Locus: `compiler/src/type-system.ts`
  `checkRowFieldAccessInExpr` checks member reads on STRUCT-typed idents only; match / `!{}` payload binders
  are bound `asIs` (case "match-arm-block"; the `!{}` arm binding loop). Symptom: a payload field read off an
  enum value compiles and reads `undefined`: `!{ .Wrapped(i) :> i.reason == "bad" ? … }` and
  `function chk(x: Inner) { return x.reason == "bad" }` log a wrong password in (server + tool, scratch r9).
  §18 normative: "The type of each bound variable SHALL be the declared type of the corresponding field".
- Code label: the S470 refusals use E-TYPE-031 (this audit's existing code) with "impl#1 limitation, not a
  language rule" in the message; no new §34 code minted. If a labelled E-IMPL1-* code is wanted, that is a SPEC
  §34 row + ruling.
