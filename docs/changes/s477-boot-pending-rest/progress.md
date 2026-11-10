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
