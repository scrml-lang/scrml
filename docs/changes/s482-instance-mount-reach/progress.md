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
- [ ] gates
- corpus: 2977 files, 0 newly rejected / accepted, 0 byte diffs (corpus-base.json / corpus-head.json)
