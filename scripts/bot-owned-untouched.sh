#!/usr/bin/env bash
# scripts/bot-owned-untouched.sh — a PR must not change a bot-owned generated file (S474).
#
#   scripts/bot-owned-untouched.sh <base-ref> [<head-ref>]         any PR: exit 0 = untouched, 1 = touched/unknown
#   scripts/bot-owned-untouched.sh --bot <base-ref> [<head-ref>]   the bot's PR: exit 0 only if EVERY changed
#                                                                  file is in generated-regen.yml's FILES list
#
# WHY: .github/workflows/generated-regen.yml rewrites these files on main after every merge. GitHub's
# own merge runs no custom merge driver, so a PR whose branch carries ITS OWN value of a line the bot
# rewrites goes DIRTY on GitHub the moment the bot's regen lands, and is kicked from the merge queue.
# Witnessed S474: #1702 (bot regen) landed, then #1699 and #1701 both went DIRTY — each on the
# `@generated:gap-counts` rows, which then sat inside docs/known-gaps.md and which their branches had
# regenerated (by hand, and by the local merge driver in every `git merge origin/main`). Those blocks
# now live in docs/generated/, and a file a PR never touches cannot conflict. This check keeps it so.
#
# ADDING a file under docs/generated/ is allowed (that is how a block moves there). Anything else —
# modify, delete, rename away, TYPE change (a file replaced by a symlink: S474 r1 F3), or any status git
# adds later — is refused: `--diff-filter=a` means "every status except Added".
# Diff is three-dot (merge-base → head), so main's own changes merged into the branch never count.
# FAIL CLOSED: if the diff cannot be computed, exit 1.
#
# --bot (S474 r1 F4): ci.yml passes it only for the bot's branch of THIS repository (head.repo ==
# github.repository). Instead of exempting the bot by branch name alone, it checks the bot touched nothing
# but its own FILES — a branch merely NAMED bot/generated-regen that edits anything else is refused.
#
# To fix a refusal: `git checkout origin/main -- docs/generated/ && git commit` (the bot regenerates
# main after your merge; `bun scripts/state.ts` prints the live counts for your tree meanwhile). To change
# a generated file's FORMAT, change its producer (scripts/state.ts writes each file whole); the bot
# regenerates the file after the producer change lands.
set -uo pipefail
BOT_OWNED="docs/generated"
REGEN_WF=".github/workflows/generated-regen.yml"
bot=0
if [ "${1:-}" = "--bot" ]; then bot=1; shift; fi
base=${1:?usage: bot-owned-untouched.sh [--bot] <base-ref> [<head-ref>]}
head=${2:-HEAD}

if [ "$bot" = 1 ]; then
  if ! files=$(bun -e 'const y=Bun.YAML.parse(require("fs").readFileSync(process.argv[1],"utf8"));const f=String(y?.jobs?.regen?.env?.FILES??"").trim();if(!f)process.exit(3);console.log(f.split(/\s+/).join("\n"))' "$REGEN_WF"); then
    echo "bot-owned-untouched --bot: could not read FILES from $REGEN_WF — refusing (fail closed)" >&2
    exit 1
  fi
  if ! changed=$(git diff --no-renames --name-only "$base...$head"); then
    echo "bot-owned-untouched --bot: could not compute the diff $base...$head — refusing (fail closed)" >&2
    exit 1
  fi
  stray=$(printf '%s\n' "$changed" | grep -v -x -F -f <(printf '%s\n' "$files") | grep -v '^$' || true)
  if [ -n "$stray" ]; then
    echo "bot-owned-untouched --bot: the bot branch changes file(s) outside $REGEN_WF FILES:"
    printf '  %s\n' $stray
    exit 1
  fi
  echo "bot-owned-untouched --bot: every changed file is in $REGEN_WF FILES ($base...$head)."
  exit 0
fi

if ! touched=$(git diff --no-renames --name-only --diff-filter=a "$base...$head" -- "$BOT_OWNED/"); then
  echo "bot-owned-untouched: could not compute the diff $base...$head — refusing (fail closed)" >&2
  exit 1
fi
if [ -n "$touched" ]; then
  echo "bot-owned-untouched: this branch CHANGES bot-owned generated file(s) (modify / delete / type change):"
  printf '  %s\n' $touched
  echo ""
  echo "  These are regenerated on main after merge by $REGEN_WF. A PR that"
  echo "  carries its own copy goes DIRTY on GitHub when the bot's regen lands (GitHub runs no merge driver)."
  echo "  Restore them:  git checkout $base -- $BOT_OWNED/ && git commit -m 'restore bot-owned generated files'"
  exit 1
fi
echo "bot-owned-untouched: no file under $BOT_OWNED/ changed other than added ($base...$head)."
