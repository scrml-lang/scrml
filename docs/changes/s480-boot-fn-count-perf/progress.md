# s480-boot-fn-count-perf — progress

Lane: S480 blocker census "Performance" — bootstrap compile time super-quadratic in the number of
top-level functions (500 fns 0.44 s, 2000 4.3 s, 4000 16 s, 8000 120 s); `lineCol` in
scripts/scrml-boot.ts rescans the file per diagnostic. Bootstrap only; verdict-preserving.

Scratch: ~/.cache/scrml/review/s480-fnperf/ (generators gen.ts + census inputs, run.ts timer,
top.ts / callers.ts / ratio.ts profile readers, bytes.ts / cmp.ts byte-compare, selfhost.ts per-file
diagnostics compare, base worktree at base/).

- [x] r1 (c7f9cf950): lexer token accumulation chunked; toPToks / programKids / boundSyms / fnItems
      by halves; sccOrder iterative over local tapes, closeDim in place; printFileBound / userNamed
      hoisted; linOuterRunLins once per pass; boundAs → boundIdx; laterPrograms indexed;
      fileNameClashes name index; referrers one pass; summarize / txQuerySets over SymIx + in-place
      tapes; NameTable SIdx levels; checkLocalsBound marks. syn8000 120 s -> 5.4 s.
- [x] r2: binder fact tables chunked (NodeFacts.old, chunk nid ranges); typer ExprLog;
      inheritedFns worklist (chain shape was cubic); clientCauses indexed; scopeHit / fnNamed /
      fnOfSym / fnSrcOf indexed (FileScope.ix, Globals.fnIx / fnSyms); fnWrites / callKeys /
      checkArgs over FnWIx; dropTailNoEffect / errorSpansIn (parse.scrml error-heavy);
      scrml-boot.ts lineCol / sourceContext / byteColumn from cached line starts.
      Tests: slice-m4/compile-scaling-fn-count-s480 (red on base: 12.0 / 16.0 / 18.7 vs bounds
      10 / 10 / 13), slice-m4/linecol-s480 (red on base). Gaps: g-boot-compile-superquadratic-fn-count-s480
      (resolved), g-boot-compile-per-call-scans-s480 (LOW, open residual).
- [ ] final gates, PR.
