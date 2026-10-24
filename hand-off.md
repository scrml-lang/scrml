# scrml — Session 469 (bryan · theRog) — WRAPPED

> S469 ran 2026-10-17 → 2026-10-24 on theRog, Profile A, as one long session across many compactions and two machine deaths. S468's hand-off is at `handOffs/hand-off-468.md`; rotate this file to `handOffs/hand-off-469.md` at S470 boot. Board: `scrml-support/handOffs/active-sessions/S469-bryan.md`. Rulings are verbatim in `scrml-support/user-voice-scrml.md` (S469 entries).

## 1. What landed (44 PRs, excluding FACTS-bot regens)
**Security (impl#1, S435 limb)**
- #1476: one reader for template interpolations.
- #1481: engine and `<match>` bodies are walked.
- #1491: nested and lifted `<each if=>`.
- #1502: row `if=` is reactive.
- #1508: removed rows and arms dispose their effects.
- #1514: soft-nav build identity.
- #1517: lifted-markup `if=` is a real render gate.
- #1524: match-arm commas go through one arm reader; payload variants dispatch by tag.
- #1529: a lifted `if=`/`show=` guard re-reads what it reads.
- #1534: keyed-row control-flow `if`/`match` is re-evaluated; the loop region removes by range.

**Refusals, under the "Refuse them in impl#1" precedent**
- #1496: ruled forms impl#1 doesn't implement.
- #1521: engine in an `<each>` row.
- #1526: engine under an `if`/`else` chain.

**Bootstrap (`compiler/self-host-v2/`)**
- #1486: string methods, `T.parse`.
- #1493: O10 `write` grant.
- #1497: logic templates.
- #1510: `;` and arm `,` enforced.
- #1515: `#{}` CSS end to end.
- #1520: §7.2.2 termination rulings.
- #1528: one tape-grant reader.
- #1530: structural grant scan; enum payloads are values (ruled).
- #1536: loop value form: bound loops and Tier-0 `${ for … lift }`.

**SPEC and conformance:** #1477, #1479, #1483, #1494, #1500, #1512, and batches #1487 and #1501.

**Docs:** #1485, #1489 (bootstrap-gated ruled dialect), #1499, #1505 (claim-gate blocking).

**Tooling and test:**
- #1478: lsp-boot.
- #1480: merge driver.
- #1482, #1484: hook ~30% faster.
- #1498: hook runs the bootstrap slices.
- #1507: hook timeouts.
- #1511: browser tier, CI baseline 48 → 8.
- #1523: Windows doc-gate tests.
- #1532: the recurring hook flakes fixed at their causes.

## 2. The last two security lanes (both landed at wrap)
Both agents were cut off mid-round by a usage limit and resumed. The outcome is recorded in §2a; if §2a is empty, treat both as parked.

| branch | head | state | resume |
|---|---|---|---|
| `s469-server-return-match-await` | `18f72b888` | **LANDED as #1539** (queued at wrap). 6 dev rounds. The r6 final review was FIX on three `_ e` allow-list escapes that are IDENTICAL on main (not regressions). It landed because it is a strict improvement: pack head 5 FAIL vs 158 on main. | **Follow-up lane (security, HIGH):** `g-impl1-whole-error-binder-allowlist-escapes-s469`. (1) resolve the audited callee lexically, not by file-wide name; (2) recompute `logIsBuiltin` inside an audited function; (3) refuse a payload-field member read on ANY enum-typed value (E-TYPE-004), which closes the constructor re-extraction. Probes: `~/.cache/scrml/review/return-match-r6-keep/`. |
| `s469-structural-else-guard` | `b40d4898e` | **LANDED as #1538** (queued at wrap). 6 dev rounds; the PA verified r6 itself instead of running a 7th review: gates and pack + differential pass (2522/0). | If #1538 failed CI, check it first. |

### 2a. Outcome at wrap
- **Queue order:** #1538 then #1539. Both raise `EXPECTED_SHAPE_COUNT` in the security pack, so whichever lands second needs a re-merge. The count = main's 910 + n27 553 + return-match 457 = **1920**.
- **Next security lanes, in order:**
  1. The `_ e` allow-list escapes above.
  2. The ruled render-position refusal (§4).
  3. The HIGH gaps in §4.

## 3. Owner questions queued for bryan (with PA recommendations)
1. **§18.6.1 `_ e` allow-list.** impl#1 now refuses uses the SPEC text allows: untyped helpers, local aliases, cell writes. Rec: ratify the allow-list as the §18.6.1 rule, since a deny-list can't be made complete.
2. **Runtime size ratchet.** Main sits exactly at its ceiling after #1534 (8,432 B vs 8,433 B). The next runtime addition needs a ruling to raise it.
3. **Loop value form** (bootstrap, #1536):
   - (a) A statement-position arm-block `lift` inside a bound loop: does it go to the loop (§49.6 r7) or is it an error? The value position already takes §18.5.
   - (b) Which codes for an operand `for`, a non-sole Tier-0 loop, and `return`/`fail` in a Tier-0 loop?
   - (c) Re-target conformance `ctrl-010-else-on-for-without-lift-neg`? It now gets E-LOOP-007 + E-VALUE-WRITES-STATE, as §49.4.4/§6.15 require.
   - (d) Union tapes.
4. **Tape grants**, in `docs/changes/s469-boot-tape-grants-2/progress.md`:
   - Q1: reset of a `replace`-less tape field (rec: refuse with E-WRITE-NOT-GRANTED).
   - Q2: call-site subset code (rec: E-WRITE-NOT-GRANTED).
   - Q3: fresh arguments.
   - Q4: a classifiable shape in a replace.
   - Q5: persist restore.
   - Q6: elements of a tape of structs (rec: treat as fresh values).
   - Q7: const rebind double code.
   - Q8: F3 snapshot = "kept".
5. **CSS, six items:** `!important` internal vs interop; flat blocks outside the root; top-level `#{}` without `<program>`; per-instance `@field`; bool/enum through the bridge; the `style=(expr)` guard.
6. **Statement `match`/`!{}` whose arms are all pure → E-STMT-NO-EFFECT?** Rec: yes.
7. **Provisional code name** `E-IMPL1-LIFT-GATE-UNTRACKED`.

## 4. Owed lanes and gaps (priority order)
- **Ruled, unbuilt:** server/async call in a render position (`if=${asyncFn()}`, `${match check()}` in markup, derived cell) → refuse in impl#1 (user-voice 69d6636). Whole class `g-markup-gate-tests-server-call-promise`. The return-match branch's pack pins 5 KNOWN_FAIL shapes for it.
- **HIGH security gaps, filed this session and open:**
  - `g-unregistered-upper-tag-if-ssr-first-paint-s469`: `<Type if=…>` ships its content in the SSR HTML.
  - `g-lift-markup-parser-dropped-value-and-case-variant-s469`: lifted markup's separate parser.
  - `g-lift-group-and-arm-call-reads-not-reactive-s469`.
  - `g-impl1-async-colouring-ignores-local-shadow-s469`.
  - `g-while-lift-in-reconciled-row-escapes-the-row-s469`.
- **Other HIGH:** `g-impl1-regex-after-binary-operator-lexed-as-division-s469` (lexer-wide, silently different regex).
- **MED:**
  - `g-cross-file-engine-mount-importer-emits-no-html-s469`.
  - `g-library-tool-cross-file-import-source-path-s469`.
  - `match @role` in a nested loop in a keyed row skips E-TYPE-025 and renders nothing.
- **Bootstrap next:**
  - `lin`;
  - loop wait/defer;
  - loop head surface;
  - let-decl in a db/channel body;
  - method on a call result and receiver narrowing;
  - int → string conversion (ruling-gated);
  - md static;
  - stdlib import.
- **LOW tooling:**
  - s34-census can't resolve `.scrml` symbols (cite path:line);
  - `g-sql-fallback-handle-not-reset-after-compile-s469` (compiler-side);
  - the `parser-flag-retired` flake is unreproduced.

## 5. Lessons this session (memories saved)
- **Constrain to the proven path** (`feedback_constrain_to_proven_path`). In four security lanes every round-N FIX came from new machinery: a smarter reader, a carve-out, a region, a regex scanner. The existing path never broke. Briefs must say to reuse it (the markup tokenizer, plain lowering, main as the oracle) and to refuse what it can't cover.
- **The hook is not CI** (`feedback_hook_is_not_ci`). types-gate, s34-census and e2e-render-map are CI-only; run the CI job commands before landing.
- **`/tmp` is RAM** (`feedback_tmp_is_ram`): review trees go in `~/.cache/scrml/review/`.
- **Hooks run from the main checkout** (`feedback_hooks_path_main_checkout`): keep it on current main.
- **The by-name enum lookup kept resurfacing** (3×) in return-match: one resolver, called everywhere.

## 6. Housekeeping at wrap
- Maps: refreshed at wrap; watermark `e0c4ad6cc` (commit cdad9998d).
- scrml-support: ~50 commits pushed at wrap (user-voice rulings, bootstrap map feedc95, board).
- **Worktrees:** the wrap sweep removed 120 that were clean and already merged. 45 remain:
  - the in-flight return-match branch;
  - 7 locked;
  - ~5 review trees holding untracked scratch (not force-removed);
  - 4 dirty and 19 unmerged older S467/S468 branches. These hold unlanded commits; triage them before deleting.

  The classification is in `~/.cache/scrml/wrap-sweep.txt`.
- bryan's `docs/readme/note-from-the-dev.md` is stale; it needs his own wording.
- Don't commit `tryit/` (bryan's).
