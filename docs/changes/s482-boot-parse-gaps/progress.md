# s482-boot-parse-gaps — progress

Branch `s482-boot-parse-gaps` from origin/main eca9c5af5. Scratch: ~/.cache/scrml/review/s482-boot-parse-gaps/.

## Item 1 — g-boot-keyword-named-member-s481 (+ bare `server`)
- [x] Root cause is LEXICAL: after a reserved word, a `.name` lexed as a BareVariant (value position),
      so `t.server.plan` was `t` `.` `server` `.plan`-variant -> the statement ended. `t.server` alone parsed.
- [x] lex.scrml: `valueLastKind` — a reserved word that is a member name (after `.` / `?.`) or a contextual
      name word (`from`, `server`) ends a VALUE: a following `.x` is member access, `/` divides. Token kinds
      unchanged (Keyword). slashWhy agrees (a member name is division for every JS reader).
- [x] SPEC: §7.2 (all JS valid), §7.2.1 (`x.class` "A diagnostic on any of these is a compiler defect"),
      §18 (`obj.match` is the identifier). `server`: no SPEC sentence reserves it; §7.2 admits the JS name.

## Item 2 — g-boot-from-identifier-s481
- [x] same lexer fix covers `from.startsWith(…)`; parse.scrml `bindNameTok` admits `from` / `server` as a
      `let` / `const` / `lin` / for-head / destructuring binding (§54.3 "parameter name, local binding, or
      field name … SHALL continue to compile").

## Item 3 — g-boot-multiline-alternation-arm-head-s481
- [x] parse.scrml `skipAltHead`: a line ending in `|` continues the head (§7.2.2 rule 4, §18.2).
- [x] FINDING: the bootstrap does not build `|` alternation at all (one E-PARSE-ARM refusal per head,
      "not yet supported"). The multi-line head is now ONE head refused once, like a one-line head.
      Filed g-boot-match-alternation-unbuilt-s482 (owed: build it).

## Measure (scrml-boot compile every self-host-v2/*.scrml, unique sites)
- E-STMT-MISSING-SEMICOLON 36 -> 1 (print.scrml:5657 `if (c.mutable) ok = false` — a real missing `;`)
- E-MATCH-ARM-SEPARATOR 27 -> 0; E-PARSE-LOCAL 3 -> 1 (`let some` — `some` not in scope)
- rises: lex.scrml / lower.scrml now analysed further (were stopped by the parse errors).

- [x] commit 1 (fix + test + progress) — hook PASS (57594 pass, 0 fail)
- [x] E-SYNTAX-011 guard branch uses skipAltHead too (`.Admin |⏎ p.active :>` = one E-SYNTAX-011)
- [x] print.scrml:5657 — the one real missing `;` in the self-host, added (E-STMT-MISSING-SEMICOLON 36 -> 0)
- [x] conformance parse-syntax/keyword-named-member-rt, parse-syntax/from-server-names-rt: impl#1 corpus-bridge
      PASS; bootstrap PASS (TWIN, runtime held); host-global-scan --check 1/2, 2/2 exit 0
- [x] gap markers: 3 resolved; filed g-boot-match-alternation-unbuilt-s482 (MED),
      g-boot-contextual-word-fn-name-s482 (LOW)
- [x] re-measure: lower.scrml rises are lines 4900+ (the old `} else {` E-STMT-UNEXPECTED-TOKEN derailed the
      rest of the file's parse); lex.scrml rises likewise past the old separator cascade at :368

- [x] commit 2 (6903be00d) — hook PASS

## Final gates (head 6903be00d)
- [x] tests red on base: slice-m4/keyword-member-from-alt-head-s482.test.js — 12 of 16 fail on base (lex/parse/print
      from origin/main); the 4 green are must-stay guards (server modifier, `return .A` / `is .B`, import … from,
      missing `,` still E-MATCH-ARM-SEPARATOR); 16/16 on head
- [x] pretest
- [x] bootstrap-conformance --json, 1958 cases: base (origin/main self-host) PASS 770 FAIL 4 UNSUPPORTED 556 CRASH 0;
      head PASS 772 FAIL 3 UNSUPPORTED 555 CRASH 0. Only changes: the 2 new cases (FAIL parse-reject -> PASS,
      UNSUPPORTED -> PASS). No PASS->FAIL.
- [x] byte-compare (bootstrap front end + printProgram + printServer, twin source as the runner grades it, all 1958
      cases): 1956 identical (diagnostics, client JS, HTML, server JS); 2 differ = the 2 new cases (base rejected).
- [x] CI checks: s34-census --check-new, types-gate --check, snippet-gate, claim-gate, corpus-compile-floor --check,
      gen-md-shim --check — all exit 0
