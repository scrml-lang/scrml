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
- [code 1 r] hook caught outer-cell-place t10 (a dead fn READING the moved cell made a shell print its name): a shell
  declaration is kept only when code WRITES the cell whole (overwrittenSharedOf). Committed f2838d373.
- [under-inclusion] 180 probes (u61 ×63 #2061/#2105 families, fix/, r0/, e/, w/, x/, r2/, n/) base vs head in
  Chromium: every value identical; only the leak column changed (10 probes, all closed). Artifacts byte-identical
  except the 11 n/-family + o9/o9-let probes (the shells). Corpus differential (2977 files): 0 newly rejected/accepted,
  0 code changes, 0 client diffs, 0 server diffs.
- [tests] slice-m4/write-only-secret-s482.test.js (9; 5 red on base 153bd0334 — the 4 green are controls + the body-cell
  pin); compiler/tests/browser/write-only-secret-chromium-s482.browser.test.js (4, Chromium; writes to a shell run —
  a statement after the write still runs).
- [SPEC/gap] §7.6 rule (b): "A write is not a read" sentence + "Provenance (S482, a write is not a read)" with the
  direction-of-change note (no observable change except the secret leaving the client; 180 probes + corpus as proof).
  Shell seed = `not`: SPEC has no unseeded plain `let`, so PA reading (§42's absence value; never observable).
  g-boot-body-unread-cell-server-only-s482 narrowed (write-only half built), stays ruling-gated for BODY cells.

- [gates @5625184f8] pretest 0; bootstrap-conformance --json base/head PASS 851 FAIL 3 NOT-TWINNED 628 UNSUPPORTED 491
  CRASH 0 on both, 0 per-case verdict diffs over 1973; slices (write-only-secret, client-roots, registry-client,
  outer-cell-place, seed-reach, body-run-order, value-no-write, handler-reach, logic-block-const) 238 pass / 0 fail /
  5 skip; Chromium SCRML_BROWSER_TESTS=1 (9 s482 files incl. the new one) 71 pass / 0 fail; s34-census --check-new
  PASS; types-gate OK (182 unchanged); host-global-scan 1/2 + 2/2 exit 0; e2e-render-map 259 pass; retired-forms-lint
  OK. Corpus differential: 0/0/0/0/0, 0 files with new client identifiers.

## Decisions
- Item 3 body cells: NOT included. §7.6 rule (b)'s classification is of file-scope bindings/initializers; a body cell
  is a field of the program declaration, and whether rule (b) reaches it is the gap's open owner fork (a)/(b)/(c).
  Probe n31 (body cell written, never read) still leaks — pinned in the slice test as today's behaviour.
- Effect writes: a plain `let` written in an `<effect>` compiles and is fixed (n02); a CELL written in an effect is
  E-EFFECT-WRITES-STATE on base and lane (n22). A `<request>` body holds one `@var = …` — the let is written by a
  function the request calls (n04); a request writing an outer cell is E-BOOTSTRAP-UNSUPPORTED on both (n24).
- Write-only bindings with a literal / non-acting initializer are shells too (`let lit = null;`): §7.6 rule (b)
  "An initializer that does nothing observable … and that no code reads MAY be left out". Corpus: 0 such files.
- sread (server reads) unchanged (with writes): rule (c) E-FILE-SCOPE-LET-SERVER-WRITE means server code never
  writes a file-scope `let`, so there is nothing to split there. reachedOnlyByServer / reachOf / server closures
  keep the write-following closure (conservative: fewer server-only functions, earlier runs as before).
