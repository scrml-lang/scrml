#!/usr/bin/env bash
# scripts/bot-owned-untouched.sh — a PR must not MODIFY or DELETE a bot-owned generated file (S474).
#
#   scripts/bot-owned-untouched.sh <base-ref> [<head-ref>]     exit 0 = untouched, 1 = touched or unknown
#
# WHY: .github/workflows/generated-regen.yml rewrites these files on main after every merge. GitHub's
# own merge runs no custom merge driver, so a PR whose branch carries ITS OWN value of a line the bot
# rewrites goes DIRTY on GitHub the moment the bot's regen lands, and is kicked from the merge queue.
# Witnessed S474: #1702 (bot regen) landed, then #1699 and #1701 both went DIRTY — each on the
# `@generated:gap-counts` rows, which then sat inside docs/known-gaps.md and which their branches had
# regenerated (by hand, and by the local merge driver in every `git merge origin/main`). Those blocks
# now live in docs/generated/, and a file a PR never touches cannot conflict. This check keeps it so.
#
# ADDING a file under docs/generated/ is allowed (that is how a block moves there); modifying or
# deleting one is not. The bot's own branch (bot/generated-regen) is exempt in ci.yml, not here.
# Diff is three-dot (merge-base → head), so main's own changes merged into the branch never count.
# FAIL CLOSED: if the diff cannot be computed, exit 1.
#
# To fix a refusal: `git checkout origin/main -- docs/generated/ && git commit` (the bot regenerates
# main after your merge; `bun scripts/state.ts` prints the live counts for your tree meanwhile).
set -uo pipefail
BOT_OWNED="docs/generated"
base=${1:?usage: bot-owned-untouched.sh <base-ref> [<head-ref>]}
head=${2:-HEAD}
if ! touched=$(git diff --no-renames --name-only --diff-filter=MD "$base...$head" -- "$BOT_OWNED/"); then
  echo "bot-owned-untouched: could not compute the diff $base...$head — refusing (fail closed)" >&2
  exit 1
fi
if [ -n "$touched" ]; then
  echo "bot-owned-untouched: this branch MODIFIES or DELETES bot-owned generated file(s):"
  printf '  %s\n' $touched
  echo ""
  echo "  These are regenerated on main after merge by .github/workflows/generated-regen.yml. A PR that"
  echo "  carries its own copy goes DIRTY on GitHub when the bot's regen lands (GitHub runs no merge driver)."
  echo "  Restore them:  git checkout $base -- $BOT_OWNED/ && git commit -m 'restore bot-owned generated files'"
  exit 1
fi
echo "bot-owned-untouched: no file under $BOT_OWNED/ modified or deleted ($base...$head)."
