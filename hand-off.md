# scrml — Session 471 (bryan · theRog) — LIVE

> S471 booted 2026-10-27 on theRog, Profile A. S470's hand-off is at `handOffs/hand-off-470.md` (rotated this session). Board: `scrml-support/handOffs/active-sessions/S471-bryan.md`. Rulings verbatim in `scrml-support/user-voice-scrml.md` (S471 entry).

## Boot state (2026-10-27)
- main `a8bac7248` (S470 wrap), CI green on the last push runs. scrml + scrml-support 0/0.
- Open-gap rollup (`bun scripts/state.ts`): HIGH 262 · MED 702 · LOW 528 · Nominal 7; carried HIGH 5 / MED 8.
- Adopter issues: 0 open. Inbox: 3 unhandled of 14 on `origin/inbox`, all S454 messages addressed to Peter (his lane).
- Review debt: 132 owed over the newest 150 merged PRs (scan truncated; the `--limit 1200` run hit GitHub 502). S470's PRs carry markers; the debt is mostly S467–S469 (#1431–#1437 have none). Code-bearing carve-out rate 0/93.
- `pa-ruled` gaps: 10.
- Hooks on theRog: `core.hooksPath = scripts/git-hooks` (config A, pre-commit only — no relaxed pre-push here).

## Rulings this session
bryan: "go, and yes to all the recs" — all eight hand-off-470 §3 owner questions take the PA recommendation. Item 7 (§34 wording for E-ERROR-014 / E-TRY-NOT-IN-SCRML) had no rec: the PA drafts the rows, bryan vetoes on read. Item 8 (make `windows` a required check) is sequenced AFTER the Windows HIGH lands — the job is red on main today and is `continue-on-error: true` in `.github/workflows/ci.yml`, so flipping it needs that flag removed AND the branch-protection required-check list updated.

## Lanes in flight
| change-id | gap | notes |
|---|---|---|
| `s471-windows-imported-alias-refusal` | `g-windows-imported-alias-chain-refusal-not-emitted-s470` (HIGH) | proves on the real Windows job via `gh workflow run ci.yml --ref <branch>` |
| `s471-null-in-arm-refused` | `g-impl1-null-in-expression-position-arm-not-refused-s470` (HIGH) | §42.1 / E-SYNTAX-042; audits other text-held expression positions |
| `s471-owner-rulings-spec` | SPEC text for rulings 1–7 | docs-only; `compiler/SPEC.md` + SPEC-INDEX |

## Gaps touched by the rulings (this PR)
- `g-when-changes-stale-response-s470`, `g-engine-effect-async-no-newest-wins-s470`, `g-spec-host-promise-statics-s470`: S471 ruling notes added (the SPEC questions are closed; the remaining limbs are conformance bugs).
- NEW `g-enum-payload-field-named-variant-not-refused-s471` (MED).

## Owed after the lanes land
- Flip `windows` to required (ruling 8).
- Impl lanes for the ruling-implied bugs above, plus the hand-off-470 §4 list (HIGH carries from S469; MED batch-scheduling; bootstrap next).
- Review-marker backfill for #1431–#1437 (S467–S468 PRs).
