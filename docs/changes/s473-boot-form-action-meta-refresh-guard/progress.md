# s473-boot-form-action-meta-refresh-guard — progress (append-only)

Rulings (verbatim, ../scrml-support/user-voice-scrml.md "⭐ RULED — S473 owner questions round 2"):
1. "**Form `action` / `formaction` from data: REFUSED unless static.** A data-bound value posts the form's fields (password included) off-origin; proven in Chromium."
2. "**`<meta http-equiv="refresh">` from data: REFUSED.** It navigates the whole page off-origin; proven in Chromium."

Pattern: mirror #1637 (E-ATTR-BASE-HREF) — analyze.scrml attribute walk + runtime `rt.attr` wall. Bootstrap only (S471).

## 2026-10-29
- Branch from origin/main (69a3ed1d6). Probed base: every data-bound form action / formaction / refresh meta content / data http-equiv compiled clean (0 diagnostics).
- Tests first: `compiler/self-host-v2/slice-m4/form-action-meta-refresh-guard-s473.test.js`, 72 tests — **51 red on base**, 21 green (controls: static forms, data elsewhere, other spellings already refused, e2e static form).
- The tests-only commit was blocked by the pre-commit hook (the red tests are in the hook's slice set) — tests land with the implementation instead. Red-on-base count above stands (measured before any implementation).
- Implemented:
  - `analyze.scrml` — `navSinkCode` / `metaEquivRefreshes` / `navSinkMessage` (after `parenValue`), one new branch in `resolveHtml`'s attribute walk (before the `style` branch): E-ATTR-FORM-ACTION / E-ATTR-META-REFRESH.
  - `runtime.js` — `refusedNavigationWrite` (before `attr`), called first thing in `attr` (fail closed, `fn` never run, attribute removed, report without value).
  - SPEC §5.2 new bullet "Data never chooses where a form posts or where the page goes (S473)", placed before rule 3's runtime-guard bullet (away from #1637's / #1635's insertion point); two §34 rows before E-ATTR-INTERP-EXECUTABLE.
  - Governing sentences: "An `action` on a `<form>` whose value is not static, and a `formaction` … whose value is not static, SHALL each be a compile error (E-ATTR-FORM-ACTION)." / "On a `<meta>`, an `http-equiv` whose value is not static, and a `content` whose value is not static while the element's `http-equiv` refreshes or is computed, SHALL each be a compile error (E-ATTR-META-REFRESH)." / "Every runtime path that writes one of these attributes from data SHALL refuse the write (fail closed)".
  - Regenerated severity.scrml, SPEC-INDEX, known-gaps counts (master-list.md churn not staged).
  - Gaps: closed g-boot-meta-refresh-content-from-data-s472; filed g-impl1-form-action-meta-refresh-from-data-s473.
  - Conformance case `attr-executable-sink/bound-url-runtime-guard` held `<form action=(@bad)>` as a rule-3 runtime write; the row is removed (now a compile error). impl#1 corpus-bridge 1815/0; bootstrap-conformance report unchanged vs main.
- New test file: 72 pass after implementation.
- sink-guards.test.js held `<form id="f" action=@bad>` as a rule-3 runtime write; removed that row (now E-ATTR-FORM-ACTION), refusal count 13 → 12. Slices m1/m2/m1-lowered/m3/m4/codec, e2e-render-map, root tests: all green after that.
- First commit attempt: hook failed in compiler/tests/integration/s466-server-param-defaults.test.js (12 fails, impl#1, untouched by this lane); the file passes alone (90/0) — load flake; retried.

## 2026-10-29 — fix round 1 (#1641 review LAND-W-F/U)
- F1 (S473 PA ruling, extends round 2 item 1): a non-static `form=` (form owner, any element, any case) is E-ATTR-FORM-ACTION (own message: "data never chooses where a form posts …"); `rt.attr` refuses it (thunk never run). `judgeOwner` skips a data owner (already refused — one diagnostic per fault); gate-reach.test.js's two data-`form=` expectations move from E-FORM-OWNER-UNRESOLVED to E-ATTR-FORM-ACTION. SPEC §5.2 item 1 extended with a "Form owner (S473 PA ruling, extends round 2 item 1)" sentence quoting item 1 verbatim; §34 row extended.
- Corpus impact measured: zero data `form=` in conformance/examples/samples/stdlib/benchmarks (only static `form="fm"` in a docs repro); corpus-compile-floor PASS; bootstrap-conformance report current (unchanged). ZERO newly-rejected files.
- F3: note added to g-impl1-form-action-meta-refresh-from-data-s473 (restore the removed `#f action=(@bad)` row as an impl#1 conformance case when impl#1 is fixed).
- F4: refusals now log via `console.error` (the url-guard channel). The pack now reads the error channel.
- Tests: pack is 89 tests; 38 red on 597ddc35c (form-owner compile + runtime, and the warn→error channel). All gates + slices green.
