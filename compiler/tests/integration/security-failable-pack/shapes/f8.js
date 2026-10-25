// Probe family `f8` — S470 s470-render-position-server-call-refused fix round 2 (review of 110dada2e), the
// CLIENT half (SIDE `fullstack`). A server call whose pending Promise reaches a gate:
//   - `<engine … if=${isOk(@pw)}>` — emit-html `emitGatedStructural` gates the engine host on its `ifCond`
//     (the review's e/k02c);
//   - a value stored at module scope by an assignment inside a module-init `if` (r31) or by a member
//     assignment (r32), then read by an `if=` gate.
// Each answered LOGGED IN on a wrong password on 110dada2e; refused (E-VALUE-SERVER-CALL) after.
// Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (logic, view) => `type Phase:enum = { Idle, Active }
<pw> = ""
<c> = true
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
${view}
`;

export default [
  ["engine if= over a server call", P("", `<p id="out"><engine for=Phase if=\${isOk(@pw)}>
  <Idle><span>LOGGED IN</span></Idle>
  <Active><span>LOGGED IN</span></Active>
</></p>`)],
  ["module-init if assigns a server call", P(`\${ let ok = false
if (@c) { ok = isOk(@pw) } }`, `<p id="out"><span if=\${ok}>LOGGED IN</span></p>`)],
  ["module-scope member assignment of a server call", P(`\${ const box = { v: false }
box.v = isOk(@pw) }`, `<p id="out"><span if=\${box.v}>LOGGED IN</span></p>`)],
];
