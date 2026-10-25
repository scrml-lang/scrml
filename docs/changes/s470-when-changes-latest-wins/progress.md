# s470-when-changes-latest-wins — progress

Gap: `g-when-changes-stale-response-s470` (MED, security race). Policy: S435 impl#1 fix allowed (security).

## Governing SPEC text (§6.7.4, compiler/SPEC.md ~L5170)

> **Re-trigger while suspended — newest run wins (S446 (b)).** If an effect is triggered while an earlier run of
> the SAME `<effect>` instance is suspended at a server call, the earlier run's continuation is **cancelled and
> never resumes**; the new run starts at once (not queued, not dropped), and the settled value or failure of the
> call the cancelled run was suspended at is discarded (its error context does not run). [...] Cancellation is
> **not a rollback**: an outside-world action the cancelled run already performed before the suspension stands
> (a sent analytics beacon is sent).

Normative bullet (~L5437): "A re-trigger while a run of the same `<effect>` instance is suspended SHALL cancel
that run's continuation (newest run wins)". `when … changes { }` is accepted "as a spelling of `<effect>` with
identical semantics" (§63 window).

SPEC is explicit and agrees with latest-wins, so no STOP.

## Semantics chosen (SPEC reading; matches the `<request>` precedent)

- A superseded run's continuation never resumes: every write after the suspension point is dropped.
- The settled value OR failure is discarded: a `!{}` / error context in the superseded run does not run
  (request precedent: its `catch` returns on a stale seq too).
- Not a rollback: writes and outside-world calls made before the suspension stand.
- Transport: nothing is aborted (the call runs to completion; only its result is discarded) — SPEC allows
  aborting only READ-classified calls and never requires it.
- Teardown: a run whose effect was disposed (owning scope unmounted) is also cancelled — the `<request>`
  `_mounted` check precedent.

## Mechanism

`<request>`: `var _scrml_seq = ++_scrml_request_r_seq; … await …; if (_scrml_seq !== _scrml_request_r_seq) return;`.
Same per-instance sequence counter here, in `_scrml_when_changes`; each run gets a gate closing over its seq,
passed as the body's parameter; the compiler wraps every own-level `await X` of an async when body as
`await _scrml_live(X)`. A stale gate returns a never-settling promise, so the continuation never resumes.

## Log

- Base race (harness copied from ~/.cache/scrml/review/s470-aw2 to ~/.cache/scrml/s470/laneE): whenhelper
  "LOGGED IN", whensrv "LOGGED IN" (FAIL); request fixtures "false"/"rejected" (pass).
