# s473-boot-plain-logic-dom-sinks — progress (append-only)

Ruling (verbatim, ruling:user-voice-scrml.md S473 "⭐ RULED — S473 PA recs: host allowlist Q1–Q4, plain-logic DOM sinks, impl#1 transport routing", item 2):
> **Plain client logic: data written to a known executable sink is a compile ERROR** (narrows S473 round 2 item 7, "DOM members stay open", for this set only). The set is `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc`, `on*` properties and attributes, `document.write`/`writeln`, and `eval`/`Function`/string `setTimeout`/`setInterval`. Every other DOM member stays open; off-surface members get a warning. The corpus is measured before landing.

## 2026-10-29 — start
- Branch from origin/main ec9c8daca. #1659 (sink table in parse.scrml `hostSinkWhy`) is OPEN, not landed, so the table goes in ONE shared place (url.scrml) that #1659 can adopt.
- Appendix H is NOT on main, so the off-surface warning is not built; gap filed.

## Corpus measurement (before the refusal)
grep over `*.scrml` in conformance, examples, samples, stdlib, benchmarks and ../flogence (read-only) for the sink set:
- conformance: 3 hits, all `Object.assign` on scrml values with ordinary keys (`Object.assign(a, b)` on two query rows; `Object.assign(@l, { n: @m })` x2). No sink key, target not a host value: NOT refused.
- examples 0, benchmarks 0.
- samples: 1 real client-logic sink, `eval(resolved)` in samples/compilation-tests/gauntlet-r10-solid-spreadsheet.scrml:153 (cell text into eval: exactly the hole). The rest are `bun.eval` (compile-time meta, §30: compiler-internal only, not permitted in user `${}`) or comments.
- stdlib: `Object.assign` x9 in http/time, every target a fresh `{}` / `Object.create(…)` / a local: NOT refused. One regex mentioning `bun.eval` (not a call).
- flogence: `Object.assign({}, acc)` x1 (fresh target): NOT refused.
- `.onX =`, `innerHTML`, `outerHTML`, `srcdoc` property writes, `insertAdjacentHTML`, `document.write`, `Function(`, string timers in logic: 0.
Newly refused legitimate uses: 0. (The one refused use, the spreadsheet sample's `eval`, is the hole itself.)
On the bootstrap today every listed form is already refused, by an unrelated code (E-BOOTSTRAP-UNSUPPORTED for host member calls, E-SCOPE-001 for `document` / `eval` / `setTimeout`), EXCEPT a write to a struct field named `innerHTML` / `on*`, which compiles clean. The new code pins the ruled refusal so it holds when those forms land.

## Tests first
compiler/self-host-v2/slice-m4/plain-logic-dom-sinks-s473.test.js: 62 tests, 47 red on base (all the refusals + message/severity), 15 green (the open cases). (+3 refusal tests added after the first green run: quoted key, a cell target, a computed host method — 65 total, 50 refusal-shaped.)

## 2026-10-29 — implementation
- Table: `compiler/self-host-v2/url.scrml` `logicWriteSink` / `logicCallSink` / `attrNameArgIndex` / `executableAttrName` (reuses the existing `isEventHandlerName`, §5.2 rule 1's name test). parse.scrml's private `executableByName` now delegates to it (one test).
- Judgment: analyze.scrml `sinkTargetWhy` / `sinkCallWhy`, run FIRST in resolveAssign, resolveCallStmt and resolveCallOrConstruct (the typer's own path — no new reader, no new walk); a refused site gets one report and returns. parse.scrml `compoundSinkMember` at a compound assignment (the parser recovers `x += v` as a placeholder, so the typer never sees it).
- New code E-LOGIC-EXECUTABLE-SINK: SPEC §34 row + §5.2 "Executable sinks in plain logic (S473)"; severity.scrml regenerated.
- Static literals (decided from the SPEC): a quoted string literal stays legal on the HTML-string sinks (innerHTML / outerHTML / insertAdjacentHTML / document.write(ln)) — the ruling says "data", and §5.2 S473 defines static as "a quoted string literal". It is refused on `srcdoc` and `on…` (§5.2 S464 "Static executable values" refuses a static srcdoc; "Quoted event-handler attributes" refuses a quoted handler) and on eval / Function / a string timer (§5.2 S464: "There is no raw-JavaScript escape hatch").
- Governing SPEC sentence written (S473-marked): "In client logic (a function body, a handler, an inline handler block, an initializer), data written to a known executable sink SHALL be a compile error (E-LOGIC-EXECUTABLE-SINK)."
- Tests: 62/62 green (47 were red on base).
- Gaps: filed+resolved g-spec-plain-logic-dom-sinks-unlinted (the design §5.9 hole); filed open g-impl1-plain-logic-dom-sinks-s473, g-spec-plain-logic-off-surface-warning-s473 (no Appendix H), g-spec-plain-logic-sinks-beyond-ruled-set-s473.
- Gates: s34-census PASS, SPEC-INDEX PASS, conflict-marker PASS, delta-lint PASS, md-shim PASS, claim-gate PASS, snippet-gate PASS, corpus-compile-floor PASS, types-gate PASS, bootstrap-conformance report regenerated (unchanged), slices m1/m2/m1-lowered/m3/m4/codec + lints PASS.

## 2026-10-29 — fix round 1 (#1663 review LAND-W-F/U; REVIEW.md + probes p1–p4 at ~/.cache/scrml/review/s473-1663/)
origin/main had not moved (merge was a no-op). #1659 is still open, so the table stays in url.scrml.
Finding → fix:
- F1 (by type, fail closed): new `sinkTypeOf` / `sinkKnown` / `sinkScrmlTyped` (analyze.scrml). A computed key (non-literal or template; a numeric key is admitted), `Object.assign` / `defineProperties` of a non-literal or spread source, and `Reflect.set` / `defineProperty` with a computed key are refused unless the receiver's static type is a scrml type: a cell, a typed local or parameter, a field or tape element of one, or a `const` bound to an object/array literal (new LocalB `fresh` flag). A function parameter whose annotation is missing or unresolved (`e: Event`) is now bound with NO type for this judgment (it was a `string` placeholder). `Object.assign(@w, x)` and `Object.assign(@w, {...x})` are now consistent (both admitted on a scrml-typed target, both refused on an untyped one).
- F2: `write` / `writeln` are sinks on any receiver (url.scrml `htmlArgIndex` -2).
- F3: `eval` / `Function` referenced as a value are refused (resolveName; resolveMember for `.eval` / `.Function` / `.constructor`), and so is one passed as an argument (`Reflect.apply`, `.map`). A callee that is not a name/member/index chain fails closed. `constructor` is an exec name.
- F4: `createAttribute(NS)` / `getAttributeNode(NS)` names judged like setAttribute; `setAttributeNode(NS)` / `setNamedItem(NS)` refused; a `value` / `nodeValue` / `textContent` / `data` write through `attributes` / `getNamedItem` / `getAttributeNode` refused.
- F5: member names are case-sensitive (`innerHTML`, `outerHTML`, `srcdoc` exact). on* is the platform pattern `on[a-z]+` (rule 1's exempt words kept), and is judged by type: a declared field of a scrml struct is admitted. Attribute names stay case-insensitive.
- PA ruling (extends item 2): `setHTMLUnsafe`, `createContextualFragment`, `parseFromString` (argument 0), `execCommand("insertHTML", …)` with data or a computed command, and navigation. For navigation (`location` / `href` writes on a non-scrml-typed value, `location.assign` / `replace`), a literal is judged by rule 3's `urlValueAdmitted`. Data is refused until a runtime-guard lowering exists (gap g-boot-logic-navigation-runtime-guard-s473).
- F6: client logic only (`env.fx.serverOwn` skips everything except `eval` / `Function`). The SPEC says so; the §34 row's insertAdjacentHTML wording (argument 1), case-sensitivity and Object.assign wording are aligned.
- F7: "not a sink" tests either compile CLEAN (scrml-typed fixtures) or, on a host value, assert this code is absent AND name the unrelated code that refuses the site today. The test-header `logicSinkOf` reference is fixed.
- The PR body and the resolved gap no longer claim the code "pins … still holds"; the gap now states what is pinned and the one invariant a host-value lowering must keep.
Corpus (re-measured by COMPILING every .scrml in conformance, examples, samples, stdlib, benchmarks and flogence/src with the bootstrap; 2893 files): 3 files report the code, 0 newly refused (each already fails on 100+ other errors). The 3: `eval` in samples/gauntlet-r10-solid-spreadsheet (the hole); `bun.eval` in samples/gauntlet-r10-zig-buildconfig (§30: not permitted in user logic); `a.dnx[a.dlast] = id` in stdlib/md on an unannotated `let` bound from a call (annotating it admits it). The first by-type draft also flagged `result[key] = …` on `const result = {}` (stdlib/data ×8), `parts[parts.length - 1]`, `@mm[1].push`, `parts[i].trim()` and braced-arrow timers. Fresh-literal consts, numeric keys and computed keys judged at their own receiver admit them now; a braced-arrow argument the parser already reported is not re-judged.
The PA ruling's additions contributed 0 hits.
Tests: 124 (all green); slice-m4 3870 pass.
