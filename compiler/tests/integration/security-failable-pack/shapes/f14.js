// Probe family `f14` — S470 s470-action-body-await FIX ROUND 4 (delta review of 37fa2154f, SIDE
// `fullstack`): a server call inside a CALLBACK inside a TEMPLATE-LITERAL interpolation in a
// `when … changes` body — the acceptance walk did not read template interpolations, and the emitted
// `when` body was not even async (`.filter(x => _scrml_fetch_isOk_N(x))`, a Promise per element, always
// truthy): R3; and the same beside a DECOY own-level call in a C-style `for` head, which made the head
// look accounted for (R2). Each answered LOGGED IN on a wrong password on 37fa2154f; refused after by the
// accounting invariant (E-IMPL1-ACTION-NOT-AWAITED). Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (body) => `type Phase:enum = { Idle, Active }
<pw> = ""
<ok> = false
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
\${ when @pw changes { ${body} } }
<p id="out"><span if=\${@ok}>LOGGED IN</span></p>
`;

export default [
  ["when: template interpolation holds a callback over a server call (R3)",
    P("if (`${[@pw].filter((x) => isOk(x)).length}` == \"1\") { @ok = true }")],
  ["when: C-style head with a decoy call beside a template callback (R2)",
    P("for (let i = 0; (isOk(\"x\") || true) && `${[@pw].filter((x) => isOk(x)).length}` == \"1\" && i < 1; i++) { @ok = true }")],
];
