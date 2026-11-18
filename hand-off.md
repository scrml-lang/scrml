# scrml — Session 478 (bryan · theRog) — WRAPPED

> S478 ran from 2026-11-14 to 11-17: Profile A, many compactions, and 6–8 parallel lanes the whole time. The S476+S477 hand-off is at `handOffs/hand-off-477.md`. **Rotate this file to `handOffs/hand-off-478.md` at the next wrap.**
> - Board: `scrml-support/handOffs/active-sessions/S478-bryan.md`.
> - Rulings, verbatim: `scrml-support/user-voice-scrml.md` §S478.
> - PA ledger: `~/.claude/pa-ledger/scrml.md` S478-A … S478-DH.
> - Delta-log: [4029]–[4033].

## 0. Where things stand
- **bryan's subscription is ending.** This file and `handOffs/delta-log.md` must be enough to pick up cold.
- **Policy holds:** bootstrap only (`compiler/self-host-v2/`). impl#1 (`compiler/src/`) is frozen except for the bootstrap-build carve-out (S471).
- **Main at wrap:** f11506f4c (#1927), plus whatever the queue lands after it.
- **In the merge queue at wrap.** Both are composition-tested on main + #1919. Both are S239-reviewed, fixed in round 1, and PA-verified with the reviewers' probes.
  1. **#1928 `<channel>` (§38)**, head 14a8dbfad. Merged tree: 606 PASS / 0 CRASH.
  2. **#1929 function types and values**, head 70e494afa. Merged tree: 597 PASS / 0 CRASH.
  - **If either is ejected:**
    1. Read the merge-group run's failed job.
    2. `compile-scaling-s477` fails on load: a 3.09 ratio against the 3.0 bound ejected #1927 once. Re-enqueue it.
    3. Otherwise merge origin/main into the branch. Severity conflict: `git checkout --theirs compiler/self-host-v2/severity.scrml && bun scripts/gen-bootstrap-severity.ts && … --check`.
    4. Run `~/.cache/scrml/review/comp.sh <tree>` and push.
    5. Enqueue with `gh pr merge N --auto -R scrml-lang/scrml`, run on its own.
- **Older open PRs:** #1448 (`s468-rulings-spec`) and #580 (draft). Both are untouched.
- **Conformance (bootstrap, main f11506f4c):** PASS 599 / FAIL 18 / CRASH 0. At the S477 wrap it was PASS 336 / FAIL 260. Expect about 610 PASS once #1928 and #1929 land.
- **Gap rollup (generated):** impl#1-owed HIGH 271 · MED 779 · LOW 797; bootstrap-carried HIGH 6 · MED 13 · LOW 7. The wrap's follow-up gaps add LOW/MED rows.

## 1. What landed (48 PRs, plus 2 in the queue)
Every code PR had an S239 adversarial review on a frozen tree, except a few small ones the PA checked directly (marked in `docs/pr-reviews.md`). Fix rounds were fresh agents, and the PA re-ran the reviewers' HIGH probes on each fix head before enqueuing.
- **Rulings built:**
  - #1846: negative `insert` literal;
  - #1850, #1857: bounded branch literals, option A;
  - #1852, #1860, #1864: pending `[replace]`, reset/reload order, rule 4;
  - #1886: body-top run locals are file-scope.
- **impl#1 build tool:** #1853 and #1869 make the text rewrites skip string literals. #1862 and #1872 then removed the bootstrap's workarounds for them.
- **Language on the bootstrap:**
  - #1863 re-exports and import cycles (§21.4);
  - #1865 attribute-value forms;
  - #1867 engine codes;
  - #1873 is-tests;
  - #1875 durations, debounced=/throttled=, `<onIdle>`;
  - #1876 body-top statements, display literals, logic `<script>`;
  - #1877 parser smalls;
  - #1880 `${}` hoisting;
  - #1885 markup in value positions, foreign `in:{}`;
  - #1887 keywordless declarations, §20 built-ins;
  - #1888 refinement types; #1911 refinement runtime checks (§53.4.5);
  - #1894 engine rule= in state children;
  - #1900 print/println (§20.7);
  - #1901 object destructuring;
  - #1905 block lambdas and function expressions;
  - #1908 `<schema>` (§39); #1915 typed `?{}` SELECT from the schema; #1925 raw CREATE TABLE DDL;
  - #1909 `<match for= on=>` element;
  - #1916 `<endpoint>` (§61);
  - #1917 `T | not` member access (E-TYPE-046); #1927 `?.` (§42.3.6);
  - #1918 the `${(e) => …}` event listener, E-EVENT-CONTROL-AFTER-AWAIT;
  - #1919 markup in `${ if … }`;
  - #1920 bare blocks and `transaction { }`.
- **Conformance and stale cases:** #1866 #1871 #1879 #1895 #1897 (the `;` migration, honest fixtures, false-positive FAILs).
- **Review follow-up rounds:** #1870 #1891 #1902 #1907.
- **Tooling:** #1855 fixes hook shard pollution, the memory ceiling (`SCRML_HOOK_SHARD_MEM_MB`), and the pre-push exit code.

## 2. Rulings (verbatim in user-voice §S478; brief from there, never from this list)
1. S477 Q1: a whole-cell write on a pending tape without `[replace]` is REFUSED. S477 Q2: the later write beats a reset's reload.
2. Bounded branches, option A: any branch with a provably violating literal is a compile error. §13.9.4 rule 4: the reload starts at the write. `reset-on=` timing is kept.
3. Body-top (#1876):
   - the display-literal line test stays INTERIM;
   - body-top `lin`/locals are file-scope;
   - SPEC-contradicting cases are fixed, not the compiler;
   - `Counter;` reports E-STMT-NO-EFFECT plus E-SCOPE-001.
4. Raw DDL (#1925): a non-primary column type is E-SCHEMA-004. WITHOUT ROWID and STRICT are admitted (WITHOUT ROWID PK columns are NOT NULL; STRICT stores only the declared type).

## 3. Owner questions open (each has a PA rec; record rulings verbatim in user-voice)
1. **#1928 §38.4: sync channel ops, not whole values. PA rec: YES.** This is the biggest one.
   - Today the bootstrap refuses any non-`replace` channel cell (append, pop, engine). That is INTERIM, and it blocks the tutorial's chat example.
   - The capable alternative: send "append X" and have the receiver check the grant. That also fixes the lost-update race when two clients append at once.
   - It is a wire-protocol change in §38.4. #1928 Qs 1–7 are in its PR body.
2. **#1929 function types**, Qs 1–6 in the PR body:
   - failable spelling `(x:T)! E => R`;
   - a pure `fn` type;
   - `=>` only;
   - invariance;
   - callback colour;
   - a server fn returning a fn stays refused.
   - PA recs are in the PR body.
3. **#1916 `<endpoint>`**, Qs 1–8. PA rec, adopt all of these:
   - 405 + Allow;
   - E-ENDPOINT-ROUTE-DUPLICATE, and reserve `/_scrml/` (and `/_scrml_ws/`);
   - strict 400 on extra keys;
   - direct child of the entry `<program>`;
   - path grammar unreserved + `/`;
   - E-ENDPOINT-ARM-NO-VALUE;
   - 415 with impl#1 parity;
   - a `tag` field.
   - Separate: the GET query-string design.
4. **SQL:**
   - §14.8.3 maps INTEGER→`number`, but S440 enforces `int`. **PA rec:** amend it to `int`.
   - Non-STRICT row trust. **PA rec:** (b) a §57 decode check at the boundary, INTERIM.
5. **stdlib data** (lane stopped, no PR):
   - Q1, per-name barrel import: **PA rec YES, INTERIM**;
   - Q2, the parseVariant intrinsic: **PA rec: build it**;
   - Q3, a typed data API: **PA rec: defer until the F3 `<host>` bridge**.
6. **#1917:** loop narrowing.
7. **#1918:** event attribute → interface table, and the loop-suspension rule. **PA rec:** rewrite the 18 event-after-await cases with `!{}`.
8. **#1919:** a body-top `lift` renders nothing.
9. **#1920:** a tx block with no envelope. **PA rec:** a plain block when there is no query, and a permanent refusal on the client.
10. **#1927:** §42.3.6 says literal `?.`. **PA rec:** amend it to "short-circuit as".
11. **#1909:** duplicate binders in `<Loaded(n, n)>`. **PA rec:** refuse them in both match forms. Also, the `<match>` mount wrapper inside `<ul>`/`<select>`. **PA rec:** lower it without a wrapper.
12. **Carried from S477 §3:** the #1793 veto-window readings; `.join` on `int[]`; O9 slot spelling; the S473 veto markers; `<m.card>`.

## 4. Owed next (pick from here)
1. Land #1928 and #1929 (§0).
2. Once the owner rules on §3.1, build op-based channel sync. That unblocks the tutorial chat.
3. **Review follow-ups:** the gaps filed at this wrap (`prov=review:#18xx/#19xx`, `docs/known-gaps.md`). Best value first:
   - #1920 MED: a `transaction` in a handler should be E-ERROR-001 (it currently fails closed as CORE-ILL-FORMED);
   - #1886 LOW-6: a latent lin fail-open on nested Run;
   - #1895 LOW-1: an import-cycle recompute that is ~cubic;
   - #1901 M1: E-OBJECT-SHORTHAND-CELL.
4. impl#1 silently overrides a duplicate top-level fn (agents hit this twice). It is in scope under the build-tool carve-out.
5. Make `compile-scaling-s477` robust (median of 3, or a wider bound).
6. Next conformance blockers for `server-db/*-rt`: nullable text vs string slots, untyped params, `.push` on `[]`, `Object.values`, `count(*) AS n` / JOIN.
7. A maps refresh: last at f92d1a8fb, and S478 rewrote parse/analyze heavily.

## 5. Lessons (S478)
- **`bun run pretest` exits 0 when the bootstrap bundle fails to build.**
  - Symptom: whole test files fail as one `(fail) (unnamed)` after 30–90 s. It looks like load, but it isn't.
  - Run one file and read the `bootstrap bundle failed to compile under impl#1:` error.
  - After merging two lanes, grep every match AND every construction of a variant or struct that gained a field or variant. The bundle broke this way four times: ElemFact.MSchema, `If.form`, `Braced.ev`, `Ternary.optChain`.
- **The composition test is mandatory before every push of a merged branch:** `~/.cache/scrml/review/comp.sh <tree>`. CRASH must be 0, and every gate must be green. `types-gate` needs `node_modules` symlinked into the worktree; otherwise it prints "tool is missing".
- **Keep the main checkout on current main.** Hooks run from it via an absolute hooksPath. At wrap it was 14 commits behind, so every worktree's hook was running stale gates.
- **Merge queue:**
  - A push clears auto-merge.
  - The next PR usually goes DIRTY only on `severity.scrml` (regenerate it).
  - A queued PR can be ejected by a flaky timing test; read the merge-group run before touching code.
- **Agents tried `--no-verify` twice** (the #1918 lane and the #1919 r1 agent). The classifier blocked both, and nothing ran. Briefs (`~/.cache/scrml/review/s478-lanes/COMMON.md`) now forbid it explicitly. Keep that line.
- **Never `pkill -f` with a pattern your own shell matches.** It killed the PA's shell.
- **At 6–8 lanes, load reaches 11–18.** Hook load-timeouts are noise: rerun once before investigating.

## 6. Wrap state
- **Worktrees:** 70 merged review and agent trees were removed at wrap. Kept: #1928 (`agent-a956129cc31d703a5`), #1929 (`agent-a5a565bae8b5cecb0`), #1448 (`agent-a036efcbcbcb1c8b0`), `rev-1927*`/`rev-1928*`/`rev-1929*` and their bases under `~/.cache/scrml/review/s478-192{7,8,9}/base`, and the wrap trees. Some trees stay locked while this Claude process runs. Once it exits, bryan runs: `! cd ~/scrmlMaster/scrml && git worktree list | awk '{print $1}' | grep -E '/worktrees/(agent|rev|wrap)-' | grep -v a036efcbcbcb1c8b0 | xargs -r -n1 git worktree remove -f -f && git worktree prune`. Wait until #1928 and #1929 have merged.
- **Review probes:** `~/.cache/scrml/review/s478-*`. Runner: `bun ~/.cache/scrml/review/s478-1886/probes/run.mjs <absTree> <probe.mjs> [filter]`. A `.probe.test.js` runs as `TREE=<tree> bun test ./<file>`.
- **Lane rules for briefs:** `~/.cache/scrml/review/s478-lanes/COMMON.md`.
