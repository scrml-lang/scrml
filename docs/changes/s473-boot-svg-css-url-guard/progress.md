# s473-boot-svg-css-url-guard — progress (append-only)

Branch `s473-boot-svg-css-url-guard` from origin/main `543791e75`. The CSS-injection follow-ups to #1615
(`docs/changes/s472-boot-style-attr-guard/progress.md` "NEXT LANE"). Security lane: constrained to the proven
path — `cssValueOf` (the §25.7 bridge's reader) and the existing `rt.attr` sink; no new reader.

## Rulings (verbatim, scrml-support/user-voice-scrml.md S472 "⭐ RULED — five PA recs …")
- 3. "**A data-bound `href` on a `<link>` whose `rel` contains `stylesheet` (or is computed) is REFUSED.** (g-boot-link-stylesheet-href-from-data-s472)"
- 4. "**Quoted `style="…${x}…"` (§65.4.2 table): each `${}` is guarded by `cssValueOf`** — ruled before either implementation lowers quoted style templates. (g-spec-65-4-2-quoted-style-template-contradiction-s472)"
- The SVG gap (g-boot-svg-presentation-attr-css-url-unguarded-s472) has no ruling and the SPEC names no
  presentation-attribute rule → runtime guard only (as §5.2 rule 3), no compile refusal.

## 2026-10-29T03:33Z — tests first, then implementation
- `slice-m4/css-url-guard-s473.test.js`: 285 tests, **248 red on base** (the 37 green on base are the benign /
  already-refused controls: benign CSS values, non-CSS targets, the four other `<link>` spellings that never
  compiled, benign `<link>` forms, the icon href, the four quoted-style refusals).
- runtime.js:
  - `cssValueOf(v, extraFunctions)` — optional extra function names (no fork; the bridge passes none).
  - `CSS_URL_ATTRS` = `fill stroke marker marker-start marker-mid marker-end clip-path mask filter cursor color-profile`.
    **Where the list came from:** the SVG presentation attributes whose CSS value grammar admits `<url>` / `<image>`:
    SVG 2 §13 Painting (`fill` / `stroke` `<paint>` ∋ `<url>`; `marker-start/mid/end` `none | <url>`; the `marker`
    shorthand — not a presentation attribute in SVG 2, listed fail closed); CSS Masking 1 (`clip-path`
    `<clip-source>` = `<url>`; `mask` shorthand `<mask-reference>` = `<image> | <mask-source>`); Filter Effects 1
    (`filter`, `<url>` in `<filter-value-list>`); CSS Basic UI 4 §5.1 + SVG 2's presentation-attribute table
    (`cursor`, `[<url> [<x> <y>]?]#`); SVG 1.1 ch. 12 (`color-profile`, `<iri>`, obsolete). Every other
    presentation attribute takes colours / lengths / keywords / `path()` (a string) and no URL.
  - `CSS_ATTR_FUNCTIONS` (extra admitted names, none takes a URL): Filter Effects 1 filter functions (`blur`
    `brightness` `contrast` `drop-shadow` `grayscale` `hue-rotate` `invert` `opacity` `saturate` `sepia`) and CSS
    Shapes 1 basic shapes (`inset` `circle` `ellipse` `polygon`; `path()` takes a string — refused anyway).
  - `writeGuardOf` replaces the call to `urlGuardOf` in `attr`: CSS-url names (lowercased, every element — fail
    closed) → `cssAttrValue` (null → attribute removed, one `[scrml css-guard]` warn, never the value); SMIL
    `to/from/by/values` whose static `attributeName` names a CSS-url attribute or `style` → CSS guard; a
    computed/absent `attributeName` → BOTH guards (URL first: `url(https://…)` has no scheme the URL reader
    accepts, so the URL guard alone admitted it); `values` per `;` entry.
  - `<link>` wall: a data `href` / `*:href` is refused when `rel` contains `stylesheet` (substring, case-insensitive)
    or is bound; either write order (a later bound `rel` removes the data href; its later writes stay refused).
- analyze.scrml: `linkRelLoadsSheet` + E-ATTR-STYLESHEET-HREF branch in `resolveHtml`'s attribute walk (non-static
  rel, `&` or `${` in a static rel → computed). `xlink:href=`, spread, braced and quoted-template hrefs already
  fail to compile (pinned).
- parse.scrml: comment only (the quoted `style` template refusal stays; ruling recorded).
- sink-guards.test.js s2/s5 flipped (both now removed by the CSS guard) — explained in the test.

## SPEC (quoted sentences implemented)
- §5.2 new bullet "**Data-supplied stylesheets (S472).**": "A `<link>` (tag compared case-insensitively) whose `href`
  (any case) is not a static string … and whose `rel` contains the text `stylesheet` (ASCII case-insensitive,
  anywhere in the value …) or is not a static string (`rel=@r`, `rel=(…)`) SHALL be a compile error
  (E-ATTR-STYLESHEET-HREF)." + provenance; §34 row E-ATTR-STYLESHEET-HREF.
- §65.4.2 new paragraph "**A `${…}` in a quoted `style="…"` is a guarded value (S472).**": "each `${…}` is a VALUE
  position: its value SHALL be guarded by `cssValueOf` … A value the check refuses SHALL NOT reach the style (fail
  closed)" + status note (bootstrap refuses; impl#1 unguarded) + provenance; the table row points at it.
- severity.scrml regenerated (E-ATTR-STYLESHEET-HREF Error); SPEC-INDEX regenerated.

## Chromium proof (puppeteer; probe at ~/.cache/scrml/review/s473-css/zz-chrome-probe.test.js, from the s472 one)
- base runtime (origin/main): fetched `fill` `stroke` `filter` `mask` `clip-path` `marker-start` `marker-end`
  `cursor`, `<set attributeName="filter" attributeType="CSS">`, computed `attributeName` (10 fetches; `FILL=`,
  `<set attributeName="fill">`, `style`, `<animate values>` did not fetch on base either).
- head: 0 fetches; the three `<link>` shapes are E-ATTR-STYLESHEET-HREF; benign `fill="red" filter="blur(2px)"` written.

## Gaps
- resolved: g-boot-svg-presentation-attr-css-url-unguarded-s472, g-boot-link-stylesheet-href-from-data-s472,
  g-spec-65-4-2-quoted-style-template-contradiction-s472.
- filed: g-impl1-svg-css-url-attr-and-link-stylesheet-href-unguarded-s473 (MED, impl#1 halves),
  g-boot-css-url-attr-local-fragment-refused-s473 (LOW, `url(#grad)` from data now refused — owner question).
- noted on g-impl1-style-attr-bound-value-unguarded-s472: impl#1's quoted style template is unguarded.
- state.ts --write: MED 701 → 700 (master-list.md churn discarded).

## 2026-10-29T04:40Z — committed 36c0c4ddf (full hook, 6 shards: 0 fail); hardening + gates
- First hook attempt timed out (1 shard for 1659 files under host load while I ran suites alongside) — rerun
  with SCRML_HOOK_SHARDS=6 SCRML_HOOK_SHARD_TIMEOUT_S=2400: all shards ok.
- compiler/tests/unit/bootstrap-url-guard-verbatim.test.js re-pinned: `attr` now asks `writeGuardOf`, which
  asks `urlGuardOf` for every URL write; still exactly one `setAttribute` in the runtime.
- Hardening: a SMIL `attributeName` is judged by its local part (`svg:Fill` → `fill`) — +1 test (286 total).
- Gates (local, CI `checks` job + bootstrap step): types-gate OK; root tests 2239/0; snippet 113/0; claim 21/0;
  corpus-compile-floor PASS; md-shim current; conflict markers 0; SPEC-INDEX OK; delta-lint PASS; s34-census
  --check-new --base origin/main PASS (1 new row); severity --check current; bootstrap-conformance --check
  current; lint-no-default-arm 0; slices m1 100/0, m2 614/0, lowered m1 100/0, m3 60/0, m4 3346/0, codec 166/0;
  e2e-render-map 259/0; conformance 2693/0; integration 0 fail.

## 2026-10-29 — fix round 1 (S239 review of d065ad2b3: LAND-WITH-FOLLOWUPS; ~/.cache/scrml/review/s473-1635/REVIEW.md)
- F1 (MED, SPEC falsehood): §65.4.2 no longer claims a guarded `${}` cannot add a fetch (`url(${@v})` with
  `//evil.example/x.png` passes `cssValueOf` and Chromium fetches). Added the PA ruling S473 paragraph
  "A `${…}` in a URL, string or comment context of a quoted `style="…"` is refused": E-STYLE-INTERP-IN-URL-CONTEXT
  when the literal context is inside `url(` `image(` `image-set(` `-webkit-image-set(` `cross-fade(` `element(`
  `src(` (any depth, any vendor prefix, whitespace before `(` included), a CSS string, a comment, after a `\`, or
  part of a function name. §34 row + §65.10 row, both spec-ahead (no implementation lowers the form; no code change).
- F3 (LOW): §5.2 "Data-supplied CSS-url attributes — runtime guard (S473)": the list and its sources, the
  every-element match, SMIL targets incl. `style` and prefixed names, both guards on a computed target, the
  removal on refusal, `url(#local)` refused (owner question g-boot-css-url-attr-local-fragment-refused-s473),
  direction of change (s2/s5, custom-element attrs — F4). Marked unruled (PA reading of §25.7).
- F2: filed g-boot-base-href-from-data-retargets-server-calls-s473 (MED, security; pre-existing): refuse a data
  `href` on `<base>` AND build absolute same-origin route URLs.
- F4: noted in the §5.2 sentence and the PR body as a known fail-closed regression.
- Gates: s34-census --check-new PASS (3 rows), SPEC-INDEX regen + --check OK, severity current, delta-lint, markers,
  snippet, claim, types-gate, root 2239/0. state.ts --write: MED 700 → 701 (master-list churn discarded).

## 2026-10-29 — merge origin/main (#1630 #1631 #1632 #1634 #1636) → 10ea05d87
- Conflicts: SPEC-INDEX.md (git-merge-generated --regen; --check OK, 52,788 lines) and severity.scrml (took main,
  regenerated; keeps E-ATTR-STYLESHEET-HREF; --check current). known-gaps auto-merged; state.ts --write no change;
  @gap ids main 2477 + branch 2467 → 2480, none lost. g-boot-base-href-from-data-retargets-server-calls-s473 kept
  as is (PA reconciles with #1637).
- Merge commit: full hook, 6 shards, 0 fail.
- Gates: lint-no-default-arm 0; lint-duplicate-fn 0; types-gate OK; claim 0 fail; snippet 0 fail; s34-census
  --check-new --base origin/main PASS; SPEC-INDEX --check OK; severity current; delta-lint PASS; markers 0;
  md-shim current; bootstrap-conformance --check current; e2e-render-map 259/0; root 2239/0; compile-floor PASS;
  slices m1 109/0, m2 619/0, lowered m1 109/0, m3 60/0, m4 3416/0, codec 166/0.
