# s473-boot-rulings-names-trap-lint — progress (append-only)

Ruling (verbatim, ../scrml-support/user-voice-scrml.md, "⭐ RULED — S473 PA recs, all", item 4):

> - Same-name components across files, and `<card>` beside `fn card`: REFUSED.
> - A write past the end of a tape position: runtime TRAP.
> - A write to a loop copy that changes nothing: W- lint.

## 2026-10-29T03:22Z — tests first

`compiler/self-host-v2/slice-m4/rulings-s473.test.js`: 29 tests; on base 18 red, 11 green (the
green ones pin present behaviour that must hold: silent cases, the s472 whole-position trap).

Base probes (bootstrap front end):
- `<card>` + `function card` in one file: no diagnostic. `type T` + `function T`: none.
  `type card` + `<card>`: none (both name a type — a gap the ruling also closes).
- two decls / two types in one file: E-BOOTSTRAP-REDECLARE; const vs type/decl: E-BOOTSTRAP-REDECLARE.
- two components of one name in two files: E-BOOTSTRAP-UNSUPPORTED (also for two non-rendering decls).
- `@rows[i].qty = v` past the end: runtime `setAt` throws a plain `Error`, NOT the trap.
- `for (let p of @ps) { p.name = "z"; }`: compiles silently.

## 2026-10-29T03:50Z — part 1 (names) implemented

Tests split per ruling: `slice-m4/rulings-s473-{names,trap,lint}.test.js` (the hook runs them, so
each lands with its part). Names: 13 tests, 8 red on base.

Governing sentences written (SPEC):
- §7.6: "A file-scope name is bound once in its file, whatever it names (S473). … A second binding,
  in the same file, of a name already bound at file scope — of the same kind or of another … — SHALL
  be a compile error (E-SCOPE-010: duplicate binding in file scope)."
- §9.1 DQ-7: "two components (declarations with `renders`, §66.15.1) of one name in one program SHALL
  be a compile error (`E-COMPONENT-NAME-DUPLICATE`), whichever files declare them".
- §21.2 cross-reference; §34 rows: E-COMPONENT-NAME-DUPLICATE (new), E-SCOPE-010 (touched, emitter note).

analyze.scrml: `fileNameClashes` (new; replaces dupTypes' same-file half), `dupDecls` (cross-file only;
component pair → E-COMPONENT-NAME-DUPLICATE, other pair stays E-BOOTSTRAP-UNSUPPORTED), `dupConsts`
(type / decl → E-SCOPE-010). Gaps closed: g-boot-decl-fn-same-name-one-file-s472,
g-boot-component-scope-key-bare-name-s472. Filed: g-boot-decl-same-name-noncomponent-s473 (unruled
residue: a same-named pair that is not two components).
