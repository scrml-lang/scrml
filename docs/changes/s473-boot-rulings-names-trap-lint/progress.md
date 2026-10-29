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

## 2026-10-29T04:20Z — part 2 (past-end write trap) implemented

Governing sentence written (SPEC §66.12.6 rule 3): "A position write — `xs[i] = v`, or a write through
a position (`xs[i].f = v`, `xs[i][j] = v`) — whose index is at or past the end of the tape SHALL raise
the `E-INDEX-OUT-OF-RANGE-RT` trap (§19.17) when it runs, as a negative index does (§66.12.8 rule 7),
and nothing is written: a write never grows or pads a tape. A trap is not a `!` failure, so a position
write is not failable." Index-write `E-WRITE-INVARIANT` struck; §66.12.8 x-ref, §19.17 table, §66.11.7
O36 note, §34 row (touched) follow. Not a new code.

Bootstrap: `setPosition` / `writePath` already raised the ScrmlTrap (s472). The element-field write
`@xs[i].f = v` (Core ElemAt → runtime `setAt`) threw a plain Error: now the same ScrmlTrap with
{index, length, at}. Core `EditKind.ElemAt` gains `loc` (analyze EElemAt → lower → print), as
PositionAt has. Trap tests: 4, 2 red on base (ElemAt trap code + loc), 2 pin the s472 paths.
Gap closed: g-spec-index-write-past-end-enforcement-s472.

## 2026-10-29T04:50Z — part 3 (loop-copy lint) implemented

Code picked: `W-LOOP-COPY-WRITE-UNREAD` (Warning) — §34's W-<AREA>-<WHAT> naming (cf. W-MATCH-ARROW-LEGACY,
W-DB-PATH-RESOLVES-ELSEWHERE); "unread" is the observable criterion the PA rec named ("a write to a loop copy
that is never read").

Governing sentence written (SPEC §66.10): "When no read of the binder after the write can observe it — in
source order, or anywhere in the loop body when the write sits inside a loop nested in that body — the
compiler SHALL report **`W-LOOP-COPY-WRITE-UNREAD`** (a Warning) at the write. A read inside the write's own
value or indices does not count (they are evaluated before the write)." §34 row added.

analyze.scrml `loopCopyFor` (called from `loopChecks`, after binding — every body root): accepted part writes
of the binder (EAssignLocal with a path) vs. Name reads of the binder's Sym. A body with a lifted markup row,
an effect or a `defer` is skipped (no false positive). Lint tests: 13, 7 red on base. loops-s469 HIGH 2 pin
moved (its first program IS the linted shape). Gap closed: g-loop-copy-part-write-no-op-s472.

Base red totals: names 8/14, trap 2/4, lint 7/13 → 17 of 31.
