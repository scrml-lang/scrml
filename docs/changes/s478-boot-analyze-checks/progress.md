# s478-boot-analyze-checks progress

- started at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a1db9bded31cb8a6c (base origin/main 20b76334e)
- input: `~/.cache/scrml/review/s478-triage/TRIAGE.md` clusters C11a, C11b, C13, C14
- scope: `compiler/self-host-v2/` + `scripts/bootstrap-conformance.ts` `SUPERSEDED_CODE_MAP`

## C11a — engine variant codes (F3)

⚑ **The brief's F3 premise is contradicted by the SPEC and by a user ruling.** The triage (and the
harness rows) say §66.20 names no successor for the engine variant codes. §66.20's S451 table
"Bootstrap codes named, with the legacy codes they supersede" does name them:
`E-DECL-STATE-CHILD` supersedes E-ENGINE-STATE-CHILD-INVALID-VARIANT and
E-ENGINE-RULE-INVALID-VARIANT, and `E-TYPE-VARIANT` supersedes E-ENGINE-INITIAL-INVALID-VARIANT.
The table was RULED: ruling:user-voice-scrml.md S451 "your recs" (c) — *"§66.20 names
`E-DECL-STATE-CHILD` / `E-TYPE-VARIANT` with the legacy codes each supersedes, so the counter's
per-code mapping is SPEC-backed."* §66.2.2 O52 itself names no code. So the bootstrap's
codes are the named ones. The three "owed" harness rows are now `applied` to the S451 targets,
and no compiler change was made for those three. Emitting the legacy codes from the §66 checks
would reverse the S451 ruling.

F3 does apply to the two retained codes that have no §66.20 successor and no emitter. Both are built:
- E-ENGINE-STATE-CHILD-MISSING (§51.0.F; §66.13.2 "the graph's coverage of the enum … checkable").
  graphOf reports once per variant with no state-child, at the field's opener.
- E-ENGINE-MOUNT-NOT-ENGINE (§51.0.D, §21.8). ⚑ PA reading, for veto: under §66 an engine is a
  `single` declaration and a component is a declaration, both mounted by tag. So the code fires for a
  self-closing tag that names an IMPORTED binding which is no declaration (a function, a
  constant, a type). This is unknownElement / importedNonDecl.

## C11b — per code

| code | SPEC | result |
|---|---|---|
| E-ENUM-VARIANT-CASE | §14.4 "Enum variant names SHALL begin with an uppercase letter"; §34 row (§14.4) | BUILT: `enumDefOf` / `upperInitial`, once per variant, payload fields exempt |
| E-RESERVED-IDENTIFIER | §6.8.2 "`reset` is a RESERVED IDENTIFIER — declaring a local function `function reset() { ... }` or `fn reset { ... }` is E-RESERVED-IDENTIFIER"; §34 row (§6.8) | BUILT: `reservedFns` (file-scope and nested) |
| E-DG-002 | §34 row (§31, §22.6, Warning) "declared but never consumed — no reader edge in any render or logic context … prefix with `_` to suppress" | BUILT, then WITHHELD from this PR (see below). The implementation is kept as `e-dg-002-withheld.diff` beside this file; `git apply` takes it as is |
| W-STYLE-CONFLICT-POSSIBLE | §65.2.4 R3 "fires … ONLY on a provable local (same-file) overlap"; §34 row (§65.2.4, Info) | BUILT (program-scope limb): `styleOverlaps`; gap g-bootstrap-css-conflict-checker-unbuilt-s473 narrowed |
| E-DG-001 | §34 row (§31) "circular dependency in reactive graph"; §31.2 has no trigger text | NOT BUILT, SPEC silent on the case's call-cycle reading. Gap g-boot-dg-001-call-cycle-unruled-s478 (ruling owed) |
| E-TYPE-026 | §18.9: RETIRED S473 D19 (ruling:user-voice-scrml.md S473 "your recs on all" — "retire E-TYPE-026") | NOT BUILT, retired. The case is stale. ⚑ reading below |
| E-REACTIVE-003 | §34 E-AUTH-001 (§52.11) "Client-local `@var` used as bound parameter in `?{}` INSERT/UPDATE/DELETE outside server function"; RULED S473 D29 "one code per rule, the more specific winning … re-code the bootstrap to E-AUTH-001" | NOT CHANGED. The bootstrap's E-AUTH-001 is the ruled code (D29), and `reactive/server-fn-rawvar-read-error` predates D29 |
| E-CG-003 | §34 row (§47) "Codegen: unsupported AST node kind in emission" — impl#1's codegen refusal | NOT BUILT. §18.2 admits the program; the bootstrap refuses it by name (E-BOOTSTRAP-UNSUPPORTED). Gap g-boot-conf-e-cg-003-impl1-codegen-code-s478 |

### E-DG-002 — built, measured, withheld (fork for the PA)
The check is `unreadCells`, over the program's cells. A cell counts as consumed by:
- a resolved read (NameFact NField; a write target records none);
- a `bind:` (ABind);
- `<*f/>` of its graph (MStateView);
- a `reset-on=` trigger;
- `persist=`;
- the CSS bridge.

Exported cells and `_`-prefixed cells are exempt. The check runs only over a compile with no Error,
since a read inside a refused construct is never resolved.

It worked, with no false positives on the cases probed. The conformance case
`reactive/dg-002-no-readers-pos` passed. But slice-m4 went from 0 to **528 failing tests across
about 45 files**: test fixtures declare cells the test never reads, and the suites' "clean" helpers
(`compileClean`, `diags` toEqual([]), the acceptance STATUS's exact code sets) count a Warning.

Landing it means editing about 45 test files that sibling S478 lanes also edit. Each edit either
reads the cell or accepts the warning. That is a conflict magnet, and it is unrelated to this
lane's other codes, so the wiring is withheld.

Rec: a dedicated lane after the parallel lanes land. Apply the diff, then make one mechanical pass
over the suites: reading the cell or `_`-prefixing it is better than filtering the code, because
filtering would hide the warning from the tests. The acceptance STATUS needs E-DG-002 added on
its rows (31 acceptance cases).

Corpus count, measured before the no-Error gate was added: 61 sites in 53 files, all Warnings, so
nothing is newly rejected. Gap: g-boot-dg-002-withheld-s478.

### ⚑ E-TYPE-026 reading
SPEC §18.9, table row "Markup context (direct) | NO | ~~E-TYPE-026~~ — the word `match` there is
markup text, not an expression (S473 D19)", and the amendment "E-TYPE-026 is retired … In the
markup, SQL and CSS rows the word `match` is that context's own text, not a scrml expression, so no
code is needed there *(PA reading of what "retire" leaves in those three rows)*". So nothing is
built for E-TYPE-026. The case `match-codes/e-type-026-match-in-markup-pos` asserts a retired code.
A finding that is not acted on: for the same source, the bootstrap emits E-CONTROL-FLOW-IN-MARKUP
(a bare `match … { … }` in a markup body). The §34 row of that code lists only `for` / `if` / `while`,
and §18.9 now says the word is markup text. Whether the bootstrap's wider refusal stands is a PA
reading. It fails closed: no text that looks like control flow ships raw.

## C13 — cascades
- E-TYPE-031 after E-MATCH-012: the typer gives a `match` the binder refused for coverage
  (E-TYPE-020 / E-MATCH-012, `coverageRefused`) the value Unknown, as it does for an arm conflict.
  A W-MATCH-002 literal match is still widened by `not`.
- E-DEFER-LATER-SHADOW beside E-SCOPE-REDECLARE: `laterLocals` skips a later local that
  redeclares a name its block already binds (a parameter, for the function body).

## C14 — orphan `else`
parse.scrml `orphanElse` (the only parse.scrml edit, in parseStmt's statement dispatch).

## Corpus (newly-rejecting measure)
(see the report; filled in at the end)

## Tests
`compiler/self-host-v2/slice-m4/analyze-checks-s478.test.js`
