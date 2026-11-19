# scrml — Session 479 (bryan · theRog) — WRAPPED

> S479 ran 2026-11-18. Profile A (partial read — see §5). Rotate this file to `handOffs/hand-off-479.md` at the next wrap. The S478 hand-off is `handOffs/hand-off-478.md`.
>
> - Board: `scrml-support/handOffs/active-sessions/S479-bryan.md`.
> - Rulings, verbatim: `scrml-support/user-voice-scrml.md` §S479 (2f86684 … 31da360).
> - Lane queue / owner-Q batch / lane rules (copied from `~/.cache/scrml/review/s479-lanes/`): `handOffs/s479-lane-queue.md`, `handOffs/s479-owner-qs-batch.md`, `handOffs/s479-lane-rules.md`.
> - Delta-log: [4039]–[4045].

## 0. Where things stand
- **Policy holds:** bootstrap only, with three narrow impl#1 carve-outs ruled this session (§2): endpoint 415 / strict keys (+ the `cors=` exclusion), CSS-url / stylesheet-href guard, and gate health (`_dbVar` leak).
- **The host OOM-kills everything at >2 parallel hook runs.** systemd-oomd killed the terminal scope (Claude + every agent) four times today (16:36, 17:07, 18:26, 19:44 — `journalctl --user | grep oomd`). Memory `feedback_oomd_lane_cap`. **Next session: one write lane at a time** (or two light ones), hooks with `SCRML_HOOK_SHARDS=2 SCRML_HOOK_SHARD_TIMEOUT_S=2400`. A structural fix (run hook test processes under `systemd-run --user --scope` so oomd kills only the test run) was offered and NOT authorized — it changes bryan's hook setup.
- **Main at wrap:** 37f7843cc (#1961) plus whatever the queue lands.
- **Merge queue at wrap (auto-merge on, reviewed):** #1975 (file-scope follow-ups), #1977 (import-shadow build lint). If either is ejected: merge origin/main, regen `severity.scrml` (`bun scripts/gen-bootstrap-severity.ts`), push, verify remote == local, `gh pr merge N --auto -R scrml-lang/scrml` on its own.
- **Reviewed but CONFLICTING with main (need a merge-main round, then they auto-merge):** #1963 (parser fixes, r2 head 73e5e0bd7) and #1971 (schema rulings, d11fe707b). The landing worktree `.claude/worktrees/agent-a467bb9a19d03853b` is mid-merge on `land-1963` (152 changed files) — finish it or abort and redo.
- **Opened, NOT reviewed, CONFLICTING:** #1981 (endpoint `cors=` + standalone `parseVariant` duplicate keys; worktree agent-ac98e90f4aba62aba, head d60825e44, 84 uncommitted).
- **Unfinished lanes (local worktrees only, nothing pushed — §4):** channel follow-ups, recursive-enum perf, waiting-helper server copy, timed engine + `<onIdle>`.
- Conformance (bootstrap) last measured on lane branches: ~705 PASS / 4 FAIL / 0 CRASH; the bot regenerates the generated tables after merges.

## 1. Landed this session
Every code PR had an S239 adversarial review on a frozen tree; fix rounds were fresh agents and invalidated the review (re-reviewed). Markers in `docs/pr-reviews.md` (this wrap PR).
- **#1957** impl#1 `<endpoint>` 415 + strict keys (carve-out). Clean.
- **#1958** review markers #1928/#1929.
- **#1960** six conformance cases that contradicted the SPEC.
- **#1961** keywordless unread binding = same as `const` (no refusal); duplicate arm binder = E-SCOPE-REDECLARE (PA chose the code: E-SCOPE-010 is file-scope only). r0 MED: keywordless file-scope write inside a function silently shadowed → fixed (E-ASSIGN-004).
- **#1962** file-scope `let`; initializers evaluated once per artifact; E-FILE-SCOPE-LET-SERVER-WRITE.
- **#1965** E-ENDPOINT-PATH-INVALID, `/_scrml_local/` reserved, duplicate JSON keys → 400 Malformed (`jsonRepeatedKey`, fuzzed 155k docs), parseVariant enum alias, E-TYPE-080.
- **#1966** `:error` kind retired (error types are enums), E-ERROR-008 retired, E-DG-001 retired (§31.2: a call cycle is recursion).
- **#1967** channel relay fold (relay judges frames with the clients' `channelJudge`, applies the decoded OUTBOUND text — the r0 HIGH was a `-0` split) + per-address INTERIM bounds; in-place ring-buffer fold.
- **#1969** E-PAGE-DUPLICATE, E-MATCH-FOR-REQUIRED / E-TYPE-024 for omitted `for=`; S478 provisional codes confirmed.
- **#1970** impl#1 `_dbVar` no longer mutates shared type singletons (gate-health carve-out) + class regression test.
- **#1972** engine outside-state-child lint dropped; timed engine cells judge `rule=` at commit (r0 MED: throttle switched off when an effect threw → fixed).
- **#1974** records: §3.B items 12/14/18/19/22/23/26, `url(#ident)` admitted (Chromium-verified 0 fetches), `<db>` failure view, stale-gap cleanup.
- **#1978** a `<request>` body is a client position for §12.2 T5 (mixed recursion placement).

## 2. Rulings this session (verbatim in user-voice §S479 — brief from there)
- §3.A items 1–7 (S478 hand-off) and §3.B kw-unread: PA recs.
- impl#1 carve-out 1: endpoint 415 / strict keys.
- The rest of §3.B (batch items 3–26, item 6 amended to `trusted-proxies` default 0); items 1–2 (`:error`, E-DG-001).
- `cors=` does not cover `<endpoint>`; per-endpoint `cors=` (impl#1 under carve-out 1).
- W-UNUSED-BINDING (bryan's spelling).
- #1963 follow-ups ("both yes"): INTERIM same-line `not` operand; §8 wording.
- #1962 questions 1–4 + standalone parseVariant duplicate keys.
- impl#1 carve-out 3: gate health (`_dbVar`).
- The three last questions ("your recs", 31da360): tool initializers refuse only suspending reach; timed engine + `<onIdle>` (watchdog commits immediately, cancels the held write); a refused throttled write opens no window.

## 3. Owner questions open (with PA rec)
1. **`serve=` narrowing of the tool exemption** (#1975): the ruling exempted tools from §7.6 rule (c); the lane narrowed it to tools WITHOUT `serve=` (a served tool takes requests). *Rec: confirm* (fail-closed, costs nothing today).

## 4. Owed next (one lane at a time)
Order is the PA's recommendation; details and loci in `handOffs/s479-lane-queue.md`.
1. **Land #1963 + #1971** (merge main into each; the land-1963 worktree is mid-merge).
2. **#1981** (`cors=` + parseVariant dup keys): merge main, then S239 review.
3. **Channel follow-ups** (worktree agent-acae1e68b2bf5fda5, branch `s479-channel-follow`, 1 commit + 150 uncommitted, mid-merge): **SECURITY first** — a forged `replace` of a fixed-length tape with a different length is accepted by the relay and every client (pre-existing since #1937; fix in `channelJudge`). Then `__seen`, over-budget → `__refused`, reconnect backoff (ruled item 5), `trusted-proxies` (item 6; also fixes `ratelimit=` first-entry spoofing), timing on channel cells (#1972 N-A: verify, refuse INTERIM if reachable).
4. **Recursive-enum compile time** (worktree agent-ae2da898da114d549): exponential in recursive variants (k=4 > 60 s); a DoS for authors. **Probes must run with memory caps** — this repro is the likely trigger of the last OOM.
5. **Waiting-helper server copy** (worktree agent-adb6fe36f617a12d2, barely started): a server copy of a waiting client helper so a server caller runs it in place (gap g-boot-waiting-helper-server-copy-s479).
6. **Timed engine + `<onIdle>` and the refused-commit marker** (worktree agent-a5ecc98dc81d9c90d, barely started; ruled 31da360 items 2–3). Item 1 (tool initializers) after #1975 lands.
7. **W-UNUSED-BINDING** (ruled) — now unblocked (#1961 merged).
8. **Queued, not started** (`s479-lane-queue.md` top): typer (items 11/13/25), runtime (17/20/24), build mode (10/16), impl#1 CSS carve-out (21), endpoint GET input (9), records batch 2 (many LOW review follow-ups listed there), the #1963 parser LOWs, `g-lint-dup-fn-latent-s479` (#1977 latent M1/M2/L1).
9. Maps refresh (last at f92d1a8fb) — not done this session.

## 5. Lessons
- **OOM is the binding constraint on theRog**, not CPU: four whole-session kills, each re-paid every agent's context. Cap lanes; give exponential-blowup probes `ulimit -v`.
- **Boot read-set was partial** (pa-base §6+, overlay, primer, SPEC-INDEX, master-list §0 skipped for context). It cost nothing visible this session; the next PA should read them.
- **`--plan` drifts** because `~/.cache/scrml/test-timings.json` is shared; pin `SCRML_TEST_TIMINGS` per lane.
- **Bootstrap-build import shadowing** (`opensTag`) silently miscompiled the bootstrap (648 → 515 PASS) — impl#1 builds the bundle; #1977 puts the lint in the build path.
- **One `git commit --dry-run --no-verify`** by a lane (nothing committed; self-reported). Lane rules now forbid `--no-verify` even with `--dry-run`.
- **Reviewers keep finding real bugs in fix rounds** (#1963 r1 introduced MED-A; #1970 r0 missed the memo leak) — the re-review on every fix head is earning its cost.

## 6. Wrap state
- **Not run at wrap:** the full test suite (OOM risk); CI `gate` on each PR is the authority. Maps refresh not run.
- **Worktrees retained** (unfinished, §4): agent-ac98e90f4aba62aba (cors), agent-acae1e68b2bf5fda5 (channel), agent-ae2da898da114d549 (enum perf), agent-adb6fe36f617a12d2 (server copy), agent-a5ecc98dc81d9c90d (onIdle), agent-a467bb9a19d03853b (land-1963), agent-a036efcbcbcb1c8b0 (#1448). Merged lanes' worktrees removed at wrap.
- Review trees: `~/.cache/scrml/review/s479-*` (≈25 GB with older S47x trees; prune once the open PRs land).
