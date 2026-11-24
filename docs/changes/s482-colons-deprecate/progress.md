# s482-colons-deprecate — progress

Brief: ~/.cache/scrml/review/s482-briefs/colons-deprecate.md. Base origin/main 26e13e4b1 (#2098 merged).
Scratch: ~/.cache/scrml/review/s482-colons/ (probes t*.scrml, probe-fix.ts).

Ruling (user-voice-scrml.md, verbatim): "⭐ RULED — `::` variant access is deprecated (§63 window: warning +
`scrml fix` to `.`) (S482, 2026-11-24)" — Rec as presented (PERMANENT): *"deprecate `::`: put it in the §63
migration window … It keeps compiling with a warning (W-VARIANT-COLONS-LEGACY) and a `scrml fix` rewrite to `.`.
The corpus gets migrated … When the window closes, it is refused. One spelling, consistent with S452."* RULED yes.
Supersedes the §14 "VALID ALIAS" sentence. Owner: "yes, deprecate :: with warning and fix".
Cite: ruling:user-voice-scrml.md-S482-deprecate-colons. Also ⭐ S482-retirement-ledger-rule ("yes, require ledger
row and migration") — this PR adds a SOFT ledger row and migrates.

## Findings before building
- The bootstrap builds `::` in only two places: a match / `!{}` arm pattern (`::V`, `E::V` — parse.scrml
  parsePattern) and a `fail` operand (`fail ::V`, `fail E::V` — parseFail). `::` in an EXPRESSION is a named
  refusal, E-BOOTSTRAP-UNSUPPORTED (refusals.scrml row "`::` in an expression", §14.5). §63.5 amendment S473 D5:
  a named refusal of a deprecated form with a replacement hint is conformant for the bootstrap — kept, hint
  re-worded to name the deprecation.
- impl#1 tokenizes `::` as one OPERATOR token. impl#1 does NOT read a qualified arm pattern `E::V :>` (E-PARSE-001
  "`E` is not a match arm"); bare `::V :>` it reads.
- Non-variant `::` in scrml code: none (§14.5 is the only production). In the corpus outside code: CSS `::before`
  (`#{}`), SQL casts, `db="sqlite::memory:"`, comments, strings — never sites.

## 3 — `scrml fix` rule `variant-colons` (commit 1)
- compiler/src/commands/fix-variant-colons.js (the ruled carve-out). Locates via impl#1's splitter + tokenizer
  (fix-terminators.js codeRegions / regionTokens) + every attribute value impl#1 reads as code
  (tokenizeAttributes ATTR_EXPR / ATTR_CALL / ATTR_BLOCK, `${}` in ATTR_STRING), nested `${}` / `!{}`, template
  `${}`. Reports (never rewrites) `::` in a `~{}` / `^{}` block or markup-in-code, and a spaced `E ::V`.
  Verify: impl#1 compile before/after (makeReader), identical codes + artifacts; bisect on failure.
- Wired: fix-s66.js IMPL1_SAFE_RULES + S66_RULES (after given-presence), fixS66 chain; fix.js help/header.
- Tests: compiler/tests/commands/fix-variant-colons.test.js 10/0 (mixed-spelling file, idempotence, CSS/SQL/URI
  not sites, spaced, `~{}`, refusal, wiring); fix-s66 rule-id list + fix-refuse-broken rule loop updated.

## Next
1 SPEC · 2 bootstrap lint + severity regen · 4 corpus migration (+ per-file bootstrap byte compare) · 5 impl#1 gap
· ledger row (retired-lint PR #? not merged at start — row text in PR body).
