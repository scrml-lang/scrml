// S470 s470-typed-payload-binders (lane B; gap g-impl1-enum-value-member-read-unchecked-s470, and the
// Q4 shape of the S470 lane-1 review) — on every side (server `s12`, fullstack `f10`, library `l7`,
// tool `t7`). Ruling (bryan, S470, user-voice-scrml.md "(B) Type the binders (Recommended)"): a payload
// binder has its field's DECLARED type (§18.7), and a member read other than `.variant` on an
// ENUM-typed value is refused (§34 E-TYPE-004). impl#1 checked member reads on STRUCT-typed names only
// and bound every payload binder `asIs`, so a payload field read off an enum value compiled and read
// `undefined` — the wrong password logged in. Every "1 …" shape is FAIL on the starting head 91c1c9ca4
// on its side and PASS-REFUSED after (E-TYPE-004 / E-EQ-001); a shape that could not fail on a side
// there (refused for another reason, or not judgeable) is left off that side.
// "VALID …" shapes are acceptance controls (pinned PASS): the r7 `VALID` controls, whose shared
// declarations hold `getReasonT(x: AuthErr) { return x.reason }` — the read this lane refuses, so those
// are PASS-REFUSED now — re-stated without it; and the F4 shape (a `!{}` in an event handler inside a
// `<match>` nested in a `<match>` arm), falsely refused (E-TYPE-031) on the starting head.
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

function decls(srv) {
  return `type Inner:enum = { Bad(reason: string), Ok2 }
    type Outer:enum = { Wrapped(inner: Inner), Plain(code: number), None }
    type Holder:struct = { st: Inner, n: number }
    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: Inner), Gone }
    ${srv}function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Wrapped(Inner::Bad("bad"))
        return true
    }`;
}
const G = `if (p == "secret") { return "LOGGED IN" }\n        `;
const R = (cond) => `return (${cond}) ? "rejected" : "LOGGED IN"`;
const V = (arms) => `const v = wrap(p) !{ ${arms} }\n        return v == true ? "LOGGED IN" : v`;
const TYPES = { "types.scrml": "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n}\n" };
const ALL = ["server", "fullstack", "library", "tool"];

function cases(srv) {
  const D = decls(srv);
  const fn = (s) => `${D}\n    ${srv}${s}`;
  return [
    // [name, decls, body, sides, imports?, extraFiles?]
    ["1 M1 parameter x: Inner", fn(`function chk(x: Inner) { return x.reason == "bad" }`), G + R(`chk(Inner.Bad("bad"))`), ALL],
    ["1 M1b parameter, unit argument", fn(`function chk(x: Inner) { return x.reason != "bad" }`), G + `return chk(Inner.Ok2) ? "LOGGED IN" : "rejected"`, ALL],
    ["1 M2 typed local", D, G + `const x: Inner = Inner.Bad("bad")\n        ` + R(`x.reason == "bad"`), ALL],
    ["1 M3 local bound to E.V()", D, G + `const x = Inner.Bad("bad")\n        ` + R(`x.reason == "bad"`), ALL],
    ["1 M3b local bound to E::V()", D, G + `const x = Inner::Bad("bad")\n        ` + R(`x.reason == "bad"`), ALL],
    ["1 M3c let bound to a constructor", D, G + `let x = Inner.Bad("bad")\n        ` + R(`x.reason == "bad"`), ALL],
    ["1 M3d constructor read inline", D, G + R(`Inner.Bad("bad").reason == "bad"`), ALL],
    ["1 M4 match binder, positional", D, G + `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        const r = match w { .Wrapped(i) :> i.reason == "bad", else :> true }\n        ` + R(`r`), ALL],
    ["1 M4b match binder, named", D, G + `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        const r = match w { .Wrapped(inner: i) :> i.reason == "bad", else :> true }\n        ` + R(`r`), ALL],
    ["1 M4d match block arm binder", D, G + `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        let o = "LOGGED IN"\n        match w { .Wrapped(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }\n        return o`, ALL],
    ["1 M5 Q4 !{} .V(i) binder", D, V(`.Wrapped(i) :> i.reason == "bad" ? "rejected" : "LOGGED IN", _ :> "rejected"`), ALL],
    ["1 M5b !{} | ::V i binder", D, `const v = wrap(p) !{\n            | ::Wrapped i :> i.reason == "bad" ? "rejected" : "LOGGED IN"\n            | _ :> "rejected"\n        }\n        return v == true ? "LOGGED IN" : v`, ALL],
    ["1 M5d !{} ::V(i) binder", D, V(`::Wrapped(i) :> i.reason == "bad" ? "rejected" : "LOGGED IN", _ :> "rejected"`), ALL],
    ["1 M5e !{} block arm .V(i)", D, `let o = "LOGGED IN"\n        const v = wrap(p) !{ .Wrapped(i) :> { if (i.reason == "bad") { o = "rejected" } }, _ :> { o = "rejected" } }\n        return v == true ? "LOGGED IN" : o`, ["server", "tool"]],
    ["1 M6 struct field holding the enum", fn(`function chk(h: Holder) { return h.st.reason == "bad" }`), G + R(`chk({ st: Inner.Bad("bad"), n: 1 })`), ALL],
    ["1 M7 call of a function declared -> Inner", fn(`function mk() -> Inner { return Inner.Bad("bad") }`), G + R(`mk().reason == "bad"`), ALL],
    ["1 M7b call of a function returning a constructor", fn(`function mk() { return Inner.Bad("bad") }`), G + R(`mk().reason == "bad"`), ALL],
    ["1 M8 method call on the enum value", fn(`function chk(x: Inner) { return x.toString() == "bad" }`), G + R(`chk(Inner.Bad("bad"))`), ALL],
    ["1 M9 bracket read", fn(`function chk(x: Inner) { return x["reason"] == "bad" }`), G + R(`chk(Inner.Bad("bad"))`), ALL],
    ["1 M10 enum-typed cell", D, G + R(`@st.reason == "bad"`), ["fullstack"], "cell"],
    ["1 M11 imported enum parameter", `function chk(x: Inner) { return x.reason == "bad" }`, G + R(`chk(Inner.Bad("bad"))`), ["tool"], `import { Inner } from "./types.scrml"`, TYPES],
    ["1 M13 for-of over an enum tape", D, G + `const xs: Inner[] = [Inner.Bad("bad")]\n        let o = "LOGGED IN"\n        for (const x of xs) { if (x.reason == "bad") { o = "rejected" } }\n        return o`, ALL],
    // acceptance controls (pinned PASS)
    ["VALID .variant read", fn(`function chk(x: Inner) { return x.variant == "Bad" }`), G + R(`chk(Inner.Bad("bad"))`), ALL],
    ["VALID primitive binder through a nested match", D, V(`.Wrapped(i) :> (match i { .Bad(r) :> r == "bad", else :> false }) ? "rejected" : "LOGGED IN", _ :> "rejected"`), ALL],
    ["VALID is-test on a payload binder", D, V(`.Wrapped(i) :> i is .Bad ? "rejected" : "LOGGED IN", _ :> "rejected"`), ALL],
    ["VALID primitive struct field beside an enum field", fn(`function chk(h: Holder) { return h.n == 1 }`), G + R(`chk({ st: Inner.Bad("bad"), n: 1 })`), ALL],
  ];
}

// The r7 `VALID` controls (r7-shapes.js), with its declarations minus `getReason` / `getReasonT`.
const ENUM7 = `type AuthErr:enum = { Denied(reason: string), Gone }`;
function r7Valid(srv) {
  const D7 = (withDescribe) => `${ENUM7}
    type Phase:enum = { Idle, Failed(err: AuthErr) }
    const bad = "bad"
    ${withDescribe ? `${srv}function describe(x: AuthErr) { return match x { .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" } }` : ""}
    ${srv}function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
  const X = (cond) => `const v = wrap(p) !{ _ e :> ${cond} ? "rejected" : "LOGGED IN" }\n        return v == true ? "LOGGED IN" : v`;
  const B = (blk) => `let o = "LOGGED IN"\n        const v = wrap(p) !{ _ e :> {\n            ${blk}\n        } }\n        return v == true ? "LOGGED IN" : o`;
  return [
    ["VALID r7 is variant", D7(false), X(`e is .Denied`), ALL],
    ["VALID r7 e.variant", D7(false), X(`e.variant == "Denied"`), ALL],
    ["VALID r7 match e", D7(false), `const v = wrap(p) !{ _ e :> match e { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", else :> "rejected" } }\n        return v == true ? "LOGGED IN" : v`, ALL],
    ["VALID r7 describe(e) typed with the same enum", D7(true), `const v = wrap(p) !{ _ e :> describe(e) }\n        return v == true ? "LOGGED IN" : v`, ["server", "fullstack", "library"]],
    ["VALID r7 into a variant typed with the enum", D7(false), B(`const ph = Phase.Failed(e)\n            o = match ph { .Failed(x) :> "rejected", else :> "LOGGED IN" }`), ALL],
    ["VALID r7 logged", D7(false), B(`log("denied", e)\n            o = "rejected"`), ["server", "fullstack", "tool"]],
  ];
}

function page(side, d, body, imports = "", cell = false) {
  const cellDecl = cell ? `<st>: Inner = Inner.Bad("bad")\n` : "";
  if (side === "library") return `${imports}
\${
    ${d}
    export function login(p) {
        ${body}
    }
}
`;
  if (side === "tool") return `<program kind="tool">
${imports}
\${
    ${d}
    function login(p) {
        ${body}
    }
    function main(args) {
        log(login(args[0]))
    }
}
</program>
`;
  if (side === "server") return `${imports}
<msg> = "init"
\${
    ${d}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
  return `${imports}
<msg> = "init"
${cellDecl}\${
    ${d}
    function login(p) {
        ${body}
    }
    function go(p) { @msg = login(p) }
}
<button id="wrong" onclick=go("wrong")>go</button>
<button id="right" onclick=go("secret")>go</button>
<p id="out">\${@msg}</p>
`;
}

// F4 (fullstack): a `!{}` in an event handler inside a `<match>` nested in a `<match>` arm. The OK arm
// is pinned PASS (falsely refused E-TYPE-031 on 91c1c9ca4); the BAD twin stays refused (E-TYPE-004).
function f4Pages() {
  const pg = (arm) => `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    type Ph:enum = { A, B(n: number) }
    server function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
<msg> = "init"
<ph>: Ph = .A
<match for=Ph on=@ph>
  <A><match for=Ph on=@ph>
  <A><button id="wrong" onclick=\${ @msg = wrap("wrong") !{ ${arm} } }>w</button><button id="right" onclick=\${ @msg = "LOGGED IN" }>r</button></>
  <B n>b</>
</match></>
  <B n>b</>
</match>
<p id="out">\${@msg}</p>
`;
  return [
    ["VALID F4 nested <match> in an arm, _ e :> e is .Denied", pg(`_ e :> e is .Denied ? "rejected" : "LOGGED IN"`), undefined],
    ["VALID F4 nested <match> in an arm, binder-less _ :>", pg(`_ :> "rejected"`), undefined],
    ["F4 BAD nested <match> in an arm, e.reason", pg(`_ e :> e.reason == "bad" ? "rejected" : "LOGGED IN"`), undefined],
  ];
}

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = [];
  for (const [n, d, b, sides, imp, extra] of [...cases(srv), ...r7Valid(srv)]) {
    if (!sides.includes(side)) continue;
    const cell = imp === "cell";
    out.push([n, page(side, d, b, cell ? "" : (imp ?? ""), cell), cell ? undefined : (extra ?? undefined)]);
  }
  return side === "fullstack" ? [...out, ...f4Pages()] : out;
}
