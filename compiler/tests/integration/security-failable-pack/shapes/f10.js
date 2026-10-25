// Probe family `f10` — S470 s470-action-body-await FIX ROUND 1 (review of 41255a64b, SIDE `fullstack`):
//   - H1: a whole cell write `@ok = isOk(@pw)` inside a runtime `^{ }` (plain / under `if` / under
//     `for`) — lowered through the capability object `_scrml_cap.isOk(…)`, which the reactive-set
//     lift does not await: the cell held a pending Promise (truthy);
//   - H2: a LOCAL function whose body waits — a `const` lambda, a block lambda, a `function` value,
//     a nested `function`, a lambda over an async helper — declared in an engine state-child
//     `effect=`, an `<onTransition>` body, a message arm, a `^{ }`, a `when … changes` body or an
//     engine opener `effect=`, then called and its result tested; and an IIFE in the two async hosts;
//   - a waiting call inside a SYNCHRONOUS CALLBACK (`[@pw].forEach(x => …)`) in a `when` body / the
//     opener `effect=`;
//   - a `!{ }`-handled call in a `when` body (lowered into a synchronous value IIFE).
// Each answered LOGGED IN on a wrong password on 41255a64b; refused after (E-IMPL1-ACTION-NOT-AWAITED).
// Data, not logic. Do not edit a shape to make it pass.

export const SIDE = "fullstack";

const P = (logic, fns = "") => `type Phase:enum = { Idle, Active }
type Msg:enum = { Go }
<pw> = ""
<c> = true
<ok> = false
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p${fns} }
}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
${logic}
<p id="out"><span if=\${@ok}>LOGGED IN</span></p>
`;

const HOSTS = {
  "state effect=": [(b) => `<engine for=Phase initial=.Idle>
  <Idle rule=.Active effect=\${ ${b} }/>
  <Active/>
</>`, "; @phase = .Active"],
  "onTransition": [(b) => `<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active/>
  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>
</>`, "; @phase = .Active"],
  "message arm": [(b) => `<engine for=Phase initial=.Idle accepts=Msg>
  <Idle rule=.Active>
    | .Go :> { ${b}
 .Active }
    | _ :> @phase
  </>
  <Active rule=.Idle>
    | _ :> @phase
  </>
</>`, "; @phase.advance(.Go)"],
  "meta": [(b) => `^{ ${b} }`, ""],
  "when": [(b) => `\${ when @pw changes { ${b} } }`, ""],
  // boot-only: tested with the wrong password written in
  "opener effect=": [(b) => `<engine for=Phase initial=.Idle effect=\${ ${b.replace(/@pw/g, '"wrong"')} }>
  <Idle rule=.Active/>
  <Active/>
</>`, ""],
};
const LOCAL = {
  "const lambda": `const f = () => isOk(@pw)\n if (f()) { @ok = true }`,
  "block lambda": `const f = () => { return isOk(@pw) }\n if (f()) { @ok = true }`,
  "function value": `const f = function () { return isOk(@pw) }\n if (f()) { @ok = true }`,
  "nested function": `function f() { return isOk(@pw) }\n if (f()) { @ok = true }`,
  "lambda over a helper": `const f = () => allowed(@pw)\n if (f()) { @ok = true }`,
};

const S = [
  // H1
  ["H1 meta whole cell write", P(`^{ @ok = isOk("wrong") }`)],
  ["H1 meta whole cell write under if", P(`^{ if (@c) { @ok = isOk("wrong") } }`)],
  ["H1 meta whole cell write under for", P(`^{ for (const x of [1]) { @ok = isOk("wrong") } }`)],
];
for (const [hn, [h, fns]] of Object.entries(HOSTS)) {
  for (const [ln, b] of Object.entries(LOCAL)) {
    // A block lambda / a `function` value in a `^{ }` is already E-META-001 on 41255a64b: not a probe.
    if (hn === "meta" && (ln === "block lambda" || ln === "function value")) continue;
    S.push([`H2 ${hn}: ${ln}`, P(h(b), fns)]);
  }
}
S.push(["H2 when: IIFE", P(HOSTS.when[0](`if ((() => isOk(@pw))()) { @ok = true }`))]);
S.push(["H2 opener effect=: IIFE", P(HOSTS["opener effect="][0](`if ((() => isOk(@pw))()) { @ok = true }`))]);
// sync callbacks in the async hosts
S.push(["callback when: forEach over a server call", P(HOSTS.when[0](`[@pw].forEach((x) => { if (isOk(x)) { @ok = true } })`))]);
S.push(["callback when: forEach over a helper", P(HOSTS.when[0](`[@pw].forEach((x) => { if (allowed(x)) { @ok = true } })`))]);
S.push(["callback opener effect=: forEach over a server call", P(HOSTS["opener effect="][0](`[@pw].forEach((x) => { if (isOk(x)) { @ok = true } })`))]);
// a !{ }-handled call in a when body
S.push(["when: a !{ }-handled cell write", P(HOSTS.when[0](`@ok = isOk(@pw) !{ _ :> false }`))]);

export default S;
