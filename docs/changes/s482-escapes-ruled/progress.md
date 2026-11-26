# s482-escapes-ruled — progress

Branch `s482-escapes-ruled` from origin/main 7de593ce0. Bootstrap-only (compiler/self-host-v2/); compiler/src untouched.

Ruling (user-voice-scrml.md, verbatim heading): "⭐ RULED — a backslash in a quoted attribute / opener value follows the
§4.18.3 escape catalog (S482, 2026-11-26)" — "RULED yes (B). Gap markers cite
`ruling:user-voice-scrml.md-S482-quoted-value-escapes-catalog`."

## Items

1. INTERIM → ruled rule. SPEC §4.18.3 (cross-ref), §5.2 bullet, §6.15 fix-it sentence, §34 E-PARSE-001 row, §66.2.4 note.
   Gaps: g-boot-opener-string-escapes-s482 resolved; duplicate g-boot-opener-quoted-value-escapes-dropped-s478 resolved;
   new g-impl1-quoted-value-escapes-content-s482 (impl#1 divergence, filed not fixed).
2. parseQuoted comment.
3. E-PARSE-001 message: emit context, `\'` hint.
4. L1: tape fix-it misses `write` when a refused position write happens.
5. #2107 r2 F1 / INFO-1 / INFO-2 — verify (closed by #2110?).

## Log

- [x] item 1 SPEC + gap markers (commit 1)
- [x] items 2+3: parseQuoted comment rewritten to the ruled rule; quotedEscMsg(n, q, emitted) — no "not decided",
      a `\'` hint per quote style, emit-specific advice in FRAGMENT MODE (fragOn). `\'` is NOT in the §4.18.3 catalog
      ("exactly three escape sequences, and no others") — kept refused. opener-escapes-s482.test.js 20/20.
- [x] item 4 (#2110 L1): resolveLocalPartWrite records the EAssignLocal effect with a refused position write's
      grant error, so writeGrantsOf adds `write`. Probes (tools/l1.ts, base vs head): append/method/filter + position
      write fix-its now `[free, append|remove, write]` and compile applied; same error codes; a lone refused position
      write now also gets W-DISPLAY-UNTRACKED (`int[write]`). Tape slices 560/560; display-untracked 34/34.
- [x] item 5: already closed by #2110 — verified, no change. F1: `xs = [...xs, 4]` → `[free, append]`,
      `int[replace]` → `[replace, free, append]`, filter → `[free, remove]`, each applied compiles (tools/l1.ts).
      INFO-1: strEscaped spells lone surrogates / U+2028 / U+2029 as `\uXXXX` (display-untracked-s482 test
      "r2 INFO-1" passes). INFO-2: §6.15 and the §34 W-DISPLAY-UNTRACKED row carry "PA reading, prov=pa-ruled —
      #2107 r2 review INFO-2" for the meta.subscribe exemption.

## Gates (head = this branch, base = origin/main 7de593ce0; tools in ~/.cache/scrml/review/s482-escapes-ruled/)

- #2110 12×20 escape matrix: 36 SAME (byte-identical), 204+12 both-error same codes, 0 value change, 0 newly
  accepted, 0 warning diffs; 143 message diffs, all E-PARSE-001 (the intended text).
- #2110 probes (emit e1–e9, recovery, each, if, typed attrs): verdicts and codes identical.
- corpus (3441 files): 482 compile on both; 0 ok flips, 0 code diffs, 0 warning diffs, 0 byte diffs (whole result
  minus `ms`); 1 message diff (prop-substitution-string-escapes, E-PARSE-001 text).
- bootstrap-conformance --json: PASS 851 / FAIL 3 / NT 628 / UNS 491 / CRASH 0 on both; 0 verdict diffs.
- s34-census --check-new --base 7de593ce0 PASS; gen-bootstrap-severity --check current; types-gate --check OK;
  retired-forms-lint --base-ref OK; snippet-gate 120/0/9; spec-coverage-check 0 violations; delta-lint PASS.
- Chromium (SCRML_BROWSER_TESTS=1): opener-escapes + display-untracked browser files 4/4, 29 expects.

## Fix round r1 (#2115 review — ~/.cache/scrml/review/s482-2115/review.md)

Branch verified at 1fc5ad2f1 before work. Probes: ~/.cache/scrml/review/s482-2115/probes (tools/probe.ts compile,
tools/chrome.ts Chromium); outputs in ~/.cache/scrml/review/s482-2115/fix/.

### Item 0 — probes on the branch @ 1fc5ad2f1 (before r1)

| probe | source | result | Chromium value |
|---|---|---|---|
| a1 emit, 4 `\` in literal | `title=\"a\\\\b\"` | E-META-EVAL-002 [E-PARSE-001 `\b`] — the OLD advice's count, refused | — |
| a2 emit, 8 in literal | | ok | `a\b` (97,92,98) |
| a3 emit.raw, 2 in literal | | E-META-EVAL-002 [E-PARSE-001 `\b`] — OLD count, refused | — |
| a4 emit.raw, 4 in literal | | ok | `a\b` (97,92,98) |
| a5 emit, `\n` `\t` in literal | | ok | newline, tab (97,10,98,9,99) |
| a6 emit, `\\n` in literal | | ok (emit() normalizes) | newline (97,10,98) |
| a7 emit, `title=(\"a\")` | | E-META-EVAL-002 "an attribute value that is not quoted" (§22.4 Plain markup only) | — |
| a8 emit, single-quoted `\'` | | E-META-EVAL-002 [E-PARSE-001 `\'`, `'` hint] | — |
| a9 a8's hint applied | `title=\"it's\"` | ok | `it's` |
| a10 emit.raw, `\\n` in literal | | E-META-EVAL-002 [E-PARSE-001 `\n`] | — |
| b1 `title='it\'s'` | | E-PARSE-001, hint `name="it's"` | — |
| b2 `title="it\'s"` | | E-PARSE-001, hint write `'` alone | — |
| b3 hint applied | `title="it's"` | ok | `it's` |
| b4 `title='say \"hi\"'` | | ok (single-quoted read by the catalog) | `say "hi"` |
| b5 `title="a\qb"` | | E-PARSE-001, hint `\\` or `=("…")` | — |
| b6 hint applied | `title="a\\qb"` | ok | `a\qb` (97,92,113,98) |
| b7 `title=("a\nb")` | | ok | newline (97,10,98) |
| b8 `<s:string='it\'s'/>` | | E-PARSE-001, `'` hint | — |
| b9 hint applied | `<s:string="it's"/>` | ok | `it's` |
| b10 `\` at line end | | E-PARSE-001 `\⏎` | — |
| l/f1,f2,f3 (unfixed) | | E-WRITE-NOT-GRANTED + 1 W-DISPLAY-UNTRACKED each | — |
| l/f1,f2,f3-fix (fix-it applied) | | ok | run: 3 / 1 / 2 as clicked |
| l/l1-app-pos | | 2× E-WRITE-NOT-GRANTED + DU | — |
| l/l1,l2,l3,l4-fix | | ok | run: `3 7` / `3 7` / `1 7` / `7` |
| l/l4-pos-alone | | E-WRITE-NOT-GRANTED + DU (the L1 change) | — |
| l/l5-inferred | un-annotated `let xs = [1, 2]` | E-BOOTSTRAP-UNSUPPORTED (decl type unknown) ×2, E-ASSIGN-004 (cascade); DU 0 | — |
| l/l6 spine, l7 not displayed | | E-WRITE-NOT-GRANTED, DU 0 (correct: no later writer / no display) | — |
| l/l8 fn writer | | E-WRITE-NOT-GRANTED + E-FN-003 + DU (through `g() → xs`) | — |
| l/l10 nested | | E-WRITE-NOT-GRANTED + DU | — |
| l/l9, l/l11 | | probe-authoring errors (parse) — not evidence | — |

Every hint the messages give, applied, produces the intended value — except the emit advice's backslash count
(a1/a3: the counts it named, typed in a literal, give the same error). Fixed in item 1.

### Items

1. MED — DONE. quotedEscMsg emit advice: "eight backslashes in a `"…"` string literal handed to emit() (four in its
   value) and four with emit.raw() (two in its value), and a newline or tab is `\n` or `\t` in the string literal
   (the character itself in its value)". SPEC §5.2 bullet same. Tests: wording pinned; 8/4 typed in source compile
   to one `\`; the old 4/2 stay refused; `\n` in the literal works for emit() and emit.raw().
2. INFO — DONE. a7: the form IS refused, by §22.4 "Plain markup only" ("an attribute value that is not quoted"),
   not by §22.4.1's URL-attribute sentence. Message + SPEC now cite §22.4 "Plain markup only"; test pins a7.
3. LOW — DONE. Case rewritten to the ruled spelling `data-pat="^\\d+$"`, expecting `^\d+$` (keeps its purpose:
   expansion round-trip). impl#1 renders `^\\d+$` → `impl1-ts` xfail recorded with `run.ts --xfail-signature`
   (runtime sha256:a5b7c11ccdb17f9f) on g-impl1-quoted-value-escapes-content-s482, now status=carried (P7 requires
   carried + pinned). corpus-bridge: XFAIL as recorded, 0 fail; 190 xfail of 1973. Bootstrap: NOT-TWINNED before and
   after (legacy `const C = <…>`), so no bootstrap verdict moved. SPEC §5.2 bootstrap note updated.
4. INFO — DONE. g-boot-opener-string-escapes-s482 heading states the ruled rule.
5. NOTE — NOT a one-line fix; listed in the PR body. The `lt is not` branch (local type unknown) has no part type
   or steps to put in an EAssignLocal; inventing one would be a wrong fact. Unreachable for W-DISPLAY-UNTRACKED
   today: a file-scope `let` whose type is unknown is already refused at its declaration (l5). l5 also shows a
   cascade E-ASSIGN-004 calling the refused `let` a `const` — noise on an erroring program, not filed.

### r1 gates (head = r1, base = merge-base 3535bad9b — origin/main has since moved to 019bf67d5, not merged here)

- pre-commit (8 shards): 58578 pass / 0 fail, twice (both r1 commits). One earlier attempt failed on two shards
  with no test summary (exit 1 / 143 by --bail); the same groups re-run alone passed — load, not a test.
- bootstrap-conformance --json: PASS 851 / FAIL 3 / NT 628 / UNS 491 / CRASH 0 — identical to the review's head run;
  the re-pinned case is NOT-TWINNED before and after.
- corpus-bridge (impl#1): 1975 pass / 0 fail; 190 xfail of 1973; the re-pinned case XFAIL on its carried gap.
- 12×20 escape matrix, head vs base: 0 verdict / 0 output / 0 warning diffs; 143 message diffs (the lane's E-PARSE-001
  text, as before r1).
- corpus (3441 files, inputs from the base tree): 482 compile on both; 0 ok flips, 0 code, 0 warning, 0 byte diffs;
  1 message diff (prop-substitution-string-escapes, E-PARSE-001 text).
- Chromium (SCRML_BROWSER_TESTS=1): opener-escapes + display-untracked browser files 4/4, 29 expects; slices
  opener-escapes + display-untracked 57/57.
- s34-census --check-new --base 3535bad9b PASS (1 row); gen-bootstrap-severity --check current;
  retired-forms-lint --base-ref 3535bad9b OK.
