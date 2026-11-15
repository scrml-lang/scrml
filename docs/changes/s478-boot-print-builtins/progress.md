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
