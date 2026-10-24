# s469-boot-tape-grants-2 — final-review follow-ups of #1528 (progress)

Branch `s469-boot-tape-grants-2` (PR #1530), cut from `origin/s469-boot-tape-grants` (`772f6726b`, #1528, since
merged). LIMB: BOOTSTRAP (`compiler/self-host-v2/`). impl#1 untouched.
Review probes: `~/.cache/scrml/review/boot-tape-r2/probe/`. Lane scratch: `~/.cache/scrml/lanes/boot-tape-grants-2/`.

Gap: `g-bootstrap-enum-payload-tape-not-a-tape-position-s469` — RESOLVED BY RULING (S469 "Not a tape position").

## Log

- [x] Read the round-1 progress.md, SPEC §66.11–§66.12 (§66.12.6 whole), the probes.
- [x] ~~**F1 (HIGH)** — refuse an enum payload tape fail-closed~~ — landed in commit 1, then **REMOVED** after the
      owner's ruling on Q8 (S469, bryan: *"Not a tape position"* — payloads are values, grants do not apply inside an
      enum payload, and a whole write of such an enum, cross-tab sync included, is not judged against the payload
      tape's grants). `payloadTapeWrites` / `payloadTapeKept`, `TapeHit.payload`, the payload refusal message, the
      tape check on `wholeFieldWrite`'s graph branch, `reset-on=`'s tape check on graph cells and Core's
      Transition tape check are all reverted. `structTapeWrites` / `structTapeKept` do not walk an enum, a struct
      in a payload included. A struct-typed cell or struct field with a `replace`-less tape field stays judged
      (#1528; regression guards in `tape-grants-r3.test.js`). SPEC §66.12.6 rule 1 records the ruling.
- [x] **F2 (MED)** — the scan is structural: `slice-m4/grant-scan.js` (`grantReadsOutsideReader`) works on tokens and
      refuses, outside the reader's range, any member read of `grants` that is not a whole reader-call argument or
      a whole `grants:` slot value, any `grants` destructure / bare name, any `.replace` / `.edits` read, any
      `GrantSet` annotation, any held / read GrantSet-returning call, any `["grants"]` bracket key. The two
      GrantSet constructions outside it moved in (`fieldGrantSet`, `fieldDefGrants`); `fieldAtWrite`'s "is a tape"
      test uses `seqElem`. The test calls the real scan on the real source (no allow-list) and on every planted
      spelling + an end-to-end plant at the `persist="local"` admission — each must fail. Marker uniqueness
      (review LOW-2): `1f5ababd0`.
- [x] **MED-1 (review of #1530)** — the TYPE-derived grants are inside the reader too. Moved into the range:
      `resolveSeqType`, `shrinkOf`, `shrinkWords`, `shrinkList`, `seqReplace`, `typeEdits`, `seqEdits`,
      `addEditOnce`, `seqShrinkEdit`, `seqAtEdit`, `subFieldEdits`, `fixedSeq`, `anySeqGrants`, `growsFixed`,
      `isFixedLength`, `seqFixed` (pure moves). The scan now also refuses outside it: `.positionsWritable` /
      `.shrink` reads (a `shrink:` slot copy allowed), naming `SeqGrants`, a held SeqGrants-returning call (allowed
      whole in `.Seq(…)`), and (R7) any use of a `.Seq(…, grants: g)` / `.TSeq(…, grants: gs)` pattern binder in
      its arm other than a whole reader-call argument — so `g.at` / `g.length` / `gs.indexOf(…)` are covered
      without refusing every unrelated `.at`. 7 MED-1 must-fail controls and 4 allowed shapes in the test.
- [x] **F3 (LOW)** — Core accepts `@o = { ...@o, inner: { ys: @o.inner.ys } }` and the instance form: `keepKey`
      reads `Read(LocalPath(before, p))` through the snapshot Let as the place it snapshots; `boundValue` follows a
      once-bound Local (one Let, no Assign) to its init (the Commit form). Controls: an Assigned snapshot, a
      snapshot of another place → C3.
- [x] **F4 (LOW)** — identity overrides are keeps: `resolveSpread` / `resolveInstanceSpread` skip an override whose
      value is the field's own place (`isOwnValue`); `structTapeWrites` returns no hit for a value that IS the place;
      Core `structTapeKept` keeps every tape of a value that reads the written place.
- [x] Acceptance (`acceptance/grants/`): `enum-payload-ungranted-accepted` (the ruling: a whole write,
      `persist="local"` and `reset` over an append-only payload tape — runs), `spread-override-nested-keep`,
      `spread-identity-{tape,struct}` (run). The four `neg-enum-payload-*` cases are deleted. The instance form
      is not an acceptance case (the probe does not twin a `<doc>` outside `<program>`); it is in
      `tape-grants-r3.test.js`.
- [x] Slice tests: `slice-m4/tape-grants-r3.test.js` (ruling + guards / F3 / F4), `tape-write-forms.test.js` (scan).
- [x] Commit 1 (`1ca277fd4`); merged origin/main once #1528 landed (`4e1983534`); CI round 1 all 0.
- [x] Round 2 (after the ruling): F1 removed, SPEC sentence + `regen-spec-index`, gap resolved by ruling,
      `state.ts --write`, MED-1.

## Before / after

| F | Before (`772f6726b`) | After |
|---|---|---|
| F1 | enum payload tapes not judged (0 diagnostics) | unchanged BY RULING ("Not a tape position"); now pinned by tests + SPEC |
| F2 | 7 planted spellings scored 0 hits; the e2e helper plant passed the test | every planted spelling + the e2e plant reported by the real scan; real source: 0 |
| MED-1 | type-derived grant reads (`g.at`, `g.positionsWritable`, `gs.indexOf("replace")`) outside the reader unscanned | moved into the reader; the scan refuses them outside it |
| F3 | `nestSpreadInnerKeep`, `instSpreadKeep`: analyze clean, checkCore raw `C3: … o.inner.ys` | analyze clean, checkCore `[]`; the program runs (`u:2`) |
| F4 | `cellSpreadKeepXs`, `nestSpreadInnerSelf`, `instSpreadSelf`: E-WRITE-NOT-GRANTED | clean in both; runs |

## Owner questions (carried from round 1; Q8 / Q9 answered by the S469 ruling and removed)

1. `reset(@b)` / `reset-on=` of a struct with a `replace`-less tape field — static refusal or run-time check? (Rec: static.)
2. Call-site subset code (direction ruled S435 "type"; the code is not). (Rec: E-WRITE-NOT-GRANTED.)
3. Fresh-value arguments (`take([])`, `take(mk())`) are not subset-checked — confirm.
4. A genuine replace's tape field written with a classifiable shape is judged as a `replace` — confirm.
5. Persist restore / cross-tab sync is a restore, not a program write (out of rule 4's "server reload") — confirm.
6. **Tape elements (the review's note):** replacing a tape of structs (`@gs = [...]`, `Row[free, append, replace]`
   with `Row = { ys: int[free, append] }`) is the outer tape's write; it compiles clean today, and the elements'
   own tape fields are NOT judged. Does a `replace` of the outer tape "replace" each element's tape field (so
   `ys` needs `replace` too), or is a new element a fresh value? Rec: a fresh value — an element is a value of
   the outer tape (the same reading the S469 payload ruling gives an enum payload), and judging the inner fields
   would make a tape of append-only logs impossible to `replace` at all.
7. `const` / parameter rebinding of a tape reports both E-ASSIGN-CONST and E-WRITE-NOT-GRANTED — acceptable?
8. **(F3) the snapshot keep.** `@o = { ...@o, inner: { ys: @o.inner.ys } }` keeps `ys` as it was BEFORE the
   statement (strict snapshot, S440). If another override's call wrote `ys` in between (not expressible for an
   append-only sub-field tape today: a sub-field tape edit is E-BOOTSTRAP-UNSUPPORTED), the keep would restore the
   old value. Confirm "kept" means "equal to the statement's snapshot".

## Residuals (stated)

- The scan is token-shaped, not a type checker: a read that never spells `grants` / `replace` / `edits` /
  `positionsWritable` / `shrink` / `GrantSet` / `SeqGrants`, never binds `grants:` in a pattern and never calls a
  grant-returning function (a computed key `f["gr" + "ants"]`, a host escape) is not seen. The bootstrap dialect
  has no reflection, so that takes deliberate host code. R7's arm end is "the next `.Variant` that starts a line"
  — the house match layout; a one-line multi-arm match would widen the checked span (more refusals, not fewer).
- Core's snapshot keep relies on once-bound Locals (one Let, no Assign) across the whole program; a Core that
  reused a Local sym across functions would lose the keep (fail closed: C3).
- An identity override of a field that is not writable at all (`{ ...@b, title: @b.title }` on a locked `title`)
  is now a no-op instead of a refusal.
