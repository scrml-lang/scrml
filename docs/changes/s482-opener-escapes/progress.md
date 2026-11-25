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
- [ ] unit pins + Chromium pin
- [ ] SPEC §5.2 / §66.2.4 INTERIM text, §34 E-PARSE-001 row, gap update
- [ ] gates

## Phase 3 — #2107 follow-ups

- [ ] F1 tape fix-it `free` for a resizing whole-value write
- [ ] INFO-1 strEscaped `\uXXXX` for lone surrogates / U+2028 / U+2029
- [ ] INFO-2 meta.subscribe exemption labelled prov=pa-ruled
