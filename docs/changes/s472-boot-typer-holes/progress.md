# s472-boot-typer-holes — progress

Branch `s472-boot-typer-holes`, base origin/main `e8d2e38cd`. Input: the S472 backfill review bf1
(`~/.cache/scrml-pa/s472/review-bf1.md`, F1 / F2 / O2). Logs: `~/.cache/scrml-pa/s472/th-*`.

## What changed (compiler/self-host-v2/analyze.scrml, THE TYPER only)

- **F1 — one initializer rule.** `checkAnnotInit` replaces the `checkInit` + `checkIntInit` pair at
  the three initializer sites (`typeLocal`, `typeFieldInits`, `typeUse`). `not` → E-TYPE-041; a literal
  into a primitive annotation keeps checkInit's §7.5.1 table; everything else (a literal into
  `T | not` / enum / struct / tape, every non-literal) is `checkValue` (E-TYPE-031, §66.1 rule 5).
- **F2 — `VType.OneOf(ts)`.** `joinTypes` of two known types with no common type yields a CHOICE,
  never Unknown. `checkValue` / `checkIndex` → `checkOneOf`; template slot → `textOneOf`; markup text
  → `markupTextOneOf`; operands → `numOneOf` / `boolOneOf` / `plusOneOf`; conditions treat it as
  unresolved (strict-direction). `joinContrib` keeps a flow-insensitive join of a local's different
  assignments Unknown. A value `match` whose arms disagree is E-TYPE-001 (§18.4 rule 3) at the arm.
  `checkNotElems` checks each known element of an unproven array literal against the element type.
- **O2 — markup text sink.** `typeInterp` → `markupTextKnown`: E-TEXT-NON-PRIMITIVE for a known
  non-primitive, a `T | not` of one, each choice member. Declaration types are not judged. The
  unresolved limb is NOT applied (measured: refuses four §66.19 worked-program interpolations + the
  `dropdownEarlyRead` fixture) — filed `g-boot-markup-text-unresolved-limb-s472`.

## SPEC quotes

- §18.4 rule 3: "If arms produce types `A` and `B` with no subtype relationship, this SHALL be a
  compile error (E-TYPE-001) citing the two conflicting arm types and their source positions."
  Rule 2: "If arms produce types `A` and `B` where one is a union member of the other (e.g.,
  `string` and `string | not`), the result type is the union (`string | not`)."
- §17.6 (if-as-expression): "The compiler SHALL NOT require all arms to lift the same concrete type.
  If arms lift different types, the result type is their union." The SPEC has NO ternary-specific
  arm-typing rule; §66.3 rule 5 (e) only makes "a ternary … whose arms are members of one base type"
  inferable. The ternary therefore takes §17.6's union reading (a PA-reviewable derivation).
- §14.13.2: "Refused: a struct, a tape, a tuple, a map or set, a payload enum value, a function, … and
  a value whose type the compiler cannot resolve … In markup text, a quoted attribute or a logic
  template this SHALL be compile error `E-TEXT-NON-PRIMITIVE`."
- §66.1 rule 5 (cited in every E-TYPE-031 message): every cell and field write is type-checked
  against the target's declared type.

## `.Unknown` audit (typer sources; checkValue stays provable-or-silent on Unknown)

| source | class | why |
|---|---|---|
| `joinTypes` of two known types with no common type (ternary, match arms, array elements, loop lifts, local contribs) | **resolution failure → fixed** | now `OneOf` (ternary / arrays / single-value locals), E-TYPE-001 (match), E-BOOTSTRAP-UNSUPPORTED union tape (loop lifts, pre-existing), Unknown only for a flow-insensitive multi-assignment join |
| `numJoin` / `divType` / `binaryType` on known non-numeric operands | blamed | checkOperands reports E-OPERATOR-OPERAND-TYPE first |
| `typeUnary` / `typeBinary` after a reported operand error; operator the binder never resolved | blamed | the report (or the refused region) accounts for it |
| `typePlain` after E-TYPE-001 | blamed | the new report |
| `typeCall` of a function with no written return type; `NFn`; host / unbound callee (`builtinCallType`) | deferred | §66.3 return inference not in the bootstrap typer; the template slot / conditions already fail closed on these |
| `?{}` (`Sql`), `typeHandled` (`?` / `!{}` success type), `Spread`, `Assign` as a value, lambdas | deferred | no row type / success-type slot in the bootstrap's type system; value positions are refused elsewhere (E-VALUE-*) |
| `methodType` / `seqCallType` / `VIndex` / `VAt` / string-method results without a table entry | deferred | typed by their own tables where they exist |
| `fieldTypeOf` / `structFieldType` / `paramType` of an untrusted or unresolved field / parameter | blamed | its own E-TYPE-UNKNOWN / E-DECL-TYPE-NOT-INFERABLE (refusedRead) |
| `Recovered`, a name the binder did not resolve | blamed | parse / scope error |
| `surfaceType(.Errors)` | refused elsewhere | `errors` as a value is refused before typing |
| `unknownWhereChanged` (fixpoint bound) | deferred | the settle loop's widening, by design |

## Movement

- Bootstrap conformance (`docs/bootstrap-conformance.md`): **no net movement** (PASS 259 · FAIL 49).
  The markup-text check moved three cases PASS → FAIL (`error/fail-bare-variant-reaches-handler`,
  `error/propagate-reaches-handler`, `error/fail-imported-builtin-name-enum-ok` render a payload enum
  `${@phase}` — stale per §7.4.2, as the #1608 gap had recorded); the cases now render a static
  `phase` and are PASS again (impl#1 conformance unchanged).
- Re-pinned: `slice-m2/typer.test.js` mixed-arm ternary into an int cell → E-TYPE-031 (FLIPPED);
  `slice-m4/value-form-s469.test.js` `return for … ` into `int[]` shows `f(@zs).length` (a tape in
  markup text is now E-TEXT-NON-PRIMITIVE).
- Tests: `slice-m4/typer-holes-s472.test.js` — 47 tests; on main 34 fail (every repro), 13 controls pass.

## Checkpoint (wrap)

- Done: F1, F2, O2 fixes, tests, red-proof, gaps filed/resolved, §34 row, 3 stale conformance cases, merge of origin/main (#1614).
- CI `checks` steps run locally on the merged HEAD: types-gate, snippet-gate, claim-gate, compile-floor, md-shim,
  bootstrap-conformance --check, conflict-marker, SPEC-INDEX, delta-lint, s34-census --check-new --base origin/main all pass.
  gen-bootstrap-severity --check was STALE ON MAIN (E-IMPORT-003/008/009 rows from another lane), so severity.scrml is regenerated in this branch.
- Slices (m1, m1 lowered, m2, m3, m4, codec) and the unit/integration/conformance suites passed in the pre-commit runs.
- Not run locally yet: `bun test compiler/tests/e2e-render-map/` and `bun test compiler/tests/*.test.js` outside the hook (the hook does run the latter).
