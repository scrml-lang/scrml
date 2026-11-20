# s480-boot-endpoint-opener — progress

Source: the S239 review of #2007 (E-ENDPOINT-ATTR-INVALID). Bootstrap only; impl#1 frozen.

1. MED — §61.2 "The opener is read whole" in the bootstrap: `endpointItem` scans the opener's text
   (`epDroppedAt`) as the markup attribute reader reads it; a `'`, a backtick, a nameless `{…}` /
   `${…}` block, a comment → E-ATTR-001 at the character. `'…'` values are not strings
   (`epQuotedOf`). Repeated path/method/accepts → their codes; non-string path → PATH-MISSING;
   non-bare accepts → ACCEPTS-MISSING; empty `path=""` → PATH-INVALID. DONE.
2. LOW — the typed-attribute loop in `endpointItem` was unreachable (§66.2.2 makes the opener a
   declaration first); removed, stale message gone; §61.2 provenance corrected; gap
   g-boot-endpoint-typed-attr-code-s480 (owner question). DONE.
3. LOW — §34 E-ENDPOINT-ATTR-INVALID row: validator call removed (E-ATTR-001, both emitters now —
   the bootstrap aligned). DONE.
4. Gaps: g-boot-endpoint-typed-attr-code-s480, g-endpoint-opener-code-residue-s480. DONE.

Battery (158 cases, scratch ~/.cache/scrml/review/s480-boot-ep-opener/): accept/refuse splits 14 → 7
(6 × `cors=` INTERIM, 1 × spaced `=`).

Round 2 (conformance): the opener reader's per-character E-PARSE-TAG inside a dropped run is
folded into the one E-ATTR-001 (endpoint/attr-comment-in-opener was FAIL on head). Battery: same
codes 58 → 70 of 158.

Round r1 (S239 review of #2012 BLOCKED, F1 fail-open):
- F1 (a) parse.scrml `epReaderRefused` — only an Error-severity reader diagnostic (not E-STMT-*) in
  the attribute's span suppresses its own code; a Warning/Info (W-IS-SOME-DEPRECATED,
  W-STRING-INTERP-LITERAL) did, and the endpoint compiled with no route. DONE.
- F1 (b) AEndpoint.opErr + analyze.scrml `endpointUnreadDiags`: an endpoint with "" path/method/
  accepts and no Error in its opener is refused under that attribute's code. DONE (unit test).
- F2 (i) names inside a dropped run folded (`epInRuns`); (ii) `path={"/a"}` etc. now carry the
  attribute's code too; (iii) residue gap updated (HTML comment mid-opener cascade noted). DONE.
- Ruling S480 endpoint-typed-attr: §61.2 sentence, §34 row, bootstrap message
  (analyze.scrml userDeclStub), gap g-boot-endpoint-typed-attr-code-s480 → carried, pinned by
  conformance endpoint/typed-attr-declaration-neg (xfail impl1-ts). DONE.
- Battery (261 + 260 junk + 13 w): 0 head-accept where base or impl#1 refuses.
