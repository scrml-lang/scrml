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
