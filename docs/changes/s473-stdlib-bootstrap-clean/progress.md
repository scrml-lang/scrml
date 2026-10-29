# progress — s473-stdlib-bootstrap-clean

Branch from origin/main 4d5b9a15d. Contract: the S473 lane brief + the dispatch (make the stdlib
compile clean on the bootstrap, keep impl#1 compiling it).

## Log (append-only, UTC)

- 2026-10-29T14:30Z start: worktree verified, bun install + pretest OK. Baseline measured
  (baseline.md + baseline-table.md): 1 clean (math) / 36 errors / 0 crash / 16 not-supplied
  (scrml:compiler*).
- 2026-10-29T15:20Z mechanical pass (mechanical.ts, reproducible): `--unwrap` dropped the top-level
  `<program>` wrapper from 31 stdlib files (S471 ruling "I guess its ok to drop the <program> wrapper";
  §21.5 library form). NOT unwrapped: random, regex, data/validate, data/transform — their `~{}` test
  blocks hold an `import`, and impl#1 in library form emits that import into the module body
  (E-CODEGEN-INVALID-LOGIC "Unexpected keyword 'import'" — impl#1's existing library-mode defect,
  already on base in `--mode library`). `--semis` inserted the statement `;` the bootstrap reports
  (E-STMT-MISSING-SEMICOLON) at LINE ENDS only and never before a continuation line — a first
  version also took positions mid-expression after an earlier parse error (`typeof x != "s";)`) and
  impl1-check caught it (reverted, rule tightened). md and scrml:compiler* untouched.
- impl1-check.ts (impl#1 compiles every stdlib file in place, default + library mode, codes compared
  with a base run made with base's stdlib checked out in place): 0 regressed; host/index improved
  (E-CODEGEN-INVALID-LOGIC gone in default mode). NB impl#1 compiles most stdlib files standalone
  with errors on base already (E-SCOPE-001 / E-THROW-NOT-IN-SCRML …): it consumes the hand-written
  shims at compiler/runtime/stdlib/*.js, the .scrml is the export/async/type reference.
