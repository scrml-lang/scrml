// Probe family `f23` (lane family r17; named `f15` until fix round 1 — renamed for lane D's f15) — S470 s470-await-residue (SIDE `fullstack`). The ORDER of an action body
// (§13.8 (i): at a suspension point the compiler waits "and resume[s] with what follows"). #1554 kept
// two shapes in a body impl#1 ran synchronously — a whole cell write `@ok = isOk(@pw)` (lifted into a
// DETACHED `(async () => …)()`) and a bare call `stash(@pw)` — and the next statement read the cell
// from BEFORE the call. A `reset(@v)` of a cell whose initializer waits returned before the re-run
// call landed, the same way. Each page starts from a stale TRUE (an earlier right password), so the
// stale read answered LOGGED IN on a wrong password. Each non-VALID shape FAILED on 6081e0685 (the
// fix-round-1 `F1`–`F4` shapes on 817aadc0e too; the fix-round-2 `F13` / `F14` shapes on 4ae8261f7 — F13
// PASS / PASS-DENY on 6081e0685; the `VALID F18` controls were over-refused on 4ae8261f7).
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

// fix round 2 helpers (the reviewer's bang.mjs / bang2.mjs / f4.mjs pages, verbatim in shape).
const B13 = (view, fns = "; @phase = .Active", pw = "none") => `type Phase:enum = { Idle, Active }
type AuthErr:enum = { Denied(reason: string), Gone }
<pw> = "${pw}"
<ok> = false
<msg> = "rejected"
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) { @pw = p${fns} }
}
${view}<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out">\${@msg}</p>
`;
const BANG = `@ok = check(@pw) !{ | .Denied(r) :> { @msg = "rejected" } }; if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const BANG2 = `@ok = check(@pw) !{ | .Denied(r) :> { @msg = "rejected" } | _ :> { @msg = "rejected" } }\n if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const ENG13 = (b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active/>\n  <Active rule=.Idle/>\n  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>\n</>\n`;
const EFF13 = (b) => `<engine for=Phase initial=.Idle>\n  <Idle rule=.Active effect=\${ ${b} }/>\n  <Active rule=.Idle/>\n</>\n`;
const P14 = (logic, fns = "; @phase.advance(.Go)") => `type Phase:enum = { Idle, Active, Other }
type Sw:enum = { Off, On }
type Msg:enum = { Go }
<pw> = "wrong"
<ok> = true
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p${fns} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
<p id="out">\${@msg}</p>
`;
const ARM14 = (t, extra = "") => `<engine for=Phase initial=.Idle accepts=Msg>\n  <Idle rule=(.Active | .Other)>\n    | .Go :> { @ok = isOk(@pw); ${t} }\n    | _ :> @phase\n  </>\n  <Active rule=.Idle>\n    | _ :> @phase\n  </>\n  <Other rule=.Idle>\n    | _ :> @phase\n  </>\n${extra}</>`;
const R18 = (body) => `<ok> = false
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { ${body} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out">\${@msg}</p>
`;

// fix round 3 helpers (the reviewer's atk.mjs / hh.mjs pages).
const E12BANG = `@ok = check(@pw) !{ | .Denied(r) :> { @msg = "rejected" } | _ :> { @msg = "rejected" } }`;
const E12LOGIN = (x = "") => `    function login(p) { @pw = p${x} }\n}\n`;
const E12 = (rest, pw = "none") => `type Phase:enum = { Idle, Active }
type AuthErr:enum = { Denied(reason: string), Gone }
<pw> = "${pw}"
<ok> = false
<msg> = "rejected"
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function chk(p) { @ok = check(p) !{ | .Denied(r) :> { @msg = "rejected" } | _ :> { @msg = "rejected" } } }
${rest}<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out">\${@msg}</p>
`;

// fix round 1 helpers.
const DTEST = (d) => `if (@${d}) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const G_OK = `if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
// The opener `effect=` writes `@ok` (undeclared — the opener registers its reset thunk); `@pw` starts
// "secret", so `@ok` is TRUE at boot and a reset that does not wait leaves it TRUE.
const OPR = (opener) => `type Phase:enum = { Idle, Active }
<pw> = "secret"
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p; reset(@ok); ${G_OK} }
}
<engine for=Phase initial=.Idle effect=\${
    ${opener}
}>
  <Idle rule=.Active/>
  <Active/>
</>
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out">\${@msg}</p>
`;

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
  // fix round 1 (review of 817aadc0e) — each FAILED on 817aadc0e (and on 6081e0685).
  // F1: the later statement reads a DERIVED cell whose formula reads the written cell.
  ["F1 module init: a write, then a test of a derived cell over it", P(`const <authed> = @ok\n\${ @ok = isOk(@pw); ${DTEST("authed")} }`)],
  ["F1 module init: a write, then a test of a derived of a derived", P(`const <a1> = @ok\nconst <a2> = @a1\n\${ @ok = isOk(@pw); ${DTEST("a2")} }`)],
  ["F1 request body: the load, then a test of a derived cell over it", P(`const <authed> = @ok\n<request id="r" deps=[@pw]>\${ @ok = isOk(@pw); ${DTEST("authed")} }</>`)],
  ["F1 message arm: a write, then a test of a derived cell over it", P(`const <authed> = @ok\n${ARM(`@ok = isOk(@pw); ${DTEST("authed")}`)}`, ADV)],
  ["F1 onMount tag: a write, then a test of a derived cell over it", P(`const <authed> = @ok\n<onMount>\${ @ok = isOk(@pw); ${DTEST("authed")} }</>`)],
  // F2: the reset value is registered by an engine opener `effect=` write (an undeclared cell).
  ["F2 reset of a cell an opener effect= writes, then a test", OPR(`@ok = isOk(@pw)`)],
  ["F2 reset of a cell an opener effect= writes through an expression, then a test", OPR(`@ok = [isOk(@pw)][0]`)],
  // F3: an opener `effect=` written BEFORE a module-init write runs AFTER it.
  ["F3 opener effect= written before a module-init write reads the cell", P(`<engine for=Phase initial=.Idle effect=\${ ${G_OK} }>\n  <Idle rule=.Active/>\n  <Active/>\n</>\n\${ @ok = isOk(@pw) }`)],
  // F4: an arm's last-statement write, then the transition's <onTransition> reads the cell.
  ["F4 message arm: a write, then the transition's onTransition reads the cell", P(`<engine for=Phase initial=.Idle accepts=Msg>
  <Idle rule=.Active>
    | .Go :> { @ok = isOk(@pw); .Active }
    | _ :> @phase
  </>
  <Active rule=.Idle>
    | _ :> @phase
  </>
  <onTransition from=.Idle to=.Active>\${ ${G_OK} }</onTransition>
</>`, ADV)],
  // fix round 2 (review of 4ae8261f7; reviewer bang.mjs / bang2.mjs / f4.mjs).
  // F13: a `!{ }`-handled write whose arm falls through, in a body now awaited in place, writes the
  // error envelope (truthy) into the cell — FAIL on 4ae8261f7, PASS / PASS-DENY on 6081e0685.
  ["F13 onTransition: a handled write with a fall-through arm, then a test", B13(ENG13(BANG))],
  ["F13 onTransition: a handled write with fall-through arms (catch-all), then a test", B13(ENG13(BANG2))],
  ["F13 state effect: a handled write with fall-through arms, then a test", B13(EFF13(BANG2))],
  ["F13 timer: a handled write with fall-through arms, then a test", B13(`<timer interval=1>\${ ${BANG2} }</timer>\n`, "")],
  ["F13 timeout: a handled write with fall-through arms, then a test", B13(`<timeout delay=1>\${ ${BANG2} }</>\n`, "", "wrong")],
  // F14: a message arm's last-statement write runs detached and is read stale after the transition.
  ["F14 message arm write, then a when on the engine reads the cell", P14(ARM14(".Active") + `\n\${ when @phase changes { ${G_OK} } }`)],
  ["F14 message arm write, then a chained second engine's hook reads the cell", P14(ARM14(".Active", `  <onTransition from=.Idle to=.Active>\${ @sw = .On }</onTransition>\n`) + `\n<engine for=Sw var=sw initial=.Off>\n  <Off rule=.On/>\n  <On/>\n  <onTransition from=.Off to=.On>\${ ${G_OK} }</onTransition>\n</>`)],
  ["F14 message arm write, then the sending handler reads the cell", P14(ARM14(".Active"), `; @phase.advance(.Go); ${G_OK}`)],
  // F18 VALID controls — a declared cell written from a server call in a function: `reset` restores
  // the declaration, nothing waits (over-refused on 4ae8261f7: PASS-REFUSED there, PASS now).
  ["VALID F18 reset of a declared cell, then an awaited write in the handler", R18(`reset(@ok); @ok = isOk(p); ${G_OK}`)],
  ["VALID F18 an awaited write, the test, then a reset to the declaration", R18(`@ok = isOk(p); ${G_OK}; reset(@ok)`)],
  // fix round 3 (re-review of 4abccb31d; ruling S470 "Emit E-ERROR-012") — a `!{ }`-handled cell
  // write whose arm falls through, reached through a HELPER function, in a handler, in the opener: the
  // handled failure's error envelope (truthy) was written into the cell. FAIL on 4abccb31d (the
  // handler and opener shapes on main too); refused at compile time after (E-ERROR-012, §19.4.3).
  ["E12 helper with a fall-through arm, called from an onTransition, then a test", E12(`${E12LOGIN("; @phase = .Active")}${ENG13(`chk(@pw)\n ${G_OK}`)}`)],
  ["E12 helper with a fall-through arm, called from a timer, then a test", E12(`${E12LOGIN()}<timer interval=1>\${ chk(@pw)\n ${G_OK} }</timer>\n`)],
  ["E12 handler: a fall-through arm write, then a test", E12(`    function login(p) { @pw = p\n ${E12BANG}\n ${G_OK} }\n}\n`)],
  ["E12 handler calls the helper, then a test", E12(`    function login(p) { @pw = p; chk(p); ${G_OK} }\n}\n`)],
  ["E12 opener effect=: a fall-through arm write, then a test", E12(`${E12LOGIN()}<engine for=Phase initial=.Idle effect=\${ ${E12BANG}\n ${G_OK} }>\n  <Idle rule=.Active/>\n  <Active/>\n</>\n`, "wrong")],
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
