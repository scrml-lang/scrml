# s482-rulings-records-fu — progress

Brief: ~/.cache/scrml/review/s482-briefs/rulings-records-fu.md (items 1–8). Base: origin/main f58e2a503 (#2092 + #2093 merged).

- [x] 1 LOW-1 — E-TYPE-VARIANT names each same-named enum's spelling + declaration (analyze.scrml typeSpellHere / plainArm)
- [x] 2 LOW-2 — namespace import: "is in scope here as `m.T`" (no "import alias")
- [x] 3 LOW-3 — `of` hint gated on a `for ( … )` head (parse.scrml inForHead)
- [x] 4 LOW-4 — deleted the four struck r0-draft spans (§7.6 d2, §18.17 qualified-arm, §22.5.2 SHALL-write, §49.2.4 meaning-changing); each `grep -cF` = 0 on pre-#2092 main a6889bf61^1. The §18.17 struck production `expression 'is' '.' VariantName` WAS on main (count 1) — kept.
- [x] 5 INFO-1 — §18.17 (c) cites §21.3 rule 2 / S475; §18.13 + §18.17 say TypeName may be `m.T`
- [x] 6 INFO-2 — §21.3: struck the stale "refuses it by name today"; states what is built and the two INTERIM residues (meta body member; registry entry)
- [x] 7 §22.4.2 alias naming — PA-reading marker; impl#1 measured: literal reflect(C) = E-META-003 (reflect(Config) under a plain import too); runtime registry holds only the file's own types
- [x] 8 §22.4.2 scoped to a named import + ⚑ INTERIM for namespace members; clause on g-boot-meta-namespace-import-dropped-s482
- [x] gates — pre-commit hook PASS ×2 (58246 pass / 0 fail on commit 1); pretest exit 0; bootstrap-conformance base f58e2a503 vs head identical per case (PASS 848 / FAIL 3 / NT 628 / UNS 491 / CRASH 0); corpus differential 2974 files, 0 verdict / 0 byte diffs; s34-census --check-new PASS; snippet-gate 0 fail; claim-gate 0 fail.
