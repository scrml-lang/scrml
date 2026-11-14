# progress — s477-boot-pending-rest

- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a95153ee0db834fd6 (base 709f53429)
- maps read: primary.map.md (Bootstrap routing rows "`<request>` … pending cells" + lifecycle) and bootstrap.map.md — LOAD-BEARING: the routing row named resolveReset/resetOnPass neighbours, requestView (lower), requestOn/refetch/requestSlot (runtime) and pending-cells-s475.test.js; hypothesis "reset = Core Refetch of the hidden request's slot" held.

## Unit 1 — g-boot-pending-cell-reset-unbuilt-s475 (reset / reset-on on a pending cell)
Governing sentences (SPEC):
- §13.9.2: "The compiler SHALL NOT reset the cell by re-running the initializer outside the request. A reset of a pending cell (§6.8) is the request's re-run."
- §13.9.4: "the cell SHALL keep its last `T` while the new load is in flight … It SHALL NOT revert to `not`. This follows from the desugar: the request writes the cell only when a load settles."
- §13.9.1 S475 rule 5: "The compiler-written load writes are exempt from grant checks."
- §6.8.4 rule 1: "When any listed cell changes … the runtime SHALL perform `reset(@self)`".
Meaning decided: reset target = the hidden request (a re-run, Core Refetch); the load re-runs; the cell keeps its value until it settles; no grant needed (locked allowed). reset-on= = the request's re-run on entry change = entries join the request's deps.
Not ruled / not touched: `default=` on a pending cell (§6.8.1 vs §13.9.2 conflict) — the bootstrap has no `default=` at all, so unreachable here; owed if `default=` is built.
Done: analyze resolveReset/resetEdgeOf/pendResetDeps; lower resetStmt/requestView; 7 unit tests; 3 conformance cases (bootstrap PASS); gap resolved; impl1 carried gap g-impl1-pending-cells-unbuilt-s477 filed for the xfails.
- Unit 1 committed d6981a840; pushed; draft PR #1826.

## Unit 4 — g-boot-plan-arms-nested-wait-s475 (done before unit 2: small)
Governing: the bootstrap's own INTERIM arm refusal (planArms `armPos`; capable form = U1b arm-continuation follow-up); §13.8 (a suspension point needs a continuation). No meaning change — the same refusal now reaches nested statements (front-end diagnostic instead of Core C-S3 / C-S8s).
Done: analyze planArmBlock (recursive); slice-m4/plan-arms-nested-wait-s477.test.js (5 tests; red without recursion: 3 fail). No conformance case (bootstrap-only refusal). Gap resolved.
- Unit 4 committed 4836a440a. (API outage; resumed S477 2026-11-14.) Merged origin/main (#1823, #1824) clean: 73e881cf8.

## Unit 2 — g-boot-pending-cell-opaque-call-s475 (initializer calling a non-server function)
Governing sentences (SPEC):
- §13.9.1 "The spelling decides the load": "The rule reads the initializer exactly as §66.9 rules 3–4 read any initializer: it "reads cells" when it reads a cell directly or through a called function (§13.9.2's deps)."
- §13.9.2: "deps are inferred from the initializer's `@` reads, as `<request>` infers them (§6.7.7)."
- §13.9.1 rule 3: "locked + an initializer that reads cells is a derived cell … and stays refused, E-VALUE-SERVER-CALL" (PERMANENT).
Meaning: through-call reads = transitive `@` reads of the called client functions (server / host fns not walked, §12.4). Mutable program-cell reads are deps; locked are reads only. Provable-or-refuse: derived-cell / instance / surface / request-state reads, calls through non-function names, missing bodies → INTERIM named refusal (gap narrowed, residue stays open).
Done: analyze callReach/fnReach/readReach/pendCallDeps + initPos/lifeDerived/pendingCell; tests updated/added (incl. runtime re-run through cur()); 3 conformance cases (2 PASS; locked-derived-pos UNSUPPORTED on bootstrap: it also emits the derived-lifecycle E-BOOTSTRAP-UNSUPPORTED beside E-VALUE-SERVER-CALL — pre-existing double report that §66.9 rule 3's ⚑ PA reading says should be one).

## Units 3 and 5 — not built (owed)
- Unit 3 (g-boot-pending-cell-outside-program-s475): a file-scope / module cell is a USER declaration's shared instance (§66.6.4), not a program field; the capable form needs the hidden request targeting a shared-instance field and mounted by each importing program (pendFiles / resolvePending / requestView all assume a program field). Not started; refusal stays INTERIM.
- Unit 5: §34 code for the derived-lifecycle refusal — SPEC §66.9 rule 3: "no language code names this refusal yet, and none is minted here (§66.20's house rule…)"; owed a language code when one is named (owner). S6 display-position pending values: SPEC §13.7 S474 note — owed capable form; "fallback spelling not ruled". Not started.
