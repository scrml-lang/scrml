# progress

- 2026-11-08T09:52:31-07:00 start: F4 checks passed; base f92d1a8fb == origin/main
- 2026-11-08 governing sentences (quoted):
  - SPEC §66.9 rule 3: "**Derived = locked + a reactive initializer.** A locked declaration whose initializer reads cells is **DERIVED**: it recomputes when a dependency changes (the §6.6.3 lazy-pull semantics) and cannot be written". No §66 sentence seeds a locked cell at its declaration; O60 (§66.9 rule 8) seeds only "a LIVE initializer **at a use site**".
  - SPEC §6.6.18 item 2: "**Object property writes** — `@derivedObj.foo = x` … on a derived object cell SHALL be `E-DERIVED-VALUE-MUTATE`" (the code for a write into a derived cell through an inner grant, now that the grant is inert).
  - provenance: conformance restoration of §66.9 rule 3 (no language-surface change; semantics-changed on the bootstrap seeded -> derived, fail-closed for writes).
- done: analyze.scrml fieldOf — a Derived (locked + reads) non-attribute field whose OWN type grants nothing (`edits` from typeEdits + `seqRep`) drops subFieldEdits(ty) + subFieldEdits(elem) -> no wcap -> printer emits rt.derived. Own-grant derived cells (Q1/Q2) untouched (inner grants kept too); attributes (Q3 use site) untouched.
- done: analyze.scrml fieldAtWrite / resolveElemFieldWrite — a write through an inner grant of a derived cell is E-DERIVED-VALUE-MUTATE (was: accepted; after the fieldOf change without this it would be E-WRITE-NOT-GRANTED "grants no write" / the internal no-capability defect message). Only where the target part HAS a grant: a derived cell whose part grants nothing keeps its existing code (E-WRITE-NOT-GRANTED; pre-existing §6.6.18 code imprecision, NOT changed — deferred item).
- done: check.scrml C1b invariant (Derived Child field with no own grant carries no FieldAt grant).
- done: slice-m4/derived-no-inner-wcap-s476.test.js — 23 tests; on base 10 of the then-20 failed (all the "derived/tracks/refused/C1b" ones), PINs green on both.
- done: R26 lotto-analyzer — the current analyzer.scrml no longer has the shape (adopter worked around it: Sim.ledger is `Entry[]`): base and head emit are byte-identical. Variant with `ledger: Entry[replace]` restored (the adopter's original): sims/sim/pairSim/youngSim/mixSim flip seeded -> derived; node --check OK; bryan's tests/verify.mjs: head ALL CHECKS PASSED, base 21 FAIL.
- next: corpus sweep head vs base, conformance after, hook, PR.
