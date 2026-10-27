# scrml — Session 470 (bryan · theRog) — WRAPPED

> S470 ran 2026-10-24 → 2026-10-26 on theRog, Profile A, as one long session across several compactions. S469's hand-off is at `handOffs/hand-off-469.md`; rotate this file to `handOffs/hand-off-470.md` at S471 boot. Board: `scrml-support/handOffs/active-sessions/S470-bryan.md`. Rulings are verbatim in `scrml-support/user-voice-scrml.md` (S470 entries).

## 1. What landed (26 PRs, excluding FACTS-bot regens)
All the compiler work was impl#1 security (S435 limb). Each lane got an S239 adversarial review on a frozen ref before landing.

**Waiting values: render, value and action positions (§13.7 / §13.8)**
- #1547: a waiting call in a render or value position is refused (E-VALUE-SERVER-CALL; ruled "uniform refusal"; benchmark/example rewritten in the PR).
- #1554: a server call in an action body is awaited, or refused where impl#1 lowers the body synchronously (new provisional code E-IMPL1-ACTION-NOT-AWAITED; ruled).
- #1558: async colouring resolves callees against the function's own scopes (closes the S469 local-shadow gap; tool per-function declaredNames).
- #1560: `when … changes` with an async body: newest run wins (§6.7.4). Runtime ratchet raised by the measured delta, per ruling ("allow raising the budget").
- #1566 + #1572: host `fetch` is a waiting value on every side (library and tool too, window aliases, `frames[n]`); markup in a const initializer is read.
- #1576: server calls in `!{}` handler ARMS are awaited (async hosts) or refused, every side.
- #1581: a lift-concurrent `Promise.all` batch element is the statement's own emission, so no server call sits unawaited under `?` / `!` / `&&` / a tape or object literal (closes the S441 HIGH `g-promise-all-batch-puts-unawaited-call-under-sync-operator`).
- #1577: action-body ordering (no fire-and-forget), waiting resets refused, async engine hooks get newest-run-wins; **impl#1 now emits E-ERROR-012** for a value-position fall-through arm (§19.4.3/§19.4.4; ruled "Emit E-ERROR-012"; 19 handlers in 13 conformance cases migrated).

**Error handling and enums**
- #1551: the three `_ e` whole-error binder allow-list escapes closed (shadowed callee / log, text-held arms, engine bodies).
- #1563: typed payload binders: field reads on an enum-typed value are refused, typed by the resolved type (ruled "(B) type the binders"; Tarjan SCC return inference).
- #1568: the `!{…} catch` statement form is refused (E-TRY-NOT-IN-SCRML; §19.1 "There is NO try/catch"); `!` statements are never swallowed or dropped (gapped `! {` → E-ERROR-014; a `!`-led line after a value line → E-STMT-UNEXPECTED-TOKEN, §7.2.2 rule 4). PA narrow-class rulings, corpus impact 0.
- #1571: `.variant` reads the tag on a unit variant; qualified `is` fixed.

**Tooling / docs**
- #1543 boot housekeeping · #1544 the boot's inbox-debt probe reads the `origin/inbox` branch · #1557 inbox-debt accepts peter and bryan as addressees (ruled).
- Gaps PRs after every landing: #1546 #1549 #1550 #1553 #1556 #1561 #1564 #1569 #1575 #1580.

**Gap ledger this session:** 11 HIGH resolved (incl. #1581's) (incl. `g-markup-gate-tests-server-call-promise`, `g-derived-cell-rhs-server-call-renders-promise`, `g-handled-error-arm-failure-writes-envelope-into-cell`, `g-impl1-whole-error-binder-allowlist-escapes-s469`, `g-impl1-action-body-server-call-unawaited-s470`, `g-impl1-bang-catch-try-body-cut-at-first-brace-s470`); about 50 new MED/LOW follow-ups filed; 1 new open HIGH (§4).

## 2. Lane J — Promise.all batch elements (landed at wrap as #1581)
Branch `s470-promise-all-batch-elements` (worktree `.claude/worktrees/agent-a96f66fa03c8035bc`). It targets `g-promise-all-batch-puts-unawaited-call-under-sync-operator` (HIGH): a lift-concurrent `Promise.all` batch element that sits under a sync operator / in a tape or object literal holds an unawaited Promise. Round 1 made batch elements use the statement's own emission (the F2 map-read fix) plus F4/F5. #1576 closed the expression-position `!{}` limb (h2/002). Reviewer harness: `~/.cache/scrml/review/s470-lj/` (R1–R6 F1 shapes in `p/s1.mjs`).
**Outcome:** round 2 (frozen a01238033) review LAND-WITH-FOLLOWUPS, executed. No shape logs in at head that rejects on base. f27 is 112 PASS (68 FAIL on base). The PA re-ran the pack: 5252 / 0. R26: 0 diagnostic changes. The agent finished its gates but never sent its report; the PA read progress.md and froze the head itself. Follow-ups filed in the wrap PR: `g-promise-all-batch-await-text-disables-batching-s470` (LOW, parallelism only) and `g-pattern-default-quoted-key-unquoted-s470` (LOW, fails closed). An F3 order note (pre-existing) is on `g-const-batch-parallelizes-side-effecting-server-calls` (MED); it is the next batch-scheduling item.

## 3. Owner questions queued for bryan (with PA recommendations)
1. **`when` cancellation scope (§6.7.4):** is a helper's continuation, called from a `when … changes` body, part of the cancelled run? Rec: yes. impl#1 currently gates only the body's own awaits.
2. **Engine hooks (§51.7.1):** keep and specify newest-run-wins for async state `effect=` / `<onTransition>`, as #1577 implemented? Rec: yes. The opener `effect=` still has no guard (`g-engine-effect-async-no-newest-wins-s470`, narrowed).
3. **`safeCallAsync` thunk as an awaited position (§13.8):** Rec: yes.
4. **Promise statics in §13.8** (`Promise.all/race/any/allSettled` over waiting values): name them in the rule or leave them to the host-promise table. Rec: name them.
5. **Enum payload field named `variant`:** it collides with the tag read. Rec: refuse the field name (needs a SPEC sentence).
6. **Is `.variant` a user-facing member?** #1571 made it read the tag on unit variants too. Rec: yes; document it in §18.
7. **§34 wording** for E-ERROR-014 (gapped `! {`) and E-TRY-NOT-IN-SCRML. impl#1 emits them; the rows need owner-approved text.
8. **Make the `windows` CI job a required check?** It caught a security fail-open (above) that no required check saw. Rec: yes. It costs about 15 min per PR, but it runs in parallel with the others.
9. **Carried from S469 §3** (still open): `_ e` allow-list as the §18.6.1 rule; loop value form (a)–(d); tape-grants Q1–Q8; six CSS items; statement match with pure arms → E-STMT-NO-EFFECT; the `E-IMPL1-LIFT-GATE-UNTRACKED` name. The runtime-ratchet question is answered for this session's security lanes only (user-voice 552a379).

## 4. Owed lanes and gaps (priority order)
- **NEW HIGH, Windows only (S470): `g-windows-imported-alias-chain-refusal-not-emitted-s470`.** The `windows` CI job has failed on main since #1563: 10 imported-alias cases in `enum-value-member-read-s470.test.js` get no E-TYPE-004. So on Windows a field read through an imported alias chain is not refused. The job is not required, so nothing blocked it. Do this first: trace the path-key mismatch, then decide whether `windows` becomes required (owner Q).
- **NEW HIGH (S470, pre-existing on base):** `g-impl1-null-in-expression-position-arm-not-refused-s470`. `(local(p) !{ _ :> [p].find(isOk) != null }) ? …` logs in with either password (library and fullstack). PA re-rated MED→HIGH (wrong-password login). Next security lane.
- **HIGH carried from S469, still open:**
  - `g-unregistered-upper-tag-if-ssr-first-paint-s469`;
  - `g-lift-markup-parser-dropped-value-and-case-variant-s469`;
  - `g-lift-group-and-arm-call-reads-not-reactive-s469`;
  - `g-while-lift-in-reconciled-row-escapes-the-row-s469`;
  - `g-impl1-regex-after-binary-operator-lexed-as-division-s469`.
- **MED follow-ups worth a lane:**
  - `g-const-batch-parallelizes-side-effecting-server-calls` (with #1581's F3 note: the batch has no side-effect / order test);
  - `g-when-changes-stale-response-s470` (narrowed);
  - `g-host-fetch-residue-s470` (narrowed);
  - `g-impl1-value-position-arm-fallthrough-s451` (narrowed: an untyped call tail like `log(m)` is still taken as a value);
  - a nested `<match>` in an arm is never mounted;
  - `String(enum) == str` is unchecked.
- **LOW over-refusals:** `g-impl1-action-not-awaited-over-refusals-s470` (`.then`, local-fn write, comma, C-for head), `g-impl1-e-error-012-text-scan-over-refusal-s470`, `g-impl1-e-error-012-delete-tail-unclassified-s470`, `g-match-arm-comment-text-over-colours-s470`.
- **Bootstrap next:** unchanged from S469 §4 (`lin`, loop wait/defer, loop head surface, let-decl in a db/channel body, method on a call result, int → string, md static, stdlib import). No bootstrap lane ran in S470.

## 5. Lessons this session
- **Verify a reported SHA before freezing a review tree** (`git cat-file -t`). One lane reported a FINAL_SHA that did not exist.
- **A worktree must run its own copy of `scripts/state.ts`.** Running the main checkout's copy from a worktree rewrites main's files.
- **Every security landing raises `EXPECTED_SHAPE_COUNT`:** the second of two concurrent landings always conflicts on the pack count and README. Keep both sides and re-sum. This happened on #1563, #1572 and #1577.
- **A lane that says "waiting on background work" can sit for hours.** Check its branch head, not just the notification (carried from S470-7).
- **Load-flake commits:** shard timeouts and a 6.6 s test against a 5 s limit failed the pre-commit hook under 8-lane load. A retry passed. These were not code faults.

## 6. Housekeeping at wrap
- Maps: refreshed at wrap; watermark `3d17013f8` (commit 31095e6c8). Detail sections below the stamps are still the S468 text.
- scrml-support: user-voice S470 entries pushed (ac299d1, 3f584ac, 552a379, e2e4c7a, 1b2f66a).
- Worktrees: the wrap sweep removed 56 that were clean and already merged. 31 remain besides the main checkout: lane J, the maps worktree, 2 locked, 4 merged-but-dirty (untracked scratch, not force-removed), 21 unmerged-clean and 2 unmerged-dirty older branches. The unmerged ones hold unlanded commits; triage them before deleting. The classification is in `~/.cache/scrml/wrap-sweep-s470.txt`.
- Open PRs not from S470: #1448 (spec §19.9.9.8, S468) and #580 (§38.1), both untouched.
- Don't commit `tryit/` (bryan's).
