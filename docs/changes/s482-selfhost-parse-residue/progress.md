# s482-selfhost-parse-residue — progress

Branch `s482-selfhost-parse-residue` from origin/main e178c32c8 (contains #2060).
Rulings: user-voice-scrml.md "RULED — `/` after `as` by adjacency; `lin` as a binding name" (S482),
`ruling:user-voice-scrml.md-S482-as-slash-lin-name`.

## Done
- lex.scrml `dotLastKind`: a `/` touching `as` divides (the `.` rule applied to `/`); `slashWhy` reads
  the same kind. `lin` joins `isContextualNameWord` (its keyword reading always takes a name next).
- parse.scrml: `lin` and `of` join `isContextualName` (bindNameTok). `linKeywordAt` decides the `lin`
  keyword by the next token (statement start, parameter prefix, typed-arrow head, fn-type parameter).
- parse.scrml: `x is T.V` refused by name (E-PARSE-EXPECTED, §18.17 grammar) and read as `is .V` —
  no cascade. Before, the parser read `is` as a name; in an object literal it swallowed the file.
- analyze.scrml self-host source defects fixed: two braceless `for` bodies (§49.2.1), five then-branches
  without `;` before `else` (§7.2.2), `fi.ty is Type.Str` -> `fi.ty == Type.Str` (the file's idiom;
  impl#1 cannot resolve `is .Str` there), local `of` -> `ofAttr` (`of.value` lexes a bare variant).
- Every self-host file now parses to the end; the only parse-level codes left are E-PARSE-ARM (named
  payload binders `.X(f: v)` / `(fn: x)`, and 7 alternation refusals) + their E-SCOPE-REDECLARE.

- Commit 1 (59e1b23c4): the code above; hook PASS (57693 pass / 0 fail).
- Tests: slice-m4/selfhost-residue-s482.test.js — head 14/14; base e178c32c8 12 fail / 2 pass (the
  spaced-regex guard and the bare `is .Str` control).
- SPEC: §7.2.2 rule 4 + §14.12.6.2 (`/` touching `as`), §35.2 (`lin` binding name), §49.2.4 (`of`).
- Gaps: g-boot-self-host-parse-residue-s482 resolved (and its `lin` text cites the ruling); filed
  g-impl1-as-touching-dot-cast-s482 (carried), g-boot-of-name-member-read-s482 and
  g-boot-is-qualified-variant-s482 (owner questions).

## Next
- final gates, PR.
