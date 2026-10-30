# s473-boot-ruled-refusals — progress

Lane A (S473): the compile-time refusals bryan ruled in S473, bootstrap only (compiler/self-host-v2).
SPEC text: PR #1682 (merged into main as 12e1cbb81) — codes and wording taken from it.
Tests: compiler/self-host-v2/slice-m4/ruled-refusals-s473.test.js (27 tests, every block red on base).

## Status
- [x] 1 transitive query envelope — analyze.scrml `txQuerySets` (closeDim over non-`!` call edges) + `envelopeDiags`; loops via `repeatsInBlock`
- [x] 2 E-SQL-JOURNAL-OFF — sql.scrml `journalOff`, analyze.scrml `journalDiags`
- [x] 3 D11 slots — `resolveSlot` (E-COMPONENT-020, E-DECL-SLOT-OUTSIDE-RENDERS; named slot refused, O9), `resolveUse` (E-COMPONENT-021)
- [x] 4 D12 O51 — `resolveUse` refuses a plain use of a render-less declaration (E-BOOTSTRAP-UNSUPPORTED citing O51)
- [x] 5 D13 I-TAILWIND-NOT-BUILT — `tailwindInfo` / `isTailwindClass`, once per compile
- [x] 6 D14 — `localCellClash` (E-NAME-COLLIDES-STATE) in resolveLocal / resolveForLocal
- [x] 7 legacy key= — resolveHtml refuses `key=` with the loop-header hint
- [x] 8 E-SQL-SLOT-IN-LITERAL / E-PARAM-TYPE-REQUIRED re-codes (a nameless/non-identifier param — the parser's recovery of a default/rest param — stays E-BOOTSTRAP-UNSUPPORTED)
- [x] 9 D10 — confirmed partially: refused forms all E-ASSIGN-POSITION (tests); the KEPT double-paren form is NOT built — the parser drops parentheses, so it is refused with E-ASSIGN-POSITION too (gap stays open)
- [x] corpus delta measured (see PR body)
- [x] gaps (6 resolved, 3 narrowed), coverage rows, regen (severity, gap counts, coverage totals, bootstrap-conformance.md), gates (slices, types-gate, s34-census, bootstrap-conformance --check, spec-coverage-check, claim/snippet gates, e2e-render-map)
- [x] PR

## Existing tests changed (newly-rejecting per the SPEC)
- loop-wait-s471: a query in a loop of a `!` fn → `.nobatch()` (interim refusal, §8.9.2).
- server-await-probes{,-review}: c6 UPDATE + check()'s SELECT = 2 transitive queries → `.nobatch()`.
- error-rulings: a local `n` named like the cell `n` → renamed `k` (D14).
- re-codes: front / typer* (E-PARAM-TYPE-REQUIRED), server / server-artifact (E-SQL-SLOT-IN-LITERAL), effect (E-COMPONENT-020/021 alongside), server-await-review code sets.

## #1690 review round (FIX-FIRST) + F10/F11 ruling — done
- F1 reach multiplicity (TxQ.runs); F2 comment-aware journalOff (subsetRead); F3 journal OFF over the `!` reach (bangReach + transitive writes)
- F5 case-insensitive named slot; F6 one code each (named slot → O9 only; lifted slot → E-COMPONENT-020)
- F8 legacy `key=` judged only on the lifted element (resolveRow); F9 message says the header key is not parsed yet; F12 for-of binder
- F10 (ruled) `!` callees count; F11 (ruled) E-TX-CLIENT-MULTI-CALL, permanent — SPEC §8.9.2 amendment, §19.10.5 rule + trigger, §34 row
- F4 filed g-boot-decl-body-markup-dropped-s473; F7 noted on the slot gap for a ruling refinement
- merged origin/main (#1691 lane B); conformance (strict grading) main 281/241/606 → head 283/241/604
