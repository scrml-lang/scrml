# s478-boot-semicolon-residue — progress

Lane: the bootstrap-conformance `parse-reject` FAILs behind the §7.2.2 `;` terminator
(E-STMT-MISSING-SEMICOLON) and related parse rejects (fails list: the #1888 tree). Branch
`s478-boot-semicolon-residue` from main `367ddb3b6`.

## Governing SPEC

- §7.2.2 rule 1: "In a statement list, every statement that is not block-like (rule 2) SHALL end with `;`".
  "Terms": a statement list includes "the statements of … a `<program>` / `<page>` / `<channel>` body top
  (§40.8)" and "any `{ … }` block of a statement (`if` / `else` / loop / bare block)".
- §7.2.2 rule 2: "A value declaration whose initializer is a block-like expression still ends with `;`";
  "an item delimited by its own closer: … a `type … = { … }` declaration" (a braceless `type X = int` is not).

## Done

1. (a) Case sources predating the `;` rule — `;` added where rule 1 requires it (no assertion changed):
   body-top/{bare-write-is-legal, code-line-after-declaration-runs, lone-identifier-is-code,
   no-effect-statement-rejected, template-const-renders}, codegen/cg-export-enum-library-rep,
   condition/given-presence-deprecated-arm, defer/unsupported-site-neg, linear/lin-001-never-consumed-neg,
   linear/lin-002-double-use-pos, loop/loop-002-continue-outside, match-leave/given-arm-body-lowered,
   match-leave/given-arm-legacy-arrow-keeps-body, reactive/{hoist-forward-ref-neg,
   reset-init-after-assignment-rt, write-not-in-logic-context-neg, write-not-in-logic-context-pos},
   server-fn/{branch-declared-server-fn-routes-to-server, e-route-003-neg, e-route-004-neg,
   e-route-004-pos}, auth/program-nested-app-attr-pos. The twinner (compiler/src/commands/fix-s66.js) is
   impl#1 (frozen) and has no `;` rule, so the sources were fixed, not the twinner.
   server-fn/e-route-003-neg also returned `1` from `-> Item` (E-TYPE-031, §34 "a value is assigned to a
   position whose declared type it does not satisfy") — now returns an `Item`; the case's subject
   (§12.5 serializable return type) is unchanged.
2. (b) Bootstrap fixes (red tests: slice-m4/semicolon-residue-s478.test.js, 10 red on base):
   - parse.scrml `bareBlock`: a statement-start `{` is a bare block (refused by name, INTERIM
     g-boot-bare-block-statement-s478) + §19.16.2 E-DEFER-UNSUPPORTED-SITE for a `defer` at its top.
   - refusals.scrml: "function expression" row (INTERIM g-boot-function-expression-s478); block-owning
     `switch (…) {` / `for await … {` rows (the switch / for-await bodies are now read as bare blocks).
   - parse.scrml `nestedWhenMessage`: `when message(d) { … }` in a nested `<program>` body (§4.12.4).
   - bareBlock recovery: a `{` on the line of an Error just reported is a misread construct's body (no
     refusal). claim-gate pin for docs/articles/llm-kickstarter-v2 block #51 updated (the body after the
     unreadable function-typed parameter is no longer an object literal).
3. Owner question: body-top/declaration-trailing-tokens-rejected (g-boot-body-top-trailing-tokens-vs-semicolon-s478).

## Measurements

- Conformance (base 367ddb3b6 → head): PASS 475 → 495, FAIL 63 → 41 (−22), UNSUPPORTED 695 → 697; PASS→FAIL 0.
- Corpus (samples/, examples/, conformance/cases, self-host-v2/acceptance — 3150 files, old vs new
  bootstrap): newly-rejecting 0, newly-accepting 0; 94 already-rejecting files change code sets (cascade shifts: object-literal misreads → bare-block reads).
- impl#1 conformance: all 22 edited cases PASS.
