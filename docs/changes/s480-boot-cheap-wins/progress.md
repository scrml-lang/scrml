# s480-boot-cheap-wins — progress

Lane: bootstrap features the S480 census found cheap (compiler/self-host-v2 only; impl#1 frozen).

| item | gap | status |
|---|---|---|
| 1 `??` | g-boot-nullish-coalesce-unparsed-s480 | built — parse (binPrec row at `||`'s level, E-EXPR-NULLISH-MIX), analyze (resolver + typer `nullishVT`, lin/plan short-circuit), Core `PrimOp.Coalesce`, print `??` (parenthesized beside `&&` / `||`) |
| 2 bare `@.` | g-boot-at-dot-bare-unparsed-s480 | built — parse.scrml `parseAt` consumes the `.`; coverage row §17.7.3 evidence updated |
| 3 `x is .V` | g-boot-is-variant-unbuilt-s480 | built — parse.scrml `variantTest` reads it as `match x { .V :> true, else :> false }` (arms marked `test`); E-TYPE-062 / E-TYPE-063; refusal row removed |
| 4 `class:` | g-boot-class-directive-unbuilt-s480 | built — analyze AttrKind.AClass, Core Attr.ClassOn, print `rt.classOn`, runtime `classOn` (`classList.toggle(name, !!v)`); E-ATTR-013 |

Tests (red on base, 19/19): slice-m4/{nullish-coalesce,at-dot-bare,is-variant,class-directive}-s480.test.js.
Conformance: 4 new runtime cases (both impls PASS); 2 existing e-type-062 cases get a `dialect.s66` (their twin now reaches §17.6.10.1).
Census (as-written, 40 programs mentioning a construct): clean 0 → 1 (tutorial 03-todos, `class:`).

## r1 (S239 review BLOCK on ae5d75802)

| finding | fix |
|---|---|
| F1 HIGH `class=(expr)` + `class:` compiled clean, the wholesale write erased the toggle | analyze `classWriterConflict` (resolveHtml): E-ATTR-WRITER-CONFLICT at the `class=`, naming every `class:` (§5.5.4 Axiom ①); static `class="k"` stays legal; inside `<each>` too. Conformance style/class-writer-conflict-pos (both impls PASS) |
| F2 MED trapped `class:` removed the class, element stayed (reveals `class:hidden`) | runtime `classOn` is an element-hole writer (`elementHoleOf` / `holdElement` / slot; `restoreHeld` toggles a `cls` slot before re-insert). SPEC §19.17 + §5.5.2 sentence |
| F3 LOW typer-only subject → E-TYPE-VARIANT "arms" | `plainSubjectCheck` → `testSubjectMismatch` (E-TYPE-062 non-enum, E-TYPE-063 other enum); `testMaybeCheck` skips a `T|not` of another type (one report) |
| F4 LOW W-MATCH-001 on one-variant `is`; `is .B(x)` → E-LOGIC-EXECUTABLE-SINK | W-MATCH-001 skipped for test arms; parse `variantTest` refuses a same-line `(…)` (E-PARSE-EXPECTED naming the `is` form, §18.17 "SHALL NOT bind … payload") and reads past it |
| F5 LOW e-type-062 neg override | kept; dialect.s66 reason states the PASS no longer proves a clean compile, and why the markup rewrite was not taken |
| F6 LOW `int|not ?? bool` condition "cannot be resolved" | `condMixed`: names the mix ("either `int` or `bool`"), keeps §42.4 st.5's "cannot resolve (to one type)" + fixes |
| SPEC | §42.4 positions + provenance; §5.5.2 `!!value` → condition; §19.17 class: sentence |
