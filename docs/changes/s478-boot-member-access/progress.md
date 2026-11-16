# s478-boot-member-access — progress

Branch `s478-boot-member-access` (from origin/main 213dd1203). Scratch: `~/.cache/scrml/review/s478-boot-member-access/`.

- [x] Census of the 42 refused cases (census.md).
- [x] Bucket A built: a member (struct field, `.length`) of a `T | not` receiver resolves on `T`
      (analyze.scrml `resolveMember`); the typer reports E-TYPE-046 where the receiver is not narrowed
      (`typeMember`, `maybeDeref`, `optMemberMsg`).
- [x] Loop narrowing: `tLoopEnv` keeps a cell narrowing the loop writes nowhere (was: dropped at every loop).
- [x] Tests: compiler/self-host-v2/slice-m4/member-access-s478.test.js (17 red on base, 21 green on head).
- [x] Conformance 552→566 PASS (+14), 0 PASS→FAIL; corpus 0 newly-rejecting (7 newly-accepting twins); CI checks gates green; severity regenerated (E-TYPE-046).
- [ ] Hook, push, PR.
