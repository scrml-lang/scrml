# s480-impl1-renders-href — progress

Lane: close HIGH gap `g-impl1-renders-href-unguarded-s480` in impl#1 under the S479 carve-out 2 as
widened S480 (ruling:user-voice-scrml.md-S480-census-recs item 5).

- [x] (1) URL attributes from a payload field in `renders` / `fallback=` templates → `_scrml_url_attr_html` (rule 3, `_scrml_safe_url`)
- [x] (2) `<set attributeName="href">` / animation values in the templates (incl. a static value beside a payload `attributeName`); DOM writers already guarded (S457), pinned
- [x] (3) non-stylesheet `<link href>` in the templates → `_scrml_link_href_html` applies rule 3
- [x] (4) `<base href>` from data → E-ATTR-BASE-HREF (VP-3 walk, renders, fallback) + runtime wall in `_scrml_link_href_set` / `_scrml_link_href_html(…, "base")`
- [x] tests: `compiler/tests/integration/s480-impl1-renders-href-guard.test.js` (12/18 red on base); conformance `attr-executable-sink/base-href-{data-neg,static-pos}`
- [x] emit differential base vs head (same tree path): 48 artifacts-sets differ = programs shipping the 'cssattrguard' chunk (chunk text + runtime hash); 0 compile-failure delta; 0 newly rejecting
- [x] SPEC impl#1-status sentences for E-ATTR-BASE-HREF; gap resolved; 2 LOW gaps filed
- [ ] commit (hook), final gates, PR
