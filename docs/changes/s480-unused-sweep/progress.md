# s480-unused-sweep — progress

Lane: S480 ruling `ruling:user-voice-scrml.md-S480-each-binders` (user-voice "⭐ RULED — W-UNUSED-BINDING: `<each>`
binders and nested `function` declarations (#2009), PA recs adopted (S480, 2026-11-19)"), plus PA-decided follow-ups
of #2009. Branched from origin/main after #2009 merged.

- [x] 1. analyze.scrml: `addEachLoc` (arm 4) records an `<each>`'s written `as name` at its `as` attribute;
      unusedBindings gives it its own message (remove `as name`, `@.` still names the value, or `_name`).
      `@.` resolves to the same Sym (resolveAtItem), so a `@.` read counts (§17.7.3 aliases).
- [x] 2. SPEC §7.3.5: `<each>` bullet + "not reported" bullet (nested fn decls ruled; `<onchange>` arm binders
      not yet); lane-reading paragraph removed; provenance; §34 row. known-gaps: stale "pattern binders not
      reported" note on g-spec-unused-binding-lint-code-s479 annotated as superseded.
- [x] 3. Transport fix-it hints → `.Transport(_)`; `.Transport(t)` → `.Transport(_)` in the -rt-twin set,
      server-copy-bang-handler-rt, tutorial snippets 06/09/10 (+ tutorial.md copies); 04a `.Loaded(_)` /
      `.Failed(_)`; other incidental unread arm binders in conformance (parse-variant ×10, match-leave ×7,
      error/handler-pipeless-arms-rt, error/failable-match-whole-error-binder-rt `_ _e`), raw-content each `as=r`
      dropped. impl#1 run: no FAILS DIFFERENTLY on any touched case.
- [x] 4. Messages: `<match>` arm → `<V(_)>` (markMarkupArmLocs re-marks plainArm's binders arm 3); all arm
      messages name the `_`-prefixed alternative.
- [x] 5. LOW gap g-boot-unused-binding-onchange-arm-binders-s480 (owner question, rec: report).
- [x] tests: slice-m4/unused-binding-s480.test.js (3 red on base, 39 green on head); cases
      fn/unused-binding-each-{pos,neg} (pos xfail on impl#1 pinned to g-impl1-w-unused-binding-s480).
- [x] final gate set on head fe9118aff: pretest; bootstrap-conformance PASS 737->739, FAIL 0, CRASH 0, no
      PASS->FAIL (31 cases lose an incidental arm/each warning, 0 gain one); s34-census, types-gate,
      snippet-gate, claim-gate, corpus-compile-floor, gen-md-shim green; host-global-scan both shards (each-neg
      esm throw pinned); byte-compare base vs head: only the 2 new cases and the 10 `.Transport(_)` renames
      (binder local name) differ.
- corpus: 1 `<each>` hit (s471 repro, genuinely unread) — single-file 648 clean of 5258; full compile of the
  141 `as name` files, 13 clean, same hit.
