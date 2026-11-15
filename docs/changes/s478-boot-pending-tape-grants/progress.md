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
  — commit 0b9cf14dc; hook 54800 pass / 0 fail / 238 skip (first attempt timed out shard 0 at 1200 s under
  machine load; re-run with SCRML_HOOK_SHARD_TIMEOUT_S=2400 passed)
- [x] conformance: lifecycle/pending-tape-granted-append-rt, lifecycle/pending-tape-granted-replace-rt —
  bootstrap PASS (`bun scripts/bootstrap-conformance.ts --filter pending-tape --no-twins`); impl#1 XFAIL
  (g-impl1-pending-cells-unbuilt-s477; signatures via `bun conformance/run.ts --xfail-signature …`);
  impl#1 run 1751/1867 pass, 116 xfail. Both pinned in scripts/host-global-scan.known-throws.txt
  (`bun scripts/host-global-scan.ts --check --roots conformance/cases/lifecycle` reported them unpinned).
- [x] corpus: throwaway `.tmp/corpus.js` (deleted) — bootstrap `frontEnd` over
  `git ls-files -- conformance/cases samples examples compiler/self-host-v2/acceptance` (*.scrml):
  3,146 files (main has grown since the 3,142 of the earlier s478 lanes), 0 crashed; run with this lane's
  analyze.scrml + parse.scrml and with origin/main's (`git show origin/main:… >`, then `git checkout HEAD --`),
  per-file Error `code|span.start` sets compared: 0 changed, 0 newly rejecting, 0 newly accepting.
- [x] gap: g-boot-pending-tape-granted-lifecycle-s478 -> resolved (marker + entry); NEW
  g-boot-plain-lifecycle-tape-grants-s478 (open, ruling owed).
- [ ] PR

## Residue noted
- `@xs = @xs.filter(…)` / `.map(…)` on a narrowed pending tape: refused by the pre-existing
  g-bootstrap-method-receiver-narrowing-blind-s469 (resolver reads no narrowing at a method receiver).
  Pinned in the test (D′).
