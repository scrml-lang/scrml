# s472-boot-style-attr-guard — progress

Gap: `g-bootstrap-style-attr-bound-value-unguarded-s469` (MED). Branch `s472-boot-style-attr-guard` from origin/main.

## Reading

SPEC §65.4.2 (the `style=` value-shape table) is the rule for a bound `style=` value:

> `style=<expr>` where `<expr>` is neither a quoted string literal nor a `style`-typed value/list SHALL emit `E-STYLE-VALUE-NOT-STYLE`. Dynamic raw CSS is **only** the quoted-literal form — you cannot apply an arbitrary runtime string as a style-value (that would reopen the injection surface).

The bootstrap has no `style` type (a `#{}` in expression position, §65.4.1, is not in it), so every
`style=(expr)` / `style=@x` / `style=name` is a non-style value: E-STYLE-VALUE-NOT-STYLE at compile time.
That is stricter than the gap's recommended runtime `cssDeclarationsOf` guard, which would admit
exactly what §65.4.2 forbids (an arbitrary runtime string applied as a style). The bootstrap has no
SSR of bound attributes (a bound value is written only by the client), so the compile refusal covers
both outputs; a runtime wall in `rt.attr` refuses a `style` write too (defense in depth).

## Steps
- [x] analyze.scrml: refuse `style=` from data (E-STYLE-VALUE-NOT-STYLE); show= writer-conflict advice fixed
- [x] parse.scrml: quoted `style="…${}…"` hint no longer steers to `style=(…)`
- [x] runtime.js: `attr` refuses a `style` write (fail closed)
- [x] §34 row for E-STYLE-VALUE-NOT-STYLE; severity.scrml regen (also picked up E-IMPORT-003/008/009, stale on main); SPEC-INDEX
- [x] tests: slice-m4/style-attr-guard-s472.test.js — 46 tests, 42 red on main (the 4 green: title still written, braced refused, two benign); show.test.js + sink-guards.test.js expectations flipped
- [x] gap resolved (known-gaps marker; state.ts --write: counts already current — one MED resolved, one MED filed); bootstrap-conformance.md --write: no change
- [x] filed g-impl1-style-attr-bound-value-unguarded-s472 (impl#1 has the same hole; S471 TS policy — not a lane)
- [x] merged origin/main (#1608) — no conflicts; severity / SPEC-INDEX / bootstrap-conformance / state all current after merge
- [x] gates (logs ~/.cache/scrml-pa/s472/st-gate-*.log): slices m1 100/0, m2 613/0, SLICE_CORE=lowered m1 100/0, m3 60/0, m4 2813/0;
  e2e-render-map 259/0; checks job: types-gate OK, root conformance 2239/0, snippet, claim, compile-floor, md-shim,
  bootstrap-conformance --check, conflict markers, SPEC-INDEX, delta-lint, ci-shards needs, s34-census --check-new
  --base origin/main PASS, severity --check current; facts.ts --check stale (WARN-only, bot-owned — not touched).
  Full pre-commit on every commit (last: merge commit).

## Review round (S239 review of af5516bdb — LAND-WITH-FOLLOWUPS) — done, f3ce72247
- F1 wording: analyze.scrml comment + gap resolution note — `#{ @cell }` is the GUARDED channel into CSS, not the only one.
- F3: dropped resolveShow's `style=(…)` E-ATTR-WRITER-CONFLICT (one diagnostic per fault); show.test.js re-pinned; severity.scrml regen.
- F4: quoted `style="…${}…"` hint cites §5.5.3.
- Filed: g-boot-svg-presentation-attr-css-url-unguarded-s472 (MED), g-spec-65-4-2-quoted-style-template-contradiction-s472 (LOW),
  g-boot-link-stylesheet-href-from-data-s472 (MED), g-boot-meta-refresh-content-from-data-s472 (LOW).
- Merge of origin/main #1614 (docs-only) was ABORTED: the hook timed out 3x (host memory pressure → 1 shard for 1655 files,
  1200 s cap; 0 failures in what ran). Branch is behind main by that docs PR only.

## NEXT LANE (not started — PA deferred to next session): branch `s472-boot-svg-css-url-guard`
Rulings (scrml-support/user-voice-scrml.md "⭐ RULED — five PA recs …" S472, `13e57c1`):
- **(3)** "A data-bound `href` on a `<link>` whose `rel` contains `stylesheet` (or is computed) is REFUSED." → compile refusal in
  analyze.scrml (new code, §5.2 bullet + §34 row + provenance; s34-census; SPEC-INDEX regen) + rt.attr runtime wall; tests red on main.
- **(4)** "Quoted `style="…${x}…"` (§65.4.2 table): each `${}` is guarded by `cssValueOf`" → SPEC §65.4.2 text resolving the
  table/sentence contradiction (+ provenance); bootstrap still refuses quoted style templates (§5.5.3 unsupported) — note in
  g-spec-65-4-2-quoted-style-template-contradiction-s472 that any future lowering routes each `${}` through cssValueOf;
  impl#1 lowers it unguarded today (note on g-impl1-style-attr-bound-value-unguarded-s472).
- **SVG** (g-boot-svg-presentation-attr-css-url-unguarded-s472): rt.attr routes SVG-namespace `fill stroke filter mask clip-path
  marker marker-start marker-mid marker-end cursor` (+ SMIL to/from/by/values whose attributeName names one or is computed;
  `values` per `;` entry) through cssValueOf — reuse, no new reader. Benign `filter=blur(2px)` / `clip-path=circle(…)` need
  extra admitted function names (pass an extra set to cssValueOf; do not fork it). SPEC is silent on presentation attrs → no
  compile refusal unless ruled; a computed attributeName judged by both guards flips sink-guards s5 (`/ok?a=1` admitted today) —
  surface. Puppeteer proof: reuse ~/.cache/scrml/review/s472-st/probes/zz-st-chrome.test.js (no /leak fetch on head, fetch on main).

## S473 landing-front (2026-10-28) — merge origin/main 3a7d1d223
- Conflict: compiler/self-host-v2/severity.scrml (generated count header 207 vs 209) — took origin/main then regenerated
  via `bun scripts/gen-bootstrap-severity.ts` (`--check` current). Regen drops E-ATTR-WRITER-CONFLICT (branch's F3 removal
  of its only bootstrap emitter; base had it, main unchanged) and keeps E-STYLE-VALUE-NOT-STYLE.
- analyze.scrml / parse.scrml auto-merged; resolveShow keeps the branch's F3 shape (base→branch change, main untouched).
- docs/known-gaps.md: merge driver resolved; `state.ts --write` no change; no @gap id lost (main 2444, branch 2435, result 2449).
