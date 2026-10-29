# scrml — Session 472 (bryan · theRog) — WRAPPED

> S472 ran 2026-10-27 → 2026-10-28 on theRog, Profile A, one long session. S471's hand-off is at `handOffs/hand-off-471.md`. **Rotate this file to `handOffs/hand-off-472.md` at the next boot.** Board: `scrml-support/handOffs/active-sessions/S472-bryan.md` (WRAPPED). Rulings verbatim: `scrml-support/user-voice-scrml.md` (S472 entries). Wrapped early on usage limits — several lanes are mid-flight (§4).

## 0. Where the bootstrap stands
The S471 policy holds: impl#1 work only for (a) what the bootstrap needs, (b) breakage blocking flogence / bryan's tools, (c) Peter's lane; no impl#1 security lanes. Centre of gravity: `compiler/self-host-v2/`.

Landed this session in the bootstrap: import/export visibility, `import:host` parse + gate, payload-variant values, position + part writes, file-scope `const`. Ready but unlanded (§4): gate reach + form owner, `style=` guard, recursive tape grants, `<db>` body mode, typer holes, math port. Not started: `<db>` cells (Lane B); md (blocked on two owner questions).

## 1. What landed (14 PRs, excluding FACTS-bot regens)
Every code PR got an S239 adversarial review on a frozen ref plus a PA re-run of the review's repros on the fix head.
- **#1606** bootstrap import/export visibility — per-file scope; (file, kind, name) resolution (r1: match on a non-imported enum, kind-collapse fail-open, write-set precision, messages).
- **#1607** `import:host` parse + gate; impl#1 allow-list anchored to the compiler's OWN `stdlib/` realpath (r1 closed: any adopter could self-declare `self-host-only`).
- **#1608** payload-variant values `E.V(…)` / `.V(…)` (r1: struct-literal payload fields unchecked HIGH, bare ctor without payload, every annotated initializer typed; claim-gate cascade fixed).
- **#1610** position writes `a[i] = v` + part writes `x.f = v` through the one grant reader (r1: append-only inner tape of a `write` tape replaceable HIGH, `lin` part write).
- **#1617** file-scope `const` at logic-block level (r1: exponential inlining → emitted once per artifact).
- **#1620** six tooling gate fixes from review bf3: facts crash ≠ stale (exit 4 = stale), browser baseline no longer masks resolved guards (8 → 4), await pack positive control, hook runs slices on `stdlib/`, claim-gate banner enforced, inbox-debt owed vocab + blob-matched handled.
- **#1605** two stale conformance cases. **#1603** boot.
- **Docs/ledger:** #1604 #1611 (§7.2.2 stray `;` sentence) #1614 (68 markers) #1618 (19 impl#1 carve-outs, 17 markers).

**Gap rollup at wrap:** HIGH 265 · MED 700 · LOW 554.
**Bootstrap conformance:** PASS 254 → 259 · FAIL 51 → 49.
## 2. Rulings this session (all in user-voice S472)
- Boot list: impl#1-only reviews carved out under S471 policy; stray `;` after a closer-delimited item stays an error (§7.2.2 landed); `<db>` design pass started.
- `<db>` Q1–Q6 = PA recs (db-body-and-client-reads-design-2026-10-28.md): item-only code-default body; db cells = per-request server cells, client gets a projection; page waits (`T`); server read of `@x` refused; Lane A before Lane B.
- `<db>`-body functions: program-level, `?{}` binds to the declaring `<db>`; collisions E-SCOPE-010; nested in row/component/engine/match-arm refused for now.
- stdlib host `.js` output: `<out>/_scrml/<module>/<file>`, both client and server.
- Host function type = option A: an `import:host` binding only as the direct callee of a `return` in a fully typed wrapper; value decoded at the return (`E-HOST-VALUE-MISMATCH-RT`). Destination: `<host>` for stdlib (F3/F7).
- `scrml:math`: ship the S469 §41.18 API directly; `min`/`max` 2-arg; `minOf`/`maxOf` take a tape → `number | not`.
- Tape grants: an outer `replace` does NOT override inner tapes (recursive); `sort`/`reverse` permutations exempt.
- `<link rel=stylesheet>` data-bound `href` refused; quoted `style="…${x}…"` each `${}` through `cssValueOf`; exit-less bound/Tier-0 loop = compile error.
- `form="id"`: joins that one form's gate when `id` is a static literal naming exactly one `<form>`; else compile error.
- Clarified (not rulings): `;` IS required on statements (S469); `pure` is deprecated (§33) — F3 doc corrected to spell pure bindings `fn`.

## 3. Owner questions still open
1. **F3 `<host>` element Q1–Q5** (scrml-support/docs/deep-dives/typed-host-binding-f3-design-2026-10-27.md §10; pure→fn corrected). Recs: `<host>`; `-> waiting T` (one-way); `! HostError` (one-way); closed handles; checked results. Gates any async host function.
2. **md:** Unicode character classes (rec: via `import:host`); shared source impl#1 vs bootstrap (rec: impl#1 learns `div`/`T.parse`/`.append`).
3. `<PRE>`/`<Code>`: SPEC raw-content vs impl#1 refusal (rec: SPEC stands; bootstrap refuses meanwhile).
4. Same-named components across files (CSS scope key) — rec keep refusing; `<card>` + `fn card` in one file — rec refuse.
5. Past-the-end position write: trap (current) vs S440 `!` failure — rec trap, update SPEC (O36 lag).
6. Loop-copy no-op `for (let p of @ps) { p.name = … }` — rec a W- lint.
7. Bare `.V` with no type context resolves to the one in-scope enum vs §14.10 E-VARIANT-AMBIGUOUS — rec follow SPEC after measuring.
8. A derived cell with grants taking writes (stops tracking its source) — §66.9 / O60.
9. Mixed-arm ternary (`@b ? 1 : "x"`): union per §17.6 (rec; #1621's reading) vs E-TYPE-001 like `match`.
10. bryan to OK or forbid: the #1620 agent pushed with `git -c core.hooksPath=<branch hooks> push` (full newer pre-push ran; needed because the main checkout's older hook treated the new stale exit 4 as failure). Resolved now that #1620 merged and the main checkout is current.

## 4. In flight at wrap (pick these up first, in this order)
All are pushed; worktrees are kept (`.claude/worktrees/agent-*`). Every one needs `git merge origin/main` (never rebase) and its gates re-run, then the PA re-runs the review's probes before merge.
1. **#1619 gate fail-opens — REVIEWED + r1 PA-VERIFIED** (b3e548ed8; probe `~/.cache/scrml/review/s472-gt/probe/zz-review-probe.test.js`: A3/B/H blocked, `FORM=` joins the gate). DIRTY vs main (known-gaps after #1620) → merge main, queue. Lands the form= ruling (§55.17.3, E-FORM-OWNER-UNRESOLVED).
2. **#1615 `style=` guard — REVIEWED, small round done** (8e931092e). DIRTY vs main → merge main, queue. Next lane recorded in its progress.md: `s472-boot-svg-css-url-guard` — SVG presentation-attr `url()` guard (Chromium-verified MED), `<link>` stylesheet href refusal (ruled), §65.4.2 quoted-style SPEC sentence (ruled).
3. **#1616 map grants — r1 pushed, NOT PA-verified** (b5cd8f155 CLEAN; implements recursive inner-tape rule + permutation exemption + §66.12.6 SPEC). Re-run `~/.cache/scrml/review/s472-mg/probes/` (alias `const h = @g.map(…)`, `@g = [[]]`, depth, struct twin must all refuse; sort/reverse must compile) → queue.
4. **#1613 `<db>` body mode (Lane A) — r1 pushed, report owed** (c342ef178). DIRTY. Re-run `~/.cache/scrml/review/s472-db/probes/` incl. the MED-1 nested-db refusal → merge main → queue. Then Lane B (db cells as per-request server cells, ~700–1,300 LOC; SPEC §8.1.2 visibility sentence lands there).
5. **#1621 typer holes — DRAFT, NOT reviewed** (a46e7d242). HIGH fixes (literal init vs `T | not`/enum/struct; mixed-arm `.Unknown` → `VType.OneOf`). Needs S239 review; check its 3 conformance-case edits and the new refusal of a quoted value into an enum field (`<btn kind="Primary"/>`). Owner Q: mixed ternary (§3 item 9).
6. **#1622 math port — DRAFT, NOT merged with main, NOT reviewed** (ef0ede042). import:host emission to `<out>/_scrml/<module>/`, wrapper rule + `hostResult` decode, `scrml:math` S469 API + minOf/maxOf, impl#1 shim, §21.3.1.1 / §41.18. Conflicts likely (analyze/core/known-gaps/SPEC-INDEX).
7. **Queued lane:** exit-less bound / Tier-0 loop → compile error (ruled; §49.6 sentence).
8. **To file:** the bootstrap accepts duplicate top-level function names silently (the #1619 agent hit it in analyze.scrml).
## 5. Lessons
- **Brief rulings from user-voice, never the hand-off paraphrase** — hand-off-471 §2 had F0 backwards (A = widen import:host; intrinsics were rejected B). Memory: feedback_rulings_from_user_voice.md. hand-off-471 §2's F0 line is wrong — don't trust it.
- **Survey claims are not measurements** — "md is closest" was false (718 diags, four real blockers). Compile before briefing a port.
- **The claim gate is CI-only** — bootstrap lanes that make a refused doc snippet get further change its pinned codes (#1608). Run every CI `checks` step locally; memory updated.
- **impl#1 doesn't check call arity when building the bootstrap** — parallel lanes that change a shared signature slip through (gap filed).
- **Merge churn:** many bootstrap lanes on analyze.scrml/known-gaps.md → repeated DIRTY. Always merge, never rebase; regen generated docs; diff gap ids.
- **Host load ~17 with 9+ lanes:** the pre-commit hook timed out / hit memory ceilings; `SCRML_HOOK_SHARDS=6 SCRML_HOOK_SHARD_TIMEOUT_S=2400` works (not a bypass). Consider ≤6 implementation lanes on theRog.
- **Network (EAI_AGAIN) killed agents twice** — SendMessage resume with "check git status" recovered both.
- **Review debt:** boot probe said 12; real number was ~139 (I misread). Now ~25 code-bearing owed (the 22 mixed PRs); all others carved out or reviewed.

## 6. Housekeeping at wrap
- **Worktrees:** 18 frozen review trees under `~/.cache/scrml/review/` removed; 33 remain (pre-S471 retained ones from hand-off-471 §6, plus this session's `.claude/worktrees/agent-*` holding the §4 PRs — keep until those land).
- **Untracked `main/` in the main checkout** is a git worktree (`.git/worktrees/main1`, created 10:17 S472 by a lane). Left alone — inspect and `git worktree remove` it next session.
- **Review debt:** ~22 "mixed" PRs still owed (`~/.cache/scrml-pa/s472/review-debt-remaining.md`); everything else is reviewed or carved out.
- `tryit/` untracked in the main checkout — bryan's. Open PRs older than S472: #1448, #580.
- **Correction to hand-off-471 / changelog S471:** both say the stdlib host bridge "uses built-in host intrinsics" — wrong. The ruling (user-voice ~21524/21551) is A = widen `import:host` to `stdlib/**`; intrinsics were the rejected option B.
