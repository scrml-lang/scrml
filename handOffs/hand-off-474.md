# scrml — Session 474 (bryan · theRog) — WRAPPED

> S474 ran 2026-10-30 → 2026-11-03 on theRog, Profile A, one long session (several compactions). S473's hand-off is at `handOffs/hand-off-473.md`. **Rotate this file to `handOffs/hand-off-474.md` at the next wrap.** Board: `scrml-support/handOffs/active-sessions/S474-bryan.md`. Rulings verbatim: `scrml-support/user-voice-scrml.md` §S474 (21836 →). Capability ledger: `scrml-support/capability-ledger.md` (PERMANENT semantic 69 · PERMANENT security 20 · INTERIM 53), which the PA reads at boot.

## 0. Where things stand
- **Nothing of S474 is in flight.** 29 S474 PRs merged (#1694–#1738, not counting bot regens). Open PRs at wrap: #1448 (`s468-rulings-spec`, pre-S473; its worktree `agent-a036efcbcbcb1c8b0` is kept) and #580 (draft). The stale scheduled-regen PRs #1684 and #1649 are closed (superseded by the post-merge bot).
- **Generated blocks are bot-owned (S474 ruling).** PRs commit only `@gap` / `@review` markers and sources. `generated-regen.yml` regenerates `docs/generated/*`, SPEC-INDEX, coverage totals, conformance and FACTS on main after each merge. `state.ts --check` exit 4 (stale only) is fine in a PR. The `bot-owned-untouched` CI check refuses a PR that edits `docs/generated/`.
- **S471 policy holds:** impl#1 work only for (a) the bootstrap build, (b) breakage in flogence or bryan's tools, (c) Peter. impl#1 security gaps are filed DEFERRED. S474's impl#1 PRs fall under these: #1694 #1698 (flogence), #1704 and #1718 (ruled).
- **Gap rollup (generated, main fa0e875b4):** open impl#1-owed HIGH 272 · MED 767 · LOW 701; carried by the bootstrap HIGH 6 · MED 10 · LOW 1.
- **Local `main`:** the stray alfa commit 2d354c8b9 (`specs/scrml.md`, "v1 ratified in alfa") was dropped on bryan's call ("ditch that"); local main = origin/main.

## 1. What landed (29 PRs)
Every code PR had an S239 adversarial review on a frozen tree. Re-reviews were bound to the new head SHA, and every round was a fresh dev agent (see §5).
- **Generated-file bot (ruling 1):** #1696 post-merge regen bot; #1707 generated blocks moved to `docs/generated/`, plus Windows on test-only PRs; #1719 the bot-owned guard diffs against the merge ref's first parent (F1–F3); #1726 the merge driver never loses hand text.
- **Envelope / transactions:**
  - #1699 bootstrap transitive `!` envelope (U1e: BEGIN/COMMIT/ROLLBACK + nested savepoints);
  - #1703 BEGIN IMMEDIATE when the envelope writes, and failed-query driver text blanked on the wire in production;
  - #1713 a client `!` composes its server calls into ONE request with ONE envelope (door 2);
  - #1704 impl#1 delivers declared-`!` failures to the client's arms;
  - #1718 impl#1 envelopes every `!` body, plus a Bun.SQL code classifier (PG codes) and the `_mayQuery` SCC cache;
  - #1732 SPEC: every `!` server body runs in the §8.9.2 envelope;
  - #1734 SPEC: `!` `server function*` commits per `yield`;
  - #1737 SPEC: refuse every control character in SSE event/id.
- **Bootstrap language:** #1697 one unnamed slot per exclusive branch (F7); #1700 loop-header `key` + W-KEY-001 + D10 double-paren assignment head; #1706 per-file scope keys and output names (door 3); #1715 `import { X as Y }`; #1722 one-expression brace `{ e }` is a value, plus a pinned code-point sort; #1727 foreign-content (SVG/MathML) templates render in their namespace, plus the H1/H2 guards; #1738 a failable-match `else` lowers to the success branch only, an unmatched failure traps, and W-MATCH-001 fires on an unreachable else.
- **impl#1 (flogence):** #1694 `!{}` arm `e.variant`/`e.message` on an imported `?{}` callee; #1698 the `!{}` whole binder gets the §18.6.1 type.
- **SPEC:** #1711 rulings 1–7 as amended plus the four one-way doors; #1725 SPEC examples follow the ruled `;`, plus backfill LOW notes; #1729 `else` on a failable match covers `.Ok` only (E-MATCH-ELSE-ABSORBS-ERROR, PERMANENT security SEC-20), and the §63.4 S466 readings are RULED.
- **Tooling/CI:** #1701 the §34 census resolves bootstrap symbols; #1723 the scrml-boot `-o` ownership manifest (no deletes or writes outside through symlinks), BOM handling, `--columns` bytes, lsp-boot bad-URI and untitled names, doc-gate pins on count + name.
- **Records:** #1695 S473 review markers + SPEC-INDEX line-1 leak + inbox; #1709 #1703/#1706 follow-up gaps; #1721 S474 markers + 19 S469 backfill markers + 19 backfill gaps (review-debt to 0 OWED in range); this wrap PR adds the rest (part 2 markers + `§S474-PA follow-ups` gaps).

## 2. Rulings this session (verbatim in user-voice §S474; brief from there, never from this list)
S473 owner Qs (bot yes; F7 per-branch slot); review-surfaced 1–7; **capability over limitation**: every limiting rec is tagged INTERIM/PERMANENT, and the capability ledger exists; **FORK RULE row C, capability first**, amended so PERMANENT is allowed only for a proven exploit or a stated semantic impossibility; the four one-way doors; the envelope covers every `!` server body; `else` on a failable match (PERMANENT security); the `scrml fix` S466 readings; **`!` streaming commits per `yield`**.

## 3. Owner questions open at wrap
1. **Postgres data-loss gap `g-impl1-envelope-site-handled-pg-abort-s474` (MED, deferred).** On PG, a failed site-handled query aborts the transaction. PA rec: keep it deferred unless Peter or flogence runs Postgres, and build it first if either does.
2. **Veto window on the ⚑ PA readings** carried in the SPEC by #1711, #1732 and #1734. They include M2/N5 (#1713), ConstraintViolation `field` = column only, §41.7 E-SCOPE-010, `transaction{}` IMMEDIATE, `<card>` beside `fn card` PERMANENT, `${}` in `<pre>` INTERIM, the SSE §37.8 origin check, and SQLite read-only sets as BEGIN DEFERRED. Silence keeps them.
3. **`<m.card>` markup spelling for `import * as m`** (owner fork from #1715; `import * as` stays INTERIM).

## 4. Owed next (pick from here; nothing is mid-flight)
Each item is filed in `docs/known-gaps.md` §S474-PA follow-ups or §S474-backfill unless noted.
1. **SPEC follow-up pass (small, one lane):**
   - reword the IN-52 capable form to "audited raw admission of TAB/DEL/C1" in §37.4.2, the §34 row and the gap;
   - #1737 N2 (NUL in id arguably PERMANENT);
   - the comma-less arm-list sweep;
   - the server param-default note.
2. **Bootstrap follow-ups from #1738:** W-MATCH-001 should count only arms before the wildcard (today it fires on already-failing programs, with a false message), and cap the `unmatchedFailure` tag to an identifier pattern.
3. **Bootstrap:** g-boot-parser-restructure-residue-s474 (MED, fails closed); value-form `if`; the §18.5 object-literal arm body; g-boot-failable-arm-foreign-enum-qualifier-accepted-s474.
4. **Tooling/CI:**
   - the ci.yml currency step (~:263) and the s34-census `--base` (~:348) still read the stale `pull_request.base.sha`; this is #1719's F4, the same race;
   - #1719 N1: no test runs the fail-closed guard;
   - #1726: the hand-text self-check is position-blind;
   - #1489: spec-ahead pins compare code SETS, so a typo hides behind E-SCOPE-001;
   - #1723 r1 (INTERIM): output check-then-write race and hard-link overwrite.
5. **Capable forms owed (INTERIM, capability ledger IN-*):**
   - a per-row scoped slot;
   - a non-`!` two-query server call wrapped when the caller is `!`;
   - display-position pending values (§13.9);
   - pure `fn` values in cells;
   - `import * as m`;
   - the impl#1 SSE per-yield envelope (IN-46..IN-52).
6. **impl#1 (deferred unless flogence/bryan/Peter need it):** H1/H2/H3 security (optional-call / param-default match subjects unawaited; MathML `if=`); the `<request>` body `lin` leak; ruled-form refusal misses (#1496); `else` absorbing error variants (g-impl1-else-absorbs-error-variants-s474); the pg-abort gap (§3.1).
7. **Article** `type-gymnastics-ts-vs-scrml-DRAFT-2026-10-30.md` is still unpublished (bryan's call). The S474 article edits ("I am Jacks" series) live in scrml-support/voice/articles.
8. **Salvage still parked:** `~/.cache/scrml-agent-tmp/salvage-s468-failable-alias-and-match/`.

## 5. Lessons
- **Stranded agents (hardened into the PA docs: pa-global "Stranded agents", pa-base §5, pa-core-scrml dispatch checklist).**
  - **Cause:** a background child that never exits pins the agent in "waiting on its own background work" and holds back its report. In S474 the children were two `until ! pgrep -f "git commit"` watcher loops that matched their own command line, ran 16 h and 46 h, and blocked five agents. When they died, all five flushed. Compaction was not the cause, and neither was resuming agents.
  - **Rules:**
    - every wait must be able to end: wait on a PID with a cap, or on the completion notification;
    - use a fresh agent for each dev fix round;
    - keep scratch files under `~/.cache/scrml/<lane>/`, because the shared scratchpad got clobbered and one commit went out with another lane's message;
    - if a branch is held by another worktree, use `<branch>-rN` and push with `HEAD:<branch>`.
- **Capability over limitation.** bryan noticed the PA's recs defaulting to the most limiting option. Every limiting rec now carries INTERIM/PERMANENT, a PERMANENT rec must name the capable alternative, and the ledger is read at boot. A reviewer also caught a PA ledger error: IN-52's capable form ("escaping") was unreachable on the wire.
- **Merge-queue race on gap ids.** Two PRs filing the same gap id with different sev/status went DIRTY in CI (#1718 vs #1732). Resolve by hand to one entry; the merge driver (#1726) stops with a header block and does not guess.
- **The auto-mode classifier blocks:** `kill` of stray loops, force-removing session-locked worktrees, `gh pr close`. Hand these to bryan as one `! <command>` line.
- **"Why are we sitting on the reviews?":** don't park finished reviews as wrap paperwork. Record markers as each review lands.

## 6. Wrap state
- Main at wrap: fa0e875b4 (+ this wrap PR).
- **Worktrees:** all S474 worktrees removed; only the primary checkout and `agent-a036efcbcbcb1c8b0` (#1448) remain. `~/.cache/scrml-pa/s474/` holds only logs.
- Maps: refreshed at wrap by project-mapper (watermark d139f747c → fa0e875b4). This is a stamp on primary/bootstrap/build only. The other maps still mention the deleted `facts-regen.yml` unlabelled, and bootstrap.map.md conformance figures are still the d139f747c ones (owed: a full map pass). `bootstrap.map.md` is gitignored, so it needs `git add -f`.

## 7. Test suite at wrap
- **`bun run test` (whole `compiler/tests/`, ONE process) on main fa0e875b4:** 50,566 pass · 6 fail · 171 skip · 17 todo (50,760 tests, 1,869 files, 1,237 s). Down from 72 at S473.
  - 4 of the 6 are gap-tagged tests: g-soft-nav-rehydrate-seed-apply-unscoped, and g-ast-markup-text-interp-adjacent-space-dropped ×3.
  - The other 2 are S426 seed-bridge `observeCompiled` and §2 runtime-url-guard chunk-as-classic-script.
  - The PA did NOT re-run them in isolation this time. S473 found its single-process failures were cross-file interference; check before treating these as regressions.
- **Pre-commit hook (`SCRML_HOOK_SHARDS=1`) on wrap commit 2918a5426:** 47,359 pass · 0 fail · 125 skip (47,497 tests, 1,678 files, 1,073 s). CI `gate` is the record for the merged head.
