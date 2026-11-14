# scrml — Session 475 (bryan · theRog) — WRAPPED

> S475 ran 2026-11-05 → 2026-11-08 on theRog, Profile A, one long session (several compactions). S474's hand-off is at `handOffs/hand-off-474.md`. **Rotate this file to `handOffs/hand-off-475.md` at the next wrap.** Board: `scrml-support/handOffs/active-sessions/S475-bryan.md`. Rulings verbatim: `scrml-support/user-voice-scrml.md` §S475 (21922 →). Capability ledger: `scrml-support/capability-ledger.md` (S475 rows PS-75/76, IN-54/55), which the PA reads at boot.

## 0. Where things stand
- **40 S475 PRs merged** (#1744–#1812, not counting bot regens). Main at wrap: a9057254c (+ the records PR and this wrap PR).
- **In flight at wrap:** the records PR `records(s475): review markers #1804–#1812; F6 RULED local edit; refetch-coalescing gap` (lane `s475-records6`, draft). The PA checks it (SPEC/records carve-out) and queues it. If it is not merged when the next session boots, finish it first.
- **Open PRs older than S475:** #1448 (`s468-rulings-spec`; worktree `agent-a036efcbcbcb1c8b0` kept) and #580 (draft).
- **S471/S475 policy holds:** impl#1 (`compiler/src/`) gets no work ("we are not wasting resources on the impl#1"). The only S475 exceptions were the authorized `fix-s66.js` tooling changes (#1795, #1808) that let conformance cases twin to the bootstrap.
- **Generated blocks are bot-owned.** PRs commit only markers and sources.
- **Gap rollup (generated, main a9057254c):** open impl#1-owed HIGH 272 · MED 766 · LOW 724; carried by the bootstrap HIGH 6 · MED 10 · LOW 1.
- **The main checkout was found detached at #1767 (stale hooks for every worktree).** It is back on `main` at a9057254c. Check it at boot (`git -C ~/scrmlMaster/scrml rev-parse --abbrev-ref HEAD` = `main`).

## 1. What landed (40 PRs)
Every code PR had an S239 adversarial review on a frozen tree; re-reviews were bound to the new head; every fix round was a fresh agent. Middle rounds were PA-verified with the reviewer's own probes; final rounds of big changes had a full re-review.
- **Envelopes / transactions (bootstrap):** #1744 statement savepoint for a site-handled `?{}`; #1746 E-TX-FAIL-AFTER-COMMIT + `.scrml` namespace import; #1748 Postgres envelopes (one query is enough, SQLSTATE classes, reserved connections; MySQL refused by name); #1755 W-MATCH-001 precision, tag cap, txConnection guards, quote-aware PG key columns; #1756 a client `!` fn's one non-`!` query-reaching call runs in an envelope.
- **Transport (§19.9.5):** #1760 composed `!` callers get Transport (+ the pre-existing mutual-recursion atomicity bug fixed); #1797 narrow carriers; #1810 the RULED **literal** reading (any client `!` fn with a server call, or a call of a carrier, textually — dead code and lambdas count) + W-REQUEST-ID-UNREFERENCEABLE.
- **Lifecycle / requests / pending cells (§13.9, §6.7.7):** #1771 Core View.Request (inert); #1774 `(not to T)` type; #1781 `<request>` body form; #1783 lifecycle read rule + write contract; #1787 READ/WRITE class + abort; #1788 `<#id>` reads + `refetch()`; #1794 no-SQL READ + C-R2 counting; #1796 pending cells (S4) with the start-stamp supersede runtime (four rounds).
- **Type system / language:** #1754 parser residue; #1762 value `if` + object-literal arm body; #1767 struct context from return/argument/arm positions; #1772 `@m.x` namespace reads; #1777 handled-call landing check (`VType.Partial`, least-fixpoint `!` success); #1778 file-scope own values; #1782 Partial follow-ups; #1769 optgroup narrowing; #1812 **grant-checked local tape edits** (`append`/`prepend`/`pop`/`shift`/`remove`, grow shapes, `.some`/`.every`/`.includes`, call-result methods; batch local edits refused; bounded lengths refused INTERIM).
- **Tooling / CI:** #1753 PR-base race, fail-closed guard test, position-aware hand-text check, real-Postgres CI job; #1764 race-free `-o` writes (held-dir fds, identity check); #1791 postgres-live required; #1795 #1808 twin fixes (authorized fix-s66).
- **SPEC:** #1745 #1749 #1793 #1804 #1807 (rulings + veto-window readings; §13.9.4 "Which write or load wins" RULED; §19.9.5 literal).
- **Records:** #1751 #1759 #1768 #1785 #1803 (+ s475-records6 in flight).
- **bryan's lotto:** `compiler/self-host-v2/dist/lotto.scrml` (gitignored) rewritten into the clean shape (local tape `drawWhites`, `.includes`, `map`+`join`, locked `game`); it compiles on main. Backup `lotto.orig.scrml`. `tryit/` is bryan's scratch, hidden by `.git/info/exclude`.

## 2. Rulings this session (verbatim in user-voice §S475; brief from there, never from this list)
Postgres savepoint built now; S474 veto readings; impl#1 stays off; S475 owner questions batch 1 (17 items: pending-cell spelling, lifecycle writes, §19.9.5 extends to every client `!`, value-if `{ e; }`, arms take the position's type, derived lifecycle refused PERMANENT, postgres-live required, …); batch 2 (§13.9.4 rules 1–5 RULED, §19.9.5 LITERAL, `<page>` twin wrap, W- code for an unreferenceable request id, `tryit/` kept); **local tape edit on a `const` local or parameter is an EDIT** ("read as edit").

## 3. Owner questions / veto windows open at wrap
1. **Veto window, #1793 ⚑ readings:** a pending tape's `let` grants nothing beyond its bracket grants; "own handled load" includes the §13.9.4 action-position handled waiting write; a derived waiting cell gets E-VALUE-SERVER-CALL only. Silence keeps them.
2. **#1796 L3:** a whole-cell author write on a `let`/locked pending tape without `[replace]` — allowed? (No PA rec recorded yet; give one.)
3. **`.join` on `int[]`** waits on the int→string ruling (g-bootstrap-int-to-string-conversion-unruled-s469).
4. **O36:** tape bounds and `insert` — needed before bound enforcement (g-boot-bounded-length-unenforced-s475).
5. **Per-row scoped slot spelling** (O9, with named/parametric slots).
6. **Optional:** should the `scrml fix` CLI wrap a `<page>` root by default? (Today only the twin path does.) PA rec: no, until bootstrap `<page>` lands.
7. **Older:** S473 veto markers still unconfirmed (E-SQL-JOURNAL-OFF, E-FIXED-RETIRED, I-TAILWIND, E-DECL-*); S474's Postgres pg-abort gap (deferred) and `<m.card>` spelling.

## 4. Owed next (pick from here)
1. **Bootstrap `<page>` (§40)** — g-bootstrap-page-element-unsupported-s475 (MED). It now gates the 25 newly twinned conformance cases. Best next lane.
2. **Pending cells, rest of the plan:** S6 display-position pending values; pending-cell `reset`; absence narrowing (ruling 16); g-boot-pending-cell-opaque-call-s475; g-boot-pending-cell-outside-program-s475; g-boot-plan-arms-nested-wait-s475; mint E-TYPE-LIFECYCLE-ON-DERIVED with its emitter.
3. **Tapes:** bound enforcement (after O36); INTERIM tape forms from #1812 (`insert`, part edits, removal value, spread in const/return/arg, other methods); `.append(e)` with an Unknown element stays silent (provable-or-silent).
4. **#1777 INTERIM residuals** (branch correlation for `==`, etc.); effect-position abort needs a per-call flag (INTERIM).
5. **Records/SPEC:** the refetch-coalescing ⚑ reading (#1788 F4) gets its gap in s475-records6; SPEC sentence for §7.6 (a file-scope declaration's initializer may read a `<program>` cell) if not yet added.
6. **Maps:** a full project-mapper pass is owed (carried from S474; maps stamped 2026-11-03, S475 changed analyze/parse/runtime heavily).
7. **Carried from S474 §4:** tooling items not done in #1753/#1764; capable forms IN-*; impl#1 deferred list; unpublished article; salvage `~/.cache/scrml-agent-tmp/salvage-s468-failable-alias-and-match/`.

## 5. Lessons
- **Main checkout drift.** The primary checkout sat detached at #1767 for most of the session, so every worktree's hooks ran a stale gate (`core.hooksPath` is absolute). Check it at boot and after any PA checkout in the main tree.
- **Withdraw a bad reading fast.** The PA's #1810 dead-code ⚑ reading reintroduced the instability the ruling was meant to remove ("stable failure set"); the reviewer caught it and the PA withdrew it. Readings must be checked against the ruling's stated purpose, not just its words.
- **Merge-time semantic bugs.** Two PRs touching the same Core shape (#1788 + #1796: `signalIndex`) compiled and passed separately; the bug surfaced only at merge. When two lanes touch one Core view, the second merge round runs the other lane's tests.
- **Hook memory.** Under 6–8 lanes the pre-commit hook dies from memory at default shards; `SCRML_HOOK_SHARDS=1 SCRML_HOOK_SHARD_TIMEOUT_S=2400` works. No `--no-verify` (one dev attempted it; the classifier blocked it, nothing ran).
- **Brief over-limiting.** The #1787 brief's "≥1 SELECT" clause was stricter than the SPEC; the reviewer caught it. Briefs quote the SPEC, not a PA paraphrase.

## 6. Wrap state
- **Worktrees:** 66 removed at wrap. 17 agent worktrees are still locked by this Claude session's process and can't be removed by the PA (classifier). After this session exits, bryan runs: `! cd ~/scrmlMaster/scrml && git worktree list | awk '{print $1}' | grep '/worktrees/agent-' | grep -v a036efcbcbcb1c8b0 | xargs -r -n1 git worktree remove -f -f && git worktree prune`. Keep `agent-a036efcbcbcb1c8b0` (#1448). The `s475-records6` and `wrap-s475` worktrees go once their PRs merge.
- **Review trees** lived in `.claude/worktrees/rev-s475-*` (all removed); probes in `~/.cache/scrml/review/s475-*`.

## 7. Test suite at wrap
- Not re-run as one process this session (the machine was loaded by lanes all session). CI `gate` on each merged head is the record; the last code PR #1812's pre-push run was 45,172 pass · 0 fail · 125 skip.
- Bootstrap conformance at #1812: PASS 302 · FAIL 243 · CRASH 0; twins NOT-TWINNED 624 · UNSUPPORTED 658 after #1808.
