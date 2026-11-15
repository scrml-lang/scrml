# s478-boot-review-followups-2 — progress

Follow-ups from the adversarial reviews of #1895 and #1897 (`~/.cache/scrml/review/s478-followups.md`).

- [x] #1895 LOW-1 perf: `Globals.cycles` (importCycles once per run); onCommonCycle + checkImports read it. ring-80x5 969→107ms, ring-120x5 3768→111ms; cyc-probes P1–P9 output identical.
- [x] #1895 LOW-3: constValue's untyped-constant suppression narrowed from "file on a cycle" to `cycleUntypedRead` (the initializer reads a not-ready constant of another file on a common cycle — the pair resolveName lets through — or an already-untyped constant, whose own report owns it).
- [x] #1897 F1: bareBlock runs the §19.16.2 defer check only when !recovering.
- [x] #1897 F2: `TP.inFn` (set by parseFnDecl; cleared for when/effect/arrow bodies; markup sub-parses start false) — a bare-block defer outside a function body is E-DEFER-OUTSIDE-FUNCTION (§19.16.3 rule 4).
- [x] Gaps filed: g-boot-cycle-importer-path-order-scope001-s478 (#1895 LOW-2), g-boot-css-spill-bare-block-cascade-s478 (#1897 F3).
- [x] Conformance base vs head: identical buckets and emitted codes (PASS 518 / FAIL 14 both). Corpus (3176 files): 0 newly-rejecting, 0 code changes.
- [x] CI checks job gates run locally: all green.
