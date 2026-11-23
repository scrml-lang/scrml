# s482-place-fu — progress

Lane: follow-ups from the #2079 review (PRE-2, LOW-1) and the #2078 review (LOW-1). Bootstrap-only.
Base: #2079 (s482-construct-init-fu) head f0281eca2, rebased onto origin/main once #2079 merged.

- [x] item 3 (#2078 LOW-1): E-TYPE-044 on a `not` inside a wildcard alternation — analyze plainMatch
      `notNamed` (FPlain notArm only). Test: slice-m4/e-type-044-wild-alt-s482.test.js.
- [x] item 2 (#2079 LOW-1): constructWrites — a cell seed counts only when it runs between the
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
