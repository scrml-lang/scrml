# s482-place-fu2 — progress

Lane: follow-ups from the #2082 r3 review (HIGH-5, INFO-1, INFO-2). Bootstrap-only. Base: origin/main e87048b31.

- [x] item 1 (HIGH-5): analyze bodyCodeBlocks maps `.Effect(w)` to its `deps=` expressions (effectDepBlocks),
      never the body; regionScan unchanged (no markup). SPEC §7.6 rule (b) + §34 E-FILE-SCOPE-INIT-IN-CONSTRUCT
      row: an `<effect>`'s body does not run at the mount, its `deps=` are read there.
      Tests: slice-m4/effect-deps-mount-s482.test.js; tests/browser/effect-deps-mount-chromium-s482.
- [x] item 2 (INFO-1 / INFO-2): SPEC ambiguous for both — not built. Gaps g-spec-imported-cell-seed-time-s482,
      g-spec-locked-field-acting-init-place-s482 (ruling-gated, owner questions with recs); ⚑ Open markers in
      §7.6 rule (b) and §66.7.6 rule 5. A `let` field's seed at the instance's mount is already built (probe b1 = 5).
- [ ] gates
