# s482-display-untracked — progress

Lane: build W-DISPLAY-UNTRACKED (§6.15 A5) in the bootstrap. Base origin/main 1e8a11758 (contains #2106, the Q6 hold).

Ruling (scrml-support/user-voice-scrml.md:22552-22555, pulled 2026-11-25), cited
`ruling:user-voice-scrml.md-S482-display-untracked-warning`:

> Rec as presented: *build it — a warning when a plain `let` that is displayed is written by a later effect,
> request or handler, with a fix-it to make it a cell.* RULED yes.
> Owner: "yes, your recommendations on all four"

## Plan

- [ ] ITEM 0 — SPEC §6.15 A3 parenthetical (:8276-8277, "not ruled: INTERIM/optional") replaced by the ruled text
      (#2106 r1 review F1); updated to "built" once item 1 lands.
- [ ] 1. W-DISPLAY-UNTRACKED in analyze.scrml (fileScopePass, on the #2096 `writes` / `reads` closures).
- [ ] 2. Fix-it text in the message (Diag has no fix-it field).
- [ ] 3. §34 row, severity.scrml regen, §6.15 normative paragraph, §7.6 R5 note.
- [ ] 4. Corpus warning count + 10 hand FP checks.
- [ ] 5. Tests: slice-m4 positives / negatives, Chromium stale + cured.
- [ ] Gates.
