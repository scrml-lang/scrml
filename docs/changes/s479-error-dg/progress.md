# s479-error-dg — progress

Ruling: `scrml-support/user-voice-scrml.md` "⭐ RULED — S479 batch items 1 and 2, PA recs adopted (S479, 2026-11-18)".

Base: origin/main 2cf6df750. Base bootstrap conformance: PASS 645 · FAIL 12.

## Plan
1. SPEC: strike `:error` (§14.1.2 loci, §14.2 kinds note), retire E-ERROR-008 §34 row.
2. Conformance: error-008-neg → `:enum`; delete error-008-message-pos; engine/accepts-not-enum-pos `:error` → `:struct`.
3. Bootstrap parse.scrml: `:error` refusal → E-PARSE-TYPE with enum-form fix hint, body consumed (no cascade).
4. SPEC: retire E-DG-001 (every reactive-graph cycle has its own code); §31.2 sentence: call cycles are recursion, not an error.
5. Conformance: delete reactive/dg-001-cyclic-pos; add a mutual-recursion server-fn positive case (xfail impl1-ts).
6. Gaps: resolve g-boot-dg-001-call-cycle-unruled-s478; file impl#1-owed.

## Status
- [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 — all built; gates run (s34-census, severity, types, md-shim, corpus-floor, claim, snippet: all PASS).
- Head bootstrap conformance: PASS 647 · FAIL 9 (base 645 / 12). 0 PASS→FAIL. New PASS: error/error-008-neg, reactive/server-fn-mutual-recursion-clean. Retired: error/error-008-message-pos, reactive/dg-001-cyclic-pos.
- impl#1 conformance: 1740/1869 pass, 129 xfail (new xfail: server-fn-mutual-recursion-clean, gap g-impl1-error-kind-and-dg-001-s479).
- E-DG-001: RETIRED rather than re-scoped — no SPEC body text gave it a fire condition, and every reactive-graph cycle the SPEC names already has its own code (E-DERIVED-CIRCULAR-DEP, E-DERIVED-ENGINE-CIRCULAR, E-RESET-ON-CYCLE, E-TRANSITION-WRITE-CYCLE); a re-scoped row would be dead or double-fire.
- Corpus newly-rejecting: 0 (`:error` was already refused by the bootstrap, same code; the one corpus use, engine/accepts-not-enum-pos, migrated to `:struct`).

## Review r1 (#1966)
- [x] MED-1: `:error` body skipped by brace depth (`skipBraceBody`, token-level so strings/comments/template slots do not count), not parsed as fields — an enum-shaped body no longer eats the `}` and drops the next item. Tests: enum-shaped, garbage, nested, unclosed.
- [x] LOW-3: reactive/dg-001-cyclic-neg reworded to §31.2.
- [x] LOW-4: retired cases removed from windows-suite-reads-s474.txt.
- [x] Nit: E-VALIDATOR-CIRCULAR-DEP (§55.11) added to the §31.2 / §34 cycle-code lists.
- [x] MED-2 filed: g-boot-mixed-recursion-escalation-s479 (+ ⚑ note under §31.2).
