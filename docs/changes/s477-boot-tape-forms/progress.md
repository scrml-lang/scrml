# progress — s477-boot-tape-forms
- start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ab670164895d19542 (base 709f53429)
- maps read: primary.map.md + bootstrap.map.md (f92d1a8fb). Load-bearing: the analyze anchors (`resolveLocalEdit`, `memberCall`, `resolveFieldAt`, `typeLocalEdit`) and "Put a decision in analyze, not in lower or print" (B2).
- concurrency read: #1824 (print.scrml `ownedLocals`, in-place owned edits) — it scans `Stmt.Assign(l, v, path)`: a non-empty path marks `l` edited, and a Prim's receiver read through a field / IndexRead is an allowed (part) read; this dispatch's part edits lower to exactly that shape, so they compose (no print.scrml change here). #1823 (analyze loop-source typing) touches no function edited here.

## Item 1 — g-boot-local-tape-part-edit-s475 (BUILT)
Governing sentences (SPEC §66.12.6):
- rule 1: "A tape's grants govern every write to it, in each position that can hold one: … a **struct field** whose type is a tape (§66.11.4: the field's tape type carries its grants); a **tuple position** whose type is a tape (the position's lifecycle, §66.12.5, governs replacing that position; the tape's own grants govern edits of the tape in it); a **local binding** … a **function parameter** …" and "Inference never invents a grant."
- rule 3: "Each method is a write: it is checked against the target's grants exactly as a whole-value write is (§66.11.2). An ungranted one is E-WRITE-NOT-GRANTED (§66.20). One that would break a length bound or a per-position type is E-WRITE-INVARIANT."
- rule 3 (RULED S475): "A call of `append`, `prepend`, `pop`, `shift`, `insert` or `remove` on a `const` local … SHALL be judged as an edit of the tape, against the grants of the tape's type … it does not rebind the name".
- §66.10 item 1: "A binding, argument or field initialized from a cell (or from any value) holds a snapshot of that value."
- §66.12.6 rule 3 (S473): a position write past the end "SHALL raise the E-INDEX-OUT-OF-RANGE-RT trap … and nothing is written" — the part read (IndexRead) before the edit traps the same way.
Meaning change: `b.xs.append(v)` / `g[i].pop()` etc. were E-BOOTSTRAP-UNSUPPORTED; now judged by the part's tape type and run.
Built: analyze `walkLocalPart` (shared with resolveLocalPartWrite, messages unchanged), `resolveLocalPartEdit`, `typeLocalPartEdit`; EffectFact `ELocalEdit` gains `path` / `tmps`; lower `localEditStmt` with path. Tests: slice-m4/tape-forms-s477.test.js A1–A3; conformance reactive/tape-local-part-edit-{rt,ungranted-neg} (impl#1 xfail on carried g-impl1-tape-method-unproven-receiver-throws-s469). Residue gap filed: g-boot-cell-subfield-tape-edit-s477.

## Item 2 — g-boot-tape-removal-value-s475 (BUILT; position residue INTERIM)
Governing sentence (SPEC §66.12.6 rule 3): "`pop`, `shift` and `remove` return the removed value, typed `T | not`: on an empty tape, or a `remove(i)` with no position `i`, nothing is removed and the result is `not` *(derived from §42: scrml has no `undefined`; not separately ruled)*. The grow methods return no value." §66.12.8 rule 7: "`xs.remove(-1)` has no position `-1`, so it removes nothing and is `not`".
Meaning change: `const v = xs.pop()` (and shift / remove(i), cell pop / shift) was E-BOOTSTRAP-UNSUPPORTED; now typed `T | not` and run.
Built: analyze `resolveRemovalValue`, `assignWhat` (a part-target assignment's value position is named "… to a part"), `mintTaken`; ELocalEdit `taken` / `at`, ERemove `taken: SeqSnap | not`; typer `typeCall` branch; lower `removalPre` / `removalOrCall` / `removedRead` (AtRead), in Local / Return / Eval.
INTERIM (named refusal, gap g-boot-tape-removal-value-position-s477): any position other than a whole statement value — SPEC is not silent here (it types the value everywhere); the refusal is a bootstrap capability limit (Core has no value-yielding rebind outside condition heads), capable form recorded in the gap.
Tests: tape-forms-s477 B1–B3; conformance reactive/tape-removal-value-{rt,not-t-neg} (impl#1 xfail on new carried gaps g-impl1-tape-alias-reference-semantics-s477 — §66.10 already records the divergence as CARRIED — and g-impl1-tape-removal-value-untyped-s477).
