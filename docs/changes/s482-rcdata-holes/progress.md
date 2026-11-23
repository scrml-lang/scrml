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

## Next
- slice-m4/rcdata-holes-s482.test.js, gates, byte-compare, corpus differential, gap marker, PR.
