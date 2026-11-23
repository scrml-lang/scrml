# s482-parser-lows — progress

Lane: four parse.scrml known-gaps residue items (base origin/main d64e7e060).
Scratch: `~/.cache/scrml/review/s482-parser-lows/` (base tree, probes `p/`, conformance JSON).

- [x] 1. g-boot-body-top-let-decl-after-type-alias-s479 — re-measured: compiles on main (fixed by #1963's
  LexStop.Decl for a body-top `type`). Pinning tests only. (The entry's probe `const <k:N=1/>` is the retired
  §6.6 derived form, not this bug.)
- [x] 2. g-boot-body-top-not-stmt-with-parse-error-s480 — `notStmtIsCode` returns false when the statement
  carries any E-PARSE-* diagnostic (the reviewer's fix). `not 100%` / `not @x +` → one E-UNQUOTED-DISPLAY-TEXT.
  Residue: `not (really` — the unclosed `(` region still swallows the rest of the body (E-PARSE-UNCLOSED after
  the display-text report; was E-TYPE-045 + 4 cascade codes).
- [x] 3. g-boot-alias-skipped-decls-incomplete-s480 — `skippedDecls` names `const { a, b }`, `const [c]`,
  `let <z/>` and a statement-start keywordless `y = …`.
- [x] 4. g-boot-e-type-045-in-misread-markup-s479 — MINIMUM (INTERIM): a non-handler `{<tag …>…</>}` value is
  one E-BOOTSTRAP-UNSUPPORTED over the value (char-level brace balance, terse `/}` included); its text is never
  read as code. Gap kept open: the capable form reads the element as the value when `<errorBoundary>` is built.
- [x] slice test `compiler/self-host-v2/slice-m4/parser-lows-s482.test.js`: base 6 pass / 7 fail, head 13 pass.
- [x] conformance base vs head: 0 bucket moves (PASS 845 · FAIL 4 · UNSUPPORTED 491 · NOT-TWINNED 628 · CRASH 0
  both sides); 12 cases lose cascade codes only (E-PARSE-*, E-STMT-MISSING-SEMICOLON, and E-TYPE-045 in the two
  server-fn/error-boundary-* cases the gap names).
- [x] corpus (2972 files, examples/samples/benchmarks/conformance/cases): 0 newly rejected, 0 newly accepted,
  0 byte diffs among compiled files; 14 already-rejected files change codes (cascades shrink; two legacy-dialect
  files show an E-PARSE-CLOSER / E-STATE-UNDECLARED the old cascade hid).
- [x] gates green: pretest, s34-census --check-new (no §34 rows changed), types-gate --check (182, unchanged),
  corpus-compile-floor --check, snippet-gate, claim-gate, severity --check, e2e-render-map (259 pass), 15 related
  slice-m4 files (967 pass).
- [x] gap entries (3 resolved, 1 open with the INTERIM note) + SPEC §7.2.2 newline-table row.
- [ ] commit (hook), push, PR.
