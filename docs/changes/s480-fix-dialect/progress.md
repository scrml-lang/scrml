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
