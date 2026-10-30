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
  interface and the captured `localName` getter for an Element interface. Miss → `E-HOST-VALUE-MISMATCH-RT`.
  **CORRECTION (#1670 review M2):** the claim first written here — "a prototype-borrowing fake fails" — was
  FALSE for non-Node interfaces (`instanceof` alone: `Object.create(DOMRect.prototype)`, a Proxy whose
  `getPrototypeOf` answers `DOMRect.prototype`, `Object.create(CanvasRenderingContext2D.prototype)` all
  passed) and the element kind was not checked (a `<div>` re-prototyped as `HTMLCanvasElement` passed). Fixed
  in the fix round below.
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

## 2026-10-30 — merge of origin/main after #1659 landed

`git merge origin/main` (a79caa051): clean, no conflicts. Branch diff vs main = only this lane's files, so no
generated file to regen and no gap id lost. Draft PR #1670 → main.

## 2026-10-30 — step 1: rule 3's static `src=` export read (7c489f9a7)

- parse.scrml: a valid `src=` is no longer refused (hostSrcDiags); in a `<host src=>`, a target root that is
  not a parameter / host root is an export of src (rule 4), a bare export call is admitted (A-world).
- core.scrml: `HostBind.src: HostSrc | not` — `{ path (relative to the source root, may begin `../`), file,
  at, targetless }`. analyze.scrml hostBindCore: a targetless binding is a call of the export of its own
  name, params in order (rule 3). check.scrml C-HB2 re-verifies. print.scrml: `hostSrcs(p)` numbers the
  files; each is imported once as `import * as hostsrc$K from "./_scrml/host-src/K.js"`.
- slice-m1/host-src.js `planHostSrcs(core, sourceRoot)` (driver side — the only place files are read):
  acorn module parse (impl#1's helperModuleSpecifiers walk; nothing evaluated); every export form incl.
  destructuring; `export { x } from` verified against its source (a broken one is E-IMPORT-004 for the
  whole file — the browser would not link it); `export *` followed, cycle-safe, ES ambiguity excluded;
  non-relative `export * from "pkg"` is "a form the parse cannot resolve" → E-IMPORT-004 naming it.
  Files: realpath (symlinks followed), E-IMPORT-006 missing, E-IMPORT-011 outside the project root
  (nearest `scrml.toml` / `.git` ancestor of the source root) or in a §47.13 denied class (impl#1's one
  `_scrml_static_denied`, imported). Copy closure = every relative `.js`/`.mjs` import / re-export /
  literal dynamic import, transitively. Layout `_scrml_local/<project-relative path>` (impl#1's) plus a
  shim `_scrml/host-src/K.js` = `export * from "../../_scrml_local/<rel>"`.
- scripts/scrml-boot.ts: runs it after the front end (diagnostics mapped to file:line), writes copies +
  shims, clears `_scrml_local/`, adds them to `written` (so `dev` serves them).
- Tests: `slice-m4/host-src-s473.test.js` 18 (compile on temp projects with scrml-boot, run the page in
  happy-dom). Base 1 pass (the "refused build writes no copy" negative) / 17 fail; head 18 pass.
  host-block-f3 rule 3 case updated (front end clean, Core carries the export root).
- Not done: `slice-m1/load-program.js` / `server-artifact-harness.js` do not copy `src=` files, so the
  #1659 probe tests' move to `src=` fixtures (step 6) should use scrml-boot `compileFile` as this test
  does, or extend loadProgram with `planHostSrcs`.
- A-world chains still pass through the #1659 INTERIM denylist (hostSinkWhy) — unchanged, as ruled.

## Gaps

- `g-spec-host-target-url-sinks-unjudged-s473`: re-titled code-exec, LOW → HIGH, status NARROWED (not
  resolved: a compiled target reaches the guards only when lane B's walk + printer route it).
- `g-boot-host-block-f3-unbuilt-s473`: item (a) (`src=`) marked built.

## 2026-10-30 — #1670 fix round 1 (review ~/.cache/scrml/review/s473-1670/REVIEW.md, LAND-W-F/U)

- **M1 (customized built-ins pass hostInert)** — hostInert also requires `Object.getPrototypeOf(el)` to be
  EXACTLY this realm's own prototype for its tag, from an element of each inert tag made at runtime start
  (`hostCaps.inertProtos`). Refuses `<button is="x-b">` (its prototype is the author's class), another
  realm's element (closes I2) and a re-prototyped element. Chromium red→green: control shows the customized
  built-in's attributeChangedCallback runs an `onerror` payload; guarded → E-HOST-RECEIVER-RT, nothing runs.
- **M2 (hostBrand only a brand check for Node)** — every branded interface now needs, besides `instanceof`:
  its BRAND GETTER (the first own accessor on its prototype chain, captured at start; a WebIDL getter throws
  Illegal invocation on a non-branded receiver; no accessor → fail closed, except a Node superinterface —
  EventTarget — which is admitted only for a value branding as a Node); for an Element interface, the
  element's prototype must be EXACTLY the realm's prototype for its namespace + local name (made lazily with
  the captured `createElementNS` on the captured document; a hyphenated name fails closed). Chromium
  red→green: all five review fakes refused; real canvas context, DOMRect, div, script-as-HTMLElement pass.
  The false progress.md claim is corrected above. Note: a customized built-in now FAILS the brand check of
  its base interface (fail closed).
- **L1 (shim path raw)** — the shim's specifier is percent-encoded per segment and written with
  JSON.stringify; the comment carries no path. Test: a real dir path with `"`, newline, `%2e%2e`, `#`, `?`,
  `*/`, resolved the way a browser resolves a module URL (bun's resolver does not percent-decode, so the page
  is not loaded there); and a literal `%2e%2e` dir.
- **L2 (hostAttrValue name coercion)** — a non-string name throws (compiler defect), never `String()`ed.
- **L3 (star-cycle memo order)** — a result computed under an open cycle cut carries the cut and is not
  memoized. Test: two `<host src=>` blocks over an `a ⇄ b` star cycle, both orders.
- Not touched (coordinator files them): L4, L5, I1, I3–I5.
