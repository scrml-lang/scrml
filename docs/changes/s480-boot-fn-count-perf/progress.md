# s480-boot-fn-count-perf — progress

Lane: S480 blocker census "Performance" — bootstrap compile time super-quadratic in the number of
top-level functions (500 fns 0.44 s, 2000 4.3 s, 4000 16 s, 8000 120 s); `lineCol` in
scripts/scrml-boot.ts rescans the file per diagnostic. Bootstrap only; verdict-preserving.

Scratch: ~/.cache/scrml/review/s480-fnperf/ (generator inputs, run.ts timer, top.ts/callers.ts
profile readers, bytes.ts/cmp.ts byte-compare, base worktree at base/).

- [x] r1: lex.scrml token accumulation chunked (older + tail; joined once per run); parse.scrml
      toPToks by halves; effects.scrml sccOrder iterative over local tapes, closeDim in place;
      analyze.scrml printFileBound hoisted per file (printScans, fnWrites); linOuterRunLins reads a
      once-per-pass list of body-top `lin`s; boundAs → boundIdx/boundAsIn (sorted index) for
      fnsInScope / fnwIn / stubsInScope; laterPrograms + fnItems/typeItems/constItems by index and
      halves; userNamed hoisted (channelPass); walk.scrml programKids / boundSyms by halves;
      fileNameClashes reads a sorted name index; referrers one pass; summarize / txQuerySets over
      SymIx lookups and in-place tapes; names.scrml NameTable indexed (SIdx levels);
      check.scrml checkLocalsBound marks bound ids in a tape.
      syn8000: 120 s -> 5.4 s; byte-compare conformance + examples (1996 inputs): 0 diffs.
- [ ] r2: analyze fact tables (addName/addValue/... append per node), diags append, lineCol.
- [ ] timing tests, gap, full gates, PR.
