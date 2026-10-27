# progress — s471-bootstrap-lin-loop

- 2026-10-27 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-afe2b864d0f4596c8 (base 1e2a2812f = origin/main)

## Gap 1 — g-bootstrap-loop-wait-and-defer-s469 — reproduced on base (1e2a2812f)

`bun scripts/scrml-boot.ts compile <f> --format line`:
- wait in a loop body (`for (i of 0..3) { const p = price(i) !{ _ :> 0 }; … }`, `price` server-placed by a `?{}`):
  `10:23: error [E-BOOTSTRAP-UNSUPPORTED]: a client call of the server function `price` (§19.9.10) stands in a `for` loop — a loop cannot wait for the server yet …`
- `defer` in a loop body (`for (i of 0..2) { defer note("end"); note("body"); }`):
  `8:13: error [E-BOOTSTRAP-UNSUPPORTED]: a `defer` inside a loop body is not in the bootstrap yet …`
- a loop inside a deferred body: analyze `loopFor` (inDefer) refuses — E-BOOTSTRAP-UNSUPPORTED "a loop inside a deferred body is not in the bootstrap yet".

Governing sentences (quoted before changing behaviour):
- §49.12.7: "A server call in a loop body of a function is awaited once per iteration (§13). … Per-iteration binding (§49.3.7) holds across every suspension."
- §49.3.7: "A closure created in an iteration, and a suspension point in the body (a server call awaited per iteration, §13), see that iteration's binding — never a later one. A compiler that splits the body across a suspension (§13.2) SHALL preserve this."
- §13.8 (i): "At a suspension point of an action position, where the compiler awaits it. The action positions are … a function body (client or server) …"
- §19.16.2 Registration: "the innermost statement list that contains the `defer`: a function body, an `if`/`else` branch, a loop body (once per iteration), …"; Exit: "every deferred body registered in that block runs exactly once, on EVERY exit path: falling off the end of the block; `return` …; `break` / `continue` out of the block; …"
- §19.16.2 (value forms): "The same code covers a `defer` written directly in an arm of a `match` / `if` / `for` that is used for its VALUE" — E-DEFER-UNSUPPORTED-SITE (so a `defer` DIRECTLY in a bound loop's body is that code, not a lift).
- §19.16.3 rule 1: "A `break`/`continue` that targets a loop INSIDE the deferred body is permitted." (the loop-in-defer shape)
- §19.16.6: "A loop body is its own block, so each iteration has its own stack instance and its deferred statements run at that iteration's exit."
- 2026-10-27T15:00:04Z slice 1a (defer in loop body; loop in deferred body) built: analyze loopFor/loopDefer/loopJump + deferBodyRules(inner labels); check C19 admits Defer, C16 admits inner Loop/Gather + jumps/lifts naming them; slice-m4/loop-defer-s471.test.js (12) green; loops-s469 pin moved.
- 2026-10-27 slice 1b (a loop BODY that waits) built:
  - analyze `planLoop`: the body is planned as any statement list; a loop whose body holds a suspension point gets an EXIT join on its `for` statement (minted `loop_exit`). Still refused by name: a wait in a loop HEAD (iterable / bounds / init / condition / step) and in a loop bound as a value (§49.6).
  - lower: `joinMark` on a `for`; the continuation pass turns `Join(k,[]) Loop(…)` into `Join(k, rest-of-block)` + `Loop` whose body is in explicit continuations, each path ending in `Continue(label)`.
  - check C12: a Join may precede the Loop that ends its block; that loop's body is a continuation owner (`waitingLoopAt`). C19: Suspend / Join / Jump in a loop body are C12's to judge; a Break / Continue of a WAITING loop may stand in a continuation inside it (`jumpBlockIn` cyc list).
  - print (client): `cycleJs` — `const L = rt.cycle((params) => { guard; binds; body })` + start call; Break = `return exit()`, Continue = `return L(next)`; counted step on a copy (`L$step`), iterate head by position over `Array.from(src)`, range counter as parameter. Server: unchanged native loop (`await` at each Suspend; flattened).
  - runtime: `cycle(iterate)` — a trampoline (`next` never recurses; constant stack whether iterations wait or not).
  - gates: slice-m4/loop-wait-s471.test.js (14, end to end against a real in-memory SQLite: every head, per-iteration binding across the wait, continue/break/return, nested labelled, 20000-iteration handler loop, server-side loop); server-await-review `s1/forBody` REFUSED → PASS (wrong password → REJECTED, right → WELCOME — the security floor holds).
- 2026-10-27 acceptance: loop/defer-per-iteration, loop/defer-loop-in-defer (run), loop/neg-defer-bound-direct, loop/neg-defer-break-out (exact codes).
- Gap 1 status: the loop-body wait (§49.12.7), defer-in-loop and loop-in-defer are BUILT. Remainder (still refused by name, fail closed): a wait in a loop HEAD; a wait in a loop bound as a value; a `defer` anywhere in a function that waits (the async-`defer` refusal — control-flow lane's region). Proposed gap update: narrow `g-bootstrap-loop-wait-and-defer-s469` to those three.
- 2026-10-27 PA SCOPE CHANGE received: the control-flow lane (worktree-agent-ab4a6d2740c0b0a00 @ 806d4b7a5) built `defer` in loop bodies. My defer half was ALREADY COMMITTED before the message: 460e520c5 (analyze loopFor/loopDefer/loopJump/deferBodyRules*, check C19 Defer / C16 inner loops, slice-m4/loop-defer-s471.test.js, loops-s469.test.js line 215 pin) and, in 97bbaf8a7, acceptance/loop/{defer-per-iteration, defer-loop-in-defer, neg-defer-bound-direct, neg-defer-break-out} + their STATUS rows. PA to reconcile at landing (prefer the control-flow lane's code; my tests/cases may be kept as extra coverage). No further edits to the defer rules here.

## Gap 2 — g-bootstrap-lin-not-implemented-s469 — reproduced on base (1e2a2812f)

`lin t = "a";` in a function body → `E-STMT-MISSING-SEMICOLON` + `E-SCOPE-001: \`lin\` is not declared` + `E-SCOPE-001: \`t\` is not a writable local`; `function g(lin tok: string)` → `E-BOOTSTRAP-UNSUPPORTED: an unannotated parameter \`lin\``. Fails closed, wrong messages.

Governing sentences (quoted before changing behaviour):
- §35.1: "The binding is immutable, must be consumed on every execution path, and must not be referenced by any code between the declaration site and the consumption site except the consumption itself."
- §35.2: "`lin` is a declaration keyword. It takes the same syntactic position as `let` and `const`." · `lin-declaration ::= 'lin' identifier '=' expression ';'` · "Every appearance of a `lin` identifier in a position that is not a declaration SHALL count as a consumption event (§35.3). The compiler SHALL reject any second reference — read-only or otherwise — with E-LIN-002."
- §35.2.1: `parameter ::= ['lin'] identifier ':' type-annotation` · "A `lin` parameter annotation SHALL have no effect on the emitted JS output."
- §35.3 (events 1–5), §35.4.2 ("An `if` without an `else` that consumes the `lin` variable in the `if` body is E-LIN-003"), §35.4.3 (match arms; "linear type analysis is deferred on non-exhaustive matches"), §35.4.4 ("`lin` variables from outer scope SHALL NOT be consumed inside loop bodies"; the loop-body carve-out), §49.5.3 (break/continue fast-exit E-LIN-001; "A `lin` declared in a counted head's `init` is an outer `lin` for the body"), §35.5 (E-LIN-001/002/003/005), §35.6 ("Capturing … SHALL count as one consumption"; "Capturing the same `lin` variable in more than one closure SHALL be a compile error (E-LIN-002)"), §35.7 (W-LIN-001), §19.16.9 (a `defer` body counted at the `defer`).

Slices (all in one commit — the pass is one walk; slicing it by commit would have committed a pass that accepted unchecked control flow, i.e. failed open):
- 2a declaration + exactly-once: parse `lin name = init;` (Local `lin: true`, immutable) and `lin name: T` params (AParam `lin`); analyze `linPass` (after the typer + placement): per body root (function, handler block, effect body), path-sensitive over the binder's name facts.
- 2b control flow: if/else, given, `&&`/`||`, `? :`, match / `!{}` arms (merge of live paths → E-LIN-003), return / fail / `?` / implicit `?{}` propagation in a `!` function (E-LIN-001 per path), loops (outer lin in body / per-iteration head parts → E-LIN-002; loop-local lin on break/continue → E-LIN-001), defer (counted in place).
- 2c closures + params + shadowing + server: lambda capture = one consumption, each further appearance E-LIN-002; `lin` params bound at entry; E-LIN-005; W-LIN-001 on a lin argument of a client call of a server-placed function.
- Refused by name: `lin x: T = …` (an annotation §35.2's production does not have — OPEN QUESTION, E-BOOTSTRAP-UNSUPPORTED); a lambda that captures a lin AND holds an arm block (E-BOOTSTRAP-UNSUPPORTED — not counted inside such a block).
- Not reachable in the bootstrap (no trigger, nothing to refuse): cross-`${}` lin (§35.2.2 — the bootstrap has no top-level logic statements; a `${ lin … }` in markup fails to parse), E-LIN-004 (recurring contexts — no outer lin is visible in an effect body), E-LIN-006 (`<request>`/`<poll>` not in the bootstrap), `~` (§35.8; not in the bootstrap).
- PA readings for veto: (1) `if (c) { return use(t); } return "n";` reports E-LIN-001 (the path through `return "n"` has no consumption), not E-LIN-003 — both definitions apply; the path-local one is used. (2) a `?` propagation and an implicit `?{}` propagation in a `!` function are exit paths: a lin unconsumed at that point is E-LIN-001 (§35.3 "every execution path"). (3) two appearances inside ONE closure body are E-LIN-002 (§35.2 "every appearance"), even in exclusive branches of that body.
- Gates: slice-m4/lin-s471.test.js (26: codes + runtime); acceptance/lin/* (6: 2 run, 4 exact codes); slice-m2 tables.test.js param-shape probe widened (AParam has 5 keys now); severity.scrml regenerated (+E-LIN-001/002/003/005, W-LIN-001 from §34).

## Gates (at 2b0e08b21)
- pre-commit (unit + integration + conformance + every bootstrap slice, sharded): passed.
- CI `slices` job, run by hand: lint-no-default-arm 0 violations; slice-m1 100/0; slice-m2 612/0; slice-m1 SLICE_CORE=lowered 100/0; slice-m3 60/0; slice-m4 2547/0; slice-codec 166/0.
- `bun run types:check`: OK (181 diagnostics, unchanged).
- bootstrap-conformance (not committed): base 1e2a2812f PASS 251 · FAIL 63 · UNSUPPORTED 814 · NOT-TWINNED 685 (1813) → after PASS 252 · FAIL 64 · UNSUPPORTED 812. Both moved cases are the DEFER half (now the control-flow lane's): `defer/loop-per-iteration` UNSUPPORTED → PASS; `defer/control-flow-neg` UNSUPPORTED → FAIL (twin-extra-error: E-DEFER-CONTROL-FLOW + an unasserted E-TYPE-001, now reached because the loop-defer refusal is gone). The wait and lin halves moved no corpus case (no corpus case reaches them on the bootstrap).
