# s470-bang-catch-try-body — progress

Gap: `g-impl1-bang-catch-try-body-cut-at-first-brace-s470` (HIGH, security). Lane C, S470.
Scratch: `~/.cache/scrml/s470/laneC/` (base tree = `git archive origin/main` d582ae04f in `basetree/`).

## ROUND 4 — re-review of d102fa286 (FIX): R1 regression, PA ruling

- **R1 (HIGH, my round-3 regression)**: the round-3 ASI boundary turned a MISSING OPERATOR
  (`const ok = isMember⏎  !banned`, `!(banned)`, the value in an `if`, `return true⏎!banned`) into
  `ok = isMember` plus a no-op `!banned` statement — a wrong password logged in on every side (server
  and tool had refused it). SPEC §7.2.2 rule 4: a newline is whitespace → `isMember !banned`, no
  expression. **PA ruling, implemented**: keep the boundary (nothing swallowed) but REFUSE a `!`-led
  statement after a value-ending line with no `;` — E-STMT-UNEXPECTED-TOKEN at the `!` ("no statement
  begins at `! banned`"), `! ( … )` included (`const z = 1⏎!(ok = f())` is `1 !(…)`). After a `;`, at a
  block start, and a next-line postfix `!{ … }` (rule 4: `x⏎!{…}` handles `x`) are unaffected; a gapped
  `! { … }` keeps E-ERROR-014 / E-TRY-NOT-IN-SCRML.
- The two re-pointed tests are restored to their original (refused) expectations
  (`s465-await-arm-r3` dropped-`!(…)` line; `bang-arm-block-value-s468-r1` arm tails): both met.
- Also: a `catch` collected into an expression (`const q = ! { a: 1 } catch T { … }`, reviewer
  detect2 "decl rhs space bang" — FAIL on d102fa286) → E-TRY-NOT-IN-SCRML (not after `.` / before `:` /
  inside a source `try`).
- LOW (`!` alone on a line then `{ … }`): measured E-ERROR-014 on this head at block start, after `;` and
  after a declaration (E-TRY-NOT-IN-SCRML with a `catch`) — no change needed.
- Pack group 17 (R1, 20 shapes): FAIL on d102fa286 on all 5 sides; on origin/main 55de8639c FAIL on
  client / library / fullstack, PASS-REFUSED on server / tool; head PASS-REFUSED ×20. Group 14's
  `! ( … )` shapes re-pinned PASS → PASS-REFUSED. r10 = 360, all PASS-REFUSED.
  EXPECTED_SHAPE_COUNT = main 3021 + 360 = 3381 (measured 3384 tests, 0 fail).
- Merged origin/main 55de8639c (lane B r11–r15).

## ROUND 3 — review of 3e52bcc45 (LAND-WITH-FOLLOWUPS): F1, F6, F4, F8, F9

Probes: `~/.cache/scrml/review/s470-lc/` (read-only). Base for new shapes: extracted 3e52bcc45
(`~/.cache/scrml/s470/laneC/r2tree`). origin/main 29fcaac8a (#1558, lane D r9) merged first.

- **F1 (HIGH)** — WHY: the statement collector (`collectExpr`, BUG-ASI-NEWLINE) did not end a statement
  at a newline before `!`, so `const st = { ok: true }⏎! { … }` became ONE declaration; the expression
  reader parsed `{ ok: true }` and dropped the rest (the server's S465 dropped-statement refusal caught
  it; client / library did not). Fix at the reader that merged it: `!` is PREFIX-ONLY (`a !b` is no
  expression; `!=` / `!==` are their own tokens), so after a value on a later line it STARTS a statement
  (JS ASI). Then: a statement starting `!` `{` (the `!{` block with a gap — space, tab, newline, comment)
  is refused at the `!` — E-TRY-NOT-IN-SCRML when a `catch` follows its brace, else E-ERROR-014; a
  `! ( … )` statement is an ordinary expression statement and RUNS (not dropped).
  - A broader attempt (emitExpr refusing ANY lost trailing content off the server) was measured and
    dropped: false refusals (`t("T"); // tail`, a function body's `}`, `!{}` arm text, implied-lift tails,
    promote-each key clauses).
  - Consequence (tests updated): `bang-arm-block-value-s468-r1` arms `{ @note = "d"⏎ !yes }` were
    refused as unreadable; they are now READ (the arm yields `!yes`) and reject the wrong password;
    `s465-await-arm-r3` "dropped `!(…)` guard line" moved from refused to executed (WELCOME / REJECTED).
- **F6** — a `!{ arms }` attached to no expression (first statement of a body, braceless `if (c) !{…}`)
  → **E-ERROR-014** (existing §34 row: a `!{}` handler attached to no expression; its row names the
  markup position — wording is the PA's, like F7). The emit-logic `error-effect` case now REFUSES
  (E-ERROR-014) instead of emitting `try { } catch (e) { arms }` — kept as a fail-closed backstop for a
  front end (the native re-parse) that does not refuse it.
- **F4** — the form consumed as text by a loop head (3 for-of head readers), a condition or an operand:
  every statement-form block a logic body's token run holds is refused once (E-TRY-NOT-IN-SCRML) at
  the end of `parseLogicBody`, whichever reader reached it; plus the head loops and collectExpr report
  it directly.
- **F8** — the defer test also asserts the old source (defer in the catch arm) → E-TRY-NOT-IN-SCRML.
- **F9** — `tryChildCount` and the arms' `open/close/childFrom/childTo` removed (no reader).
- Pack: +28 shapes (groups 14 / 15 / 16), **all FAIL on 3e52bcc45**; head 25 PASS-REFUSED + 3 PASS
  (`! ( … )` runs; 3 sides). r10 = 340; EXPECTED_SHAPE_COUNT = main 2680 + 340 = **3020** (measured).
- R26 (3,618) vs origin/main 29fcaac8a: identical codes for every file.

## ROUND 2 — PA ruling: the statement form is REFUSED (supersedes "Fix" below where they differ)

Ruling (S470, narrow class): refuse `!{ … } catch T [as b] { … }` with a located error. SPEC §19.1:
"There is NO try/catch. There are NO exceptions. Errors are values that flow through the type system and
are checked at compile time." Corpus uses: 0.

- Code: **E-TRY-NOT-IN-SCRML** (existing §34 row: "scrml has no `try`/`catch`/`finally`; the error model is
  `fail` / `?` / `!{}` / `<errorBoundary>`"). Reused rather than minting: the construct IS a try/catch in
  scrml source; no SPEC edit (the row's first sentence names the `try` keyword — a catalog-text widening
  is the PA's call if wanted).
- Kept: the splitter's `errorEffectExtent` + main-loop catch-arm reading (detection) and the no-glue fix.
- ast-builder: one E-TRY-NOT-IN-SCRML at the form's `!{`, nothing lowered; a `catch` that starts a
  statement (an arm left behind by a `!{ … }` re-read from text, or a bare clause) is refused at the
  `catch`. Removed: the try-body/arm slicing, tokensLeaveBodyOpen / lineColAt, the E-PARSE-001 refusals.
- emit-logic.ts: the try-body emission loop removed (no node carries a body). The case stays — a
  standalone legacy `!{ arms }` with no guarded statement still reaches it.
- type-system.ts: reverted to origin/main (zero diff — helps lane B).
- defer-outside-function-bodies: its statement-form probe now writes `risky() !{ _ e :> defer note("x") }`
  (still E-DEFER-UNSUPPORTED-SITE).
- Pack renumbered to r10 (n29 / s13 / f16 / l8 / t8); all 312 shapes PASS-REFUSED on head, 293 with
  E-TRY-NOT-IN-SCRML. The other 19 hold the form where impl#1 keeps code as TEXT (onclick block: E-CODEGEN-
  INVALID-LOGIC / E-ASYNC-HANDLER-UNANALYZABLE / E-ATTR-UNQUOTED-OPERATOR; engine `effect=`: E-ERROR-002) or
  hit the splitter template limit (lone `` `}` ``: E-CTX-001) — still fail closed. EXPECTED_SHAPE_COUNT =
  main 2265 + 312 = 2577.
- Text-held positions with a NON-failable body (scratch textpos.mjs): engine opener / state effect
  (E-ERROR-002), onclick block and `${() => {…}}` (E-CODEGEN-INVALID-LOGIC), when body (E-TYPE-031),
  `<match>` arm markup, component body: refused; onMount, `^{}`, `<timer>`, markup interpolation, server
  fn: E-TRY-NOT-IN-SCRML. None compiles.

## Findings (measured on base d582ae04f = 6081e0685 + an inbox-only commit)

- Repro `~/.cache/scrml/review/s470-l1d/F2/app.scrml` reproduced: exit 0, `_scrml_cs_reactive_set("ok", _scrml_check_3(p))`,
  catch arms empty (`try { … } catch (e) { throw e }`).
- Locus 1: `ast-builder.js` `case "error-effect"` cut the try body at `rawContent.indexOf("}")`. The block
  splitter already brace-balanced the try body (string-aware) and then consumed `catch` arms with a NAIVE
  brace counter (no string / comment awareness). Both the `${}` and the auto-lifted bare-function paths
  go through the splitter.
- Locus 2 (found while building probes): written AFTER any statement, the form was glued to that statement
  as a postfix `!{}` handler (three glue sites in ast-builder.js) — the whole try body was DROPPED. A body
  that revokes access never ran: FAIL on base (group 11).
- Locus 3: `emit-logic.ts` emitted the try body with NO options, so a write to an enclosing local became a
  shadowing `const` (the write never left the try body) and the body lost boundary / server-call facts.
- Locus 4: `type-system.ts` `case "error-effect"` never visited the try body: no E-ERROR-002, no
  E-SCOPE-001, no undeclared-cell error inside it. And a correctly-read
  `!{ @ok = check(p) } catch AuthErr as b { @ok = false }` is STILL a fail-open: it lowers to a host
  `try/catch`, but a failable call RETURNS its error, it does not throw, so the arm never runs.
- NOT FIXED (surfaced): the form is not in SPEC (§19.1 "There is NO try/catch"; §19.4.3 lists the
  handling forms — `!{}` there is the postfix handler only). `x instanceof AuthErr` on an enum object
  throws TypeError at run time, so a typed arm cannot run even for a host throw.

## Fix (constrain to the proven path)

1. `block-splitter.js`: record where the splitter's own loop ended the try body and each `catch` arm
   (`block.errorEffectExtent`); read each handler with the same main loop (re-open the frame after
   `catch … {`) instead of the bare brace counter.
2. `ast-builder.js`: slice the try body / arms from the extent; tokenize the body with the block's own
   children; refuse (E-PARSE-001, located) a statement form with no recorded extent, a malformed arm
   header, an unclosed arm, or an extent the logic tokenizer does not read as the same balanced body.
   Never glue the statement form to the previous statement; refuse a `!{ … }` re-read from text with its
   `catch` left behind.
3. `emit-logic.ts`: emit the try body through `emitLogicBody` with the enclosing options and a
   block-scoped copy of the declarations.
4. `type-system.ts` (one case arm — lane B edits this file): visit the try body as a block. An unhandled
   failable call there is E-ERROR-002 (fails closed: the catch cannot handle it).

## Probe pack — r9-shapes.js, families n29 / s12 / f15 / l7 / t7 (312 shapes)

| family | base FAIL | base other | head FAIL | head |
|---|---|---|---|---|
| n29 client (77) | 29 | 4 PASS, 17 REFUSED, 27 DENY | 0 | 33 PASS, 40 REFUSED, 4 DENY |
| s12 server (54) | 17 | 14 REFUSED, 23 DENY | 0 | 24 PASS, 30 REFUSED |
| f15 fullstack (57) | 17 | 17 REFUSED, 23 DENY | 0 | 25 PASS, 32 REFUSED |
| l7 library (62) | 16 | 30 REFUSED, 16 DENY | 0 | 20 PASS, 42 REFUSED |
| t7 tool (62) | 21 | 4 PASS, 14 REFUSED, 23 DENY | 0 | 28 PASS, 34 REFUSED |

Transitions: FAIL→PASS-REFUSED 69, FAIL→PASS 29, FAIL→PASS-DENY 2, PASS-DENY→PASS 73,
PASS-DENY→PASS-REFUSED 37, PASS-REFUSED→PASS 22, PASS-REFUSED→PASS-REFUSED 70, PASS→PASS 6,
PASS-DENY→PASS-DENY 2, PASS→PASS-REFUSED 2 (`10 module init: string holding }` client + tool: a handled
call written into a MEMBER, `g.gate = check(…) !{…}`, is E-ERROR-002 — the same refusal it gets outside the
form; its "bound first" twin PASSes).

Pinned in pinned-class.js; EXPECTED_SHAPE_COUNT 2265 → 2577; README section added.

## Other positions (client, run with the pack's runShape; scratch positions.mjs)

when body, arrow block body, `<match>` arm block, component body, `<match>` arm markup function: refused
on base and head (E-ERROR-002 / E-CODEGEN-INVALID-LOGIC / probe-shape errors). Nested function, loop
body, engine opener `effect=`, `<onMount>`: FAIL on base → PASS / PASS-DENY / PASS-REFUSED on head (added
to n29 as group 13).

## R26 — 3,618 files

examples, samples, compiler/samples (incl. mcp-v0-fixture), benchmarks, conformance, docs: 3,564 files,
base = extracted origin/main d582ae04f compiler (its in-tree stdlib), head = this worktree, corpus = this
worktree for both: **identical diagnostic codes for every file** (0 newly rejected, 0 newly clean, 0
changed). stdlib/: 54 files, each compiler over its own in-tree copy: identical.

## CI job commands (run locally)

types:check OK (181, unchanged) · snippet-gate 0 · claim-gate 0 · corpus-compile-floor PASS · md-shim
current · conflict-marker PASS · spec-index OK · delta-lint PASS · ci-shards needs OK · s34-census
--check-new vs origin/main PASS · bootstrap-severity current · lint-no-default-arm 0 · e2e-render-map
259/0 · lsp+commands 777/0 · TodoMVC compile + node --check OK · browser-baseline PASS · host-global
1/2 + 2/2 exit 0, 0 violations (leg 2's 135 compile throws identical on base) · facts --check exit 1
(STALE — WARN-only in CI; FACTS.md is bot-owned, not regenerated here) · hook suite (unit + integration
+ conformance + root + slices) 46911 pass / 0 fail.

## Log

- base findings, progress file (72c05f3c8).
- splitter extents (commit 1), AST slicing + no-glue + refusals (commit 2), codegen opts (commit 3),
  TS try-body visit (commit 4). Full hook suite green at each: 46911 pass / 0 fail / 129 skip.
- pack + unit tests (commit 5). R26 identical. CI job commands green (above).
- NEXT: merge origin/main (no rebase), final report.

## Candidate gaps (for the PA to file)

1. The statement form `!{ … } catch T [as b] { … }` is not in SPEC (§19.1 "There is NO try/catch"). Its
   catch arm can never handle a scrml failure (a failable call returns its error), and a typed arm's
   `e instanceof AuthErr` throws TypeError on the enum object, so the arm cannot run for a host throw
   either. Recommend: refuse the form (E-TRY-NOT-IN-SCRML-style, pointing at `call() !{ … }`) or SPEC it.
2. A handled call written into a MEMBER (`o.f = f() !{ … }`) is refused E-ERROR-002 even outside this form
   (a valid program refused), and its lowering (`let r = o.f = f(); if (r && r.__scrml_error) r = …`)
   writes the RAW error into the member — a fail-open wherever the refusal does not reach (the try body
   was such a place before this lane). `o.f = match f() { … }` is E-CODEGEN-INVALID-LOGIC.
3. The block splitter ends a brace context at a `}` inside a template literal (`` `}` ``, `` `x${p}y}` ``)
   or a block comment (`/* } */`): E-CTX-001 on a valid program (fails closed), in any `${}` / `!{}` body.
4. Library mode emits module-level statements as raw source text (`const g = { … } !{ … } catch …`,
   `if (…) { … }` copied verbatim): caught by the emitted-JS parse gate when it does not parse; located,
   not traced for the cases that do parse.
5. An inline event-handler block holding the form (`onclick={ !{ … } catch … }`) and a statement form
   nested in a catch handler are E-CODEGEN-INVALID-LOGIC (handlers are lowered from text) — fail closed.
