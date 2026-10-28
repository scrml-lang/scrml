# progress — s472-boot-link-visibility

Closes `g-boot-flat-link-namespace-s471` (docs/known-gaps.md): the bootstrap
(`compiler/self-host-v2/`) linked every file into one namespace, so the
export/import boundary was not enforced at use sites.

## SPEC sentences implemented

- §21.3: "Named imports (`{ name }`) and default imports (`name`) from `.scrml` files SHALL
  be resolved by the compiler against the exporting file's export list."
- §21.3: "Importing a name that is not exported by the target file SHALL be a compile error
  (E-IMPORT-004 …)." (already enforced at the import since s471; kept)
- §5.2 (§34 row E-SCOPE-001 "Unquoted identifier not resolvable in scope"): "An unquoted identifier that cannot be resolved SHALL be a
  compile error (E-SCOPE-001)." — a name declared in another file and not imported here is
  unresolved here.
- §14.1.2: "Every type name in a type-annotation position SHALL resolve to a *defined* type: a
  built-in …, a type declared in the same file …, or an imported type (§21.8)."
- §41.7: "When an `import` statement imports a name that is already in scope from another
  `import` statement in the same file, the later import WINS and a W-IMPORT-001 warning is
  emitted."
- §7.6: "Re-declaring a name … when that name was already declared at file scope SHALL be a
  compile error (E-SCOPE-010: duplicate binding in file scope)." — read as covering an import
  and a declaration of one name in one file (SPEC does not say it of imports in words; see NOTES).

## Log

- start: branch s472-boot-link-visibility from origin/main 94ec8e735; bun install OK.
- tests first: slice-m4/visibility-s472.test.js (21) + fixture stdlib src/stdlib-s472/vis.
  Red on base: 15 fail / 6 pass (the 6 are positive regression pins) —
  ~/.cache/scrml-pa/s472/red-base.log.
- fix (analyze.scrml): phase A builds a `Linkage` — `ownNames` (every file's types, functions,
  user declarations, with their export flag) + `linkage` (per file: own names, then each import's
  names from a target that exports them; E-SCOPE-010 for declared-and-imported, W-IMPORT-001 +
  later-wins for a re-import). `scopeFrom(lk, file, name)` answers WHICH FILE's declaration a name
  denotes; every by-name lookup goes through it:
  - TypeEnv carries `link` + `declFiles`; `teAt(te, file)` replaces the 6 hand copies; `stubNamed`
    (built-ins visible everywhere, shadowed by a user type in scope), `declTypeNamed`.
  - `fnNamed(g, file, name)` / `declNamed(g, file, name)`; resolveName, deferBound, failable /
    server callee lookups, resolveElem / resolveStar, isDbElem / supplyingDb, typeNamedHere,
    visibleDecl, visibleDeclNamed (dupFields / dupHandles) — all per file.
  - InferCx: `cxAt(cx, file)`; per-declaration field inference reads the declaration's file;
    `ownProvenReturn` reads the function's own file; `inferCall` resolves in scope (the
    "mis-linked" guard is gone).
  - bare variant with no expectation (resolveVariant / enumHaving): only enums in scope.
  - voidFns / hasValueReturn: `return g()` resolves `g` in the function's file (fnsInScope).
  - typer: guard (ii) `inManyFiles` retired (typeCall, refusedReturns); `checkArgs` finds the
    callee's parameters by its AFn nid (FnW gains `nid`), never by name.
  - dupTypes / dupFns: the cross-file "one namespace" refusal is gone. dupDecls KEEPS it, with an
    honest reason: the CSS scope key is the bare component name (§9.1 DQ-7) — filed
    g-boot-component-scope-key-bare-name-s472.
  - not-in-scope diagnostics say where the name IS declared (`elsewhereNote`): "exports it, but
    this file does not import it" / "declares it but does not export it".
- fix (print.scrml / print-server.scrml): `routeName(p, sym)` — `route$<name>` for the first
  server function of a name, `route$<name>$<k>` after (two private server `load`s in two files
  both route; was a duplicate `const`).
- severity.scrml regenerated (W-IMPORT-001 → Warning).
- slice-m2 pins updated to the new semantics (typer.test.js ×3, typer-s440.test.js ×1): the four
  tests that pinned the one-namespace refusal now pin per-file resolution (with mis-link twins).
- known-gaps: g-boot-flat-link-namespace-s471 → resolved (heading fixed: was "RESOLVED S471" with
  status=open); filed g-boot-component-scope-key-bare-name-s472, g-boot-type-unknown-code-s472;
  counts regenerated (master-list recent-sessions hunk reverted).
- pushed; PR #1606 (not merged). Local: slices job + e2e-render-map green; pre-commit hook 50371 pass / 0 fail.

## Review round 1 (S239 review of 67bd70862 — LAND-WITH-FOLLOWUPS; ~/.cache/scrml/review/s472-l1/REVIEW.md)

- F1 (MED, head-only over-refusal): `match pick() { .Red, .Blue }` with only `pick` imported was
  E-TYPE-VARIANT. §18.13: "`.VariantName` (shorthand) SHALL be valid when the matched value's type
  can be inferred by the compiler from context." Fix: `callEnumOf` — a call of a function in scope
  whose declared return is an enum names that enum BY IDENTITY (armsSubject `pref`); otherwise the
  in-scope search, then (an unannotated local) every user enum. A wrong pick is caught by the
  typer's `plainSubjectCheck` ("the arms are variants of `E`, but the subject is `F`", Sym identity)
  — pinned by match-mislink-private-enum (call and local).
- F2 (MED, fail-open, base too): scope keyed (file, name) → importing exported `type Tag` brought a
  private `fn Tag`. Fix: `NameKind { KType, KFn, KDecl }` on OwnName / ScopeName; an import adds one
  entry per EXPORTED declaration of the name (`exportedEntries`); every lookup passes its kind;
  `elsewhereNote` is kind-aware. decl-fn-same-name-onefile: SPEC silent (§7.6 names `let` /
  `function` duplicates; E-NAME-COLLIDES-STATE is local-vs-cell) → filed
  g-boot-decl-fn-same-name-one-file-s472, no refusal invented.
- F3 (LOW/MED, head-only): FnW gains `file`; a `()name` key resolves in the calling function's file
  (`fnwIn`), a callee's own `()` keys are not re-read in the caller's scope; each file's TEnv gets
  the write sets in scope there. writeset-overrefuse clean and runs "3"; writeset-converse still
  reports.
- F4 (LOW): `sameNameNote` — "two different types named `Color`: the expected one is declared in
  `pick.scrml`, this value's in `colors2.scrml`".
- tests: +11 in visibility-s472.test.js (32 total).
