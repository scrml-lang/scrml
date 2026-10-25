// S470 s470-render-residue-host-promises — the host `fetch` (SPEC §13.7 item 4 / §13.8 item 3: a
// Promise-returning standard-library function, so a waiting value) and the waiting-function value
// uses around it. Side `fullstack` (`f25`): the page's `fetch` is answered in-process by the compiled
// server, so it resolves to a real Response (a 404 for these paths) — and a pending Promise is truthy.
//
// Families of BAD shapes (each answered LOGGED IN on a wrong password on 618bb573b):
//   F1  a helper that reaches the host `fetch` through the global object (`globalThis.fetch(…)`,
//       `window.fetch(…)`, a `function fetch` wrapper) — not coloured async, so a render gate opened;
//   F2  `fetch` used as a VALUE (an alias, a destructure, `globalThis["fetch"]`, a tape element, an
//       object member, a returned function, an argument, a `const` lambda helper);
//   F3  a binding that IS the host `fetch` (`const fetch = globalThis.fetch`, `.bind`), or a
//       block-scoped `const fetch` that turned the host rule off file-wide;
//   F4  a waiting function passed as a CALLBACK value in a render position or a sync body
//       (`@xs.some(isOkW)`, `@xs.map(fetch)[0]`) — `.some` of Promises is true;
//   F5  `fetch` in a function body / handler / `on mount` / `when` body / server function was never
//       awaited (§13.2). These shapes read `.status` (an un-awaited Promise's is `undefined`, so
//       `!= 404` passed for every password); awaited, the 404 answers "rejected".
// VALID controls must keep compiling (the author's own `function fetch`, a local / parameter named
// `fetch`, `typeof fetch`, a fire-and-forget `fetch`, a server-call twin).
// Plus `G0` — the first-round shapes (family f16 on 618bb573b's branch): the host `fetch` in a render
// position or a sync action body, and markup held as a value whose attribute `${…}` was read as `$`.
// Data, not logic: `shapesFor(side)` returns [name, scrml source]. Do not edit a shape to make it pass.

import G0 from "./r19-g0-shapes.js";

const P = (logic, view, fns = "", loginBody = "@pw = p") => `type Phase:enum = { Idle, Active }
<pw> = ""
<ok> = false
<msg> = "rejected"
<code> = 0
<xs> = [1, 2]
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { ${loginBody} }
${fns}
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
${view}
`;
const U = `"/api/check?p=" + @pw`;
const GATE = (v) => `<p id="out"><span if=\${${v}}>LOGGED IN</span></p>`;
const OUT = `<p id="out">\${@msg}</p>`;
const TIMER = (body) => P(`<timer interval=1>\${ ${body} }</timer>`, OUT);
const STATUS = (callExpr) => `@pw = p\n        const r = ${callExpr}\n        if (r.status != 404) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const URLP = `p == "secret" ? "/" : "/nope"`;

const FULLSTACK = [
  // F1 — reach through the global object
  ["F1 render if= helper calls globalThis.fetch", P("", GATE(`probe(@pw)`), `    function probe(q) { return globalThis.fetch("/api/check?p=" + q) }`)],
  ["F1 render if= helper calls window.fetch", P("", GATE(`probe(@pw)`), `    function probe(q) { return window.fetch("/api/check?p=" + q) }`)],
  ["F1 render if= wrapper function fetch calls globalThis.fetch", P("", GATE(`fetch(${U})`), `    function fetch(u) { return globalThis.fetch(u) }`)],
  // F2 — value uses
  ["F2 render alias const f = fetch", P("", GATE(`f(${U})`), `    const f = fetch`)],
  ["F2 render alias let f = fetch", P("", GATE(`f(${U})`), `    let f = fetch`)],
  ["F2 render destructure { fetch: g } = globalThis", P("", GATE(`g(${U})`), `    const { fetch: g } = globalThis`)],
  ["F2 render globalThis[\"fetch\"]", P("", GATE(`globalThis["fetch"](${U})`))],
  ["F2 render window[\"fetch\"]", P("", GATE(`window["fetch"](${U})`))],
  ["F2 render globalThis.window.fetch", P("", GATE(`globalThis.window.fetch(${U})`))],
  ["F2 render window.self.fetch", P("", GATE(`window.self.fetch(${U})`))],
  ["F2 render document.defaultView.fetch", P("", GATE(`document.defaultView.fetch(${U})`))],
  ["F2 render tape element [fetch][0]", P("", GATE(`[fetch][0](${U})`))],
  ["F2 render object member { f: fetch }.f", P("", GATE(`({ f: fetch }).f(${U})`))],
  ["F2 render helper returns fetch", P("", GATE(`getF()(${U})`), `    function getF() { return fetch }`)],
  ["F2 render fetch passed as an argument", P("", GATE(`call(fetch, ${U})`), `    function call(f, x) { return f(x) }`)],
  ["F2 render const lambda helper over fetch", P("", GATE(`probe(@pw)`), `    const probe = (q) => fetch("/api/check?p=" + q)`)],
  ["F2 render derived cell over an alias", P(`\${ const <got> = f(${U}) }`, GATE("@got"), `    const f = fetch`)],
  ["F2 timer alias", TIMER(`const f = fetch\nif (f(${U})) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
  ["F2 timer globalThis[\"fetch\"]", TIMER(`if (globalThis["fetch"](${U})) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
  // F3 — a binding that IS the host fetch; a block-scoped binding
  ["F3 module const fetch = globalThis.fetch", P("", GATE(`fetch(${U})`), `    const fetch = globalThis.fetch`)],
  ["F3 module const fetch = window.fetch.bind(window)", P("", GATE(`fetch(${U})`), `    const fetch = window.fetch.bind(window)`)],
  ["F3 block-scoped const fetch in an if, render uses the host", P(`\${ if (true) { const fetch = 1 } }`, GATE(`fetch(${U})`))],
  ["F3 block-scoped const fetch in a for body, render uses the host", P(`\${ for (let i = 0; i < 1; i++) { const fetch = 1 } }`, GATE(`fetch(${U})`))],
  ["F3 helper over a module real-fetch alias", P("", GATE(`probe(@pw)`), `    const fetch = globalThis.fetch\n    function probe(q) { return fetch("/api/check?p=" + q) }`)],
  ["F3 timer local fetch = globalThis.fetch", TIMER(`const fetch = globalThis.fetch\nif (fetch(${U})) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
  ["F3 render lambda parameter given the real fetch", P("", GATE(`((fetch) => fetch(${U}))(globalThis.fetch)`))],
  // F4 — a waiting function as a callback value
  ["F4 render xs.some(server helper)", P("", GATE(`@xs.some(isOkW)`), `    function isOkW(x) { return isOk(@pw) }`)],
  ["F4 render xs.map(fetch)[0]", P("", GATE(`@xs.map(fetch)[0]`), ``, `@pw = p\n        @xs = ["/api/check?p=" + p]`)],
  ["F4 render xs.some(fetch)", P("", GATE(`@xs.some(fetch)`), ``, `@pw = p\n        @xs = ["/api/check?p=" + p]`)],
  ["F4 render xs.some(fetch helper)", P("", GATE(`@xs.some(probe)`), `    function probe(q) { return fetch("/api/check?p=" + @pw) }`)],
  ["F4 timer xs.some(fetch helper)", P(`<timer interval=1>\${ if (@xs.some(probe)) { @msg = "LOGGED IN" } else { @msg = "rejected" } }</timer>`, OUT, `    function probe(q) { return fetch("/api/check?p=" + @pw) }`)],
  ["F4 render server function passed to a lambda", P("", GATE(`((g) => g(@pw))(isOk)`))],
  // F5 — awaited where an async host exists
  ["F5 function body tests fetch status", P("", OUT, "", STATUS(`fetch(${URLP})`))],
  ["F5 function body tests a fetch helper's status", P("", OUT, `    function probe(q) { return fetch(q == "secret" ? "/" : "/nope") }`, STATUS(`probe(p)`))],
  ["F5 function body inline fetch status", P("", OUT, "", `@pw = p\n        if (fetch(${URLP}).status != 404) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
  ["F5 function body globalThis.fetch status", P("", OUT, "", STATUS(`globalThis.fetch(${URLP})`))],
  ["F5 function body writes fetch status to a cell", P("", `<p id="out"><span if=\${@code != 404 && @code != 0}>LOGGED IN</span></p>`, "", `@pw = p\n        const r = fetch(${URLP})\n        @code = r.status`)],
  ["F5 on mount tests fetch status", P(`\${ on mount { const r = fetch("/nope")\n if (r.status != 404) { @msg = "LOGGED IN" } } }`, OUT)],
  ["F5 when body tests fetch status", P(`\${ when @pw changes { const r = fetch(@pw == "secret" ? "/" : "/nope")\n if (r.status != 404) { @msg = "LOGGED IN" } else { @msg = "rejected" } } }`, OUT)],
  ["F5 server function tests fetch status", P("", OUT, `    server function chk(p) { const r = fetch("http://127.0.0.1:1/nope")\n        return r.status != 404 }`, `@pw = p\n        if (chk(p)) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
  // VALID controls
  ["VALID the author's own sync function named fetch", P("", GATE(`fetch(@pw)`), `    function fetch(u) { return u == "secret" }`)],
  ["VALID a timer-body local named fetch", TIMER(`const fetch = (u) => u == "secret"\nif (fetch(@pw)) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
  ["VALID a lambda parameter named fetch", P("", GATE(`((fetch) => fetch == 1)(@pw == "secret" ? 1 : 0)`))],
  ["VALID a helper parameter named fetch", P("", GATE(`chk(@pw, (u) => u == "secret")`), `    function chk(q, fetch) { return fetch(q) }`)],
  ["VALID typeof fetch in a render position", P("", `<p id="out">\${ typeof fetch == "function" && @pw == "secret" ? "LOGGED IN" : "rejected" }</p>`)],
  ["VALID fetch in an event handler", P("", OUT.replace("<p", `<button id="ping" onclick=\${() => { fetch("/api/ping") }}>p</button>\n<p`))],
  ["VALID a bare fetch statement in a when body", P(`\${ when @pw changes { fetch("/api/ping") } }`, OUT)],
  ["VALID a fetch helper called from a handler", P("", OUT, `    function ping() { return fetch("/api/ping") }`, `@pw = p\n        ping()`)],
  ["VALID a fetch helper called in on mount", P(`\${ on mount { ping() } }`, OUT, `    function ping() { return fetch("/api/ping") }`)],
  ["VALID a fetch helper called bare in a timer", P(`<timer interval=1>\${ ping() }</timer>`, OUT, `    function ping() { return fetch("/api/ping") }`)],
  ["VALID a server call tested in a handler (the twin)", P("", OUT, "", `@pw = p\n        if (isOk(p)) { @msg = "LOGGED IN" } else { @msg = "rejected" }`)],
];

export function shapesFor(side) {
  if (side === "fullstack") return [...G0.map(([n, src]) => [`G0 ${n}`, src]), ...FULLSTACK];
  return [];
}
