# s478-boot-refinement — refinement types and struct-field validator words in the bootstrap (lane C4)

Branch `s478-boot-refinement` (from main 6ea07d203). Bootstrap only (`compiler/self-host-v2/`).

## What

- **AST** (`ast.scrml`): `ATypeK.TRefine(base, pred)` — a refinement `base(pred)` (§53.2.1). `pred` ""
  = reported (untrusted downstream). `ATypeField.vals` — validator words after a field's type.
- **Parse** (`parse.scrml`):
  - reads a refinement in a code type (`parseTypeBody` → `parseRefine`, `(` touching the base name) and
    in an opener type (`openerTypeMember`, to the MATCHING `)` — §66.2.4).
  - judges it where declared (`judgeRefine`): malformed predicate / tail after `)` / unknown named shape
    → E-CONTRACT-002; `@x` in the predicate → E-CONTRACT-003 (§53.11).
  - decides its zone: a fixed declaration whose value is a literal (`const x: T(p) = lit`, a top-level
    non-`let` self-closing attribute-free `<x:T(p)=lit/>`) is the static zone — judged now
    (`refineFixedZone`, E-CONTRACT-001; base-type check S458: 1.5 is not `integer`). Every other
    position (param, return, field, `let`, non-literal value, tape element, `| not` member, typed
    attribute, child field) is the boundary zone → E-BOOTSTRAP-UNSUPPORTED (INTERIM,
    g-boot-refinement-runtime-checks-s478) — never an unchecked annotation.
  - a union with a refined member and a map/set member of refined entries → E-CONTRACT-002 (§53.11).
  - struct/variant field validator words (`role: Role req`, `oneOf([…])`) are read (`parseTypeFields`).
- **Analyze** (`analyze.scrml`): `resolveRefine` (base type; reported → unresolved); `fieldValsWhy`
  (`req` on enum/struct/host/int/number/bool holds for every value → read, no check; anything else
  refused INTERIM); `plainMatch`: a refused subject (E-TYPE-024 …) marks the match's coverage refused, so the
  typer does not widen it by `not` (no E-TYPE-031 cascade).
- **Cases**: 9 match cases gained `return … ;` on their tail `match` (§48 return rule / E-TYPE-043,
  S469 "always explicit"); `refinement/malformed-predicate-param-pos` gained `;`. impl#1 still passes all.

## Status
- [x] implementation · [x] slice tests (7362 pass) · [x] hook · [ ] PR
- merged main 2a4e95bf4 (body-top #1876, nested-logic #1880): severity.scrml regenerated.

## Measurements (base main 2a4e95bf4 vs head)
- bootstrap conformance: PASS 456 → 473, FAIL 97 → 76, UNSUPPORTED 676 → 680; 0 PASS→FAIL.
- corpus (4035 inputs: samples, examples, conformance cases + twins, bootstrap acceptance):
  0 newly-rejecting, 10 newly-accepting (the edited match cases), 148 already-rejecting inputs
  changed error set (parse cascades replaced by E-CONTRACT-* / named refusals).

## Fix round 1 (S239 review of #1888, verdict FIX)
- merged origin/main 6ea07d203+ (severity.scrml regenerated); main's new `aliasCycles` match gained a `.TRefine` arm (the bundle did not compile without it).
- HIGH-1: `refLenLit` counts CODE POINTS (`codePointCount`; Appendix D.1, S469). `string(.length == 1) = "😀"` clean, `== 2` E-CONTRACT-001.
- MED-1: `parseTypeFields` — a validator word followed by `:` is the next field's name (`{ a: int\n min: int }`, `{ a: int max: int }`).
- MED-2: a number token that is NaN (`1.2.3`, `1..2`) is E-CONTRACT-002 (`refBadNum`; §53.11).
- LOW-1: a constraint label `base(pred)[name]` (no grant word) is refused by name (INTERIM, g-boot-refinement-label-s478), in a code type and an opener.
- LOW-2: a bare name as an operand (`<=max`, `.length <= max`, `lo < value < max`) is E-CONTRACT-003 (§53.2.1); the "undecided" owner question is dropped.
- LOW-3: `req` written twice on a struct field is refused by name (`fieldValsWhy`).
- LOW-4 filed: g-boot-opener-quoted-value-escapes-dropped-s478 (on base, out of lane).
- tests: slice-m2/refinement-s478.test.js "S239 review of #1888 (fix round 1)".
