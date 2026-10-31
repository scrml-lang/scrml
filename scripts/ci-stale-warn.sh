#!/bin/bash
# scripts/ci-stale-warn.sh — run a generated-block CURRENCY check; exit 4 (STALE) is a warning, every
# other non-zero FAILS. change-id: s474-generated-files-bot.
#
# OWNER RULING (scrml-support user-voice-scrml.md, S474): "Generated files move to a post-merge bot. PRs
# stop committing regenerated blocks (…); a post-merge bot (the FACTS.md pattern) regenerates them on main;
# CI checks only the sources." .github/workflows/generated-regen.yml is that bot.
#
# So on a PR, "the block differs from this tree" is EXPECTED and is not the PR's to fix — but a producer
# that CRASHES (1, bun's uncaught-exception code), measures a degenerate zero (2), finds a missing anchor
# (3) or a structural violation (1: a SPEC § with no SPEC-INDEX row, a SILENT coverage row with no gap, a
# stray anchor) is a broken SOURCE or a broken instrument, and must fail here: otherwise the bot first
# fails on main, in a non-required workflow nobody watches (the S472 facts.ts lesson,
# g-facts-check-crash-exit-1-warned-as-stale-s472). Every producer therefore reserves 4 for stale-only.
#
# The same mapping as ci.yml's "Facts currency" step, factored out so each currency step cannot drift
# from it. Pinned by compiler/tests/unit/generated-stale-exit-codes-s474.test.js.
#
# Usage:  scripts/ci-stale-warn.sh "<what is stale>" <command> [args...]
set +e
what=$1
shift
"$@"
rc=$?
if [ "$rc" = "4" ]; then
  echo "::warning title=${what} stale (non-blocking)::Differs from this tree. .github/workflows/generated-regen.yml regenerates it on main after merge; do not commit a regen in this PR."
  exit 0
fi
exit "$rc"
