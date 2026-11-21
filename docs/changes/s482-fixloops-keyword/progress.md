# s482-fixloops-keyword — progress

Closes #2051 review MED-1 (+ LOW-1 if exact) in `scrml fix` loop rules (compiler/src/commands/fix-loops.js).

- [x] Measured impl#1 KEYWORDS (69): 29 compile as a `let` name read in a `while` head (kwlist probe);
      40 do not. Review's list of 19 was short by 10 (animationFrame, fail, fn, lift, lin, match, of,
      reset, server, transaction; `match` tokenizes as IDENT there, `of` is a head hazard).
- [x] MED-1: `nameTok` — an IDENT or a KEYWORD that is no ECMAScript reserved word counts as a name in
      the condition-read set, the declared-name slot and the cell-opener slot. Tests added.
- [ ] Red-on-base check
- [ ] LOW-1
- [ ] corpus base vs head, gates, PR
