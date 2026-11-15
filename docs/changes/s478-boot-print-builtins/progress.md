# s478-boot-print-builtins — progress

Branch `s478-boot-print-builtins` (from origin/main e65969118).

## Built
- `print(…)` / `println(…)` (SPEC §20.7) on the bootstrap:
  - analyze.scrml `resolvePrint`: the built-in when no user binding of the name is visible (`builtinFree`, §20.7.5); fact `ValueFact.VPrint(text, newline)`; statement position in a `function` body only (INTERIM refusals by name elsewhere).
  - `printShadowed`: W-PRINT-SHADOWED (Info) at a call of a user binding named print / println (§20.7.5 "at the shadowing use").
  - typer `printArgCheck` / `printSlot`: E-PRINT-NON-PRIMITIVE (§20.7.2; §14.13.2 fail-closed unresolved limb).
  - placement: `FnFacts.prints` is a server trigger (§20.7.3 "server-placed … exactly like a function that touches `?{}`"); split with a reactive write (refused, U1d, as for `?{}`).
  - core.scrml `PrimOp.Print`; lower.scrml `printExpr` (space-join, Text for non-strings, "\n" for println); print.scrml `rt.printOut`; server-runtime.js `printOut` (raw process.stdout).
  - check.scrml C-P1: a Print in client Core is ill-formed.
- severity.scrml regenerated (W-PRINT-SHADOWED Info, E-PRINT-NON-PRIMITIVE Error).
- Tests: slice-m4/print-builtins-s478.test.js (runs the emitted tool and asserts stdout); scope-builtins-s478.test.js updated.

## Not built (owner questions)
- `log()` — SPEC defines only dev (forwarding) / production (0-byte strip) behaviour; the bootstrap has no build mode. Kept refused by name.
- print of an `asIs` foreign value — gap g-boot-print-asis-arg-s478.
- print in a `fn` — §48.3 silent; gap g-boot-print-positions-interim-s478.

## Status
- [x] implementation  [x] slice tests  [x] corpus measure (0 newly rejecting; 2 newly accepting, legal)  [x] CI gates  [ ] hook  [ ] PR

## Fix round 1 (#1900 adversarial review, verdict FIX)
- HIGH-1: `rt.printOut` writes with `fs.writeSync(1, …)` (EAGAIN retried, EPIPE drops the rest silently).
  §64.3's exit-harness is literally "`const code = await main(…); process.exit(code);`", so the harness is
  kept and the write made synchronous. A 574 kB tool through `| (sleep 1; wc -c)` kept 65 050 bytes; now all.
  Test E (slow reader + `| head`, exit code 3 preserved) is red with the old async write.
- HIGH-2: `printScans` (phase A) — a function that calls the built-in is serverOwn, as a `?{}` makes it
  (§20.7.3 "exactly like a function that touches `?{}` SQL"), so its client call is a remote call
  (E-ERROR-002 unhandled, `.Transport(t)` handled, remote lowering). Shadowing modelled as builtinFree
  (file scope, params, locals, `given`, nested fns); resolvePrint refuses by name any call the scan and
  the binder read differently (fail closed). fnWrites' "*" key uses the same scan. Tests F.
- MED: an unannotated foreign (`asIs`) argument → E-BOOTSTRAP-UNSUPPORTED citing g-boot-print-asis-arg-s478
  (INTERIM), not E-PRINT-NON-PRIMITIVE. The five foreign cases stay UNSUPPORTED (no FAIL / CODES-ONLY).
- LOW: the 7 tests that passed on base now assert message text; all 38 tests are red on base.
