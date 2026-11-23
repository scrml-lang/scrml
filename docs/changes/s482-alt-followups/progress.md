# s482-alt-followups — progress

Lane: the LOW / INFO findings of the #2072 (`|` arm-pattern alternation, §18.2) review
(`~/.cache/scrml/review/s482-2072/review.md`). Bootstrap only. Branch from origin/main 4ec3e30c0 (#2072 merged).

## Items

- [x] LOW-1 — failable `match`: a wildcard alternation (`.Denied | else`) now counts its named error
  alternates as covered (analyze.scrml `resolveArms`) and lowers them as a failure arm running the
  same body (lower.scrml `errArms` / `altErrPats`). Before this the named alternates were dropped at
  lowering too, so accepting in analyze alone would have left `.Denied` unhandled (trap). Unnamed
  error variants are still E-MATCH-ELSE-ABSORBS-ERROR (tests both ways).
- [x] LOW-2 — `.NotFound | _ e` in a failable `match`: E-MATCH-ALT-BINDING only. analyze.scrml
  `altBindingRecovered` spots the parser's recovery placeholder and treats the arm as covering
  everything left (no absorb / E-TYPE-020 cascade).
- [x] LOW-3 — parse.scrml `patStartAt`: `not` / a literal / `-N` start a pattern only when followed by
  the separator or a `|` (what parsePattern reads), so `1 | 2 + 3 :>` is E-SYNTAX-011 (§18.10).
- [x] INFO-1 — reported: E-TYPE-023 for a redundant alternate of a wildcard alternation in plainMatch
  and resolveArms (`match` + `!{}`). SPEC §18.2 status note already said so; extended it to name the
  wildcard case and the LOW-1 behaviour. One #2072 test pinned the old W-MATCH-001-only behaviour
  (`.A | .B, .C | .D, .A | else`): updated.

## Tests

`compiler/self-host-v2/slice-m4/alt-followups-s482.test.js` — 13 tests; on base 4ec3e30c0: 4 pass
(controls), 9 fail; head: 13 pass.

## Gates

- pre-commit hook (commit be8e35ac8): 57965 pass / 0 fail, RESULT PASS.
- bootstrap-conformance --json, base 4ec3e30c0 vs head: PASS 820 / FAIL 3 / CRASH 0 both; 0 per-case changes.
- byte-compare + corpus differential (bootstrap, 2965 files under conformance/cases, examples, samples):
  0 newly rejected, 0 newly accepted, 0 artifact diffs, 0 code-set changes, 0 warning changes.
- s34-census --check-new --base origin/main PASS; types-gate --check OK unchanged; snippet-gate,
  claim-gate 0 fail; gen-md-shim --check current; corpus-compile-floor --check PASS.
- gen-bootstrap-severity --check: exit 4 on base AND head — header count only ("449" vs "450"), the
  #2072 merge's bot-owned header (review INFO-3); not touched here.
