# scrml — Session 481 (bryan · theRog) — WRAPPED

> S481 ran 2026-11-20 → 11-21. Profile A. Rotate this file to `handOffs/hand-off-481.md` at the next wrap. The S480 hand-off is `handOffs/hand-off-480.md`.
>
> - Board: `scrml-support/handOffs/active-sessions/S481-bryan.md`.
> - Rulings, verbatim: `scrml-support/user-voice-scrml.md` §S481 (five rulings, end of file). Brief rulings from there, never from this file.
> - Lane rules (carry forward unchanged): `handOffs/s480-lane-rules.md`.
> - Delta-log: [4049]–[4053].

## 0. Where things stand
- **Policy holds:** bootstrap only (`compiler/self-host-v2/`). impl#1 frozen except the ruled carve-outs: (1) `<endpoint>`; (2) CSS-url / URL attributes incl. `renders` / `fallback=`; (3) gate health; (4) `scrml fix` (`compiler/src/commands/`) for Track M.
- **Main at wrap:** c14273d44 (+ this wrap PR).
- **Bootstrap conformance on main:** PASS 767 / FAIL 3 / CRASH 0 (after #2042; S480 wrap 760 / 10). The 3 FAILs are explained in #2042: loop-007 (pins impl#1's newline boundary, kept by decision), w-assign-001 (`do…while` retired), defer/outside-function-when-body-neg (see §4).
- **Bootstrap-clean corpus:** 169 of 701 positive programs (was 15) after #2042's migration.
- **Lane cap 3** held all session; no OOM kill. One review probe hit 24 GB RSS (#2045 MED-1) — killed by pid; memory-unbounded probes now run under `systemd-run --user --scope -p MemoryMax=6G`.

## 1. In flight at wrap (pick these up first) — three open PRs, none landable yet
The session ended with three background agents stopped mid-task. Their work is saved on branches/worktrees; nothing was lost, but each needs a fresh agent.

1. **#2041 body run order** (branch `s481-body-run-order`, head **f8a1c7867**, worktree `.claude/worktrees/agent-a7bc7eed1f0a087ee` — keep).
   - History: r0 review FIX (HIGH: unread initializer leaked a server-only secret into the client) → r1 fixed → r1 re-review LAND-W-F/U with conditions (merge main, nested-place MED, nested-chain LOW) → r2 fixed all conditions (merge of main via the migration tool, nested places run where they stand, chain gaps at every level, 4 gaps filed).
   - **Next:** a FRESH r2 re-review. The one dispatched (`~/.cache/scrml/review/s481-2041-r2rev/`, head + base worktrees present) was stopped before writing `review.md` — remove those trees and re-dispatch (brief: same as the r1 re-review's, plus the merge-resolution check). Land on LAND / LAND-W-F/U; check the windows job.
   - **Owed after it lands (all RULED S481, build them as one follow-up lane):**
     - run-order-followups item 1: each seed computed at its place; records still created at construction; early read computes on demand — amends §66.7.6 rule 5 (b3 pin, ⚑ in §7.6.1/§40.8).
     - item 2: E-SCOPE-001 for a display/statement whose callee reaches a later-placed binding (measure corpus first).
     - nested-init-chain-comments item 1: refuse an acting file-scope initializer inside `if=` content / slot content / `<match>` (gap g-boot-nested-init-place-in-construct-s481) — newly-rejecting, 0 corpus.
     - item 2: `//` comments and `#{}` between if-chain members do not break the chain (gap g-spec-chain-comment-css-between-members-s481) — SPEC §17.1.1 sentence + bootstrap.
   - Records PR after it lands: flip g-spec-file-scope-unread-init-web-s481 and g-spec-body-render-order-free-s481 → resolved; g-spec-file-scope-init-vs-body-top-write-s481 → partial.
2. **#2045 `^{}` meta phases 0+1** (branch `s481-boot-meta`, remote head **b05c5d08c**, worktree `.claude/worktrees/agent-afbf784bd54b6b7fa` — keep).
   - Review (`~/.cache/scrml/review/s481-2045/review.md`): LAND-W-F/U, no HIGH; emit gate held on ~60 injection probes. MED-1 no size bound (24 GB RSS); MED-2 closures silently wrong; LOW-1..5.
   - **r1 fix round was stopped mid-way:** local commit **1a0f9ccfc** (budget, closures fail closed, LOW-1..5, 20 tests — NOT pushed) + uncommitted edits to `meta.scrml` / `meta-s481.test.js` (+59/-6). progress.md r1 section: only "final gates, PR body r1 section" unchecked. **Next:** a fresh agent finishes r1 in that worktree (inspect the WIP diff, commit through the hook, final gates incl. conformance ≥ 39 meta PASS, push, PR body r1), then a fresh S239 re-review. Memory-cap every allocation probe.
   - Aliasing confirmed value-semantic (§66.10 item 1) — interpreter right.
   - Phase 2 (runtime `meta.*`) is the next build after it lands (gap g-boot-meta-runtime-unbuilt-s481; Q7/Q11 in the design read).
3. **#2046 self-host off `while`** (branch `s481-selfhost-while`, head **df0b8c402**). 658 loops in 21 files to the INTERIM impl#1-compilable spelling (`for (; c; )`, top-check `for (;;) { if (!(c)) { break; } … }` when the head holds a string/template/regex — impl#1 mangles literals in a C-for head, gap g-impl1-c-for-head-template-and-string-literals-mangled-s470, silent `"0"` → `0`). E-LOOP-WHILE-RETIRED 457 → 4.
   - **Next:** a fresh S239 review — the one dispatched was stopped before writing `review.md` (`~/.cache/scrml/review/s481-2046/` base/head/repro trees present; remove and re-dispatch). Key risk to prove absent: any literal change in the impl#1-built bundle.
   - Follow-up: brace the 4 braceless `while` loops in `parse.scrml` (7271, 7276, 7283, 10297) in one commit; later rename pass `for (; c; )` → `for (cond)` once the bootstrap builds the bundle.

## 2. Rulings this session (verbatim in user-voice §S481)
1. `S481-body-run-order` — the program body runs once, top to bottom, in source order; every file-scope initializer runs, read or not; a `free` display reads in place (P1–P3).
2. `S481-meta-four` — runtime-block literal `reflect` compiles (§22.4.2); `meta.*` literal names only (INTERIM, capability-ledger IN-56), literal naming no cell = E-SCOPE-001; impl#1's `reflect` shape + `TypeInfo` (PERMANENT); compile-time eval = scrml interpreter, step-bounded (PERMANENT).
3. `S481-run-order-followups` — seed at its place (amends §66.7.6 r5); later-binding reach = E-SCOPE-001; "every initializer runs" = in some artifact (server-only stays out of the client).
4. `S481-nested-init-chain-comments` — refuse an acting initializer inside `if=`/slot/`<match>`; `//` and `#{}` don't break an if-chain.
- PA decisions (not owner-ruled, recorded in PR bodies): enum `reflect.fields` = empty tape (⚑ §22.5.4); self-host INTERIM loop spelling; `do…while`+`continue` refusal INTERIM (flag-variable rewrite owed); #2041 H1 server-only placement (later owner-ruled, item 3 above); corpus lane Qs (tutorial snippets wait for the floor to move; defer case rewrite; impl#1 false `when … from` warning not fixed — frozen).

## 3. Landed this session
- #2039 records (markers #2025 #2032–#2038; #2025 residue gaps; P1–P3 ruled).
- #2042 Track M step 2, corpus: 654 programs + 9 conformance sources to the `;`/`,` dialect (impl#1-safe subset); boot-clean 15 → 169 / 701; conformance FAIL 10 → 3; + PA test fix (fix-refuse-broken §7 asserted the pre-migration exit code).
- #2043 Track M step 2, self-host: `;`/`,` migration (bundle byte-identical) + `while` / `do…while` fix rules.
- Bot regens #2040 #2044 #2047. (#2025 and #2036 landed at S481 boot, from S480.)

## 4. Owed next (recommended order)
1. Fresh agents for §1.1–§1.3 (re-review #2041 r2; finish #2045 r1 then re-review; review #2046). Land each.
2. The run-order follow-up lane (§1.1 "owed after it lands").
3. `^{}` phase 2 (runtime meta).
4. Small: `defer/outside-function-when-body-neg` rewrite (keep the single E-DEFER-OUTSIDE-FUNCTION assertion, typed param, write-free `when` body); fix-s66 seed-guard comment (g-fix-seed-guard-comment-s481); the INTERIM seed refusals (validator heads, object-literal keys) — cheap precision wins.
5. Carried from S480: endpoint GET input; #1963 parser LOWs; bootstrap parse gaps now filed by #2043 (g-boot-keyword-named-member-s481, g-boot-from-identifier-s481, g-boot-multiline-alternation-arm-head-s481) — these are now the self-host's main first errors; `is .V` narrowing.
6. **Maps refresh** — not run S479, S480 or S481 (last at f92d1a8fb).
7. Corpus driver hygiene: `samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-continue-label-108.scrml` now compiles and loops forever (its `continue outer` skips the increment) — add per-run timeouts to differential drivers; consider fixing the sample.

## 5. Lessons
- **A first review can miss a class the fix round then exposes** — #2041's nested-place MED existed at r0 and surfaced only at the r1 re-review. Re-reviews must re-attack the whole surface, not just the diff.
- **Interpreter work needs a size budget, not only a step bound** — one probe took 24 GB. Memory-cap any probe that can allocate without bound.
- **The hook does not run the integration tier** — #2042 passed the hook but failed CI on a test that hard-coded pre-migration state. After a corpus migration, grep tests for the migrated paths.
- **`gh pr merge --auto` on a BEHIND branch never enters the queue** — `gh pr update-branch`, then re-enable auto-merge (it is dropped), then wait for CI.
- **Background agents die with the session** — three were stopped at wrap; their worktrees/branches hold the state. Commit incrementally (they did).

## 6. Wrap state
- **Full test suite not run at wrap** (lanes were mid-flight at session end); CI `gate` is the authority; every lane hook passed in the foreground.
- **Maps not refreshed** (§4.6).
- **Worktrees retained:** agent-a7bc7eed1f0a087ee (#2041), agent-afbf784bd54b6b7fa (#2045, holds unpushed r1 WIP — do NOT remove), agent-ab4ee8a676527dd62 (#2046). Review trees under `~/.cache/scrml/review/s481-*` (stale, removable). Landed lanes' worktrees removed at wrap (see the wrap PR body).
- Inbox: `scrml-support/handOffs/incoming/S386-peter-routes.md` is old (pre-S481), untouched.
