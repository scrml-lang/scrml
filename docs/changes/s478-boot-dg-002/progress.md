# s478-boot-dg-002 progress

- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ab11f2ba1f4d7a93d (base origin/main cc0b2a78e, #1867)
- gap: g-boot-dg-002-withheld-s478 (marker flipped to resolved, resolved-by=s478-boot-dg-002)

## The rule (SPEC)

§34 row E-DG-002 (§31, §22.6), Severity **Warning**: "Dependency graph: a reactive `@variable` is
**declared but never consumed** — no reader edge in any render or logic context (`readers.size === 0`).
Resolution: remove the unused cell, or prefix with `_` to suppress."

§34 (S451, quoted in scripts/gen-bootstrap-severity.ts): "A code whose Severity column reads **Error**
fails the compile … **Warning** and **Info** codes do not fail the compile." So E-DG-002 rejects nothing.
A Warning still fails a TEST whose assertion is an exact diagnostic list (`toEqual([])`, `compileClean`,
the acceptance STATUS code sets, a conformance `notCodePrefixes: ["E-"]`) — that is why the fixtures
had to change, not the harness.

The SPEC's sanctioned exemption is the `_` prefix (and removing the cell); the bootstrap's
`unreadCells` already exempts `_`-named and exported cells.

## What landed

- `compiler/self-host-v2/analyze.scrml`: `docs/changes/s478-boot-analyze-checks/e-dg-002-withheld.diff`
  applied as is (applied cleanly onto cc0b2a78e): `unreadCells` + `programFieldRead/Viewed/Bound`,
  `parseFailed`, wired in `analyzeRun` only over a compile with no Error. No other analyze.scrml edit.
- `compiler/self-host-v2/severity.scrml`: regenerated (`E-DG-002: Error -> Warning`); `--check` passes.

## The fixtures (no warning filtered, no assertion weakened)

Measured with a throwaway instrument (frontEnd logging every E-DG-002 with its test-file frames; with
the code stripped so every call ran), then fixed site by site. Before: 648 failing slice tests in 81
files (slice-m4 527, slice-m2 121). After: 0.

Each unread cell was handled one of four ways, per its role in the test:

1. **READ** — the test observes the cell (runtime `state`, the DOM, or a twin of an error case whose
   cell IS the value): the program now renders it (`<p>${@x}</p>`, `${@xs.length}`), or reads it in
   logic where a markup read would change what is under test (W-LIFECYCLE-011 cases: `function peek()`).
2. **`_`-exemption** — the cell is deliberately unread: a write/landing sink of a type, grant, narrowing
   or terminator check, an initializer under test, a literal `${@x}` that must NOT interpolate.
3. **scaffold declares only what the case names** — a shared program scaffold (CELLS, DECLS, `P`, `D`, …)
   declared cells that only some cases use. `compiler/self-host-v2/slice-m2/scaffold-cells.js`
   `dropUnnamedScaffold(src, scaffoldLines)` empties a scaffold declaration line whose cell nothing else
   in the program names (the line is emptied, not removed, so runtime `file:line` locations hold). It
   never looks at diagnostics and never touches a case's own declaration lines. Where a scaffold cell
   travels with a setter (`go` / `relabel` / `tick` / `@show`'s buttons), the pair is included together.
4. **removed** — a cell nothing ever references (SPEC: "remove the unused cell").

Files (slice: 76 test files + `slice-m4/foreign-content-fixtures.js` + the new `slice-m2/scaffold-cells.js`):

| how | files |
|---|---|
| read | typer-gap, client-bang-compose-s474, effects-summary, else-failable-s474, failable-arm-qualifier-s475, loop-key-s474, repeated-attr, review-r2, server, statement-savepoint-s475, value-positions |
| `_` | dup-fn-s473, front, is-some-s462, tables, arms-union-s469, error-rulings, lifecycle-reads-s475, lifecycle-type-s475, loops-s469, markup-parse-s474, match-s469, p5-holes-s473, page-s476, persist, tape-grants-r3, tape-write-forms, typer-holes-s472, variants-s472 |
| `_` + read | typer-s462-narrowing, typer (m2), local-tape-edits-s475, ruled-backlog-s469, server-artifact |
| scaffold | attr-case-template, base-href-guard-s473, css-s469, css-url-guard-s473, exitless-loop-s473, form-action-meta-refresh-guard-s473, lift-cell-arm-s473, logic-block-const-s472, map-grants-s472, review-r1, static-executable, use-attr, value-form-s469, foreign-content-fixtures (gateProgram), if-chain, show, request-surface-s475 (+ one never-referenced `runs` removed) |
| scaffold + `_` | typer-s460, typer-s462, comment-escapes, core-additions, db-body-s472, dpa045, effect, gate-reach, handled-landing-check-s475, one-expr-brace-s474, parse-batch-s471, request-refs-s475, struct-context-valueif-followups-r1-s475, termination-rulings-s469, terminators-s469 |
| scaffold + read | fn-writes, handled-landing-check-r1-s475, partial-followups-r1-s475, partial-followups-s475, plain-logic-dom-sinks-s473, rulings-s473-lint, sink-guards |
| scaffold + `_` + read | typer-s440, position-write-s472, reset-on, strings-s469, tape-bounds-s477 |

Two offsets moved with a rename and were re-derived, not loosened: termination-rulings `+ 4` →
`+ "= @_n".length`; tape-write-forms' C3 messages now name `_b.xs` / `_o.inner.ys`.

### Acceptance cases (compiler/self-host-v2/acceptance, 9; STATUS unchanged)
removed an unused cell: arms/single-expr-block (`n`), interp/logic-literal-warns (`s`), loop-value/tier0-text
(`xs`), request/target-read-not-dep (`runs`), request/warn-no-deps (`a`, `y`); read: envelope/pooled-postgres
(`r`), interp/attr-expression-warns (`s`, beside the literal), o61/db-let-decl (`hits`); request/warn-unread:
`y` removed, `x` read in logic only (so the case stays W-LIFECYCLE-011 alone).

### Conformance cases (15; outside the slices, but graded by them or PASS→FAIL on the bootstrap)
- reactive/no-write-{attr,derived,field-init,if,interp,own-init}-neg: the twin's leftover `@hits` is rendered
  (value-positions.test.js runs them and requires a clean program). impl#1: still PASS.
- server-db/sql-{aggregate-group,delete-reflects,get-single-row,join-two-tables,order-limit,update-returning}-rt-twin
  and lifecycle/pending-cell-reset{,-on}-reloads-rt: the cell the case's `state` observes (the program never
  reads it) is `_`-named, and its `expect.state` key with it. These were PASS→FAIL on the bootstrap
  (`notCodePrefixes: ["E-"]` matches E-DG-002). A markup read is not possible: impl#1 does not parse the
  §66 opener, so any read there is impl#1 E-STATE-UNDECLARED (measured).
- server-db/sql-where-filter-rt-twin: `_`-naming made impl#1 XPASS (it stops misreading the opener as
  markup); instead the cell is read (`${@admins.length}`), and the impl#1 xfail signature is re-captured
  (`emitted:E-STATE-UNDECLARED=1` → `=2`).
- **⚑ impl#1 pins re-captured (PA please eyeball):** pending-cell-reset-reloads-rt (E-MARKUP-001 2→1,
  E-STATE-UNDECLARED 3→2), pending-cell-reset-on-reloads-rt (3→2, 5→4), sql-where-filter-rt-twin (E-STATE-UNDECLARED
  1→2). Captured with `bun conformance/run.ts --xfail-signature <case>`; still XFAIL under the same gaps.
  impl#1 totals unchanged: 1751/1868 pass, 117 xfail, 0 fail.

## Corpus (COMPILED, the bound-any-branch method)
Throwaway `bun test` (deleted) running slice-m4's `loadM2` + `frontEnd` over every `.scrml` in
`git ls-files -- conformance/cases samples examples compiler/self-host-v2/acceptance`: **3,149 files**, 0 crashed,
once on origin/main's analyze/severity and once on this lane's, both over origin/main's corpus text.
- **0 newly rejecting, 0 newly accepting, 0 files whose Error set changed, 0 files whose non-E-DG-002
  diagnostics changed.** E-DG-002 is a Warning everywhere it fires.
- E-DG-002: 0 → **28 sites in 25 files**, all Warning: 9 acceptance cases (1 each, warn-no-deps / warn-unread 2),
  6 no-write-*-neg (1 each), 7 sql-*-rt-twin (1 each; get-single-row 2), 2 pending-cell-reset (1 each),
  own-value-type/infer-nonliteral-pos (1, `@nums` — the case PASSes either way, left as is). samples/ and
  examples/: 0 (they draw an Error first, and the check runs only over a compile with no Error).
- After this lane's fixture edits: 1 site in 1 file (infer-nonliteral-pos).

## Bootstrap conformance (`bun scripts/bootstrap-conformance.ts --json`)
Before (origin/main cc0b2a78e): PASS 366 · FAIL 239 · NOT-TWINNED 624 · UNSUPPORTED 639.
After: **PASS 367 · FAIL 238** · NOT-TWINNED 624 · UNSUPPORTED 639. FAIL → PASS: `reactive/dg-002-no-readers-pos`.
No PASS → FAIL.

## Residual
501 E-DG-002 sites remain in slice tests that do not assert a clean diagnostic list (they pass); not
touched (the brief's scope is the failing fixtures).
