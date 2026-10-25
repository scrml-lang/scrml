// Probe family `f15` — S470 s470-render-residue-host-promises (SIDE `fullstack`: the page's `fetch` is
// answered in-process by the compiled server, so a `fetch` resolves to a real 404 Response — its Promise
// is still pending, and truthy, when the gate reads it).
//
// (a) The host `fetch` — SPEC §13.7 item 4 / §13.8 item 3 name it a waiting value — written in a render
//     position (E-VALUE-SERVER-CALL) or in an action body impl#1 lowers synchronously
//     (E-IMPL1-ACTION-NOT-AWAITED), directly, through `globalThis.` / `window.`, or through a file
//     function that reaches it (§13.7 item 2). The §13.2 facts did not colour it (no import declares it),
//     so each tested a pending Promise and answered LOGGED IN on a wrong password.
// (b) Markup held as a VALUE (`${ const m = <span if=${…}>…</span> }` then `${ m }`, and a ternary markup
//     value): its unquoted attribute `${…}` was read as the bare ident `$` — the server call never seen by
//     the render-position check, and the condition dropped. With a binding named `$` in scope (a
//     file-level `const`, standing in for a page's jQuery) both the server-call gate and the plain
//     `@pw == "secret"` gate opened on a wrong password.
// Each BAD shape answered LOGGED IN on a wrong password on 6081e0685. The CONTROL shapes are valid
// programs (a fetch in an event handler, in `on mount`, a bare fetch statement, the author's own
// function named `fetch`, a local named `fetch`) and must keep compiling.
// Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (logic, view, fns = "") => `type Phase:enum = { Idle, Active }
<pw> = ""
<ok> = false
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
${fns}
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
${view}
`;
const OUT = `<p id="out">\${@msg}</p>`;
const GATE = (v) => `<p id="out"><span if=\${${v}}>LOGGED IN</span></p>`;
const T = `"LOGGED IN" : "rejected"`;
const F = `fetch("/api/check?p=" + @pw)`;
const DOLLAR = "    const $ = 1";

export default [
  // (a) render positions
  ["render: if= tests fetch", P("", GATE(F))],
  ["render: interpolation ternary tests fetch", P("", `<p id="out">\${${F} ? ${T}}</p>`)],
  ["render: derived cell holds fetch", P(`\${ const <got> = ${F} }`, GATE("@got"))],
  ["render: if= tests globalThis.fetch", P("", GATE(`globalThis.fetch("/api/check?p=" + @pw)`))],
  ["render: if= tests window.fetch", P("", GATE(`window.fetch("/api/check?p=" + @pw)`))],
  ["render: if= tests a helper that returns fetch", P("", GATE("probe(@pw)"), `    function probe(q) { return fetch("/api/check?p=" + q) }`)],
  ["render: markup held in a const initializer tests fetch", P(`\${ const m = <span if=\${${F}}>LOGGED IN</span> }`, `<p id="out">\${ m }</p>`, DOLLAR)],
  // (a) synchronous action bodies
  ["action: module-init if tests fetch", P(`\${ let ok2 = false
if (${F}) { ok2 = true } }`, GATE("ok2"))],
  ["action: timer body tests fetch", P(`<timer interval=1>\${ if (${F}) { @msg = "LOGGED IN" } }</timer>`, OUT)],
  ["action: poll body tests fetch", P(`<poll interval=1000>\${ if (${F}) { @msg = "LOGGED IN" } }</poll>`, OUT)],
  ["action: request body writes a fetch ternary", P(`<request id="r" deps=[@pw]>\${ @msg = ${F} ? ${T} }</>`, OUT)],
  ["action: request body writes fetch into the gate cell", P(`<request id="r" deps=[@pw]>\${ @ok = ${F} }</>`, GATE("@ok"))],
  ["action: when body tests fetch", P(`\${ when @pw changes { if (${F}) { @msg = "LOGGED IN" } else { @msg = "rejected" } } }`, OUT)],
  ["action: engine opener effect= tests fetch", P(`<engine for=Phase initial=.Idle effect=\${ if (${F}) { @msg = "LOGGED IN" } }>
  <Idle rule=.Active/>
  <Active/>
</>`, OUT)],
  // (b) markup held as a value, a `$` binding in scope
  ["markup value: const initializer, if= over a server call", P(`\${ const m = <span if=\${isOk(@pw)}>LOGGED IN</span> }`, `<p id="out">\${ m }</p>`, DOLLAR)],
  ["markup value: const initializer, if= over a plain comparison", P(`\${ const m = <span if=\${@pw == "secret"}>LOGGED IN</span> }`, `<p id="out">\${ m }</p>`, DOLLAR)],
  ["markup value: ternary, if= over a plain comparison", P("", `<p id="out">\${ @pw != "" ? <span if=\${@pw == "secret"}>LOGGED IN</span> : "" }</p>`, DOLLAR)],
  // controls — valid programs, must keep compiling (and must not log in)
  ["control: fetch in an event handler", P("", OUT.replace("<p", `<button id="ping" onclick=\${() => { fetch("/api/ping") }}>p</button>\n<p`))],
  ["control: fetch in on mount", P(`\${ on mount { fetch("/api/ping") } }`, OUT)],
  ["control: a bare fetch statement in a timer", P(`<timer interval=1>\${ fetch("/api/ping") }</timer>`, OUT)],
  ["control: the author's own function named fetch", P("", GATE("fetch(@pw)"), `    function fetch(u) { return u == "secret" }`)],
  ["control: a timer-body local named fetch", P(`<timer interval=1>\${ const fetch = (u) => u == "secret"
if (fetch(@pw)) { @msg = "LOGGED IN" } else { @msg = "rejected" } }</timer>`, OUT)],
];
