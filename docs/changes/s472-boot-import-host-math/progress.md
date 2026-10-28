# progress — s472-boot-import-host-math

Branch `s472-boot-import-host-math` from `origin/s472-boot-link-visibility` (PR #1606, 67bd70862).

## Log

- start: worktree clean; node_modules symlinked from main; `bun run pretest` OK.
- step 2 (impl#1, S471 policy-authorized): `compiler/src/host-import.js` `SELF_HOST_PATH_PREFIX`
  `"stdlib/compiler/"` → `"stdlib/"` (§21.3.1 / §22.13 S471 text); `.d.ts` in step; repo `scrml.toml`
  comment; SPEC's three "Nominal on impl#1" notes updated. Tests: import-host.test.js — the
  allow-list unit pin widened (stdlib/math, stdlib/other admitted; src/stdlib/…, stdlibx/, app.scrml,
  and every file under "disabled" still refused) + one compile test (stdlib/math/m.scrml clean;
  src/stdlib/math/m.scrml → E-IMPORT-008). Red on base: 2 fail / 46 pass
  (~/.cache/scrml-pa/s472/hostmath-impl1-red.log); green after: 48 / 0.
- step 1a (bootstrap, SPEC-covered half): parse + judge `import:<tag>` (§21.3.1).
  - ast.scrml: `AImport` gains `host: string | not` (`not` plain; the host-tag otherwise — no ""
    sentinel, the §4 "string only in literals / identifiers" invariant, slice-m2/parse.test.js) and
    `top` (written at file top level — outside `${}` and `<program>`). `import:` with no tag is
    E-PARSE-IMPORT and yields no item.
  - parse.scrml: `parseImport` reads `import:` + tag and `name as local` (host imports only; the
    plain-import alias stays g-boot-import-codes-and-alias-s471); `top` threaded
    parseMarkupItems(tag=="") → parseMarkupItem(fileTop) → logicRegionItem → parseLogicItems →
    parseLogicItem → parseImport (a `${}` run is never top).
  - link.scrml: `importsOfItems` = MODULE imports only (a host import links nothing, supplies no
    stdlib module); `hostImportsOfItems`; `isStdlibPath` (the build's `scrml:` path — structural).
  - analyze.scrml `checkHostImport` (impl#1's order and codes): !top → E-IMPORT-003; tag ≠ host →
    E-IMPORT-009; `host` + non-.js/.mjs/.ts/.mts target → E-IMPORT-009 (impl#1 parity); a non-stdlib
    file → E-IMPORT-008; all passing → E-BOOTSTRAP-UNSUPPORTED "admitted, but the bootstrap does not
    yet load or emit a host module" (STOP point — see SPEC silences). `importRefusesName`: a host
    import's names never cascade E-SCOPE-001.
  - tests: slice-m4/import-host-s472.test.js (13) + fixture src/stdlib-s472h/hm. Red on base 0/12 (the 13th, `import:` with no tag, added after)
    (~/.cache/scrml-pa/s472/hostmath-boot-red.log).
- pushed; PR #1607 (base s472-boot-link-visibility; not merged). Local: slices job + e2e-render-map
  green; pre-commit hook 50385 pass / 0 fail; types-gate --check OK; bootstrap-conformance
  regenerated (one UNSUPPORTED reason changed; counts unchanged).

## SPEC silences — STOPPED here (brief: "If SPEC is silent … STOP and report the exact question")

Q1 — output location of a stdlib host module. The bootstrap inlines a stdlib module's functions into
`program.client.js` AND `program.server.js` (both ES modules), so an admitted `import:host` must
become a static ES `import` in each artifact, naming a copy of the thin file. SPEC says nothing about
where that copy lands or what specifier the artifact uses:
  - §21.3 (S440 item 16) mirrors a relative `.js` imported into CLIENT JS to
    `<outputDir>/_scrml_local/<path relative to the project root>`, makes a helper outside the project
    root E-IMPORT-011, keeps server output importing the source file, and says "A `.ts` / `.mts`
    target (`import:host`) is not copied" — read literally, an `import:host` `.js` target IS under
    the copy rule, and a stdlib file is outside every adopter's project root → E-IMPORT-011 for every
    stdlib host file. The rule was written for adopter helpers, not stdlib files.
  - §47.11 puts impl#1's HAND-WRITTEN shims at `<outputDir>/_scrml/NAME.js`; it does not cover a thin
    host file beside a stdlib `.scrml` source.
  - Server output: §21.3 says server/library/tool output "keep importing the source file" — for the
    stdlib, that pins the build host's absolute compiler-install path into the artifact (§58.1: no
    build-host identity in the output).
  Recommendation: `<outputDir>/_scrml/<module>/<file relative to the module dir>` for client AND
  server (one copy, beside the runtime; §47.13 manifest admits it via the client import closure),
  stated as a §21.3.1 normative sentence + an E-IMPORT-011-style refusal for a host file that climbs
  out of its module directory.
Q2 — the scrml type of a host binding. The bootstrap's Core is typed (every parameter and call result
has a type; it has no `asIs` — analyze.scrml refuses it). §21.3.1 says host bindings are "available …
as if they were imported via plain `import`", but a host module carries no scrml types. Options: (a)
the stdlib wrapper's declared signature is the contract and a host call's result takes the declared
return type at a `return` (an unchecked boundary, cf. E-DECL-TYPE-UNPROVEN's "unchecked cast"
objection); (b) host bindings are callable only as the whole body of a typed wrapper
(`export fn floor(x: number) -> int { return _floor(x); }`); (c) a typed `import:host` clause. (c)
edges toward the unratified dpa-075 F3 typed `<host>` binding — not built. Recommendation: (b), the
narrowest — a host binding is usable only as the direct callee of a `return` in a function with a
declared return type and fully typed parameters; anything else E-BOOTSTRAP-UNSUPPORTED.
Q3 — which `scrml:math` API. Brief: "keep the public API and semantics … math API diff (should be
none)". SPEC §41.18's S469 amendment (normative, ruled) changes it: `round(x, mode: Rounding) -> int`
(bare `round(x)` is E-CALL-ARITY), `floor`/`ceil`/`trunc(x: number) -> int` with E-INT-CONVERSION-RT,
`parseInt(s, radix: int) -> int | not` whole-string, `parseFloat`/`toNumber -> number | not`, the
`Rounding` enum; and §41.18 marks the current source + shim "Nominal / spec-ahead … the corpus count
of `round(x)` calls is owed before either compiler enforces the mode". The current API also cannot
be written on the bootstrap: `min(...values)` / `max(...values)` need rest parameters and
`parseInt(str, radix?)` an optional parameter — the bootstrap has neither (probe: E-BOOTSTRAP-
UNSUPPORTED "an unannotated parameter"). `div(a, b, .Mode)` is not in the bootstrap either. So a
bootstrap port is necessarily an API change. Recommendation: port to the S469 API (Rule 4), with
`min`/`max` as two-argument (or `int[]`/`number[]`) forms pending a ruling, and owe the round(x)
corpus count first, as §41.18 says.
