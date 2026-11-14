# s477-boot-tape-forms — BRIEF (task verbatim)

change-id: `s477-boot-tape-forms`. scrml repo, BOOTSTRAP compiler (`compiler/self-host-v2/`, written in scrml).

## POLICY
Bootstrap only; no `compiler/src/` changes. SPEC normative: quote governing sentence (§) in progress.md before each meaning/acceptance change; silent → record search, INTERIM named refusal, ruling owed. A scrml sequence is a `tape` (no JS arrays). No null/undefined/try/catch/async/await. No hand-edits of generated blocks. Honour the S475 ruling "local tape edit on a `const` local or parameter is an EDIT" (`/home/bmacs/scrmlMaster/scrml-support/user-voice-scrml.md` §S475, last entry — read it). OUT OF SCOPE (owner question O36 still open): tape BOUNDS enforcement and `insert` — do not build them.
CONCURRENCY NOTE: an open draft PR #1824 (branch `worktree-agent-aa0286ee9c80eeabc`) changes how local tape edits are PRINTED (in-place when owned, `print.scrml ownedLocals`) and #1823 changes loop-source typing in analyze.scrml. Read their diffs (`git fetch origin <branch>`; `git diff origin/main...FETCH_HEAD`) so your work composes; build on origin/main, keep your changes in the analyze/type layer where possible, and note any expected rebase conflicts in your report.

## TASK — tape forms left INTERIM by #1812 (SPEC §66.11, §66.12, §50, §66.10)
Read each gap entry in `docs/known-gaps.md` first (loci + reproducers), then build, one commit-set each:
1. `g-boot-local-tape-part-edit-s475` — an edit whose receiver is not a bare local name (a part: `xs[i].append(e)`, `s.items.pop()` on a local struct field, etc.) — grants checked against the part's type.
2. `g-boot-tape-removal-value-s475` — a removal (`pop`/`shift`/`remove`) used as a VALUE (not only statement position): `const last = xs.pop()` — value type per SPEC (`T | not`? read §66.12).
3. `g-boot-spread-value-s475` — spread as a value in const/return/argument positions (`[...a, x]`, `f(...xs)` only if SPEC allows call spread).
4. Any other tape method SPEC names that the bootstrap refuses (survey the bootstrap's refusal messages for tapes; list them; build the ones SPEC fully specifies, keep the rest INTERIM with gaps filed).
Each: bootstrap unit tests + conformance cases (positive + negative), and RUNTIME execution of emitted JS proving value semantics (§66.10: aliases snapshot — an edit is never visible through an earlier value). Update gap markers (resolved resolved-by=s477-boot-tape-forms or narrowed + residue gaps). Report bootstrap test + conformance deltas.
