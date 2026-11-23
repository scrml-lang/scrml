# s482-place-fu — progress

Lane: follow-ups from the #2079 review (PRE-2, LOW-1) and the #2078 review (LOW-1). Bootstrap-only.
Base: #2079 (s482-construct-init-fu) head f0281eca2, rebased onto origin/main once #2079 merged.

- [x] item 3 (#2078 LOW-1): E-TYPE-044 on a `not` inside a wildcard alternation — analyze plainMatch
      `notNamed` (FPlain notArm only). Test: slice-m4/e-type-044-wild-alt-s482.test.js.
- [x] ~~item 2 (#2079 LOW-1)~~ (REVERTED r3 — see below): constructWrites — a cell seed counts only when it runs between the
      construct's start and the initializer (place there, or used there: blocksCells + usesR "c:"
      atoms, fixpoint over seeds). Test: slice-m4/cell-seed-bound-s482.test.js.
- [x] item 1 (#2079 PRE-2): an initializer in `<textarea>` / `<title>` (and every other element whose
      content holds no place) runs just before the element (lower lowerPlaced); analyze constructStart /
      placeHostAt / regionHasCode refuse what that place cannot keep in order; SPEC §7.6 rule (b) + §34
      row amended; gap g-boot-rcdata-init-after-code-s482 (INTERIM). `<errors>`, `<slot>`, `<schema>`,
      `<each>` refuse content / a declaration in it; `<*x>…</*x>` does not parse; `<pre>`/`<code>` are raw
      text; `<script>`/`<style>` are refused — none holds a place today, all now place before.
      Tests: slice-m4/rcdata-init-place-s482.test.js, tests/browser/rcdata-init-place-chromium-s482.
      Corpus (2972 files): 0 newly rejected, 0 output diffs.
- [x] gates (head 7b73325e8 = item-1 commit; base origin/main d64e7e060):
      pretest exit 0 (base, head); bootstrap-conformance --json PASS 845 / FAIL 4 / UNSUPPORTED 491 /
      NOT-TWINNED 628 on both, CRASH 0, 0 per-case bucket/emitted diffs; corpus differential + byte-compare
      (2972 files: examples/ samples/ benchmarks/ conformance/cases/ — html/js/server): 0 newly rejected,
      0 newly accepted, 0 code changes, 0 output diffs; s34-census --check-new PASS (1 changed row);
      types-gate OK (182 unchanged); snippet-gate / claim-gate 0 failed; corpus-compile-floor PASS;
      gen-md-shim current; gen-bootstrap-severity current; e2e-render-map 259 pass.
      New tests red on base: 19 fail / 9 pass (the 9 are refusal and guard tests base already met).
- [x] fix round r1 (#2082 review, head b7502bd4d → a3ce57fe8):
      HIGH-1: constructWrites missed the cell named by a `bind:` (AttrKind.ABind sits on the attribute,
      not on the `@s` node), so a later cell's seed run at the mount went uncounted — c3-bind (construct)
      and c6-ta-bindz (textarea) compiled and showed k = 1 in Chromium. regionBindCells adds every `bind:`
      cell of an element starting in the region (and in a used component's render), read through
      bindCellOf, shared with the seed-reach judgment's bodyBindReach. Both shapes refused again (base
      refused c3; c6 now refused, base 5). Other attribute forms (class:, style:, show=, if=, nested
      attrs, component props) were already counted (their `@x` node carries a read fact).
      LOW-1: regionHasCode skips literal attribute values (codeBlocksOf / literalBlock: Num, Str, Bool,
      not) — `<textarea rows=3>${ const k = bump(); }${n}` compiles, Chromium "5" (source order).
      Tests: slice-m4 cell-seed-bound (+3), rcdata-init-place (+2); Chromium rcdata-init-place-chromium
      (+5: 2 CLI refusals, 2 controls = 5, rows=3 = 0/5), 9 pass / 11 expects, not skipped.
      Gates: pretest exit 0; conformance 845/4/491/628, CRASH 0, 0 per-case diffs vs base; corpus
      (2972) 0 newly rejected / 0 newly accepted / 0 code / 0 output diffs vs d64e7e060; s34-census
      PASS; types-gate OK 182; corpus-compile-floor PASS; e2e-render-map 259 pass.
- [x] fix round r2 (#2082 r1 re-review, head 9c6aee627):
      HIGH-2 (regression from base since r0): the bounded `used` set did not descend into the state-child
      bodies a `<*field/>` view (ElemFact.MStateView) renders at the mount, so h03 (`${@s}` in a body) and
      h07 (`bind:value=@s` in a body) compiled and showed k = 1 in Chromium (base refused). MED-1
      (pre-existing): h01, a body that writes (`"R${bump()}"`), was missed by blocksWrites too.
      Fix — the bound is DEFAULT-DENY (analyze.scrml regionScan / scanElem / scanFact / scanArms /
      opaqueAttr / viewsWrites): every `<*x/>` view in the region (and in a used component's render, and
      in a view, transitively, each once) is walked whole — EVERY state's body, not only the initial one —
      for its blocks (writes + cells used), its `bind:` cells and its component uses; anything the walk
      does not positively understand sets `opaque`, and constructWrites then counts every seed placed at
      or after `lo` (base's rule). regionHasCode (the textarea / title host path) counts a view or
      anything opaque as code.
      Handled node kinds (ANodeK, an exhaustive match — a new kind will not compile until classified):
        Text, Interp, Run — the generic walk reads the code they hold; ~~Css~~ (r3, #2082 r2 INFO: the
        generic walk gives `[]` for Css — a `#{}` bridge read is no code; its values are not evaluated
        as code, and the bridge cell's seed is a program cell's, counted as one);
        Effect — does not run at the mount; ~~Request~~ (r3: WRONG — see r3 below, it runs at the mount);
        Gather — its rows; Elem — by its ElemFact (exhaustive match):
          MHtml, MSlot, MDb, MSchema — attributes + kids (the generic walk);
          MUse — use-site values + slot content (kids); its renders and seeds: the component loop;
          MEach — `in=` / `key=` values + the row template (kids);
          MMatch — `on=` value + every arm's body (the arm elements carry no fact: walked as arms);
          MStateView — every state-child body, walked as a view (new);
          MInline — the inlined child-field renders, walked as a view (new).
      Fail closed (opaque → base's rule): DeclNode (a declaration where markup stands), MStar (a
      declaration's shared instance), MErrors, an element with no ElemFact, and an attribute whose value is
      code the walk does not read (a non-event `{ }` block, a quoted value or duration holding `${`).
      LOW-doc: SPEC §7.6 rule (b) provenance + INTERIM marker and gap g-boot-rcdata-init-after-code-s482
      headline/body now name c6-ta-bindz (non-acting initializer reading what a `bind:` seed writes:
      base 5, now refused); SPEC also names the `<*field/>` state bodies in the construct-writes list.
      Tests: slice-m4 cell-seed-bound (+6: h03, h07, h01 refused; non-initial state's body refused;
      controls = 5; default-deny `<errors>` refused + its control 1/5); Chromium
      rcdata-init-place-chromium (+4: h03/h07 CLI refusals, h04/h08 controls = 5), 13 pass, not skipped.
      Gates (head b2f1d716a; base main d64e7e060): pre-commit hook PASS (58089 pass / 0 fail);
      pretest exit 0; bootstrap-conformance --json PASS 845 / FAIL 4 / UNSUPPORTED 491 / NOT-TWINNED 628,
      CRASH 0, byte-identical to base but for the timing line; corpus differential + byte-compare (2972
      files, html/js/server) 0 newly rejected / 0 newly accepted / 0 code changes / 0 output diffs /
      0 throws — the default-deny fallback rejects no corpus file; s34-census --check-new PASS (1 row);
      types-gate OK (182 unchanged); corpus-compile-floor PASS; e2e-render-map 259 pass / 0 fail.
- [x] r3 fix round (#2082 r2 review; PA decision, settled):
      A. constructWrites (and the RCDATA path that shares it) back to base's rule: every program cell
      seed placed at or after `lo` counts. blocksCells / regionBindCells / the `used` fixpoint removed
      (usesR no longer threaded). MED-2: regionUses + scanFact treat MStar (`<*x/>` of a declaration's
      shared instance) as a use — the component loop counts its field seeds and renders. HIGH-3: the
      viewed field is a program cell placed after `lo` in s01a/s01b, so base's rule counts it (verified:
      both refused). Item-2 legality tests flipped to refusals; the after-construct `let <z=(bump())/>`
      is refused again — INTERIM gap g-boot-construct-seed-bound-s482 (capable alternative: a bounded
      set proven complete); SPEC §7.6 rule (b) ⚑ INTERIM + §34 row.
      B. bodyCodeBlocks: a `<request>`'s body and attribute values are mount code (§6.7.7.3) — in
      regionBlocks, blocksWrites, regionHasCode. `<effect>` stays non-mount. A request's reads matter
      only through the seeds they run, all counted by A. Default-deny: anything opaque now fails closed
      to every body write (bodyWritesOf, #2076's rule) — base's seed rule is always on, so r2's
      opaque→seeds fallback had become vacuous. Css INFO: progress note corrected (above).
      Probes (Chromium, ~/.cache/scrml/review/s482-2082-r3fix): s01a, s01b, s02, s03, r01, r02, r03,
      r05, r06 refused; every control 5. Re-run of the r0/r1 p/ + q/ probes (122 rows) vs r2 head:
      only b0-ctl-after-unused, b8-effect, c2-effect-inconstruct, f25-comp-after-init (item-2 legal
      rows; refused on main too) and g10-ta-bind-checked-sib (RCDATA path; main 5 — the place was
      after the element there) change, all to E-FILE-SCOPE-INIT-IN-CONSTRUCT.

