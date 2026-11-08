# infra.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# No cloud/IaC in the repo: no Dockerfile, docker-compose, Terraform, k8s, fly/vercel/netlify/wrangler config at f92d1a8fb.

## Deployment
scrml.dev docs site: built by docs/build.ts (`bun run docs:build`) from docs/ sources; hosting config is not in this repo.
npm package: `scrml` 0.8.0 (package.json `files` allowlist); no publish workflow in .github/workflows.
User programs: `scrml build` emits a Bun server (PORT, SCRML_DATA_DIR); SPEC §58 Build Story names the deploy targets (docs/FACTS.md: 4 deploy targets).

## Cloud Resources
GitHub only: org `scrml-lang`, repo scrml-lang/scrml; main protected by ruleset 25356240 (PR + `gate` + merge queue, no bypass).
Secret names: MAPS_PAT (generated-regen bot), ANTHROPIC_API_KEY (advisory-review; deliberately unset, workflow manual-only since S310).

## Docker
No Docker services. CI service container: postgres:18 in the ci.yml `postgres-live` job (port 5432, health `pg_isready`).

## CI/CD
Provider: GitHub Actions
Workflows: .github/workflows/ci.yml (the gate), generated-regen.yml (post-merge bot; replaced facts-regen.yml in S474), windows-main-report.yml, cloud-maps.yml (probe only), advisory-review.yml (manual)
Runners: ubuntu-latest; windows-latest (windows job)
Deploy trigger: none (no deploy workflow). Bot PRs from branch `bot/generated-regen` auto-merge through the queue.
Notes: .github/CI.md (generated-block table, Windows ratchet), .github/windows-baseline.json, .github/FUNDING.yml

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) Retired notes
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/4 code identifiers found in source (not found: `MAPS_APP_ID`, `MAPS_APP_PRIVATE_KEY`); symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. STALE-RISK: mentions cloud-maps.yml: since S474 it writes nothing (thread-board probe only)._
### The `ANTHROPIC_API_KEY`-credential diagnosis of the old cloud-maps red is OBSOLETE
Not because it was disproved — because the leg it explained no longer exists. Do not re-open it.

### The `feat/cloud-maps-beachhead` / `scrml-maps-bot` framing is OBSOLETE
Prior generations of this map (and of build.map.md) said `cloud-maps.yml` lived on an unmerged
branch and needed a `scrml-maps-bot` GitHub App plus `MAPS_APP_ID`/`MAPS_APP_PRIVATE_KEY` secrets.
**Both halves are wrong at this HEAD.** The workflow merged to `main` at `1971a87d` (2026-07-14) and
the App-token approach was replaced by the fine-grained `MAPS_PAT` at `b5ec120b` (2026-07-15).
Do not go looking for an App install.

## Section audit (infra.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| Deployment | now lives in infra.map.md "Deployment" |
| Cloud Resources | now lives in infra.map.md "Cloud Resources" |
| Docker | now lives in infra.map.md "Docker" |
| CI/CD | no longer true — pre-S468 workflow/job description; now lives in infra.map.md "CI/CD" + build.map.md "CI/CD Pipeline" |
| Repo secrets consumed by CI (names only) | now lives in infra.map.md "Cloud Resources" (secret names) and config.map.md "Secrets used by CI" |
| Retired notes | carried above as "(carried) …" (2/4 ids; anchors 0 ok/0 re-derived; flags 1) |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #infra #ci #github-actions #postgres

## Links
- [primary.map.md](./primary.map.md)
- [build.map.md](./build.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
