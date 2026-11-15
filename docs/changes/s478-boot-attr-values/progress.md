# s478-boot-attr-values progress

- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a76a29978d191ce44
  (ff-merged to origin/main 20b76334e first; the worktree base was one bot regen behind).
- baseline hook: 47516 pass, 0 fail, 125 skip (bootstrap slices skipped on the empty start commit).
- input: `~/.cache/scrml/review/s478-triage/TRIAGE.md`, cluster C2a (attribute-value forms).
- gap: g-boot-attr-interp-s478 (MED) filed and resolved here (no gap covered `=${}`).

## SPEC (the governing sentences, verbatim)

- §5.2.1: "`onclick=${expr}` on an event attribute SHALL use the `${...}` expression directly as the event
  handler, with `@var` references rewritten to reactive getters." / "The expression form is required when:
  You need the event object: `onclick=${(e) => handler(e, arg)}`".
- §5.2 "An unquoted value is read WHOLE (S457). An unquoted (undelimited) attribute value is read to its end —
  never cut short with its tail dropped or turned into further attributes." — an event-handler value "is ONE
  expression and continues across whitespace wherever the expression does: after an operator that needs a
  right operand (`=`, `+`, `&&`, `?`, `:`, …), or before an infix operator, an assignment or compound
  assignment, `.name` / `?.`, a ternary `?` / `:`, or the keyword tests `is` / `instanceof` / `in`"; "any
  other attribute followed by an operator (`title=@a + "x"`, `href=docs/intro`) is `E-ATTR-UNQUOTED-OPERATOR`
  … A `;` after it is `E-ATTR-MULTI-STATEMENT` (§5.2.4)"; "text after it that cannot begin an attribute
  (`onclick=fn() (g)`, `title=x "y"`) is `E-ATTR-UNQUOTED-OPERATOR`; and … an event-handler EXPRESSION (an
  assignment or operator form) followed by `>` after inline whitespace — `<button onclick=@big = @n > 1>` — is
  `E-ATTR-UNQUOTED-OPERATOR` too".
- §5.2 "Handler values do not bind `event` (S457)": "a `${…}` value that is not itself a function — does NOT
  bind the name `event`"; "A `${…}` value that IS a function (`${(e) => …}`, `${fn(e) { … }}`) is the listener
  itself and names its own parameter."
- §5.2.3: "A BARE event-handler value that contains a `;` outside of expression-internal contexts … is compile
  error `E-MULTI-STATEMENT-HANDLER`." Cross-ref: "A multi-statement `:`-shorthand body is still
  `E-MULTI-STATEMENT-HANDLER`".
- §5.2.4: "A `(…)`, `{…}` or `${…}` value of an attribute that is not an event handler, or a quoted condition,
  SHALL be exactly one expression. When it holds two or more statements, the compiler SHALL report
  E-ATTR-MULTI-STATEMENT (an error)"; "A trailing `;` after the one expression (`${ f(); }`) does not make a
  second statement. A value that parses whole as ONE expression is one expression."; "The diagnostic SHALL name
  the attribute and SHALL give the fix".
- §66.2.4 (declarations): "An own value or an attribute default in an opener is either a literal or a plain
  `@ref`, written bare, or any other expression, PARENTHESIZED".

## What was built

- `lex.scrml` `bareValueEnds` (+ `lastNeedsOperand`, `continuesValue`, `openTernary`, `wordTestAt`): the ONE
  unquoted-value reader (LexStop.BareValue) reads the value whole. It never continues into `name=` / `name:x`
  (an attribute), a lone `>` / `/>` (the tag's end), or a `:` with no open ternary (the `:`-shorthand body).
- `parse.scrml` `parseAttrValue` now takes the attribute name and a `decl` flag (§66.2.4 positions):
  - `parseDollarValue` — `${…}`: one expression (`oneExprIn`) → `Paren(e)`; a handler's `${() => e}` →
    `Paren(e)`; a handler's statement list (or one led by `if` / `match`) → `Braced(b)`; one expression that
    does not parse (no `;`, no statement keyword) → its own parse errors (`exprWithErrors`), never a
    statement-list reading. Refused by name (E-BOOTSTRAP-UNSUPPORTED, INTERIM, the function-values slice):
    `${(e) => …}`, a braced arrow body (parseLambda's existing refusal), `${() => f}`; `effect=${…}` (§51.0.H
    engine block not built; the parser cannot tell it from a plain attribute). A declaration's `=${…}` is
    E-DECL-OPENER-EXPR-UNPARENTHESIZED.
  - E-ATTR-MULTI-STATEMENT (`multiStatementValue`): `(…)` with a statement-level `;`; `{…}` / `${…}` that parse
    clean (no error beyond a terminator) as two or more statements written as a list (a `;` or a statement
    keyword). The value is refused whole (inner reports dropped) as a recovered value.
  - `afterBareValue` in `scanAttr`: bare `;` sequence → E-MULTI-STATEMENT-HANDLER (handler) /
    E-ATTR-MULTI-STATEMENT (other), the sequence read into the one refused value; a handler operator form before
    a spaced `>` → E-ATTR-UNQUOTED-OPERATOR (value recovered, the truncated reading never judged); a quoted /
    `(`/`[`/`{`/`${`/template value after an unquoted one → E-ATTR-UNQUOTED-OPERATOR. The existing
    `unquotedOperatorDiag` now sees spaced operators too (the value is read whole).
  - the bare value is parsed with `parseAssign` (was `parseTernary`): a bare handler assignment is an
    assignment (§50; §5.2.3 table "Bare assignment").
  - `:`-shorthand body with `;` + more → E-MULTI-STATEMENT-HANDLER, body recovered.
- No new AST variant, no analyze / lower / print change: every `${…}` value is one of the existing values
  (Paren / Braced), so there is ONE lowering and ONE escape path (security note). Pinned by byte-identical
  printer output (`title=${@x}` vs `title=(@x)`; handler `${…}` forms vs `(…)` / `{…}`) and a runtime test
  that a value carrying `"><img …>` is set as attribute text, no element created.

## Tests

- `compiler/self-host-v2/slice-m4/attr-forms-s478.test.js` (29 tests): runtime clicks (bare assignment read
  whole, `${() => …}`, `${call}`, `${ s1; s2; }`, bare ternary, next attribute kept, `title=${@x}` tracks,
  handler `${ if … else … }`), one-lowering identity + escaping, the three named codes and their negatives,
  the refusals by name.
- hook (commit 3): 54783 pass, 0 fail, 238 skip (bootstrap slices included).

## Conformance (`bun scripts/bootstrap-conformance.ts --json`), before → after

PASS 343 → 358 · FAIL 260 → 220 · UNSUPPORTED 638 → 663 · CRASH 0 → 0. No PASS → FAIL.
- FAIL → PASS (14, all C2): attr-executable-sink/srcdoc-data-forms-neg, engine/phase-advance,
  engine/rule-violation-neg, engine/self-write-neg, error/handler-unhandled-failable-bare-and-expr-pos,
  markup-handler/{multi-stmt-handler-assign-led-pos, multi-stmt-handler-attr-pos,
  multi-stmt-handler-colon-shorthand-pos, multi-stmt-handler-in-engine-state-child-pos,
  s437-r4-single-arrow-expr-form-ok, s450-attr-multi-statement-pos, s457-handler-expression-spaced-gt-neg,
  s457-unquoted-assign-read-whole, s457-unquoted-operator-non-handler-neg}.
- UNSUPPORTED → PASS (1): attr-executable-sink/event-attr-data-text-neg.
- FAIL → UNSUPPORTED (26, every one a named refusal of C2b — the event object / braced arrow / function
  values): error/handler-guard-in-arrow-rt, markup-handler/s437-r4-arrow-{block-seq,seq}-dollar-{engine,top}-neg,
  markup-handler/s457-event-arrow-parameter-pos, server-db/async-call-then-in-handler-neg,
  server-db/async-fn-escapes-{as-value-handler,scheduler-s09-monkeypatch}-neg, and 17 server-db
  event-after-await / event-control-after-await cases.
- Still FAIL (12 of the 52 C2 cases), each on a cause outside C2a: auth/auth-attr-nonliteral-page-pos (C1 `;`
  in `${ const mode = "required" }`); engine/rule-violation-pos, engine/self-write-pos (E-ENGINE-INVALID-TRANSITION
  / W-ENGINE-SELF-WRITE-DETECTED not built); reactive/s437-r5-template-cell-read-value-attr (E-STYLE-VALUE-NOT-STYLE
  on `style=(…)`); refinement/{const-reject-rt, struct-field-reject-rt, union-shaped-member-accept-neg} (C4
  refinement types); server-db/async-fn-escapes-handler-destructured-scheduler-neg (a `let {…} =` destructure);
  server-db/inline-handler-server-call-condition-runtime, sql/multiple-statements-neg,
  sql/multiple-statements-in-condition-neg (E-ERROR-002: the bootstrap's §19.9.10 rule fires on the server /
  `?{}` call in the handler — the bare form `onclick=record()` answers the same); sql/query-not-readable-neg
  (E-SQL-003 on a non-template `?{}`).

## Corpus measurement (the 3,142-file method of s478-boot-bound-any-branch)

A throwaway bun test (`.tmp/corpus.test.js`, deleted) ran the bootstrap `frontEnd` (slice-m4 harness) over
`git ls-files -- conformance/cases samples examples compiler/self-host-v2/acceptance` (`*.scrml`): 3,146
files, 0 crashed — once with this lane's lex.scrml + parse.scrml, once with origin/main's (`git show
origin/main:… >`, then `git checkout HEAD --`), comparing per-file Error `code|span.start` sets.
Result: **0 newly rejecting, 0 newly accepting**; 235 files' diag sets changed while still rejecting (161
lose E-PARSE-TRAILING, 97 lose E-SCOPE-001 "`$` is not declared"; new codes are the named ones on their own
cases — E-MULTI-STATEMENT-HANDLER 6, E-ATTR-MULTI-STATEMENT 1, E-ATTR-UNQUOTED-OPERATOR 2 — and the next
real error behind the attribute: E-STMT-MISSING-SEMICOLON 33, E-BOOTSTRAP-UNSUPPORTED 23, E-STATE-UNDECLARED
18, …). The raw corpus is legacy-dialect; the newly-accepting effect shows on the §66 twins (conformance above).

## Locus

Triage hypothesis HELD: `parse.scrml` `parseAttrValue` had no `$` branch; the named codes sit in
`scanAttr` / `unquotedOperatorDiag`. CORRECTION: the named codes needed no `analyze.scrml` change — all three
are syntactic and emitted by the parser. The read-whole half was in `lex.scrml` (`stopBefore` `.BareValue`
stopped at the first whitespace), not the parser.

## Not done (surfaced)

- E-EVENT-UNBOUND (§5.2) — not emitted; stays on g-bootstrap-unimplemented-construct-reported-as-generic-code.
- §5.2.4 quoted condition `if="f(); @x"` — not touched.
- C2b (event object, braced arrow, E-EVENT-CONTROL-AFTER-AWAIT) — g-bootstrap-function-values-slice-s451.

## Fix round 1 (S239 review of 4cbbe0a51, PR #1865)

### F1 — keyword-word attributes after an unquoted value (LOW, false rejection)

Cause CONFIRMED: `lex.scrml` `wordTestAt` checked only `isIdentCont` after the word, and `-` is not one,
so `in-view` read as `in -view` and the value continued; the parser then stopped at `in` (the bootstrap
expression parser has no `in` / `instanceof` / `and` / `or` binary operator) → E-PARSE-TRAILING.

SPEC reading (§5.2 "An unquoted value is read WHOLE (S457)", verbatim): an event-handler value "is ONE
expression and continues across whitespace wherever the expression does: … before an infix operator, …
or the keyword tests `is` / `instanceof` / `in`"; "any other attribute followed by an operator … is
`E-ATTR-UNQUOTED-OPERATOR`"; "A value that cannot be read whole is REFUSED, once per attribute, never
truncated". §45.9: "`or` and `and` SHALL be valid word-form aliases for `||` and `&&` respectively in
all expression positions (… attribute values …)". So an EXACT keyword word after an unquoted value
continues the value — it is an operator, not a boolean attribute — and the refusal is the named code.
A word TOUCHING `-` + a name character is not that operator: it is one hyphenated HTML attribute name.

- `lex.scrml` `wordTestAt`: a word followed by `-` and an identifier character is an attribute name.
- `parse.scrml` `parseAttrValue` → `trailingWordOperator`: a bare value whose expression stops at
  `in` / `is` / `instanceof` / `and` / `or` is refused once, the value recovered whole:
  non-handler → E-ATTR-UNQUOTED-OPERATOR ("parenthesize … or quote it; if `w` is a separate attribute,
  parenthesize the value before it: `title=(…) in`"); handler with no right operand →
  E-ATTR-UNQUOTED-OPERATOR; handler `and` / `or` with an operand (legal §45.9) → E-BOOTSTRAP-UNSUPPORTED
  by name (the refusals.scrml §45.9 row's text); handler `in` / `instanceof` with an operand keeps the
  expression parser's own report.
- `scanAttr`: a value `unquotedOperatorDiag` refuses is recovered whole, so `title=@last -x` is
  E-ATTR-UNQUOTED-OPERATOR alone (was + E-SCOPE-001 on `x`). `-x` (leading hyphen) stays an error: it is
  the infix `-`.

### F2 — the vacuous `in:fade` test (LOW)

Deleted. `<p if=@ok in:fade out:fly>` errors with E-PARSE-DECL-BODY / E-TYPE-UNKNOWN `fade` either way:
the opener reads `in:fade` as a typed declaration attribute (`name:Type`), so `in:` / `out:` directives
do not parse in the bootstrap and the `wordTestAt` `in:` exclusion is UNREACHABLE until they do (no shape
exercises it: `title=@last in:x` is the same declaration reading).

### Tests / gates

- attr-forms-s478.test.js: 31 pass (29 − 1 vacuous + 3 F1: hyphenated names compile + render on plain
  and handler attributes, the click still runs; exact words named, never E-PARSE-TRAILING, fix text,
  `title=(@last) in` clean; `-x` / `in -x` named alone).
- The 12 attribute / markup / sink slice files the reviewer listed + attr-forms: 937 pass, 0 fail.
- hook: 54785 pass, 0 fail, 238 skip.
- Corpus (same 3,146-file method; base = merge-base 20b76334e, since origin/main's parse.scrml no longer
  loads against this branch's ast.scrml): base → r1 **0 newly rejecting, 0 newly accepting**, 235 diag
  sets changed (same as round 0); PR head 4cbbe0a51 → r1: 0 changed (no corpus file has an F1 shape).

### Surfaced, not fixed (out of scope)

- `title=@last is given` compiles clean: a non-handler `is given` test is not caught by
  `unquotedOperatorDiag` (§5.2 lists `is` among the operators that continue the value).
- A trailing operator before a spaced `>` on a non-handler value (`title=@last + >`, `title=@last - >`,
  `title=@last in- >`) reads past the tag's `>` to the end of the file: `lastNeedsOperand` keeps the
  reader going, and `>` is then an operand position. Probed; same on round 0 for `+` / `-`.
