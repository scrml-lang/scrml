// Probe family `f15` — S470 s470-await-residue (SIDE `fullstack`). The ORDER of an action body
// (§13.8 (i): at a suspension point the compiler waits "and resume[s] with what follows"). #1554 kept
// two shapes in a body impl#1 ran synchronously — a whole cell write `@ok = isOk(@pw)` (lifted into a
// DETACHED `(async () => …)()`) and a bare call `stash(@pw)` — and the next statement read the cell
// from BEFORE the call. A `reset(@v)` of a cell whose initializer waits returned before the re-run
// call landed, the same way. Each page starts from a stale TRUE (an earlier right password), so the
// stale read answered LOGGED IN on a wrong password. Each non-VALID shape FAILED on 6081e0685.
// After: the bodies impl#1 now hosts async (`<timeout>`, a state-child `effect=`, an `<onTransition>`,
// `on mount`) await the call in place; the bodies that stay synchronous (module init, a `<request>`
// body, an `<onMount>` tag, a message arm, a runtime `^{ }`) and every non-sole `reset` of such a cell
// are refused (E-IMPL1-ACTION-NOT-AWAITED). VALID shapes are controls (correct on base and after).
// Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

// `@pw` starts "wrong" and `@ok` / `@tmp` TRUE: the stale value a previous right password left.
const P = (logic, fns = "") => `type Phase:enum = { Idle, Active }
type Msg:enum = { Go }
<pw> = "wrong"
<ok> = true
<tmp> = true
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function stash(q) { @tmp = isOk(q) }
    function login(p) { @pw = p${fns} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
<p id="out">\${@msg}</p>
`;
const WRITE = `@ok = isOk(@pw); if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const HELPER = `@ok = allowed(@pw); if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const BARE = `stash(@pw); if (@tmp) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const EFFECT = (b) => `<engine for=Phase initial=.Idle>
  <Idle rule=.Active effect=\${ ${b} }/>
  <Active/>
</>`;
const ONT = (b) => `<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active/>
  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>
</>`;
const ARM = (b) => `<engine for=Phase initial=.Idle accepts=Msg>
  <Idle rule=.Active>
    | .Go :> { ${b}; .Active }
    | _ :> @phase
  </>
  <Active rule=.Idle>
    | _ :> @phase
  </>
</>`;
const GO = "; @phase = .Active";
const ADV = "; @phase.advance(.Go)";

// `reset(@v)` re-runs `@v`'s waiting initializer; `@pw` starts "secret", so `@v` is TRUE at boot.
const R = (decl, fnBody, view = "") => `<pw> = "secret"
<msg> = "rejected"
${decl}
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p; ${fnBody} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${view}
<p id="out">\${@msg}</p>
`;
const TEST_V = `if (@v) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;

export default [
  // ORDER — synchronous bodies (refused after)
  ["module init: a cell write, then a test of the cell", P(`\${ ${WRITE} }`)],
  ["module init: a write through an async helper, then a test", P(`\${ ${HELPER} }`)],
  ["module init: a bare call, then a test of what it writes", P(`\${ ${BARE} }`)],
  ["request body: a cell write, then a test", P(`<request id="r" deps=[@pw]>\${ ${WRITE} }</>`)],
  ["request body: a bare call, then a test", P(`<request id="r" deps=[@pw]>\${ ${BARE} }</>`)],
  ["onMount tag: a cell write, then a test", P(`<onMount>\${ ${WRITE} }</>`)],
  ["message arm: a cell write, then a test", P(ARM(WRITE), ADV)],
  ["message arm: a bare call, then a test", P(ARM(BARE), ADV)],
  ["runtime meta: a bare call, then a test", P(`^{ ${BARE} }`)],
  // ORDER — bodies with an async host now (awaited in place after)
  ["timeout body: a cell write, then a test", P(`<timeout delay=1>\${ ${WRITE} }</>`)],
  ["state effect: a cell write, then a test", P(EFFECT(WRITE), GO)],
  ["state effect: a bare call, then a test", P(EFFECT(BARE), GO)],
  ["onTransition: a cell write, then a test", P(ONT(WRITE), GO)],
  ["onTransition: a bare call, then a test", P(ONT(BARE), GO)],
  ["on mount: a cell write, then a test", P(`\${
  on mount {
    @ok = isOk(@pw)
    if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }
  }
}`)],
  // RESET of a cell whose initializer waits (refused after, except a sole handler statement)
  ["reset in a function body, then a test", R(`<v> = isOk(@pw)`, `reset(@v); ${TEST_V}`)],
  ["reset of a helper-initialised cell, then a test", R(`<v> = allowed(@pw)`, `reset(@v); ${TEST_V}`)],
  ["reset to a waiting default=, then a test", R(`<v default=isOk(@pw)> = true`, `reset(@v); ${TEST_V}`)],
  ["reset in a when body, then a test", R(`<v> = isOk(@pw)`, ``, `\${ when @pw changes { reset(@v); ${TEST_V} } }`)],
  // VALID controls — correct on base and after
  ["VALID handler: a cell write, then a test", P(``, `; ${WRITE.replace(/@pw/g, "p")}`)],
  ["VALID when body: a cell write, then a test", P(`\${ when @pw changes { ${WRITE} } }`)],
  ["VALID timer body: a cell write, then a test", P(`<timer interval=1>\${ ${WRITE} }</timer>`)],
  ["VALID sole handler statement: reset", `<v default=isOk("wrong")> = false
<u default=isOk("secret")> = false
\${
    server function isOk(p) { return p == "secret" }
}
<button id="wrong" onclick=\${ reset(@v) }>go</button>
<button id="right" onclick=\${ reset(@u) }>go</button>
<p id="out"><span if=\${@v || @u}>LOGGED IN</span></p>
`],
];
