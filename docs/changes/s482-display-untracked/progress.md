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

## r1 (review of #2107, fix round 1) — the above "Refinements" and "Open for the PA" are superseded

- [x] item 1 (decision iv): spine code is never a writer, before or after the display's place — S481
      ruling:user-voice-scrml.md-S481-body-run-order, *"A display of a `free` value reads it where it stands."*
      Writers = handlers, effects, `when … changes`, requests (incl. held runs); re-running `^{}` and function
      values in spine code kept as PA reading (prov=pa-ruled). Declaration-markup statements (they run at the
      instance's place) are spine too. free-display-reads-in-place: no W-DISPLAY-UNTRACKED.
- [x] F1: `writesShown` suppression dropped (conditional / other-branch / same-value cell writes re-render
      nothing: fn27 / fn30 / fn29 pinned as warning). Accepted over-report: fn26 (unconditional changing cell
      write in the same writer — display not stale, warned).
- [x] F2: a `^{}` re-runs only when its body (outside a function value) holds `^.get(@x)` — meta.scrml's
      respelling of `meta.get("x")` and a cell's `meta.bindings.x` (§22.5). rr01 no warning; rr04 warns.
- [x] F3: request fix-it half cites E-BOOTSTRAP-UNSUPPORTED Core C-R1 INTERIM, labelled PA reading; effect half
      labelled as following from §6.7.4.
- [x] F4: fix-it quotes the `let` as written (string literal re-escaped; written annotation incl. grants); a tape
      cell keeps its written grants and adds `replace` / `write` / edit grants derived from every write of the
      `let` (effect facts). Grant-text helpers live inside THE TAPE GRANT READER (grant-scan R7).
- [x] F5: fn25 (component display, body-top write after the use) is no longer a warning case (item 1). §34 row
      now carries the decision (ii) lane-reading label.
- [x] Corpus (3046): 2 warnings, both true positives (module/file-scope-let-foreign-write-neg,
      components/component-scope-by-value-local-shadows); 0 verdict / byte / other-warning diffs vs base.
- Known residual (not a ruled writer kind, not built): spine code inside a construct mounted LATER by an event
  (an `if=` toggled by a handler) runs in a later turn; it is treated as spine and not reported.

## r2 (fix round 2 — #2107 r1 re-review F-A..F-E)

- [x] F-A (MED): a string initializer's fix-it is always parenthesized (`let <s:string=("a\nb")/>`), and a
      control character other than `\n` / `\r` / `\t` is re-escaped `\xHH`. Applied as printed it keeps the value
      (Chromium: newline, tab / CR, `${`, `\x01`). Pre-existing opener-escape bug filed:
      g-boot-opener-string-escapes-s482 (HIGH — silent wrong value in ordinary code; not fixed here).
- [x] F-B (LOW): `rerunsOnDeps` exempts only a function value passed DIRECTLY to `^.timeout` / `^.interval` /
      `^.cleanup` / `^.subscribe` (§22.5 quoted); seen-lam / seen-arg warn; a cleanup / timeout callback does not.
- [x] F-C (LOW): need-minus-have (and the `free` addition) computed in THE TAPE GRANT READER (`tapeCellText`);
      `grantList` moved in; `editGrant` removed for `localEditMethodName`.
- [x] F-D (LOW): INTERIM sentence in §6.15 + §34 row; gap g-boot-display-untracked-later-mount-spine-s482.
- [x] F-E (info): `free` added for a growing / shrinking edit with none written (y6 cured); `.remove` / `.insert`,
      a part edit, a write through a position or a sub-field tape position → "the cell form is not yet supported
      for this edit … no cell fix-it is given" (y8 / y10 / y11).
