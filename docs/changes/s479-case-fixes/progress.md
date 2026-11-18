# s479-case-fixes — progress

Lane: conformance CASE edits only (no compiler code). Governing ruling: user-voice S478 "body-top owner questions" item 3 — cases that contradict the SPEC are fixed, not the compiler.

- [x] defer/server-callee-error-total-handler(-twin) — §19.8.2; `.run() !{ _ :> fail RelError::Busy };` — twin FAIL → PASS (original stays UNSUPPORTED, defer).
- [x] error/implicit-tx-explicit-transaction-block — §19.10.5 savepoint; expect clean + `xfail.impl1-ts` (g-impl1-retired-batch-codes-still-emitted-s474 → carried); `return 1;`. `server` kept (impl#1 reads a callerless non-`server` fn as dead → vacuous).
- [x] error/transaction-top-level-neg — `;` after each `.run()` (§7.2.2 rule 1).
- [x] lifecycle/request-body-client-wrapper-rt — §19.9.10; `return loadUser(id) !{ _ :> not };` (the `?` form passes the bootstrap but impl#1 refuses it: g-impl1-request-body-bang-wrapper-refused-s479).
- [x] server-db/event-after-await-e02-dynkey-neg — `dialect.s66` asserting E-EVENT-CONTROL-AFTER-AWAIT + E-LOGIC-EXECUTABLE-SINK (§5.2 S473 rule 2).
- [x] sql/one-statement-trailing-semicolon-pos — `record()! -> SqlError`, `return 1;`, `record() !{ _ :> 0 }`.

Bootstrap conformance: PASS 645 → 651, FAIL 12 → 6; 6 FAIL → PASS, 0 PASS → FAIL.
impl#1 corpus bridge: 1872 pass, 0 fail; xfail 128 → 129 (the implicit-tx pin); no XPASS.
