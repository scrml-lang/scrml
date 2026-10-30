# S473 SPEC-coverage — decisions for bryan

Every "needs a ruling", SPEC contradiction and questionable classification that the six audit parts raised, deduplicated and ranked by impact (security and data first, then rulings that unlock many rows, then contradictions, then record-keeping). Nothing here edits the SPEC. The PA brings these to bryan.

Each item gives the question, the options, and a recommendation with its reason. "Pn" names the audit part that raised it; gap ids are in `docs/known-gaps.md`, rows in `docs/bootstrap-spec-coverage.md`.

---

## Security and data integrity

### D1. Must the bootstrap refuse a server guarantee it does not build, instead of compiling the code without it?
- **Raised by:** P2, P3. The U1 design says unbuilt units are "refused until their unit". That holds for constructs with their own syntax (`transaction {}`, `<schema>`, `protect=`). It does not hold for guarantees that attach to ordinary code: the §8.9.2 implicit transaction, the manual-BEGIN gate, the S456 undeclared-tenant refusal and the program-body DDL allow-list. All four compile today with the guarantee silently missing.
- **Options:**
  - (a) Rule a general posture: the bootstrap never accepts code whose SPEC guarantee it does not build. Each case gets a named refusal or a minimal check:
    - refuse two or more `?{}` in a `!` server body until U1e;
    - refuse transaction-control statements;
    - add the startup check that refuses to serve a `tenant_id` table;
    - add the DDL allow-list.
  - (b) Build each guarantee now.
  - (c) Leave them as open gaps.
- **Recommendation: (a).** Its interim fixes are small, and lane `s473-boot-failclosed-sql-protect` is already carrying them. The cost of not ruling falls on end users' data: writes are left committed, the shared connection is left mid-transaction, and cross-tenant rows reach an anonymous request (the audit ran this case). Writing it down as a posture stops the U1 plan's "refused" claim from going stale again.
- **Gaps:** g-boot-implicit-envelope-unbuilt-not-refused-s473, g-boot-manual-tx-left-open-no-gate-s473, g-boot-tenant-undeclared-table-served-s473, g-boot-sql-program-statement-allow-list-unbuilt-s473.

### D2. Which unknown element names may the bootstrap emit as HTML?
- **Raised by:** P1, P2, P3, P4, P6; it is the deduplicated root of the audit. Today any name that is neither a declaration nor a structural element falls through to HTML: `<frobnicate>`, `<Widget/>`, `<onMount>`, `<md>`, `<stdin>`, and a §52 `<User protect=…>`. The last one leaked a protected column in an executed probe. Lane `s473-boot-failclosed-markup` is about to refuse unknown elements, so one question needs an answer first.
- **Options:**
  - (a) Refuse every name not in the HTML registry or the user's declarations.
  - (b) Like (a), but admit hyphenated names. HTML reserves those for custom elements (`<my-widget>`).
  - (c) Refuse only capitalized names and names that collide with scrml structural elements.
- **Recommendation: (b).** A hyphenated name is valid HTML and is how a web component is used, so refusing it would break a legitimate interop path. Every other unknown name is a typo, a retired form, or an unbuilt scrml element, and all of those must fail closed. Separately, refuse any element that carries `protect=` or `authority=` (the confidentiality limb, lane `…-sql-protect`).
- **Gap:** g-bootstrap-unknown-tags-resolved-as-html (raised to HIGH).

### D3. Does the S447 tooling carve-out let the bootstrap's own TS tools skip impl#1's security policies?
- **Raised by:** P5 Q7. `scrml-boot dev` is a new TS dev server. With a non-default `--output-dir` it serves `.env`, `*.db` and `.scrml` sources, and impl#1's `static-serve-policy-emitted.js` sits unused beside it.
- **Options:**
  - (a) The carve-out means the bootstrap may defer tooling, and any TS tool it does ship must reuse impl#1's policy modules.
  - (b) The carve-out exempts bootstrap tooling entirely.
- **Recommendation: (a).** Keeping one policy means one place to fix a hole, and the developer is the one who pays for a second copy. Lane `s473-boot-p5-holes` imports the policy.
- **Gap:** g-boot-dev-static-serve-not-allowlisted-s473.

---

## Language-scope rulings that settle many rows at once

### D4. Is §47.1–§47.5 (output name encoding) a language obligation, or impl#1 implementation detail?
- **Raised by:** P5 Q2. This is the item that started the audit.
  - The bootstrap mints hint-based names.
  - impl#1's encoder exists but is off on every CLI path.
  - The §62 conformance corpus never observes emitted names.
- **Options:**
  - (a) Normative: build it in both compilers.
  - (b) Demote §47.1–§47.5 to a non-normative impl#1 annex. Keep §47.1.1b (reserved `_scrml_` prefixes) and §47.6 (no protected field in an emitted name) normative.
  - (c) Make it a build-mode option (production only).
- **Recommendation: (b).** The D3 rule already makes emitted-JS shape an implementation freedom, and §62.1 says conformance is what defines scrml. The features keyed off §47 (test-bind keys, the dpa-061 persist type hash, §58.7) can name their own stable keys. Apply the same treatment to the other output-form SHALLs the audit found: §14.4.1's `const TypeName_toEnum` table, and §6.6.7, which is already D3.
- **Gaps:** g-boot-output-name-encoding-unbuilt-s473, g-spec-toenum-lookup-table-output-form-s473.

### D5. Does §63.5 ("an impl#2 that rejects a deprecated form is a conformance bug") bind the bootstrap's §66 dialect?
- **Raised by:** P1 Q3, P3 Q7, P6 B. The bootstrap rejects the following, each with a generic parse error:
  - `on mount {}`, `pure function`, `const @x`;
  - the spaced opener `< p>` (whose W-WHITESPACE-001 is permanent-soft);
  - legacy `<x> = v` declarations (§66.21 Stage 1 "parses identically + W-lint").
- **Options:**
  - (a) The bootstrap accepts every deprecated form, with its W-code, as §63.5 says.
  - (b) Amend §63.5: during the bootstrap, impl#2 may refuse a deprecated form, but only with a named refusal that names the replacement. A generic parse error stays a bug.
  - (c) Leave it as is.
- **Recommendation: (b).** The bootstrap was ruled to "speak the ruled language" (S449), and accepting old forms would grow its surface for no adopter benefit. The real cost today is a misleading diagnostic, and (b) fixes exactly that: E-DECL-LEGACY-RHS, a `pure` → `fn` hint, an `on mount` → `<onMount>` hint.
- **Gaps:** g-bootstrap-e-decl-legacy-rhs-unemitted-s473, g-bootstrap-unimplemented-construct-reported-as-generic-code.

### D6. O31 / O33: a typed declaration with no value (`let <n:int/>`, a `single` enum with no initial, a missing required attribute). What does it mean, and what does the bootstrap do until then?
- **Raised by:** P1, P3, P5, P6. Today these compile clean and throw at page construction.
- **Options:**
  - (a) Rule O33 as §6.2 Shape 4 already reads: the canonical empty (`0`, `""`, `false`, `[]`), `not` for types without one, and §51.0.E's first variant plus W-ENGINE-INITIAL-MISSING for an enum.
  - (b) A typed no-value declaration is an error.
  - (c) Keep O33 open, and have the bootstrap refuse at compile time meanwhile.
- **Recommendation: (c) now and (a) as the ruling.** The SPEC text already documents (a), so ruling it only records what Shape 4 says. Until then, a compile-time refusal is the bootstrap's own posture for open items (it does this for O19 and O51 on `<*x/>`), and it beats a blank page.
- **Gap:** g-boot-no-value-cell-runtime-throw-s473.

### D7. §52 server-cell surfaces vs §8.1.3 `<db>` cells: retire, alias, or still owed?
- **Raised by:** P6 A.
  - S472 made `<db>` cells the bootstrap's server-authoritative cell.
  - Tier 2 `<x server>` and Tier 1 `<T authority="server" table=… protect=…>` are refused by name, with no gap or ruling.
  - The §52.6.8 banner claims the bootstrap builds them, which is false.
- **Options:**
  - (a) Retire Tier 2 in favour of `<db>` cells, and keep Tier 1 type-level authority/`protect=` as owed (refused until built).
  - (b) Alias both onto db cells.
  - (c) Keep both owed.
- **Recommendation: (a).** Two spellings of a server-authoritative cell is one too many, and `<db>` cells already ship. Type-level `protect=` is the confidentiality story, so it must stay owed and refused until built (see D2).
- **Gap:** g-bootstrap-s52-server-cell-surfaces-vs-db-cells-unruled-s473.

### D8. §51 legacy features with no §66 home
- **Raised by:** P5 Q3, P6 B. O5 (S435) re-homes some §51 features into `single` declarations. Six features have neither a §66 home nor a gap:
  - `audit @log` (§51.11);
  - `replay` (§51.14);
  - temporal `.From after Ns => .To` (§51.12);
  - type-level `transitions {}` (§51.2 / §14.4.0);
  - derived / projection machines (§51.9);
  - `--emit-machine-tests` (§51.13).

  Separately, `<machine>` is refused with E-BOOTSTRAP-UNSUPPORTED citing "§6.7", where §63.7 says E-DEPRECATED-001.
- **Options:** for each feature, re-home it into `single`, bank it for v1.next, or drop it.
- **Recommendation:**
  - temporal `after` → re-home onto the O5-carried `<onTimeout>`;
  - type-level `transitions {}` → drop (field `rule=` supersedes it);
  - projection machines → drop (a derived `single`, §51.0.J, covers it);
  - `audit` / `replay` → bank for v1.next;
  - `--emit-machine-tests` → tooling, bank;
  - `<machine>` → E-DEPRECATED-001.

  Each feature that stays in the language gets a gap. The O5-kept features that are unbuilt now have one (g-boot-o5-engine-features-unbuilt-s473).

### D9. §54 nested substates: what is the §66 spelling?
- **Raised by:** P6 A. §66 never mentions substates. The legacy form is parse-rejected, and the nearest §66 shape reads substate tags as child fields.
- **Options:**
  - (a) Design a §66 spelling now.
  - (b) Mark §54 "superseded, pending a §66 design", and bank it out of v1.
- **Recommendation: (b).** No adopter corpus depends on it in the bootstrap, and designing it is a deep-dive, not a lane.
- **Gap:** g-spec-54-substates-no-s66-spelling-s473.

### D10. §50 assignment as an expression: is it the language, or is the bootstrap's statement-only rule the language?
- **Raised by:** P5 Q1. The bootstrap refuses every assignment-as-expression with E-ASSIGN-POSITION. §50 is live, and S469 restated its idiom `for ((m = re.exec(str)) is given)`.
- **Options:**
  - (a) Build §50 whole.
  - (b) Narrow §50 to the double-parenthesized condition head, and refuse chains and value positions.
  - (c) Retire §50.
- **Recommendation: (b).** It keeps the one idiom S469 relies on and drops the error-prone forms (chains, `if (x = y)`). The idiom needs RegExp, which is itself OPEN (Appendix D), so nothing is urgent.
- **Gap:** g-boot-assign-as-expression-unbuilt-s473.

### D11. Slot multiplicity under §66.15.2 (zero slots with children, several unnamed slots, a `<slot/>` outside `renders`)
- **Raised by:** P3. §66 is silent. Today the bootstrap drops the children, renders them twice, or renders nothing.
- **Options:**
  - (a) Carry legacy E-COMPONENT-020/021 into §66.15.2: all three are errors.
  - (b) Rule the bootstrap's current behaviour as the language.
- **Recommendation: (a).** Silently dropped or duplicated children is a bug class, not a feature.
- **Gaps:** g-boot-slot-count-unchecked-s473; named slots stay O9 (g-boot-named-slot-shapes-not-refused-s473).

### D12. §66.6.8 O51 (OPEN): the bootstrap has quietly taken option (b) for a plain use of a declaration with no `renders`
- **Raised by:** P6 C. `<sig/>` compiles as a data-only instance, while `<*x/>` of the same declaration is refused citing O51.
- **Options:**
  - (a) Rule (b).
  - (b) Refuse both until ruled.
- **Recommendation: refuse both until O51 is ruled, and put O51 on the ruling queue.** Today's behaviour is inconsistent with the bootstrap's own open-item posture, and refusing is a one-line change.

### D13. Tailwind on the bootstrap: utility classes pass through with no CSS and no message
- **Raised by:** P4. The S469 owner direction ("native styling first") set a priority. It did not rule "accept and drop".
- **Options:**
  - (a) Emit one Info diagnostic when a class token matches the Tailwind grammar.
  - (b) Refuse.
  - (c) Stay silent.
- **Recommendation: (a).** It is cheap, keeps impl#1-ported apps compiling, and tells the adopter why the page is unstyled.
- **Gap:** g-boot-tailwind-classes-pass-through-unstyled-s473.

---

## SPEC contradictions

### D14. §6.1.3 vs §7.3.3 / §7.6: is a function-body local named like a cell an error?
- **Raised by:** P1 Q4. §6.1.3's own example, §1.6, §34, the S55 ruling and impl#1 say error (E-NAME-COLLIDES-STATE). The bootstrap accepts it on purpose, citing §7.6.
- **Options:**
  - (a) Error everywhere; amend §7.6 / §7.3.3 to say so.
  - (b) Legal; amend §6.1.3 and supersede S55.
- **Recommendation: (a).** A ruling already exists (S55), and the bootstrap's reading was a comment, not a ruling.
- **Gap:** g-boot-local-shadows-cell-accepted-s473.

### D15. §21.2 E-EXPORT-001 ("a reactive cell SHALL NOT be exported") vs §66.2.5 `export let <x/>`
- **Raised by:** P4. The bootstrap follows §66.
- **Options:**
  - (a) §66 wins: amend §21.2 and re-pin conformance case `e-export-001-*`.
  - (b) §21.2 wins.
- **Recommendation: (a).** The S447 / S449 / S469 rulings are later than §21.2.

### D16. `<style>` is valid in §3.1 / §9.2 but forbidden in §4.17 / E-STYLE-001
- **Raised by:** P1, P2. Both compilers follow §4.17.
- **Recommendation:** strike the `<style>` rows of §3.1 and §9.2.

### D17. Heterogeneous lifts: §10.4 says E-TYPE-012, §49.6 rule 2 says they give a union
- **Raised by:** P2.
- **Recommendation:** §49.6 wins (S469, later); strike E-TYPE-012's heterogeneous clause.

### D18. `== not`: §42.3.2 says E-TYPE-042, §45 says E-EQ-002
- **Raised by:** P4.
- **Recommendation:** E-EQ-002. §45 is the equality home, and the bootstrap emits it.

### D19. §18.9 E-TYPE-026 ("match is not valid as an attribute value") vs parenthesized attribute expressions (§17.6.10, §66.2.4)
- **Raised by:** P3 Q3/Q4. The bootstrap accepts `class=(match …)` and evaluates it correctly.
- **Recommendation:**
  - Retire E-TYPE-026.
  - Keep E-ATTR-UNQUOTED-OPERATOR for an UNparenthesized operator (`if=@a&&@b`) and build it. The analyze.scrml:16474 comment claims the parser refuses it; it does not.
- **Gap:** g-boot-bare-operator-gate-and-match-attr-accepted-s473.

### D20. §65.2 "all scrml-emitted selectors are specificity-flat" vs §65.2.5 "inside a scope"
- **Raised by:** P6 B. Both compilers leave program-global selectors un-wrapped (css.scrml calls this "CHOICE (review F6, unruled)").
- **Options:**
  - (a) Wrap globals in `:where()` too.
  - (b) Amend §65.2 to scope flatness to component scopes.
- **Recommendation: (b).** Component scopes are emitted unlayered, and globals sit in `@layer global`, so an unlayered rule beats a layered one whatever its specificity. Global specificity therefore never competes with a component rule, and (b) records what both compilers do with no output change.

### D21. §19.11.2 / §19.11.3 show an unhandled failable call assigned to a cell, which §19.4.3 (S467) makes E-ERROR-002
- **Raised by:** P3 Q1.
- **Recommendation:** rewrite §19.11.2 to the handled form. Its example also uses `<errorBoundary>`, `lift` arms and the `::Ok` alias.

### D22. §6.6.5 "a stale read SHALL return the previously cached value" and the `flush()` built-in
- **Raised by:** P1 Q5. The bootstrap's pull-on-read returns the fresh value, which is strictly better, so `flush()` has no job.
- **Recommendation:** rule pull-on-read correct, and retire `flush()` and E-REACTIVE-004 as impl#1-isms.

### D23. §6.5.12 "each mutation notifies on its own; no implicit batching" vs the bootstrap batching a whole handler
- **Raised by:** P1 Q6.
- **Options:**
  - (a) Amend §6.5.12 to handler-level batching under §66.11.7's permission-driven notify.
  - (b) Unbatch the bootstrap.
- **Recommendation: (a).** Batching within a handler is the expected model. The observable difference (effect run counts) should be pinned by a conformance case either way.
- **Gap:** g-boot-handler-batch-vs-6-5-12-s473.

### D24. §19.9.6 Idempotency-Key: does "every CPS-emitted server batch" cover whole-function client→server calls?
- **Raised by:** P3 Q5.
- **Recommendation:** rule that it covers any compiler-emitted retry of a call whose body may have run. The bootstrap's only retry is the CSRF refresh on a 403 that never ran the body, so it is vacuous there today, and the rule is clear for U1d.

### D25. Shape inheritance (§15.4 / §24.3: a component is valid only where its root element is) has no §66 destination
- **Raised by:** P3 Q6, P4.
- **Recommendation:** retire it. §66.15.1's mapping drops it, and placement is better served by the HTML content-model check (g-boot-html-content-model-unchecked-s473).
- **Gap:** g-boot-component-shape-constraints-unchecked-s473 (close it as superseded once ruled).

### D26. `fixed` (§15.7) "carries over" in §66.15.1, but a §66 use cannot override anything
- **Raised by:** P3.
- **Recommendation:** retire `fixed` and refuse it with a named message. Today it leaks into the DOM as `fixed=""`.
- **Gap:** g-boot-fixed-attr-leaks-to-dom-s473.

### D27. §41.17 says `scrml:compiler` gets a NON-fatal W-STDLIB-COMPILER-DEFERRED; the bootstrap makes it an error
- **Raised by:** P4.
- **Recommendation:** amend the SPEC to let an implementation refuse it. The text is about impl#1's bundler, and fail-closed is the safer direction.

---

## Diagnostics and conformance policy

### D28. Should every construct the bootstrap does not build get a NAMED refusal?
- **Raised by:** P1–P5. About 100 rows fail closed under a generic parse, scope or type code: `is .V` → "`is` is not declared", `or` → "`or` is not declared", maps → E-PARSE-EXPR, `throw` → "not declared", and more. The adopter reads a bootstrap limit as their own bug.
- **Options:**
  - (a) One named-refusal table (construct → "not in the bootstrap (§N)").
  - (b) A gap per construct.
  - (c) Accept generic codes.
- **Recommendation: (a).** It is one mechanism, one review, and it makes every remaining limit greppable. The umbrella gap now lists the whole family.
- **Gap:** g-bootstrap-unimplemented-construct-reported-as-generic-code (widened).

### D29. Code-name drift: bootstrap codes that differ from the SPEC's
- **Raised by:** P1, P4, P6. Examples:
  - E-PARSE-NO-NULL for E-SYNTAX-042;
  - E-PARSE-STRICT-EQ for E-EQ-004;
  - E-REACTIVE-003 for E-AUTH-001;
  - E-SCOPE-001 for the read-side E-STATE-UNDECLARED;
  - E-TYPE-041 for E-TYPE-043 on `return not`;
  - E-FN-003 for E-FN-004;
  - E-ASSIGN-POSITION (no §34 row).
- **Recommendation:**
  - Where the SPEC code is more specific, re-code the bootstrap: E-AUTH-001, E-STATE-UNDECLARED, E-TYPE-043, E-FN-004.
  - Where the bootstrap code is a parser-level spelling of the same rule, add or point §34.2 rows and update §42.6 / §45.7: E-PARSE-NO-NULL, E-PARSE-STRICT-EQ.
  - E-ASSIGN-POSITION follows D10.

  Reason: one code per rule, with the specific code winning.

### D30. Conformance grading: an unexpected parse-phase error on an error-expecting case is bucketed UNSUPPORTED, never FAIL
- **Raised by:** P1 Q2, P4. This hides code drift, and it hid the import-cycle hole (the module cases fail on missing `;`).
- **Recommendation:** count a wrong error code as FAIL, keep UNSUPPORTED for E-BOOTSTRAP-UNSUPPORTED only, and fix the module cases' semicolons.
- **Gap:** g-boot-conformance-parse-reject-hides-code-drift-s473.

---

## Record-keeping (no semantics change; PA can action once approved)

### D31. Authorize one SPEC record-lag sweep
- **Raised by:** all parts. The items:
  - **Ruled, but the SPEC still says open:** §66.6.3 / §66.22 still list O54 as OPEN (ruled (a) at S442).
  - **Says the bootstrap lacks something it has:**
    - §66.12.8 says an index read is refused (it is built);
    - about 16 §66.20 rows say "not yet emitted" (they are emitted);
    - the §55 header, §55.17 and the §55.15 rows are stale (surface and gate are built);
    - §14.4.1 says "neither compiler accepts `E.parse`" (the bootstrap does).
  - **Says the bootstrap has something it lacks:**
    - W-GRANT-REDUNDANT and E-FOREIGN-REPLACE-PRIVATE rows say the bootstrap emits them (it does not);
    - the §52.6.8 banner says "the bootstrap builds it" (false).
  - **Status lines:**
    - §13.9 says "the bootstrap builds this section" (only a parse refusal touches it);
    - the §14.8.9 / §14.8.10 "Implemented" lines read as language-wide but describe impl#1;
    - §2.4 still reads SHALL although the S440 restatement is owed.
  - **Missing supersession markers:** §14.4.0, §14.9, §14.12, §5.4.1, §5.5.5.
  - **Wording and content:**
    - §8.1.1 lists `mongo:` as a valid `?{}` prefix;
    - §6.5.3 (`key=` on the lifted element) vs §17.4b (header `key`) needs one canonical form;
    - §9.3 (`.css` ingestion, no mechanism) is stale;
    - §4.5 `verbose closers` (neither compiler) should be retired.
  - **Rulings that never landed in the SPEC:** the S468 ruling E-SQL-SLOT-IN-LITERAL; the §7.5 E-PARAM-TYPE-REQUIRED re-code.
- **Recommendation:** one doc-currency PR, item by item from this list. It changes no semantics, and every stale line is a future false classification.

### D32. Gap housekeeping (PA-level, listed for completeness)
- **Retitle:** `g-boot-stdlib-none-compiles-s471` (math and random now compile).
- **Narrow:** `g-bootstrap-no-channel-handler-checks-s462` (unreachable while `<channel>` is refused).
- **Close the bootstrap half:**
  - `g-spec-host-promise-statics-s470` (the bootstrap already refuses the statics);
  - `g-bootstrap-unnamed-state-child-variant-codes` (by updating SUPERSEDED_CODE_MAP).
- **Point at the bootstrap too:** `g-spec-enum-payload-field-named-variant-s470`.
- **Fix the body:** `g-bootstrap-no-s5-2-sink-floor-s462` is resolved, but its body still lists open items.
- **Add §52.6.8 rule 2** (a server log line in every build mode) to `g-bootstrap-db-cell-load-failure-surface-s473`.
- **No-row codes:** 36 bootstrap codes have no §34 row (`g-bootstrap-s34-rows-owed-s451`).
- **Recommendation:** the PA actions these without a ruling.

### D33. Classifications kept as the auditors made them (flagged so the PA can overrule)
- **§14.8.7 / §14.8.8: REFUSED-LOUD (gated).** A `?{}` row is untyped at compile time, and the exact-key codec catches a mismatch at run time with a 500. If impl#1's Tranche-1 row typing works without `tables=` (UNVERIFIED), these become SILENT-ABSENT.
- **§40.9: N/A.** It is MAY and staged. Its SHALLs bind only once `<auth>` exists.
- **§58 / §62: SILENT-ABSENT.** The workability map says N/A. A SPEC banner is not a deferral, so they got gaps.
- **§6.6.19: REFUSED-LOUD (latent).** It is gapped with T3.
- **§6.7.1a `<onMount>`: reclassified DEFERRED-RULED → SILENT-ACCEPT.**
- **Recommendation:** keep all five. Each is stated with its reason in its row.

---

## Follow-ups that need no ruling (investigate)

- **P5 Q6.** The bootstrap's E-FN-004 message prints "a `function` body is pure", where the source string (analyze.scrml:6807) says `fn`. That suggests impl#1's library-mode `fn`→`function` rewrite reaches string literals in the bootstrap bundle. If so, other bootstrap strings could be altered too. Worth one probe; no gap filed until confirmed.
- **P4.** Re-probe `<p><div>${@x}</div></p>`: the browser re-parents the `<div>`, which may misaddress the bootstrap's child-index template holes. If it reproduces, raise g-boot-html-content-model-unchecked-s473 to HIGH.
- **P6.** Confirm which site §63.7's W-GIVEN-ARROW-LEGACY targets (the `given` guard or a match-arm arrow) before building g-bootstrap-given-arrow-legacy-lint-missing-s473.
