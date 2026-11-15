# s478-boot-scope-builtins — progress (crash-recovery anchor)

Lane: spurious / wrong-code errors on otherwise-supported cases in the bootstrap (§20 built-ins etc.).

## Done
- Stale cases fixed (SPEC contradicts them):
  - fn/scope-redeclare-fn-over-param-ok, fn/scope-redeclare-neg: `string + int` is E-OPERATOR-OPERAND-TYPE
    (§14.13 table "text + a number with `+` | `+` takes two numbers or two strings (S440)"); now templates.
  - sql/multiple-statements-neg, sql/multiple-statements-in-condition-neg: unhandled `?{}` / server call
    in a handler is E-ERROR-002 (§19.8.3, §19.9.10); handlers added (in-condition: `!` fn).
  - reactive/s437-r5-template-cell-read-value-attr: `style=(expr)` is E-STYLE-VALUE-NOT-STYLE (§65.4.2);
    the case now uses `title=`.

## Next
- session bare value -> E-SESSION-VALUE; cleanup() arg checks; DOM roots named refusal; keywordless
  binding (§50.8.5); log() built-in.
