# s478-boot-scope-builtins — progress (crash-recovery anchor)

Lane: spurious / wrong-code errors on otherwise-supported cases in the bootstrap (§20 built-ins etc.).

## Done
- Stale cases fixed (the SPEC contradicts them):
  - fn/scope-redeclare-fn-over-param-ok, fn/scope-redeclare-neg: `string + int` is E-OPERATOR-OPERAND-TYPE
    (§14.13 table: "text + a number with `+` | `+` takes two numbers or two strings (S440)"). Both now use templates.
  - sql/multiple-statements-neg, sql/multiple-statements-in-condition-neg: an unhandled `?{}` or server call
    in a handler is E-ERROR-002 (§19.8.3, §19.9.10). Handlers were added; the in-condition case uses a `!` fn.
  - reactive/s437-r5-template-cell-read-value-attr: `style=(expr)` is E-STYLE-VALUE-NOT-STYLE (§65.4.2).
    The case now uses `title=`.
  - reactive/server-fn-rawvar-read-error: as written it was E-AUTH-001 (§52.11 + S473 D29), E-SQL-004 (§8.1.1)
    and E-ERROR-002 (§19.8.3). It was restated, and it still asserts E-REACTIVE-003 on both impls.
- Bootstrap (analyze.scrml, parse.scrml):
  - keywordless declaration (§50.8.5): resolveEvalStmt / keywordlessName, NsAt.kw re-read, parse PNs.kw.
    §5.2 sinks are judged first.
  - by-name refusals (builtinUnbuilt): log, print, println, navigate, route, cleanup, document, window,
    navigator. domScopeDropped also drops the DOM-root refusal under E-ROUTE-005.
  - `session`: a bare value-use is E-SESSION-VALUE; `session.x` / `session.f()` are refused by name.
  - cleanup(): a call argument is E-LIFECYCLE-002, any other non-function E-LIFECYCLE-004, a function is refused by name.
  - tests: slice-m4/scope-builtins-s478.test.js. The dom-sinks pins moved E-SCOPE-001 -> E-BOOTSTRAP-UNSUPPORTED.
- Merged origin/main (body-top #1876, #1880). Conformance base2 (2a4e95bf4) -> head: PASS 456->462,
  FAIL 97->79, CODES-ONLY 4->0, UNSUPPORTED 676->692. Corpus: newly-rejecting 0.
- Gaps: g-bootstrap-twin-log-unknown-s451 resolved. A note was added to g-boot-s20-builtins-unbuilt-s473.
  New: g-boot-export-form1-library-entry-s478 and g-boot-sql-query-not-readable-code-s478 (owner questions).

## Not done (residue)
- log() / print / println implementation (Core host statement). Named refusals only.
- module/e-import-002-circular-import-reject, type-state-codes/e-type-045-*: body-top, owned by #1876/#1880.
