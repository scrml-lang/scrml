// S470 s470-async-colouring-scope (gap g-impl1-async-colouring-ignores-local-shadow-s469) — one shape
// list on every side (server `s12`, fullstack `f15`, library `l7`, tool `t7`).
//
// Async colouring (§13.2) went by NAME: a function whose body called `check(…)` was coloured async when
// the FILE had an async `check` (a server function; on the library / tool sides a function that awaits
// a Promise-returning stdlib call), even where the call named a LOCAL binding that shadows it — a
// `const` / `let` arrow, a parameter, a nested `function`, a loop binder, a lambda parameter. The
// helper's every use then waited: a render position or a parameter default refused it, a value use
// refused it, and a library export became a Promise.
//
// Two directions, both here:
//   SHADOW  — the call names the local: the helper is SYNC (it must compile and answer correctly
//             wherever a sync function may be used);
//   DUAL    — the call names the async function (a shadow in a SIBLING scope, a use outside the
//             shadow's block, a closure, a nested function's own parameter, an alias, a reassignment):
//             the helper MUST stay async. Every DUAL helper tests the call's result itself
//             (`check(p) ? true : false`), so a helper wrongly made sync tests a pending Promise —
//             always truthy — and the wrong password logs in (FAIL).
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const ASYNC_DECLS = (side) => (side === "server" || side === "fullstack")
  ? `server function check(p) { return p == "secret" }
    server function isOk(p) { return p == "secret" }`
  : `function check(p) { const h = hmac("k", p)
        return p == "secret" && h != "" }
    function isOk(p) { const h = hmac("k", p)
        return p == "secret" && h != "" }`;
const ASYNC_IMPORTS = (side) => (side === "server" || side === "fullstack") ? "" : `import { hmac } from "scrml:crypto"\n`;

// The helper forms. `allowed(p)` answers `p == "secret"`.
const SHADOW = [
  ["const arrow", `function allowed(p) {
        const check = (x) => x == "secret"
        return check(p)
    }`],
  ["let arrow", `function allowed(p) {
        let check = (x) => x == "secret"
        return check(p)
    }`],
  ["const function expression", `function allowed(p) {
        const check = function(x) { return x == "secret" }
        return check(p)
    }`],
  ["bare-assignment local", `function allowed(p) {
        check = (x) => x == "secret"
        return check(p)
    }`],
  ["parameter", `function apply(check, p) { return check(p) }
    function allowed(p) { return apply((x) => x == "secret", p) }`],
  ["nested function declaration", `function allowed(p) {
        function check(x) { return x == "secret" }
        return check(p)
    }`],
  ["block-scoped const, called in its block", `function allowed(p) {
        if (p != "") {
            const check = (x) => x == "secret"
            return check(p)
        }
        return false
    }`],
  ["lambda parameter", `function allowed(p) {
        const run = (check) => check(p)
        return run((x) => x == "secret")
    }`],
  ["for-of binder", `function allowed(p) {
        let r = false
        for (const check of [(x) => x == "secret"]) { r = check(p) }
        return r
    }`],
  ["destructured const", `function allowed(p) {
        const { check } = { check: (x) => x == "secret" }
        return check(p)
    }`],
  ["shadow inside a nested function", `function allowed(p) {
        function inner(q) {
            const check = (x) => x == "secret"
            return check(q)
        }
        return inner(p)
    }`],
  ["return-typed helper", `function allowed(p) -> boolean {
        const check = (x) => x == "secret"
        return check(p)
    }`],
  ["fn shorthand helper", `fn allowed(p) {
        const check = (x) => x == "secret"
        return check(p)
    }`],
  ["shadow of an async peer helper", `function verify2(p) { return check(p) ? true : false }
    function allowed(p) {
        const verify2 = (x) => x == "secret"
        return verify2(p)
    }`],
  ["shadow both in nested function and caller", `function allowed(p) {
        const check = (x) => x == "secret"
        const via = (q) => check(q)
        return via(p)
    }`],
];

const DUAL = [
  ["sibling-block shadow, outer call", `function allowed(p) {
        if (p == "") {
            const check = (x) => true
            return check(p)
        }
        return check(p) ? true : false
    }`],
  ["shadow in an inner block, call after it", `function allowed(p) {
        if (p != "") {
            const check = (x) => true
            const z = check(p)
        }
        return check(p) ? true : false
    }`],
  ["call before an inner-block shadow", `function allowed(p) {
        const r = check(p) ? true : false
        if (p != "") {
            const check = (x) => true
            const z = check(p)
        }
        return r
    }`],
  ["shadow by a nested function's parameter", `function allowed(p) {
        function inner(check) { return check }
        return check(p) ? true : false
    }`],
  ["shadow by a lambda parameter", `function allowed(p) {
        const g = (check) => check
        return check(p) ? true : false
    }`],
  ["shadow in a sibling nested function", `function allowed(p) {
        function other(q) {
            const check = (x) => true
            return check(q)
        }
        return check(p) ? true : false
    }`],
  ["shadow in a sibling top-level function", `function other(q) {
        const check = (x) => true
        return check(q)
    }
    function allowed(p) { return check(p) ? true : false }`],
  ["for binder scope ends at the loop", `function allowed(p) {
        let n = 0
        for (const check of [1, 2]) { n = n + check }
        return check(p) ? true : false
    }`],
  ["destructured binder in an inner block", `function allowed(p) {
        if (p != "") {
            const { check } = { check: 1 }
            const z = check + 1
        }
        return check(p) ? true : false
    }`],
  ["call before a same-block shadow", `function allowed(p) {
        const r = check(p) ? true : false
        const check = (x) => true
        const z = check(p)
        return r
    }`],
  ["shadow initializer calls the outer name", `function allowed(p) {
        const check = check(p) ? (x) => true : (x) => false
        return check(p)
    }`],
  ["parameter receives the async function", `function apply(check, p) { return check(p) ? true : false }
    function allowed(p) { return apply(check, p) }`],
  ["parameter receives the async function under its own name", `function apply(k, p) { return k(p) ? true : false }
    function allowed(p) { return apply(isOk, p) }`],
  ["local alias of the async function", `function allowed(p) {
        const k = check
        return k(p) ? true : false
    }`],
  ["shadow holding another async function", `function allowed(p) {
        const check = isOk
        return check(p) ? true : false
    }`],
  ["shadow reassigned to the async function", `function allowed(p) {
        let k = (x) => true
        k = isOk
        return k(p) ? true : false
    }`],
  ["shadow arrow whose body calls the async function", `function allowed(p) {
        const check = (x) => isOk(x)
        return check(p) ? true : false
    }`],
  ["nested helper calls the outer async function", `function allowed(p) {
        function inner(q) { return check(q) ? true : false }
        return inner(p)
    }`],
  ["block shadow beside a template-literal call", `function allowed(p) {
        if (p == "") {
            const check = (x) => true
            return check(p)
        }
        return \`\${check(p)}\` == "true"
    }`],
  ["block shadow beside an async peer call", `function verify2(p) { return check(p) ? true : false }
    function allowed(p) {
        if (p == "") {
            const verify2 = (x) => true
            return verify2(p)
        }
        return verify2(p) ? true : false
    }`],
  ["return-typed, sibling-block shadow", `function allowed(p) -> boolean {
        if (p == "") {
            const check = (x) => true
            return check(p)
        }
        return check(p) ? true : false
    }`],
  ["closure called after an inner-block shadow", `function allowed(p) {
        const f = () => check(p)
        if (p != "") {
            const check = (x) => true
            const z = check(p)
        }
        return f() ? true : false
    }`],
];

// How `login(p)` uses `allowed(p)`: called directly (every side) and as a parameter default (a sync
// position: an async helper there is refused).
const ALL_USES = [
  ["direct", "", `return allowed(p) ? "LOGGED IN" : "rejected"`],
  ["param default", `function viaDefault(p, ok = allowed(p)) { return ok }`, `return viaDefault(p) ? "LOGGED IN" : "rejected"`],
];

function page(side, d, body, imports = "") {
  if (side === "library") return `${imports}
\${
    ${d}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
${imports}
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
  if (side === "server") return `${imports}
<msg> = "init"
\${
    ${d}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
  return `${imports}
<msg> = "init"
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

// Fullstack only: the helper read in a RENDER position (an `if=` gate, a derived cell) — an async
// helper there is refused (E-VALUE-SERVER-CALL, #1547); a sync one renders.
function renderPage(d, how) {
  const gate = how === "if="
    ? `<p id="out"><span if=\${allowed(@pw)}>LOGGED IN</span></p>`
    : `const <ok> = allowed(@pw)\n<p id="out"><span if=\${@ok}>LOGGED IN</span></p>`;
  return `<pw> = ""
\${
    ${ASYNC_DECLS("fullstack")}
    ${d}
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${gate}
`;
}

// Fullstack only: the helper read in an ACTION body (#1554): a `<request>` body (impl#1 emits it
// synchronously — an async helper there is E-IMPL1-ACTION-NOT-AWAITED; a sync one runs) and a
// `when … changes` body (an async host — the helper is awaited when async; a DUAL helper made sync there
// would test a pending Promise).
function actionPage(d, how) {
  const body = `@msg = allowed(@pw) ? "LOGGED IN" : "rejected"`;
  const host = how === "request body"
    ? `<request id="r" deps=[@pw]>\${ ${body} }</>`
    : `\${ when @pw changes { ${body} } }`;
  return `<pw> = ""
<msg> = "init"
\${
    ${ASYNC_DECLS("fullstack")}
    ${d}
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${host}
<p id="out">\${@msg}</p>
`;
}

// The async function comes from ANOTHER file (fullstack / server): imported by name, or under an alias.
const IMPORTED = {
  "h.scrml": `\${\n    export server function check(p) { return p == "secret" }\n    export server function verify(p) { return p == "secret" }\n}\n`,
};

export function shapesFor(side) {
  // The server awaits every in-process peer, so a server parameter default calling any helper is
  // refused (E-PARAM-DEFAULT-AWAIT) whatever its colour: that use measures nothing there.
  const USES = side === "server" ? ALL_USES.slice(0, 1) : ALL_USES;
  const out = [];
  const decls = (helper, pre = "") => `${ASYNC_DECLS(side)}\n    ${helper}${pre ? `\n    ${pre}` : ""}`;
  for (const [hn, helper] of SHADOW) {
    for (const [un, pre, body] of USES) {
      out.push([`shadow ${hn}, ${un}`, page(side, decls(helper, pre), body, ASYNC_IMPORTS(side)), undefined]);
    }
  }
  for (const [hn, helper] of DUAL) {
    for (const [un, pre, body] of USES) {
      out.push([`dual ${hn}, ${un}`, page(side, decls(helper, pre), body, ASYNC_IMPORTS(side)), undefined]);
    }
  }
  // VALID controls — no shadow anywhere.
  out.push(["VALID plain async helper, direct", page(side, decls(`function allowed(p) { return check(p) ? true : false }`), USES[0][2], ASYNC_IMPORTS(side)), undefined]);
  if (side !== "server") out.push(["VALID plain sync helper, param default", page(side, decls(`function allowed(p) { return p == "secret" }`, USES[1][1]), USES[1][2], ASYNC_IMPORTS(side)), undefined]);
  if (side === "server" || side === "fullstack") {
    // The outer async name is IMPORTED (by name / under an alias) and shadowed inside the helper.
    const imp = (helper, pre, body, line) => page(side, `${helper}${pre ? `\n    ${pre}` : ""}`, body, line);
    for (const [un, pre, body] of USES) {
      out.push([`shadow imported name, ${un}`, imp(SHADOW[0][1], pre, body, `import { check } from "./h.scrml"\n`), IMPORTED]);
      out.push([`shadow import alias, ${un}`, imp(SHADOW[0][1], pre, body, `import { verify as check } from "./h.scrml"\n`), IMPORTED]);
      out.push([`dual imported name, sibling-block shadow, ${un}`, imp(DUAL[0][1], pre, body, `import { check } from "./h.scrml"\n`), IMPORTED]);
      out.push([`dual import alias, sibling-block shadow, ${un}`, imp(DUAL[0][1], pre, body, `import { verify as check } from "./h.scrml"\n`), IMPORTED]);
    }
  }
  if (side === "fullstack") {
    for (const how of ["if=", "derived cell"]) {
      for (const [hn, helper] of SHADOW) out.push([`render ${how}: shadow ${hn}`, renderPage(helper, how), undefined]);
      for (const [hn, helper] of DUAL) out.push([`render ${how}: dual ${hn}`, renderPage(helper, how), undefined]);
      out.push([`render ${how}: VALID plain sync helper`, renderPage(`function allowed(p) { return p == "secret" }`, how), undefined]);
    }
    for (const [hn, helper] of SHADOW) out.push([`action request body: shadow ${hn}`, actionPage(helper, "request body"), undefined]);
    for (const how of ["request body", "when body"]) {
      for (const [hn, helper] of DUAL) out.push([`action ${how}: dual ${hn}`, actionPage(helper, how), undefined]);
      out.push([`action ${how}: VALID plain sync helper`, actionPage(`function allowed(p) { return p == "secret" }`, how), undefined]);
    }
  }
  return out;
}
