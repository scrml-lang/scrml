# progress — s471-bootstrap-control-flow-high

- 2026-10-27 start: worktree /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ab4a6d2740c0b0a00 at origin/main 1e2a2812f; bun install + pretest OK.

## Reproduction on main 1e2a2812f (executed, not inferred)
Driver: `bun scripts/scrml-boot.ts compile <f> --format line --output-dir <d>`, then the artifact (index.html +
program.client.js) loaded in happy-dom and `#go` clicked (scratch runner `run.mjs`, scratch dir
~/.cache/scrml-agent-tmp/s471-bootstrap-control-flow-high/, deleted at the end).

### g-bootstrap-else-if-else-attrs-ignored — NOT-REPRODUCED (closed by s451, #1254)
Governing: §17.1.1 "An if-chain desugars to a single `${ if / else if / else }` block in the containing markup
context." / Example 1: "Only one span exists in the DOM at any time."
- chain.scrml (`#one if=(@step == 1)` / `#two else-if=(@step == 2)` / `#rest else`): compile exit 0;
  initial `#one=1 #two=0 #rest=0`; click1 `0/1/0`; click2 `0/0/1`; click3 `0/0/1`. Correct.
- slice-m4 probes (front end + runtime): chain + `show=` (renders, show composes); nested chain in a chain
  branch (o,a | o,b | c | o,a — correct); chain inside `<each>` row (one,other — correct); chain at program
  top level (clean); `else-if` valueless → E-BOOTSTRAP-UNSUPPORTED (named); `<match else>` → `<match>` refused
  by name. Structure codes E-CTRL-001/002/003/005 already pinned in slice-m4/if-chain.test.js.
- Observation (not changed): an HTML comment `<!-- -->` between members does NOT break the chain. §17.1.1:
  "no element, text node, or other syntactic construct appears between the chain members". Whether a
  comment is a "syntactic construct" is not decided by the SPEC text — open question for PA.

### g-bootstrap-defer-scope-001-and-runs-anyway — NOT-REPRODUCED for the filed cases (closed by s451, #1255)
Governing: §19.16.2 "Exit. When control leaves the enclosing block, every deferred body registered in that
block runs exactly once, on EVERY exit path … `return` (after the return value has been evaluated …)";
§34 / §2.2.1 "a compile that reports one SHALL NOT produce a runnable artifact".
- defer.scrml (return-value-before-deferred twin): exit 0, click → got=7 count=99 trace="d". Correct.
- defer2.scrml (`fail` exit, `?` exit): trace "df;caught1;dq;caught2;". Correct.
- Error gate: a program with E-SCOPE-001 → `✗ 4 errors — nothing written` (exit 1). Correct.
- REMAINING FAIL-CLOSED SHAPE FOUND: §19.16.2 names "a loop body (once per iteration)" as a defer site; the
  bootstrap refused it (`E-BOOTSTRAP-UNSUPPORTED: a defer inside a loop body is not in the bootstrap yet`,
  analyze.scrml loopDefer + check.scrml C19). Fail-closed, but unbuilt. This lane builds it (below).

## Built (s471)
- 2026-10-27T09:10 — commit 837c16d06: a `defer` in a LOOP BODY is built. Governing: §19.16.2 "Registration. …
  the innermost statement list that contains the `defer`: a function body, an `if`/`else` branch, a loop body
  (once per iteration) …"; §19.16.6 "A loop body is its own block, so each iteration has its own stack instance
  and its deferred statements run at that iteration's exit." analyze.scrml loopDefer drops the refusal;
  boundLoopDefers: a `defer` DIRECTLY in a loop bound as a value → E-DEFER-UNSUPPORTED-SITE (§19.16.2 "a `defer`
  written directly in an arm of a `match` / `if` / `for` that is used for its VALUE"). check.scrml C19 admits a
  Defer in a Loop body; refuses one directly in a Gather body / anywhere in a View.Gather. No printer change: the
  Core loop body is its own Block, and blockJs already wraps a Defer-holding block in its own try/finally.
  Executed: defer-loop.scrml via scrml-boot → trace "ba;e;da;e;db;bc;e;dc;e;dd;ra;rb;kb;" (fall-through,
  continue, break, return; LIFO). Before: E-BOOTSTRAP-UNSUPPORTED, nothing written.
- 2026-10-27T09:35 — a statement LOOP INSIDE a deferred body is built. Governing: §19.16.3 rule 1 "A
  `break`/`continue` that targets a loop INSIDE the deferred body is permitted." analyze.scrml deferBodyRule
  threads the labels of the loops inside the deferred body; a jump that names none of them is
  E-DEFER-CONTROL-FLOW (was: every `break`/`continue` in a deferred body, and every loop there refused
  E-BOOTSTRAP-UNSUPPORTED). check.scrml C16 admits Loop/Break/Continue (C19 jumpStmt already treats a Defer body
  as a jump boundary). A loop BOUND AS A VALUE in a deferred body stays E-BOOTSTRAP-UNSUPPORTED (named).
  Executed in slice-m4/defer-loop-s471.test.js: "body;ax;cx;done;".
- Acceptance cases: compiler/self-host-v2/acceptance/control-flow/{if-chain, neg-orphan-else, defer-return-value,
  defer-loop-iteration, neg-defer-loop-value-direct} — the three positive ones compile AND run (runtimeExecuted).

## Bootstrap-conformance base (main 1e2a2812f)
PASS 251 · FAIL 63 · UNSUPPORTED 814 · NOT-TWINNED 685 (1813 attempted).
In-region FAILs on base (not changed by this lane — surfaced):
- defer/deferred-server-call-completes — FAIL: E-DEFER-UNHANDLED-FAILABLE fires on a deferred client call of a
  server function. Fail-closed (no artifact). §19.16.3 rule 3 makes a client server-call failable (§19.9.10), so the
  case's twin may need a `!{ _ :> … }` handler; whether the case or the bootstrap is wrong needs PA reading.
- control-flow/ctrl-004-else-on-state-opener-pos — FAIL: E-CTRL-004 never fires. analyze.scrml chainCheck notes
  "E-CTRL-004 (a state object opener) cannot arise: no state opener reaches markup" — the twin moves the opener;
  the program is still rejected (no artifact) by other codes? see verdict: emitted [] — NEEDS CHECK (below).
- defer/scope-redeclare-with-defer-neg — twin-extra-error E-DEFER-LATER-SHADOW alongside E-SCOPE-REDECLARE.
- control-flow/ctrl-010-else-on-for-without-lift-neg — twin-extra-error (loop lane's region).
- 2026-10-27T09:45 — triage of the two in-region base FAILs (neither is a bootstrap fail-open):
  - ctrl-004-else-on-state-opener-pos: the twin keeps `< profile else name(string)/>` inside `<div>`; the bootstrap
    renders it as escaped TEXT (`&lt; profile else …&gt;`). SPEC §4.3 Amendment S442 (dpa-045): "inside a free-text
    body the spaced form is TEXT … affected corpus: one conformance case,
    `conformance/cases/control-flow/ctrl-004-else-on-state-opener-pos` (not edited)". The CASE is stale against the
    SPEC; the bootstrap is right. Case owner: corpus.
  - deferred-server-call-completes: the deferred body calls a server function unhandled; the bootstrap answers
    E-DEFER-UNHANDLED-FAILABLE per §19.9.10 (a client server-call is failable) + §19.16.3 rule 3 ("REPLACES
    E-ERROR-002"). The case predates §19.9.10 (S451). Case stale; no artifact is written (fail-closed).

## Gates (final tree 11d88854f)
- pre-commit hook (unit + integration + conformance + slices): 50112 pass / 0 fail / 129 skip.
- CI slices job (exact command): lint 0 violations; m1 100/0; m2 612/0; m1 lowered 100/0; m3 60/0; m4 2506/0; codec 166/0.
- `bun run types:check`: OK — 181 diagnostics (114 distinct), unchanged.
- bootstrap-conformance: base PASS 251 · FAIL 63 · UNSUPPORTED 814 · NOT-TWINNED 685 (runtime 100)
  → after PASS 252 · FAIL 64 · UNSUPPORTED 812 · NOT-TWINNED 685 (runtime 101). Moves:
  `defer/loop-per-iteration` UNSUPPORTED → PASS (codes+runtime); `defer/control-flow-neg` UNSUPPORTED → FAIL
  (twin-extra-error E-TYPE-001: the case's `let v = risky()?;` reads a no-value result — the S469 #1471 "Always
  explicit" rule, unrelated to defer, previously masked by the loop-defer refusal; E-DEFER-CONTROL-FLOW fires as
  asserted). docs/bootstrap-conformance.md NOT committed.

## S239 review FIX round (on 806d4b7a5)
- F2 (MED, caused by this lane): a `lift` inside a deferred body (reachable once a defer stands in a statement
  block of a value-bound loop) reached checkCore (C16/C20, E-BOOTSTRAP-CORE-ILL-FORMED). deferBodyRule `.Lift` now
  refuses the statement itself: E-BOOTSTRAP-UNSUPPORTED "a `lift` inside a deferred body is not in the bootstrap".
  NOT E-DEFER-CONTROL-FLOW — §19.16.3 rule 1 does not name `lift`. **The SPEC is silent on `lift` in a deferred
  body** — an owner question (PA to raise); this is an implementation limit, not a language rule.
- F1 (LOW, newly reachable): planDeferBody walked only top-level statement expressions, so a server call in a
  loop / `if` inside a deferred body failed as C-E2/C-S3. It now recurses through loopPlanBlocks with the same
  refusal position (fixes the pre-existing `if` case too).
- F3 (latent): deferBodyRule `.For` checked only `lf.body`; new deferForRules also walks forInitBlock and
  forHeadExprs (pin: `for (s of names()?)` in a deferred body → E-DEFER-CONTROL-FLOW; verified the pin fails
  without the fix).
- Pins: slice-m4/defer-loop-s471.test.js "s471 review" describe (F1, F2, F3).
- RULED update (user-voice S471, "your recs"), supersedes the F2 note above: a `lift` inside a deferred body is
  **E-DEFER-CONTROL-FLOW** — §19.16.3 rule 1 gains `lift` (PA adds the SPEC text). The message names `lift`
  alongside the listed exits. Pin updated.
- RULED (user-voice S471): an HTML comment between `if=` / `else-if=` / `else` members does NOT break the chain —
  the bootstrap's existing behaviour (open question 2 closed). Pin: slice-m4/if-chain.test.js "s471 — an HTML
  comment between members" (compiles clean, runs as one chain).
