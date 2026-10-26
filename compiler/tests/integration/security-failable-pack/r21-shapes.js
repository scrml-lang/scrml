// S470 s470-promise-all-batch-elements (family r21) — server `s24`, fullstack `f27`, library `l19`,
// tool `t19`. `g-promise-all-batch-puts-unawaited-call-under-sync-operator` (S441c, HIGH): in a CLIENT
// function the §13.2 parallel batch (`const [a, v] = await Promise.all([...])`, codegen/scheduling.ts
// `scheduleStatements`) used each declaration's WHOLE initializer as an array element, so a waiting call
// under an operator was never awaited: `isOk(p) ? "LOGGED IN" : "rejected"` beside an independent
// `const a = ping(1)` tested the pending Promise (truthy) and the wrong password logged in. The same under
// `!`, `&&` / `||` / `??`, a comparison, an array / object literal, a call argument, a member / index read
// off the call, an async-coloured client helper, and an expression-position `!{}` guard.
//
// Every shape is a login: `login(p)` declares an independent bare server call (`const a = ping(1)`, the
// batch seed or a later member) beside a declaration whose initializer holds `isOk(p)` (true only for
// "secret") in some position, and returns "LOGGED IN" / "rejected" from it. `(msg)` reads the result into
// `#out`; `(gate)` (fullstack) shows `LOGGED IN` behind a markup `if=` on the result cell.
//
// A BAD shape is written so the operator's RESULT is not the Promise itself: `Promise.all` resolves an
// element that IS a Promise, so `isOk(p) || false`, `true && isOk(p)`, `c ? x : isOk(p)` and an identity
// helper over the call were accidentally right on base — they are the `RESOLVED` controls below (they must
// stay right now that they are awaited in place).
//
// Only the client function body batches (`scheduleStatements` has one caller, emit-functions.ts, the
// CLIENT plain-function loop); a server function body awaits each call in place, and library / tool
// modes emit a plain function. So the BAD shapes are FAIL on base `ffbcf4432` on the fullstack side only;
// on the other sides they were measured PASS (the server side's `!{}` guard: PASS-500, `isOk is not
// defined` — a server-bundle defect of a local `!` function's arm, not this gap) and are left off (the r15
// convention) — the VALID / RESOLVED controls run on every side. A nested lambda over the call
// (`((q) => isOk(q))(p)`) is refused on base and head (E-ASYNC-FN-ESCAPES-AS-VALUE) — unit-tested only. `VALID` shapes are bare independent calls
// (and inert values) that must keep batching — the §13.2 parallelism the fix preserves; the unit test
// pins that their emitted JS is one `Promise.all`. A template literal over the call is not here: its
// function is placed on the SERVER by route inference (no client batch) — unit-tested instead.
// Data, not logic: `shapesFor(side)` returns [name, scrml source]. Do not edit a shape to make it pass.

// [name, body statements (each on its own line), value returned]
const BAD = [
  ["ternary on the call", [`const a = ping(1)`, `const v = isOk(p) ? "LOGGED IN" : "rejected"`], `v`],
  ["ternary, the call tested in the else branch", [`const a = ping(1)`, `const v = p == "zz" ? "zz" : (isOk(p) ? "LOGGED IN" : "rejected")`], `v`],
  ["not", [`const a = ping(1)`, `const v = !isOk(p)`], `v ? "rejected" : "LOGGED IN"`],
  ["not not", [`const a = ping(1)`, `const v = !!isOk(p)`], `v ? "LOGGED IN" : "rejected"`],
  ["and", [`const a = ping(1)`, `const v = isOk(p) && true`], `v ? "LOGGED IN" : "rejected"`],
  ["and, the call second under not", [`const a = ping(1)`, `const v = p != "" && !isOk(p)`], `v ? "rejected" : "LOGGED IN"`],
  ["or, negated", [`const a = ping(1)`, `const v = !(isOk(p) || false)`], `v ? "rejected" : "LOGGED IN"`],
  ["nullish, negated", [`const a = ping(1)`, `const v = !(isOk(p) ?? false)`], `v ? "rejected" : "LOGGED IN"`],
  ["comparison !=", [`const a = ping(1)`, `const v = isOk(p) != false`], `v ? "LOGGED IN" : "rejected"`],
  ["two calls under &&, negated", [`const a = ping(1)`, `const v = !(isOk(p) && isOk(p))`], `v ? "rejected" : "LOGGED IN"`],
  ["array literal", [`const a = ping(1)`, `const v = [isOk(p)]`], `v[0] ? "LOGGED IN" : "rejected"`],
  ["array literal, spread", [`const a = ping(1)`, `const v = [...[isOk(p)]]`], `v[0] ? "LOGGED IN" : "rejected"`],
  ["object literal", [`const a = ping(1)`, `const v = { ok: isOk(p) }`], `v.ok ? "LOGGED IN" : "rejected"`],
  ["object literal, nested", [`const a = ping(1)`, `const v = { r: { ok: isOk(p) } }`], `v.r.ok ? "LOGGED IN" : "rejected"`],
  ["call argument, a builtin", [`const a = ping(1)`, `const v = String(isOk(p))`], `v != "false" ? "LOGGED IN" : "rejected"`],
  ["call argument, a sync helper", [`const a = ping(1)`, `const v = flip(isOk(p))`], `v ? "rejected" : "LOGGED IN"`],
  ["call argument of a server call", [`const a = ping(1)`, `const v = ping(isOk(p))`], `v ? "LOGGED IN" : "rejected"`],
  ["member read off the call", [`const a = ping(1)`, `const v = info(p).denied`], `v ? "rejected" : "LOGGED IN"`],
  ["index read off the call", [`const a = ping(1)`, `const v = info(p)["denied"]`], `v ? "rejected" : "LOGGED IN"`],
  ["async client helper under a ternary", [`const a = ping(1)`, `const v = allowed(p) ? "LOGGED IN" : "rejected"`], `v`],
  ["async client helper under not", [`const a = ping(1)`, `const v = !allowed(p)`], `v ? "rejected" : "LOGGED IN"`],
  ["expression-position !{} guard (h2/002)", [`const a = ping(1)`, `const v = (local(p) !{ _ :> isOk(p) }) ? "LOGGED IN" : "rejected"`], `v`],
  ["the operator decl first, the bare call after", [`const v = isOk(p) ? "LOGGED IN" : "rejected"`, `const a = ping(1)`], `v`],
  ["between two bare calls", [`const a = ping(1)`, `const v = !isOk(p)`, `const b = ping(2)`], `v ? "rejected" : "LOGGED IN"`],
  ["let, under a ternary", [`const a = ping(1)`, `let v = isOk(p) ? "LOGGED IN" : "rejected"`], `v`],
  ["beside an inert member", [`const a = ping(1)`, `const k = 3`, `const v = isOk(p) ? "LOGGED IN" : "rejected"`], `v`],
];

const VALID = [
  ["VALID two bare independent calls", [`const v = isOk(p)`, `const a = ping(1)`], `v ? "LOGGED IN" : "rejected"`],
  ["VALID three bare independent calls", [`const a = ping(1)`, `const v = isOk(p)`, `const b = ping(2)`], `v ? "LOGGED IN" : "rejected"`],
  ["VALID a bare call with an operator argument", [`const a = ping(1)`, `const v = isOk(p + "")`], `v ? "LOGGED IN" : "rejected"`],
  ["VALID a bare call beside an inert member", [`const v = isOk(p)`, `const k = 3`], `v ? "LOGGED IN" : "rejected"`],
  ["VALID the operator applied after the batch", [`const a = ping(1)`, `const ok = isOk(p)`, `const v = ok ? "LOGGED IN" : "rejected"`], `v`],
  ["VALID a bare async client helper", [`const a = ping(1)`, `const v = allowed(p)`], `v ? "LOGGED IN" : "rejected"`],
  // RESOLVED — the operator's result IS the Promise, which `Promise.all` resolved (right on base by accident).
  ["RESOLVED the call in the else branch", [`const a = ping(1)`, `const v = p == "zz" ? false : isOk(p)`], `v ? "LOGGED IN" : "rejected"`],
  ["RESOLVED and, the call second", [`const a = ping(1)`, `const v = true && isOk(p)`], `v ? "LOGGED IN" : "rejected"`],
  ["RESOLVED or", [`const a = ping(1)`, `const v = isOk(p) || false`], `v ? "LOGGED IN" : "rejected"`],
  ["RESOLVED nullish", [`const a = ping(1)`, `const v = isOk(p) ?? false`], `v ? "LOGGED IN" : "rejected"`],
  ["RESOLVED an identity helper over the call", [`const a = ping(1)`, `const v = same(isOk(p))`], `v ? "LOGGED IN" : "rejected"`],
];

const DECLS = (srv) => `${srv}function isOk(p) { return p == "secret" }
    ${srv}function ping(q) { return q }
    ${srv}function info(p) { return { denied: p != "secret", granted: p == "secret" } }
    ${srv}function pair(p) { return [p != "secret", 1] }
    type AuthErr:enum = { Denied(reason: string) }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function allowed(q) { return isOk(q) }
    function same(x) { return x }
    function flip(x) { return !x }`;

// Fix round 1 (review of 03a2ef2ed, ~/.cache/scrml/review/s470-lj/p/s1-s3.mjs) — fullstack only.
//   F5: shapes the round-0 element test fixed beyond the first list (FAIL on ffbcf4432, PASS after): `new`,
//       a spread argument, a parenthesized / ternary callee, an optional call, `in` + member reads, an
//       imported async helper under `!`.
//   F2: an inert MAP read in the batch — a member element was re-emitted under a bare `{ mode: "client" }`
//       context, so `@deny[p]` on a map cell read as a plain index -> undefined and the deny-list missed
//       (FAIL on ffbcf4432 and on round 0 03a2ef2ed). The element is now the statement's own emission.
//   F4: a destructuring decl beside a batch seed (E-CODEGEN-INVALID-LOGIC on ffbcf4432; now a batch
//       boundary, emitted in place — VALID).
const DENY = `\${ <deny>: [string:bool] = ["wrong": true] }\n`;
const LIB = `\${
    export server function isOk2(p) { return p == "secret" }
    export function allowedX(q) { return isOk2(q) }
}
`;
const ROUND1 = [
  ["F5 new over the call", [`const a = ping(1)`, `const v = new Boolean(isOk(p)).valueOf()`], `v ? "LOGGED IN" : "rejected"`],
  ["F5 spread argument", [`const a = ping(1)`, `const v = flip(...[isOk(p)])`], `v ? "rejected" : "LOGGED IN"`],
  ["F5 parenthesized callee", [`const a = ping(1)`, `const v = (flip)(isOk(p))`], `v ? "rejected" : "LOGGED IN"`],
  ["F5 ternary callee", [`const a = ping(1)`, `const v = (p == "zz" ? same : flip)(isOk(p))`], `v ? "rejected" : "LOGGED IN"`],
  ["F5 optional call", [`const a = ping(1)`, `const v = flip?.(isOk(p))`], `v ? "rejected" : "LOGGED IN"`],
  ["F5 in and a member read", [`const a = ping(1)`, `const v = "denied" in info(p) && info(p).denied`], `v ? "rejected" : "LOGGED IN"`],
  ["F5 imported async helper under not", [`const a = ping(1)`, `const v = !allowedX(p)`], `v ? "rejected" : "LOGGED IN"`, { imp: `import { allowedX } from "./lib.scrml"\n    `, extra: { "lib.scrml": LIB } }],
  ["F2 inert map index in the batch", [`const a = ping(1)`, `const d = @deny[p]`], `d == true ? "rejected" : "LOGGED IN"`, { cell: DENY }],
  ["F2 map index as a bare call's argument", [`const a = ping(1)`, `const d = flip(@deny[p])`], `d ? "LOGGED IN" : "rejected"`, { cell: DENY }],
  ["F4 VALID destructure an object beside a seed", [`const a = ping(1)`, `const { denied } = info(p)`], `denied ? "rejected" : "LOGGED IN"`],
  ["F4 VALID destructure an array beside a seed", [`const a = ping(1)`, `const [d, n] = pair(p)`], `d ? "rejected" : "LOGGED IN"`],
];

function page(side, stmts, ret, view, o = {}) {
  const body = [...stmts, `return ${ret}`].join("\n        ");
  if (side === "library") return `\${\n    ${DECLS("")}\n    export function login(p) {\n        ${body}\n    }\n}\n`;
  if (side === "tool") return `<program kind="tool">\n\${\n    ${DECLS("")}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
  if (side === "server") return `<msg> = "init"\n\${\n    ${DECLS("server ")}\n    server function login(p) {\n        ${body}\n    }\n    function go() { @msg = login("wrong") !{ _ :> "err" } }\n}\n<button onclick=go()>go</button>\n<p>\${@msg}</p>\n`;
  const out = view === "gate" ? `<p id="out"><span if=\${@msg == "LOGGED IN"}>LOGGED IN</span></p>` : `<p id="out">\${@msg}</p>`;
  return `<msg> = "init"\n${o.cell ?? ""}\${\n    ${o.imp ?? ""}${DECLS("server ")}\n    function login(p) {\n        ${body}\n    }\n    function go(p) { @msg = login(p) }\n}\n<button id="wrong" onclick=go("wrong")>go</button>\n<button id="right" onclick=go("secret")>go</button>\n${out}\n`;
}

export function shapesFor(side) {
  const out = [];
  const views = side === "fullstack" ? ["msg", "gate"] : ["msg"];
  for (const view of views) {
    const tag = side === "fullstack" ? ` (${view})` : "";
    // BAD shapes only where a client batch exists (fullstack); measured PASS elsewhere on base.
    if (side === "fullstack") for (const [n, stmts, ret] of BAD) out.push([`${n}${tag}`, page(side, stmts, ret, view)]);
    for (const [n, stmts, ret] of VALID) out.push([`${n}${tag}`, page(side, stmts, ret, view)]);
    if (side === "fullstack") for (const [n, stmts, ret, o] of ROUND1) out.push([`${n}${tag}`, page(side, stmts, ret, view, o ?? {}), o?.extra]);
  }
  return out;
}
