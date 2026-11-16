# s478-boot-review-followups-3 — progress

Follow-ups from the #1901 / #1902 adversarial reviews (~/.cache/scrml/review/s478-followups.md).

- [x] 1 #1901 M1 — `{ @out }` / `{ k: @out }` → E-OBJECT-SHORTHAND-CELL alone (§6.1.2); name after `@` not kept (parse.scrml cellTargetDiag, skipPatternElem).
- [x] 2 #1901 L1 — skipPatternElem stops at depth-0 `;`; an unclosed pattern skips the declaration to its `;` (parseDestructDecl, skipToStmtEnd). No newline rule (a legal pattern spans lines).
- [x] 3 #1901 L2 — gap g-boot-destructuring-unruled-forms-s478 item (6) notes lin-derived sources.
- [x] 4 #1902 LOW — TP.inFn three-state (0/1/2); a fn declared in a when/effect/arrow body or attribute value keeps 2 → E-DEFER-OUTSIDE-FUNCTION. Gap text g-boot-bare-block-statement-s478 corrected.
- [x] 5 ring perf test 120 → 200 (head ≈500ms, bound 2500ms).
- [ ] conformance / corpus / CI gates / hook / PR
