# s473-host-allowlist-a — progress (append-only)

Lane A of the `<host>` rule 8 allowlist build (S473). Base: `origin/s473-boot-host-block-f3` (PR #1659).
Scope (brief `~/.cache/scrml-agent-tmp/pa-s473/allowlist-brief.md`; design
`scrml-support/docs/deep-dives/host-binding-allowlist-design-2026-10-29.md` §10): step 1 (rule 3's static
`src=` export read) and step 4 (the run-time guards), plus the browser-proven R1 refusal for the run-time side.
Lane B (`s473-host-allowlist-b`) owns the SPEC, host-surface.scrml and the analyze/parse chain walk.
impl#1 untouched.

Rulings (verbatim, `scrml-support/user-voice-scrml.md` S473 2026-10-29):
- "⭐ RULED — `<host>` rule 8 moves from a sink denylist to an allowlist": *"I like the sturdier design"* —
  *"A binding may call or read only what the allowlist admits; everything else is refused at compile time.
  The S473 fail-closed denylist … is the INTERIM and stays until the allowlist lands."*
- Q1 curated surface typed by interface, `src=` the one audited escape; Q3 no project-local surface.

## 2026-10-30 — step 4: the run-time guards (runtime.js)

`compiler/self-host-v2/slice-m1/runtime/runtime.js`, after `hostCall`:
- `hostInert(el, at)` — guarded(inert-receiver). Local name AND namespace read through the
  `Element.prototype` getters captured at module start (an own `localName` on the instance is never read;
  the WebIDL getter brand-checks the receiver). HTML namespace + `HOST_INERT_ELEMENTS` (exported, frozen;
  an allowlist of tags — no script/style/base/meta/link/iframe/frame/frameset/object/embed/template/slot/
  form/noscript/title/head/body/html, no custom element, no non-HTML element). Miss → trap
  `E-HOST-RECEIVER-RT` (design §9; the code's SPEC row is lane B's).
- `hostUrl(el, name, value, at)` / `hostAttrValue(el, name, value, at)` — guarded(url): the §5.2 rule 3
  guard `_scrml_safe_url` (the verbatim impl#1 copy, untouched between its markers), element-scoped through
  `_scrml_is_url_attr`. No second list.
- `hostSetAttrName(name, at)` — guarded(attr-name)'s run-time wall (§5.2 event-handler test + `srcdoc`).
- `hostBrand(v, iface, at, optional)` and the hostCall/hostDecode descriptor `{ k: "iface", name }` — r8.7
  brand checks: `instanceof` the interface object captured at start (snapshot of the realm's own
  capitalised constructor globals), plus the captured `Node.prototype.nodeType` getter for a Node
  interface and the captured `localName` getter for an Element interface (a prototype-borrowing fake
  fails). Miss → `E-HOST-VALUE-MISMATCH-RT`.
- `hostCallback(fn, argDescs, at)` — the callback wrapper, memoized per (function, signature text) in a
  WeakMap, so `removeEventListener` removes what `addEventListener` added; each host argument decoded by
  hostDecode (rule 13); extra args and `this` dropped; returns nothing to the host.

### Interface (for lane B's chain walk / the printer)

Lane B's walk decides the class of each entry; the printer then emits (rule 7: still literal JS):
- guarded(inert-receiver) receiver `r`: `rt.hostInert(r, at).member…`
- guarded(url) property write `r.href = v`: `rt.hostInert(r, at).href = rt.hostUrl(r, "href", v, at)`
- `setAttribute(lit, v)` [a][i]: `rt.hostInert(r, at).setAttribute(rt.hostSetAttrName(lit, at), rt.hostAttrValue(r, lit, v, at))`
- interface result / downcast: descriptor `{ k: "iface", name: "<Appendix H name>" }` (inside `maybe` for `| not`)
- callback slot `cb: (e: MouseEvent) => void`: `rt.hostCallback(cb, [<descs>], at)` with `{ k: "iface", name }` for an interface parameter
- `HOST_INERT_ELEMENTS` is the runtime's copy of Appendix H §H.4: lane B's Appendix-H diff test should read it
  (one list), or host-surface.scrml should generate it.

Not done here (lane B / step 6): the printer emission above (it needs the walk's class per entry), and so a
COMPILED binding that goes through the guards; the R1 browser test exercises the runtime's guarded emission
shape directly.

### Tests

- `compiler/self-host-v2/slice-m4/host-allowlist-runtime-s473.test.js` (happy-dom): 21 tests. Red on base
  (base runtime): 0 pass / 21 fail. Head: 21 pass.
- `compiler/self-host-v2/slice-m4/host-allowlist-chromium-s473.test.js` (Chromium, opt-in
  `SCRML_BROWSER_TESTS=1`): 14 tests. Each R1 case first runs a CONTROL (the unguarded sink executes in
  Chromium: remote `<script src>`, script `textContent`, `iframe.src = javascript:`, `a.href = javascript:` +
  click, `form.action = javascript:` + submit), then the guarded shape refuses it and nothing runs.
  Recorded run (Chromium /usr/bin/chromium): base 1 pass (the pure control) / 13 fail; head 14 pass / 0 fail.
