# s478-boot-markup-in-logic — progress

Lane: markup inside logic blocks (bootstrap, compiler/self-host-v2/). Base: origin/main 213dd1203.

## Built
- `${ if … }` in a free-text markup body whose branches hold markup (parse.scrml `tier0IfAhead` /
  `parseTier0If` / `parseTier0IfChain` / `parseTier0Branch`): read as a Tier-0 region (`tier0Region`,
  lexTier0X `bare` — rows for `lift <x/>` AND statement-start elements), lowered as a ONE-PASS
  View.Gather `for { <if> break; }` — no second markup-in-logic path; rows, re-render and row reads
  are the Tier-0 loop's (analyze resolveTier0, lower gatherView, print gatherJs unchanged).
  - value-form (§17.6.10): every branch ONE element / expression / nested value-form `if` → `lift`.
  - otherwise every branch is a statement list (§10.1 accumulation, §10.8.2 taken branch only).
  - E-LOOP-001 / -002 for an unlabelled `break` / `continue` in the chain (§49.9).
- E-MARKUP-STATEMENT-NOT-RENDERED (§17.6.10.1): bare element in a Tier-0 `${ for }` / `${ if }`
  region (sibling-cause message when a single-element branch sits beside a non-single one),
  `${ <p/> }` in markup (`parseTier0Bare`), and body-top `${ … }` logic blocks (`logicBareStmt`:
  depth-0, after/before a statement, function bodies).
- E-STRUCTURAL-ELEMENT-MISPLACED (§4.15) for onTransition/onTimeout/onIdle/page/onchange/theme/
  defaults standing in a logic block.
- `lift <element>` in a logic block is a Lift statement (analyze judges: E-SYNTAX-002 in a bare
  `function`, §10.4; else refused by name). It takes its `;` (§7.2.2 rule 2).
- conformance: 4 cases migrated `lift <…>` → `lift <…>;` (§7.2.2 rule 2; "the conformance corpus
  was migrated ad hoc").

## Held / owner questions
- g-boot-body-top-lift-render-s478 (OWNER): body-top `${ lift <x/>; }` / `${ if (c) { <x/> } }`.
- g-boot-markup-in-logic-residue-s478: match-with-lift arms, body-top function / handler markup,
  given guard; `renders` §19.2 untouched (type-decl path, not lift).

## Measurements
- conformance base: PASS 552 / FAIL 11 / UNSUPPORTED 670 / NOT-TWINNED 635 / CRASH 0.
- conformance head: PASS 557 / FAIL 11 / UNSUPPORTED 665 — +5 PASS (ctrl-029, markup-if-arm-
  reads-rerender-pos, markup-statement-not-rendered-neg, raw-content lift-raw-body, engine
  ontimeout-misplaced-pos), 0 PASS→FAIL.
- corpus (3150 files: samples, examples, conformance, acceptance; same files, base vs head
  bootstrap): 0 newly-rejecting, 0 newly-accepting, 83 already-rejecting files change error set.

## Fix round 1 (review #1919)
- F1 (HIGH): chainJumps / leaveNoLoop deleted. The one-pass loop and its own `break` carry the
  reserved label `#if` (parse.scrml / analyze.scrml tier0IfLabel; `#` starts no identifier, so no
  source jump names it). analyze loopJump passes over that frame for an unlabelled jump
  (E-LOOP-001 / -002 at any depth: match arm, `!{}` arm, match initializer); labelsHere / loop
  label lists skip it; resolveFor mints it as `loop`.
- F2 (MED): E-MARKUP-STATEMENT-NOT-RENDERED only for a registry element (isKnownElementName),
  lower-case first, not followed by `=`, not after `renders`, no `=`-text child (declShaped).
  Else refused by name (logicRowOther / bare-row-other) as BASE did; a bare-row-other still
  stands as a value-form branch's single element.
- F3: empty-sibling wording. F4: `${ if … }` wording (E-VALUE-WRITES-STATE what, return/fail).
- F5: gap g-boot-rawtext-parent-markup-rows-s478. F6: left (§4.15 allows either code).
