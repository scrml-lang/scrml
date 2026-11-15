# s478-boot-pending-tape-grants progress

- started at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ab613a9226a8253c4 (base origin/main 5a0fd0eb5, includes #1852)
- baseline pre-commit gate: 47516 pass / 0 fail / 125 skip / 13 todo

## Governing text
SPEC §13.9.1 rule 4 (RULED S478): "a whole-cell author write into a pending tape, `let` or locked,
needs `replace` in the tape's grants (`(not to S[replace])`) like any other tape, and without it is
**E-WRITE-NOT-GRANTED**. The load's own writes are rule 5's, and a reset (§6.8) re-runs the load
(§13.9.2), so neither needs `replace`."

## Locus verification
- parse.scrml `lifeRefusal` (grantedSeq line): HELD — removed the refusal.
- analyze.scrml `fieldOf` (`grantRep = isLet || seqRep`, `if (life) grantRep = true`): HELD in part —
  the replace channel must stay (the settle write is resolved through wholeFieldWrite and Core needs
  `replace` in the field's grants); what was wrong was the EDITS (`typeEdits(ty)` on `S[g] | not` → [])
  and that every edit site judged by `f.grants`, whose `replace` admitted every edit.
- `pendTapeReplaces` / `checkWrite`: HELD as written (reads the tape type's grants); only the message
  changed (no gap mention; "does not grant `replace`").
- NEW loci not in the hypothesis: the edit sites (resolveEditCall / resolveSeqShape / resolveRemoveCall /
  resolvePositionWrite / resolveElemFieldWrite: authorGrants, lockedLifeEdit, editPlace) and the typer
  (typeCallStmt / typeAssign: pendEditRead — an edit before discrimination is E-TYPE-001).

## Found on base
- FAIL-OPEN: a `let` pending tape with no grants admitted every edit (`@users.append(u)`, `.pop()`,
  `[...@users, u]`, `@users[0] = u` compiled clean), unnarrowed too.

## Steps
- [x] parse + analyze + slice-m4 test (pending-tape-grants-s478.test.js), lifecycle-type-s475 pins updated
- [ ] conformance case
- [ ] corpus measure
- [ ] gap marker flip + new residual gap
- [ ] PR
