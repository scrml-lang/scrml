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
