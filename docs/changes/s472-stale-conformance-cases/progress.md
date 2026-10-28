# S472 — two stale conformance cases brought to current SPEC

Branch `s472-stale-conformance-cases` (from origin/main 94ec8e735). Change-id `s472-stale-conformance-cases`.

## Verdicts

### 1. `conformance/cases/control-flow/ctrl-004-else-on-state-opener-pos`: the CASE was stale

Governing SPEC (§4.3, S442 amendment; repeated in §15.15.5):

> **Amendment S442 (dpa-045) — inside a free-text body the spaced form is TEXT.** In a plain-markup free-text body
> (§4.18.1) a `<` is a markup-open attempt only when immediately followed by `[a-zA-Z!/?*_.]` (§4.18.1b), so `< tag>`
> there is content, not an opener, and no W-WHITESPACE-001 fires on it. The spaced form keeps the P1 behaviour above
> everywhere else (e.g. a `<program>` / `<page>` body, §40.8). impl#1 still treats it as an opener in a free-text body;
> affected corpus: **one** conformance case, `conformance/cases/control-flow/ctrl-004-else-on-state-opener-pos` (not edited).

The case wrapped its chain in `<div class="gate">`, which is a free-text body. Under the S442 rule, `< profile else name(string)/>`
inside that `<div>` is text, so there is no state object opener, and §17.1.1 ("`else` and `else-if=` SHALL NOT appear on a
state object opener. The compiler SHALL reject any such usage (E-CTRL-004).") has nothing to reject. The bootstrap reads
the source as SPEC says and emits no E-CTRL-004. Its FAIL ("not in the bootstrap: E-CTRL-004") was really the case
asserting impl#1's divergent reading.

Fix: dropped the `<div>` wrapper. The `if=` element and the spaced state opener carrying `else` now sit directly in the
`<program>` body. That is a default-logic body, where the spaced opener is still an opener, so the intent is unchanged
(the in-chain path of E-CTRL-004) and the case states it in current-SPEC form. `expected.json` description and rationale
are updated with the quote. Expectations are unchanged.

- impl#1: PASS (`bun test ./conformance/conformance-corpus.test.js -t ctrl-004`, 3/3).
- bootstrap: FAIL to UNSUPPORTED (parse-reject: `E-PARSE-TAG: expected a tag name after <`). The bootstrap does not
  accept the deprecated spaced opener at all, and the sibling `ctrl-004-orphan-else-on-state-opener-pos` already lands in
  the same bucket. That gap is separate bootstrap debt and is not touched here (see Deferred).

### 2. `conformance/cases/defer/deferred-server-call-completes`: the CASE was stale

Governing SPEC:
- §19.4.3 (S451): "A call evaluated on the client whose callee is server-placed (§12.2) can fail on the wire, so it is a
  failable call whether or not the callee is declared `!` … §19.9.10 states the rule, its scope, and its failure set:
  the callee's declared variants, if any, plus `Transport(t: ServerCallError)`".
- §19.16.3 rule 3: "A call to a failable function (declared `!`, §19.4, or CPS-implicit `!`, §19.9.5) inside a deferred
  body SHALL be handled in place, with an inline `!{}` handler (§19.4.3, the canonical form) or an exhaustive `match` on
  the result." … "**A deferred `!{}` handler SHALL be total — it SHALL carry a catch-all `_ :> …` arm**" … "A deferred
  handler without a `_` arm is E-DEFER-UNHANDLED-FAILABLE."

The case had `let r = ping(1);` in a `defer` body, which is an unhandled client→server call. The bootstrap's
E-DEFER-UNHANDLED-FAILABLE was correct. Fix: `let r = ping(1) !{ _ :> 0 };`. The success path (stub `ping` → 2) is the
same, so the expected trace `a;n2;after;` is unchanged. The rationale records the quote.

- impl#1: PASS (codes + runtime).
- bootstrap: FAIL to UNSUPPORTED (bootstrap-unsupported: "a client call of the server function `ping` (§19.9.10) stands
  in a `defer` body — a deferred body cannot wait (C16; §19.16.6 async `defer` arrives with its own slice)"). That is
  an honest refusal of a planned later slice, not a wrong answer.

## Bootstrap counter (`bun scripts/bootstrap-conformance.ts --write`)
Before: FAIL 51, UNSUPPORTED 823. After: FAIL 49, UNSUPPORTED 825. PASS unchanged at 254. `docs/bootstrap-conformance.md`
was regenerated with the generator, not edited by hand.

## Deferred / surfaced
- The bootstrap parser refuses the deprecated spaced opener `< name …>` (E-PARSE-TAG). SPEC says it compiles with
  W-WHITESPACE-001 outside free-text bodies. Because of this, both ctrl-004 pos cases sit in UNSUPPORTED. Not small, so
  not done here.
- The bootstrap has no async `defer` yet (§19.16.6). It is a planned slice.
- SPEC §4.3, §15.15.5 and the §4.18 corpus table (around line 1602) still say the case was "not edited" or count it as
  the affected corpus. Those notes are now outdated. They are SPEC text, so this lane did not edit them; PA should decide.
- Test hygiene: `compiler/tests/integration/db-nearest-scope-runtime.test.js` does not clear its `_tmp_db_nearest_scope`
  dir in `beforeAll`. A hook run stopped by `--bail` left the dir behind, and every later run then failed with
  "table shared already exists" until the dir was removed by hand.
