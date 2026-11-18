# s479-file-scope-follow — progress

Ruling: user-voice-scrml.md "⭐ RULED — #1962 file-scope questions 1–4 + `parseVariant` duplicate keys, PA recs adopted (S479, 2026-11-18)", items 1–4 (item 5 is another lane's). Plus the #1962 review LOWs (L1 message label, L2 calledRet / server callee, L3 `reset(x)` of a plain `let`).

## Done (bootstrap, `compiler/self-host-v2/analyze.scrml`)
- Item 1: fileScopePass — rule (c) skipped when the entry program is `kind="tool"` (fileIsTool).
- Item 2: initReachDiags — a later binding (or the one being initialized) reached through a call chain is E-SCOPE-001 (was E-BOOTSTRAP-UNSUPPORTED by name); message names the chain.
- Item 3: foreignLetOf / foreignLetWrite / chainObj / writeShown — E-FILE-SCOPE-LET-FOREIGN-WRITE for a write of another file's file-scope `let`: named import, `as` alias, namespace import; rebinding, part, position, tape edit, removal as value. fileLetWriteGuard emits the same code (backstop).
- Item 4: §7.6 citation §13.4 → §12.4 (SPEC + messages).
- L1: callableShown — "the `<Dispatch>` arm of `<endpoint path="/fsp">`" (and onchange arms).
- L2: serverOwnCallIn / calleeFnOf — an initializer whose type is unknown and that calls a serverOwn function is E-FILE-SCOPE-SERVER-ONLY-REACH.
- L3: resolveReset — resetShapeOk; non-`@`-rooted / index / literal targets are E-RESET-INVALID-TARGET (§6.8.2).
- SPEC §7.6 sentences + provenance; §34 rows (new E-FILE-SCOPE-LET-FOREIGN-WRITE; E-SCOPE-001 ALSO; E-RESET-INVALID-TARGET emitter note; E-FILE-SCOPE-LET-SERVER-WRITE tool + §12.4).
- severity.scrml regenerated.
- Tests: slice-m4/file-scope-follow-s479.test.js (new); file-scope-init-s479.test.js updated (2 tests).

## Measured (impl#1, S479)
- foreign write: compiles, `const { shared } = …; shared = 3` → TypeError at run time.
- later-through-call: impl#1 already E-SCOPE-001 at the function's read (file-order resolution).
- `reset(n)`: compiles to `undefined` (no diagnostic).

## Owner question (not ruled — fail-closed as is)
- Tool + rule (a): in a `kind="tool"` program every `function` is server-placed, so `const A = tick();` is E-FILE-SCOPE-SERVER-ONLY-REACH there (module init "cannot wait on the server" — a tool has no server). Rec: in a tool, rule (a) refuses only a callee that SUSPENDS (a `?{}` / `_{}` / waiting call); a synchronous tool function is evaluated at module init.

## Conformance cases (10)
module/file-scope-let-foreign-write-{named,alias,namespace}-pos, -neg; module/e-scope-001-init-later-binding-via-call-{pos,neg}; tool/file-scope-let-write-exempt; server-fn/file-scope-let-server-write-pos; server-fn/file-scope-init-server-callee-untyped-pos; lifecycle/reset-invalid-target-plain-let-pos. impl#1 xfails: g-impl1-file-scope-codes-s479, g-impl1-reset-bare-name-s479 (carried). Namespace case: dialect.s66 exclude (twin oracle reads it differently).

## Measurements
- bootstrap conformance base (5f20efc52): PASS 681 / FAIL 7 / NOT-TWINNED 637 / UNSUPPORTED 556 / CRASH 0. Head: PASS 690 / FAIL 7 / NOT-TWINNED 638 / UNSUPPORTED 556 / CRASH 0. Delta = the 10 new cases (9 PASS, 1 NOT-TWINNED); 0 existing case changed bucket.
- corpus (samples, examples, conformance, acceptance; 3177 files; old vs new bootstrap): 0 existing file newly rejected; 1 already-rejected sample (gauntlet-r10-rails-blog) gains E-FILE-SCOPE-SERVER-ONLY-REACH; the rest are the new cases.
- CI gates: s34-census --check-new PASS (4 rows); types-gate OK; snippet-gate 0 fail; claim-gate 0 fail; gen-md-shim current; corpus-compile-floor PASS; host-global-scan exit 0; severity --check current.
- capability-ledger PS-77 (scrml-support 436bdcf, local commit, not pushed).

## Todo
- commit (hook), PR.
