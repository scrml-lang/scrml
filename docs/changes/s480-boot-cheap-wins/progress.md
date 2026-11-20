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
