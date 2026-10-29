# s473-flogence-two-fixes — progress (append-only)

Source: flogence S60 → scrml, `origin/inbox:handOffs/incoming/2026-10-29-from-flogence-S60-to-scrml-re-S473-note-not-delivered.md`.

## 2026-10-29 — part 1: scrml-boot sourceClosure quote style
- Measured on base `66242067a`: `scrml-boot compile` of a file with `import { listArcs } from '../graph-read.scrml'`
  → `E-IMPORT-006: ../graph-read.scrml does not resolve to a .scrml file in this build (§21.3)`.
  Cause: `scripts/scrml-boot.ts` `IMPORT_RE = /\bfrom\s*"(\.\.?\/[^"]*\.scrml)"/g` (double quotes only).
- Fix: the closure reads each file's imports with the bootstrap parser (`mods.parse.parseFile` +
  `mods.link.importsOfItems`, the reading `lowered.js` `stdlibSources` already uses). No regex.
  `sourceClosure` now takes the loaded bundle's `mods` (its one caller, `compileSource`, loads it first).
- Other import scanners checked: `scripts/host-global-scan.ts:114` (accepts both quotes; scans impl#1
  output closure — not a bootstrap path, left); `compiler/self-host-v2/slice-m2/lowered.js` stdlibSources
  (parser-based already); link.scrml / analyze.scrml resolve through the parser's AImport (quote-agnostic).
  No other `.scrml`-import regex in scripts/ or self-host-v2 harnesses.
- Tests: `compiler/self-host-v2/slice-m4/scrml-boot-import-quotes-s473.test.js` — 5 tests, 3 red on base
  (single-quoted, transitive `'../x'`, import-in-comment/string not followed), 5 green after.

## 2026-10-29 — part 2: impl#1 `_ e :>` on a `?{}`-using server function (E-TYPE-031)
- Repro (flogence viewapp/view.scrml + graph-read.scrml shapes, copied, flogence untouched):
  `@fromImport = listArcs() !{ _ e :> { @status = "…" + e.variant; return } }` (imported, `<db>` library,
  not `!`) and the same on a local `function fetchLocal() { return ?{…}.all() }` → E-TYPE-031 "the handled
  call's error enum cannot be resolved here" for BOTH `e.variant` and `e.message`.
- SPEC reading (governing sentences):
  - §18.6.1 "The binder's type is the type of the failure being handled — … a client call to a server
    function (§19.9.10): the call's failure set — `Transport(t: ServerCallError)`, and for a server function
    declared `! E` the variants of `E` as well".
  - §19.9.10 "For an `f` not declared `!`, the failure set is `Transport(t: ServerCallError)` alone."
  - §18.17.1 "Every enum value has the member `.variant`" → `e.variant` LEGAL.
  - §18.17.1 "Reading any member other than `.variant` off a value of a known enum type SHALL be a compile
    error (E-TYPE-004)" + §18.6.1 (S469) "reading a payload field off it (`err.message`, `err.reason`) SHALL
    be a compile error (E-TYPE-004)" → `e.message` refused, but E-TYPE-004, not E-TYPE-031.
  - §19.9.10 "Not affected: A server→server call … Its failure set is the callee's own — none for a
    function not declared `!`." → a server-side caller keeps no binder type.
- Root cause: `wholeBinderCalleeEnum` (type-system.ts) resolves only a DECLARED `errorType`; a non-`!`
  server-placed callee had no enum, so the S469 allow-list audit refused every use.
- Fix: `CLIENT_SERVER_CALL_FAILURE_SET` (`{ Transport(t: asIs) }`, frozen, never registered) returned for a
  local or imported callee that is server-placed (isServer / RI boundary=server), not `!`, not CPS-split,
  when the `!{}`'s innermost `fn:` scope is client (or there is none). `t: asIs` keeps `.Transport(t)` and
  passing `e` whole refused (canonical key unknown → fail closed).
- Run-time note: impl#1 does not build §19.9.10 (`g-impl1-client-server-call-not-failable-s451`): the stub
  throws `HTTP <status>` past the arm, so on impl#1 these arms are not entered. Typing is the SPEC's.
- Tests: `compiler/tests/unit/whole-error-binder-server-call-s473.test.js` — 11 tests, 5 red on base.
- Bootstrap, same shape: `e.variant` → E-BOOTSTRAP-UNSUPPORTED (no §18.17.1 `.variant` member);
  imported `?{}` module → E-BOOTSTRAP-UNSUPPORTED (§44.7.1); `<db>` at file top → E-DB-BODY-STATEMENT.
- Gaps filed: g-impl1-imported-callee-cell-write-handler-skipped-s473 (HIGH),
  g-impl1-whole-binder-direct-sql-untyped-s473, g-impl1-match-expr-in-bang-arm-client-fn-s473,
  g-boot-dot-variant-member-unbuilt-s473. Narrowed: g-impl1-whole-error-binder-allowlist-stricter-than-spec-s469.
