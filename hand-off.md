# scrml — Session 471 (bryan · theRog) — WRAPPED

> S471 ran 2026-10-27 on theRog, Profile A, as one long session across compactions. S470's hand-off is at `handOffs/hand-off-470.md`. **Rotate this file to `handOffs/hand-off-471.md` at the next boot.** Board: `scrml-support/handOffs/active-sessions/S471-bryan.md` (WRAPPED). Rulings verbatim: `scrml-support/user-voice-scrml.md` (S471 entries).

## 0. The policy change that shapes everything next
bryan (S471): impl#1 has no users; Peter's existing impl#1 work is fine as is. **New rule, replacing S435's "bootstrap or security":** impl#1 work ONLY for (a) what building or testing the bootstrap needs, (b) breakage that blocks flogence or bryan's tools, (c) Peter's lane. **No impl#1 security lanes.** Open impl#1 security gaps are tagged `defer=impl1-s471-policy`. Lanes already in flight could finish; if one fails review, it sits or lands as a partial fix (that is how #1587 and #1590 landed). Ruling 8 (make `windows` a required check) is **DROPPED**. Memory: `feedback_check_ts_policy_at_dispatch.md`.

The next sessions' centre of gravity is the **bootstrap** (`compiler/self-host-v2/`).

## 1. What landed (16 PRs, excluding FACTS-bot regens)
Every code PR got an S239 adversarial review on a frozen ref. Review markers are in `docs/pr-reviews.md` (#1599).

**Bootstrap (impl#2)**
- #1588: `scrml:` stdlib imports resolve, and an unresolved import is a named refusal (E-IMPORT rows). The stdlib's `<program>` wrapper is dropped (ruled). LAND-WITH-FOLLOWUPS.
- #1593: `defer` in a loop body; deferred-body refusals by name. Two stale HIGH gaps resolved.
- #1594: parser batch. A body can hold several display literals; runaway recovery; item-body `let` refusals. One fix round, then LAND-WITH-FOLLOWUPS.
- #1597: a loop body may wait for the server (§49.12.7), and `lin` linear types (§35). LAND-WITH-FOLLOWUPS: four LOW follow-ups were filed.

**impl#1 (both already in flight before the policy change)**
- #1587: null/undefined and `==` are refused inside `!{}` arms (§42.1). LAND-PARTIAL; the residue is deferred.
- #1590: the imported-alias enum-read refusal fires on Windows, because paths are now keyed canonically. LAND-PARTIAL.

**SPEC**
- #1585: the eight S470 owner rulings:
  - §6.7.4 helper cancellation
  - §51.7.1 hook newest-run-wins
  - §13.8 `safeCallAsync`, the Promise combinators, and `Promise.resolve` plus the constructors refused (ruled)
  - `.variant`
  - §19.4.3 / §34 E-ERROR-014 / E-TRY-NOT-IN-SCRML: PA-drafted, for bryan's veto on read
- #1592: `lift` in a defer body is E-DEFER-CONTROL-FLOW, and an HTML comment does not break an if-chain.
- #1596: dpa-075 F1 floor:
  - `ref=`
  - host-owned subtree
  - mount handle
  - Appendix D globals
  - `lin` annotation
  - three SPEC defects (including the undefined `leafletMap`)

**Docs / ledger**
- #1584: boot housekeeping.
- #1589: dpa-075 banked.
- #1599: consolidation:
  - the 67 bootstrap gap-sweep verdicts (8 FIXED resolved, 7 NARROWED, 3 CANNOT-REPRO), plus `docs/changes/s471-bootstrap-gap-sweep/SWEEP.md` and 102 repros
  - the lin gap resolved, the loop-wait gap narrowed, 7 new gaps
  - dpa-075 complete and ratified; dpa-076 and dpa-077 banked
  - 12 review markers
  - three stale "bootstrap has no lin" claims removed from `docs/lin.md`

**Gap rollup at wrap:** HIGH 262 · MED 700 · LOW 535 (boot: 262/702/528).

## 2. dpa-075, browser host APIs: fully ruled
Deep-dive: `scrml-support/docs/deep-dives/browser-host-apis-dpa-075-2026-10-27.md`. Measurement: `…/dpa-075-evidence/f3-measurement-2026-10-27.md`.
- 56.4% of 2,070 host crossings consume a typed value.
- The E-DECL-TYPE-UNPROVEN wrapper tax is 0%; the broad E annotation tax is 18.2%.

Rulings:
- **F0:** accept. The stdlib host bridge is option A: built-in host intrinsics. bryan is "curious about C regardless".
- **F1:** all five floor items. SPEC landed in #1596.
- **F2:** reject.
- **F3:** B, a typed host-binding declaration element. It is **undesigned**; a MED gap is filed. It needs a design lane.
- **F4:** sanctioned, plus a lint later.
- **F5:** hold.
- **F6:** no token. The CSP-capabilities item is banked as dpa-077.
- **F7:** a separate item, banked as dpa-076 (the stdlib's platform/browser layer).

## 3. Owner questions open (with PA recommendations)
1. **Stray `;` after a closer-delimited item** (`"a";`, a markup child, `let <x/>`) in a code-default body. Gap `g-spec-stray-semicolon-after-closer-item-s471` (LOW). It stays refused for now. **Rec:** keep refusing, and add a §7.2.2 sentence saying so. Accepting it would be a one-way door.
2. **`<db>` body mode** in the bootstrap: what declarations a `<db>` body admits. Today it is one named E-BOOTSTRAP-UNSUPPORTED (`g-bootstrap-let-decl-in-db-channel-body-refused-s469`, narrowed). **Rec:** design it in the same pass as the client read semantics of `<db>` state (question 3).
3. **Client read semantics for `<db>` state.** Still open from mid-session. **Rec:** run a short design pass before any bootstrap `<db>` lane.

## 4. Next lanes (priority order)
1. **Bootstrap import/export visibility enforcement** (`g-boot-flat-link-namespace-s471`). The link stage still treats the namespace as flat. Land this BEFORE any stdlib port, or ports silently see non-exported names.
2. **Bootstrap `import:host` + the first stdlib port** (`md`, `math`), with the `<program>` wrapper dropped. Gap: `g-boot-no-host-bridge-s471`. The SPEC widening is in #1596.
3. **Design lane: the F3 typed host-binding declaration element.** Do the design first; no implementation before it.
4. **Two stale conformance cases:**
   - `control-flow/ctrl-004-else-on-state-opener-pos`
   - `defer/deferred-server-call-completes`
5. **Bootstrap MED fail-opens still open after the sweep:**
   - `gate-reach-live-dom-reading`
   - `gate-external-form-owner-control`
   - `style-attr-bound-value-unguarded`

   These are bootstrap security work, so the policy allows them.
6. The four LOW lin/loop follow-ups from #1597's review.
7. The slice-test /tmp leak (MED gap, filed in #1599). Slice tests leave `slice-m1-*`, `s469d*`, `u1c-server*` and `self-host-v2-bundle*` dirs; 3G had piled up in /tmp (a RAM tmpfs) this session.

**How far along the bootstrap is** (asked this session): the M1–M4 slices and the codec are green in CI, all four HIGH sweep gaps are FIXED, and 45 sweep gaps remain open. Items 1–2 above are the step that turns it into something bryan can write real programs against, with the stdlib reachable.

## 5. Lessons this session
- **The Claude temp quota (EDQUOT) filled twice.** Tool output went missing silently. Cause: leaked slice-test dirs plus old scratchpads. Fix: write long outputs to `~/.cache/scrml-pa/<session>/`, and clear stale test dirs older than 60 min (bryan authorized this).
- **A landing worktree needs `samples/compilation-tests/dist`.** Copy it in, or run `scripts/compile-test-samples.sh`; otherwise the pre-push suite fails one §3 test.
- **The merge driver's "REGENERATION REQUIRED" banner can survive into a PR.** In #1596 it was left at SPEC-INDEX.md line 1 and failed the conflict-marker gate. Delete it and regenerate.
- **Flakes seen on CI:**
  - `slice-m2/typer-s460.test.js` "S460 at runtime" runs on bun's 5 s default and took 5.7 s on CI. Not filed; give it an explicit timeout if it recurs.
  - The Windows job's `audit-timer-and-freeze.test.js:133` chained-temporal test failed on timing; it is not a path bug.
- **Check the gap ledger for duplicates before filing.** #1584 filed one and had to fold it into the S470 entry.

## 6. Housekeeping at wrap
- **Worktrees:** 36 landed or disposable ones removed (all `rev-*`, all `land-*`, `wrap-s470`, and the landed agent trees). Sixteen are kept, all pre-S471, holding unlanded or dirty work:
  - `s468-rulings-spec` is PR #1448, still OPEN.
  - Merged but with uncommitted changes, kept for inspection:
    - `s468-generated-merge-driver`
    - `s468-hook-sharding`
    - `s468-identity-arg-refusal`
    - `s468-failable-alias-and-match` (8 dirty files)
  - Unlanded, with no PR:
    - `s468-rulings-spec-r2`
    - `s469-hook-sharding`
    - `s469-dm2-{kickstarter,extjs,lin}`
    - `s469-ci-speedup`
    - `s469-1445-up`
    - five `worktree-agent-*` trees

  Triage them at the next boot. Under the S471 policy most impl#1 ones can likely be dropped.
- **Open PRs:**
  - #1448 (S468 §19.9.9.8 SPEC, CPS split callees)
  - #580 (old, §38.1 nested `<program>`)
- **Maps:** refreshed at wrap, with bootstrap routing rows added. Five or more lanes had reported the map not load-bearing for `compiler/self-host-v2/`.
- **Review debt:** S471's PRs all carry markers. The backfill for #1431–#1437 (S467–S468) is still owed.
- **Inbox:** the 3 S454 messages are addressed to Peter; they are his lane.
