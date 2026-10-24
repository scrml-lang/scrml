// Probe family `n27` — S469 (s469-structural-else-guard; g-structural-element-if-chain-and-show-composition-nominal,
// g-if-on-structural-element-silently-ignored, SECURITY): the privileged control sits in a branch the author
// GATED, on an element that never read the gate.
//   (a) the `else` / `else-if=` branch of an `if=` chain is a structural element (`<engine>` / `<match>` /
//       `<each>`) or an `<each>`'s `<empty>` fallback. The structural openers dropped the attribute at parse
//       time and `collapseIfChains` chains markup only, so the branch rendered whatever the `if=` said;
//   (b) the `if=` sits on an element whose lowering returns before the §17.1 mount gate — `<errorBoundary>`,
//       `<render>`, a compound-state namespace wrapper, an `<each>`'s `<empty>` — and was dropped.
// Positions: in markup, nested deeper, an `<each>` row, a component body, lifted markup (where the shape is
// lowerable at all). `#wrong` sets the wrong password, `#right` the right one; both start from `""`.
//
// Measured on b0cffc6a4 (before the fix): 41 FAIL — the wrong password showed LOGGED IN — and 2 PASS-REFUSED
// (an `<engine else>` in lifted markup, already E-CTRL-001 / -002 by the lift backstop). After the fix all 43
// are refused — E-CTRL-001 / E-CTRL-002 (an `else` / `else-if=` not part of a lowered chain),
// E-GATE-UNSUPPORTED-HOST (an `if=` on a host that does not gate) — PASS-REFUSED. (The component-body shapes
// put `#out` on an inner element: the expansion appends a space to the root's text, which would hide a leak
// from the exact-text judge.) The floor: none may ever show LOGGED IN on the wrong password, e.g. a
// future chain lowering for structural elements that evaluates the chain once, or drops a branch condition.
// Round 2 (shapes named `r2 …`): 61 FAIL on the round-1 head 456158a63, all PASS-REFUSED after.
// Round 3 (shapes named `r3 …`): 197 FAIL / 3 PASS / 75 PASS-REFUSED on 412b77b8b, all PASS-REFUSED after.
// Round 4 (shapes named `r4 …`): 109 FAIL / 1 PASS / 32 PASS-REFUSED on 20fadd7b4; 0 FAIL after (4 legal openers PASS).
// Round 5 (shapes named `r5 …`): 13 FAIL / 3 PASS-DENY / 2 PASS / 8 PASS-REFUSED on 88d71e8ba; all PASS-REFUSED after.
// Round 6 (shapes named `r6 …`): whitespace (state) openers — see the round-6 block.
// Data, not logic: the default export is a list of [name, scrml source]. Side: client (click #wrong /
// #right, read #out). Do not edit a shape to make it pass.

export const SIDE = "client";

const HEAD = `type Phase:enum = { Idle, Active }
type Mode:enum = { A, B }
type Badge:enum = { Granted renders <b>LOGGED IN</b>, Denied renders <i></i> }
<mode>: Mode = .A
<badge>: Badge = .Granted
<pw> = ""
<xs> = [1]
<none> = []
<signupForm>
    <userName> = <input type="text"/>
</>
`;

const PAGE = (out, extra = "", bare = false) => `${HEAD}${extra}<button id="wrong" onclick=\${ @pw = "wrong" }>go</button>
<button id="right" onclick=\${ @pw = "secret" }>go</button>
${bare ? out : `<div id="out">${out}</div>`}
`;

// The privileged branch, as each structural element. `A` is the element's opener attribute.
const ELEMENTS = [
  ["<engine>", (a) => `<engine ${a} for=Phase initial=.Idle><Idle rule=.Active><b>LOGGED IN</b></><Active rule=.Idle><b>LOGGED IN</b></></>`],
  ["<match>", (a) => `<match ${a} for=Mode on=@mode><A><b>LOGGED IN</b></><B><b>LOGGED IN</b></></>`],
  ["<each>", (a) => `<each ${a} in=@xs as r><b>LOGGED IN</b></each>`],
];

// (a) the chain: the head DENIES and renders nothing (true on any password but the right one); the privileged branch is the
// `else` — or an `else-if=` that names the right password behind a head that is false on both.
const CHAINS = [
  ["else", (el) => `<span if=(@pw != "secret")></span>${el("else")}`],
  ["else-if=", (el) => `<span if=(@pw == "nobody")></span>${el('else-if=(@pw == "secret")')}`],
];

const POSITIONS = [
  ["in markup", (c) => PAGE(c)],
  ["nested deeper", (c) => PAGE(`<section><p>${c}</p></section>`)],
  ["in an <each> row", (c) => PAGE(`<each in=@xs as y><div>${c}</div></each>`)],
  ["in a component body", (c) => PAGE(`<Gate/>`, `const Gate = <div><section id="out">${c}</section></div>\n`, true)],
  ["in lifted markup", (c) => PAGE(`\${ for (y of @xs) { lift <div>${c}</div> } }`)],
];

const shapes = [];
for (const [en, el] of ELEMENTS) {
  for (const [cn, chain] of CHAINS) {
    for (const [pn, pos] of POSITIONS) {
      // An engine in a row / component body is refused by §51.0.K whatever its attributes; a `<match>` in
      // lifted markup is E-MATCH-BLOCK-IN-LIFT. Those positions add nothing here.
      if (en === "<engine>" && (pn === "in an <each> row" || pn === "in a component body")) continue;
      if (en === "<match>" && pn === "in lifted markup") continue;
      shapes.push([`${en} as the ${cn} branch, ${pn}`, pos(chain(el))]);
    }
  }
}

// The `<empty>` fallback of an empty list carries the chain attribute / the gate itself.
const EMPTY = (a) => `<each in=@none as r><i></i><empty ${a}><b>LOGGED IN</b></empty></each>`;
for (const [pn, pos] of POSITIONS) {
  shapes.push([`<empty else> after a denying if=, ${pn}`, pos(`<span if=(@pw != "secret")></span>${EMPTY("else")}`)]);
  shapes.push([`<empty if=> on the right password, ${pn}`, pos(EMPTY(`if=(@pw == "secret")`))]);
}

// (b) an `if=` on a host whose lowering bypasses the mount gate.
const HOSTS = [
  ["<errorBoundary>", `<errorBoundary if=(@pw == "secret")><b>LOGGED IN</b></errorBoundary>`],
  ["<render>", `<render if=(@pw == "secret") of=@badge/>`],
  ["a compound-state wrapper", `<signupForm if=(@pw == "secret")><b>LOGGED IN</b></signupForm>`],
];
for (const [hn, host] of HOSTS) {
  for (const [pn, pos] of POSITIONS.slice(0, 2).concat([POSITIONS[3]])) {
    shapes.push([`if= on ${hn}, ${pn}`, pos(host)]);
  }
}

// ---------------------------------------------------------------------------------------------------
// Round 2 (review of 456158a63): spellings the round-1 word scan disagreed with the markup tokenizer
// about — each one a chain member on a `<p>`, and on a structural opener compiled at exit 0 with the
// gated branch visible — plus the positions round 1 left unhandled. Measured on 456158a63: every
// shape below that compiled showed LOGGED IN on the wrong password.
// ---------------------------------------------------------------------------------------------------
const SPELLINGS = [
  ['else=""', 'else=""'],
  ['else="true"', 'else="true"'],
  ["else=${true}", "else=${true}"],
  ["else=(true)", "else=(true)"],
  ["a bare if word swallowing else", "if else"],
  ["data-x=if else", "data-x=if else"],
  ['title="x"else (no space)', 'title="x"else'],
  ["effect=${ // it's } else (an apostrophe in a comment)", "effect=${ // it's\n    @n = 1\n} else"],
  ['effect=${ /"/ } else (a quote in a regex)', 'effect=${ @n = /"/.test("a") ? 1 : 0 } else'],
];
const R2_POSITIONS = [POSITIONS[0], POSITIONS[2], POSITIONS[3]]; // in markup, an <each> row, a component body
for (const [sn, sp] of SPELLINGS) {
  for (const [en, el] of ELEMENTS) {
    for (const [pn, pos] of R2_POSITIONS) {
      if (en === "<engine>" && pn !== "in markup") continue; // §51.0.K refuses an engine there anyway
      if (sp.startsWith("effect=") && en !== "<engine>") continue; // effect= is an engine opener slot
      shapes.push([`r2 <${en.slice(1, -1)} ${sn}> after a denying if=, ${pn}`,
        pos(`<span if=(@pw != "secret")></span>${el(sp)}`)]);
    }
  }
}
shapes.push(["r2 <match on=(@mode)else> (no space) after a denying if=, in markup",
  POSITIONS[0][1](`<span if=(@pw != "secret")></span><match for=Mode on=(@mode)else><A><b>LOGGED IN</b></><B><b>LOGGED IN</b></></>`)]);

// A bare `<engine if …>` names no condition (§17.1: E-CG-003) — it rendered ungated.
shapes.push(["r2 a bare <engine if> (no condition), in markup", POSITIONS[0][1](ELEMENTS[0][1]("if"))]);

// A gate on an engine state-child / a `<match>` arm opener — the arm is dispatched by its variant.
const SC = (a) => `<engine for=Phase initial=.Idle><Idle rule=.Active ${a}><b>LOGGED IN</b></><Active rule=.Idle><b>LOGGED IN</b></></>`;
const ARM = (a) => `<match for=Mode on=@mode><A ${a}><b>LOGGED IN</b></><B><b>LOGGED IN</b></></>`;
for (const [what, mk] of [["an engine state-child", SC], ["a <match> arm", ARM]]) {
  shapes.push([`r2 if= on ${what}, in markup`, POSITIONS[0][1](mk(`if=(@pw == "secret")`))]);
  shapes.push([`r2 show= on ${what}, in markup`, POSITIONS[0][1](mk(`show=(@pw == "secret")`))]);
}
shapes.push([`r2 if= on a <match> arm, ${POSITIONS[2][0]}`, POSITIONS[2][1](ARM(`if=(@pw == "secret")`))]);

// A component-body `<slot>` with a gate: impl#1 appends the use-site children after the body, so the
// gate toggled an empty `<slot>` while the children rendered.
const SLOT = (body) => PAGE(`<Gate><b>LOGGED IN</b></Gate>`, `const Gate = <div><section id="out">${body}</section></div>\n`, true);
shapes.push(["r2 <slot if=> in a component body", SLOT(`<slot if=(@pw == "secret")/>`)]);
shapes.push(["r2 <slot show=> in a component body", SLOT(`<slot show=(@pw == "secret")/>`)]);
shapes.push(["r2 <slot else> after a denying if= in a component body", SLOT(`<span if=(@pw != "secret")></span><slot else/>`)]);

// ---------------------------------------------------------------------------------------------------
// Round 3 (review of 412b77b8b): an unquoted value with a bare operator (`data-z=a/`, `title=a/b`,
// `1+2`, `a?b:c`, `a&&b`, `a||b`, `a*b`, `a==b`, `a,`, `a;`) is refused by the markup reader as a run
// that reaches the tag close — so a gate written AFTER it is never read. On a `<p>` that refusal fails
// the compile; round 2 dropped it on the structural openers and the gate vanished (HIGH). Plus the
// case-variant gate names (`IF=`, `Else`, …), which no reader treated as gates (now E-GATE-ATTR-CASE).
// Measured on 412b77b8b: every structural / arm / state-child shape below that compiled showed LOGGED IN
// on the wrong password; the markup ones were already refused. All PASS-REFUSED after.
// ---------------------------------------------------------------------------------------------------
const OPS = ["data-z=a/", "title=a/b", "data-x=1+2", "data-x=a?b:c", "data-x=a&&b", "data-x=a==b", "data-x=a,", "data-x=a;"];
const R3_GATES = [
  ["else", (op, el) => `<span if=(@pw != "secret")></span>${el(`${op} else`)}`],
  ["else-if=", (op, el) => `<span if=(@pw == "nobody")></span>${el(`${op} else-if=(@pw == "secret")`)}`],
  ["if=", (op, el) => el(`${op} if=(@pw == "secret")`)],
];
const R3_ELEMENTS = [
  ...ELEMENTS,
  ["<b>", (a) => `<b ${a}>LOGGED IN</b>`],
];
for (const op of OPS) {
  for (const [gn, gate] of R3_GATES) {
    for (const [en, el] of R3_ELEMENTS) {
      for (const [pn, pos] of R2_POSITIONS) {
        if (en === "<engine>" && pn !== "in markup") continue;
        shapes.push([`r3 ${en.slice(1, -1)} ${op} ${gn}, ${pn}`, pos(gate(op, el))]);
      }
    }
  }
}
// the gate BEFORE the operator value (refused on markup too)
for (const [en, el] of R3_ELEMENTS) {
  shapes.push([`r3 ${en.slice(1, -1)} if= then data-path=admin/panel, in markup`, POSITIONS[0][1](el(`if=(@pw == "secret") data-path=admin/panel`))]);
}
// arm / state-child / timer-free raw-text openers
for (const op of ["data-x=a/", "data-x=a+b"]) {
  shapes.push([`r3 <match> arm ${op} if=, in markup`, POSITIONS[0][1](ARM(`${op} if=(@pw == "secret")`))]);
  shapes.push([`r3 <match> arm ${op} if=, ${POSITIONS[2][0]}`, POSITIONS[2][1](ARM(`${op} if=(@pw == "secret")`))]);
  shapes.push([`r3 engine state-child ${op} if=, in markup`, POSITIONS[0][1](SC(`${op} if=(@pw == "secret")`))]);
}
// case-variant gate names on every kind of element
for (const [cn, gate] of [
  ["IF=", (el) => el(`IF=(@pw == "secret")`)],
  ["If=", (el) => el(`If=(@pw == "secret")`)],
  ["ELSE", (el) => `<span if=(@pw != "secret")></span>${el("ELSE")}`],
  ["Else", (el) => `<span if=(@pw != "secret")></span>${el("Else")}`],
  ["ELSE-IF=", (el) => `<span if=(@pw == "nobody")></span>${el(`ELSE-IF=(@pw == "secret")`)}`],
]) {
  for (const [en, el] of R3_ELEMENTS) {
    shapes.push([`r3 ${en.slice(1, -1)} ${cn} (case variant), in markup`, POSITIONS[0][1](gate(el))]);
  }
  shapes.push([`r3 <match> arm ${cn} (case variant), in markup`, POSITIONS[0][1](ARM(cn.endsWith("=") ? `${cn}(@pw == "secret")` : cn))]);
}

// ---------------------------------------------------------------------------------------------------
// Round 4 (review of 20fadd7b4): a value the markup tokenizer DROPS (`tabindex=-1`, `x=+1`, `x=.5`,
// `x=~1`, `x=)`, `x=]`) leaves the next attribute's NAME as the value, so a gate written after it
// becomes the previous attribute's value (E-ATTR-001 on a top-level `<p>`). Round 3 forwarded only the
// operator-run refusals, so the gate vanished on the structural openers; and an `<each>` ROW discarded
// the E-ATTR-001 of a markup `<p>` the same way. Plus the slot loop's 64-segment cap (fail-open past it)
// and the order-independent `<each key=… in=…>` spelling (must compile and gate). Measured on 20fadd7b4:
// every `r4` refusal shape that compiled showed LOGGED IN on the wrong password.
// ---------------------------------------------------------------------------------------------------
const DROPS = ["tabindex=-1", "x=+1", "x=.5", "x=~1", "x=)", "x=]"];
for (const v of DROPS) {
  for (const [gn, gate] of R3_GATES) {
    for (const [en, el] of R3_ELEMENTS) {
      for (const [pn, pos] of [POSITIONS[0], POSITIONS[2]]) {
        if (en === "<engine>" && pn !== "in markup") continue;
        shapes.push([`r4 ${en.slice(1, -1)} ${v} ${gn}, ${pn}`, pos(gate(v, el))]);
      }
    }
  }
  shapes.push([`r4 <match> arm ${v} if=, in markup`, POSITIONS[0][1](ARM(`${v} if=(@pw == "secret")`))]);
  shapes.push([`r4 engine state-child ${v} if=, in markup`, POSITIONS[0][1](SC(`${v} if=(@pw == "secret")`))]);
}
// 70 `key=` operator segments (past round 3's 64-pass cap), then the gate.
shapes.push(["r4 each 70x key=x.id+1 then if=, in markup",
  POSITIONS[0][1](ELEMENTS[2][1](`${Array.from({ length: 70 }, () => "key=r+1").join(" ")} if=(@pw == "secret")`))]);
// The order-independent each spellings: legal, and gated (PASS on the right password, never on the wrong).
for (const opener of [
  `key=r + 1 in=@xs as r if=(@pw == "secret")`,
  `in=@xs key=r + 1 as r if=(@pw == "secret")`,
  `if=(@pw == "secret") key=r + 1 in=@xs as r`,
]) {
  shapes.push([`r4 each ${opener.split(" if=")[0]} … gate order, in markup`, POSITIONS[0][1](`<each ${opener}><b>LOGGED IN</b></each>`)]);
}

// ---------------------------------------------------------------------------------------------------
// Round 5 (review of 88d71e8ba): a stray `=` after an engine sigil value (`initial=.Active = if=…`)
// left an `=` + value pair no attribute owned, which the attribute parser skipped silently — and the
// gate inside it with it (the SSR body shipped the content). Same mechanism on markup in a row
// (`<p x=.A= if=…>`), on a `<match>` arm opener (`<A = if=…>`), and with a reserved-word value
// (`x= else`). Measured on 88d71e8ba: every compiling `r5` shape showed LOGGED IN on the wrong
// password; all PASS-REFUSED after.
// ---------------------------------------------------------------------------------------------------
const R5_ENG = (o) => `<engine for=Phase ${o}><Idle rule=.Active><b>LOGGED IN</b></><Active rule=.Idle><b>LOGGED IN</b></></>`;
const PWG = `(@pw == "secret")`;
for (const o of [
  `initial=.Active = if=${PWG}`, `initial=.Active= if=${PWG}`, `accepts=:Phase= if=${PWG} initial=.Active`,
  `initial=.Active =if=${PWG}`, `initial=.Active:if=${PWG}`, `initial=-.Active if=${PWG}`, `initial=$.Active if=${PWG}`,
]) {
  shapes.push([`r5 engine ${o.replace(PWG, "…")}, in markup`, POSITIONS[0][1](R5_ENG(o))]);
}
for (const o of [`initial=.Active= else`, `initial=.Active=else`]) {
  shapes.push([`r5 engine ${o} after a denying if=, in markup`, POSITIONS[0][1](`<span if=(@pw != "secret")></span>${R5_ENG(o)}`)]);
}
for (const [en, el] of R3_ELEMENTS) {
  for (const [pn, pos] of [POSITIONS[0], POSITIONS[2]]) {
    if (en === "<engine>" && pn !== "in markup") continue;
    shapes.push([`r5 ${en.slice(1, -1)} x=.A= if=, ${pn}`, pos(el(`x=.A= if=${PWG}`))]);
    shapes.push([`r5 ${en.slice(1, -1)} x= else (reserved-word value) after a denying if=, ${pn}`,
      pos(`<span if=(@pw != "secret")></span>${el("x= else")}`)]);
  }
}
for (const o of [`= if=${PWG}`, `=if=${PWG}`, `id=a =if=${PWG}`]) {
  shapes.push([`r5 <match> arm <A ${o.replace(PWG, "…")}>, in markup`, POSITIONS[0][1](ARM(o))]);
}

// ---------------------------------------------------------------------------------------------------
// Round 6 (review of 9be2cecf9): a whitespace opener `< span if=…>` is a STATE opener — the gate was
// kept but never read, the element not emitted and its children rendered unconditionally (only
// W-WHITESPACE-001). Pre-existing, same on base. Now E-GATE-UNSUPPORTED-HOST (and the dropped-value /
// orphan refusals in the state-opener attribute reader).
// ---------------------------------------------------------------------------------------------------
for (const o of [
  `< span if=(@pw == "secret")>`, `< div class="box" if=(@pw == "secret")>`, `< div show=(@pw == "secret")>`,
  `< div IF=(@pw == "secret")>`, `< div x=-1 if=(@pw == "secret")>`, `< div x=) if=(@pw == "secret")>`,
]) {
  const tag = o.match(/^< (\w+)/)[1];
  shapes.push([`r6 whitespace opener ${o.replace(`(@pw == "secret")`, "…")}, in markup`,
    POSITIONS[0][1](`${o}<b>LOGGED IN</b></${tag}>`)]);
}

export default shapes;
