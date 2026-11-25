# s482-seed-timing — progress

Lane: seed timing for Q12 (cells declared outside the body) and Q13 (locked field = constant seeded at
the instance's mount unless it reads a cell). Bootstrap-only (compiler/self-host-v2/), SPEC + gaps;
compiler/src/ frozen (S471). Base: origin/main 52eb72585 (contains #2096, model (c)).
Brief: ~/.cache/scrml/review/s482-briefs/seed-timing.md. Probes / harness:
~/.cache/scrml/review/s482-seed-timing/ (base worktree `base/` at 52eb72585).

## Rulings (verbatim, scrml-support/user-voice-scrml.md)

- Q12 — ruling:user-voice-scrml.md-S482-outside-cell-seed-time (~:22501): rec *"before the body, in
  link order"* — the same as the library's plain `let` / `const` initializers, even when nothing reads
  the cell; §66.6.4's lazy materialization keeps governing a declaration's shared instance, not
  top-level library cells. Owner: *"yes, before the body"*.
- Q13 — ruling:user-voice-scrml.md-S482-locked-field-derived (~:22506): *"a locked field is derived
  exactly when its initializer reads a cell, directly or through any function it calls, at any depth.
  Otherwise it's a constant, whose initializer is a seed computed at its place, meaning the instance's
  mount."* Owner: *"yes, derived only when it reads a cell"*.
- Model (c) (~:22539), rider Q13: *"a locked-field initializer that WRITES is E-VALUE-WRITES-STATE; the
  derived-iff-reads-a-cell half stands."* Owner: *"yes, adopt (c) with the riders"*.
- PRINCIPLE (S482): corpus usage is not evidence of what the language should do.

## Item A — what "the instance's mount" means for the #2096 r2 MED-A probes

z01 / z02 / z03 (`~/.cache/scrml/review/s482-2096-r2rev/p/`): the component INSTANCE `<card/>` /
`<cp/>` stands directly in the program body — an unconditional mount, which has a place in the body
(§7.6 R1: *"Every declaration, statement, display, attribute value and unconditional mount has one
place in the body. A cell's seed runs at its place."*). Only the DISPLAY of `v`
(`<b if=(@show)>${v}</b>`) is conditional. The instance mounts at load, when `n` is 1, so Q13's
*"a seed computed at its place, meaning the instance's mount"* gives `v` = 1 + 1 = **2**, and it is
never recomputed (a constant, §66.9 rule 1). The reviewer's "expected 2" is right.

The brief's alternative — an instance that is itself under `if=` — is a different shape: §66.7.6 rule
5 (O59) *"A conditionally-mounted instance, and an instance in an `<each>` row, gets its record AT
MOUNT, and a fresh record on each remount."* There the mount is when the branch shows, after
`n = 10`, so **11** is correct (probe z04). Same for an `<each>` row added by the click (z06 row 2:
11; row 1, mounted at load: 2).

Base (52eb72585) Chromium: z01 11, z02 11, z03 11 (wrong); z04 11 (right); z05 (displayed at load) 2;
z06 rows `11 11` (row 1 wrong); z07 (derived control, reads `@m`) 11 (right); z08 (a locked PROGRAM
cell after `n = 5`, before `n = 7`) 11 (ruling: 6, its place); z09 6; z10 (prop default `n + 1`) 11.

## Steps

- [x] A. Q13 (e82ba6ffb): print.scrml `constSeedField` / `readsCellReach` (fail closed) → `rt.seeded`
      (attribute default `rt.propSeed`), held to the mount (`liveSeedDecl` / `rt.seedAll`); locked program
      cell placed at its declaration (lower `initView` unless it names `@x`; `heldFields`); analyze
      `bodyCells` derived = `lockedDerived`. Chromium head: z01/z02/z03/z10 2, z06 `2 11`, z08 6, z04 11, z07 11.
      seed-reach-s482.test.js: `<d:int=(k + 0)/>` before `k` is now a constant seed at its place →
      E-SCOPE-001 at the seed (was: at the read); derived twins read `@m`.
- [x] B. Q12 (6a5ce45e1): CoreProgram.outer (lower `outerCells`, place by node id); print
      `constsWithOuter` / `outerLive` / `liveDecls`; every outer declaration printed ahead of the file-scope
      section. Chromium head: b1 1 (base 5), b2 trap at load (base none), b3 1 (5), b5 1 (5).
- [x] C. Nothing left to lift: #2096 deleted the construct seed enumeration; every #2082 r3 `xf/` probe
      (21 + ctl) is refused at the library's writing seed (E-VALUE-WRITES-STATE) on base and head alike
      (x-base.txt / x-head.txt identical); non-writing twins c1/c2 compile (z 5 → 1, k 5).
- [x] D. gaps: g-spec-imported-cell-seed-time-s482, g-spec-locked-field-acting-init-place-s482 resolved;
      new g-boot-use-site-value-seed-s482 (LOW, INTERIM, capable alternative stated);
      new g-boot-instance-mount-reach-later-binding-s482 (MED, pre-existing silent wrong value on base,
      probes y03/y04 — out of scope here, filed).
- [x] E. LOW-A: the fail-closed E-FILE-SCOPE-INIT-IN-CONSTRUCT message ("holds … whose reads the bootstrap
      does not follow here, and a `<request>` inside … writes state before it — so the bootstrap fails
      closed"); refusal kept. value-no-write-s482.test.js updated.
- [x] F. Not seed timing: the E-SCOPE-001 sentence "an `<effect>` / `<request>` (they run after the mount)"
      is about when effects/requests run (Q6 settle) — left for the Q6 lane.
- [x] SPEC: §7.6 rule (b) Open struck → outside-cell sentence; §7.6 R1; §6.15 item 1; §66.6.4 exception;
      §66.9 rules 1 and 3; §66.7.6 rule 5 Open struck. Direction-of-change notes in place.

## Gates (head 6a5ce45e1 code; base 52eb72585)

- pre-commit (full hook incl. slices): PASS on each commit (58303 pass / 0 fail)
- pretest: exit 0
- bootstrap-conformance --json: PASS 850 / FAIL 3 / CRASH 0 on both; 0 per-case bucket/emitted diffs
- corpus differential (2976 files): 0 newly rejected, 0 newly accepted, 0 code moves, 1 output diff
  (conformance/cases/own-value-type/unproven-annotation-pos: `<v:int=(mk())/>` / `<w:int=(six() + 1)/>`
  locked program cells now seeds at their place — values 5 / 7 unchanged, case PASS on both)
- probe re-run, 461 probes (s482-value-no-write 389 set + #2096 r2rev p/ + q/): 386 same refusal,
  75 same value, 0 changes; lane probes: value changes listed in the PR body
- Chromium: seed-timing-chromium-s482 13/13; construct-init-place, effect-deps-mount, rcdata-holes,
  rcdata-init-place: all pass (46 total)
- s34-census --check-new --base 52eb72585 PASS; types-gate --check OK (182 unchanged); snippet-gate
  120/0/9 spec-ahead; e2e-render-map 259/0; host-global-scan --check 1/2 exit 0, 2/2 exit 0;
  claim-gate 0 failed; delta-lint PASS; retired-forms gate: not on main (N/A)

## r1 — #2105 review fix round (S482)

Brief: ~/.cache/scrml/review/s482-briefs/fix-2105-r1.md; review ~/.cache/scrml/review/s482-2105/review.md.

- 0. merged origin/main (b65149386) — clean.
- 1. HIGH-1 (security): outer cells take the S481 server-only classification — print.scrml `outerPlaced` (in `shakeProgram`, so both printers judge one program) runs `serverInitsExposing` on the program with each live outer cell as a binding whose initializer is its seed (`outerAsConsts`; `constReads` counts a shared-instance reference as a read — walk.scrml `sharedRefOf`); a server-only one is that binding in the printed program (no client file holds it; print-server `serverConsts` runs it). `serverInitsRound` judges "client reads" from the client's own code (largest set) — closes the pre-existing plain-const t6c leak. `runsK`: an outer seed is placed even when it does nothing (t11). `outerRefusal`: a server-only seed reading a cell → E-BOOTSTRAP-UNSUPPORTED (g-boot-outer-cell-server-seed-reads-cell-s482).
- 2. MED-1 + 4. MED-2: analyze `outerSeedReachDiags` — an outer seed reaching a later link-order binding, any body binding, or (on demand, `outerCellOf`) a later outer cell whose seed does → E-SCOPE-001. Gap g-spec-imported-cell-seed-time-s482 residue made exact.
- 3. LOW-1 → built: `nodeGivenSeeds` / `rt.givenSeed` / `rt.propSeed(…, dfltSeed)`; g-boot-use-site-value-seed-s482 resolved (re-rated MED first).
- 5. LOW-2: E-DERIVED-ENGINE-NO-RULES no longer calls a constant derived (wording split on `cellReads`; lockedWhat needs the tables, which that pass precedes).
- 6. g-boot-body-unread-cell-server-only-s482 filed (HIGH, ruling-gated, fork (a)/(b)/(c), rec (a)).
- Pins: compiler/self-host-v2/slice-m4/outer-cell-place-s482.test.js.

### r1 gates (head 06e24d2d7 vs base origin/main b65149386)

| gate | result |
|---|---|
| pre-commit (both r1 commits) | PASS (58320 pass / 0 fail; one earlier attempt timed out in a beforeAll under load 12–21 from other lanes, re-run at lower load) |
| pretest | exit 0 |
| bootstrap-conformance --json | PASS 851 / FAIL 3 / CRASH 0, head and base; reports identical but for timings |
| changed slices (outer-cell-place, seed-reach, body-run-order, client-roots, registry-client, value-no-write, server-only-stdlib) | 173 pass / 0 fail |
| Chromium SCRML_BROWSER_TESTS=1: seed-timing 13, construct-init-place 6, effect-deps-mount 5, rcdata-holes 5, rcdata-init-place 17, valuesem 4 | all pass |
| 461-probe set | 0 value changes vs base and vs fc3097098 |
| review + r1 probes (133) | every change vs base listed in the r1 report with its basis |
| corpus differential (2977 files) | 0 newly rejected / accepted / code changes; 1 client output diff (own-value-type/unproven-annotation-pos — the lane's, Q13); 0 server diffs; new client identifiers vs base: only that file's `seeded hold seed` |
| s34-census --check-new --base origin/main | PASS |
| types-gate --check | OK, 182 unchanged |
| host-global-scan 1/2, 2/2 | 0 violations, exit 0 |
| e2e-render-map | 259 pass / 0 fail |

## r2 — #2105 r1 review fix round (S482)

Brief: ~/.cache/scrml/review/s482-briefs/fix-2105-r2.md; review ~/.cache/scrml/review/s482-2105-r1rev/review.md. Probes + harness: ~/.cache/scrml/review/s482-2105-r2/ (`h/run.sh`, `h/all.sh`, `p/r2/` new probes). Base = origin/main 1e8a11758.

- 0. merged origin/main (#2106 Q6 hold): main deleted constructReadDiags (our r2 LOW-A message edit inside it dropped with it); SPEC §7.6 body-sequence paragraph kept both sides (main's struck effect/request sentence). Hold/seed tests re-run (hold-body, effect-deps-mount, handler-reach slices + hold-body Chromium): pass.
- 1. HIGH-A: print.scrml `readsCellReach` — in an expression root, a `Local` that is not a file-scope binding (findConst / a `<db>` load value) counts as a cell read, fail closed (`freeLocalRead`); a function body's own bindings are not judged so. Audit: its other callers — `constSeedField` (Q13 locked fields / program cells; field and prop-default initializers see only file-scope bindings and places, so only a lambda parameter written there changes: derived, as on base) and `outerRefusal` (fail closed the same way). Chromium w01/w02/w04/w08/w10/w11/w12 = base; a13 2; w20 (row constant, no row item) seeded at each row's mount (2 2, a later row 11).
- 2. MED-A: analyze `outerSeedReachDiags` places the program's own cells after every outside seed; `codeReach` finds them (direct, and a function's `c:` atom); `fileScopePass` runs that judgment for a program with no file-scope binding too (`anyOuterCell`). e12 / e12c / e12e / e12f → E-SCOPE-001; e12b / e12d controls unchanged.
- 3. LOW-A, 4. LOW-B, 5. INFO-1: SPEC §7.6 R1 direction text per shape; circular-server-only provenance (i3d, j4); gap g-boot-server-init-writes-client-binding-s482 (W- follow-up, not built).
- 6. INFO-2: g-boot-body-unread-cell-server-only-s482 + o2b, o9. o9 NOT fixed here: its plain-`let` twin (p/r2/o9-let) ships identically on base and head — the shared classification counts a client write as a use (constReads); an outer-only fix would split one shape's two spellings. Fix for both recorded in the gap.

### r2 gates (head vs base origin/main 1e8a11758)

| gate | result |
|---|---|
| pre-commit (merge, code, docs) | PASS (58367 pass / 0 fail) |
| pre-push | PASS (first attempt: shard 1 memory kill without SCRML_HOOK_SHARD_MEM_MB; re-run with it) |
| pretest | exit 0 |
| bootstrap-conformance --json | head = base: PASS 851 / FAIL 3 / NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0; 0 per-case diffs (1973) |
| slices (outer-cell-place, client-roots, registry-client, seed-reach, value-no-write, body-run-order, hold-body ×2, effect-deps-mount, handler-reach) | 219 pass / 0 fail / 5 skip (registry-client env-gated) |
| Chromium SCRML_BROWSER_TESTS=1 (seed-timing, use-site-row NEW, hold-body, construct-init-place, effect-deps-mount, rcdata-holes, rcdata-init-place) | 62 pass / 0 fail |
| r1rev harness, 159 probes (u61 ×63, x/, fix/, r0/, e/, w/, r2/) head vs base | u61 identical (client-zz 1 line both); every other change listed in the r2 report with its ruling basis |
| corpus differential (2977) | 0 newly rejected / accepted / code changes; 1 client diff (own-value-type/unproven-annotation-pos, Q13 names); 0 server diffs |
| s34-census --check-new --base 1e8a11758 | PASS |
| types-gate --check | OK, 182 unchanged |
| host-global-scan 1/2, 2/2 | 0 violations (pre-existing compile throws only) |
| e2e-render-map | 259 pass / 0 fail |
