# progress — s472-boot-math-port

Branch `s472-boot-math-port` from origin/main c8070b56a. Logs: `~/.cache/scrml-pa/s472/mp-*`.

Rulings in force (scrml-support/user-voice-scrml.md S472): "stdlib host `.js` output location";
"host function type, math API, remaining review debt" (items 1–3); S471 option A (host reach =
`import:host`, intrinsics rejected).

## Log

- start: worktree clean; node_modules symlinked from main; `bun run pretest` OK; slice-m4 baseline
  2729 pass / 0 fail (mp-base-m4.log).
- bootstrap emission (self-host-v2):
  - ast.scrml `AImportName.orig` (the exported name; `name` the local binding); parse.scrml sets it.
  - link.scrml `hostLocOf(importer, from)` — the module (first segment after `scrml:`) and the file
    inside its directory; `not` when the target climbs out, is not relative, or the importer is a
    file-form module.
  - core.scrml `HostFn { module, file, name, ret }`; `Fn.host: HostFn | not` (a host-backed Fn has
    an EMPTY body).
  - analyze.scrml: `hostWrappers` (phaseA, after fnsOf) — the wrapper rule: whole body
    `return h(p1..pn);`, `h` an admitted binding of the file, params in order, declared return,
    not `!`, not `server`, one wrapper per binding; non-scalar signature → E-BOOTSTRAP-UNSUPPORTED
    at the wrapper. `resolveHostBinding` (resolveName, after locals): the admitted callee resolves
    as `NFn(wrapper)` (the wrapper's signature IS the host type — the typer / effects / placement
    see a call of the wrapper); every other use E-HOST-BINDING-USE. checkHostImport: the
    E-BOOTSTRAP-UNSUPPORTED stop replaced by E-IMPORT-012 (outside the module dir) and
    E-BOOTSTRAP-UNSUPPORTED for a `.ts` target; E-SCOPE-010 for a binding also declared in the file.
  - lower.scrml: a host-backed FnInfo → Fn with `host` and an empty body. ingest + the M1 hand-built
    cores carry `host: not`.
  - check.scrml C-H1..C-H3.
  - print.scrml `hostModules` / `hostImports` / `hostFnJs` (namespace import per host file,
    `./_scrml/<module>/<file>`; `return rt.hostResult(hostmod$N.name(args), {k:…}, at)`);
    print-server.scrml the same for the reached Fns.
  - runtime.js `hostResult` (the F3 §5.4 return-point decode → ScrmlTrap E-HOST-VALUE-MISMATCH-RT);
    server-runtime re-exports it.
  - scripts/scrml-boot.ts: `hostFilesOf` (realpath inside the module dir else E-IMPORT-012; missing
    file E-IMPORT-006; load the module and require each export to be a function else E-IMPORT-004);
    compileFile clears and writes `<outDir>/_scrml/<module>/<file>`; dev serves those statically.
  - slice-m1/host-files.js `copyHostFiles` (test harnesses: load-program, server-artifact-harness).
- stdlib/math: index.scrml in the §66 dialect, the S469 API (+ `minOf`/`maxOf`, S472 item 3),
  no `<program>` wrapper (S471 "ok to drop the <program> wrapper"), no `~{}` block (tests moved to
  JS); stdlib/math/host.js the thin Math.* reach.
- impl#1: compiler/runtime/stdlib/math.js on the same API (+ internal non-trapping
  `floorUnchecked`/`ceilUnchecked` for auth.js/data.js/time.js — behaviour unchanged); the 8 test
  callers of 1-arg `round` updated (`Rounding.HalfUp` where impl#1's E-VARIANT-AMBIGUOUS refuses the
  bare `.HalfUp`); stdlib-math.test.js §A rewritten.
- first commit attempts: pre-commit shard 0 killed (memory ceiling, then 1200 s timeout — host load 12–14
  from sibling agents); `SCRML_HOOK_SHARDS=1` single-process run bailed on
  unit/stdlib-shim-export-parity.test.js (the internal `floorUnchecked` / `ceilUnchecked` exports) —
  allow-listed there with the reason.
- SPEC: §21.3.1 "as if plain import / MAY be re-exported" struck; new §21.3.1.1 (output location,
  E-IMPORT-012, the wrapper rule + E-HOST-BINDING-USE, the return-point decode +
  E-HOST-VALUE-MISMATCH-RT, what crosses on the bootstrap, a trap-coded host throw, impl status);
  §21.6 E-IMPORT-012 row; §19.17 three traps; §34 rows E-IMPORT-012, E-HOST-BINDING-USE,
  E-HOST-VALUE-MISMATCH-RT, E-INT-CONVERSION-RT (now emitted); §41.18 min/max 2-arg + minOf/maxOf,
  abs/clamp/isNaN typed, the Nominal note struck, the S472 amendment; §7.3 PA-reading note.
  SPEC-INDEX regenerated (+ the §21 row); severity.scrml regenerated; s34-census --check-new PASS.
- docs/known-gaps.md: g-boot-import-host-emit-unspecified-s472 + g-stdlib-math-port-api-fork-s472
  RESOLVED; g-boot-no-host-bridge-s471 + g-boot-stdlib-none-compiles-s471 NARROWED; state.ts --write
  (master-list.md already current — nothing to revert).

## Red-proof (on base c8070b56a: base implementation files, the new tests + harness)

Copy at ~/.cache/scrml/review/s472-mp-red (scratchpad red.sh: `git show c8070b56a:<impl file>`).
- bootstrap (math-port-s472 + import-host-s472): 34 fail / 22 pass
  (~/.cache/scrml-pa/s472/mp-red-boot.log). The passes on base are pins, not the PR's behaviour:
  15 pre-existing import-host tests, the 4 host.js unit tests (a new file), the adopter E-IMPORT-008
  pin, and two refusals base already gave as a blanket E-BOOTSTRAP-UNSUPPORTED (a non-scalar wrapper,
  a `.ts` target).
- impl#1 (stdlib-math.test.js): 18 fail / 16 pass (~/.cache/scrml-pa/s472/mp-red-impl1.log).
- commit 5d7ebf055 landed (SCRML_HOOK_SHARDS=1; full impl#1 suite 46698 pass / 0 fail before it,
  mp-full-1.log; slices green, mp-slices-2.log).
- impl#1 full compile of stdlib/math/index.scrml (the host-global scan compiles every stdlib file):
  `number.parse(s)` is E-IMPL1-RULED-FORM-UNSUPPORTED on impl#1, so parseFloat / toNumber are now
  host-backed (stdlib/math/host.js — the bootstrap runtime's parseNumText semantics); impl#1 compiles
  the module clean in the default and library modes (stdlib-math.test.js §C M29 — base library mode
  failed E-CODEGEN-INVALID-LOGIC). Gates: types-gate OK; snippet-gate 0 fail; claim-gate 0 fail;
  compile-floor PASS; md shim current; conflict-marker / delta-lint / ci-shards PASS; e2e-render-map
  259 / 0; host-global scan --roots stdlib 0 violations (the one stale pin, stdlib/time esm, is on base
  too); bootstrap-conformance --write: report unchanged.
- commit 3 (fail closed): a `-> void` wrapper is E-HOST-BINDING-USE; a server-placed host-backed fn
  is E-BOOTSTRAP-UNSUPPORTED (hostPlacedDiags); SPEC §21.3 S440-item-16 cross-ref to §21.3.1.1.

## CHECKPOINT (PA wrap request) — where this stands

DONE + committed (each pre-commit hook passed, SCRML_HOOK_SHARDS=1 — sharded mode timed out under
host load): bootstrap emission + wrapper rule + decode; stdlib/math port (compiles on BOTH impls);
impl#1 shim + 8 callers; SPEC §21.3.1.1 / §19.17 / §21.6 / §34 / §41.18; SPEC-INDEX; severity.scrml;
gaps (2 resolved, 2 narrowed); docs (external-js, kickstarter, primer); red-proof recorded above.
Gates run green on the pre-merge tree: full impl#1 suite, all slices (incl. SLICE_CORE=lowered m1),
e2e-render-map, types-gate, snippet, claim, compile-floor, md shim, conflict-marker, delta-lint,
ci-shards, s34-census --check-new (base c8070b56a), SPEC-INDEX --check, bootstrap-conformance
(unchanged).

NOT DONE (next):
1. `git merge origin/main` (NOT rebase) — main moved (#1608 payload-variant touches the bootstrap:
   analyze / core Expr.VariantOf / print …; #1614 #1618 docs/known-gaps). Expect conflicts in
   analyze.scrml / core.scrml, known-gaps.md (count hunk: regen via state.ts --write), SPEC-INDEX (regen).
2. After the merge: rerun slices + math-port-s472 + import-host-s472, s34-census --check-new --base
   origin/main, SPEC-INDEX --check, bootstrap-conformance --check (regen if moved), full pre-commit.
3. Flip the PR from draft after (1)–(2).

## 2026-10-28T21:38Z — S473 landing-front: merged origin/main (3a7d1d223) into the branch
- Merge commit 1677411c2 (MERGE, not rebase). Conflicts:
  - self-host-v2/analyze.scrml — Globals carries BOTH `hostSites` (this branch) and `consts` (main #1617);
    main's `withConsts` now also copies `hostSites`; Tables keeps `consts: bound.consts` AND base0 keeps
    `.concat(hostPlacedDiags(...))`. Textual only, no semantic clash.
  - self-host-v2/print-server.scrml — import list is the union (hostImports/hostFnJs + constsReadIn/constStmts).
  - self-host-v2/severity.scrml — generated; regenerated (211 codes, E-HOST-BINDING-USE + E-IMPORT-012 kept).
  - docs/known-gaps.md — merge driver; no `@gap id` lost (main 2444 ids ⊇ branch 2425; result 2444).
- SPEC.md / SPEC-INDEX auto-merged; regen-spec-index --check OK.
- Gates (local CI `checks` + slices): all PASS — see the landing report.
- Steps (1)-(2) above are DONE; (3) flip from draft is the PA's call after review.

## 2026-10-28 — S473 fix round r1 (S239 review of ae85e4492: LAND-WITH-FOLLOWUPS)
- MED-1 (5be6af086): compiler/runtime/stdlib/math.js — every public export refuses a call shape the
  S469 API does not define (TypeError, code E-CALL-ARITY / E-CALL-ARGUMENT) instead of answering.
  §41.18: "An omitted radix is `E-CALL-ARITY`" — so parseInt("42") is REFUSED (not 42; the brief's
  "must return 42" premise does not hold under §41.18); toNumber(s: string) refuses toNumber(5).
  data.js / auth.js moved to internal minUnchecked / maxUnchecked (behaviour unchanged).
- LOW-1: analyze.scrml hostImportClash — a host binding's name also bound by a plain import, a
  second import:host, or the same import:host twice is E-SCOPE-010 (§21.3.1.1).
- LOW-2 + UNVERIFIED Windows `\` filed as open gaps (g-boot-host-wrappers-not-shaken-from-client-s473,
  g-boot-host-path-backslash-segment-unverified-s473).

## 2026-10-28 — S473 second main merge (#1619, origin/main 416425c33) — merge c0f11ea7e
- SPEC-INDEX: derived-only conflict, regenerated (--regen); no hand-written line lost.
- severity.scrml regenerated (212 codes, +E-FORM-OWNER-UNRESOLVED). known-gaps: no id lost (2447).
- No semantic break: #1619 adds no Globals/Fn/FnInfo construction; the branch adds no match over
  the new InstRef/View variants. All CI checks + slices + the four review probes PASS on the merge.

## 2026-10-28 — S473 third main merge (#1616, #1624; origin/main 521d06c4f) — merge 93092ac71
- severity.scrml + SPEC-INDEX conflicts: generated only, regenerated by script. known-gaps auto-merged
  (ids main 2445 / branch 2447 / result 2447, none lost). All CI checks + slices + review probes PASS.
- Pre-existing on main, not this branch: `state.ts --check` FAILs @generated:recent-sessions
  (master-list.md, identical to origin/main; not a CI step).

## 2026-10-28 — S473 fourth main merge (#1613; origin/main 6ddc88e05) — merge 84802f283
- severity.scrml (213 codes) + SPEC-INDEX regenerated by script; known-gaps ids main 2449 / branch
  2447 / result 2451, none lost. #1613's FileAst.dbFns + Globals readers do not touch host helpers.
- All CI checks + slices + review probes PASS (state.ts recent-sessions FAIL is main's, not CI).

## 2026-10-28 — S473 final main merge (#1621, #1615; origin/main 45a52abdb) — merge dfa20461e
- SPEC-INDEX regenerated (--regen); severity merged clean, current. known-gaps ids main 2461 /
  branch 2451 / result 2463, none lost.
- #1621 (VType.OneOf + typer reworks) does not reach the host path: a host call is typed as a call
  of its wrapper (declared return), so wrapper returns stay Known. All CI checks, slices, e2e and
  the four review probes PASS (state.ts recent-sessions FAIL is main's master-list, not CI).
