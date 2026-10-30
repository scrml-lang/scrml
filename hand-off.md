# scrml — Session 473 (bryan · theRog) — WRAPPED

> S473 ran 2026-10-28 → 2026-10-30 on theRog, Profile A, one long session (several compactions). S472's hand-off is at `handOffs/hand-off-472.md`. **Rotate this file to `handOffs/hand-off-473.md` at the next wrap.** Board: `scrml-support/handOffs/active-sessions/S473-bryan.md` (WRAPPED). Rulings verbatim: `scrml-support/user-voice-scrml.md` §S473 (21636 →). Live PA ledger for the session: `~/.claude/pa-ledger/scrml.md` (entries S473-1 … S473-224).

## 0. Where things stand
- **Nothing of S473 is in flight.** All 34 S473 PRs merged, plus the 5 S472 carry-overs (#1613 #1615 #1616 #1621 #1622) at boot. Open PRs at wrap: FACTS bots (#1692 #1684 #1649) and two pre-S473 PRs (#1448 `s468-rulings-spec`, #580) — not this session's; its worktree `agent-a036efcbcbcb1c8b0` is kept.
- **S471 policy holds:** impl#1 work only for (a) what the bootstrap needs, (b) breakage blocking flogence / bryan's tools, (c) Peter, plus explicitly ruled exceptions. S473's ruled exceptions: server-side `navigate()` (#1679) and the Windows routeMap fix (#1681).
- **Bootstrap conformance (strict D30 grading):** PASS 283 · FAIL 241 · UNSUPPORTED 604. The FAIL jump (was 40) is grading, not regression: 202 parse-rejects that used to hide as UNSUPPORTED now FAIL honestly; no PASS was lost.
- **SPEC coverage (`docs/bootstrap-spec-coverage.md`):** 1,107 rows; SILENT 91 → 49, each with a gap; CI gate `scripts/spec-coverage-check.ts` (0 warnings at wrap).
- **Gap rollup at wrap (open, impl#1-owed):** HIGH 270 · MED 741 · LOW 658 (carried by the bootstrap: HIGH 5 · MED 8).

## 1. What landed (34 S473 PRs, excluding FACTS-bot regens)
Every code PR had an S239 adversarial review on a frozen tree (or a PA-verified small round), and the PA re-ran the review's probes on the fix head.
- **SPEC-coverage audit (bryan: "it worries me that we have ignored sections of the spec"):** #1673 the coverage table + a gap for every silent item + the coverage gate; #1682 rulings D4–D31 into the SPEC (§47 moved to an impl#1 annex, contradictions resolved, record-lag sweep); #1691 one named-refusal table (D28), specific codes (D29), strict conformance grading (D30); #1690 the ruled refusals (transitive `!` envelope, journal OFF, slots, O51, Tailwind info, cell shadow, legacy `key=`, SQL slot literal) + F10/F11.
- **Bootstrap fail-closed (D1: refuse rather than compile without the guarantee):** #1675 SQL / `protect=` / tenant; #1678 unknown and unbuilt markup; #1676 return-type inference, derived engines with state-children, dev-server static allowlist, reserved prefixes.
- **`<host>` (F3) end to end:** #1630 DRAFT §21.3.3 SPEC; #1659 client bindings parsed, checked, emitted; #1674 the allowlist (Appendix H surface + typed chain walk; #1670 closed into it).
- **Bootstrap language/security lanes:** #1631 + #1638 E-LOOP-008 (exit-less loops, inner forever); #1633 `<db>` cells as per-request server cells (Lane B); #1634 duplicate-fn lint; #1635 CSS-url SVG attrs / stylesheet `<link>` href / quoted-style `${}`; #1636 one name per file scope, past-end write traps, loop-copy lint; #1637 data never moves the document base; #1640 one name per program for exported names; #1641 data-bound form action / formaction / meta refresh refused; #1643 `<program>` attrs + lang + timestamp + E-STATE-UNDECLARED; #1646 §23.2 foreign blocks read (emission refused by name); #1648 every stdlib module measured on the bootstrap; #1663 data into an executable DOM sink is E-LOGIC-EXECUTABLE-SINK.
- **impl#1 (bootstrap/flogence needs + ruled exceptions):** #1645 + #1661 + #1664 handler arms (value-position lift, imported callee, narrow Transport routing); #1658 scrml-boot single-quoted imports + `_ e :>` typing; #1679 server-side `navigate()` really redirects (coderlegion reply verified on it); #1681 Windows red fixed (5 families incl. routeMap native-key miss).
- **SPEC drafts:** #1644 DRAFT §68 `<program kind="service">` (long-running programs).
- **CI/docs:** #1671 README shows on GitHub again (`.github/README.md` was shadowing it); #1672 claim gate C2 (derived figures must cite FACTS.md; DESIGN.md's "18,000 lines" fixed); #1685 Windows ratchet (`.github/windows-baseline.json`, empty; required in `gate`; nightly `windows-main-report.yml`); #1632 docs batch.

## 2. Rulings this session (verbatim in user-voice §S473 — brief from there, never from this list)
"your recs" on: S472 §3 owner questions; round 2 (form action/meta refresh refused, server `<host>` stdlib-only, E-LOOP-008 widened, one name per program → narrowed to exported names); long-running `kind="service"` Q1–Q4 (a trap aborts only its turn); `<host>` rule 8 → allowlist, then allowlist Q1–Q4 (curated Appendix H surface, WebIDL names as types, no project-local surface, hard error now); plain-logic executable sinks are an Error; impl#1 narrow transport routing; **SPEC-coverage D1–D34** (+ D7 correction: `authority=` is Tier 1 and stays owed); impl#1 navigate exception; review-surfaced 1–5 (transitive `!` atomicity, journal OFF refused in `!`, element-named cell refused at declaration on collision, navigate in `transaction{}` is a compile error, loop-header `key` canonical); Windows exception + ratchet; the envelope counts transitive QUERIES, not writes; F10 (`!` callees count, with reach multiplicity), F11 (client multi-call `!` is a permanent refusal, E-TX-CLIENT-MULTI-CALL).

## 3. Owner questions open at wrap
1. **Post-merge bot for generated files (PA rec: yes).** The generated-file merge tax (known-gaps counts, coverage totals, `severity.scrml`, SPEC-INDEX, bootstrap-conformance.md) forced a re-merge round ~8–10 times this session: every PR that touched gaps went DIRTY when another landed. Rec: PRs stop committing regenerated blocks; a post-merge bot (like FACTS.md's) regenerates them on main, and CI checks only the sources. Needs bryan's OK because it changes what the hook/CI gate on.
2. **F7 slot `if/else` (two slots in two branches):** the D11 ruling counts it as two unnamed slots; a refinement (branches are exclusive) is owed — PA rec: allow one per exclusive branch.

## 4. Owed next (pick from here; nothing is mid-flight)
1. **Bootstrap envelope build (U1e)** — the transitive `!` envelope is now refused/ruled (queries counted, callees counted, F11 refusal); the real savepoint/rollback emission is the next bootstrap lane.
2. **Loop-header `key` parse + W-KEY-001** (ruling 5; legacy `key=` is refused with a hint already).
3. **D10 kept form** `if ((x = e))` / `for ((m = re.exec(s)) is given)` — still refused (the parser drops parens); gap g-boot-assign-as-expression-unbuilt-s473 (narrowed).
4. **impl#1 follow-ups from #1679** (S471 policy: only if flogence/bryan needs them): g-impl1-navigate-via-peer-inside-transaction-not-refused-s473 (MED), g-impl1-server-navigate-target-unproven-lint-s473 (W-NAV-TARGET-UNPROVEN, MED), SSR-loader navigate.
5. **Filed at wrap (`docs/known-gaps.md` §S473-wrap):** impl#1 `match` over a failable call not exhaustiveness-checked (MED); impl#1 lets a `?{}` SqlError escape a `! LoadError` function (MED); impl#1 rewrites `fn` / `X.y` / `is .V` inside string literals of the bootstrap source (MED); a named-refusal row drops unrelated generic errors file-wide (LOW); `<each of=>` unbuilt; mount-of-non-engine generic code; `<host>` review INFO bundle (#1670/#1674); host-src symlink/TOCTOU copy (L4/L5); dev-watch flake; stale conformance case `server-db/async-fn-escapes-as-value-handler-neg`.
6. **Article:** `scrml-support/voice/articles/type-gymnastics-ts-vs-scrml-DRAFT-2026-10-30.md` (+ verified `.scrml`) — committed (scrml-support 46b5aee); unpublished, bryan's call when to post. The two impl#1 gaps in item 5 were found writing it (the article's block avoids both).
7. **Salvage still parked:** `~/.cache/scrml-agent-tmp/salvage-s468-failable-alias-and-match/` (patch + tgz + base sha of the uncommitted S468 impl#1 work).

## 5. Lessons
- **A policy without a check decays** (user-voice D-lesson): §47 and ~90 other SPEC items sat silently unbuilt because nothing failed when a section had no bootstrap row. The coverage gate is the check; keep rows current in the PR that lands a gap.
- **`gh pr merge` while checks are pending does not queue.** It prints "merge strategy set by merge queue" and does nothing. Use a loop that waits for `gate` on the head SHA, then merges, and verifies `isInMergeQueue` (the S473 `landq.sh` pattern). Also confirm a push reached the PR (`gh api repos/…/pulls/N --jq .head.sha`) — #1675's didn't.
- **Diagnose CI red from the log, not the shape:** #1672 looked like cross-test pollution; it was a C2 test timeout plus main's own Windows red.
- **Brief from the source decisions doc, never from my user-voice summary** — the D7 summary drifted (Tier 2 vs Tier 1) and had to be corrected.
- **Never `cd` into a worktree from the primary shell** (it moved the primary dir twice); absolute paths or subshells.
- The four "duplicate gap ids" flagged mid-session are not duplicates: each is one `@gap` marker plus its `gap-resolution` record (the designed form); `state.ts --check` passes.

## 6. Wrap state
- Main at wrap: d139f747c (+ this wrap PR). Worktrees: all S473 worktrees, review trees and scratch worktrees removed; kept `agent-a036efcbcbcb1c8b0` (#1448, open, pre-S473).
- Maps: refreshed at wrap by project-mapper (watermark 546e2f4aa → d139f747c); see the wrap commit.

## 7. Test suite at wrap
- **`bun run test` (whole `compiler/tests/`, ONE process) on main d139f747c:** 50,183 pass · 72 fail · 171 skip · 17 todo (50,443 tests, 1,860 files, 1,222 s). **The 72 are cross-file interference, not regressions:** 5 of the failing files (conf-PROTECT-EGRESS-FLOOR, conf-TENANT-SOURCE-FILTER, s457-url-scheme-runtime-guard, build-sqlite-data-root, e2e detector-validation) re-run together: 432 pass / 0 fail. The rest are dev-watcher timing (`commands/dev-*`, 10–20 s budgets) and browser tests that need their own harness. CI's `gate` (sharded, per-job) is green on this SHA. Don't read the single-process number as health; the record is the sharded hook run below.
- **Pre-commit hook (sharded: unit + integration + conformance + slices) on the wrap commit:** passed (the wrap commit went in through it).
