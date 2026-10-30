# s473-boot-p5-holes — progress

Source: SPEC-audit part 5 (`~/.cache/scrml-agent-tmp/spec-coverage-audit/part-5.md`), five holes.
Bootstrap only (compiler/self-host-v2 + scripts/scrml-boot.ts). impl#1 frozen.

## Status
- [x] 1 §48.8 / §48.4.1 — return-type inference (`inferReturn`, typer fixed point) + E-FN-007 (fn)
- [x] 2 §51.0.J — locked + reactive initializer + state-children → derived; `rule=` → E-DERIVED-ENGINE-NO-RULES
- [x] 3 §47.13 — dev server static allowlist (imports compiler/src/static-serve-policy.js; + realpath containment)
- [x] 4 §47.1.1 — E-NAME-COLLIDES-RESERVED-PREFIX (declarations + bare/@ references; stdlib exempt)
- [x] 5 §51.0.E / O33 — `<program>` field with no value → E-BOOTSTRAP-UNSUPPORTED naming O33
- [x] tests: slice-m4/p5-holes-s473.test.js (17 red on base, 25/25 green); fixtures that leaned on the Unknown call result updated
- [ ] known-gaps: #1673 files the ids — merge main after it lands, then RESOLVE/NARROW (do not file new)
- [ ] gates: slices m1–m4, CI checks job, types-gate, s34-census, e2e-render-map
- [ ] PR

## Corpus (conformance/cases, samples, stdlib, examples — 2858 files, bootstrap)
Base: 69 clean. Head (all 5): 69 clean; 0 newly refused; 0 newly clean; 7 already-failing files change codes.

## Notes
- base tree for measuring: ~/.cache/scrml/review/p5-base (git archive origin/main)
