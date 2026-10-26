// S470 s470-host-fetch-followups — the host `fetch` (SPEC §13.7 item 4) in the positions the
// re-review of fcaa8b84b found un-awaited, on every side (server `s23`, fullstack `f26`, library `l18`,
// tool `t18`):
//   R1  tool mode never awaited `fetch` (the tool's own colouring had no host seed);
//   R2  library mode awaited a bare `fetch` but not `globalThis.fetch(…)`;
//   R3  a binding of the host global object (`const g = globalThis; g.fetch(u)`, `const w = window`)
//       was not read as that object, so `w.fetch(…)` was neither awaited nor refused;
//   R5  `window.frames[0].fetch(…)` (a numerically indexed host window) was not recognised — unit tests
//       only (no frame exists under happy-dom / Bun, so no shape can log in through it).
// The non-browser sides fetch a `data:` URL (no network): an AWAITED fetch is a 200 Response, so the
// shape checks the password; an UN-awaited one is a Promise whose `.status` is undefined, so the shape
// answered LOGGED IN on a wrong password. The fullstack side's fetch is answered in-process (a 404 for
// these paths): `r.status == 404` → "rejected" only when awaited.
// Every BAD shape answered LOGGED IN on a wrong password on fcaa8b84b. VALID controls keep compiling.
// Data, not logic: `shapesFor(side)` returns [name, scrml source]. Do not edit a shape to make it pass.

// The non-browser login body: `call` is the fetch expression.
const GATE200 = (call) => `const r = ${call}
        if (r.status == 200) {
            if (p == "secret") { return "LOGGED IN" }
            return "rejected"
        }
        return "LOGGED IN"`;
const D = `"data:text/plain,x"`;

function page(side, decls, body) {
  if (side === "library") return `\${
${decls}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
\${
${decls}
    function login(p) {
        ${body}
    }
    function main(args) {
        log(login(args[0]))
    }
}
</program>
`;
  // server
  return `<msg> = "init"
\${
${decls}
    server function login(p) {
        ${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
}

const NONBROWSER = (side) => {
  const out = [];
  const add = (name, decls, body) => out.push([name, page(side, decls, body)]);
  if (side === "tool") {
    add("R1 bare fetch", "", GATE200(`fetch(${D})`));
    add("R1 globalThis.fetch", "", GATE200(`globalThis.fetch(${D})`));
    add("R1 helper over fetch", `    function probe(u) { return fetch(u) }`, GATE200(`probe(${D})`));
  }
  if (side === "library") add("R2 globalThis.fetch", "", GATE200(`globalThis.fetch(${D})`));
  if (side === "library" || side === "tool") add("R2 globalThis[\"fetch\"]", "", GATE200(`globalThis["fetch"](${D})`));
  add("R3 local alias of globalThis", "", `const g = globalThis\n        ${GATE200(`g.fetch(${D})`)}`);
  add("R3 alias chain of globalThis", "", `const a = globalThis\n        const b = a\n        ${GATE200(`b.fetch(${D})`)}`);
  add("R3 alias assigned later", "", `let g = not\n        g = globalThis\n        ${GATE200(`g.fetch(${D})`)}`);
  // VALID controls
  // (the library side already awaited a bare `fetch` on fcaa8b84b; the server side is left out: a bare
  // `fetch` in a server module resolves to the module's own exported request handler — a separate gap.)
  if (side === "library") add("VALID bare fetch, awaited", "", GATE200(`fetch(${D})`));
  add("VALID an alias of globalThis never used to fetch", "", `const g = globalThis\n        if (p == "secret") { return "LOGGED IN" }\n        return "rejected"`);
  return out;
};

// Fullstack: the page's fetch answers 404 in-process.
const P = (logic, view, fns = "", loginBody = "@pw = p") => `<pw> = ""
<msg> = "rejected"
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
const OUT = `<p id="out">\${@msg}</p>`;
const GATE = (v) => `<p id="out"><span if=\${${v}}>LOGGED IN</span></p>`;
const DENY404 = (call, pre = "") => `@pw = p${pre}\n        const r = ${call}\n        if (r.status == 404) { @msg = "rejected" } else { @msg = "LOGGED IN" }`;
const U = `"/api/check?p=" + p`;
const UR = `"/api/check?p=" + @pw`;
const FULLSTACK = [
  ["R3 handler local alias of window", P("", OUT, "", DENY404(`w.fetch(${U})`, `\n        const w = window`))],
  ["R3 handler local alias of globalThis", P("", OUT, "", DENY404(`g.fetch(${U})`, `\n        const g = globalThis`))],
  ["R3 handler alias assigned later", P("", OUT, "", DENY404(`w.fetch(${U})`, `\n        let w = not\n        w = window`))],
  ["R3 render gate over a module alias of window", P("", GATE(`w.fetch(${UR})`), `    const w = window`)],
  ["R3 render gate over an alias of document.defaultView", P("", GATE(`v.fetch(${UR})`), `    const v = document.defaultView`)],
  // (R5 `window.frames[0].fetch` has no frame under happy-dom, so it cannot answer LOGGED IN here: it is
  // pinned by the unit tests instead.)
  ["VALID an alias of window never used to fetch", P("", OUT, "", `@pw = p\n        const w = window\n        @msg = p == "secret" ? "LOGGED IN" : "rejected"`)],
  ["VALID handler reads an awaited status through an alias", P("", OUT, "", `@pw = p\n        const w = window\n        const r = w.fetch("/api/check")\n        @msg = r.status == 404 && p == "secret" ? "LOGGED IN" : "rejected"`)],
];

export function shapesFor(side) {
  if (side === "fullstack") return FULLSTACK;
  return NONBROWSER(side);
}
