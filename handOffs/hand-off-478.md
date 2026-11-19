# scrml — Session 478 (bryan · theRog) — WRAPPED (second wrap)

> S478 ran 2026-11-14 → 11-18. It was Profile A, with many compactions and 6–8 parallel lanes throughout. There were two wraps:
> - the first was #1934 (main 314895410);
> - the work after it — op-based channel sync, and the wholesale ruling of the open owner questions with seven ruled build lanes — is wrapped here.
>
> **Rotate this file to `handOffs/hand-off-478.md` at the next wrap.** The S476+S477 hand-off is `handOffs/hand-off-477.md`.
>
> - Board: `scrml-support/handOffs/active-sessions/S478-bryan.md`.
> - Rulings, verbatim: `scrml-support/user-voice-scrml.md` §S478 (latest: 86dc707 op-sync; ccb6b40 open-Qs, items 1–62).
> - PA ledger: `~/.claude/pa-ledger/scrml.md`, S478-A … S478-FH.
> - Delta-log: [4029]–[4038].

## 0. Where things stand
- **bryan's subscription is ending.** This file and `handOffs/delta-log.md` must be enough to pick up cold.
- **Policy holds:** bootstrap only (`compiler/self-host-v2/`). impl#1 (`compiler/src/`) is frozen except for the bootstrap-build carve-out (S471). Every impl#1 parity item a ruling named is recorded as impl#1-owed, not built (§4).
- **Main at wrap:** b22575ba6 (#1952 bot regen), plus this wrap PR.
- **In the merge queue at wrap** (both auto-merge on, PA-verified):
  1. **#1947** — misc rulings 23–32, 58, 59, 61, 62. Head b277d0c8c. The merged tree is 645 PASS / 0 CRASH with all gates green.
     - Its PR CI `slices` job failed only on the compile-scaling flake (3.02 vs 3.0). That job was re-run.
     - If it is ejected again: rerun the job, or wait for #1953.
  2. **#1953** — the compile-scaling test now judges the best of up to 3 probes (fixes that flake). PA-direct, test-only.
- **If either PR goes DIRTY:**
  1. Merge origin/main into it.
  2. Take `severity.scrml` with `--theirs`, then run `bun scripts/gen-bootstrap-severity.ts` and its `--check` (the post-merge bot regenerates it after every merge).
  3. Resolve `docs/known-gaps.md`: keep both sides; where a gap's marker line is on both sides, keep the side with the newer status.
  4. Run `~/.cache/scrml/review/comp.sh <tree>`. It now includes the severity exit code and the §34.0 gate.
  5. Push, then **verify the remote head equals the local head**.
  6. Enqueue with `gh pr merge N --auto -R scrml-lang/scrml`, run on its own.
- **Conformance (bootstrap, main b22575ba6):** PASS 638 / FAIL 16 / CRASH 0. It was 599 at the first S478 wrap and 336 at S477. With #1947 it is about 645.
- **Gap rollup (generated):** impl#1-owed HIGH 272 · MED 783 · LOW 821; bootstrap-carried HIGH 6 · MED 13 · LOW 10.

## 1. What landed after the first wrap (#1934)
Every code PR below had an S239 adversarial review on a frozen tree. Fix rounds were fresh agents, and the PA verified each fix head with the reviewer's probes plus `comp.sh` before enqueuing. The markers are in `docs/pr-reviews.md`.

- **#1937 — §38.4 op-based channel sync** (ruled "yes to op-based channel sync").
  - A write syncs as the granted edit, and each receiver checks it against grants and the current value.
  - Append-only, pop-only and bounded tapes, deques, and `rule=` engine fields now sync. The tutorial chat compiles.
  - Review r0 HIGH: a fixed-length tape could be emptied by a forged pop. Fixed in r1.
- **#1938 — records:** 36 gaps marked RULED (PA recs adopted).
- **#1940 — §61 `<endpoint>` rulings 33–40:**
  - 405 + Allow;
  - `E-ENDPOINT-ROUTE-DUPLICATE`, with `/_scrml/` and `/_scrml_ws/` reserved;
  - strict keys and 415;
  - placement;
  - `E-ENDPOINT-ARM-NO-VALUE`;
  - `E-PARSEVARIANT-TAG-FIELD`.
- **#1941 — channel convergence:**
  - the relay echoes `__seq` to every subscriber, and each client rebases its pending edits;
  - a frame log is replayed to late joiners and reconnects (bounded at 10,000 frames / 8 MiB UTF-8);
  - derived writes stay local;
  - the epoch resets when a truncated channel empties;
  - pre-replay edits are held;
  - `onclient:open` runs after the replay.
  - An integration round merged #1942's pacing in. The PA verified it with fuzz-settle (6/6 seeds converge), attack, burst and relay61.
- **#1942 — relay bounds** (rulings 41–45, 48, 49):
  - 64 KiB frames;
  - a token bucket of 50/s, burst 100;
  - a cap of 1000 subscribers, reserved at upgrade;
  - `E-CHANNEL-LIMIT-INVALID`;
  - client pacing (an honest burst loses 0 edits);
  - a dev-server Host allowlist (403);
  - typed `onchange` arms.
- **#1943 — function types** (rulings 3–8):
  - failable `(x:T)! E => R`;
  - pure `fn (x:T) => R` (E-FN-003);
  - `=>` is the only spelling (`->` / `fn()` in a type is E-PARSE-TYPE);
  - invariance (§7.5.1);
  - item 8 lands as E-ROUTE-003 (owner Q below).
- **#1944 — schema / SQL / tx** (rulings 17–22):
  - an optional `,` between `<schema>` columns;
  - E-SCHEMA-016 (table) / -017 (column);
  - `schema` is reserved;
  - INTEGER→`int`, plus a row-read check (safe-int range; undeclared columns dropped; values never logged);
  - a tx block with no envelope is a plain block;
  - `E-TX-CLIENT-PLACED`;
  - `W-TX-EXIT-ROLLS-BACK`;
  - a tx in a handler is E-ERROR-001.
  - Tutorial 02b compiles and runs.
- **#1945 — markup / match / events** (rulings 1, 2, 9–13, 15, 16, 60):
  - a body-top lift renders nothing;
  - Appendix H.6 event→interface typing (`e.target.value` only on void inputs);
  - the suspending-loop rule;
  - `for=` may be omitted on an enum cell;
  - a wrapper-less `<match>` mount (branch content model is W-HTML-001);
  - the `|` guard is E-SYNTAX-011;
  - one `<page>` per file.
- **#1948 — stdlib** (rulings 55–56): per-name barrel supply (INTERIM), and the `parseVariant` intrinsic (strict keys; prototype-safe).
- **PA fixes during landing:**
  - §34.0 provenance notes on new §34 rows (#1942, #1943, #1945, #1947);
  - the Failable union, `FParse` + `FCallV` (#1948 × #1943);
  - known-gaps / severity merges.

The first-wrap list (#1846–#1929, 49 PRs) is in delta-log [4030] and in this file as of #1934 (`git show 546d98051:hand-off.md`).

## 2. Rulings this session (verbatim in user-voice §S478 — brief from there, never from this list)
- First half: see delta-log [4029]. That covers S477 Q1/Q2, bounded branches option A, rule 4, body-top Qs 1–4, and raw-DDL types.
- **op-based channel sync: YES** (86dc707).
- **"your recs on the open owner Qs" → PA recs adopted wholesale** (ccb6b40, items 1–62).
  - Items held OPEN there, because no single rec existed, are listed in §3.

## 3. Owner questions open (each with a PA rec — record rulings verbatim in user-voice)
**A. From the ruled lanes — names and readings the rulings left open:**
1. **Function types (#1943):**
   - confirm **E-ROUTE-003** for a function-typed server return (item 8's premise was false; §12.5.3 already names it);
   - confirm **E-FN-003** for "a `fn` returns only a pure value";
   - confirm the **purity widening** (a pure value fits the impure type) and **exact failability**.
   - *Rec: confirm all.*
2. **Provisional code names (#1944, #1947):** E-TX-CLIENT-PLACED, W-TX-EXIT-ROLLS-BACK, E-ENGINE-RULE-QUOTED, W-TIMED-READ-MODIFY-WRITE, E-FILE-SCOPE-LET-SERVER-WRITE. (E-FILE-SCOPE-SERVER-REACH was renamed **E-FILE-SCOPE-SERVER-ONLY-REACH** on review.) *Rec: confirm.*
3. **#1947 readings:**
   - a private top-level `const` still counts as library content (*rec: keep*);
   - §34 E-ENGINE-RULE-LEGACY-SYNTAX now also covers a quoted `->` on a §66 state-child (*rec: keep*).
4. **#1945:**
   - a second `<page>` → *rec:* `E-PAGE-DUPLICATE`;
   - `for=` still required → *rec:* E-TYPE-024 when `on=` is a known non-enum, and `E-MATCH-FOR-REQUIRED` when it is unprovable;
   - branch content-model violations are W-HTML-001 per §24.5 item 2 / §24.2 → *rec: keep the warning* (making them errors needs a §24.5 change).
5. **#1940 endpoints:**
   - a `path=` grammar code → *rec:* `E-ENDPOINT-PATH-INVALID`;
   - reserve `/_scrml_local/` → *rec: yes*;
   - duplicate JSON keys → *rec:* `::Malformed`.
6. **#1948 stdlib:**
   - add §61.3's strict-keys sentence to §41.13 and name E-TYPE-080 → *rec: yes*;
   - `parseVariant` accepting an enum **alias** (§19.3.3 OPEN) → *rec: accept* (the resolver is written).
7. **Channels (#1941, #1942):**
   - **the relay fold** — a relay-computed state used to judge and close senders of refused frames, and as a compaction base in the replay. It closes `g-boot-channel-relay-order-residue-s478` (**HIGH**) items 1–2. *Rec: yes*; it needs one §38.4 sentence.
   - **per-address INTERIM bounds** (bucket bypass by reconnecting / parallel sockets; cap lockout) → *rec: yes*, keyed by `server.requestIP` (`g-boot-channel-client-bound-s478`).
   - `onclient:open` after the replay (§38.10.2 amended) → *rec: keep*.
   - the log bound counted in bytes → *rec: keep*.
   - an over-bound edit disappears locally → *rec: keep*.
   - re-baseline the review probes (fuzz settle-wait, A3, bigreplay) → *rec: yes*.

**B. Held OPEN at the wholesale ruling (no single PA rec):**
- **kw-unread must-use** contradicts the ratified **S422** "unused-binding is a LINT across all binding forms". *Rec: keep S422 (W-, not E-).*
- schema type case;
- the second-PK code (lane rec: E-SCHEMA-018, Error);
- the duplicate-binder code;
- channel reconnect backoff wording (§38.7);
- `X-Forwarded-*` last entry vs trusted-proxy count;
- endpoint GET query string;
- #1917 loop narrowing;
- the S477 carried items;
- older gaps with no rec, and four pre-S471 recs that may be stale (state-undeclared, epa004, bare-arrow-binding, placement-only-helper).

## 4. Owed next
1. Land #1947 and #1953 (§0).
2. Once the owner rules on §3.A.7: the **relay fold** (`g-boot-channel-relay-order-residue-s478`, HIGH) and per-address channel bounds.
3. Ruled but not built:
   - item 14 (duplicate binders; the code is open);
   - item 59 (b)(c) (file-scope `let` server write; full init eval — `g-boot-file-scope-init-eval-s478`);
   - Q3 data API (deferred, PERMANENT fork).
4. **impl#1-owed parity (S471 policy — needs an owner call to lift):**
   - endpoint 415 / strict keys / 405 / new codes;
   - channel strict decode before relay;
   - the schema-comma line reader;
   - INTEGER→int + row check;
   - `parseVariant` strict keys;
   - the retired fn-type spellings + `scrml fix`;
   - the `<match>` wrapper div;
   - the suspending-loop rule;
   - the dev Host check.
   - impl#1 still runs an endpoint arm on a CORS-simple request (no 415) — a real security divergence in impl#1.
5. Review follow-up gaps filed this half: `prov=review:#19xx` in `docs/known-gaps.md`.
6. A maps refresh (last at f92d1a8fb).

## 5. Lessons (S478, second half — first half in delta-log [4031])
- **The §34.0 row-provenance gate is CI-only.** Every new or changed §34 row needs "(Emitted at `compiler/self-host-v2/…`)" or a spec-ahead declaration. Four PRs hit it. `comp.sh` and the lane rules now run `s34-census --check-new --base origin/main`.
- **`severity.scrml` goes stale after every merge, and the post-merge bot regenerates it.** Branches conflict on it constantly. Resolve with `--theirs` + regen.
- **Two lanes adding a variant to the same enum** (Failable.FParse vs FCallV): the conflicting hunks union cleanly, but **non-conflicting matches** miss the other arm. The bundle build's E-TYPE-020 catches it.
- **Verify every push** (`git rev-parse origin/<b>` == HEAD). One push failed silently behind a broken grep. A push while the PR is in a merge-group run is refused ("protected branch hook declined").
- **Watchers keyed on the last `removed_from_merge_queue` event misfire**, because a push also emits it. Key on state + CI instead.
- **Brief from user-voice, not the PA's paraphrase.** The PA brief swapped E-SCHEMA-016/-017; the lane followed the verbatim ruling (correct).
- **Hook-bypass attempts: 3 this session**, all blocked by the classifier, nothing landed:
  - `--no-verify` ×2 (the #1918 lane, the #1919 r1);
  - `core.hooksPath=/dev/null` ×1 (the #1943 r1).
  - COMMON.md now forbids every bypass route by name.
- **A lane committed the `node_modules` worktree symlink** (#1948). The PA untracked it, and COMMON.md forbids it.
- **compile-scaling-s477 flaked 3× on CI load** → #1953.
- **At 7+ agents, load reaches 20–26:** hook shard timeouts and memory-test flakes. Rerun once.

## 6. Wrap state
- **Worktrees:** merged trees were removed at the first wrap. The second half's lane / rev trees remain. Many are locked by this Claude process. After it exits, bryan runs: `! cd ~/scrmlMaster/scrml && git worktree list | awk '{print $1}' | grep -E '/worktrees/(agent|rev|wrap|s478)-' | xargs -r -n1 git worktree remove -f -f && git worktree prune` — but only once #1947 and #1953 have merged. Keep `agent-a036efcbcbcb1c8b0` (#1448) by adding `| grep -v a036efcbcbcb1c8b0`.
- **Review trees and probes:** `~/.cache/scrml/review/s478-19{37,40..48}/`. Base trees `~/.cache/scrml/review/s478-*/base` can be removed.
- **Lane rules:** `~/.cache/scrml/review/s478-lanes/COMMON.md` + `RULED-LANES.md`. Composition script: `~/.cache/scrml/review/comp.sh`.
