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

## Fix round r1 (#2098 review, ~/.cache/scrml/review/s482-2098/review.md)

- [x] MED-1 — item 7's impl#1 measurement was false; re-measured (`compiler/src/cli.js compile`): app2 (`import { Config as C }`, `<c>: C`) registry holds `"Config"`, no `"C"`; app3 (import unused) no imported entry; literal `reflect(C)` E-META-003; literal `reflect(Config)` compiles (emits `struct`) when a cell is typed `Config`, E-META-003 when nothing is. §22.4.2 parenthetical replaced with the review's text.
- [x] LOW-1 — §22.4.2 impl#1 status line: own types (server-only `Secret` included, app/app2/app3) + typed imports under the declared name.
- [x] LOW-2 — §21.3 residue: runtime `^{}` E-BOOTSTRAP-UNSUPPORTED (n5, n6); compile-time `^{}` E-META-EVAL-001 `g-boot-meta-imported-capture-s481` (n2).
- [x] LOW-3 — analyze.scrml foreignQualMsg / notDeclaresMsg (failSpellHere over typeSpellHere): a declared failure enum is named as written here (`m.AuthErr`, alias `A`, or by no name) + where declared; never the wire's `Transport` for a `!` callee. Pinned f1/f2/f3/f4/f5.
- [x] INFO-1 — parse.scrml inForHead: no top-level `;` before the head's `)` (semiBeforeClose); pinned r6.
- [x] gates — pre-commit PASS ×2 (58252 pass / 0 fail); pretest exit 0; bootstrap-conformance 9fc78dc90 vs head identical (PASS 848 / FAIL 3 / NT 628 / UNS 491 / CRASH 0); corpus differential 2974 files, 0 verdict / 0 code / 0 output diffs; s34-census --check-new (base f58e2a503) PASS; snippet-gate 0 fail; claim-gate 0 fail.
