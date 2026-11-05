#!/usr/bin/env bash
# scripts/ci-pr-base.sh — print the commit a PR-relative CI step diffs HEAD against (S475).
#
#   EVENT_NAME=<github.event_name> PR_HEAD=<pull_request.head.sha> MERGE_GROUP_BASE=<merge_group.base_sha> \
#     scripts/ci-pr-base.sh [--fallback <ref>]
#
# Prints one full SHA on stdout and exits 0, or prints why on stderr and exits 1 (FAIL CLOSED: the caller
# decides what "no base" means — the currency step treats it as "touched" and runs its check; the census
# and the bot-owned guard fail).
#
# pull_request: the base is HEAD^1, the first parent of the merge ref actions/checkout gives the run (the
#   main tip GitHub built the merge on), and HEAD^2 MUST be the PR head, or the checkout is not the merge
#   ref (a fast-forward / a branch checkout) and the script refuses (#1719 r1 F2).
#   NOT pull_request.base.sha: that is fixed at the push event, while the merge ref can be built on a NEWER
#   main, so a bot regen or another PR's merge landing in between was charged to this PR (S474: #1711
#   @cb04c75d1, base.sha 62214cc1f, regen 82f6c7741; gap g-ci-pr-base-sha-stale-in-currency-and-census-steps-s474).
#   Under the merge queue the PR keeps re-basing onto a moving main, which widens that window.
# merge_group: merge_group.base_sha — the queue commit's parent, set together with the ref it was built
#   on, so it cannot go stale. It must resolve and be an ancestor of HEAD.
# any other event (push, schedule, workflow_dispatch): --fallback <ref> if given (the census passes HEAD~1),
#   else refuse.
#
# Pinned by compiler/tests/unit/ci-pr-base-s475.test.js (the stale-base repro + every refusal) and
# compiler/tests/unit/bot-owned-untouched-s474.test.js (runs ci.yml's guard step against a fast-forward).
set -uo pipefail
fallback=""
if [ "${1:-}" = "--fallback" ]; then fallback=${2:?usage: ci-pr-base.sh [--fallback <ref>]}; fi
refuse() { echo "ci-pr-base: $* — refusing (fail closed)" >&2; exit 1; }

case "${EVENT_NAME:-}" in
  pull_request)
    [ -n "${PR_HEAD:-}" ] || refuse "PR_HEAD is empty"
    base=$(git rev-parse --verify -q 'HEAD^1^{commit}') || refuse "HEAD has no first parent"
    head2=$(git rev-parse --verify -q 'HEAD^2^{commit}') || refuse "HEAD is not a merge (no second parent): not the PR's merge ref"
    [ "$head2" = "$PR_HEAD" ] || refuse "HEAD^2 is $head2, not the PR head $PR_HEAD: HEAD is not the PR's merge ref"
    echo "$base"
    ;;
  merge_group)
    [ -n "${MERGE_GROUP_BASE:-}" ] || refuse "MERGE_GROUP_BASE is empty"
    base=$(git rev-parse --verify -q "${MERGE_GROUP_BASE}^{commit}") || refuse "merge_group base $MERGE_GROUP_BASE does not resolve"
    git merge-base --is-ancestor "$base" HEAD || refuse "merge_group base $base is not an ancestor of HEAD"
    echo "$base"
    ;;
  *)
    [ -n "$fallback" ] || refuse "event '${EVENT_NAME:-}' has no PR base and no --fallback was given"
    base=$(git rev-parse --verify -q "${fallback}^{commit}") || refuse "fallback $fallback does not resolve"
    echo "$base"
    ;;
esac
