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

## 1 — SPEC (commit 2)
- §14.5: the VALID ALIAS sentence struck (kept, with cite); new normative text — `::` DEPRECATED (§63.1 Stage 1),
  W-VARIANT-COLONS-LEGACY with fix-it, `scrml fix` rule, "E-VARIANT-COLONS-LEGACY only at a future MAJOR
  language-version event (unscheduled per §63.7)" (the W-WHITESPACE-001 wording); provenance block quoting the
  ruling; normative statements de-aliased; formatter-preference sentence struck.
- §34: W-VARIANT-COLONS-LEGACY (Warning) + reserved E-VARIANT-COLONS-LEGACY, after E-IS-SOME-DEPRECATED.
  s34-census found no prior row. §63.7 bullet added.
- Examples: 59 fenced scrml lines migrated (the SQL `::jsonb` cast and CSS `&::before` kept). Prose inline examples
  migrated on 33 lines; alias-teaching prose (§14.10 ×3, §18 ×3, §19.3, §19.4) re-worded "deprecated". Grammar
  productions (§18.2 variant-pattern, §19.3.1 fail-stmt) annotated. NOT touched: verbatim ruling quotes /
  provenance / struck history, the W-ARM-PIPE rows (describe `| ::V m` as the arm-pipe rule's input), and four
  legacy §34 rows (E-PARSEVARIANT-* ×3, E-THROW-NOT-IN-SCRML) — editing them makes s34-census --check-new demand
  a provenance note they never had; left for the R1 example sweep.

## 2 — Bootstrap (commit 2)
- parse.scrml `colonsLint` (one per site, deduped by start) at the four `::` sites: parsePattern `::V` / `E::V`,
  parseFail `::V` / `E::V`. refusals.scrml: the `::`-in-expression named refusal's hint names the deprecation.
- severity.scrml regenerated (W-VARIANT-COLONS-LEGACY → Warning).
- slice-m4/variant-colons-s482.test.js 4/0 (count + Warning, message/span, identical artifacts vs `.` spelling,
  expression refusal hint). Probe t2: out bytes identical before/after the lint.
- bootstrap-conformance.ts: `variant-colons` excluded from TWIN_RULES (graded as written, like is-some).

## 4 — Corpus (commit 2)
Driver ~/.cache/scrml/review/s482-colons/migrate.ts (fixer locator; per file bootstrap compileSource before/after
at the file's own path; same verdict + codes-minus-lint + html/js/server bytes, else impl#1 verify when both sides
are rejected with only a code-set change from the `::` named refusal) and migrate2.ts (the sites the fixer reports
"by hand": `~{}` blocks, regions the splitter does not hand out — admitted only if bootstrap AND impl#1 read the file
identically). Reverted (listed, 4 files / 12 lines): samples/gauntlet-r11/rust-state-machine (5),
gauntlet-r13/solid-reactive-signals (2), gauntlet-r14/solid-reactive-signals (3) — neither compiler compiles them
and the bootstrap's code set changes (the `::`-in-expression named refusal drops a cascade); and
compilation-tests/gauntlet-s20-error-test/test-fails-with-001 (2, `~{}` `assert.fails.with … ::V`; bootstrap code
set changes, both sides rejected).
- Hook round 1 found a real interplay: parse.scrml's `| ::V` arm lost its W-ARM-PIPE-LEGACY because the pipe lint
  required "no diagnostic of its own" and counted the new lint. Fixed (`faultsSince` ignores W-VARIANT-COLONS-LEGACY);
  after it blog-cms / contact-directory / gauntlet-r11-go-url-shortener migrated cleanly (15 sites). Bootstrap tests
  that asserted a clean `::` program updated (error-model, match-s469, termination-rulings-s469, terminators-s469).
- Conformance: new labelled case enum/variant-colons-deprecated-warn (DEPRECATED-DEMO; 5 lints; runtime half;
  impl#1 xfail g-impl1-variant-colons-lint-s482). No existing case's PURPOSE was `::` — all migrated.

## 5 — impl#1 gap: g-impl1-variant-colons-lint-s482 (LOW, carried) filed in docs/known-gaps.md.

## Commit 3 — stdlib doc comments; gates; ledger row
- stdlib doc-comment examples (`HostError::Thrown`, `| ::Thrown(…) ->`, `@fails E::V`) → `.` (6 files, 17 lines;
  comments only — no compile effect).
- Gates (all foreground, systemd-run scoped): pre-commit PASS ×2 (58284 / 58289 pass, 0 fail); pretest 0;
  bootstrap-conformance --json base 26e13e4b1 vs head: PASS 849→850 (the new case), FAIL 3→3, CRASH 0, 0 verdict
  changes on existing cases; impl#1 conformance 1784 pass + 188 xfail of 1972, new case XFAIL as pinned;
  corpus differential (2975 files, bootstrap, base files+base compiler vs head files+head compiler): 0 verdict
  diffs, 0 output-byte diffs, 12 code-set diffs — all files rejected on both sides whose `::`-in-expression named
  refusal (which drops a cascade) is gone, each impl#1-verified identical; s34-census --check-new PASS (3 rows);
  severity --check current; host-global-scan 1/2 + 2/2 rc 0; snippet-gate 120/0; claim-gate 0 failed;
  types-gate OK 182 unchanged; corpus-compile-floor PASS; e2e-render-map 259/0.
- Ledger: #2101 (s482-retired-lint) is OPEN, not merged — the `variant-colons` row update is in the PR body; the PA
  merges main and lands it in a follow-up commit.
