# s479-timed-onidle — progress

Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — three open S479 questions, PA recs adopted (S479, 2026-11-18)", items 2 and 3.
Branch `s479-timed-onidle` off origin/main e415f40b0 (includes #1972).

Baseline bootstrap conformance (base): PASS 702 · FAIL 4 · NOT-TWINNED 637 · UNSUPPORTED 557 · CRASH 0.

## Item 2 — timed engine + <onIdle> (code DONE)
- analyze `timingCellProblem`: the `gr.idle` by-name refusal removed.
- runtime: `idleFire` — the watchdog fire on a timed cell is judged against rule= now (refused → reported, cancels nothing), a fire that changes the cell clears `t.held` + `t.timer` and writes past the wrapper (`Cell.write`); a no-op fire keeps a held write; the throttle window (`last`) is untouched. Re-arm unchanged (the watchdog observes committed changes).
- tests: slice-m4/timed-onidle-s479.test.js (10, FakeClock); durations F5 updated.
- corpus: 0 corpus files combine `<onIdle>` with debounced=/throttled= (grep samples/ examples/ conformance/ acceptance).
- S480: rebased onto origin/main c9f62ee5c (reset + ff + `git apply --3way` of the saved staged patch; clean).
- S480: SPEC §51.0.R "Composition with `debounced=` / `throttled=`" + §6.13.5 pointer + §6.13.6 bullet; conformance engine/timed-onidle-{debounce-fire-cancels-held,throttle-fire-in-window}-rt (PASS boot, XFAIL impl1); no-double-window test; gaps: residue narrowed (part 1 built), new g-boot-onidle-noop-fire-cancel-reading-s480 (owner question).

## Item 3 — ratify refused-commit window
- S480: §6.13.5 marker off, cites ruling item 3; gap resolved.

## Item 1 — tool initializers (§7.6 rule (a) in a tool) — S480
- Not on main (checked c9f62ee5c). Built here: analyze `initReachDiags` (tool → `swaits`), constValue tool-worded `?{}`; print-server `serverReach` adds init-called server fns (tool printed only main's reach → ReferenceError at load).
- SPEC §7.6 rule (a) "In a tool (S480)" + provenance; gap g-spec-tool-file-scope-init-rule-a-s479 resolved.
- tests: slice-m4/tool-init-s480.test.js (5).
