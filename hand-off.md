# scrml — Session 480 (bryan · theRog) — WRAPPED

> S480 ran 2026-11-18 → 11-20. Profile A. Rotate this file to `handOffs/hand-off-480.md` at the next wrap. The S479 hand-off is `handOffs/hand-off-479.md`.
>
> - Board: `scrml-support/handOffs/active-sessions/S480-bryan.md`.
> - Rulings, verbatim: `scrml-support/user-voice-scrml.md` §S480 (line ~22268 on). Brief rulings from there, never from this file.
> - Lane rules used all session (carry forward): copied to `handOffs/s480-lane-rules.md`.
> - Delta-log: [4044]–[4048].

## 0. Where things stand
- **Policy holds:** bootstrap only (`compiler/self-host-v2/`). impl#1 (`compiler/src/`) frozen except the ruled carve-outs: (1) `<endpoint>` surface; (2) CSS-url / URL attributes, **widened S480** to `renders` and `fallback=` templates (§5.2 "Covered writes", judged whole); (3) gate health; (4) **`scrml fix`** (`compiler/src/commands/`) for Track M.
- **Main at wrap:** c15225d88 plus this wrap PR (and #2028's bot regen).
- **Bootstrap conformance on main:** PASS 760 / FAIL 0 / CRASH 0 (S479 wrap ~706 / 4).
- **Lane cap 3** with hooks on theRog (systemd-oomd); gate on `free -g` available ≥ 14. No OOM kills this session under that cap.
- **Census (S480, `~/.cache/scrml/review/s480-census/census.md`):** 701 positive programs; bootstrap clean 14 as written / 190 after `scrml fix`; impl#1 ~670–687. The dialect is the main blocker; `^{}` meta is the top missing feature (+41). Build order ruled (§2): Track M → `^{}`.

## 1. In flight at wrap (pick these up first)
1. **#2025 Track M step 1 (`scrml fix`: `;`, comma arms, fixS66 unwrap)** — branch `s480-fix-dialect`, worktree `.claude/worktrees/agent-a709fde6a04559965` (keep). **NOT landable yet.** r4 fix round was running at wrap (head before r4: d9eefb493).
   - The seed-order guard (`seedHazard`, fix-s66.js ~1904) has failed open three rounds running (r1 allow-list reader; r2 source-order prefix only; r3 missed the moved initializer's own writes vs later file-scope bindings). Root cause: the bootstrap CLI artifact (print.scrml `printProgram` 5345–5418) evaluates **every** file-scope binding at module init, before `rt.construct` seeds cells; impl#1 runs them in source order.
   - r4 brief (`handOffs/s480-2025-r4-brief.md`) states the invariant: the moved seed(s) and the set R of code whose order relative to them changes must commute; closed form = moved initializers call/write-free AND R write-free, or R empty.
   - **Next:** read the r4 report (agent transcript, or the PR body r4 section + `~/.cache/scrml/review/s480-2025-r4/`); freeze head → fresh S239 re-review **on the CLI artifact path** (`compileSource` → `runBootstrapArtifact`, never `frontEnd`/`loadProgram`); reuse probes in `~/.cache/scrml/review/s480-2025-r{1,2,3}rev/scratch/`. Land only on CLEAN / LAND-W-F/U.
   - PR body must disclose conformance FAIL 0→10 (9 stmt-semi twins excluded by TWIN_RULES + `defer/outside-function-when-body-neg`).
   - PA decisions in force: step 2 commits only the impl#1-safe subset; terminator rules stay out of twins; validator heads `<x min(18)>`, object-literal keys and a `^{}` after a declaration stay **refused** (INTERIM precision, fail-closed — gaps to file when #2025 lands).
2. **#2032 static class never removed by `class:`** (12b1614e9) — PA-direct reviewed, auto-merge on at wrap; confirm it merged. Compile-time `fixed` flag on `rt.classOn`; impl#1 also strips → gap `g-impl1-class-directive-strips-static-class-s480` (LOW). Marker owed pr=2032 (clean, PA-direct).
3. **Gaps to file when #2025 lands** (locus `compiler/src/commands/fix-s66.js`, prov `review:#2025`, INTERIM, fail-closed): the seed guard refuses validator heads `<x min(18)>` and object-literal keys; a `^{}` after a declaration refuses the move until the bootstrap has `^{}`.

## 1a. Post-wrap addendum (2026-11-20, after #2034 merged)
- **#2025 r4 re-review = LAND-W-F/U** (head 6c0b28485; 0 introduced findings; the commutation guard held over 101 prior probes + new attacks). Auto-merge enabled at wrap; **confirm it merged** (it was BEHIND main; windows job pending — check it). Markers owed: pr=2025 (r0 BLOCK → r1 → r1rev BLOCK → r2 → r2rev FIX → r3 → r3rev FIX → r4 → r4rev LAND-W-F/U), pr=2032 (PA-direct clean).
- **Gaps to file** (all PRE-EXISTING bootstrap-vs-impl#1 divergences, reproduced on c15225d88 with no fix; `scrml fix` output now reaches them). Probes in `~/.cache/scrml/review/s480-2025-r4rev/scratch/p/`:
  - P1 MED: the bootstrap drops an unread file-scope binding even when its initializer has a side effect (`constsReadIn`, print.scrml:5376). `b04n-nofix.scrml`: boot "1" vs impl#1 "11".
  - P2 MED: a file-scope binding is hoisted above a top-level write (§7.6 module-init model). `h02-hoist-nomove.scrml` (`let n=1; n=5; const k=n`): "1" vs "5".
  - P3 MED: render order differs — impl#1 runs all top-level logic, then fills interpolations; the bootstrap interleaves in source order, and its CSS bridge reads derived cells at boot. `e01-render-model.scrml`: "1 10" vs "10 10"; e02/e03 101 vs 110. **Likely an owner question**: which order does the SPEC mandate? Grep SPEC (§6 / §7.6 / §55) and user-voice before asking.
  - LOW: the guard comment (fix-s66.js:1909–1946) says impl#1 "runs all of it in source order" — false for interpolations and component instances (stricter, still sound); fix the comment.
  - Also file the #2025 INTERIM refusals listed in §1.3.

## 2. Rulings this session (verbatim in user-voice §S480)
All "your recs go" — PA recs adopted. Cite slugs `ruling:user-voice-scrml.md-S480-<slug>`:
- `four-recs` (impl#1 §61.2/§61.7; E-ENDPOINT-CORS-INVALID; honest-client guarantee + 30 s INTERIM; append-append gap) · `1998-recs` (reserved-prefix paths) · `four-recs-2` (E-ENDPOINT-ATTR-INVALID; onIdle no-op fire; tools evaluate every initializer in source order; §61.7 trailing dot).
- `unused-binding-six` + `each-binders` (W-UNUSED-BINDING population).
- `trap-attr-hole` (trapped attribute → the element is the hole; client conditions are not a security boundary).
- `endpoint-typed-attr`.
- `census-recs` (Track M first; `^{}` after; const components and top-level markup migrate; carve-out 2 widened; `@.` reads `as r`; `<onchange>` arm binders reported; E-TYPE-004 row; reserve db/schema/md).
- `covered-writes-templates`, `driver-text-reserved-cells`, `is-not-nullish-type` (is/== on `E | not` → false when absent; `a ?? b` type; W-NULLISH-NEVER-ABSENT).
- `serve=` narrowing confirmed (5f5f0ae); `replace` not bound by fixed length (2ed5bf5).
- **No owner questions are open.** (The library/page question was already ruled — S478 #26, §40.8 — and was withdrawn.)

## 3. Landed this session
~35 code/records PRs + bot regens; every code PR had an S239 adversarial review on a frozen tree, a fresh agent per fix round, and a re-review of every fix head. Per-PR verdict chains are in `docs/pr-reviews.md`; the full list is in the changelog S480 block. Highlights:
- **Security / fail-closed:** #1998 + #2007 impl#1 endpoint attribute reader (smuggling via quoting closed; E-ENDPOINT-ATTR-INVALID); #2012 bootstrap endpoint opener; #2015 + #2023 impl#1 CSS-url/URL guards incl. `renders` / `fallback=`; #1994 tape-walk fail-open + exponential fixes; #2011 driver-text withholding by build mode; #2017 trapped attribute holds its element (5 rounds); #2028 `class:` trap holds the element.
- **Channels:** #1987 + #1995 (honest client never closed; rate refunds; supersede).
- **Bootstrap features:** #1999 timed engine + `<onIdle>`; #2000 waiting-helper server copy; #2004/#2009/#2013 W-UNUSED-BINDING; #2006 typer joins; #2008 runtime traps; #2028 `??`, bare `@.`, `is .V`, `class:`; #2026/#2029 reserved names.
- **Performance:** #1991 recursive enums (>90 s → 4 ms); #2020 top-level fn count (8000 fns 114 s → 3.9 s; parse.scrml 198 s → 7.5 s); #2002 lint-dup-fn.
- **CI:** #2016 slices job sharded (was hitting the 20-min timeout and cancelling merge-queue runs).

## 4. Owed next (recommended order)
1. **#2025** to land (§1.1). Then **Track M step 2**: commit the impl#1-safe migration of the showcase + self-host sources (dual-compile check with impl#1; multi-file examples measured as whole apps); add a `while` fix rule (self-host's first bootstrap error is now E-LOOP-WHILE-RETIRED in 26/28 files).
2. **`^{}` meta in the bootstrap** (ruled; top census feature, +41 programs). Needs a design read first.
3. **Endpoint GET input** (item 9, S479 queue). **#1963 parser LOWs.** Bootstrap parse gaps on keyword member names (`.fn`, `.server`, `.renders`, `from`) and multi-line `|` heads (census).
4. **`is .V` true-branch narrowing** `E | not` → `E` (capability follow-up; the ruling doesn't require it).
5. **Maps refresh** — not run this session or S479 (last at f92d1a8fb).
6. review-debt was scanned at `--limit 200` only (GitHub 502 above that): re-run wider next session.

## 5. Lessons
- **Hand-written allow-list readers fail open — repeatedly.** #2025's seed guard broke in three directions in three rounds; #1998's attribute reader leaked via quoting twice. Fix rounds now get the invariant stated in the brief, not the next direction to patch. Memory `feedback_constrain_to_proven_path`.
- **Test the shipping path.** #2025's tests passed on `frontEnd`/`loadProgram` while the CLI artifact miscompiled. Briefs now require the artifact path for runtime claims.
- **Never wrap `git commit` in `timeout`** (two agents did; it killed the hook, nothing bypassed). Seed per-lane `SCRML_TEST_TIMINGS` from the shared file. New conformance cases need `host-global-scan` on both shards with impl#1 throws pinned. All in `handOffs/s480-lane-rules.md`.
- **Agents that end a turn with background jobs lose later reports** — fresh agent per round, hooks in the foreground (memory `feedback_fresh_agent_per_round`).
- **After a CI-shape change, update open PR branches** — `gh pr update-branch` drops auto-merge; re-enable it.
- **Check SPEC + user-voice before asking the owner** — one already-ruled question was re-asked (memory `feedback_check_ruled_before_asking`).
- **Keep the main checkout fast-forwarded** — hooks run from it; it was 29 behind once.

## 6. Wrap state
- **Full test suite not run at wrap** (OOM risk with lanes running); CI `gate` on each PR is the authority. Every lane hook passed in the foreground (~57.4k pass, 0 fail).
- **Maps not refreshed** (§4.5).
- **Worktree cleanup NOT done** (the bulk force-remove was blocked by the permission classifier; awaiting bryan). ~90 worktrees remain: merged lanes under `.claude/worktrees/agent-*` and review trees under `~/.cache/scrml/review/s480-*`. Keep `agent-a709fde6a04559965` (#2025) and `s480-2025-*`; everything else from S479/S480 has landed.
- **PA ledger** `~/.claude/pa-ledger/scrml.md` rewritten for S480.
