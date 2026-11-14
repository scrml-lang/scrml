# progress — s477-boot-nested-fn

- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a752ba24dd57d8992 (base 709f53429 = origin/main)
- maps: primary.map.md + bootstrap.map.md read first (stamp f92d1a8fb). Load-bearing: bootstrap.map.md
  "If you need to change X" (parser construct → parse + ast + analyze + lower totality; Core node → core +
  walk.kids + measure + print + check) and B1 (no default arm: every AStmtK / Stmt match must grow an arm).
  The locus hypothesis (parse.scrml function-body statements; analyze comments assuming no nested
  declaration) verified: parseStmt had no `function` arm; analyze.scrml :13039 / :13156 / :17540 / :22388.

## Governing sentences (quoted before each meaning / acceptance change)

- §7.3.1 "Function declarations inside `${}` logic blocks MAY be nested. An inner function declared inside
  the body of an outer `function` or `fn` closes over the outer function's `let`, `const`, and `lin` bindings
  with standard JavaScript closure semantics." → BUILT (parse, scope, typing, Core `Stmt.LocalFn`, print).
- §7.3.1 "Inner `function` declarations MAY mutate outer `let` bindings. Inner `fn` declarations are subject
  to the same purity constraints as top-level `fn` (§48) — they may read outer bindings but may not mutate
  them (E-FN-003)." → BUILT (`capWrite`: a write to a binding captured across a pure `fn` boundary).
- §7.3.1 "The compiler SHALL NOT hoist inner function declarations out of their enclosing function body.
  Each inner function's scope is the enclosing function body, not the `${}` block." → printed in place
  (`localFnJs`); never in CoreProgram.fns; not in any file scope (fnNamed / dupFns / fileNames skip it).
- §48.6.4 "Inner `fn` declarations (nested inside an outer `fn` body, per §7.3.1) hoist to the enclosing `fn`
  body's local scope, not to the file scope." → the block's nested functions are bound at block entry
  (`bindLocalFns`); mutual recursion and forward calls resolve.
- §7.3.3 "a `let`, `const`, `lin` or `function` declaration SHALL NOT redeclare a name already bound in the
  SAME block"; "Two `function` declarations of one name in one block (of a function body) are outside this
  rule."; "A `function` declaration named like one of the function's PARAMETERS is outside this rule … It is
  host-legal and replaces the parameter's value for the whole body" → E-SCOPE-REDECLARE nested-fn ↔ local
  both ways; parameter exempt and SHADOWED (bindLocalFns drops the parameter from scope).
- §19.16.6 "§7.3.3 deliberately does not reject duplicate `function` declarations inside a function body … the
  block that contains the `defer` declares the same `function` name twice: **E-DEFER-DUPLICATE-FUNCTION**" →
  two nested functions of one name compile, the LATER one is called (bindLocalFns binds the last); with a
  `defer` in the block, E-DEFER-DUPLICATE-FUNCTION (blockRedeclares). (First draft refused duplicates INTERIM —
  corrected: the SPEC does rule them; conformance defer/duplicate-function-{neg,no-defer-ok} pin it.)
- §48.6.2 "A `fn` body SHALL NOT call a `function`-declared callable" and §48.3 "SHALL NOT appear anywhere
  inside a `fn` body, including inside nested closures" → a nested body inside a `fn` resolves with
  HostPure (E-FN-003 call half, E-FN-004 clock); a nested `function`'s cell writes count for the pure parent
  (scanLocalFn); a nested `fn`'s own writes are judged on it only (no double report).
- §12.1 "The compiler SHALL decide where each function executes." / §7.3.2 lists "a nested function in
  server code" among SERVER-PLACED functions → a nested function's placement IS its declarer's
  (`nestedPlaces` / `nestedInherited`); it is never a route (placePass skips it; lower never puts it in
  CoreProgram.server). It cannot escape: a function value is refused (fnNameRef, E-BOOTSTRAP-UNSUPPORTED).
- §13.9.6 "An async-colored function (§13.2) SHALL be bound only by a `function` declaration, including …
  a `function` declared inside another function's body." → the language allows a waiting nested
  function; NOT BUILT → INTERIM refusal (nestedFnPass).
- §35.6 "Capturing a `lin` variable in a closure (arrow function expression or `function` expression) SHALL
  count as one consumption" → a declaration is not an expression and is hoisted; where its capture is
  consumed is not ruled → INTERIM refusal (linLocalFn), ruling owed.
- §19.16.3 rule 4 / §19.16.1 ("a `function defer` anywhere in an enclosing block (hoisted)") → `deferBound`
  sees nested functions (fnNamedIn); a nested body is a defer / loop-control boundary of its own
  (resolveFnBody runs loopChecks + deferChecks on it).
- §66.10 value semantics: a captured binding is the binding (closure), not a snapshot; JS closure semantics
  per §7.3.1 is exactly what is printed (`let pos` → the inner `pos = pos + 1` rebinds it).
- §7.6 (S473 D14) "(Parameters and nested `function` declarations are not decided by this ruling.)" → a
  nested function named like a cell: SPEC silent → INTERIM refusal.

## Searched — SPEC silent (INTERIM refusal + ruling owed)

1. A nested declaration inside an inner BLOCK (if / loop / match arm / given / defer) — searched §7.3.1,
   §48.6.4, §6.9 ("Each inner function's scope is the enclosing function body" vs JS block scoping): not
   ruled whether it is visible after its block.
2. A nested declaration in an event handler / effect body / `<request>` body — §7.3.1 names only "the body
   of an outer `function` or `fn`"; searched §5.2.3, §6.7.4: none.
3. A call of a nested function that runs before a binding it captures is declared (JS TDZ) — searched
   §7.3.1, §6.9, §19.17 traps: none.
4. `lin` capture by a (hoisted) declaration — §35.6 names expressions only.
5. A nested function named like a cell — §7.6 D14 leaves it undecided.
6. `server` modifier on a nested declaration — §52.10 deprecates it; nothing rules it on a nested one.

## Not built yet (the language allows it — INTERIM, residue gap)

- a nested function that WAITS (server call / waiting call / `?{}`), and a nested function in a CLIENT
  function that waits (the client CPS split would move the declaration);
- a failable (`!`) nested function;
- a nested function in a `!` client function whose server calls compose (composeOne refuses).

## Log

- parse: `localFnAhead` + `parseFnDecl` (shared with the item parser); AStmtK.LocalFn.
- analyze: FnInfo.outer; fnsOf mints nested functions (fnsWithNested); Env.nest (NestCtx); resolveBlock binds
  hoisted + resolves nested bodies at block end in the final scope; resolveLocalFn; capWrite; typer types the
  nested body at block end with no narrowing (tNoNarrow); a call of a nested function ends every narrowing
  (tUnnarrowEffects); nestedPlaces / nestedInherited; nestedFnPass (waits, waiting client parent, TDZ);
  68 AStmtK match arms.
- core: Stmt.LocalFn(f: Fn); walk/measure/print/print-server/check/lower arms; check C-N1.
- print: `localFnJs` — a host `function` declaration in place.
- merged origin/main (#1823 call-source types, #1824 in-place tape edits): print.scrml `ownStmt` gets a LocalFn
  arm (every local a nested body names copies on write; the nested body prints with its own ownedLocals).
- Bootstrap conformance (origin/main 0487a8fa4 report → this branch): PASS 302 → 307 (+5: the five new
  fn/nested-* cases), FAIL 244 → 243 (refinement/nested-fn-param-reject-rt FAIL → UNSUPPORTED: its `string(url)`
  parameter is now refused by name instead of a parse cascade), UNSUPPORTED 657 → 658, NOT-TWINNED 624,
  CRASH 0, INVALID 0. No old case lost PASS. defer/duplicate-function-{neg,no-defer-ok} stay FAIL as on base
  (their twins' newline-terminated `return 1` is E-STMT-MISSING-SEMICOLON, dpa-073 — not this lane).
- Hook: `SCRML_HOOK_SHARDS=1` fails on base on compiler/tests/unit/b17-4-codegen-ontransition-effect.test.js
  (passes alone — single-process order pollution, impl#1, untouched here); the default sharded hook with
  SCRML_HOOK_SHARD_MEM_MB=4608 passed: 54,297 pass / 0 fail (slices included).
