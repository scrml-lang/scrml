# non-compliance.report.md
# project: scrml
# generated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# scan mode: FULL_COLD_START
# This report replaces the stacked S396–S471 passes (prior text: `git show 9cf2bef88:.claude/maps/non-compliance.report.md`). The carried findings were re-checked against f92d1a8fb; closures are listed at the end.

## Summary

Total docs scanned: 259 in-scope `.md` (125 repo docs + 134 spa-lists by name only). Not enumerated: 2,136 `.md` under docs/changes/ (per-dispatch BRIEF / progress records), handOffs/, archive/, .claude/.
Executed checks: `bootstrap-conformance.ts --json` (matches docs/bootstrap-conformance.md), `state.ts --check` (PASS; 155 heading/marker drifts, WARN), `facts.ts --check` (PASS), `spec-coverage-check.ts` (1,115 rows, 49 SILENT, 0 violations). A backticked-identifier grep cross-check of the 14 docs changed since 546e2f4aa found no doc over the 20% threshold (worst: kickstarter-v2 13/306, tutorial 5/88; all unfound names are user-example identifiers).
Compliant: 220 (no name, location or content heuristic fired. Only the 14 docs changed since 546e2f4aa got the identifier cross-check; the rest passed name/location heuristics and the carried-finding re-checks)
Non-compliant: 30 docs from this pass (SPEC.md [2 findings], known-gaps.md, gaunt.md, the roadmap, and the 26-doc location group) + 1 non-doc reference (package.json); plus 9 carried findings re-verified live (SPEC ×4, FACTS, PA-SCRML-REFERENCE, pinned-discussions, known-gaps, a census script) and 5 in-source items
Uncertain: 9 docs (4 native-parser notes, 4 dated articles, kickstarter-v2), plus 3 uncertain sections inside SPEC.md / known-gaps.md

## Non-compliant docs

### compiler/SPEC.md §39.8 (:33746) — `scrml migrate` CLI and `.migration.sql/.json` artifacts
**Reason:** grep-mismatch (spec vs code)
**Detail:** §39.8 says the compiler SHALL write `<db-path>.migration.sql` / `.migration.json` on every compile, and that `scrml migrate [--dry|--check|--force]` applies them. No code in compiler/src writes those files. `scrml migrate` (compiler/src/commands/migrate.js) is a source codemod (`--dry-run`, `--check`, `--program-shape`). Schema apply is `scrml db-migrate --db <url>`. The subsections are also misnumbered `38.8.1` / `38.8.2`. Tracked as open gap `g-spec-39-8-describes-a-migrate-cli-and-artifacts-that-do-not-exist` (docs/known-gaps.md :25765, S441). Still open at f92d1a8fb.
**Suggested disposition:** update to match current (rewrite §39.8 around db-migrate / introspect, or mark it Nominal)

### compiler/SPEC.md :23189 — E-ERROR-016 "no compiler emits it yet"
**Reason:** grep-mismatch (carried from S454; re-verified)
**Detail:** The status line says E-ERROR-016 is Nominal and no compiler emits it. The bootstrap emits it: compiler/self-host-v2/analyze.scrml :32237 `addDiag(…, "E-ERROR-016", …)` (10 occurrences in analyze.scrml; listed in severity.scrml).
**Suggested disposition:** update to match current (state that impl#2 emits it; impl#1 Nominal)

### docs/known-gaps.md — 155 heading/marker status drifts
**Reason:** content-heuristic (state.ts drift list, WARN-only)
**Detail:** `bun scripts/state.ts --check` reports 155 entries whose heading status differs from their `@gap` marker (73 at the S468 pass). Examples: :316 `g-impl1-whole-error-binder-binds-data-s469` heading=open marker=resolved; :457 `g-impl1-unit-variant-dot-variant-reads-undefined-s470` heading=resolved marker=open. A reader who trusts the heading gets the wrong status. The marker is what the tooling counts.
**Suggested disposition:** update to match current (sync the headings to the markers, or the markers to the truth, entry by entry)

### gaunt.md — gauntlet runner entry doc points at a retired repo
**Reason:** grep-mismatch (paths)
**Detail:** It tells the agent it is "in the scrmlTS repo" (:3, :8). It `cd`s to `/home/bryan-maclee/scrmlMaster/scrmlTS` (:54) and reads `/home/bryan-maclee/scrmlMaster/scrmlTS/docs/articles/…` (:58). The repo is `scrml` at /home/bmacs/scrmlMaster/scrml. Last edited 2026-05-27 (R24). 8 `scrmlTS` mentions.
**Suggested disposition:** update to match current, or deref to scrml-support/archive/ if the gauntlet runner is retired

### package.json `//boot` comment (:55) — dangling README reference
**Reason:** grep-mismatch
**Detail:** "See compiler/self-host-v2/README.md." That file does not exist at f92d1a8fb (self-host-v2 has only progress.md). The usage doc is the header comment of scripts/scrml-boot.ts.
**Suggested disposition:** update to match current (point at scripts/scrml-boot.ts or bootstrap docs)

### docs/website/roadmap-from-v0.3-2026-05-14.md
**Reason:** combo (name heuristic: date >30 days before SPEC mtime; front matter `status: draft`; aspirational content)
**Detail:** A "where the compiler is going from v0.3" roadmap, draft revision 2, last edited 2026-05-15. The package is 0.8.0.
**Suggested disposition:** deref to scrml-support/archive/

### Location group — design/audit records that belong in scrml-support (26 docs)
**Reason:** location / name-heuristic (`-audit-`, dated design docs, heads-up announcements)
**Detail:** docs/audits/ (20 `.md`: 19 dated 2026-05-06 … 2026-07-28 + scope-c-findings-tracker.md, plus the `.scope-c-audit-data/` scripts); docs/heads-up/{const-deep-freeze,iteration-design,lifecycle-annotation-extension,spec-consolidation}-2026-05-2x.md (front matter: ratified / historical / historical / in-progress); docs/curation/2026-05-05-changes-dir-disposition.md; docs/language-inspiration-audit-2026-06-06.md (declares itself a mirror of the canonical scrml-support copy). These are point-in-time records, not current reference.
**Suggested disposition:** deref to scrml-support/archive/ (the audits and heads-up), or drop the mirror (language-inspiration)

## Uncertain docs (needs human review)

### compiler/SPEC.md §14.12.6.1 (:15838–15841) — `given u :>` taught as caller form 1 for `(not to T)`
**Reason:** carried (S465). §42.2.3 soft-deprecates `given` in favour of `if (u is given)`. S475's lifecycle-reads work (#1783, read rule E-TYPE-001) landed on the bootstrap only.
**What to check:** whether §14.12.6.1 should lead with `is given`, and whether either implementation credits that form for a `(not to T)` value.

### compiler/native-parser/M5-ast-bridge-scoping.md, M5-divergence-ledger.md, M5-SWAP-residual-decomposition.md, M6.6-CONTRACT-DERIVATION.md
**Reason:** planning/scoping docs for the `--parser=scrml-native` swap. compiler/src/commands/compile.js :246 says that flag is RETIRED (S449). M5-SWAP is self-marked SUPERSEDED; the ledger was last reviewed 2026-05-21.
**What to check:** whether any of these still describe live native-parser behaviour. If not, deref to scrml-support/archive/.

### docs/articles/*-YYYY-MM-DD.md vs *-PUBLISH.md pairs (i-am-jacks-{engine,match,program}, if-you-give-a-dev-an-enum)
**Reason:** name heuristic (dated). Each dated file has a PUBLISH twin.
**What to check:** whether the dated files are drafts superseded by the PUBLISH copies (then archive them) or are the working sources.

### docs/articles/llm-kickstarter-v2-2026-05-04.md
**Reason:** dated (2026-05-04), impl#1-era teaching doc. The S465 `~` finding is now fixed (:1997 matches SPEC §32.6). The cross-check left 13/306 identifiers unfound (example names).
**What to check:** whether it teaches the §66 forms the bootstrap now requires, or only the impl#1 dialect. If the latter, say so in its header.

### docs/known-gaps.md `G-SQL-ERROR-SURFACE-UNWIRED` (:14845)
**Reason:** carried. The heading still says `open`; #1305 and S474–S475 (bootstrap `sqlErrorOf`, PG error classes) narrowed the premise.
**What to check:** whether the gap is impl#1-only now, and if so re-scope its text.

### compiler/SPEC.md E-CG-003 row and the `E-TENANT-WRITE` sentence
**Reason:** carried from S454, not re-litigated in this pass.
**What to check:** as in the S454 pass (`git show 9cf2bef88:.claude/maps/non-compliance.report.md`).

## Carried non-compliant findings — re-verified at f92d1a8fb (from the pre-f92d1a8fb report)

### compiler/SPEC.md §32 (:29765) — in-arm `~` "orphans to `null`, silently" (old N15)
**Reason:** doc-vs-code (carried; text re-grepped, behaviour not re-executed this pass)
**Detail:** The §32 status table still says an in-arm `~` with no outer `~` "orphans to `null`, silently — `E-TILDE-001` has zero fire sites". The old N15 measured that impl#1 makes this fatal (`E-CG-TILDE-UNRESOLVED`, sink at codegen/emit-expr.ts :220). Also SPEC-INDEX §32 row.
**Suggested disposition:** update to match current (re-execute the §32.2.1 example on impl#1, then correct the table)

### compiler/SPEC.md — `E-CG-ENUM-BINDING-COLLISION` and `E-CG-SQL-FN-UNVERIFIABLE-SPAN` have zero mentions (old N-S405-1 / N-S422-4)
**Reason:** grep-mismatch (code ahead of SPEC)
**Detail:** Both are emitted in compiler/src/codegen/emit-library.ts; `grep -c` in SPEC.md = 0 for each at f92d1a8fb.
**Suggested disposition:** update to match current (add §34 rows with emitter provenance)

### compiler/SPEC.md :28030 — `E-MANIFEST-001` documented only in prose (old N-S437-6)
**Reason:** grep-mismatch. **Detail:** No §34 row and no manifest error catalog anywhere in SPEC.
**Suggested disposition:** update to match current (add the row, or the catalog the prose promises)

### compiler/SPEC.md — normative demands of the retired `--parser=scrml-native` (old N-S450-1)
**Reason:** grep-mismatch. **Detail:** 11 `--parser=scrml-native` mentions remain; commands/compile.js :246 says the flag is RETIRED (S449). compiler/native-parser/README.md (2) and master-list.md (2) also still reference it (old N-S450-2).
**Suggested disposition:** update to match current

### docs/FACTS.md "CLI verbs 14" (old N-S455-1)
**Reason:** content (generated figure built on a hand list). **Detail:** FACTS lists `fix-given-presence` and `fix-verify-shared` as verbs; `compiler/src/cli.js` dispatches 12 subcommands. The cause is `scripts/facts.ts` `NOT_A_VERB` (:151), which lacks those two shared modules.
**Suggested disposition:** update to match current (add them to `NOT_A_VERB`; the bot regenerates FACTS)

### scripts/source-text-regex-census.ts :38 / :170 — baked `type-system.ts:26048` (old N8 / N-S422-2)
**Reason:** grep-mismatch. **Detail:** The `postRe` sites are now `type-system.ts:36077` and `:37021`.
**Suggested disposition:** update to match current (print a symbol, not a line)

### docs/PA-SCRML-REFERENCE.md :60 — "`E-TYPE-031` per SPEC §55.1 line 24295" (old N17 / N-S422-3)
**Reason:** grep-mismatch. **Detail:** SPEC line 24295 is not §55.1 at f92d1a8fb.
**Suggested disposition:** update to match current (cite by § only)

### docs/pinned-discussions/w-program-001-warning-scope.md — two dead cross-references (old N16)
**Reason:** grep-mismatch. **Detail:** cites docs/audits/scope-c-stage-1-2026-04-25.md and docs/audits/scope-c-stage-1-sample-classification.md; neither exists.
**Suggested disposition:** update to match current, or deref to scrml-support/archive/

### docs/known-gaps.md — three stale citations (old N9, N14) and a moot open gap (old N-S437b-2)
**Reason:** grep-mismatch / content. **Detail:** still says `planBlockArmLift` is "the single §18.5 tail classifier" (1 hit; invariant 49 in primary.map.md says otherwise); still cites `collapseIfChains` at `ast-builder.js:18885` (now :26345); `g-library-meta-import-async-not-awaited` is `status=open` although an earlier pass found it moot by ruling; `g-api-compile-write-true-ignores-application-scope-refusal` (:27724) is still `open` although an earlier pass recorded #1348 as its fix (old N-S457-1).
**Suggested disposition:** update to match current

### In source (not docs), carried and still live
- `scripts/s34-census.ts` :243–244 — `isImpl` tests `relative()` output against `/`-prefixes, so IMPL-SITES is zero on Windows (old N-S446-1). Normalize separators.
- `compiler/src/codegen/emit-server.ts` / `emit-tool.ts` — one E-SQL-004 message each still says "no `db=` declaration in any ancestor `<program>`", the wording §8.1.1 superseded (old N-S453-5).
- `compiler/src/codegen/db-authoritative.ts`, `tenant-egress.ts` — comments still narrate the retired `_scrml_tenant_tag` helper (old N-S453-6).
- `compiler/src/lint-ghost-patterns.js` false-fires on the canonical block handler — tracked as open gap `g-ghost-lint-false-fires-on-canonical-block-handler` (old N-S437-5).
- One test comment still cites "the bunfig default 10s per-test timeout" (old N11; never in force).

## Carried uncertain items — re-checked at f92d1a8fb
- **compiler/SPEC.md §34 `W-PREPAINT-UNCOVERED-READ` (:30739)** — a `W-` code with severity Info (old U-S445-1). Check: rename to `I-` or change severity.
- **compiler/SPEC.md §34 `E-PROTECT-006` (:30333)** still says "PA ratification pending" (old U-S444-1). Check: ratify and drop the note.
- **compiler/src/api.js :1850** cites the RETIRED `E-WRITE-NOT-IN-LOGIC-CONTEXT` row as authority (old U-S445-2). Check: cite the live rule.
- **scripts/conflict-marker-gate.ts :5** says "117 duplicated Sections rows"; the old measurement was 114 non-identical rows (old U-S422-1).
- **`E-MU-001`** has one SPEC mention while emitted from two files (old U-S422-2).
- **`compiler/src/schema-differ.js` `parseRawCreateTableColumns`** — exported with one non-schema-differ reference (old U-S405-1).
- **docs/articles/if-you-give-a-dev-an-enum-2026-08-31.md** — its header still says "Untracked and uncommitted" while git tracks it (old U5 / U-S422-3).
- **`g-tilde-lin-enforcement-does-not-fire-on-spec-own-examples`** — open; one of six probes was stale at S397 (old U3; not re-executed).
- **Bootstrap SPEC silences flagged by #1202** — sequence index type, E-FN-003 vs E-FN-004 (old U-S445-3; not re-checked).

## Closed since the last report (re-verified at f92d1a8fb)
- N-S458-1 (SPEC §21.4 silent on re-exports): SPEC now has 30 `export *` mentions.
- N-S455-2 (`scrml fix --help` advertising `.run() !{ _ :> {} }`): no such help text; only superseded-ruling comments remain.
- N-S454-1 (`E-NAME-COLLIDES-RESERVED-PREFIX` without a §34 row): row present (SPEC :30763).
- N-S453-7 (PRIMER lists an `Agent` tool): the PRIMER now says "NO `Agent`".
- N-S405-3 (`g-tenant-floor-does-not-harvest-raw-DDL` stale-open): marker is `status=resolved`.
- U1 / U4 (articles outside every compile gate / untracked): `docs/articles` is on the claim-gate surface (scripts/claim-gate-surface.js :28) and tracked.
- N-S468-1 (docs/articles/llm-kickstarter-v1-2026-04-25.md, the retired `scrml:time` decorator API): the file is no longer in docs/articles.
- S465 kickstarter `~` paragraph: v2 :1997 now says each loop leaves only the last lifted value in `~` (SPEC §32.6).
- N-S457-2 (SPEC cites compiler/src/commands/refusal-gate.js): the file exists at f92d1a8fb (3 SPEC mentions are valid).
- The maps' stale `facts-regen.yml` mentions and the stale bootstrap.map.md conformance figures (hand-off.md :80): fixed by this full refresh.

## Section audit (pre-f92d1a8fb non-compliance.report.md → this file)
| old section(s) | disposition |
|---|---|
| Stacked header stamps; every dated pass block (`Summary — S4xx pass`, `Uncertain docs — S4xx pass`, `Prior findings CLOSED at …`, `STANDING ITEMS — RE-EXECUTED AT …`, `NEW FINDINGS — S4xx`, `CLOSED THIS PASS`, `Docs scanned this window …`, `Map currency at this stamp …`, per-pass Tags/Links) | dropped: dated pass records. Every finding ID they carried is dispositioned below |
| N15, N-S405-1, N-S422-4, N-S437-6, N-S450-1, N-S450-2, N-S455-1, N8, N-S422-2, N17, N-S422-3, N-S437b-3, N16, N9, N14, N-S437b-2, N-S457-1 | still live: carried into "Carried non-compliant findings" |
| N-S446-1, N-S453-5, N-S453-6, N-S437-5, N11 | still live (in source): carried into "In source" |
| U-S445-1, U-S444-1, U-S445-2, U-S422-1, U-S422-2, U-S405-1, U5, U-S422-3, U3, U-S445-3, U2 | still open: carried into "Carried uncertain items" (U2 = the heads-up spec-consolidation doc, now in the location group) |
| N-S468-2, N-S458-2, N-S457-3, N-S437-4, N-S422-5 (known-gaps heading/marker drift) | superseded by this report's drift finding (155 at f92d1a8fb) |
| N-S468-1, the S465 kickstarter `~`, N-S457-2, N-S458-1, N-S455-2, N-S454-1, N-S453-7, N-S405-3, U1, U4 | closed (see "Closed since the last report") |
| N-S454-2 / `G-SQL-ERROR-SURFACE-UNWIRED`, E-ERROR-016 (N-S454-4), §14.12.6.1 `given`, E-CG-003 / E-TENANT-WRITE | carried in this report's main sections |
| N-S455-3, N-S454-3, N-S453-1, N-S452W-3, N-S451-1, N-S449W-1 (bootstrap-conformance.md stale) | closed: `--json` run at f92d1a8fb matches the committed report; the report is bot-owned since S474 |
| N-S451-2, N-S452W-1, N-S452W-2, N-S453-2, N-S453-3, N-S437-1, N-S437-2, N-S437-3, N-S437b-1, N-S447-1, N-S444-1, U-S437-1, U-S437-2, U-S440-1, U-S440-2, U-S450-1, U-S451-1, U-S453-1 | closed in earlier passes (recorded RESOLVED/CLOSED/PROMOTED there); not re-litigated |
| N-S453-4 (arm-spelling in README/NERDME/PRIMER), N-S450-3 (comments citing the deleted within-node gate), N-S405-2 (emit-library docstring), N-S405-4 (foreign-opener gap self-contradiction), N6 (route-inference deny-list docstring), N10, N12, N13, N7, U-S451-2 | NOT re-verified this pass — listed so they are not lost; re-check before acting (N12/N13 population holes are covered: docs/audits, heads-up, adopter, curation, pinned-discussions were all scanned this pass) |
| M1–M13, M-S405-5, M-S405-6, N-S458-3, C-S405-A, C-S422-A, C-S453-A, S1 / S1-S405 (router-lag) | findings against the previous MAP SET: moot after the full regeneration. Router-lag is addressed structurally: Task-Shape Routing now opens with bootstrap rows written from source at f92d1a8fb |

## Tags
#non-compliance #project-mapper #cleanup #scrml

## Links
- [primary.map.md](./primary.map.md)
- [project master-list](../../master-list.md)
- [project pa.md](../../pa.md)
- [scrml-support archive convention](../../../scrml-support/pa.md)
