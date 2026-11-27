# s483-host-render-request — fix round r2 progress (dropped before merge, as in r1)

Brief: ~/.cache/scrml/review/s483-briefs/fix-2123-r2.md; review ~/.cache/scrml/review/s483-2123-r1rev/review.md.
Ruling: ruling:user-voice-scrml.md-S483-render-bound-time ("Time without yielding").
Probes copy + drivers: ~/.cache/scrml/review/s483-2123-r2/probes (myrun.sh, myrt.sh, rtbatch.sh, netbatch.sh, dbgbatch.sh).

1. Branch s483-hrr-r2 from origin/s483-host-render-request @ df3519a3c; merged origin/main (b5f071c46).
   Probe outputs (all p-*) after the merge byte-identical to df3519a3c's (r1pre.out vs merged.out).
2. Runtime: r1 lap cap removed (runtime.js back to r0's 6bbc1565d), stall bound added (RENDER_STALL_MS,
   MessageChannel tick, re-run-only, one report per stall). Slice tests rewritten for the stall bound;
   Chromium: F9, R10, X2, P5, P6 compiled probes. 21/21 with SCRML_BROWSER_TESTS=1 (x3).
3. Stall check samples the clock (first re-run, then every 64th): perf_rows2 / PERF_each1000 within noise of base and r0; dbgchain N=1000..5000 within noise of base.
4. Text: SPEC §6.15 render self-write hang (stall bound, provenance both rulings, measured Direction of change), §6.7.4 rule 5 S483 note (per-update bound for effects; time bound render-only); known-gaps g-boot-render-host-call-hang-s482 re-graded MED (narrowed) with what remains; new g-boot-request-ring-if-arm-s483 (P6).
