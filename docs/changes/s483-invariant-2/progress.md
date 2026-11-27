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
