# s473-stdlib-bootstrap-clean — BASELINE (before any change)

Measured 2026-10-29 on origin/main 4d5b9a15d with `docs/changes/s473-stdlib-bootstrap-clean/measure.ts`
(raw per-diagnostic JSON: `~/.cache/scrml-agent-tmp/s473-stdlib-bootstrap-clean/base.json`; the
per-module table is `baseline-table.md` beside this file).

**Method.** For each stdlib module `scrml:NAME` (a `stdlib/NAME/index.scrml`, and every other
`stdlib/NAME/sub.scrml` as `scrml:NAME/sub`), a one-line entry `import { __probe_s473 } from "scrml:NAME"`
is run through the bootstrap front end exactly as `scrml-boot compile` does (`scripts/scrml-boot.ts`
`loadBoot` → `slice-m2/lowered.js frontEndStdlib`). frontEndStdlib supplies the module as SOURCE and
withdraws it when any of its files carries an Error; the withdrawn module's Error diagnostics are
recorded. "own" = in the module's own file; "closure" = including the stdlib files it imports.
`not-supplied` = the `scrml:compiler` family, which frontEndStdlib does not supply at all
(KNOWN-DEFERRED, §41.17).

**Headline: 1 clean (math) / 36 errors / 0 crash / 16 not-supplied (scrml:compiler*).**
Total Error diagnostics across the 36 (closure counts): 2,775 (md 709, time 333, data/transform 284, store/kv 175,
format 174, data/validate 148, test 105 — the rest < 100 each).

## E-BOOTSTRAP-UNSUPPORTED reasons (own files; sites / modules)

| sites | modules | reason |
|---|---|---|
| 36 | 36 | a `<program>` outside the entry file (the pre-S471 stdlib wrapper) |
| 250 | 28 | an unannotated parameter (S469 E-PARAM-TYPE-REQUIRED; M2 needs typed params) |
| 151 | 16 | a host method call (`process.cwd()`, `Math.floor(…)`, `Array.from(…)`, …) |
| 125 | 16 | member access on a value that is not a struct/instance (host objects: `process.env`, …) |
| 13 | 13 | `<program>` also declared in an imported stdlib module (the wrapper again) |
| 33 | 9 | built-in method on a value of unresolved type (follows from untyped params/locals) |
| 35 | 7 | a part-write on a value of unknown type |
| 29 | 5 | file-scope `const` whose initializer is a call / struct / tape / handling form |
| 16 | 5 | arrow functions outside `.filter/.map`; braced-body arrows |
| 21 | 4 | compound assignment (`+=`, `++`) |
| 15 | 4 | untyped `for…of` iterable |

Parse phase (top): E-STMT-MISSING-SEMICOLON (newline-terminated statements — the S469 dpa-073 rule),
E-PARSE-ITEM (`~{}` test blocks, `export { … } from` re-exports, `async function`, and statements
leaking after an earlier parse error), E-PARSE-EXPR / E-PARSE-EXPECTED (JS-only expression forms:
regex literals, `?.`, `typeof`, `new`, spread …).
