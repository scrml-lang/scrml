# s482-instance-mount-reach — progress

Lane brief: ~/.cache/scrml/review/s482-briefs/instance-mount-reach.md. Branch from origin/main 153bd0334.
Gap: g-boot-instance-mount-reach-later-binding-s482 (MED).
Artefacts: ~/.cache/scrml/review/s482-instance-mount-reach/ (base tree `base/`, probes `p/`, logs).

- [x] read code: analyze.scrml bodyReachDiags / bodyElemReach / codeReach / cellReach
- [x] build: analyze.scrml mountReach — a component use judges the code its mount runs at the use's place
      (field seeds less the use's attributes, render displays / attribute values / statements, derived
      fields the render reads (instCellOf hop), nested instances; handlers / effects / requests not judged).
      BodyCx carries `at` (the mount's place) + the outermost use for the diagnostic. print.scrml untouched.
      Not touched: serverInitsRound / constReads (lane s482-write-only-secret).
- [x] tests: slice-m4/instance-mount-reach-s482.test.js (15); related slices 215 pass
- [x] probes: p/m (m01–m18) + y01–y04, y10–y13, z01–z09 base vs head in Chromium (m-base.txt / m-head.txt)
- [x] SPEC (§7.6 R2 mount paragraph, R1 NIT-1 list, §34 row, §66.7.6 pointer) / known-gaps (resolved)
- [x] small (a): §7.6 R1 newly-rejected list — derived→later-const (n09, n03b)
- [x] small (b): cherry-picked 6bacb5990 (seed-timing gates table) as b71504033
- [x] gates (table below)
- corpus: 2977 files, 0 newly rejected / accepted, 0 byte diffs (corpus-base.json / corpus-head.json)

## Gates (code at c564ce803, docs 2c071a9af; base 153bd0334)

| gate | result |
|---|---|
| pre-commit (sharded, slices ON) | PASS — 58543 pass / 0 fail |
| pretest | exit 0 |
| bootstrap-conformance --json | PASS 851 / FAIL 3 / CRASH 0 — 0 bucket/emitted diffs vs base (1973 cases) |
| slices seed-reach, outer-cell-place, value-no-write, body-run-order (+ runorder-followups, handler-reach, instance-mount-reach) | 215 pass / 0 fail |
| Chromium seed-timing + use-site-row (SCRML_BROWSER_TESTS=1) | 24 pass / 0 fail |
| #2105 probe sets r1rev/r2rev/r3rev (302 unique), head vs base | 205 same value, 94 same refusal, 3 VALUE→REFUSED (y10/y11/y12 copies — intended), 0 value changes |
| lane probes (37: y01–y04, y10–y13, z01–z09, m01–m18, i01–i02) | see the PR body |
| corpus differential + byte-compare (2977 files) | 0 newly rejected / accepted, 0 byte diffs among the 326 that compile |
| s34-census --check-new --base 153bd0334 | PASS (1 changed row, well-formed) |
| types-gate --check | OK, unchanged |
| host-global-scan 1/2, 2/2 | 0 violations each |
| e2e-render-map | 259 pass / 0 fail |
| retired-forms-lint --base-ref 153bd0334 | OK, counts equal baseline |
