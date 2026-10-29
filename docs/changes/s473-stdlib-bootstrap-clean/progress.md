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
- 2026-10-29T15:55Z scrml:random → CLEAN on the bootstrap. Ported on the math pattern: `<program>`
  wrapper and the `~{}` block dropped (its assertions are already impl#1 stdlib-random-capability
  §C R10–R13, and moved to the new slice-m4 test against host.js); new stdlib/random/host.js
  (`Math.random()` — the one host RNG touch); `random() -> number` / `randomInt(min: number, max:
  number) -> int` are the fully typed wrappers (§21.3.1.1). Param types read from the doc: "Fractional
  bounds are floored/ceiled" ⇒ `number`; the result is an integer ⇒ `int`. impl#1: compiles clean in
  default AND library mode (library was E-CODEGEN-INVALID-LOGIC on base); random/parity/no-logic-leak/
  canonical-form tests pass. New test compiler/self-host-v2/slice-m4/stdlib-boot-clean-s473.test.js
  (5 tests: math + random pinned clean; random compiled and RUN; host.js assertions).
- 2026-10-29T16:40Z format / path / fs: parameters annotated (annotate.ts + signatures.json, exact
  head replacement). Types read from each function's doc and body; an OPTIONAL parameter takes its
  §7.3.2 default (`locale: string = "en-US"`, `decimals: int = 1`) or `T | not = not` where absent
  means `not` — the SPEC form, which impl#1 compiles. NOT annotated (no writable scrml type yet):
  open host option records (`formatNumberAdvanced(options)`, `mkdirSync/rmSync(options)`), and
  every function-valued / any-valued parameter elsewhere. format: string truthiness rewritten to
  the S440 form (`str == ""`, `plural is given ? …`, `currency is given ? …`), the `locale ||`
  fallbacks dropped (the default carries them). Bootstrap: format 128 → 118 errors — the remaining
  are host reach (`new Intl.*`, regex `.replace`), §7.3.2 defaults and rest params NOT PARSED
  (E-BOOTSTRAP-REDECLARE "parameter `` is already declared" / missing-`;` cascades — new gap
  g-boot-param-default-and-rest-s473), the `~{}` block. impl1-check: same codes (0 regressed);
  stdlib-format/path/fs/parity unit tests pass. NB impl#1 reads a stdlib `.scrml` only for its
  export list, async-ness and type declarations (api.js STDLIB-EXPORT-SEED) — parameter
  annotations do not reach adopter call checking.
