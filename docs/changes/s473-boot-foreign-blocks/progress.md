# s473-boot-foreign-blocks — progress (append-only)

Lane: the bootstrap (compiler/self-host-v2) reads §23.2 foreign code blocks `_{ … }` / `_={ … }=` in logic.
Driver: the flogence measurement (~/.cache/scrml/review/s473-flogence-port/REPORT.md) — 7,061 of 9,620
bootstrap errors sat inside `_={ in:{…} … }=` blocks (the bootstrap read `_ = {object}` and walked the JS).

## Governing SPEC sentences (quoted)

§23.2 Syntax:
- "The block splitter SHALL recognize `_` followed by zero or more `=` followed by `{` as a foreign code block opener."
- "**Identifier guard (S444).** A `_` immediately preceded by an identifier character (a letter, digit, `_` or `$`) is the tail of that identifier, never a foreign code block opener."
- "The block splitter SHALL scan for the matching closer: `}` followed by the same number of `=` characters as the opener. No other character sequence closes the foreign code block."
- "The interior of a `_{}` block is opaque. The compiler SHALL NOT parse, tokenize, or type-check the content."
- "Level-0 uses the same brace-depth counting as all other scrml sigils (`${}`, `?{}`, etc.)."
- "A mismatched level (opener `_={` with closer `}==`) SHALL be a compile error (E-FOREIGN-001)."
- "A `_{}` block that reaches end-of-file without a matching closer SHALL be a compile error (E-FOREIGN-002 …)."
- "The compiler SHALL emit W-FOREIGN-001 on any level-0 `_{` block, recommending `_={}=`."

§23.2.1 / §23.6 Language:
- "The compiler SHALL determine the language of a `_{}` block by resolving the `lang=` attribute of the closest ancestor `<program>` with that attribute set."
- "A `_{}` block with no ancestor `<program lang=...>` in scope SHALL be a compile error (E-FOREIGN-003 …)."
- §23.6: "`_{}` blocks in the library resolve their `lang=` against the file's `<foreign lang>`".

§23.2.4 Valid contexts:
- "A `_{}` foreign code block is valid in EXACTLY THREE forms" — sidecar; "Inline value-returning form — `const x = _={ … }=` (or `let x = …` / `return _={ … }=`) in a server `function` body, with `lang="ts"`/`"js"` only"; "Tool host-I/O form (S238) — a bare non-value-returning `_{}` (as well as the inline value-returning form) in the body of a top-level `function` — including `main` — of a `kind="tool"` program".
- "A `_{}` block in any OTHER context … SHALL be a compile error (E-FOREIGN-004 …)".
- "an inline `_{}` escalates its enclosing function to the server boundary" · "(dpa-004 C2: host-driving `_{}` is permitted ONLY in server `function` bodies — NOT `fn`/pure helpers, NOT `<cell>` initializers, NOT reactive bindings.)"
- §23.6 S471 correction: "an inline `_={ … }=` is valid only in a server `function` body (§23.2.4 form 2; dpa-004 C2: *"NOT `fn`/pure helpers"*)".

§23.2.4a:
- "The set of enclosing scrml locals that cross INTO the opaque slice is declared ONCE, at the top of the block, inside the braces, as `in: { name, name }`." · "The header is optional (`in: {}` or omitted = no crossings)."
- "The block's OUT value is an UNOWNED foreign value. It is typed `asIs` … by DEFAULT — the compiler does NOT infer the OUT type from the opaque slice … A call-site annotation (`const out: SomeType = _={ … }=`) STATES the intended type and overrides the default".
- "An inline value-returning `_{}` whose resolved `lang=` is NOT `ts`/`js` SHALL be a compile error (E-FOREIGN-005 …)".
- E-FOREIGN-007: "A slice that is not valid JavaScript as the body of a strict-mode async function whose parameters are its crossings SHALL be a compile error (E-FOREIGN-007)".

§7.2.2: "`_{ … }` foreign code (§23.2.3) … **exempt** — a foreign grammar … The block itself is an expression inside a scrml statement and takes rule 1 after its closing `}`" (so `_={…}= return 1` is E-STMT-MISSING-SEMICOLON).

§42.4 statement 5: "a value that crosses the JavaScript boundary with no scrml type (§42.9) … SHALL be compile error **E-COND-NOT-BOOLEAN**."

## 2026-10-29 — slice 1: read, place, type; refuse emission by name

- **lex.scrml** — `TokenKind.Foreign(level, body, closer)`: ONE token, bounded by characters (the
  same rule as parse.scrml's markup-body `foreignLevel` / `skipForeign`, no second reader): level ≥ 1
  closes at `}` + ≥ level `=`; level 0 counts raw braces. `closer` = the `=` run after the `}`
  (-1 unclosed). A foreign block is a value for the regex/division decision.
- **ast.scrml** — `AExprK.Foreign(f: AForeign)`, `AForeign = { level, crossings: AExpr[], body }`
  (crossings are `Name` reads at their own spans; `body` has the header stripped).
- **parse.scrml** — `parseForeign`: E-FOREIGN-002 (unclosed), E-FOREIGN-001 (closer has more `=`
  than the opener), W-FOREIGN-001 (level 0), the `in: { a, b }` header; a header that is not names
  is E-FOREIGN-007 (PA-reading below). Every AExprK walker learned the node (crossings = its kids);
  `exprHasEffect` is `true` (host code).
- **analyze.scrml** — positions (§23.2.4): admitted `const`/`let` initializer and `return` value in
  a `function` body; bare statement only in a `kind="tool"` program's function. E-FOREIGN-004 in a
  `fn` body, a handler, an effect, a file-scope const, inside another expression or an assignment.
  Language: `<program lang=>` (now READ: ts/js; other values E-BOOTSTRAP-UNSUPPORTED at the
  attribute) or a library's `<foreign lang=>`; none → E-FOREIGN-003; non-ts/js → E-FOREIGN-005.
  Placement: a foreign block is a server trigger (§23.2.4), like `?{}` (E-ROUTE-005 with a DOM
  access; the Split refusal with a cell write; a server-side wait). Typer: the value is
  VType.Unknown (the bootstrap's untyped value — it has no `asIs`); an annotation types the local.
- **Emission: refused by name.** Every admitted block is E-BOOTSTRAP-UNSUPPORTED ("read and checked
  … its emission … is not in the bootstrap yet") — the sealed server-side slice (§23.2.3 CG row,
  §23.2.4a codegen), E-FOREIGN-006 and E-FOREIGN-007's build check are not built. lower maps the node
  to `Host(Unreadable)` (unreachable; checkCore C-R1 would refuse it).
- **Tests** — `slice-m4/foreign-blocks-s473.test.js`: 31 tests; **28 red on base** (origin/main
  4d5b9a15d), 3 green on base (the markup-body E-FOREIGN-004, the undeclared crossing's E-SCOPE-001
  and the template-slot E-TEXT-NON-PRIMITIVE are reached on base by other paths).
- **Measurement** (raw bootstrap, 31 flogence files): 9,620 → 3,223 errors before the emission
  refusal was added (parse-phase 7,155 → 1,782).

### PA readings (flagged for review)
1. A malformed `in:` header (a field, a call, a comment) is **E-FOREIGN-007**: the SPEC gives the
   header's shape (`in: { name, name }`) and no code for a bad one; a non-header leaves `in:` at the
   head of the slice, which is not JavaScript (`in` is reserved), i.e. the unbuildable slice.
2. E-FOREIGN-001 is detected when the closing `}` is followed by MORE `=` than the opener (`}==` on
   `_={`, `}=` on `_{`). A closer with FEWER `=` is content by §23.2's own scan rule, so a lower
   closer is never "mismatched" — the block runs on (E-FOREIGN-002 at EOF).
3. A bare tool-form block with a non-ts/js language is E-BOOTSTRAP-UNSUPPORTED (E-FOREIGN-005 names
   only the inline value-returning form).

## 2026-10-29 — slice 2: one extent reader; gaps; measurement; gates

- **One reader.** `lex.scrml` `foreignOpenAt` / `foreignExtentAt` (string positions) is the only
  spelling of the §23.2 opener/closer grammar in the bootstrap; the logic lexer's `scanForeign` and
  parse.scrml's markup-body `foreignLevel` / `skipForeign` both call it (the markup copy is deleted —
  the drift surface `g-foreign-opener-grammar-hand-spelled-five-places` describes for impl#1 does not
  open in the bootstrap).
- **Tests** — 33 in `slice-m4/foreign-blocks-s473.test.js` (28 red on base, see slice 1; the two
  added here — the shared reader and a fail-closed sweep of ten other positions — are new behaviour).
  `program-shape.test.js` updated: `<program lang="ts">` is read now (a `lang="go"` is still refused).
- **Gaps** — filed `g-boot-foreign-block-emission-unbuilt-s473` (MED), `g-conformance-foreign-cases-use-fn-bodies-s473`
  (LOW), `g-impl1-foreign-block-spec-divergences-s473` (LOW, impl#1 frozen); narrowed `g-boot-no-host-bridge-s471`.
- **Measurement** (raw bootstrap, the 31 flogence files, `~/.cache/scrml/review/s473-boot-foreign-blocks/`):
  9,620 → 3,889 errors; 3,219 excluding this lane's 670 named emission refusals. Parse-phase
  7,155 → 1,782. E-PARSE-ITEM 2,749 → 35, E-PARSE-EXPECTED 1,729 → 90, E-PARSE-EXPR 705 → 38,
  E-PARSE-IMPORT 509 → 0, E-SCOPE-010 288 → 7. Still 0 / 31 clean. Next wall: E-STMT-MISSING-SEMICOLON
  1,455 (M1, newline-terminated source), E-BOOTSTRAP-UNSUPPORTED 900 (432 member access on an untyped
  value — mostly foreign-block outputs used unannotated; 160 unannotated parameters; 101 string/tape
  methods; 93 `${}` in a quoted attribute), E-ERROR-002 330 (M2), E-COND-NOT-BOOLEAN 68 (untyped
  foreign outputs in conditions), E-FOREIGN-004 58 (38 `fn` bodies — a flogence migration to
  `function`; 20 cascade from `function main(…): number`, a legacy `:` return type).
- **Gates (local)** — types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim,
  conflict-marker-gate, regen-spec-index, delta-lint, s34-census --check-new: PASS. Bootstrap slice:
  lint-no-default-arm, lint-duplicate-fn, m1, m2, m1 lowered, m3, m4 (3,128), codec: PASS.
  bootstrap-conformance --check: PASS (regenerated: PASS 259 → 260, `foreign/foreign-lang-in-program-neg`).
  e2e-render-map: PASS. Full suite (pre-commit hook, 6 shards): 50,958 pass, 0 fail.

## 2026-10-29 — fix round 1 (review of #1646: FIX-FIRST) + merge of origin/main

Merged origin/main (merge, not rebase; #1630 in). `severity.scrml` conflict resolved by
regeneration (`bun scripts/gen-bootstrap-severity.ts`); known-gaps auto-merged, gap ids diffed
(HEAD ∪ main ⊆ merged: none lost).

| finding | fix |
|---|---|
| F1 (MED, fail-open) — `let <n:int=0 min=_={ … }=/>` (and `max=` / `req=` / `single=` / `min=(…)`) compiled clean; root cause on base: a validator word or `single` with `=value` was "known" and its value read by nothing (`min=zzz`, `pattern=whatever.x()` too) | `openerWordDiags`: a foreign block in ANY opener word's value is E-FOREIGN-004; a validator word or `single` with a value is E-BOOTSTRAP-UNSUPPORTED naming the word (§55.1: a validator's argument is its call `min(…)` or none; §66.13.3: `single` takes none; §34 names no code for the `=` spelling). Tests: three sites added to the fail-closed sweep; `min=zzz`, `max=3`, `req=1`, `pattern=whatever.x()`, `single=1`, `min="5"` refused; `min(1)` untouched. Gap `g-boot-valued-validator-word-ignored-s473` filed RESOLVED. |
| F2 (LOW, latent) — planner has no foreign SuspendK | noted on `g-boot-foreign-block-emission-unbuilt-s473` |
| F3 (LOW, latent) — `sqlParamKey` dedup key for a foreign block | `""` (never deduplicated), like a nested `?{}` |
| F4 (INFO) — `_{ 1 }==2` is E-FOREIGN-001 | gap `g-boot-foreign-level0-glued-eq-read-as-closer-s473` (LOW) |
| F9 (INFO) — header: duplicate / reserved / comment-led crossings | gap `g-boot-foreign-header-checks-unbuilt-s473` (LOW) |
| F10 (INFO) — §23.2.4a examples lack the S469 `;` | gap `g-spec-23-2-4a-examples-lack-semicolons-s473` (LOW) |

Impact of F1: the bootstrap front end over samples / examples / conformance/cases / stdlib /
benchmarks (2,865 files, the reviewer's `corpus.test.js`): **no file newly refused** vs base or vs
the PR head (the one file that changed vs the PR head, `gauntlet-r10-odin-filebrowser`, changed by
the merge of main — E-BOOTSTRAP-REDECLARE gone). `bootstrap-conformance --check`: current (no case
moved). flogence: 3,889 → 3,881 (the merge), emission refusals 670.

Gates re-run (all PASS): types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim,
conflict-marker-gate, regen-spec-index, delta-lint, s34-census --check-new; lint-no-default-arm,
lint-duplicate-fn, slice m1 (109), m2 (619), m1 lowered (109), m3 (60), m4 (3,164), codec (166);
bootstrap-conformance --check; e2e-render-map (259).
