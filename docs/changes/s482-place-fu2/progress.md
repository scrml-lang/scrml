# s482-place-fu2 — progress

Lane: follow-ups from the #2082 r3 review (HIGH-5, INFO-1, INFO-2). Bootstrap-only. Base: origin/main e87048b31.

- [x] item 1 (HIGH-5): analyze bodyCodeBlocks maps `.Effect(w)` to its `deps=` expressions (effectDepBlocks),
      never the body; regionScan unchanged (no markup). SPEC §7.6 rule (b) + §34 E-FILE-SCOPE-INIT-IN-CONSTRUCT
      row: an `<effect>`'s body does not run at the mount, its `deps=` are read there.
      Tests: slice-m4/effect-deps-mount-s482.test.js; tests/browser/effect-deps-mount-chromium-s482.
- [x] item 2 (INFO-1 / INFO-2): SPEC ambiguous for both — not built. Gaps g-spec-imported-cell-seed-time-s482,
      g-spec-locked-field-acting-init-place-s482 (ruling-gated, owner questions with recs); ⚑ Open markers in
      §7.6 rule (b) and §66.7.6 rule 5. A `let` field's seed at the instance's mount is already built (probe b1 = 5).
- [x] gates (head dc7961d74 = the fix commit; base origin/main e87048b31):
      pretest exit 0; bootstrap-conformance --json PASS 845 / FAIL 4 / UNSUPPORTED 491 / NOT-TWINNED 628, CRASH 0,
      on both, 0 per-case bucket/emitted diffs; corpus differential + byte-compare (2972 files: examples/ samples/
      benchmarks/ conformance/cases/ — html/js/server): 0 newly rejected, 0 newly accepted, 0 code diffs, 0 output
      diffs, 0 throws; s34-census --check-new --base e87048b31 PASS (1 changed row); types-gate OK (182 unchanged);
      corpus-compile-floor PASS; e2e-render-map 259 pass. New tests on base: slice 2 fail / 3 pass, Chromium (run
      alone) 2 fail / 3 pass — the refusals; head 5/5 and 5/5 (8 expects, not skipped). The Chromium file must
      run in its own process (with a happy-dom slice file in the same `bun test` its page loads time out, as
      for the rcdata Chromium file).
