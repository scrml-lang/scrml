# s483-invariant-2 — Q21 struct invariant, LANE 2 of 3 (write-site and run-time checks)

Rulings: `ruling:user-voice-scrml.md-S483-struct-invariant-syntax` (item 2: check every write; the spread is
the grouped write; S477 supersedes S440 — a refused write traps and writes nothing),
`ruling:user-voice-scrml.md-S483-invariant-const-read` ("Allow compile-time consts (Recommended)").
Design: `~/.cache/scrml/review/s482-struct-invariant/proposal.md` §2–§4. Bootstrap-only (compiler/self-host-v2/);
impl#1 frozen (§66 Nominal there, §34.0).

## Log

- r0 wip 1 — runtime (slice-m1/runtime/runtime.js): `invariantGuard(inst, writes, checks, loc, pre)` (a
  declaration instance's candidate: its other fields read untracked, the writes applied, every check judged,
  the first write's value returned), `invariantValue(cur, path, op, v, checks, loc)` (a value's candidate),
  `edgeFirst` / `lengthFirst` (a lone write's runtime field contract, run first — §66.13.5 order). Trap
  E-WRITE-INVARIANT-RT names the owner, the `[label]` or expression, the candidate field values, the location.
- Core (core.scrml): `PrimOp.InvariantGuard`, `PrimOp.InvariantValue`; `Decl.invs` (the construction check).
- analyze.scrml: `BindFact.BInv(params)` on each clause (one minted local per field — the clause's parameters);
  `InvCheck` + `invInstanceChecks` / `invGroupChecks` / `invValueChecks` (the read-set walk, the deepest value
  first); `Tables.lines` (the trap's `file:line`); `EAssignLocal.root` (a local part write's root type);
  refusals (E-BOOTSTRAP-UNSUPPORTED, INTERIM) for a write at a tape position inside an invariant-constrained
  value, a part tape edit there, and a `bind:` to an invariant-read field (lane 3's refusal-with-keep).
- lower.scrml: `invLone` (a lone write's value through InvariantGuard — field write, deep write, edits, reset,
  reset-on, a lone spread override), `invGroup` (a Commit's one InvariantGuard Eval after its Writes — spread,
  sequence shape), `invValue` (a local's part write; a construction `{ … }` of a type with invariants —
  `constructed`, omitted when `invProven`), `constructCheck` (Decl.invs), `loadBody` (a reload's check rebuilt
  around the load).
- print.scrml: InvariantGuard / InvariantValue → rt calls; `commitJs` runs the Commit's invariant Eval after
  every write's own contract check, before the batch; `guardedWriteJs` hands a lone RuntimeEdge / RuntimeLength
  write's contract check to the guard as `pre`; `factoryJs` prints Decl.invs after the fields are seeded.
- check.scrml: C7 admits the Commit's trailing InvariantGuard Eval; `checkWrite` judges a guarded value by the
  value it guards (C3 / C6 / C9).
- Item 1 (consts): `invConstWhy` / `invConstInit` admit a compile-time constant (literal, enum variant, other
  such constant) directly and through a `fn` chain; `invServerConstPass` (after placement) refuses one server
  code reads; `invConstEnts` folds them for E-WRITE-INVARIANT and `invProven`.
- Item 4: L1 `invCallableConst` (CAPTURES-CALL only for a callable constant / `let`); L4 the callback message.
- Lane-1 slice tests re-pinned (4): the const refusals now use a non-constant initializer; the int-const capture
  is now CLEAN (L1).
- r0 wip 2 — hook fixes: the M1 hand-built Core oracles (slice-m1/*.core.scrml) carry `invs: not`; walk.scrml
  `declKids` visits `Decl.invs` (the printer names the construction check's parameters — `boundSyms`).
- Static: `invLoneFold` — a lone literal write that provably breaks an invariant it touches is E-WRITE-INVARIANT
  (`@counter.n = -1` under `invariant (n >= 0)`; a constant decides it too). `invComputed` — an invariant that
  reads a field with no write capability whose value tracks (a derived field; a locked attribute given a live
  use-site value) is E-BOOTSTRAP-UNSUPPORTED (INTERIM, g-boot-invariant-derived-field-s483).
- New slice test slice-m4/invariant-write-s483.test.js (25).
- server-runtime.js re-exports `invariantValue` / `invariantGuard` (a construction `{ … }` of an invariant-bearing
  type in server code — e.g. a server function's return value — is checked there too).
- Probes (.tmp/p1–p7): field write / spread / reset / tape append / pop / filter / sequence shape / deep write /
  replace / local part write / construction / request reload — each prints a readable guard and traps on the
  candidate in happy-dom; the request reload's guard is rebuilt around the load (`settled`).
- r0 wip 3 (after commit 2b99a4cb6, hook 58705 pass / 0 fail / 255 skip): SPEC §66.13.5 (scope; rule 2 —
  CAPTURES-CALL only for a callable binding; rule 7 / new rule 7a compile-time constants; rule 9 the lone literal
  write and the folded constants; Status), §53.8.2 bootstrap order note, §19.17 / §34 / §66.20 rows
  (E-WRITE-INVARIANT-RT emitters; E-WRITE-INVARIANT provable cases; E-DECL-INVARIANT-IMPURE /
  -CAPTURES-CALL). known-gaps: g-boot-invariant-write-checks-s483 RESOLVED; filed g-boot-invariant-position-
  writes-s483 and g-boot-invariant-derived-field-s483 (INTERIM, owner question); boundaries-lints notes the bind
  refusal; the impl#1 carried gap counts 21 cases. 8 new conformance cases (all PASS on the bootstrap; impl#1
  xfail signatures captured with `conformance/run.ts --xfail-signature`). Chromium file
  compiler/tests/browser/invariant-write-chromium-s483.browser.test.js (6 pass).
- PA reading filed in SPEC (open to owner veto): prov=pa-ruled:S483-const-initializer-list — the ruling's
  "(literals, enum variants, other such consts)" read as the whole list (`const LIM = 1 + 2` stays refused);
  a negated number literal counts as a literal.
- server-only-const-neg re-authored without the deprecated `server` modifier (a `?{}` places `tagged` on the
  server; the retired-forms gate counted `server function` in a new conformance case); its slice test proves the
  constant stays out of the client artifact without the clause.

## Gates (head f6656d4a1 + coverage row; base origin/main fa24c93bb)

- pre-commit hook (f6656d4a1): 58713 pass / 0 fail / 255 skip, RESULT PASS (2b99a4cb6: 58705 / 0 / 255).
- bootstrap-conformance --json: base PASS 864 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 / INVALID 0;
  head PASS 872 (+ the 8 new invariant cases) / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 / INVALID 0;
  0 bucket or emitted-code changes on the 1986 shared cases.
- conformance/run.ts (impl#1): 1783/1994 pass, 211 xfail (203 + 8 new, g-impl1-decl-invariant-unimplemented-s483), 0 FAIL.
- slice-m4/invariant-write-s483.test.js 25 pass; invariant-decl-s483.test.js 45 pass (4 re-pinned + L1 test).
- Chromium (SCRML_BROWSER_TESTS=1), the 13 s482/s483 browser files: 89 pass / 0 fail (invariant-write 6).
- Corpus differential (compileSource, 2990 shared files): 0 newly rejected, 0 newly accepted, 0 code changes,
  0 crashes; 8 head-only (the new cases). Byte-compare (compileFile, tree path normalized, runtime files excluded):
  328 artifact-bearing files, 1 differs — conformance/cases/invariant/accepted (its declarations' construction
  checks, expected).
- host-global-scan --check --mode-shard 1/2 and 2/2: exit 0 / exit 0 (3 new esm throws pinned).
- types-gate --check OK unchanged; s34-census --check-new --base origin/main PASS (7 rows); retired-forms-lint
  --base-ref origin/main OK; spec-coverage-check 0 violations (the §66.13.5 row re-cited to the lane-3 gap);
  gen-bootstrap-severity --check exit 4 on base and head alike (bot-owned).
- Runtime size: slice-m1/runtime/runtime.js 422505 → 427966 bytes (+5461, +1.3%, mostly comments);
  server-runtime.js 150528 → 150794 (+266, the re-export).

## r1 (fix round, #2128 review FIX)

- merged origin/main (b5f071c46: generated docs only); the reviewer's 81 probes compile byte-identical on
  fe46cb8f7 and on the merge (compileall/cmpdiff: 81 identical, 0 differing, 0 code diffs).
- H2: invServerConstPass closes the server reader set over the call graph (server fn bodies → every function they
  call, any placement → program-cell seeds and constant initializers they read; each once). g03 now refused;
  slice-m4/invariant-r1-s483.test.js (H2 block, 6) — each refused variant's no-invariant control has the secret
  in no client file.
- L1: invConstInit admits what invFold folds (Binary / Ternary / Unary over literals and such constants,
  invConstFoldG over the binder's tables); invConstFold (Tables) folds the same, so E-WRITE-INVARIANT and
  invProven see `const LIM = BASE * 2 - 1`. The 3 lane-1 re-pins that used `1 + 2` / `10 + 20` / `2 + 3` as the
  non-constant now use a `fn` call.
- H3: InvCheck.derive / InvOwner.derived (invDerivedOf / invDeriveFor / invTouchSet): a field derived from its
  siblings is recomputed on the candidate (runtime invJudge `derive`), and a write to any sibling it reads
  touches the clause. invDerivedDiags (in invReachPass): a computed field reading a cell / row / declared
  value's state → E-CONTRACT-003 PERMANENT; a host call / non-constant binding → E-DECL-INVARIANT-IMPURE.
  useInvs: a locked field given a non-constant use-site value → E-CONTRACT-003 PERMANENT; a use-site value
  for a recomputed field → E-BOOTSTRAP-UNSUPPORTED INTERIM. A `{ … }` initializer stays INTERIM.
- H1: Core Persist.invs / loc (analyze invDeepChecks — the type's invariants at its whole depth, `at` steps
  "*" (tape elements) and "#V.n" (payload positions)); rt.persisted(…, invs, loc): restore and cross-tab
  decode take the default when a check fails (invariantsHold). walk.scrml visits Persist.invs.
- tests: slice-m4/invariant-r1-s483.test.js (23); Chromium invariant-write-chromium-s483 +5 (i08, i10,
  c03c, c03d, restored tape element).
- L2: check.scrml checkCommit(p, ws) — at most one invariant check; its entries name exactly the Commit's
  Writes (field index, the Write's Local, the same instance); a Commit whose whole-field Writes touch a field
  the declaration's invariants read (Decl.invs) and holds no check fails. checkWrite: a lone write's check names
  its one write (field, instance). slice-m4/invariant-c7-r1-s483.test.js (4). c7 probe: d, f now caught; g, h as
  on base.
- L3: runtime suspend / Request.run — a trap raised in a continuation (a reload's invariant check) is reported
  as a trap (reportLater: the page's error event, as a hole's trap), not "a host error in a continuation".
  `<#rq>.error` is NOT set: §19.17 "A trap SHALL NOT be a `!` error" and §6.7.7 `.error: Error | not` — surfaced.
- nit: the E-WRITE-INVARIANT lone-write message no longer doubles the label's backticks.
- persist.test.js pin: Field.persist carries `invs: null, loc: ""` (H1).
- L3 corrected (after bd8bbaae7): routing a continuation's trap to reportLater crashed the bootstrap-conformance
  harness under Bun (its global reportError is an uncaught exception there). The trap now goes through the one
  reporter, whose default classifies it — "scrml: trap E-… in a continuation (§19.17)" — instead of "a host error".
- M1: INTERIM + g-boot-invariant-const-client-read-s483 (message + SPEC 7a); M2: NOT built — owner question,
  g-boot-invariant-each-row-construct-s483 (a pre-write check changes S479's ruled hole-trap behaviour).
- SPEC §66.13.5: 7a (foldable constants, call-graph server reader set, M1 INTERIM), new 7b (computed fields),
  decoded values (persist), Status; §34 E-CONTRACT-003 / E-DECL-INVARIANT-IMPURE rows.
- conformance: 5 new invariant cases (server-const-via-call-neg, derived-sibling-trap-rt, derived-cell-neg,
  use-site-live-neg, const-fold-accepted); impl#1 xfail signatures captured (const-fold-accepted passes on impl#1).
- bootstrap-conformance --json: PASS 877 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0; 0 record diffs
  on the 1994 shared cases vs r0; the 5 new PASS.
- merged origin/main 353ffe643 (#2130): print.scrml conflict (body-cell Decl literals) resolved to main's
  dropGivenDecl + `invs: d.invs`; dropGivenDecl itself carries invs. The 81 probes compile byte-identical
  before and after the merge.
- gates (2bbc986f5): hook 58766 / 0 / 255 PASS; bootstrap-conformance PASS 877 / FAIL 3 / CRASH 0, 0 diffs vs
  pre-merge; impl#1 1784 pass + 215 xfail / 1999, 0 FAIL; Chromium 15 s482/s483 files 101 / 0; corpus vs main
  (compileFile, both directions): 0 newly-rejecting, 0 newly-accepting, 0 code changes, 1 byte diff
  (invariant/accepted), r0 → r1: 0 changes on 2998 shared; host-global-scan 1/2 and 2/2 exit 0; types-gate OK;
  s34-census PASS; retired-forms OK; spec-coverage 0 violations. runtime.js 427966 → 431346 (+3380).

## r2 (fix round, #2128 r1 re-review FIX)

- start: branch s483-inv2-r2 from origin/s483-invariant-2 ff62b9319; s483-trapping-construct-init NOT on origin/main at start.
- item 1 (H2a-H2d) wip: print.scrml invLeakRefusal — the printer classification run twice (invStripProgram:
  every invariant check left out; then as printed); a binding / function / field server-only in the first and
  client-held in the second is E-DECL-INVARIANT-IMPURE with the chain (invLeakChains). bodyUseAll: an
  InvariantGuard reads only the fields it writes + its checks name (runtime invariantGuard `need`), not every
  field its handle names. clientPlanOf / outerMoves / outerPlacedBy factored out of printProgramExposing /
  outerPlaced (same steps). n01 n02 n02b n51 n60 m01 m02 refused; controls n01c n02c n60c m01c clean.
- item 1: a const target must be server-read / server-only in the stripped run (b.srv) — an unread literal const
  the client simply leaves out is not server-only (lane-1 test "callback reading a compile-time constant").
  One refusal per invariant, listing each thing it reaches with its chain. analyze invServerConstPass REMOVED
  (the printer is the one classifier); M1 closed: p02 (client also reads K) admitted. p01 (component invariant
  over `n`, a server-only attribute `t` it does not read) admitted, no leak (bodyUseAll precision). n09 (lib
  type invariant over K, construction proven at compile time — no check runs anywhere) now admitted, no leak.
  Tests re-pinned: invariant-r1 (H2 messages), invariant-write (SECRET_TAG message).
- committed 0d7339fd7 (hook PASS).
- item 3 (H4): analyze invDeepAt took the owner branch for an ENUM (invOwnerOfType gives every named type an
  owner) and stopped — now enums walk their payloads; step `#V.n.name` (runtime invEnsureAt: positional `data`
  by n — the decoded / constructed value — or a named `data` object by name). Chromium: n21 reload → default
  (-1), cross-tab refused; n22 / n24 / n26 / c03c / c03d unchanged.
- item 4 (H5): analyze invWholeChecks (invInstanceChecks + the written value at its whole depth, invDeepAt —
  now (ts, ds) and deeper-first) for a lone set / append / prepend (lower invEditChecks) and every Commit path
  (invGroupChecks); invValueWholeChecks for a local part write. Chromium: n29 `@rs = mk()` and `@o = mk2()`
  trap; n27 server rows trap; c04 still traps. (Host probes must compile outside a dot path — E-IMPORT-011.)
- committed 9d8435c65 (hook PASS).
- M3: useInvs — a pure `fn` call of constants (invUsePureCall) admitted (n46 CLEAN, construction check holds
  dbl(2)); a value reading a cell / row binder / local / declared value (invUseTracks) stays E-CONTRACT-003
  PERMANENT; any other call (a `function`) E-BOOTSTRAP-UNSUPPORTED INTERIM + gap + capable form.
- L4: fvBinary folds string `+` (fvStrOf) — `const P = "ab" + "c"` admitted, and decides E-WRITE-INVARIANT.
- L5: useInvs recomputes sibling-derived fields (invDerivedOf) from the folded values before the verdict — n42
  `<w b=(9)/>` over `span = b - a` is E-WRITE-INVARIANT (span = 9).
- tests: slice-m4/invariant-r2-s483.test.js (16: leak negatives n01 n02 n02b n51 n60 m01 m02 + controls, M1,
  precision, H4 / H5 compile side, M3, L4, L5); Chromium invariant-write-chromium-s483 "Chromium r2" (+3: n21,
  n29 incl. a valid-tape control, n27 with the server artifact) — 14 / 14.
- committed e4f65d307 (hook PASS).
- item 8: #2129 (s483-trapping-construct-init) landed on origin/main (22a6a42a9) during this round — merged.
  Conflict: analyze Tables literal (kept `lines`, added `trapDiags`); withTyping carries `lines`. Wired:
  analyze trapSiteWhat → invConstructTrapWhat (an object literal of an invariant-bearing type not invProven);
  print primTraps → an InvariantGuard / InvariantValue with a check acts (an unread initializer holding one is
  kept). Tests: invariant-r2 +2 (refused undecided, decided accepted).
- committed c350bb6da (merge, hook PASS), 347e41033 (SPEC + gaps), 5a9e4f778 (4 conformance cases).
- bootstrap-conformance graded codes from the front end only, so the printer's E-DECL-INVARIANT-IMPURE was
  "missing" (4 FAIL: server-only-const-neg, server-const-via-call-neg + the 2 new). scripts/bootstrap-conformance.ts
  now adds the printer's NON-bootstrap refusal codes to the code half when the front end reported no error (as
  `scrml-boot compile` reports them; E-BOOTSTRAP-* refusals stay where they were judged). invariant/: 30 PASS.
- committed 547a407df (harness), b998f7e67 (3 host-global-scan pins).
- PHASE 3 (base = origin/main 22a6a42a9, r1 = ff62b9319, r2 = b998f7e67): 168 probes (r0's 81 + the r1 re-review's
  pr1 / pr1rt / fix3 / fix4 / fix5 / fixrt / m2130 + 4 r2 probes) compiled on all three — client-file `zz-` leaks:
  base 0 / r1 8 (n01 n02 n02b n51 n60 m01 m02 p01) / r2 0. #2130's leak table (87): base = r2, 35 / 35, 0 diff.
  Server-load (import program.server.js + createServer): 72 / 72 OK on base and r2 (h2130), 18 / 18 r2 probes.
  Values (Chromium, 91 runtime probes): r1 → r2 differ only on n21 ×2 (default restored, cross-tab refused), n29
  (trap ×2), n27 (rows trap), n42 ×2 (E-WRITE-INVARIANT); 85 identical.
- GATES: bootstrap-conformance head PASS 889 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 / INVALID 0
  (base 872 / 3 / 628 / 491 / 0 / 0), 0 diffs on 1994 shared, 17 head-only all PASS; impl#1 1788 pass + 223 xfail /
  2011, 0 FAIL; corpus compileFile 2998 shared: 0 newly rejected / accepted, 0 code changes, 0 crashes, 1 byte diff
  (invariant/accepted); corpus Chromium load (328): identical base / head (319 clean, 9 CLI non-zero both);
  host-global-scan 1/2, 2/2 exit 0 (after pinning 3); Chromium 16 s482/s483 files 113 / 0; types-gate OK;
  s34-census PASS (8 rows); retired-forms OK; spec-coverage 0 violations. runtime.js 431346 → 431686 (+340).

## r3 (fix round, #2128 r2 re-review FIX)

- start: branch s483-inv2-r3 from origin/s483-invariant-2 fbac022d3; merged origin/main d58e768e8 (#2133) clean.
- H6 (a) print.scrml invStripProgram: sivPrim lowers an InvariantGuard to its first write's value (`not` with no
  writes) and an InvariantValue to `v`; sivStmts drops a Commit's guard Eval — the stripped run is the program with
  no invariant declared (r2 emptied only the checks, so the guard's read of the field it overwrites stayed in both runs).
- H6 (b) runtime invariantGuard: a field a write overwrites WHOLE (path [], "set") is not peeked; print.scrml
  invGuardFields `whole` + invGuardReads skip it. A guard over a Lexical handle that writes (a handler's `inst$`)
  resolves its declaration through the enclosing Write's capability (invWriteCapOf / invCapEntryDecl) — r2 failed
  closed there (every body cell read), which also masked H6 in w1 / w6 / x2.
- w3 / w4: the construction check read the API_KEY-seeded field → refused after (a). §66.13.5 rule 10 / 7a ("a
  construction the compiler decides … moves nothing"): analyze invConstructDecided — a declaration's own clause
  whose fields are seeded from constant defaults no use site overrides (AConstruct now carries `decl`) and that folds
  true is omitted from Decl.invs (lower constructCheck). Core Decl.invReads (every clause's top fields) keeps
  check.scrml C7's owed-check oracle whole (it read Decl.invs before).
- probes: w1 w3 w4 w6 x2 CLEAN, no client leak; w1c..w6c unchanged; w2 leaks on base too (part write).
- tests re-pinned (the decided construction no longer runs a check): invariant-r1 H2 page, invariant-r2 leaks page +
  M1, invariant-write SECRET_TAG — each page now WRITES `v`; m02 default made a non-folding call; new test: a decided
  construction is admitted with no leak and no guard.
- committed 129c0f5ca (hook 58874 / 0 / 255 PASS).
- H7: analyze invLiveFns (before the typer → Tables.invLive): each function's body scanned once for a LIVE read
  (cell, `@.`, declared value / field, request / surface state, lifecycle element, mutable binding, query, foreign
  block, host function, unseen body), then a fixed point over the calls; useInvs refuses a use-site call of a named
  function of constants that reaches one — E-CONTRACT-003 PERMANENT, chain named. The keyword decides nothing: a
  `function` of constants reading nothing live is admitted (r2's INTERIM for it retired); still INTERIM: a built-in
  method / property, a call through a value. m3cell / chain / mutable let / `function` reading a cell → E-CONTRACT-003.
- M8: analyze invPartWriteTrapWhat — a local's part write (EAssignLocal, path non-empty, invValueWholeChecks > 0)
  is a trap site; x6/c1 → E-FILE-SCOPE-INIT-IN-CONSTRUCT; the same outside a construct clean. A cell write in an
  initializer is refused already (probe m8write).
- L9: lower hostReturnChecked — a host-backed function's return whose type holds invariants is wrapped in an
  InvariantValue (invDeepChecks) where it is returned (local, construction, write — the write's guard strips it via
  unconstructed). The server-return-in-a-local half filed OPEN in g-boot-invariant-boundaries-lints-s483.
- nit: lower invOwnerAt — an owner declared in another file names `lib.scrml:N`; print invCheckLabel: "on type Tok
  (lib.scrml:4; written at main.scrml:12)".
- SPEC §66.13.5 7a / 7b / When-it-is-checked / Status, §34 E-WRITE-INVARIANT-RT row; known-gaps: boundaries (r3 L9,
  server half open), derived-field (r3 H7), trapping-construct-init (M8 built).
- tests: slice-m4/invariant-r3-s483.test.js (H6 ×6, H7 ×5, M8 ×2, L9, nit); invariant-r2 M3 re-pinned (`function`
  admitted; `S.length` INTERIM); Chromium invariant-write-chromium-s483 "r3" (+4: w1 w3 w4 trap / land, h1 host).
  invariant slice set 195 / 0; Chromium file 18 / 0.
- hook attempt 1 timed out (shard 6, compile-scaling-fn-count-s480): hostReturnChecked scanned every function
  per call (O(calls × fns)). Now Tables.invHost (invHostFns, filled on the final tables) — one list read per call;
  invLiveFns: indexed (g.fnSyms), callers + BFS (linear), mutable bindings collected once, skipped when no
  declaration has an invariant. compile-scaling s477 / s480, recursive-enum-perf pass.
- hook attempts 2-5: one group-1 shard timed out each time. Found by bisecting the shard file list:
  slice-m4/shared-graph-walks-s480.test.js hung ALONE — F2's `<host src>` `dg() -> D0` over a 16-wide,
  8-deep shared struct graph: invHostFns → invDeepChecks walked all 16^8 PATHS (no invariant anywhere).
  analyze invInvTypes (the types whose values hold an invariant at some depth, a fixed point, linear) prunes
  invDeepAt — a subtree that reaches no invariant is not entered (persist / whole writes / part writes / host
  returns). shared-graph-walks + the invariant set + server-runtime: 187 / 0; Chromium 18 / 0.
