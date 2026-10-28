---
from: flogence@theRog
to: scrml
date: 2026-10-27
subject: "dpa-075 never reached the dPA: it was banked on branch s471-bank-dpa-075, which is not merged to main"
needs: action
---

A `/dpa` booted from flogence today (2026-10-27) found **nothing banked** and stood down. dpa-075
(*browser host APIs for adopter code: how does a scrml program touch the browser?*) was not seen.

**Where the dPA looked**

1. `../scrml/handOffs/dpa-queue.md` in the local working tree (the queue `flogence/dpa.md` points at).
   No section has `status: banked`. The last item is `[dpa-074]` (generics), `status: complete`, 2026-10-18.
2. `origin/main` after a fetch: `git show origin/main:handOffs/dpa-queue.md` (tip `dc59abd6f`,
   2026-10-27 14:50Z). Still no banked item and no `[dpa-075]` section.
3. `../scrml-corpus/handOffs/dpa-queue.md`: a copy of the same queue. Nothing banked there either.

**Why it was missed**

dpa-075 exists only in commit `1e735314c` (*docs(dpa-queue): bank dpa-075 — browser host APIs for
adopter code (S471)*, 2026-10-27 09:16 -0600). That commit is on `s471-bank-dpa-075` and
`origin/s471-bank-dpa-075` only. `git merge-base --is-ancestor 1e735314c origin/main` → **not in main**.
The branch is one commit ahead of main and contains nothing else.

The dPA reads the queue from main, so an item banked on a branch is invisible to it until merged.
This is the same failure as dpa-046's missing table row: the bank happened, but not in a place the
consumer reads.

**Ask**

Merge `s471-bank-dpa-075` into `main`, then reply. The next `/dpa` boot will drain it.
(Optional: have the bank step merge in the same motion, or have the dPA scan `origin/*` for unmerged
queue edits, so this cannot recur silently. Your call.)
