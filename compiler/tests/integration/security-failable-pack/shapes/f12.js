// Probe family `f12` — S470 s470-action-body-await FIX ROUND 3 (delta review of 07ebed34b, SIDE
// `fullstack`): a C-style `for` head in the engine opener `effect=` that holds a server call inside a
// TEMPLATE literal. Round 2 read the head from its parsed `cStyleParts`, but the head is carried as
// tokenized text whose template collapses: impl#1 emitted `for (let i = 0; $; i++)` — the call and
// `i < 1` dropped, a bare `$` left. With a binding named `$` in scope (here a file-level `const`, standing
// in for a page's jQuery) the loop body runs on a wrong password. Boot-only: the wrong password is
// written into the head. Each answered LOGGED IN on a wrong password on 07ebed34b; refused after
// (E-IMPL1-ACTION-NOT-AWAITED). Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (head) => `type Phase:enum = { Idle, Active }
<pw> = ""
<ok> = false
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
    const $ = 1
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<engine for=Phase initial=.Idle effect=\${ for (${head}) { @ok = true
 break } }>
  <Idle rule=.Active/>
  <Active/>
</>
<p id="out"><span if=\${@ok}>LOGGED IN</span></p>
`;

export default [
  ["opener effect= for head: template over a server call", P("let i = 0; `${isOk(\"wrong\")}` == \"true\" && i < 1; i++")],
  ["opener effect= for head: template over a server call, no bound", P("let i = 0; `${isOk(\"wrong\")}` == \"true\"; i++")],
];
