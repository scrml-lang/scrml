# s475-boot-pending-cells — progress (append-only)

Slice S4 of the bootstrap §13.9 pending-cells plan: a `(not to T)` program cell with a waiting
initializer is a pending cell (§13.9.2: a plain cell initialized to `not` plus a compiler-written
`<request>`), lowered onto Core View.Request with `state: not`.

- 2026-11-06T14:23Z — start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-a5e40650816b67798,
  base origin/main 19fc95a24 + #1783 (s475-boot-lifecycle-reads, not yet merged: its branch
  origin/worktree-agent-a43fcb2c19bd8fa9a merged in). bun install + pretest OK.
- 2026-11-06T16:30Z — built: analyze `pendingCells` (after placement) + `pendFiles` desugar (decl `=not` + ARequest.pend
  request) + re-run in analyzeSources; `resolvePending`; lower requestView `state: not`/`handle: not`; checkWrite
  settle exemption (`pendingSettle`) + locked pending T→T′ (`pendingField`); C-R1 one Write per control path;
  `let` on a pending tape; reset/reset-on on a pending cell refused (INTERIM, new gap g-boot-pending-cell-reset-unbuilt-s475);
  waitFix second fix for cell initializers; lifeReadMsg "in flight" limb; derived-lifecycle message PERMANENT (ruling 7).
  Tests: slice-m4/pending-cells-s475.test.js (27), request.core C-R1 per path (+2), S4 pin flipped.
- WIP commit landed after hook memory-ceiling kills at SCRML_HOOK_SHARDS=4/16/24 (slice group shards ~3.1 GB on a
  loaded host) — passed at SCRML_HOOK_SHARDS=48 SCRML_HOOK_SHARD_TIMEOUT_S=2400. One kill run also hit a load-flaky
  impl#1 test (integration/dev-db-no-side-file, 30 s timeout) that passes alone (26/26).
- Corpus sweep (5262 tracked .scrml, base = origin/main bd22fed5f tree vs head): 5261 identical, 1 differs —
  docs/changes/s473-spec-coverage/probes/part-2/s13/pend1.scrml: base [E-BOOTSTRAP-UNSUPPORTED] → head clean.
- CI gates: spec-coverage-check 0 violations (totals STALE = bot-owned), severity current, s34-census PASS,
  types-gate OK (unchanged), e2e-render-map 259 pass, spec-coverage-check test 22 pass.
- 2026-11-06T17:20Z — merged origin/main bd22fed5f+. Gaps: g-boot-pending-cells-unbuilt-s473 + g-boot-value-server-call-fix-names-refused-forms-s473
  resolved; NEW g-boot-pending-cell-reset-unbuilt-s475 (open). Coverage rows §13.7 (second fix), §13.9/13.9.1, 13.9.2, 13.9.3,
  13.9.4, 13.9.5, 13.9.6, 13.9.7, §66.11.6 updated. Slices: lints 0; m1 159, m2 619, m3 60, m4 5438, codec 166, m1-lowered 159 — 0 fail.
  bootstrap-conformance --json base vs head: counts identical (PASS 302 / FAIL 238 / NOT-TWINNED 685 / UNSUPPORTED 602), 0 verdict diffs.
- 2026-11-06T19:10Z — FIX ROUND r1 (adversarial review of #1796, FIX-FIRST). Merged origin/main ca31847a8 (no self-host-v2
  changes; known-gaps auto-resolved by the generated-merge driver, 0 markers). F1: a `(not to T)` cell's locked initializer
  calling a non-server function is derived again (`lifeDerived`/`opaqueCall`); `let` + such a call refused by name
  (E-BOOTSTRAP-UNSUPPORTED, new gap g-boot-pending-cell-opaque-call-s475, INTERIM). F2 BUILT: an author handled waiting write
  into a pending cell is admitted (`checkWrite`/`handledWait`, `Tables.waits` from the effect summary). F3: C-R1 `pathWrites`
  walks Counted heads; message "at most one per path". L1: file-scope/module pending cell refused by name (new gap
  g-boot-pending-cell-outside-program-s475). L2: E-ERROR-002 re-word only for the initializer's own call. Block-initializer
  wording fixed (parser refuses it). Tests: pending-cells 33 pass, request.core 22 pass.
- 2026-11-06T21:00Z — FIX ROUND r2 (re-review of #1796 at b093477e8). origin/main ca31847a8 already merged (#1794/#1797
  not on main yet). N1: `exprReads` walks a handling form's BLOCK arms (blocksReads over exprBlocks) — the shared
  walker under valueReads / cellReads / derivedCycles / field modes; a call's callee is walked too; `calledSyms`
  walks arm blocks (defensive — a waiting call in an arm is refused today). N2 BUILT: newest-started write or load of
  a pending cell wins (PA reading ⚑) — runtime `Cell.pend` record set by a stateless Request, `rt.suspendClaim`
  (print suspendJs claims the pending cells a continuation writes), `pendWrite` in Cell.set; READ loads aborted
  through Task.onAbort. Cosmetic: E-DERIVED-WRITE names reads + calls (readsPhrase / followsPhrase).
