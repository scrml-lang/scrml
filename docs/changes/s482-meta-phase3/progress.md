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
