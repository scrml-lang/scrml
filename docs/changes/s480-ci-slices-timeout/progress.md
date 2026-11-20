# s480-ci-slices-timeout — progress

Problem: CI `slices` (one serial job, 20-min timeout) ran 908–1180 s and was cancelled at the timeout on
11 of the last 39 completed CI runs (merge_group runs for PRs 2006/2007/2008/2010/2011 among them).
Step breakdown (run 44658840576, job 136031718699, 1109 s): slice-m4 756 s (241 files) · slice-m2 132 s ·
slice-m1 lowered 72 s · slice-codec 57 s · e2e-render-map 48 s · slice-m1 14 s · slice-m3 13 s · lints ~1 s.

- [x] scripts/ci-slices.ts — leg runner: slice-m4 by `bun test --shard=i/N` (timings-balanced, junit);
      every other step dealt WHOLE to exactly one leg (LPT over a fixed list).
- [x] scripts/ci-test-timings.json — seeded 241 slice-m4 per-file durations measured from that CI log.
- [x] ci.yml — `slices` is a 2-leg matrix, timeout 25, uploads junit; `gate` reconcile adds
      `slice-m4=compiler/self-host-v2/slice-m4`.
- [x] Local: slice-m4 shards 1/2 + 2/2 enumerated (no-match -t filter + junit) → reconcile: 25 + 216 =
      241 files, exact partition. Balance by CI timings: 393 s + 161 s vs 362 s + 177 s.
- Branch protection: unchanged (ruleset `main` requires only `gate`, which aggregates by job id).
