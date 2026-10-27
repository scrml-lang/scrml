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
