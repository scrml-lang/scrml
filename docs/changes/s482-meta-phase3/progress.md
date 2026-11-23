# s482-meta-phase3 — progress

Lane: `^{}` phase 3 — runtime type registry (`reflect` / `meta.types` / `TypeInfo`) and `meta.subscribe`
in RUNTIME blocks. Brief: ~/.cache/scrml/review/s482-briefs/meta-phase3.md. Rulings:
ruling:user-voice-scrml.md-S481-meta-four (items 1–3). Base: origin/main 9db729e7b (contains #2067).
Scratch: ~/.cache/scrml/review/s482-meta-phase3/.

## Design (decided at start)
- `TypeInfo` / `FieldInfo`: compiler-known built-in STRUCT types (analyze typeStubs, fixed negative Syms so
  no other program's Sym shifts; shipped in Core only when named). Every entry carries all four members —
  `fields` / `variants` the EMPTY tape when the kind has none (gap g-boot-meta-typeinfo-absent-member-s481
  rec; the brief's direction) — in BOTH phases (§22.5.4 "SHALL be identical").
- meta.scrml: `reflect(T)` / `reflect("T")` / `meta.types.reflect(…)` in a runtime block → `^.reflect(name,
  [entries])`, the entries an array literal of the types the call can name (a literal: that one; a
  non-literal: every type in scope, §22.4.2 strategy 2). analyze types the entries against `TypeInfo[]`
  (so they lower as StructOf) and the call as `TypeInfo` (literal) / `TypeInfo | not` (computed).
- `meta.subscribe("x", (v) => {…})` → `^.subscribe(@x thunk, callback)`; runtime subscribes the callback to
  the cell, unsubscribes on re-run / dispose; callback body = lamBodyCheck (as timers).

## Log
- [x] c4a817163 compiler + runtime + tests (hook PASS). New test file red on base 21/23 (the 2 green are
      invariants: TypeInfo not shipped without a runtime reflect; E-META-003). Fixtures moved off
      `meta.subscribe` (now built) to a nested-in-runtime `^{}` (still refused): conformance-counter
      refused/unsupported, doc-gate AHEAD (bootstrap-mode, round2).
- Brief item 4 (callbacks that write cells) NOT built: a subscription callback writing its own cell would
  re-queue itself inside one flush with no cap (the MetaEffect cap does not cover subscriptions) — refused
  as before.
- [ ] records: SPEC §22.4.2 impl#1 note, §22.5 bootstrap status (phase 3 paragraph), §22.5.4 ⚑ OPEN note;
      known-gaps residue narrowed + absent-member S482 note; coverage §22.5 row.
- [x] 695dd352e records (hook PASS; one earlier attempt per commit failed on the hook's shard-1 MEMORY
      ceiling under machine load, not a test — retried unchanged).
- Chromium server in meta-phase3-s482.test.js moved to node:http: Bun.serve needs the host Response, which
  happy-dom replaces, so the two meta Chromium files failed when run in ONE process (each alone passed).

## Final gates (head = this commit's tree; base = origin/main 9db729e7b)
- pretest rc 0. bootstrap-conformance base 845/4/628/491/0 → head 845/4/628/491/0 (PASS/FAIL/NT/UNSUP/CRASH),
  0 moves. Cases touching reflect/types/subscribe: meta-allow-list-clean-pos, meta-nested-block-neg,
  meta-reflect-clean-pos, meta-reflect-outside-block-neg, meta-reflect-unknown-type-neg — PASS → PASS (all
  compile-time / static; no conformance case holds a runtime reflect or subscribe).
- impl#1 conformance-corpus -t meta 68/68. sync-bootstrap-meta-emit-gate --check in sync; gate drift test,
  meta-runtime-s482, meta-s481, meta-phase3-s482 (SCRML_BROWSER_TESTS=1) all green; both Chromium files in one
  process 68/0.
- Emitted byte-compare (1968 conformance cases, html+js sha) base vs head: 0 diffs.
- Corpus (76 `^{` files, fixS66, as written): base 3 OK → head 3 OK, 0 changes, newly-rejecting 0. The two
  named samples are blocked before meta on both trees (E-STMT-MISSING-SEMICOLON / old syntax); hand-migrated
  copies: meta-reflect-hybrid-002 base E-BOOTSTRAP-UNSUPPORTED → head compiles; meta-type-registry-001 base
  E-BOOTSTRAP-UNSUPPORTED → head E-OPERATOR-OPERAND-TYPE (its own `info.name || @selectedType`, S440 Q1/Q2).
- s34-census --check-new PASS; types-gate OK (182 unchanged); gen-bootstrap-severity current; gen-md-shim
  current; snippet-gate 120/0 (9 spec-ahead, 0 stale); claim-gate 0 failed; corpus-compile-floor PASS;
  e2e-render-map 259/0.

## r1 (fix round, review of #2080 @ c4804a601; merged origin/main 685f6f2c2)
- [x] ab54bf918 HIGH-1 (a) compile: `metaCbDiags` (PendRule.MetaCb, decided on the effect summary in rulesPass, which
      now takes the bound Tables): a runtime callback (subscribe / interval / timeout / cleanup) is scanned as an
      `<effect>` body (scanExpr); a call of a writing `function` / `fn` (transitively), a writing function as a value,
      and an unresolvable call (through a local) are refused E-BOOTSTRAP-UNSUPPORTED naming the chain. (b) runtime:
      `MetaSubscription` capped per flush (metaMaxRuns, 100) with a console.error, as MetaEffect.
      MED-2: `MetaEffect.deliver` runs the subscriptions a change queued before the re-run disposes them.
      LOW-3: `metaNestedRegs` refuses a meta registration inside any meta callback by name.
      Hook: first attempt failed on shard-1 MEMORY ceiling (not a test); retried unchanged, PASS.
- [x] (commit after ab54bf918) LOW-1 (happy-dom unregister in afterAll in both files; meta-runtime Chromium server on node:http), LOW-2
      (built-in TypeInfo/FieldInfo noted in messages where a user type shadows it — aliasNote / shownStruct; shadowing
      kept, as the built-in `Error` enum), records (SPEC §22.5 r1 status paragraph; gap residue bullets; new
      g-boot-meta-reflect-registry-scope-s482 for MED-1, INTERIM, owner question).

### r1 final gates (head vs origin/main d64e7e060; every run under a systemd-run MemoryMax scope)
- New r1 tests red on c4804a601: HIGH-1 compile (6 tests), LOW-3, LOW-2, MED-2 runtime + shipping: fail. The HIGH-1
  runtime backstop test on base loops without bound (the review's hang): killed at MemoryMax=3G. An earlier run of it
  on base without a ceiling grew to 25 GB before PA killed it; that was the base runtime hanging as the review
  measured, not the fix. On head the same test finishes (calls = 100, one console.error).
- pretest rc 0. bootstrap-conformance main 845/4/628/491/0 → head 845/4/628/491/0, 0 per-case line diffs, CRASH 0.
- impl#1 corpus-bridge -t meta 68/68; meta-emit gate drift test 3/0; sync --check in sync.
- meta-phase3 + meta-runtime + meta-s481 with SCRML_BROWSER_TESTS=1, both orders: 208/0 and 208/0.
- byte-compare 1968 conformance cases main vs head: 0 diffs. Corpus (76 `^{` files, fixS66 and raw): 3 OK → 3 OK, 0 diffs.
- s34-census --check-new PASS; types-gate OK 182 unchanged; gen-bootstrap-severity current; corpus-compile-floor PASS;
  snippet-gate 120/0 (9 spec-ahead); claim-gate 0 failed; gen-md-shim current; e2e-render-map 259/0.
