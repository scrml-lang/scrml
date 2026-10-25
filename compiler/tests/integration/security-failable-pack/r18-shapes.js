// S470 s470-nested-handler-await — one shape list on every side (server `s21`, fullstack `f24`,
// library `l16`, tool `t16`).
//
// A `!{ }` handler ARM is code that runs in the enclosing host. impl#1 lowered a client arm body in an
// EMPTY expression context (emit-logic `emitArmBody`: `_makeExprCtx({})`, `rewriteBlockBody`, a nested
// guard re-parsed with `{ boundary: "client" }`), so a waiting call written in the arm — a nested
// handled call, a bare server call, a ternary on one, an async helper, a block of several statements —
// was emitted with no `await`. The arm then tested (or yielded) a pending Promise, always truthy, and a
// wrong password logged in: `check(p) !{ _ :> check("x") !{ _ :> false } }` (review F2, lane C).
//
// SPEC §13.8 "The rule": a waiting value may stand only at a suspension point of an action position,
// where it is awaited; impl#1 refuses with E-IMPL1-ACTION-NOT-AWAITED where it has no async host.
//
// Every shape's OUTER handled call fails on the wrong password (so the arm runs) and succeeds on the
// right one. The arm reaches a waiting function with the same password, so an awaited arm answers
// "rejected" and an un-awaited one answers LOGGED IN (FAIL).
//
// The outer callee is either ASYNC (`check`: a server function on the server / fullstack sides; a `!`
// function that awaits `scrml:crypto` `hmac` on the library / tool sides) or SYNC (`local`, a plain `!`
// function) — with a sync outer callee nothing but the arm waits, so the host is async only because of
// the arm.
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const SRV = (side) => side === "server" || side === "fullstack";

const DECLS = (side) => SRV(side)
  ? `type AuthErr:enum = { Denied(reason: string), Gone }
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    server function isOk(p) { return p == "secret" }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function allowed(p) { return isOk(p) }`
  : `type AuthErr:enum = { Denied(reason: string), Gone }
    function check(p)! -> AuthErr {
        const h = hmac("k", p)
        if (p != "secret" || h == "") fail AuthErr::Denied("bad")
        return true
    }
    function isOk(p) {
        const h = hmac("k", p)
        return p == "secret" && h != ""
    }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function allowed(p) { return isOk(p) }`;
const IMPORTS = (side) => SRV(side) ? "" : `import { hmac } from "scrml:crypto"\n`;

// The arm patterns. A variant arm needs a catch-all beside it (the failure set of a server call also
// holds `Transport`).
const PATS = [
  ["_", (arm) => `_ :> ${arm}`],
  ["_ e", (arm) => `_ e :> ${arm}`],
  [".Denied(r)", (arm) => `.Denied(r) :> ${arm}, _ :> false`],
];

// VALUE arms — the handler's value is bound (`const v = OUTER(x) !{ … }`). `X` is the password.
const VALUE_ARMS = [
  ["nested handler", (x) => `check(${x}) !{ _ :> false }`],
  ["bare server call", (x) => `isOk(${x})`],
  ["ternary on a server call", (x) => `isOk(${x}) ? true : false`],
  ["async helper", (x) => `allowed(${x})`],
  ["block arm, several statements", (x) => `{
            const got = isOk(${x})
            const same = got
            lift same
        }`],
  ["block arm, nested handler", (x) => `{
            const got = check(${x}) !{ _ :> false }
            lift got
        }`],
];

// STATEMENT arms — the handled call is a statement; the arm writes `ok` (which starts true, so the right
// password, whose arm does not run, logs in).
const STMT_ARMS = [
  ["writes a server call", (x) => `{ ok = isOk(${x}) }`],
  ["if condition on a server call", (x) => `{
            if (isOk(${x})) { ok = true } else { ok = false }
        }`],
  ["nested handler statement", (x) => `{
            check(${x}) !{ _ :> { ok = false } }
        }`],
  ["several statements", (x) => `{
            const a = isOk(${x})
            const b = a
            ok = b
        }`],
  ["writes an async helper", (x) => `{ ok = allowed(${x}) }`],
];

// RETURN arms (function hosts only) — the arm leaves with the answer.
const RETURN_ARMS = [
  ["returns a ternary on a server call", (x) => `return isOk(${x}) ? "LOGGED IN" : "rejected"`],
  ["block returns on a server call", (x) => `{
            if (isOk(${x})) { return "LOGGED IN" }
            return "rejected"
        }`],
];

// The body that turns the arm into an answer, for a function host (returns the answer).
function fnBodies(outer, x) {
  const out = [];
  for (const [pn, pat] of PATS) {
    for (const [an, arm] of VALUE_ARMS) {
      out.push([`${outer} outer, ${pn} arm, ${an}`, `const v = ${outer}(${x}) !{ ${pat(arm(x))} }
        return v ? "LOGGED IN" : "rejected"`]);
    }
    for (const [an, arm] of STMT_ARMS) {
      out.push([`${outer} outer, ${pn} arm, ${an}`, `let ok = true
        ${outer}(${x}) !{ ${pat(arm(x)).replace(", _ :> false", ", _ :> { ok = false }")} }
        return ok ? "LOGGED IN" : "rejected"`]);
    }
    for (const [an, arm] of RETURN_ARMS) {
      out.push([`${outer} outer, ${pn} arm, ${an}`, `const v = ${outer}(${x}) !{ ${pat(arm(x)).replace(", _ :> false", ", _ :> return \"rejected\"")} }
        return "LOGGED IN"`]);
    }
  }
  return out;
}

// The body for a CELL host (writes `@msg`): value and statement arms, the `_` and variant patterns.
function cellBodies(outer, x) {
  const out = [];
  for (const [pn, pat] of [PATS[0], PATS[2]]) {
    for (const [an, arm] of VALUE_ARMS) {
      out.push([`${outer} outer, ${pn} arm, ${an}`, `const v = ${outer}(${x}) !{ ${pat(arm(x))} }
        @msg = v ? "LOGGED IN" : "rejected"`]);
    }
    for (const [an, arm] of STMT_ARMS) {
      out.push([`${outer} outer, ${pn} arm, ${an}`, `let ok = true
        ${outer}(${x}) !{ ${pat(arm(x)).replace(", _ :> false", ", _ :> { ok = false }")} }
        @msg = ok ? "LOGGED IN" : "rejected"`]);
    }
  }
  return out;
}

function fnPage(side, body) {
  const d = DECLS(side);
  if (side === "library") return `${IMPORTS(side)}
\${
    ${d}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
${IMPORTS(side)}
\${
    ${d}
    function login(p) {
        ${body}
    }
    function main(args) {
        log(login(args[0]))
    }
}
</program>
`;
  if (side === "server") return `<msg> = "init"
\${
    ${d}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "rejected" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
  return `<msg> = "init"
\${
    ${d}
    function login(p) {
        ${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
}

// Fullstack: a page whose HOST (not a function) runs the handled call on `@pw`.
function hostPage(logic, fns = "", extraTypes = "") {
  return `type Phase:enum = { Idle, Active }
${extraTypes}<pw> = ""
<msg> = "rejected"
\${
    ${DECLS("fullstack")}
    function login(p) { @pw = p${fns} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
<p id="out">\${@msg}</p>
`;
}

// Fullstack: the handled call written in the event handler itself.
function handlerPage(bodyOf) {
  return `<msg> = "init"
\${
    ${DECLS("fullstack")}
}
<button id="wrong" onclick={
        ${bodyOf(`"wrong"`)}
    }>go</button>
<button id="right" onclick={
        ${bodyOf(`"secret"`)}
    }>go</button>
<p id="out">\${@msg}</p>
`;
}

const HOSTS = [
  ["when body", (b) => hostPage(`\${ when @pw changes {
        ${b}
    } }`)],
  ["timer body", (b) => hostPage(`<timer interval=1>\${
        ${b}
    }</timer>`)],
  ["request body", (b) => hostPage(`<request id="r" deps=[@pw]>\${
        ${b}
    }</>`)],
  ["module init", (b) => hostPage(`\${
        ${b}
    }`)],
  ["engine state effect=", (b) => hostPage(`<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active effect=\${
        ${b}
    }/>
</>`, "; @phase = .Active")],
  ["engine opener effect=", (b) => hostPage(`<engine for=Phase initial=.Idle effect=\${
        ${b}
    }>
  <Idle rule=.Active/>
  <Active/>
</>`)],
  ["engine onTransition body", (b) => hostPage(`<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active/>
  <onTransition from=.Idle to=.Active>\${
        ${b}
    }</onTransition>
</>`, "; @phase = .Active")],
  ["runtime meta", (b) => hostPage(`^{
        ${b}
    }`)],
];

// Render / derived positions: the handled call's VALUE is read while rendering — a waiting arm there
// is E-VALUE-SERVER-CALL.
function renderShapes() {
  const out = [];
  for (const outer of ["check", "local"]) {
    for (const [an, arm] of VALUE_ARMS.slice(0, 4)) {
      out.push([`render if= gate: ${outer} outer, _ arm, ${an}`, `<pw> = ""
\${
    ${DECLS("fullstack")}
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out"><span if=\${ ${outer}(@pw) !{ _ :> ${arm("@pw")} } }>LOGGED IN</span></p>
`]);
      out.push([`derived cell: ${outer} outer, _ arm, ${an}`, `<pw> = ""
\${
    ${DECLS("fullstack")}
    function login(p) { @pw = p }
}
const <ok> = ${outer}(@pw) !{ _ :> ${arm("@pw")} }
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out"><span if=\${@ok}>LOGGED IN</span></p>
`]);
    }
  }
  return out;
}

export function shapesFor(side) {
  const out = [];
  for (const outer of ["check", "local"]) {
    for (const [name, body] of fnBodies(outer, "p")) {
      out.push([`function body: ${name}`, fnPage(side, body), undefined]);
    }
  }
  // VALID controls: a sync arm; a handled call already awaited at the top level whose arm waits on nothing.
  out.push(["VALID function body: check outer, sync arm", fnPage(side, `const v = check(p) !{ _ :> false }
        return v ? "LOGGED IN" : "rejected"`), undefined]);
  out.push(["VALID function body: local outer, sync arm", fnPage(side, `const v = local(p) !{ _ :> p == "secret" }
        return v ? "LOGGED IN" : "rejected"`), undefined]);
  out.push(["VALID function body: awaited top-level call, then a handled one", fnPage(side, `const a = isOk(p)
        const v = local(p) !{ _ :> a }
        return v ? "LOGGED IN" : "rejected"`), undefined]);
  if (side === "fullstack") {
    for (const outer of ["check", "local"]) {
      for (const [name, body] of cellBodies(outer, "@pw")) {
        for (const [hn, host] of HOSTS) out.push([`${hn}: ${name}`, host(body), undefined]);
      }
      for (const [name] of cellBodies(outer, "X")) {
        out.push([`event handler: ${name}`, handlerPage((x) => cellBodies(outer, x).find(([n]) => n === name)[1]), undefined]);
      }
    }
    for (const s of renderShapes()) out.push([...s, undefined]);
    out.push(["VALID event handler: check outer, sync arm", handlerPage((x) => `const v = check(${x}) !{ _ :> false }
        @msg = v ? "LOGGED IN" : "rejected"`), undefined]);
  }
  for (const s of exprShapes(side)) out.push(s);
  return out;
}

// ── fix round 1 (review of bc905b009) ──────────────────────────────────────────────────────────
// F1 / F2 — the handler in EXPRESSION position (an operand, an argument, a `return` operand, an
// `if` condition, `&&`, `!!`, an object / array literal, beside an awaited `const` that the
// scheduler batches into `Promise.all`). The expression parser carries such a handler as a
// placeholder call whose arms are a string, so the colouring did not see an arm's waiting call:
// with a SYNC outer callee the enclosing function stayed sync and the arm yielded a pending
// Promise. F3 — a `lift` that is not a value-position block arm's TAIL stays refused.
const EXPR_ARMS = [
  ["server call", (x) => `_ :> isOk(${x})`],
  ["async helper", (x) => `_ :> allowed(${x})`],
  ["nested handler", (x) => `_ :> check(${x}) !{ _ :> false }`],
  ["block lift of a bound call", (x) => `_ :> { const got = isOk(${x})
            lift got }`],
  ["block lift of the call", (x) => `_ :> { lift isOk(${x}) }`],
  ["_ e arm", (x) => `_ e :> isOk(${x})`],
  [".Denied(r) arm", (x) => `.Denied(r) :> isOk(${x}), _ :> false`],
];
const EXPR_POS = [
  ["ternary operand", (g) => `const v = (${g}) ? true : false
        return v ? "LOGGED IN" : "rejected"`],
  ["call argument", (g) => `return decide(${g})`],
  ["return operand", (g) => `return (${g}) ? "LOGGED IN" : "rejected"`],
  ["if condition", (g) => `if (${g}) { return "LOGGED IN" }
        return "rejected"`],
  ["&& operand", (g) => `const v = true && (${g})
        return v ? "LOGGED IN" : "rejected"`],
  ["!! operand", (g) => `const v = !!(${g})
        return v ? "LOGGED IN" : "rejected"`],
  ["object literal", (g) => `const o = { a: ${g} }
        return o.a ? "LOGGED IN" : "rejected"`],
  ["array literal", (g) => `const o = [${g}]
        return o[0] ? "LOGGED IN" : "rejected"`],
  ["beside an awaited const (Promise.all batch)", (g) => `const z = isOk("q")
        const v = (${g}) ? true : false
        return v ? "LOGGED IN" : "rejected"`],
];
const DECIDE = `function decide(v) { return v ? "LOGGED IN" : "rejected" }`;

function exprShapes(side) {
  const out = [];
  // `decide` is declared before the shared declarations (the `login` opener differs per side).
  const page = (body) => fnPage(side, body).replace("type AuthErr:enum", `${DECIDE}\n    type AuthErr:enum`);
  for (const outer of ["local", "check"]) {
    for (const [pn, pos] of EXPR_POS) {
      for (const [an, arm] of EXPR_ARMS) {
        out.push([`expr position: ${outer} outer, ${pn}, ${an}`, page(pos(`${outer}(p) !{ ${arm("p")} }`)), undefined]);
      }
    }
  }
  out.push(["VALID expr position: local outer, ternary operand, sync arm", page(EXPR_POS[0][1](`local(p) !{ _ :> false }`)), undefined]);
  out.push(["VALID expr position: check outer, call argument, sync arm", page(EXPR_POS[1][1](`check(p) !{ _ :> false }`)), undefined]);
  // F3 — refused: a `lift` nested in an `if` beside the tail `lift` (two on a path), and a `lift`
  // in a STATEMENT-position block arm (it yields to nothing, §18.5).
  out.push(["F3 refused: value block arm with a nested lift beside the tail", page(`const v = local(p) !{ _ :> {
            if (p == "x") {
                lift true
            }
            lift false
        } }
        return v ? "LOGGED IN" : "rejected"`), undefined]);
  out.push(["F3 refused: statement block arm holding a lift (async arm)", page(`let okv = true
        local(p) !{ _ :> { okv = isOk(p)
            lift "x" } }
        return okv ? "LOGGED IN" : "rejected"`), undefined]);
  if (side === "fullstack") {
    // Hosts that cannot be made async around an expression: an event-handler block / inline value,
    // a render `if=` gate, a derived cell.
    for (const [an, arm] of EXPR_ARMS) {
      out.push([`expr position, event handler: local outer, call argument, ${an}`,
        handlerPage((x) => `@msg = decide(local(${x}) !{ ${arm(x)} })`).replace("${\n    type", `\${\n    ${DECIDE}\n    type`), undefined]);
    }
    out.push(["expr position, inline handler: local outer, ternary, server call", `<msg> = "init"
\${
    ${DECLS("fullstack")}
}
<button id="wrong" onclick=\${@msg = (local("wrong") !{ _ :> isOk("wrong") }) ? "LOGGED IN" : "rejected"}>go</button>
<button id="right" onclick=\${@msg = (local("secret") !{ _ :> isOk("secret") }) ? "LOGGED IN" : "rejected"}>go</button>
<p id="out">\${@msg}</p>
`, undefined]);
    out.push(["expr position, render if= gate: local outer, ternary, server call", `<pw> = ""
\${
    ${DECLS("fullstack")}
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out"><span if=\${ (local(@pw) !{ _ :> isOk(@pw) }) ? true : false }>LOGGED IN</span></p>
`, undefined]);
    out.push(["expr position, derived cell: local outer, ternary, server call", `<pw> = ""
\${
    ${DECLS("fullstack")}
    function login(p) { @pw = p }
}
const <ok> = (local(@pw) !{ _ :> isOk(@pw) }) ? true : false
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out"><span if=\${@ok}>LOGGED IN</span></p>
`, undefined]);
  }
  return out;
}
