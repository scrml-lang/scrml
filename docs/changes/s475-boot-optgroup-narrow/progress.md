# s475-boot-optgroup-narrow — progress (append-only)

- 2026-11-05 22:00 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-aa30ef98570bc1a23, base origin/main 16ffdaee8.
- 22:10 HTML §13.2.6.4.7 (fetched html.spec.whatwg.org/multipage/parsing.html), start tag "optgroup": "If the stack of open elements has a select element in scope: Generate implied end tags. If the stack of open elements has an option element in scope or has an optgroup element in scope, then this is a parse error. Otherwise, if the current node is an option element, then pop the current node from the stack of open elements."
- 22:10 Chromium 152.0.7977.82 (puppeteer; template / DOMParser / div.innerHTML agree):
  - `<div><optgroup><optgroup>x` → div(optgroup(optgroup("x")))  KEPT
  - `<div><option><optgroup>x` → div(option,optgroup("x"))  REPAIRED (the dispatch's claim that option>optgroup is kept outside a select is wrong)
  - `<select><optgroup><optgroup>x` → select(optgroup,optgroup("x"))  REPAIRED
  - `<select><option><optgroup>x` → select(option,optgroup("x"))  REPAIRED
  - `<select><div><optgroup><optgroup>x` → repaired; `<select><optgroup><div><optgroup>x` → kept; `<select><option><span><optgroup>` → kept
  - `<div><option><hr>` / `<div><optgroup><hr>` kept; `<select><option><hr>` / `<select><optgroup><hr>` repaired
- 22:20 analyze.scrml mkRepair: optgroup-in-option unconditional; optgroup-in-optgroup gated on c.inSel. SPEC §24.5 bullets moved accordingly, plus provenance. Direction: newly-accepting.
- 22:25 slice-m4/optgroup-narrow-s475.test.js: base 6 pass / 3 fail; head 9 pass.
- known-gaps g-boot-parser-restructure-residue-s474 item 3 marked RESOLVED (the gap stays open for items 1, 2, 4, 5).
- Map (.claude/maps/bootstrap.map.md) has no markupParseDiags anchor: not load-bearing; locus found by grep.
