// Probe family `f13` (named `f9` on the lane branch; renamed at the merge with main) — S470 s470-action-body-await (SIDE `fullstack`). A server call (or an async-coloured
// client helper that reaches one) in an ACTION body impl#1 lowered synchronously — module-init statements,
// a `<request>` / `<timer>` / `<poll>` / `<timeout>` / `<onMount>` body, a runtime `^{ }`, an engine
// state-child `effect=`, an `<onTransition>` body or guard, a message arm — was emitted without `await`, so
// the code tested a pending Promise (always truthy) and answered LOGGED IN on a wrong password. Refused
// after (E-IMPL1-ACTION-NOT-AWAITED since fix round 1; the cell-declaration shape E-VALUE-SERVER-CALL). Two async hosts that awaited a server call but not a helper (a
// `when … changes` body, an engine opener `effect=`) now await it.
// Each FAILED (wrong -> LOGGED IN) on 4058bd052. Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (logic, view, fns = "") => `type Phase:enum = { Idle, Active }
<pw> = ""
<c> = true
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p${fns} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
${view}
`;
const OUT = `<p id="out">\${@msg}</p>`;
const GATE = (v) => `<p id="out"><span if=\${${v}}>LOGGED IN</span></p>`;
const T = `"LOGGED IN" : "rejected"`;

// The server function IMPORTED from another file (the emitter's cell-write lift does not cover it, and
// the `when` / opener-effect hosts did not await it).
const LIB = `\${
    export server function isOk(p) { return p == "secret" }
}
`;
const I = (logic, view = OUT) => [`type Phase:enum = { Idle, Active }
<pw> = ""
<msg> = "rejected"
\${
    import { isOk } from "./lib.scrml"
    function login(p) { @pw = p }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
${view}
`, { "lib.scrml": LIB }];

export default [
  ["imported: module-init cell write of the call", ...I(`<ok> = false
\${ @ok = isOk(@pw) }`, GATE("@ok"))],
  ["imported: request body cell write of the call", ...I(`<ok> = false
<request id="r" deps=[@pw]>\${ @ok = isOk(@pw) }</>`, GATE("@ok"))],
  ["imported: when body tests the call", ...I(`\${ when @pw changes { if (isOk(@pw)) { @msg = "LOGGED IN" } else { @msg = "rejected" } } }`)],
  ["imported: engine opener effect= tests the call", ...I(`<engine for=Phase initial=.Idle effect=\${ if (isOk(@pw)) { @msg = "LOGGED IN" } }>
  <Idle rule=.Active/>
  <Active/>
</>`)],
  // module init (the lane-2 l2c reproducers)
  ["module-init block assigns a server call", P(`\${ let ok = false
{ ok = isOk(@pw) } }`, GATE("ok"))],
  ["module-init if condition assigns a server call", P(`\${ let ok = false
if ((ok = isOk(@pw))) { } }`, GATE("ok"))],
  ["module-init call argument assigns a server call", P(`\${ let ok = false
console.log(ok = isOk(@pw)) }`, GATE("ok"))],
  ["module-init && assigns a server call", P(`\${ let ok = false
@c && (ok = isOk(@pw)) }`, GATE("ok"))],
  ["module-init ternary assigns a server call", P(`\${ let ok = false
@c ? (ok = isOk(@pw)) : 0 }`, GATE("ok"))],
  ["module-init Object.assign of a server call", P(`\${ const box = { v: false }
Object.assign(box, { v: isOk(@pw) }) }`, GATE("box.v"))],
  ["module-init push of a server call", P(`\${ const arr = []
arr.push(isOk(@pw)) }`, GATE("arr.length > 0 && arr[0]"))],
  ["module-init for head assigns a server call", P(`\${ let ok = false
for (ok = isOk(@pw); false; ) { } }`, GATE("ok"))],
  ["module-init if tests a server call", P(`\${ let ok = false
if (isOk(@pw)) { ok = true } }`, GATE("ok"))],
  ["module-init if tests an async helper", P(`\${ let ok = false
if (allowed(@pw)) { ok = true } }`, GATE("ok"))],
  ["module-init cell write tests a server call", P(`\${ @msg = isOk(@pw) ? ${T} }`, OUT)],
  ["module-init lambda tests a server call", P(`\${ setTimeout(() => { if (isOk(@pw)) { @msg = "LOGGED IN" } }, 0) }`, OUT)],
  ["cell declaration tests a server call", P(`<v> = isOk(@pw) ? ${T}`, `<p id="out">\${@v}</p>`)],
  ["onMount tag body tests a server call", P(`<onMount>\${ if (isOk(@pw)) { @msg = "LOGGED IN" } }</>`, OUT)],
  // lifecycle element bodies
  ["request body tests a server call", P(`<request id="r" deps=[@pw]>\${ @msg = isOk(@pw) ? ${T} }</>`, OUT)],
  ["request body tests an async helper", P(`<request id="r" deps=[@pw]>\${ @msg = allowed(@pw) ? ${T} }</>`, OUT)],
  ["timer body tests a server call", P(`<timer interval=1>\${ @msg = isOk(@pw) ? ${T} }</timer>`, OUT)],
  ["poll body tests a server call", P(`<poll interval=1000>\${ if (isOk(@pw)) { @msg = "LOGGED IN" } }</poll>`, OUT)],
  ["timeout body tests a server call", P(`<timeout delay=1>\${ @msg = isOk(@pw) ? ${T} }</>`, OUT)],
  // runtime meta
  ["runtime meta tests a server call", P(`^{ @msg = isOk(@pw) ? ${T} }`, OUT)],
  // engine bodies (the click transitions .Idle -> .Active)
  ["engine state effect= tests a server call", P(`<engine for=Phase initial=.Idle>
  <Idle rule=.Active effect=\${ @msg = isOk(@pw) ? ${T} }/>
  <Active/>
</>`, OUT, "; @phase = .Active")],
  ["engine onTransition body tests a server call", P(`<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active/>
  <onTransition from=.Idle to=.Active>\${ if (isOk(@pw)) { @msg = "LOGGED IN" } }</onTransition>
</>`, OUT, "; @phase = .Active")],
  ["engine onTransition guard is a server call", P(`<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active/>
  <onTransition from=.Idle to=.Active if=\${isOk(@pw)}>\${ @msg = "LOGGED IN" }</onTransition>
</>`, OUT, "; @phase = .Active")],
  ["engine message arm tests a server call", `type Phase:enum = { Idle, Active }
type Msg:enum = { Go }
<pw> = ""
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p; @phase.advance(.Go) }
}
<engine for=Phase initial=.Idle accepts=Msg>
  <Idle rule=.Active>
    | .Go :> { @msg = isOk(@pw) ? ${T}; .Active }
    | _ :> @phase
  </>
  <Active rule=.Idle>
    | _ :> @phase
  </>
</>
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${OUT}
`],
  // async hosts that now await a helper
  ["when body tests an async helper", P(`\${ when @pw changes { if (allowed(@pw)) { @msg = "LOGGED IN" } else { @msg = "rejected" } } }`, OUT)],
  ["engine opener effect= tests an async helper", P(`<engine for=Phase initial=.Idle effect=\${ if (allowed(@pw)) { @msg = "LOGGED IN" } }>
  <Idle rule=.Active/>
  <Active/>
</>`, OUT)],
];
