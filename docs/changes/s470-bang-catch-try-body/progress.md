# s470-bang-catch-try-body — progress

Gap: `g-impl1-bang-catch-try-body-cut-at-first-brace-s470` (HIGH, security).

## Findings (measured on base 6081e0685)

- Repro `~/.cache/scrml/review/s470-l1d/F2/app.scrml` reproduced: exit 0, `_scrml_cs_reactive_set("ok", _scrml_check_3(p))`,
  catch arms empty (`try { … } catch (e) { throw e }`).
- Locus: `ast-builder.js` `case "error-effect"` cuts the try body at `rawContent.indexOf("}")`. The block
  splitter already brace-balances the try body (string-aware) and then consumes `catch` arms with a NAIVE
  brace counter (no string / comment awareness). Both the `${}` and the auto-lifted bare-function paths
  go through the splitter.
- WIDER: the statement form `!{ … } catch T as b { … }` is NOT in SPEC (§19.1 "There is NO try/catch").
  - Even a correctly-read `!{ @ok = check(p) } catch AuthErr as b { @ok = false }` is a fail-open: it lowers
    to a host `try/catch`, but a failable call RETURNS its error, it does not throw, so the arm never runs.
  - The type checker never visits the try body (`case "error-effect"` in type-system.ts only sets the
    type): no E-ERROR-002, no E-SCOPE-001 for an undeclared name, no undeclared-cell error inside it.
  - `x instanceof AuthErr` on an enum (a frozen object) throws TypeError at run time.

## Plan

1. Splitter: read the catch handlers with the SAME main loop as the try body (re-enter it after
   `catch T [as b] {`), recording the try-body close and each arm's extent on the block.
2. AST builder: slice the try body / handlers from the recorded extents; tokenize the try body with the
   block's own children; refuse (located) when the extents are missing or the tokenizer disagrees.
3. TS: visit the try body as ordinary statements so an unhandled failable call there is E-ERROR-002
   (fails closed — the catch cannot handle a returned error).
4. Unit tests + security pack family + R26 + CI commands.

## Log

- (start) progress file created.
