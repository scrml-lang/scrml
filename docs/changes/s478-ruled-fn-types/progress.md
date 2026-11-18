# s478-ruled-fn-types — progress

Lane: S478 open-Qs rulings items 3–8 (user-voice "⭐ RULED — open owner questions, PA recs adopted
wholesale (S478, 2026-11-17)"), gap `g-boot-fn-values-residue-s478` owner questions 1–6.
Branch `s478-ruled-fn-types`, base b04fdc27a. Scratch: `~/.cache/scrml/review/s478-ruled-fn-types/`.

## Done
- SPEC: §7.5 grammar + "Function types (S478)" + amendment + normative statement; §7.5.1 "Function
  types — invariance (S478)"; §7.3.4 "A call through a function value (S478)"; §12.5.3 "A
  function-typed result is E-ROUTE-003 (S478)" (⚑ PA reading vs ruling item 8); §19.4.3 "The failable
  function type (S478)"; §48.6.3 "The pure function type (S478)"; §14.3 examples; §34 E-PARSE-TYPE and
  E-FN-003 rows.
- Item 5 (`=>` only): parse.scrml thinFnTypeAhead / parseRetiredFnKw / parseFnTypeAt → E-PARSE-TYPE
  naming the fix, read whole. refusals.scrml: six function-type rows removed; two `fn(`-as-a-type rows
  (E-PARSE-TYPE) keep the anonymous-`fn` rows off a type position. 3 conformance cases migrated.
- Item 3 (failable type): AST `TFn.fx` (AFnFx), Core `Type.Fn(…, pure, err)`, `Failable.FCallV`;
  analyze fnValueType / resolveTypeFn / fnFits / resolveCallV / resolveHandled
  (failableValueCallee, noSuccessUseOf) / failableSubjectNamed; lower failableCall NLocal → FCallV;
  print / walk / check (C-FV2 relaxed, C-FV3 on FCallV, C-E1 skips FnRef).
- Item 4 (pure type): E-FN-003 for an impure call-through in a `fn` body, for a `fn` returning an
  impure function type, and for a pure type with an impure result; an arrow as a pure value refused
  by name (INTERIM).
- Item 8: hostServerDiags E-ROUTE-003; wireDiag skips function types.
- Tests: slice-m4/fn-types-ruled-s478.test.js (29; 27 red on base). Updated: fn-type-s478,
  error-model (HIGH-2), else-failable-s474, named-refusals-s473, server-await-review (s1/fnArg).
- Gaps: g-boot-fn-values-residue-s478 resolved; residue + 3 owner questions →
  g-boot-fn-values-interim-s478.

## Measurements
- Bootstrap slices (m1–m4, codec): 8218 pass, 0 fail.
- Conformance vs b04fdc27a: PASS 614 → 615 (reactive/narrowing-ends-unresolvable-call-reject),
  UNSUPPORTED 601 → 600, FAIL 18 → 18, CRASH 0, PASS→FAIL 0.
- Corpus (3211 files): newly-rejecting 0, newly-accepting 0; the three old-spelling cases were already
  rejecting (now E-PARSE-TYPE pre-migration).
- Gates: severity --check, types-gate, snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim,
  lint-no-default-arm, lint-duplicate-fn, spec-coverage-check — green.

## Fix round 1 (S239 review of #1943, ~/.cache/scrml/review/s478-1943/review.md)
- Merged origin/main (ba50527f9); known-gaps.md: kept the resolved marker + main's RULED paragraph.
- MED-1: refusals.scrml — `PASS` pass-through rows for a pure function type in a type position
  (`: fn (…) =>|!`, `-> fn (…) =>|!`, `type X = fn (…) =>|!`); the line keeps its real error.
- MED-2: SPEC §66 O8 + §66.15.3 example → `() => void` (struck), §34 E-STRUCT-FUNCTION-FIELD row;
  parse.scrml openerTypeMember: `name:fn(` in an opener is E-PARSE-TYPE naming the fix. Gap filed:
  g-boot-opener-fn-type-s478 (`act:() => void` in an opener does not parse — pre-existing).
- LOW-1: parse.scrml thinArrowAt — `(x: int)! E -> int` is one E-PARSE-TYPE.
- LOW-2: SPEC §48.6.3 — the `<state>`-field bullet and sentence struck as superseded by §14.3.
- LOW-3: analyze.scrml fnNameRef — a `!` function's refusal no longer says "Write `-> T`".
- ⚑ notes (§7.5.1, §12.5.3, §48.6.3): "PA reading pending the owner's confirmation".
- Tests: fn-types-ruled-s478 +7 (36 pass); named-refusals-s473 allows code PASS.
- Conformance vs origin/main: PASS 614 → 615, PASS→FAIL 0 (r1 itself changes no verdict).
- Corpus 3211 files vs origin/main bootstrap: 3209 identical, newly-rejecting 0.
