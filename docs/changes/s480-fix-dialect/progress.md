# s480-fix-dialect — Track M step 1 (progress)

Ruling: user-voice-scrml.md S480 "⭐ RULED — bootstrap census build order …" item 1 ("Track M first"),
items 3–4; S469 dpa-073 F1 / F2 / F3 / F5.

- [x] `stmt-semi` + `arm-comma` rules — `compiler/src/commands/fix-terminators.js`; wired into
      fixS66 (S66_RULES, IMPL1_SAFE_RULES) after given-presence, before the §66 declaration rules.
- [x] unwrap-logic split — fix-s66.js `splitAroundDecls`: a depth-0 `${}` holding rewritten legacy
      declarations and a statement is split around the declarations (no `let <x/>` left in `${}`).
- [x] tests — `compiler/tests/commands/fix-terminators.test.js`; fix-s66 / fix-sql-failable /
      fix-refuse-broken expectations updated for the new default rules.
- [x] bootstrap-conformance twins exclude stmt-semi / arm-comma (graded as written).
- [ ] item 4: const components (Form 2 → §66.15) — NOT cheap (structural, use sites, props →
      typed attributes, slots); left for step 2. Top-level markup: program-wrap already exists.
- [ ] measurement (corpus 701 + core 52; self-host) — scratch `~/.cache/scrml/review/s480-fix-dialect/`.

## r1 (PR #2025 S239 review: BLOCK on F1) — scratch `~/.cache/scrml/review/s480-2025-r1/`

- [x] F1 HIGH — fix-s66 seed order: a split / unwrap that would move a §66 declaration past a statement
      writing what its initializer reads is refused with a note (`seedHazard`, `seedReads`, `addSeedWrites`).
      Runtime tests `compiler/self-host-v2/slice-m4/fix-s66-seed-order-s480.test.js` (red on 5592223b3).
- [x] F2 — scanMarkup: a named closer must match its element (`</>` closes the innermost).
- [x] F3 — next-line `new` / `typeof` / `void` / `delete` / `await` start a statement (impl#1 tokStartsStmt).
- [x] F4 — REGEX ends a value; `on…=${…}` handlers scanned; leading-`|` alternation heads; notes for
      template-literal / inline-markup / nested `${}` code.
- [x] tests: verify withdraw (bisect) path, allowNonCompiling pin.
- [ ] re-measure (census lens + dual compile + runtime differential).
