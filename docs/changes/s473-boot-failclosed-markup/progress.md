# s473-boot-failclosed-markup — progress

Lane: make the bootstrap (compiler/self-host-v2) fail closed on markup it does not understand.
Branch: `s473-boot-failclosed-markup` off origin/main 741a2b51c.

## Done (commit 1 — WIP)
- `elements.scrml` (new): impl#1's E-MARKUP-001 element list ported as data (HTML + SVG + MathML,
  legacy names, custom-element grammar); `isKnownElementName`. Registered in slice-m2 M2_MODULES.
- analyze `resolveElem`: unknown lowercase tag → E-MARKUP-001; unknown capitalised → E-COMPONENT-035.
- analyze `structuralOwner`: `onmount` (§6.7.1a), `md` (§67) → E-BOOTSTRAP-UNSUPPORTED.
- analyze `resolveHtml`: E-DECL-FIELD-TAG-NEEDS-STAR now covers program cells (`<count/>`, §66.6.6).
- analyze `namedInstanceDiags`: named shared instance in a `<program>` body refused (§66.8.2).
- analyze `userDeclStub`: E-NAME-COLLIDES-RESERVED (§4.15 / §24.4 list, case-insensitive).
- analyze `controlFlowInMarkup`: E-CONTROL-FLOW-IN-MARKUP (§17.4, impl#1's braced recognizer).
- analyze `eachShapeDiags`: E-EACH-ITER-SHAPE, E-EACH-EMPTY-BODY (§17.7.2).
- analyze: `fixed` in a declaration's renders not written to the DOM (§15.7 / §66.15.1).
- parse `unquotedOperatorDiag`: E-ATTR-UNQUOTED-OPERATOR (§5.2); analyze comment fixed.

## Corpus (measure.ts over conformance/cases, samples, stdlib, examples — 2858 files)
- clean before 69, after 61. Newly failing: 8 (6 md/* now refused; script-style-exact-name-neg
  `<scripts>`; engine/mount-not-engine-pos `<helper/>` naming an imported function).

## Next
- tests, gaps, regen (severity, conformance report, known-gaps), gates, PR.

## Done (commits 2–3)
- S473 D2/D26/D1 (bryan's rulings): `fixed` refused by name (D26); `protect=` / `authority=` on any
  element refused (D1/D2); unknown names emitted only when hyphenated (D2).
- Excusal for an unknown element that the parser already refused (parse error in its span) or that
  names an import whose module does not resolve — each already an error, never fail-open.
- Conformance fixtures fixed (both were §4.1-invalid): block-grammar/script-style-exact-name-neg
  (`<scripts>` → `<script-x>`), block-grammar/block-029-leading-equals-quote-prose-pos (`<note>`/`<cell>` → `<span>`).
- Merged origin/main (#1673). Gaps RESOLVED/NARROWED in place (no new gaps); coverage rows updated.
- Final corpus delta: clean 69 → 62; newly failing 7 (6 md/* refused, engine/mount-not-engine-pos E-MARKUP-001).
  bootstrap-conformance: FAIL 49 → 42, PASS 263 → 263.

## Review fix round (#1678 LAND-W-F/U)
- F1: capitalised tag passes only if its lowercase form is an HTML name (`markupElementName`,
  elements `isHtmlElementName`) — `<Unknown/>`/`<Set/>`/`<View/>` are E-COMPONENT-035; gap text corrected.
- F3: g-boot-program-field-bare-tag-renders-inert-s473 → NARROWED; ruling owed (element-named cells).
- F4: control-flow recognizer finds the braced statement anywhere in a run; else / else if / switch /
  match / do; interpolation between `)` and `{`. "Tap if (and only if) ready" pinned clean.
- F6: `<slot>` refuses protect= / authority= / fixed. F7 header cite. F8 `selectedcontent`.
  F9 hyphen-word values: E-ATTR-UNQUOTED-OPERATOR only when the names resolve (no double report).
- F5 noted in the gap. Conformance: PASS 264, FAIL 41. Corpus: +31 E-CONTROL-FLOW-IN-MARKUP on
  already-failing files; post-ce-residual-component-reject now fails to compile as its case expects.
- F2 (merge with #1675) pending its landing.
- F3 RULED (bryan, user-voice S473 "review-surfaced decisions" item 3): an element-named program cell
  beside a same-named tag is refused at the cell — E-NAME-COLLIDES-ELEMENT (code name is a READING;
  #1682 names none). Tests migrated by the ruling: M2 `p` cell → `pt` (5 slice-m2, 3 slice-m4 files,
  3 acceptance cases), sink-guards `set` cell → `srcs`. Gap → resolved. Corpus: no change.
