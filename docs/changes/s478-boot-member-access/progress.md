# s478-boot-member-access — progress

Branch `s478-boot-member-access` (from origin/main 213dd1203). Scratch: `~/.cache/scrml/review/s478-boot-member-access/`.

- [x] Census of the 42 refused cases (census.md).
- [x] Bucket A built: a member (struct field, `.length`) of a `T | not` receiver resolves on `T`
      (analyze.scrml `resolveMember`); the typer reports E-TYPE-046 where the receiver is not narrowed
      (`typeMember`, `maybeDeref`, `optMemberMsg`).
- [x] Loop narrowing: `tLoopEnv` keeps a cell narrowing the loop writes nowhere (was: dropped at every loop).
- [x] Tests: compiler/self-host-v2/slice-m4/member-access-s478.test.js (17 red on base, 21 green on head).
- [x] Conformance 552→566 PASS (+14), 0 PASS→FAIL; corpus 0 newly-rejecting (7 newly-accepting twins); CI checks gates green; severity regenerated (E-TYPE-046).
- [x] Hook, push, PR (#1917).

## Fix round 1 (#1917 review)
- [x] H1: `memberRecvMismatch` (typeMember) — every struct-field / `.length` read requires the receiver
      (its `T` when `T | not`) to be the binder's owner struct / a string or tape; else
      E-BOOTSTRAP-UNSUPPORTED by name (no SPEC code for an unannotated-local rebind to another type);
      a receiver that is `not` is E-TYPE-046; an unresolved receiver over a refused decl (file-scope const,
      cell, `<each>` row over a refused source — typeEach blames the row) is not re-reported (§42.4 st. 6).
      Closes the BASE hole for non-optional receivers too.
- [x] L1: root cause was tLoopEnv dropping `gate:@…` marks (handler bodies in a LiftNode were never in
      the write scan); a kept cell narrowing now keeps its gate mark.
- [x] L2: conformance case narrowing-ends-at-server-call-reject handles the server call (`!{ _ :> 0 }`).
- [x] Conformance vs base 552→567 PASS (0 PASS→FAIL); vs PR head 566→567 (FAIL→PASS L2 case).
      Corpus (3176 files): 0 newly-rejecting / 0 changed code sets vs base and vs PR head.
