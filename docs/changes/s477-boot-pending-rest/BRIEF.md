# BRIEF — s477-boot-pending-rest (verbatim TASK)

## TASK — the S475 pending-cell residue (SPEC §13.8, §13.9, §6.7.7, §6.8, §14.12)
Read each gap entry in `docs/known-gaps.md` first (they carry loci and reproducers), then fix in this order, one commit-set each:
1. `g-boot-pending-cell-reset-unbuilt-s475` — `reset(@cell)` on a pending cell (§6.8 + §13.9; decide the meaning from SPEC text: reset target + whether the load re-runs; if SPEC does not say, INTERIM + ruling owed).
2. `g-boot-pending-cell-opaque-call-s475` — initializer calling a non-server function: infer dependencies / waiting through the call (provable-or-refuse; keep the refusal INTERIM where unprovable).
3. `g-boot-pending-cell-outside-program-s475` — file-scope / imported-module `(not to T)` cell with a waiting initializer.
4. `g-boot-plan-arms-nested-wait-s475` — a wait nested inside a statement in a `!{}` arm block must get the front-end diagnostic (not only Core C-S3/C-S8s).
5. If time remains: S6 display-position pending values (S475 hand-off "S6"; SPEC §13.9 — a pending cell read in a display/render position) and minting the §34 code for the PERMANENT derived-lifecycle refusal (E-TYPE-LIFECYCLE-ON-DERIVED — only if §34 already names it or SPEC text supports adding it in this landing; otherwise list as owed).
Each: bootstrap unit tests + conformance cases (positive + negative), runtime execution where the behaviour is runtime. Update each gap marker (resolved resolved-by=s477-boot-pending-rest, or narrowed with residue). Report bootstrap test + conformance deltas.

Policy: Bootstrap only; no `compiler/src/` changes. SPEC normative: quote governing sentence (§) in progress.md before each meaning/acceptance change; silent → record search, INTERIM named refusal, ruling owed. Rulings: user-voice §S475 items 1, 7, 16, and second batch item 1 (§13.9.4 rules 1–5).
