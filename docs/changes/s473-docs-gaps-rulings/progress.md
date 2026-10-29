# s473-docs-gaps-rulings — progress (append-only)

Branch `s473-docs-gaps-rulings` off origin/main `543791e75`. A documentation lane: gaps, ruling sentences, and the
status of the gaps the S473 rulings settled. No compiler code ships.

Ruling (verbatim, `../scrml-support/user-voice-scrml.md` S473 "⭐ RULED — S473 PA recs, all"): *"your recs on all."*

## 2026-10-28 — first pass

### A. Gaps filed (docs/known-gaps.md)
- `g-windows-facts-dangling-test-posix-separator-s473` (LOW, TEST bug). From `gh run view 40775265295 --log-failed`:
  `Expected to contain: "stdlib/dangling"`, `Received: "facts: BROKEN TREE — dangling symlink stdlib\\dangling …"`.
  facts.ts is right; the test assumes `/`. The same three failures appear on the windows job of 40754958089 (#1620
  merge), 40775265295 (#1619) and 40806312590 (#1615).
- `g-windows-hook-trigger-test-stub-not-on-path-s473` (LOW, TEST bug). Both cases give `RUN_SLICES=0`: the stub `git`
  is prepended to a Windows PATH with a POSIX `:`, so the real git (nothing staged) decides.
- `g-facts-mirror-current-flaky-under-shards-s473` (LOW, flaky). The failure text was not captured. Two candidate
  causes (no per-test timeout over two full-tree walks; a symlink mirror of the LIVE tree that other shards mutate).
- `g-boot-db-fn-in-match-arm-refusal-untested-s473` (LOW). Measured: the `<match>` element is
  E-BOOTSTRAP-UNSUPPORTED before the `<db>` is reached.
- `g-boot-db-body-fn-keyword-name-poor-diagnostic-s473` (LOW). Measured: `fn pure() …` in a `<db>` body gives only
  E-UNQUOTED-DISPLAY-TEXT, whose fix-suggestion is wrong; at program level it is E-PARSE-FN (`pure` is a lexer
  keyword, lex.scrml:257). The PA saw E-DB-BODY-STATEMENT too; that is not reproduced for these two shapes.
- `g-spec-ternary-union-vs-match-e-type-001-s473` (LOW, SPEC text owed). Filed per ruling item 4.
- #1621 follow-ups: all three were already filed (g-boot-markup-text-decl-instance-unjudged-s473,
  g-boot-choice-member-read-unknown-s473, g-boot-single-lift-loop-choice-elem-unknown-s473). Nothing added.
- `master-list.md` `@generated:recent-sessions`: stale only by the S472 wrap merge (#1624, a62629d68, merged
  2026-10-29T00:53Z). The `cloud-maps` workflow owns it (daily `bun scripts/state.ts --write`, then an auto-merge
  PR), and its last run (40721634185, 2026-10-28T16:00Z) was current. NOT regenerated here: the lane brief says
  "do NOT stage `master-list.md` recent-sessions churn"; the bot's next run lands it, and 6–8 parallel lanes each
  regenerating it would conflict on the same hunk.

### B. SPEC sentences
- §66.9 rule 8, new paragraph "A quoted use-site value is a string literal, never a variant name (RULED S473)".
  Governing sentence: *"A quoted value given to a field whose type is an enum — `<btn kind="Primary"/>` for
  `<btn kind:K>` … — is therefore a kind mismatch, **E-TYPE-031**, and is not read as the variant `.Primary`."* It
  also gives the `<auth role="Admin">` exception reason (a §40.1.1 gate predicate read against the one app-scope
  role enum, not a field initializer). Citation slip recorded: the ruling's "§21.3.2" is the derivation's label for
  "a quoted attribute value is a string literal" (§5.1 / §5.2 rule 1); the SPEC's §21.3.2 is dynamic `import(…)`.
- §4.18.1 S472 amendment, plus the §34 E-DB-BODY-STATEMENT row: *"'Declaration' in (a) and in the S472 ruling means
  a §66 declaration — a `<x/>` cell — and nothing else: a `const NAME = …;` … binding standing in a `<db>` body is a
  statement, not an item, and is `E-DB-BODY-STATEMENT`"*. Inert: the bootstrap already refuses it (probe:
  `const k = 1;` in a `<db>` body → E-DB-BODY-STATEMENT).

### C. RULED S473 recorded in gaps
- g-boot-bare-variant-no-context-resolves-s472: RULED, follow §14.10. MEASURED here, with a temporary probe
  diagnostic at `resolveVariant` / `ctorOf`'s unique-in-scope fallbacks (reverted, not committed) and the bootstrap
  front end over 3,988 sources. 46 sites in 29 files, 3 of them bootstrap-clean. **0 of the 46 is a §14.10
  no-context position.** Every one is a typed position (return, argument, cell write, `==` / `is` operand,
  multi-scrutinee pattern) whose type the resolver is not passed. So the code has to pass those types down first,
  and only then refuse.
- g-boot-mixed-arm-type-unresolved-fail-open-s472 (already resolved): RULED, the resolution stands. New g-spec gap.
- the `<btn kind>` limb (inside g-boot-literal-init-non-primitive-annotation-unchecked-s472): RULED, and the SPEC
  sentence is linked.
- g-bootstrap-uppercase-pre-code-not-raw-content-s472: RULED, the SPEC stands, so raw content case-insensitively
  (the gap's refuse recommendation is not taken). Code owed.
- g-stdlib-md-regex-unicode-classes-s472: RULED (a) `import:host`. Code owed.
- g-boot-stdlib-none-compiles-s471 (md item 2): RULED, impl#1 learns `div` / `T.parse` / `.append`. Code owed.
- g-boot-derived-cell-with-grants-takes-writes-s472: RULED, needs a design pass. Open.
- Not touched (other S473 lanes): exit-less loop, svg/link/§65.4.2, names / past-end / loop-copy, typed host
  binding, `<db>` cells.

### Generated
- `bun scripts/state.ts --write`: known-gaps LOW 563 → 569 (six new LOW gaps). The master-list hunk was reverted.
- `bun run scripts/regen-spec-index.ts`: --check OK.
