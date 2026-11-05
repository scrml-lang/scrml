## The defect (gap g-impl1-envelope-site-handled-pg-abort-s474, docs/known-gaps.md ~:1469 — read the whole entry)
Since S474 every querying `!` server body runs inside a transaction envelope (SPEC §8.9.2 "Amendment S474"). A `?{}` whose failure is handled AT ITS SITE inside that envelope (`?{…}.run() !{ _ :> … }`, or a `match` on it) runs with no statement savepoint. On SQLite that is fine (a failed statement undoes only itself — measured). On Postgres one failed statement puts the whole transaction in the aborted state: the handler arm runs, the next statement fails with `current transaction is aborted`, or with no next statement the COMMIT is answered as ROLLBACK — and the `!` function reports success while every write it made is lost. Silent data loss. Postgres is a promised language feature (§44) and an adopter (RediLedger) runs on it; bryan ruled S475: build it now.

## Governing sentence (Rule 4 gate)
SPEC §8.9.2 "Amendment S474" item 4 already REQUIRES a statement savepoint around every executed site-handled query inside an envelope. Find and QUOTE it in your report (`grep -n 'Amendment S474' compiler/SPEC.md`). This is a conformance restoration — direction semantics-changed (Postgres: writes now survive a handled failure; SQLite: no observable change). Do not change SPEC text; if the SPEC is ambiguous on any point (nested `!` savepoints, a handled failure inside a per-`yield` segment, MySQL), STOP that sub-point and report it as a question.

## Required shape of the fix
Wrap every site-handled driver call that runs inside an open transaction in its own SAVEPOINT; on failure ROLLBACK TO that savepoint (then RELEASE), on success RELEASE. Must compose with: the envelope's own nesting (inner `!` = nested savepoint, §19.10.6), path-paired manual `?{BEGIN}` lowered to savepoints (§8.9.2 item 3), per-`yield` segments of a `!` `server function*` (item 6), and `transaction { }` blocks. Savepoint names must be unique per nesting level (no collision with the envelope's names). Outside a transaction: no savepoint (no change). Apply on every driver (SQLite and MySQL too) — uniform and cheap — unless you measure a reason not to; say which you chose.

## Real Postgres is REQUIRED for the proof (not documented semantics)
Docker is installed but the daemon is down; `psql` exists, no local server. Try in order: (1) `docker info` — if up, `docker run -d --rm -p 54329:5432 -e POSTGRES_PASSWORD=pw postgres:16` (capture the container id; stop it by id at the end); (2) `@electric-sql/pglite` + `@electric-sql/pglite-socket` installed under your worktree's .tmp dir to serve a real PG wire socket for Bun.SQL. If neither works, STOP and report — do not claim the fix proven from SQLite alone. The test must: show RED on base (writes lost / COMMIT→ROLLBACK on PG) and GREEN on head, and be skipped (not failed) when no PG URL is set (env var, e.g. SCRML_TEST_PG_URL), matching how the repo gates other PG tests (look for existing ones first: `grep -rln 'postgres' compiler/tests | head`).

## Process rules
- Startup: `pwd` must start with `/home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-`; `git rev-parse --show-toplevel` equals it; clean tree; `git merge-base HEAD origin/main` == `git rev-parse origin/main`; `bun install`; run `bun run pretest` from the worktree CWD (NOT `bun --cwd`). First commit: `WIP(<lane>): start at $(pwd)`.
- Edit only with Edit/Write on worktree-absolute paths. Never `cd` into /home/bmacs/scrmlMaster/scrml. Never `git stash`. Never `pkill -f`/`killall` — kill only by PID you captured.
- MAPS — REQUIRED FIRST READ: `.claude/maps/primary.map.md` (stamp fa0e875b4, 2026-11-03; HEAD is 65820a5e5 — two bot regens and #1740/#1741 docs only since, so no code drift), then the map its Task-Shape Routing names for your lane. Treat map loci as hypotheses; report whether the map was load-bearing.
- Every locus named here is PA-located-verify (from the gap entry, not traced). Report whether it held.
- Commit after each meaningful change; keep `progress.md` in `docs/changes/<lane>/` (append-only, timestamped). Never `--no-verify`.
- TMPDIR: set per command to `~/.cache/scrml-agent-tmp/<lane>/`. Scratch under that dir, removed before your final report.
- Bounded waits only: every wait has a PID and a timeout cap. No background command may be running when you end your turn. Your final message is your only report.
- Generated blocks are bot-owned: do not edit docs/generated/*, SPEC-INDEX, FACTS, coverage totals.
- Push your branch (`git push -u origin HEAD`), open a DRAFT PR (`gh pr create --draft`) titled `fix(<lane>): …`, body ending with the Claude Code attribution line. Do not mark ready, do not merge.
- Final report: branch, head SHA, PR number, files touched, the quoted governing sentence, the PG method used + red/green evidence (command + key output lines), direction-of-change, loci held/refined/wrong, open questions.

---

## Lane prompt (verbatim)

Lane: `s475-boot-pg-site-handled-savepoint`. Compiler: the bootstrap (impl#2, `compiler/self-host-v2/`). Start at `.claude/maps/bootstrap.map.md` after primary.map.md.

Read the shared brief FIRST and follow it exactly: /tmp/claude-1000/-home-bmacs-scrmlMaster-scrml/301cd492-80a9-4555-b6d2-52e1bdbd0640/scratchpad/pg-common.md (copy it to docs/changes/s475-boot-pg-site-handled-savepoint/BRIEF.md as your first commit, verbatim, followed by this prompt).

Lane-specific:
- First, MEASURE whether the bootstrap has the defect at all. The gap was filed against impl#1; the bootstrap built its own envelope in #1699/#1703 (`compiler/self-host-v2/server-runtime.js` `envelope`, `analyze.scrml` `envelopeOf`, `core.scrml` `Envelope`). PA did not trace whether a site-handled `?{}` inside it gets a statement savepoint (a grep for SAVEPOINT near "handled/attempt" found nothing — weak evidence). If the bootstrap already does it correctly, prove it on real Postgres, add the PG test, and report — that is a valid outcome.
- If it does not: fix it per the brief, with tests in the bootstrap's own test layout (slice tests / conformance as the map describes). If a conformance case can pin it (runtime half needs PG, so likely a skip-gated test instead), say why or why not.
- Do NOT edit `docs/known-gaps.md` (the impl#1 lane owns it this round). Put the gap text you would file (a bootstrap twin, if the defect exists and anything stays owed) in your final report.
- impl#1 (`compiler/src/`) is a separate lane running in parallel — do NOT touch it.
