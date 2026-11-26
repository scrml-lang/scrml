# scrml — Session 482 (bryan · theRog) — WRAPPED

> S482 ran 2026-11-21 → 11-26. Profile A. Rotate this file to `handOffs/hand-off-482.md` at the next wrap. The S481 hand-off is `handOffs/hand-off-481.md`.
>
> - Board: `scrml-support/handOffs/active-sessions/S482-bryan.md`.
> - Rulings, verbatim: `scrml-support/user-voice-scrml.md` §S482 (about 30 entries). Brief rulings from there, never from this file.
> - PA working ledger for the session (fuller per-PR history, review paths): `~/.claude/pa-ledger/scrml.md`.
> - Briefs: `~/.cache/scrml/review/s482-briefs/`. Reviews: `~/.cache/scrml/review/s482-<PR>*/review.md`.
> - Delta-log: [4054]–[4080].

## 0. Where things stand
- **Policy holds:** bootstrap only (`compiler/self-host-v2/`); impl#1 frozen except the ruled carve-outs (endpoint, URL/CSS attributes, gate health, `scrml fix`).
- **Main at wrap:** 3bee3e2f8 (after #2113 and #2115; + this wrap PR).
- **Bootstrap conformance on main:** PASS 851 / FAIL 3 / CRASH 0 (verified at wrap on 3bee3e2f8, `bootstrap-conformance --json`, 1973 cases; S481 wrap: 767 / 3).
- **Run-order model (c) is the governing model** (⭐⭐ S482-runorder-model-c; SPEC §7.6 R1–R6): computing a value never writes state; the body spine is setup code; effect/request runs are held until the body ends (Q6), dropped if it traps (Q18).
- **Retired-forms ledger + gate** (#2101): `compiler/retired-forms.json` + `scripts/retired-forms-lint.ts` read every SPEC/doc fence (marked 14 lexer cross-checked by commonmark 0.31.2; disagreement = exit 2). Baselines equal actual counts; 907 HARD-form occurrences are dated debt (P1 below). This answers the owner's trust concern ("if I cant trust that language rulings from that long ago are being honered…").
- **Lane cap 3** held; no oomd kill. Two agents died on network errors (`EAI_AGAIN`) and one Claude Code restart; all resumed via SendMessage with no loss.
- **Disk:** 42 spent worktrees removed at wrap; review cache trimmed 17 → 11 GB (probe sources and review.md kept).

## 1. In flight at wrap
1. **#2116 mount-reach follow-ups** (branch `s482-mount-reach-fu`, head **9fdaa7925**) — OPEN, not landable yet. Shared instance constructed at its first body reference (R4); self-rendering `<*f/>` named (E-BOOTSTRAP-UNSUPPORTED INTERIM + cycle guard, new gap g-boot-star-self-render-s482); #2112 r1 NIT-2.
   - Review: **FIX-small** (falls back to LAND-W-F/U) — `~/.cache/scrml/review/s482-2116/review.md`.
   - **Next: one small fix round** (fresh agent):
     - F1 MED — in `print.scrml`, `reachOf`'s new shared-ref branch follows only fields seeded at construction, using bodyInits' `pre` predicate `(f3.wcap is given || constSeedField(p, f3))`. The reviewer built and tested it: fixes x01 / x01c / x12; 795 probes otherwise byte-identical.
     - F2 LOW — correct the "only a function's reference still hoists" wording in SPEC + the gap.
     - F4 LOW — the "without end" message overstates; give c05 (a component mounting itself: stack overflow at load, base too) its own gap id.
   - Then a light re-review and land. Check the windows job: it path-skipped in 30 s (F6).
2. **#2113 r2 re-review follow-ups** (landed; `~/.cache/scrml/review/s482-2113-r2rev/review.md`): NIT italics in §7.6 "Not covered", the optional a11 clause, q67 in the MED-A sentence → fold into the **Q20 body-cell lane** (§4 item 3).
3. **#2115 r1 re-review INFO** (landed; `~/.cache/scrml/review/s482-2115-r1rev/review.md`): two citations for the emit expression-form refusal — tidy when §22.5 is next touched.

## 2. Rulings this session (verbatim in user-voice §S482)
- ⭐⭐ S482-runorder-model-c (+ riders) — value positions never write state; body spine is setup; R1–R6 in §7.6.
- Q1 circular server-only = largest consistent set · Q2 `of` adjacency · Q3 `x is T.V` · Q4 `meta.get` typed · Q5/Q7/Q9 records · Q6 hold effect/request runs until the body ends · Q8 trapping init (INTERIM build owed) · Q10 registry client types · Q11 host calls unproven in `<effect>` + run cap · Q12 outside-body cells seeded before the body, link order · Q13 locked field derived iff it reads a cell (else a constant seeded at the mount).
- /} closer: Appendix E governs (retired) · `::` deprecated (W-VARIANT-COLONS-LEGACY) · retired-forms audit R1–R5.
- Q16 E-CONTRACT-003 advises a derived check · Q17 held load dated at its trigger · Q18 drop held runs when the body traps · Q19 build W-DISPLAY-UNTRACKED.
- Q20 body cells classified for server-only like file-scope (build queued) · Q21 cross-field struct invariant = a fifth §66.13 contract kind (syntax NOT ruled — proposal below) · Q22 quoted attribute/opener values follow the §4.18.3 escape catalog.
- PA-ruled readings are labelled prov=pa-ruled in SPEC and listed in user-voice §S482 "PA-ruled".

## 3. Landed this session
41 PRs (+ the S481 wrap #2048) + 29 bot regens (#2049 #2050 #2052 #2055 #2057 #2059 #2062 #2064 #2065 #2068 #2070 #2073 #2074 #2077 #2081 #2084 #2086 #2090 #2091 #2094 #2097 #2099 #2100 #2102 #2104 #2108 #2109 #2111 #2114). Every code PR S239-reviewed on a frozen tree; markers in `docs/pr-reviews.md`. S481 lanes #2041 #2045 #2046 landed here.

**Run order (§7.6 R1–R6)**
- #2041 — the program body runs once, in source order (S481 lane).
- #2053 — seeds in place; later place = E-SCOPE-001; acting init in a construct refused (3 rounds).
- #2063 — E-SCOPE-001 when a seed reaches a later binding (`bind:` + gathers, 2 rounds).
- #2071 — event handlers no longer make the printer run a binding before its place.
- #2076 / #2079 — small follow-ups; non-acting construct initializer runs just before the construct.
- #2082 — place follow-ups (4 rounds; PA-ruled r3 back to base's fail-closed seed rule). #2088 — `effect deps=` are mount code.
- ⭐⭐ #2096 — run-order model (c): A1 value positions never write, A2 spine is setup, A3 E-DERIVED-READS-UNTRACKED (3 rounds).
- #2106 — Q6 body hold + Q17 + Q18 (drop on trap); construct-request INTERIM deleted.
- #2107 — W-DISPLAY-UNTRACKED (Q19; 3 rounds).
- #2105 — Q12 outside-body cells before the body, Q13 locked-field constant at the mount (4 rounds + sync; closed an outer-cell secret leak).
- #2112 — instance mount judged at the use's place (R2; 2 rounds).

**Security**
- #2061 — client artifact holds only what the client runs; server-only init gets a server artifact (2 rounds).
- #2093 — reflect registry holds only client-used types, identity-keyed (Q10; 3 rounds).
- #2113 — a binding the client only writes is judged by reads: shells, no secret in the client (3 rounds).

**`^{}` meta**
- #2045 — phases 0+1 (static checks, compile-time interpreter, emit splice; 6 rounds, coarse backstop per owner).
- #2067 — phase 2 runtime `^{}`. #2080 — phase 3 reflect / TypeInfo / `meta.subscribe` (4 rounds).
- #2089 — Q11 host calls unproven in `<effect>` + run cap.

**Retired forms + meta-records**
- ⭐ #2101 — retired-forms ledger + gate (R3/R4/R5, Q16; 7 rounds).
- #2095 — `/}` closer retired (Appendix E). #2103 — `::` deprecated (R2), corpus migrated.
- #2110 — quoted-value escapes fail-closed INTERIM. #2115 — Q22: quoted values follow the §4.18.3 catalog.

**Parser / self-host / `scrml fix`**
- #2046 #2051 #2054 — self-host off `while`; `--loop-interim` capture checks.
- #2056 #2058 #2060 #2066 — keyword-named members, contextual names, `as.value` adjacency, `/` after `as`, `lin`/`of` names; self-host parses to the end.
- #2069 — RCDATA `${}` text. #2072 #2075 #2078 — `|` alternation + follow-ups.
- #2083 #2085 #2087 — parser lows.

**Rulings records**
- #2092 — Q1/Q2/Q3/Q4/Q5/Q7/Q9 records, `of` adjacency, `x is T.V` (2 rounds). #2098 — follow-ups (2 rounds).
- #2048 — S481 wrap.

## 4. Owed next (recommended order)
1. Land what §1 leaves open.
2. **Q21 owner decision** on `~/.cache/scrml/review/s482-struct-invariant/proposal.md` (3 sub-decisions: `invariant (expr)` after the closer; per-write check with spread as the grouped write; bound input refused/snaps back). Then build in ~3 lanes (1.8–2.8k lines). Also add a supersedes line for S440 → S477 (refused write traps).
3. **Q20 build:** body cells under §7.6 rule (b) (gap g-boot-body-unread-cell-server-only-s482, probe n31 pinned). Same code as #2113 (landed) — fold in its r2 follow-ups (§1 item 2).
4. g-boot-shared-instance-reach-hoist-s482 function half (judge r10/r11 at their place, then drop functions from `constructedElsewhere`); g-boot-star-self-render-s482 needs an owner ruling (normative code vs a bound).
5. Q8 trapping-init INTERIM refusal (ruled, not built).
6. Owner questions not yet asked: Q14 request body reaching a host fn (rec: hostChain in requestPass); Q15 render-path host-call hang HIGH (rec: render-queue cap now, hostChain over interpolations).
7. R1 SPEC examples → current language, chapter by chapter; P1 hard-form debt (907: while, throw, for await, `<machine>` advice, rule=->, tape RHS, `.push`) in SPEC + conformance; stdlib dialect lane.
8. Small: bump marked ≥18.0.0 + re-prove wrappers (g-tool-retired-lint-marked-bump-s482); S458 R4 dot-chain example (`string.req.length(>=2)` → space form); g-boot-server-init-writes-client-binding-s482 W- diagnostic; `^{}` phase 3 residue; defer/outside-function-when-body-neg rewrite; g-fix-seed-guard-comment-s481; endpoint GET input; `is .V` narrowing; per-run timeouts in corpus differential drivers.
9. **Maps refresh** — not run S479–S482 (last at f92d1a8fb).

## 5. Lessons
- **Briefs must not widen a ruling.** #2107's brief quoted the ruling verbatim, then told the lane to count body-top writes too, contradicting S481; review caught it. Anything beyond the quote is "PA reading — prov=pa-ruled" or an owner question.
- **The SPEC must never overclaim.** Reviews caught four false SPEC statements this session (#2098 impl#1 measurement, #2101 banner zero-claim and marked-version reason, #2105 per-shape notes, #2113 "no observable change"). Direction-of-change notes need the probe evidence beside them.
- **Corpus usage is not design evidence** — counts measure breakage only.
- **Never merge without the final review**, however small the last round (#2101 r5: auto-mode denied it, correctly).
- **Memory starvation stalls reviews:** one review handed back with its probes unrun. Briefs now say "wait however long it takes".
