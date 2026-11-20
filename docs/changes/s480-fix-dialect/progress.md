# s480-fix-dialect — Track M step 1 (progress)

Ruling: user-voice-scrml.md S480 "⭐ RULED — bootstrap census build order …" item 1 ("Track M first"),
items 3–4; S469 dpa-073 F1 / F2 / F3 / F5.

- [x] `stmt-semi` + `arm-comma` rules — `compiler/src/commands/fix-terminators.js`; wired into
      fixS66 (S66_RULES, IMPL1_SAFE_RULES) after given-presence, before the §66 declaration rules.
- [x] unwrap-logic split — fix-s66.js `splitAroundDecls`: a depth-0 `${}` holding rewritten legacy
      declarations and a statement is split around the declarations (no `let <x/>` left in `${}`).
- [x] tests — `compiler/tests/commands/fix-terminators.test.js`; fix-s66 / fix-sql-failable /
      fix-refuse-broken expectations updated for the new default rules.
- [x] bootstrap-conformance twins exclude stmt-semi / arm-comma (graded as written).
- [ ] item 4: const components (Form 2 → §66.15) — NOT cheap (structural, use sites, props →
      typed attributes, slots); left for step 2. Top-level markup: program-wrap already exists.
- [ ] measurement (corpus 701 + core 52; self-host) — scratch `~/.cache/scrml/review/s480-fix-dialect/`.

## r1 (PR #2025 S239 review: BLOCK on F1) — scratch `~/.cache/scrml/review/s480-2025-r1/`

- [x] F1 HIGH — fix-s66 seed order: a split / unwrap that would move a §66 declaration past a statement
      writing what its initializer reads is refused with a note (`seedHazard`, `seedReads`, `addSeedWrites`).
      Runtime tests `compiler/self-host-v2/slice-m4/fix-s66-seed-order-s480.test.js` (red on 5592223b3).
- [x] F2 — scanMarkup: a named closer must match its element (`</>` closes the innermost).
- [x] F3 — next-line `new` / `typeof` / `void` / `delete` / `await` start a statement (impl#1 tokStartsStmt).
- [x] F4 — REGEX ends a value; `on…=${…}` handlers scanned; leading-`|` alternation heads; notes for
      template-literal / inline-markup / nested `${}` code.
- [x] tests: verify withdraw (bisect) path, allowNonCompiling pin.
- [ ] re-measure (census lens + dual compile + runtime differential).

## r2 (PR #2025 r1 re-review: BLOCK — the F1 guard failed open) — scratch `~/.cache/scrml/review/s480-2025-r2/`

- [x] F1 at the root: the read / write allow-list (`seedReads` / `addSeedWrites` / `seedConflict` /
      `PURE_CALLEES`) is gone. fix-s66 `seedHazard` now FAILS CLOSED: a move is allowed only when every
      unit of code before the declaration (`seedPrefixUnits`, fix-terminators.js — every `${}` at any
      depth, body code, interpolations, non-handler attribute values; opaque blocks refuse) and every
      earlier statement of its block is provably free of writes and calls (`seedStmtFree` /
      `seedExprFree`: a closed token set). Covers N1 (template literal), N2 (KEYWORD names), N3 (shadowed
      "pure" callees).
- [x] N4: scanMarkup — void only for a lowercase element name (`<Link>` has a body).
- [x] tests: every re-review probe (k01 c01 c02 g-* k02 h01 h02 i01 i02) in
      slice-m4/fix-s66-seed-order-s480.test.js (red on 7d3877965); a free-prefix positive test; v5–v7 +
      PascalCase-void tests in fix-terminators.test.js.
- [ ] cost (census lens r1 vs r2), runtime differential, conformance, gates.

## r3 (PR #2025 r2 re-review: FIX) — scratch `~/.cache/scrml/review/s480-2025-r3/`

- [x] F1 HIGH: the CLI artifact (print.scrml `printProgram`) evaluates EVERY file-scope binding (§7.6,
      `constStmts`) at module initialization, before `shared_program()` → `rt.construct` seeds the
      cells; body code runs in `render_program` after it. `seedHazard` now also requires every
      file-scope `let` / `const` at or after the block (`seedBindingStmt`) to be provably free, and
      refuses an unreadable unit after it.
- [x] F2: fix-s66-seed-order-s480.test.js runs on the CLI artifact path (`compileSource` +
      `runBootstrapArtifact`, now exported); r01 / r03 / r05 added (red on 1caa16f4c: 10 fail).
- [x] F3: `(` after `.` / `?.` (the optional call `?.(`) is a call in `seedExprFree`.
- [x] F4: component definitions are units like any other; a component instance before the
      declaration is an opaque unit (refuses).
- [x] x02 test: a `const` in a later markup interpolation is hoisted to module init too (verified
      emission); refused (expression unit after the block holding `let` / `const`).
- [x] cost: census lens 701 vs 1caa16f4c — boot-clean 190 → 190 (0 lost); 16 newly refused moves,
      none boot-clean before (8 `^{}` meta blocks after the declaration, 6 later interpolations
      holding `let` / `const` or unreadable, 2 later non-free bindings). Runtime differential over the
      190: 0 cell diffs (identical to r2). Conformance vs origin/main c15225d88: CRASH 0, PASS 760 →
      759, PASS→other = the 2 r2 by-design refusals; 10 NOT-TWINNED→FAIL as r2. CI checks + pretest pass.

## r4 (PR #2025 r3 re-review: FIX — F-A HIGH, LOW-1, LOW-2) — scratch `~/.cache/scrml/review/s480-2025-r4/`

THE INVARIANT (fix-s66.js, comment over `seedHazard`): moving a §66 declaration out of `${ … }` changes
the relative order of the moved seed(s) S and a set R — every unit that runs on one side of S in impl#1
and on the other on the bootstrap. Safe only if S and R commute; the guard requires the closed form:
EITHER every moved initializer is provably free (no calls, no writes) AND every unit of R is provably
free (and no R unit run at module init reads a moved cell), OR R is empty.
R from print.scrml `printProgram` (5363–5418) / `constStmts` (267–279): imports, then EVERY file-scope
`let` / `const` (module init; conservatively every binding counts as printed), request slots,
decls / routes / fns (run nothing), then boot: `rt.construct` seeds, CSS bridges (pure cell reads),
`render_program` (body statements, interpolations, attributes, instances).
  R1 = render-time units before p_last (earlier blocks' non-binding, non-inert statements; the block's own
       before p_last; interpolations; attribute values; instances; opaque / unread code). A depth-0
       binding before p_first is module-init on both sides → not in R; a nested one stays in R.
  R2 = file-scope bindings after p_first (the block's own after its first moved decl; every later
       `let` / `const` at any depth; a later interpolation holding one; any later opaque / unread unit).
- [x] F-A: `seedHazard` rewritten to the invariant (initFree over the moved statements, R1 ∪ R2).
- [x] LOW-1: `.Name(` enum-ctor exemption not after `?` (`o?.pop(`).
- [x] LOW-2: seedPrefixUnits — an instance is any element bound by an import / `let` / `const` in the file,
      or any name not standard HTML / SVG / MathML / custom, not a scrml structural tag (name-resolver
      `SCRML_NON_ELEMENT_TAGS`) and not a §36 input-state tag (fail closed). (First cut exempted only
      `<program>`: conformance measured 6 `defer/*` cases with `<schema>` newly refused — fixed.)
- [x] tests: r4 section of slice-m4/fix-s66-seed-order-s480.test.js — 11 red on d9eefb493, green on head.
- [x] cost: census lens 701, head vs d9eefb493 (both run fresh, same main): boot-clean 208 → 208, 0 lost,
      0 newly refused; 1 newly MOVED (examples/32-external-api: two adjacent seeds with nothing between —
      R empty; error → error either way); 2 refusal notes reworded. Runtime differential over the 208
      boot-clean: 0 cell diffs (13 text diffs, 8 run errors — whitespace / impl#1 run errors, none seed-
      related; the 4 not in r3's list are programs newly boot-clean from main). Conformance vs origin/main
      c15225d88: CRASH 0, PASS 760 → 760, FAIL 0 → 10 (9 stmt-semi twins — TWIN_RULES excludes stmt-semi,
      sources graded as written — + defer/outside-function-when-body-neg twin-extra-error); PASS→other =
      reactive/hoist-forward-ref-neg (r2 by-design); NOT-TWINNED→PASS match-leave/top-level-match-arm-return-neg.
- [x] gates: pretest, s34-census --check-new, types-gate, snippet-gate, claim-gate, corpus-compile-floor,
      gen-md-shim — all pass.
