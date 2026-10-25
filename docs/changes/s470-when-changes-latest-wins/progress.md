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
- Fix landed: runtime `_scrml_when_changes` seq gate + emitter wraps own-level awaits (`wrapOwnAwaits`
  in js-async-analysis.ts, acorn-based, nested functions skipped). Unparseable / `for await` async body ->
  internal error (fail closed, never an unguarded body).
- Head race: whenhelper "rejected", whensrv "rejected" (PASS); request fixtures unchanged.
- Runtime gzip-9 stripped, base 6081e0685 -> head: shell 6377 -> 6377 (+0); counter 4130 -> 4198 (+68);
  lifted if= 4392 -> 4458; `<each>` row if= 8432 -> 8497 (+65; ceiling was 8433, trips);
  lift no if= 4226 -> 4292.
- Ratchet: owner ruling S470: allow raising the budget. Raised ONLY the `<each>` row if= recorded value
  in compiler/tests/integration/runtime-size-ratchet.test.js §4: 8245 -> 8310 (+65 B, the measured delta).
  Shell ceiling (§1) untouched.
- Tests: compiler/tests/unit/when-changes-latest-wins-s470.test.js (25). Against base 6081e0685: 19 fail / 6 pass
  (the 6 are sync/control/no-gate cases); head: 25 pass. Updated assertions in when-effect.test.js and
  action-body-await-s470.test.js for the gated shape.
- Shapes checked: several awaits (cancel at 1st and at 2nd await), writes before/between/after, multi-dep
  when, helper and direct server calls, statement-position and `if` positions, disposal, sync body
  (byte-identical emission `function() { … }`).
  - `!{}` in a when body: refused by impl#1 (E-IMPL1-ACTION-NOT-AWAITED), base and head — so the "error
    context does not run" rule is exercised at the runtime level (a stale rejection is discarded, not
    reported; a current one is reported). An error context INSIDE a called helper belongs to the call,
    which runs to completion (SPEC: only the suspended run's continuation is cancelled).
  - Nested when: E-CODEGEN-INVALID-LOGIC on base and head (SPEC says E-LIFECYCLE-016) — candidate gap.
  - Engine-hosted `${ when … }` inside an `<engine>` body: silently dropped (no emission) on base and
    head — candidate gap. Engine `effect=` / transition effects are not `<effect>`; SPEC §51.7.1 gives
    them no newest-run-wins rule, so they are out of scope (candidate gap / spec question).
  - `<effect deps=[…]>` markup form: not implemented in impl#1 (E-MARKUP-001).
- CI: types-gate OK (unchanged); s34-census --check-new PASS; e2e-render-map 259 pass.
- browser-baseline --check first run: NEW failure in when-changes-dep-list.browser.test.js (regex pinned
  `async function()`); updated to `async function(_scrml_live)` — behavioural assertions unchanged. Rerun PASS.
- R26 (scripts/corpus-emit-differential.ts, roots examples,samples,conformance,stdlib,benchmarks,
  compiler/samples,docs = 3618 sources; base = git worktree at 6081e0685, head e44912155): 0 compile
  outcome changes, 0 diagnostic-code changes, 1 text-only (samples/login.scrml, an already-failing
  E-CG-001 message quoting a bundle line number shifted by the larger runtime), syntax delta 0/0, bare
  server-fn sites 49/49. Artifact content diffs 5545/11073 are the runtime file + its content-hash
  references: after normalising runtime hash / build ids / project root, 8937 of 8937 non-runtime
  artifacts are identical. No corpus source emits an async when body (no `_scrml_live` anywhere).
