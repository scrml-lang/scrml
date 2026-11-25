# s482-opener-escapes — progress

Lane: gap g-boot-opener-string-escapes-s482 (HIGH) — `parse.scrml` `parseQuoted` dropped a backslash and kept the
next character (`let <s:string="a\nb"/>` → `anb`; `title="a\tb"` → `atb`). Base origin/main 01a1883b0 (contains #2107).
Bootstrap-only; compiler/src/ frozen.

## Phase 1 — research (done)

- (c) display-text literal — RULED: SPEC §4.18.3 "Amendment S444 — the escape catalog is RESTORED" (`\"` `\\` `\${`;
  any other `\` + char is E-PARSE-001), ruling:user-voice-scrml.md S444 "yes on // revised, A for escapes". Scope:
  a standalone body statement only (S444 "standalone only, your rec").
- (a) quoted state-opener value `<x:T="…"/>` — NOT RULED. §66.2.4 says only "a literal … written bare".
- (b) quoted attribute value `title="…"` — NOT RULED. §5.2: "`attr="value"` SHALL produce a static attribute with
  the literal string `value`" — says nothing about a backslash.
- Evidence (not rulings): conformance `components/prop-substitution-string-escapes` expects `data-pat="^\d+$"` to
  render `^\d+$` (impl#1: a backslash is content); §5.2 rule 2 says a `${…}` quoted value is a template literal
  that "decodes escape sequences".

## Phase 2 — INTERIM (fail closed; not ruled)

- [x] parseQuoted: `\"`, `\\` decoded as before; `\${` read as the catalog's literal `${` (then refused by the
      quoted-template refusal, unchanged); any other `\` + char → E-PARSE-001 (both chars kept on recovery, extent
      unchanged); after a live `${` nothing is judged (an interpolation's own grammar; the value is refused anyway).
- [x] Corpus (3046 files, examples/samples/benchmarks/conformance/stdlib/tutorial snippets): 0 newly rejected,
      0 newly accepted, 0 byte diffs, 0 warning diffs; 1 code change in an already-refused file
      (prop-substitution-string-escapes: + 2× E-PARSE-001 for `data-pat="^\d+$"`; still UNSUPPORTED).
- [x] unit pins (slice-m4/opener-escapes-s482.test.js, 15; mutation: old parser → 9 RED) + Chromium pin
      (compiler/tests/browser/opener-escapes-chromium-s482.browser.test.js)
- [x] SPEC §5.2 OPEN bullet + INTERIM, §66.2.4 OPEN note, §34 E-PARSE-001 row, §6.15 fix-it parenthetical; gap
      g-boot-opener-string-escapes-s482 HIGH → LOW (INTERIM, still open — owner question)
- [x] commit 1 (6e324fe80): pre-commit PASS (58390 pass / 0 fail)

## Phase 3 — #2107 follow-ups

- [x] F1: EAssignLocal carries `shape` (seqEditShapeKey at the binder); writeGrantsOf / writeGrantOf / stepGrant
      moved INTO THE TAPE GRANT READER (INFO-3) with shapeGrant: 1 append, 2 prepend, 3 remove, 4 write, 0 replace —
      so tapeCellText adds `free` for 1/2/3. Pins in display-untracked-s482.test.js (6 shapes, fix-it applied compiles).
- [x] INFO-1: strEscaped spells U+2028 / U+2029 / a lone surrogate `\uXXXX` (pair kept raw). Pinned.
- [x] INFO-2: §6.15 + §34 W-DISPLAY-UNTRACKED row + analyze comment: `meta.subscribe` exemption labelled PA reading
      (prov=pa-ruled); the §22.5 quote names timer and cleanup callbacks only.
- [x] mutation: shapeGrant → always replace / strEscaped branch off → the 2 new tests RED.

## Gates (head 508e395c2 + this record)

- pre-commit: PASS ×2 (58390 / 58392 pass, 0 fail).
- pretest: exit 0 (samples + benchmarks built).
- bootstrap-conformance --json, base (origin/main 01a1883b0 sources) vs head: 0 cases changed; PASS 851 / FAIL 3 /
  NOT-TWINNED 628 / UNSUPPORTED 491 / CRASH 0 on both.
- corpus differential + byte-compare (scrml-boot compileSource, 3046 files under examples/ samples/ benchmarks/
  conformance/cases/ stdlib/ docs/tutorial-snippets, 338 compile on each side): 0 newly rejected, 0 newly accepted,
  0 output byte diffs, 0 warning diffs, 0 W-DISPLAY-UNTRACKED message diffs; 1 error-code change in a file refused
  on both sides (components/prop-substitution-string-escapes: +2 E-PARSE-001 for `data-pat="^\d+$"`; its
  conformance verdict is NOT-TWINNED either way).
- s34-census --check-new --base origin/main: PASS (2 changed rows, well-formed).
- snippet-gate: 120 pass / 0 fail / 9 spec-ahead. claim-gate: 26 pass / 0 fail; C2 0 uncited.
- e2e-render-map: 259 / 0. Chromium: opener-escapes 1/1, display-untracked 3/3 (SCRML_BROWSER_TESTS=1).
- types-gate: not run (no `typescript` in this worktree; compiler/src untouched). retired-forms gate: none on main.
