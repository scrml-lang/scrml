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
- [code 1] print.scrml: ConstUse/constUse (reads vs whole-value overwrites), constsOnlyRead, fnClosureThroughReads,
  clientNoInit, clientHeld; serverInitsRound `cread` = reads only; clientLiveFns closes through reads only;
  clientConsts gives a written-only binding it does not run a shell (`let x = null;`); bodyInits' clientRead =
  clientHeld; outerAsConsts(…, shells) keeps a shell declaration (seed `not`) for a moved outer cell code still
  names; outerRefusal finds a moved cell by its binding (findConst).
  Probes p/n (21) + o9 + o9-let, base vs head: leaks closed in o9, o9-let, n01 (write via fn), n02 (write in an
  effect), n04 (write in a fn a request calls), n07 (non-acting init), n09 (server reads, client writes), n10 (init
  through a fn reading the secret), n21 (outer cell via fn), n32 (body-placed let). Unchanged (client-read — must
  stay): n03/n23/n33 display, n05/n25 compound write, n26 later read, n27 bind:value. Body cell n31 unchanged
  (left — see item 3). Chromium values identical on all 21 compiling probes.
