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
