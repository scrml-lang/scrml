// Shapes that LOG IN ON A WRONG PASSWORD on this branch today. Each entry names the open gap it is owed to.
//
// The pack is green with these failing and goes RED when:
//   - a shape NOT listed here logs in on a wrong password (a new hole), or
//   - a listed shape stops doing so (it was fixed: delete its entry; if the gap has no listed
//     shapes left, the gap's own status is the PA's to change).
//
// Refresh with `bun compiler/tests/integration/security-failable-pack/classify.js` — never by
// hand-editing to make the suite pass.
//
// Measured S468 fix round 1 (branch s468-failable-alias-and-match): 24 shapes. For comparison, the
// same 188 shapes on base 5c43c3b8e: 63 FAIL; on the frozen review head 7ecae57eb: 47 FAIL.
// S469 (fix round 1, agent 2): 21 of 226 — the HANDLER and SERVER_STMT entries were fixed (deleted;
// families n11 / n12 added), only the VALUE class (ruling owed) remained.
// S469 fix round 2: 0 of 260.

// S469 fix round 2: EMPTY. The 21 VALUE shapes (`g-failable-function-used-as-value-unchecked-s468`) are
// refused by construction — bryan RULED F4 (ruling:user-voice-scrml.md S469 "Split + audit"): the
// language lets a failable function be used as a value; impl#1 refuses every read of one outside
// callee position except a `const` alias by name (E-IMPL1-FAILABLE-FN-VALUE, an impl#1 limitation,
// carried as `g-impl1-failable-fn-value-refused-s469`).
export const KNOWN_FAIL = {
  // S470 s470-render-position-server-call-refused: EMPTY again. The five RENDER-position entries
  // (f1/render: markup interpolation, f1/render: derived cell, f2/async helper × if= with && / bare if= /
  // derived cell — g-markup-gate-tests-server-call-promise, g-derived-cell-rhs-server-call-renders-promise,
  // g-render-match-async-subject-unawaited-s469) are refused: a waiting value in a render position is
  // E-VALUE-SERVER-CALL (§13.7 / §13.8; ruling:user-voice-scrml.md S469 item 1 "Refuse in impl#1").
  // The interpolation twin `f2/async helper, interpolation` (awaited, PASS) is refused by the same rule.

  // S470 s470-whole-error-binder-escapes — escape 3 of g-impl1-whole-error-binder-allowlist-escapes-s469, OPEN
  // (PA decision owed): a whole `e` passed to a variant constructor is allowed (§18.6.1 `.Failed(err)`), and
  // impl#1 cannot follow the wrapped error back out — a constructor call, a `const` bound to one and a match
  // payload binder carry no type, so the payload read is unchecked. The fallback refusal (a whole error into
  // a constructor) newly-rejects examples/09-error-handling.scrml. FAIL on base 915b6775f too.
  "s11/3 ctor extract match": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `match Box.Wrap(e) { .Wrap(i) :> i.reason … }`",
  "s11/3 ctor extract dot ctor": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `.Wrap(e)` then `.Wrap(i) :> i.reason`",
  "s11/3 ctor data member": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `Box.Wrap(e).data.inner.reason`",
  "s11/3 ctor extract match eq": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `.Wrap(i) :> i == \"bad\"`",
  "s11/3 ctor local alias data": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `const b = Box.Wrap(e)` then `b.data.inner.reason`",
  "s11/3 ctor via typed fn": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `wr(x: AuthErr) { return Box.Wrap(x) }` then `.data.inner.reason`",
  "f9/3 ctor data member": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `Box.Wrap(e).data.inner.reason`",
  "f9/3 ctor local alias data": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `const b = Box.Wrap(e)` then `b.data.inner.reason`",
  "f9/3 ctor via typed fn": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `wr(x: AuthErr) { return Box.Wrap(x) }` then `.data.inner.reason`",
  "l6/3 ctor data member": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `Box.Wrap(e).data.inner.reason`",
  "l6/3 ctor local alias data": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `const b = Box.Wrap(e)` then `b.data.inner.reason`",
  "l6/3 ctor via typed fn": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `wr(x: AuthErr) { return Box.Wrap(x) }` then `.data.inner.reason`",
  "t6/3 ctor extract match": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `match Box.Wrap(e) { .Wrap(i) :> i.reason … }`",
  "t6/3 ctor extract dot ctor": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `.Wrap(e)` then `.Wrap(i) :> i.reason`",
  "t6/3 ctor data member": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `Box.Wrap(e).data.inner.reason`",
  "t6/3 ctor extract match eq": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `.Wrap(i) :> i == \"bad\"`",
  "t6/3 ctor local alias data": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `const b = Box.Wrap(e)` then `b.data.inner.reason`",
  "t6/3 ctor via typed fn": "g-impl1-whole-error-binder-allowlist-escapes-s469 (escape 3): `wr(x: AuthErr) { return Box.Wrap(x) }` then `.data.inner.reason`",

  // S469 s469-lift-gate-staleness: EMPTY again. The 36 n23 entries of round 5 (a cell read inside a called
  // function; the value-indexed row side; a body local in a keyed row) owed to
  // g-lift-gate-placement-inherits-main-staleness-s469 are fixed: a lifted gate re-evaluates by re-running the
  // code that produced what it reads, under the runtime's read tracking (emit-lift.js emitLiftGate).
};

// Shapes this instrument CANNOT judge: client pages with no #wrong button (a client function calling
// a SERVER `check`; the decision needs the server half run). Listed so the hole is named.
export const UNJUDGED = {
  // S469 r3 — the producer module imports the enum from a types-only module; its server bundle imports
  // a `types.server.js` the compiler never writes, so the bundle cannot load and the shape never runs.
  // Judged UNJUDGED (pack.js `loadFailure`), not pinned as PASS-500 — that would pin the emission bug.
  "s5/producer imports the enum: return match, positional": "g-server-js-imports-module-without-server-file-s467",
  "s5/producer imports the enum: return match, named": "g-server-js-imports-module-without-server-file-s467",
  "s5/producer imports the enum: !{}, positional": "g-server-js-imports-module-without-server-file-s467",
  "f2/producer imports the enum: return match, positional": "g-server-js-imports-module-without-server-file-s467",
  "f2/producer imports the enum: return match, named": "g-server-js-imports-module-without-server-file-s467",
  "f2/producer imports the enum: !{}, positional": "g-server-js-imports-module-without-server-file-s467",

  // S469 r6 — r7-shapes.js cross-file `match e` shapes whose emitted bundle / module cannot load (the
  // emission bugs named): judged UNJUDGED (pack.js `loadFailure`), never counted as a pass. The same
  // shapes run (and PASS) where the bundle loads: s10 / f7 / t5 "B imported enum …".
  "s10/B imported from a third file enum + local same-name, match e": "g-server-js-imports-module-without-server-file-s467",
  "s10/B imported from a third file enum, no local enum, match e": "g-server-js-imports-module-without-server-file-s467",
  "f7/B imported from a third file enum + local same-name, match e": "g-server-js-imports-module-without-server-file-s467",
  "f7/B imported from a third file enum, no local enum, match e": "g-server-js-imports-module-without-server-file-s467",
  "l5/B imported enum + local same-name, match e": "g-library-tool-cross-file-import-source-path-s469",
  "l5/B imported enum, no local enum, match e": "g-library-tool-cross-file-import-source-path-s469",
  "l5/B imported from a third file enum + local same-name, match e": "g-library-tool-cross-file-import-source-path-s469",
  "l5/B imported from a third file enum, no local enum, match e": "g-library-tool-cross-file-import-source-path-s469",
  "t5/B imported from a third file enum + local same-name, match e": "g-library-tool-cross-file-import-source-path-s469",
  "t5/B imported from a third file enum, no local enum, match e": "g-library-tool-cross-file-import-source-path-s469",

  "n6/cli->srv expr direct": "no #wrong button: client -> server call, needs the server half",
  "n6/cli->srv stmt direct": "no #wrong button: client -> server call, needs the server half",
};

// Shapes whose OWN logic logs in on the wrong password (the reviewer wrote them to probe acceptance,
// not the floor): `p != "" || check(p)` is truthy before `check` runs; `!(match …)` inverts; an
// `.Ok(v)` arm on `p == "wrong" || …` binds `true`. Today each is refused (E-ERROR-002); a compiler that
// correctly ACCEPTS one would show it LOGGED IN, which is right, so the floor is not asserted for them.
export const BY_DESIGN_LOGS_IN = {
  "n2/expr || truthy left": "`p != \"\" || check(p)` is true for any non-empty password",
  "n2/expr ! not": "`!(match …)` inverts the verdict",
  "n2/expr Ok binds left value": "`.Ok(v)` on `p == \"wrong\" || check(p)` binds `true` for \"wrong\"",
};
