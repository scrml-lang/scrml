# progress — s470-typed-payload-binders (lane B)

Ruling: bryan S470, user-voice-scrml.md "(B) Type the binders (Recommended)". Payload binders get their
DECLARED field type; a non-`.variant` member read on an ENUM-typed value is refused. The (A) constructor
refusal is NOT landed.

## Governing SPEC sentences (quoted)
- §34 row: "| E-TYPE-004 | §14.3, §18.6.1 | Struct field access on non-struct type. …"
- §18.7: "**Type of bound variables:** A bound variable in a payload destructuring pattern has the
  type declared for that field in the enum definition." and (normative) "The type of each bound
  variable SHALL be the declared type of the corresponding field in the enum variant definition."
  "Positional binding SHALL assign fields left-to-right in declaration order."
- §18.6.1 (S469): "Its payload is reached by naming the variant (`.Denied(reason) :> …`) or by
  `match err { … }`" — the payload of an enum value is reached through a variant pattern, not a member read.
- §14.3.2: "The field value is an enum variant (including payload fields for payload variants)." and
  "Pattern matching on an enum-typed struct field is valid and works identically to pattern matching on
  any enum-typed variable".

## Log
- 2026-10-25 start: worktree reset to origin/s470-whole-error-binder-escapes 91c1c9ca4 (PR #1551 OPEN).
  bun install ok. Base tree for comparisons: `git archive 91c1c9ca4` at ~/.cache/scrml/s470/laneB/base.
- 2026-10-25 IMPLEMENTED (compiler/src/type-system.ts), on the proven path:
  - ONE walker `checkEnumReadsIn` (expressions + statements), called from the existing member-read
    checker `checkRowFieldAccessInExpr` (every expression site the ident walker covers), from the
    statement `match` case (an inline arm's result is walked by nothing else), and from the post-walk
    `_checkExpressionPositionHandlers` at every `!{}` the statement walk did not already check.
  - static type only where KNOWN: a binding's type (params / annotated locals / cells resolve as before;
    a new `ScopeEntry.enumFact` carries an un-annotated `const`/`let`'s constructor / alias / call
    initializer for THIS check only — `resolvedType` unchanged, so no other check moves), `E.V(…)`,
    `E::V(…)`, `.V(…)` (the one enum declaring V — the bare-dot rule `auditBinderCallArgs` uses), a call
    of a function with a declared return type (`callArgFnSignatures`, local + imported) or whose every
    `return` constructs one enum, a struct field, a tape element.
  - payload binders typed by the existing planner: `planPayloadBinders` + `parseBindingList` (codegen's
    §18.7 planner) against the subject's enum (or the failable callee's enum via `failableCalleeErrorEnum`),
    field types from the enum's declaring file (`variantFieldResolvedType`, factored out of
    `canonicalFieldTypeKey`). Block `match` arms and statement `!{}` arms now BIND the binder with that
    type in scope (was `asIs`).
  - refusals: a member other than `.variant` (and `@cell.advance`, the §51 engine transition) on an
    enum value → E-TYPE-004; `==`/`!=` enum value vs a primitive literal → E-EQ-001 (§45.3); a binder this
    walk typed as a struct reading an unknown field → the existing struct E-TYPE-004 text. Whole-error
    binder `_ e` uses stay the audit's (quiet here). One diagnostic per read (per-file duplicate pass).
  - F4: in a re-read `<match>` arm copy, `expr.sourceText` is the `${…}` copy of `raw` (covered), and the
    native `ATTR_EXPR.text` is read with `parseHandlerStatementsForCheck` (unreadable → still refused).

## Measured on the starting head 91c1c9ca4
Probes: ~/.cache/scrml/s470/laneB/matrix.mjs (run with the pack's `runShape` via run.mjs; summ.mjs).
Each shape logs in on the wrong password iff the enum member read is unchecked (reads `undefined`).

- Repro `~/.cache/scrml/s470/enum-read/t.scrml` (`x.reason` with `x: Inner`): compiles, exit 0.
- Q4 (`!{ .Wrapped(i) :> i.reason == "bad" ? … }`, l1 shapes4): FAIL on all 4 sides (rerun-l1e.log).
- F4: `F4/nested-match-in-arm-OK.scrml` and `-nobinder.scrml` refused with E-TYPE-031
  "code held as text (`expr.sourceText`)" + "(`ATTR_EXPR.text`)"; `nested-match-interp-nobinder.scrml` compiles.
  c18 OK controls Q1/Q2/Q7/Q8/Q9: E-TYPE-031 (false positive); the BAD twins E-TYPE-004 + E-TYPE-031.
- Escape 3: 18 KNOWN_FAIL shapes in the pack (s11/t6 x6, f9/l6 x3).

Matrix (server | fullstack | library | tool):

| shape | server | fullstack | library | tool |
|---|---|---|---|---|
| M1 param x: Inner | FAIL | FAIL | FAIL | FAIL |
| M1b param x: Inner (unit .Ok2 arg) | FAIL | FAIL | FAIL | FAIL |
| M2 typed local const | FAIL | FAIL | FAIL | FAIL |
| M3 untyped local ctor E.V() | FAIL | FAIL | FAIL | FAIL |
| M3b untyped local ctor E::V() | FAIL | FAIL | FAIL | FAIL |
| M3c let ctor | FAIL | FAIL | FAIL | FAIL |
| M3d inline ctor member | FAIL | FAIL | FAIL | FAIL |
| M3e .data on ctor | PASS | PASS | PASS | PASS |
| M4 match binder positional | FAIL | FAIL | FAIL | FAIL |
| M4b match binder named | FAIL | FAIL | FAIL | FAIL |
| M4c match untyped subject | REF(E-TYPE-025,E-TYPE-027) | same | same | same |
| M4d match block arm | FAIL | FAIL | FAIL | FAIL |
| M5 !{} .V(i) binder (Q4) | FAIL | FAIL | FAIL | FAIL |
| M5b !{} `\| ::V i` binder | FAIL | FAIL | FAIL | FAIL |
| M5d !{} ::V(i) binder | FAIL | FAIL | FAIL | FAIL |
| M5e !{} block arm .V(i) | FAIL | REF(E-CODEGEN-INVALID-LOGIC) | REF(E-CODEGEN-INVALID-LOGIC) | FAIL |
| M5c !{} .V(inner: i) named | REF(E-PARSE-001: impl#1 has no named `!{}` binder) | same | same | same |
| M6 struct field holding enum | FAIL | FAIL | FAIL | FAIL |
| M7 fn return declared enum | FAIL | FAIL | FAIL | FAIL |
| M7b fn return inferred enum | FAIL | FAIL | FAIL | FAIL |
| M8 param method call `x.toString()` | FAIL | FAIL | FAIL | FAIL |
| M9 bracket read `x["reason"]` | FAIL | FAIL | FAIL | FAIL |
| M10 cell `<st>: Inner` | REF(E-REACTIVE-003) | FAIL | REF(E-CODEGEN-INVALID-LOGIC) | REF(E-STATE-UNDECLARED) |
| M11 imported enum param | UNJUDGED (harness) | UNJUDGED | UNJUDGED | FAIL |
| M12 `match e` block arm from `_ e` | REF(E-TYPE-031) | same | same | same |
| M13 for-of over `Inner[]` | FAIL | FAIL | FAIL | FAIL |
| OK1 `.variant` read | PASS | PASS | PASS | PASS |
| OK2 primitive binder via nested match | PASS | PASS | PASS | PASS |
| OK3 `i is .Bad` | PASS | PASS | PASS | PASS |
| OK4 struct primitive field read | PASS | PASS | PASS | PASS |

(M3e `.data` "works" because impl#1's runtime value is `{ variant, data }`; the ruling refuses it: `.data`
is not a scrml member of an enum value.)
