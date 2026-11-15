# s478-conf-case-migration — progress

Case-side only. Input: `~/.cache/scrml/review/s478-triage/TRIAGE.md` (read-only triage of the 260
bootstrap conformance FAILs at origin/main 5a0fd0eb5). Worktree base: origin/main 20b76334e.

## Baselines (before)

- bootstrap (`bun scripts/bootstrap-conformance.ts`): PASS 343 · FAIL 260 · NOT-TWINNED 624 · UNSUPPORTED 638
- impl#1 (`bun conformance/run.ts`): 1751/1865 pass, 114 xfail, 0 FAIL

## Part 1 — C1 `;` corpus migration

Governing SPEC sentence — §7.2.2 rule 1:

> **`;` ends a statement.** In a statement list, every statement that is not block-like (rule 2) SHALL
> end with `;` — the last one before the list's closing `}` included (`onclick={ @n = @n + 1; }`). A
> statement with no `;` after it SHALL be **`E-STMT-MISSING-SEMICOLON`** (§34) …

and §7.2.2 rule 8: "`return;` returns nothing" (the `return }` → `return; }` shape), and the
foreign-block row of the locus table: "The block itself is an expression inside a scrml statement and
takes rule 1 after its closing `}`" (the `}=;` edits).

Method: `.tmp/semi-migrate.ts` (scratch, deleted) re-ran the bootstrap front end on each case's graded
source (its §66 twin when twinned), took every E-STMT-MISSING-SEMICOLON span, mapped it back to the
case SOURCE by its same-line left context (unique match required), and inserted `;` there; repeated to
a fixpoint. Ambiguous contexts (`D(q)`, `return x()`, `return n`, the `}` closing a `!{}` statement)
were hand-placed. Every diff reviewed: only `;` was added.

Off-limits (other lanes) and NOT edited even though they are in `semi-cases.txt`:
`markup-handler/*` (C2 lane), `module/e-import-*` (C5 lane), `engine/*` (C11a lane).

Reviewed and REVERTED (the bootstrap's requested `;` would change the case's meaning):
- `control-flow/s462-else-without-if-pos` — it pins the orphan-`else` diagnostic; the bootstrap asks
  for `;` after `else` itself. C14 bootstrap gap (`g-bootstrap-unclaimed-else-misdiagnosed-as-undeclared-s462`).
- `defer/control-flow-inner-loop-ok`, the `let helper = function(v) {` line only — the bootstrap
  misreads a `function(v) { … }` value (C19); the other three `;` in that case are kept.

impl#1 effect: unchanged except `lifecycle/effect-nested-pos` (xfail signature recaptured: the
`;` after `beacon(@n)` removes impl#1's own E-STMT-MISSING-SEMICOLON / E-MU-001 / E-SCOPE-001 cascade).

## Part 2 — C12 stale cases (each with its governing SPEC sentence)

### F1 — E-COND-NOT-BOOLEAN on `function g() { }` (5 cases)
`condition/unresolved-{call,call-markup,operand-markup,operand-not,ternary-arm}-neg`.
- Governing: §4.14 — "a call of a function that returns nothing is not a value (§48 "The return rule",
  rule 3; E-TYPE-001 in a value position)"; §42.4 statement 6 — "A condition SHALL NOT also be reported
  under statement 5 when the compiler has already reported **any Error-severity diagnostic whose span
  lies within the condition**". So the bootstrap's E-TYPE-001 is right and the case was stale.
- Fix: `g` now returns a value typed `asIs` (`function g() { const v: asIs = true; return v; }`) — §42.4
  statement 5 names it: "a value typed `asIs` / `unknown` (§7.5.2)". The cases still pin
  E-COND-NOT-BOOLEAN on an unresolved call (NOT flipped to E-TYPE-001).
- Tried and rejected: a foreign `_={ }=` return and a `?{}` row return (both make `g` server-placed —
  E-VALUE-SERVER-CALL / E-ERROR-002, a different case); `-> int` (would test statement 4, not 5);
  mutual recursion (bootstrap calls it void).
- Bootstrap: FAIL -> UNSUPPORTED (it refuses `asIs` by name, §14.1.2; it emits E-COND-NOT-BOOLEAN beside
  it). impl#1: xfail signature unchanged.

### `while` retired (2 cases)
`condition/known-int-while-neg`, `condition/presence-bare-optional-while-pos` -> `for (cond)`.
- Governing: §49.4.1 — "A `while` statement SHALL be rejected with **`E-LOOP-WHILE-RETIRED`**, whose
  fix-it is `for (cond) { … }` (the same head, the keyword renamed)."
- impl#1 does not build `for (cond)`: it emits E-IMPL1-RULED-FORM-UNSUPPORTED. known-int-while-neg
  xfail signature recaptured (adds that code); presence-bare-optional-while-pos still PASSES on impl#1
  (its contract is codes [] + notCodes, so the impl#1 refusal does not fail it — noted, not hidden).

### `.substring` (1 case)
`hostmethod/substring-match-typed` -> `.slice`.
- Governing: Appendix D.1 "Not in the table: refused (S469)" — "A call of any other method on a `string`
  (… `substring`, `at`, `concat`, …) SHALL be compile error **`E-STRING-METHOD-UNKNOWN`**"; "`substring` /
  `at` / `concat` already have admitted forms (`slice`, `s[i]`, a template)".

### Bare arm tails needing `lift` (2 cases + 1 from Part 1)
`match-block/value-decl-block-arm-{raw,variant}`; `match-leave/argument-match-arm-labelled-break-outer-neg`.
- Governing: §7.2.2 rule 3 — "A brace that holds a statement … is a statement list … (`.B :> { log(); 2 }`
  is E-STMT-MISSING-SEMICOLON after `2`, and — in a value position — E-ARM-TAIL-VALUE …; with the `;` it
  is E-ARM-TAIL-VALUE alone)"; S469 ruling "`lift` is required once the block holds a statement".
- Bootstrap: FAIL -> UNSUPPORTED (statement-holding value arm is refused by name). impl#1: PASS unchanged.

### Unhandled Transport on client->server calls (4 cases)
`server-fn/cell-assign-failable-{arm-return-live,recovery-value,success-then-read}`,
`server-fn/cell-assign-independent-writes-batched`.
- Governing: §19.9.10 — "A call made on the client whose callee is server-placed is a **failable call**
  at that site, whether or not the callee is declared `!`. It SHALL be handled exactly as a call to a `!`
  function (§19.4.3) … An unhandled one SHALL be **E-ERROR-002**." Failure set (S454 F1): "`f`'s declared
  variants plus ONE wrapper variant `Transport(t: ServerCallError)`".
- Fix: a `.Transport(_)` arm added (corpus form `.Transport(_) :> return`; a value arm in the recovery case).

### Payload enum rendered as text (4 cases)
`error/failable-handler-lift{,-success,-timeout}`, `error/propagate-success-unwrap`.
- Governing: §14.13.2 — "**Refused:** a struct, a tape, a tuple, a map or set, a payload enum value, …
  In markup text, a quoted attribute or a logic template this SHALL be compile error
  **`E-TEXT-NON-PRIMITIVE`**".
- Fix: `#out` renders `label(@phase)` (a `match` to `string`); the `state` assertion is unchanged.
  propagate-success-unwrap also gets its `return }` -> `return; }` (§7.2.2 rules 1, 8).

### Unbraced loop body (1 case)
`defer/unbraced-arm-neg`.
- Governing: §49.2.1 (S469) `loop-body ::= '{' loop-statement* '}'` — a braceless `for` body is a parse
  error before it is a defer site. The loop probe is braced (a legal block-body defer) and the
  E-DEFER-UNSUPPORTED-SITE count is 3 -> 2 (the if / else probes kept).
- SPEC text owed (not edited, SPEC is out of scope): §19.16.2 still says "the whole UNBRACED body of an
  `if` / `else` / `for` / `while` / `do` arm" — the `for` / `while` / `do` limbs are dead under §49.2.1 /
  §49.4.1.

### `risky()?` on a call that returns nothing (1 case)
`defer/control-flow-neg`.
- Governing: §4.14 — "a call of a function that returns nothing is not a value (§48 "The return rule",
  rule 3; E-TYPE-001 in a value position)". `risky` now returns a value on success.

### Unhandled `?{}` with no `db=` (4 cases)
`server-fn/e-route-{002,005}-{neg,pos}`.
- Governing: §19.8.3 (S451 R11) — a `?{}` query is failable; outside a `!` function it must be handled at
  the site (E-ERROR-002); §8.1.1 / §34 E-SQL-004 — "`?{}` block has no database scope — no
  `<program db=>` …". Fix: `<program db="./app.db">` root + `.run() !{ _ :> { return; } }`.
- Still FAILS on the bootstrap for 3 of 4: `document.title = name` is E-SCOPE-001 "`document` is not a
  writable local" — a bootstrap host-DOM gap (SPEC §12.4 treats `document` as the client-only DOM
  global), so the case is left as is there.

### Object literal with no struct context (1 case)
`fn/plain-arrow-clean` — returns the tape `d` instead of `{ d: d }` (§66 struct-literal rule,
E-TYPE-STRUCT-CONTEXT); the arrow under test is unchanged.

### Render loop that lifts nothing (1 case)
`control-flow/ctrl-010-else-on-for-without-lift-neg` — the no-`lift`, no-`else` loop is now an
ordinary iteration statement in a function body (the case's own description: "an ordinary iteration
statement"). Governing: §34 E-VALUE-WRITES-STATE — "a render expression (a markup `${ … }` interpolation
incl. a multi-statement or Tier-0 `for/lift` block …)"; §49.6 E-LOOP-007.

### Twin defects (2 cases)
`fn/reactive-read-clean`, `fn/reactive-write-reject` — `${ @x = v }` (legacy implicit cell, which the
§66 rules leave as an undeclared write, E-STATE-UNDECLARED §6.1.1) -> the legacy declaration `<x> = v`,
which twins. reactive-write-reject's call moved from `<p>${badWrite(1)}</>` to `onclick=` (§34
E-VALUE-WRITES-STATE: "Not value positions: `on*=` handlers"), so only E-FN-003 fires.

### Left as is — the bootstrap (or the triage) is wrong, not the case
- `linear/must-use-unread-{pos,neg}` — `unusedThing = 42;` is NOT an undeclared assignment: §50.8.5 "the
  keywordless bare naming statement (`x = 1`) … declares `x` exactly as `const x = 1` does" (retirement is
  O13, OPEN). The bootstrap's E-SCOPE-001 contradicts §50.8.5. Also: §35 has no E-MU-001 text; the §34
  row says "Must-use: return value of `!` function not captured", which is not what impl#1 / these cases
  implement (an unread keywordless binding) — a SPEC question, surfaced.
- `module/e-export-003-attr-{conflict-reject,distinct-clean}` — §21.2 calls Form 1 "canonical,
  top-level", and SPEC permits a file with no `<program>` (library files). The bootstrap's
  E-PROGRAM-MISSING has no §34 row (`compiler/self-host-v2/severity.scrml`: "no §34 row"). Not stale.

## F2 — C7 legacy state-object openers (9 cases)

- Governing: §4.2 — "A space (or tab, or newline) between `<` and the identifier is the **deprecated**
  opener form: it still compiles but emits W-WHITESPACE-001 (§15.15.5)". The bootstrap does not parse it
  (E-PARSE-TAG), and no `scrml fix` §66 rule rewrites it, so the harness graded the unchanged legacy text
  as a §66 twin.
- Harness (INTERIM): `scripts/bootstrap-conformance.ts` `LEGACY_MARKERS` += `spaced-state-opener`
  (`^[ \t]*<[ \t]+name`, line-anchored so `a < b` is not one) and `inline-typed-state-opener`
  (`^[ \t]*<name {`). A marker alone only makes a case a twin CANDIDATE, so a twin would still be graded;
  `NO_FIX_RULE_MARKERS` + `unrewrittenMarkerBlockers` make a twin that still carries one a blocker
  (NOT-TWINNED, "all-or-nothing: a half-migrated file is never graded"). Unit-tested in
  `compiler/tests/integration/bootstrap-conformance-counter/bootstrap-conformance-counter.test.js`.
- Marker reach measured over the whole corpus: 36 cases. Besides the 3 ctrl-004 cases: 4 `auth/auth-00{3,4}-*`
  and 4 `type-state-codes/e-state-*` go UNSUPPORTED -> NOT-TWINNED (they carry `< Todo` / `< Submission`
  spaced openers); the rest (engine/*, ssr/*, ctrl-018..020) were already NOT-TWINNED (one more reason).
- Migrated so a §66 twin is generated (the opener only declared the cells the chain reads; a §66 twin is
  meaningful): ctrl-001, ctrl-002, ctrl-003-neg, ctrl-003-pos, ctrl-005-neg, ctrl-005-pos —
  `<session { loggedIn: bool }` -> `<loggedIn>: bool = false` etc., the legacy declaration the `scrml fix`
  §66 rules twin (§66.21 row 1). First tried the direct §66 `let <loggedIn:bool=false/>`: impl#1's ESM
  client emit then THROWS ("The keyword 'let' is reserved", host-global-scan), so the twinnable legacy
  declaration was chosen to keep impl#1's artifacts checked. impl#1: PASS unchanged (and its old
  E-SCOPE-001 / E-MARKUP-001 cascade from the inline-typed opener is gone). Bootstrap: 5 PASS, ctrl-002
  UNSUPPORTED (`@step.eq(…)` refused by name).
- Kept legacy (NOT-TWINNED, INTERIM): ctrl-004-else-on-state-opener-{neg,pos},
  ctrl-004-orphan-else-on-state-opener-pos — they pin E-CTRL-004 (`else` on a state-object opener,
  §17.1.1), which needs the opener itself.
- Gap filed: `g-boot-spaced-state-opener-s478` (LOW, `compiler/self-host-v2/parse.scrml`,
  prov=pa:s478-triage-F2).

## F4 — `type X : error = { … }` (2 cases: `error/error-008-{message-pos,neg}`)

Searched §14 and §19. No sentence retires `:error`, and none defines it:
- §14.2: "`:kind` — the kind annotation. Defined kinds: `:struct`, `:enum`. Additional kinds TBD."
- §19.1: "Error types are enum types (§14.4). Error variants are enum variants."
- §34 E-ERROR-008: "Error type **variant** uses reserved field name" (a variant, i.e. an enum).
- The only `:error` mention is incidental: §14.1.2 "Loci … named `:struct` / `:error` / `:enum` /
  `:tuple` declaration bodies" (describing impl#1's resolver loci).
Not retired by any sentence, so per the brief the cases are LEFT and this is reported, not migrated.
Recommendation for PA: rule it. The SPEC reads as if `:error` was never a language kind (§14.2 / §19.1),
so the likely ruling is "not a kind" — then the cases migrate to `type MyError:enum = { Bad(message:
string) }` (E-ERROR-008 on a variant's reserved field). Until ruled it is a SPEC gap more than a
bootstrap gap.

## impl#1 compile throws (host-global-scan)

`bun scripts/host-global-scan.ts --check --roots conformance`: rc=0 after pinning (sorted) the two
`for (cond)` cases — impl#1 does not build the condition head (E-IMPL1-RULED-FORM-UNSUPPORTED) and its ESM
emit throws "Unexpected token":
- `[esm] conformance/cases/condition/known-int-while-neg/case.scrml`
- `[esm] conformance/cases/condition/presence-bare-optional-while-pos/case.scrml`
Pre-existing, not touched (reported as "fixed — no longer throw", outside this lane, 3 of them in the
off-limits markup-handler dir): body-top/template-cell-renders, markup-handler/s437-r5-template-cell-read-
{first-multiline,second}, reactive/s437-r5-template-cell-read-function-body.

## Results (final tree)

- bootstrap: PASS 343 -> 383 (+40) · CODES-ONLY 0 -> 4 · FAIL 260 -> 204 (-56) · NOT-TWINNED 624 -> 635 (+11)
  · UNSUPPORTED 638 -> 639 (+1). No PASS -> FAIL.
- impl#1: 1751/1865 pass, 114 xfail, 0 FAIL — per-case outcomes IDENTICAL to before. Intended
  xfail-signature recaptures: `lifecycle/effect-nested-pos`, `condition/known-int-while-neg`.
- `control-flow/ctrl-003-extend-past-else-pos` still FAILs, now as `twin-extra-error`: the twin reports
  E-CTRL-001 beside E-CTRL-003 (the cascade its description calls "by design"; impl#1 emits both too).
  A C13 double-report question, not migrated.

Per-case bucket delta:

- UNSUPPORTED -> NOT-TWINNED: `auth/auth-003-neg`
- UNSUPPORTED -> NOT-TWINNED: `auth/auth-003-pos`
- UNSUPPORTED -> NOT-TWINNED: `auth/auth-004-neg`
- UNSUPPORTED -> NOT-TWINNED: `auth/auth-004-pos`
- FAIL -> PASS: `body-top/template-const-renders-explicit-logic`
- FAIL -> PASS: `condition/is-given-expr-twin`
- FAIL -> PASS: `condition/is-some-deprecated-expr`
- FAIL -> PASS: `condition/known-int-while-neg`
- FAIL -> PASS: `condition/presence-bare-optional-while-pos`
- FAIL -> UNSUPPORTED: `condition/unresolved-call-markup-neg`
- FAIL -> UNSUPPORTED: `condition/unresolved-call-neg`
- FAIL -> UNSUPPORTED: `condition/unresolved-operand-markup-neg`
- FAIL -> UNSUPPORTED: `condition/unresolved-operand-not-neg`
- FAIL -> UNSUPPORTED: `condition/unresolved-ternary-arm-neg`
- FAIL -> PASS: `control-flow/ctrl-001-orphan-else-neg`
- FAIL -> UNSUPPORTED: `control-flow/ctrl-002-orphan-else-if-neg`
- FAIL -> PASS: `control-flow/ctrl-003-extend-past-else-neg`
- FAIL -> NOT-TWINNED: `control-flow/ctrl-004-else-on-state-opener-neg`
- FAIL -> NOT-TWINNED: `control-flow/ctrl-004-else-on-state-opener-pos`
- FAIL -> NOT-TWINNED: `control-flow/ctrl-004-orphan-else-on-state-opener-pos`
- FAIL -> PASS: `control-flow/ctrl-005-else-and-if-same-element-neg`
- FAIL -> PASS: `control-flow/ctrl-005-else-and-if-same-element-pos`
- FAIL -> PASS: `control-flow/ctrl-010-else-on-for-without-lift-neg`
- FAIL -> PASS: `control-flow/ctrl-012-bare-control-flow-in-markup-neg`
- FAIL -> PASS: `control-flow/ctrl-013-braceless-for-of-head-neg`
- FAIL -> PASS: `defer/control-flow-neg`
- FAIL -> PASS: `defer/duplicate-function-neg`
- FAIL -> PASS: `defer/duplicate-function-no-defer-ok`
- FAIL -> PASS: `defer/function-hoist-across-defer`
- FAIL -> PASS: `defer/later-shadow-ok`
- FAIL -> PASS: `defer/stack-fn-calls-fn-before-defer`
- FAIL -> PASS: `defer/stack-fn-calls-fn-before-defer-twin`
- FAIL -> PASS: `defer/unbraced-arm-neg`
- FAIL -> PASS: `element-refusal/text-string-attr-comment-neg`
- FAIL -> PASS: `error/await-not-in-scrml`
- FAIL -> PASS: `error/failable-handler-lift`
- FAIL -> PASS: `error/failable-handler-lift-success`
- FAIL -> PASS: `error/failable-handler-lift-timeout`
- FAIL -> PASS: `error/propagate-success-unwrap`
- FAIL -> PASS: `fn/plain-arrow-clean`
- FAIL -> PASS: `fn/reactive-read-clean`
- FAIL -> PASS: `fn/reactive-write-reject`
- FAIL -> CODES-ONLY: `foreign/foreign-slice-await-regex-pos`
- FAIL -> CODES-ONLY: `foreign/foreign-slice-lexing-regex-quote-pos`
- FAIL -> CODES-ONLY: `foreign/foreign-slice-sealed-crossings-pos`
- FAIL -> PASS: `hostmethod/substring-match-typed`
- FAIL -> PASS: `lifecycle/effect-nested-pos`
- FAIL -> UNSUPPORTED: `match-block/value-decl-block-arm-raw`
- FAIL -> UNSUPPORTED: `match-block/value-decl-block-arm-variant`
- FAIL -> UNSUPPORTED: `match-leave/argument-match-arm-labelled-break-outer-neg`
- FAIL -> PASS: `module/e-scope-010-filescope-distinct-clean`
- FAIL -> PASS: `module/e-scope-010-filescope-duplicate-reject`
- FAIL -> CODES-ONLY: `print/tool-println-clean-stdout`
- FAIL -> PASS: `server-fn/cell-assign-failable-arm-return-live`
- FAIL -> PASS: `server-fn/cell-assign-failable-recovery-value`
- FAIL -> PASS: `server-fn/cell-assign-failable-success-then-read`
- FAIL -> PASS: `server-fn/cell-assign-independent-writes-batched`
- FAIL -> PASS: `server-fn/cell-assign-read-after-write`
- FAIL -> PASS: `server-fn/cell-assign-successive-writes-ordered`
- FAIL -> PASS: `server-fn/e-route-005-pos`
- UNSUPPORTED -> NOT-TWINNED: `type-state-codes/e-state-terminal-mutation-neg`
- UNSUPPORTED -> NOT-TWINNED: `type-state-codes/e-state-terminal-mutation-pos`
- UNSUPPORTED -> NOT-TWINNED: `type-state-codes/e-state-transition-illegal-neg`
- UNSUPPORTED -> NOT-TWINNED: `type-state-codes/e-state-transition-illegal-pos`
