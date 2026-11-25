# s482-display-untracked — progress

Lane: build W-DISPLAY-UNTRACKED (§6.15 A5) in the bootstrap. Base origin/main 1e8a11758 (contains #2106, the Q6 hold).

Ruling (scrml-support/user-voice-scrml.md:22552-22555, pulled 2026-11-25), cited
`ruling:user-voice-scrml.md-S482-display-untracked-warning`:

> Rec as presented: *build it — a warning when a plain `let` that is displayed is written by a later effect,
> request or handler, with a fix-it to make it a cell.* RULED yes.
> Owner: "yes, your recommendations on all four"

## Done

- [x] ITEM 0 — SPEC §6.15 A3 parenthetical ("not ruled: INTERIM/optional") replaced by the ruled text (#2106 r1
      review F1), then by the built normative paragraph. No gap filed: built.
- [x] 1. analyze.scrml `displayUntrackedDiags` (fileScopePass, on the #2096 `writes` / `reads` closures).
      Displays: every RenderKind value position (interpolation, Tier-0 gather, non-handler attribute values incl.
      `class:` / `if=` / `show=` / `<each in= key=>`), program body and declaration markup. Writers: handlers,
      `<effect>` / `when … changes`, `<request>` (author-written), re-running `^{}`, function values / handed-on
      functions in spine code, statements in a declaration's markup, and spine code after the display's place.
      Component-scope plain `let`: in the bootstrap a `let` in a component body is a file-scope binding (§6.15
      item 4), so it is covered as one; a display in a declaration's markup is judged against live writers only.
- [x] 2. Fix-it in the message (Diag has no fix-it field): `let n: int = 1;` → `let <n:int=1/>`, `@n` for `n`;
      tape `let` → `<xs:T[replace, …]=(…)/>` (no `let`, O3); effect/request writer → also move the write out
      (E-EFFECT-WRITES-STATE / request body writes only its cell — verified by probes X1/X3) or derive.
- [x] 3. §34 row (Warning), severity.scrml regenerated, §6.15 normative paragraph, §7.6 R5 note.
- [x] 4. Corpus (3046 files): 3 warnings, 0 verdict / byte / other-warning diffs. All 3 hand-checked true
      positives; + 24 probes hand-checked (see below).
- [x] 5. slice-m4/display-untracked-s482.test.js (21; mutation: pass disabled → 12 RED), Chromium
      compiler/tests/browser/display-untracked-chromium-s482.browser.test.js (2).

## Refinements found by the FP check

- a writer that also writes a cell the display reads (`${@tick + n}`, handler writes both) → no warning.
- a `^{}` that uses no cell and calls no function runs once at its place → spine code, not live.
- the cell fix-it alone is refused for effect / request writers → writer-shaped second half.

## Open for the PA

- `conformance/cases/body-top/free-display-reads-in-place` now warns (a body-top write after the display's place).
  By the brief that is a positive (the display keeps the in-place value); the case exists to pin that value.
- Displays in a declaration's markup ignore spine writes (no single place) — a possible false negative.
- Over-report kept (fail toward the warning): a function value in spine code that runs only at its place.
