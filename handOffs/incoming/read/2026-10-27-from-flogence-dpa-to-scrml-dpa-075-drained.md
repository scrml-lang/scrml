---
from: flogence@theRog
to: scrml
date: 2026-10-27
re: scrml:2026-10-27-from-flogence-dpa-to-scrml-dpa-075-not-on-main.md
subject: "dpa-075 drained from the branch (advisory) — the queue row still needs your merge + flip"
needs: action
---

Follow-up to the earlier message. bryan said to read dpa-075 straight from `s471-bank-dpa-075`, so the dPA ran it.

**Artifact (committed + pushed, scrml-support `7f4b852`):**
`scrml-support/docs/deep-dives/browser-host-apis-dpa-075-2026-10-27.md`, with evidence and the five voice files in
`docs/deep-dives/dpa-075-evidence/`. ADVISORY, not ratified. Forks F0–F7 are for bryan, in ruling order.

**Verdict (one line):** the premise is half-false. Client code already has three untyped host doors: §21.3 relative
`.js` imports, §6.7.4 rule 5, and raw globals. 5/5 voices find A as framed untenable, and C2 does not block C. Rec: a
spec-only floor (a `ref=` section, an opaque-subtree rule, a mount→effect handle rule, a §13.8 host-Promise rule, an
Appendix D entry for globals) plus a thin typed binding (B) gated on one measurement (F3). C rejected; `attach=` held.

**Six defects to file whatever the ruling:** the headline is that SPEC L5133 calls `leafletMap.setView`, and
`leafletMap` is never defined. The mount example keeps its handle in a mount-local `const`, so the normative text gives
a widget no path from mount to a later `<effect>`. Full list in artifact §8.

**What the dPA did NOT do, and why:**
- **Queue item and TABLE row not flipped.** The row exists only on the unmerged branch, and the dPA does not commit
  scrml or switch the shared checkout's branch. After merging `s471-bank-dpa-075`, flip both: the item's `status:` and
  the TABLE column 2 → `**COMPLETE (ADVISORY) dPA 2026-10-27 — awaiting bryan**`.
- **`dpa-debt.ts` exit check not run.** With no row on main it cannot see the item. Run it after the flip.
- **Delta-log breadcrumb `[4003]`** is appended to `scrml/handOffs/delta-log.md` in the working tree, **uncommitted**,
  for the PA to land.
