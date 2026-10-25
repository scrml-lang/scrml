// Probe family `f11` — S470 s470-action-body-await FIX ROUND 2 (re-review of f55eb8d4a, SIDE
// `fullstack`): an OPTIONAL call `isOk?.(…)` of a server function in the engine opener `effect=` — an
// async host whose own-level calls round 1 accepted — is emitted without `await`
// (`_scrml_cs_reactive_set("ok", _scrml_fetch_isOk_6?.("wrong"))`): the cell held a pending Promise.
// Boot-only (the opener runs once, before any click), so the wrong password is written into the body.
// Each answered LOGGED IN on a wrong password on f55eb8d4a; refused after (E-IMPL1-ACTION-NOT-AWAITED).
// Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (effect) => `type Phase:enum = { Idle, Active }
<pw> = ""
<ok> = false
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<engine for=Phase initial=.Idle effect=\${ ${effect} }>
  <Idle rule=.Active/>
  <Active/>
</>
<p id="out"><span if=\${@ok}>LOGGED IN</span></p>
`;

export default [
  ["opener effect= optional call written into a cell", P(`@ok = isOk?.("wrong")`)],
  ["opener effect= optional call tested", P(`if (isOk?.("wrong")) { @ok = true }`)],
];
