# s482-write-only-secret — progress

Lane: SECURITY. Brief `~/.cache/scrml/review/s482-briefs/write-only-secret.md`. Base origin/main 153bd0334 (contains #2105).
Bootstrap-only (compiler/self-host-v2/) + SPEC/docs. Harness: `~/.cache/scrml/review/s482-wos/` (base tree = git archive of 153bd0334).

## Problem
A binding whose initializer reaches a server-only constant, which client code WRITES but never READS, ships the
secret: print.scrml constReads counts a client write as a use (s479: "an artifact that only writes the binding
still declares it"), so serverInitsRound's `cread` holds the binding and its initializer stays in the client.
Probes: o9 (outer cell, p/x/o9-write-only), o9-let (plain let, p/r2/o9-let).

## Plan
1. constReads split into reads vs whole-value overwrites (`Assign` with an empty path; a `Write` Replace/Static of a
   shared instance). Classification (`cread`, clientLiveFns closure) judged on reads only.
2. Client: a binding it writes but does not hold gets a shell (`not` seed), never its initializer.
3. Outer cell: kept as a shell declaration (seed `not`) when code still writes it; the seed runs on the server.

## Log
- [start] branch s482-write-only-secret from 153bd0334.
