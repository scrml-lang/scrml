# s482-rcdata-holes — progress

Gap: g-boot-rcdata-hole-anchor-s482 (MED). Branch `s482-rcdata-holes` from origin/main eafb1762f.
Scratch: ~/.cache/scrml/review/s482-rcdata-holes/ (probes p/, Chromium runner h/pw.ts, h/run.sh).

## Done
- print.scrml: `textContentKids` / `textContentJs` — an HTML-namespace textarea / title / xmp / iframe /
  noembed / noframes / noscript holding a `${}` is printed EMPTY and is its own hole; its content is
  `rt.textContent(scope$, el, () => [parts])` (text + values joined). textarea's one dropped LF cut.
  bind:value on the textarea → no content writer (§34 W-RCDATA-BIND-VALUE-CONTENT-CONFLICT).
- runtime.js: `textContent(scope, el, fn)` — sets textContent; for a textarea also `.value` (SPEC §34 row:
  "compiles to a reactive `.value` bind"; impl#1 emit-event-wiring.ts same).
- analyze.scrml: `mkRawNode` — inside raw/RCDATA: `<effect>`/`<request>` → E-HTML-PARSER-REPAIR,
  `${ for … lift }` → E-BOOTSTRAP-UNSUPPORTED (INTERIM); `mkBindContent` → W-RCDATA-BIND-VALUE-CONTENT-CONFLICT.
- severity.scrml regenerated (gen-bootstrap-severity.ts).

## Chromium (head) — all probes load with no error; after a cell change the value follows.

## Measured
- slice-m4/rcdata-holes-s482.test.js: base 10 pass / 8 fail, head 18 pass.
- compiler/tests/browser/rcdata-holes-chromium-s482.browser.test.js: base 0/4, head 4/4 (Chromium).
- bootstrap-conformance --json: base == head (PASS 816, FAIL 3, NOT-TWINNED 628, UNSUPPORTED 517, CRASH 0); no verdict changed.
- byte-compare (printProgram/printServer per conformance case): 1 of 253 printed differs —
  reactive/textarea-rcdata-value-bind (`<textarea id="ta">${@x}</textarea>`: anchor + rt.text → empty + rt.textContent). Expected.
- corpus differential (2968 files): 0 changed error sets.
- s34-census --check-new, types-gate --check, snippet-gate, claim-gate, corpus-compile-floor --check,
  gen-md-shim --check, gen-bootstrap-severity --check, e2e-render-map (259 pass): all clean.
- impl#1 oracle (Chromium): mixed textarea value `a &amp; b hi c` (static `&amp;` literal, same as head);
  after typing, a cell change overwrites (`.value`), same as head; impl#1's DOM child text stays the
  first paint (`a &amp; b  c`), head sets textContent too (form reset restores the current value).

## Next
- commit, push, PR.
