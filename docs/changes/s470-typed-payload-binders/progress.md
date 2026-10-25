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
(M5b initially written `::Wrapped i` with commas: impl#1 needs the legacy `|` for a paren-free binder —
E-PARSE-001 on both trees; re-written `| ::Wrapped i`. M5c, a named `!{}` binder, is impl#1-refused
E-PARSE-001 on both trees — not a lane-B shape.)

## Measured on the head (rebased onto origin/main 94c2026cb; compiler source = 980f40147 / 950ab710f)

| shape | server | fullstack | library | tool |
|---|---|---|---|---|
| M1 … M9, M13 (every BAD read above) | REF(E-TYPE-004) | REF(E-TYPE-004) | REF(E-TYPE-004) | REF(E-TYPE-004) |
| M3e `.data` on a constructor | REF(E-TYPE-004) | same | same | same |
| M4c match untyped subject | REF(E-TYPE-025,E-TYPE-004,E-TYPE-027) | same | same | same |
| M5c named `!{}` binder | REF(E-PARSE-001) | same | same | same |
| M10 cell | REF(E-REACTIVE-003,E-TYPE-004) | REF(E-TYPE-004) | REF(E-TYPE-004) | REF(E-STATE-UNDECLARED) |
| M11 imported enum | REF(E-TYPE-004) | REF(E-TYPE-004) | REF(E-TYPE-004) | REF(E-TYPE-004) |
| M12 `match e` block arm from `_ e` | REF(E-TYPE-031,E-TYPE-004) | same | same | same |
| OK1 … OK4 | PASS | PASS | PASS | PASS |

Matrix FAIL 80 → 0. The lane-1 review probe sets (l1 shapes1–5, l1b s6–s16, l1c s17–s21 + c1–c8, l1d/l1e
new c9–c19 + n1–n4, rerun with ~/.cache/scrml/s470/laneB/rerun.sh, compared with cmp.mjs): FAIL 4 → 0
(Q4, one per side). Every other change is an already-refused BAD shape gaining E-TYPE-004 / E-EQ-001, or
c4 T1/T2/T3/T5 (`x: AuthErr` then `x.reason` / `x.data.reason` / `x == "bad"` / `x[k]` — the gap's own
class) CLEAN → refused. No OK control newly refused. c4 T4 `String(x).includes("bad")` stays CLEAN
(a stringified enum value; not a member read — candidate gap below).
- **Q4: CLOSED** — PASS-REFUSED (E-TYPE-004) on all four sides.
- **F4: CLOSED** — `F4/nested-match-in-arm-OK.scrml`, `-nobinder.scrml` compile clean;
  `nested-match-interp-nobinder.scrml` still clean; c18 Q1/Q2/Q7/Q8/Q9 OK → CLEAN, their BAD twins
  E-TYPE-004 only (the false E-TYPE-031 gone). Pack r9 `VALID F4 …` shapes: the program now compiles
  but its inner `<match>` is never mounted (PASS-DENY) — a SEPARATE pre-existing codegen defect (the same
  on 91c1c9ca4 for the interpolation variant that compiled there): candidate gap below.
- **Escape 3: CLOSED** — the 18 `KNOWN_FAIL` shapes are PASS-REFUSED (E-TYPE-004; the two `… match eq`
  shapes E-EQ-001); `KNOWN_FAIL` is empty. `@state = .Failed(err)` (SPEC §18.6.1, examples/09) compiles.

## Pack
New family r9 (`r9-shapes.js`; `shapes/s12.js` `f15.js` `l7.js` `t7.js`), 121 shapes: every "1 …" shape
FAIL on 91c1c9ca4 → PASS-REFUSED (80 shapes); "VALID …" acceptance controls PASS on both (38, incl. the
r7 VALID controls re-stated without r7's `getReasonT`, which is now refused); fullstack F4 ×3.
EXPECTED_SHAPE_COUNT 2192 → 2313. pinned-class.js: the r9 shapes added from a run (fams.mjs), and the
changed pins re-pinned from the same run (repin.mjs, never by hand): r7 `VALID …` ×23 + `l5/A match-form
_ e member` PASS → PASS-REFUSED (r7's shared declarations hold `getReasonT(x: AuthErr) { return
x.reason }`, now E-TYPE-004), r8 escape-3 ×18 FAIL → PASS-REFUSED, r8 `3 ctor inline member` ×4
PASS / PASS-500 → PASS-REFUSED. Full pack: 2316 pass / 0 fail.
Unit tests: compiler/tests/unit/enum-value-member-read-s470.test.js (45); the escape-3 `test.todo`s in
whole-error-binder-escapes-s470.test.js are real tests now; whole-error-binder-allowlist-s469.test.js's
ALLOWED cases compile against its declarations minus `getReasonT` (the refused read).

## R26 (corpus, base 91c1c9ca4 archive vs head; both trees' own in-tree stdlib, no symlink)
examples 71 + samples 881 + stdlib 54 + benchmarks 7 + conformance 1852 + docs 750 = 3,615 files, each
compiled separately (corpus.mjs), every diagnostic code (errors and warnings) compared per file (cdiff.mjs):
**0 files changed, 0 newly rejected.** No example or benchmark needed a migration: the corpus's
`e.message` reads (samples/blog-cms, contact-directory, login, api-dashboard, recipe-book, gauntlet
samples) are on binders / cells whose type impl#1 does not know (`| ::SQLError e` — a variant no callee
declares; untyped `<loadError> = not`), and those files fail today for other reasons (E-CTX-*, E-STYLE-001,
E-SCOPE-001 …) — unchanged.

## Allow-list redundancy (auditWholeErrorBinderText) — what ordinary type checking now covers
Not removed (per the brief). With the whole binder `_ e` bound to the handled enum (it already was, in
scope) and binders typed:
- COVERED by the type system now (where the handled enum is known): a payload read off `e` in every
  member / optional-member / bracket spelling (E-TYPE-004); `e == <primitive literal>` (E-EQ-001); a
  local alias of `e` (`const err = e` / `let s = e`) then a read or a literal compare (the alias carries
  `enumFact`); a callee whose parameter is typed with the enum (`getReasonT(x: AuthErr)`: its body's
  `x.reason` is refused on its own, whoever calls it); `match e { .V(i) :> i.reason / i == "bad" }` (typed
  binders) — so the S470 round-1 "enum-holding payload binder" refusal (`auditEnumPayloadBinderRefusal`)
  is now redundant for reads and comparisons; it remains the part that falsely refuses the VALID
  `.Wrapped(i) :> match i {…}` / `i is .Bad` (lane-1 Q3 / Q7) and can be lifted in a follow-up lane;
  a whole `e` into a constructor then re-extracted (escape 3); a cell typed with the enum that holds it.
- STILL NEEDED (no type reaches them): an untyped helper (`getReason(e)`), a lambda / destructuring
  parameter, `const { reason } = e`, `String(e)` / a template / tagged template, a container
  (`[e][0]`, `({ x: e }).x`), `arguments`, a comparison with a non-literal (`e == bad`, `e == "ba" + "d"`),
  the shadowing / `log`-builtin rules, a cell with no type, and every use when the enum is unknown.
- `g-impl1-whole-error-binder-allowlist-stricter-than-spec-s469` (LOW): NOT narrowed in this lane (the
  audit is unchanged). It CAN narrow: a local alias (`const held = err`) and a cell typed with the enum
  are now type-checked, and the enum-holding binder refusal is redundant — both are refusals the type
  system makes unnecessary. The rest (untyped helpers, containers, unknown enums) still needs the
  allow-list or a ruling.

## Candidate gaps (not filed here)
1. A markup `<match>` nested in a `<match>` arm is never mounted: the inner mount `<div
   data-scrml-match-mount=…>` is emitted but no dispatcher is generated for it, so its content (buttons,
   text) never renders. Pre-existing (91c1c9ca4, `F4/nested-match-interp-nobinder.scrml`, which compiled
   there). Silent missing UI — MED.
2. `String(x)` / `` `${x}` `` / `x + ""` of an enum-typed value compared with a string is unchecked
   (c4 T4 `String(x).includes("bad")`, CLEAN on base and head): a unit variant stringifies to its tag, a
   payload variant to "[object Object]". Not a member read (outside this ruling). LOW–MED (security-shaped).
3. `x == bad` with `const bad = "bad"` (a non-literal primitive) is not E-EQ-001 outside the whole-error
   binder audit; §45.3 says cross-type `==` is an error. LOW.
4. An `<engine>` / derived-machine cell typed by a NAMED machine (`@var: PM`) resolves to a `machine`
   type, not its governed enum, so member reads on it are not checked by this lane. LOW (not measured).
