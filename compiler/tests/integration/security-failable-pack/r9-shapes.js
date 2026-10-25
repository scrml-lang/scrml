// S470 s470-bang-catch-try-body (gap g-impl1-bang-catch-try-body-cut-at-first-brace-s470) — the
// statement form `!{ tryBody } catch T [as b] { handler }` on every side (client `n29`, server `s12`,
// fullstack `f15`, library `l7`, tool `t7`). impl#1 cut the try body at its FIRST `}`, so a nested
// handler (`check(p) !{ _ :> false }`), a nested block, an object literal, a string / comment holding
// a `}` or a nested `!{}` / `match` ended the body early: the handled call lost its handler and the
// catch arms were dropped (`try { ok = check(p) } catch (e) { throw e }`), so the call's truthy error
// value logged a wrong password in. And the catch itself never handles a failable call: the call
// RETURNS its error (it does not throw), so `!{ ok = check(p) } catch AuthErr as b { ok = false }` —
// read correctly — still logged in, with no E-ERROR-002 (the try body was never type-checked).
// Data, not logic: `shapesFor(side)` returns [name, scrml source, extraFiles?]. Do not edit a shape to
// make it pass.

const ENUM = `type AuthErr:enum = { Denied(reason: string), Gone }`;
const H = `check(p) !{ _ :> false }`;
const R = `return st.ok ? "LOGGED IN" : "rejected"`;
// The verdict lives in a field of an object declared BEFORE the form (`st.ok`), so a write inside the
// try body is observable after it. The form opens a block (`if (p != "") { !{ … } catch … }`), so no
// statement precedes it: written after one, impl#1 read the whole form as that statement's postfix
// handler (group 11 below).
const T = (body, handler = "st.ok = false", arms = "", head = "catch AuthErr as b") =>
  `const st = { ok: false }\n        if (p != "") {\n        !{\n            ${body}\n        } ${head} { ${handler} }${arms}\n        }\n        ${R}`;

function cases(srv) {
  // Every shape that writes the handled call straight into the field (`st.ok = check(p) !{…}`) has a
  // twin that binds it first (`const v = check(p) !{…}` then `st.ok = v`): a handled call written
  // into a member is refused even outside this form, so only the twin shows the handler applied.
  const direct = `st.ok = ${H}`;
  const bound = `const v = ${H}\n            st.ok = v`;
  return withBoundTwins(rawCases(srv), direct, bound);
}

function withBoundTwins(list, direct, bound) {
  const out = [];
  for (const c of list) {
    out.push(c);
    if (c[2].includes(direct) && /^[1-7] /.test(c[0])) out.push([`${c[0]} (bound first)`, c[1], c[2].replace(direct, bound)]);
  }
  return out;
}

function rawCases(srv) {
  const D = `${ENUM}
    ${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
  return [
    // the try body holds a HANDLED call: every `}` before the body's own close must be read as nesting
    ["1 nested !{} (the F2 repro)", D, T(`st.ok = ${H}`)],
    ["1 nested !{} on one line", D, `const st = { ok: false }\n        if (p != "") { !{ st.ok = ${H} } catch AuthErr as b { st.ok = false } }\n        ${R}`],
    ["1 nested !{} with a block arm", D, T(`st.ok = check(p) !{ _ :> { false } }`)],
    ["2 nested block around the call", D, T(`if (p != "") {\n                st.ok = ${H}\n            }`)],
    ["2 nested block before the call", D, T(`if (p == "") { st.ok = false }\n            st.ok = ${H}`)],
    ["2 nested function before the call", D, T(`function id(x) { return x }\n            st.ok = id(${H})`)],
    ["3 object literal holding the call", D, T(`const o = { v: ${H} }\n            st.ok = o.v`)],
    ["3 object literal before the call", D, T(`const o = { a: 1 }\n            st.ok = ${H}`)],
    ["4 template literal holding braces", D, T("const s = `{}`\n            st.ok = " + H)],
    ["4 template literal holding an interpolation", D, T("const s = `${p}`\n            st.ok = " + H)],
    ["4 template literal holding a lone }", D, T("const s = `}`\n            st.ok = " + H)],
    ["5 string holding }", D, T(`const s = "}"\n            st.ok = ${H}`)],
    ["5 single-quoted string holding }", D, T(`const s = '}'\n            st.ok = ${H}`)],
    ["5 string holding {", D, T(`const s = "{"\n            st.ok = ${H}`)],
    ["5 line comment holding }", D, T(`// a } in a comment\n            st.ok = ${H}`)],
    ["5 block comment holding }", D, T(`/* a } in a comment */\n            st.ok = ${H}`)],
    ["6 nested match on the call", D, T(`const v = match check(p) { .Denied(x) :> false, .Gone :> false, else :> true }\n            st.ok = v`)],
    ["6 nested match before the call", D, T(`const q: number = 2\n            const k = match q { 1 :> 1, else :> 2 }\n            st.ok = ${H}`)],
    ["7 nested catch in the try body", D, T(`!{\n                st.ok = ${H}\n            } catch AuthErr as c { st.ok = false }`)],
    ["7 nested catch in the handler", D, T(`st.ok = ${H}`, `!{ st.ok = false } catch AuthErr as c { st.ok = false }`)],
    ["7 handler holding a string with }", D, T(`st.ok = ${H}`, `const s = "}"\n            st.ok = false`)],
    ["7 two catch arms", D, T(`st.ok = ${H}`, "st.ok = false", ` catch Error as e { st.ok = false }`)],
    ["7 catch without a binder", D, T(`st.ok = ${H}`, "st.ok = false", "", "catch AuthErr")],
    // the try body holds an UNHANDLED call: the catch cannot handle it (the call returns its error)
    ["8 unhandled call in the try body", D, T(`st.ok = check(p)`)],
    ["8 unhandled call in a block in the try body", D, T(`if (p != "") {\n                st.ok = check(p)\n            }`)],
    ["8 unhandled call in a declaration in the try body", D, T(`const v = check(p)\n            st.ok = v`)],
    ["8 unhandled call after a nested !{}", D, T(`const w = ${H}\n            st.ok = check(p)`)],
    ["8 unhandled call in a nested catch's try body", D, T(`!{\n                st.ok = check(p)\n            } catch AuthErr as c { st.ok = false }`)],
    // the form written AFTER a statement: impl#1 glued it to that statement as a postfix `!{}`
    // handler and dropped the try body, so a body that REVOKES access never ran
    ["11 after a declaration: body revokes", D, `const st = { ok: true }\n        !{\n            if (p != "secret") { st.ok = false }\n        } catch Error as e { st.ok = false }\n        ${R}`],
    ["11 after a declaration: handled call revokes", D, `const st = { ok: true }\n        !{\n            st.ok = ${H}\n        } catch AuthErr as b { st.ok = false }\n        ${R}`],
    ["11 after a semicolon: body revokes", D, `const st = { ok: true };\n        !{ if (p != "secret") { st.ok = false } } catch Error as e { st.ok = false }\n        ${R}`],
    ["11 after an assignment: body revokes", D, `const st = { ok: false }\n        st.ok = true\n        !{\n            if (p != "secret") { st.ok = false }\n        } catch Error as e { st.ok = false }\n        ${R}`],
    ["11 after a declaration in a block: body revokes", D, `const st = { ok: true }\n        if (p != "") {\n            const n = 1\n            !{ if (p != "secret") { st.ok = false } } catch Error as e { st.ok = false }\n        }\n        ${R}`],
    // a LOCAL declared before the form and written in its try body: the body was emitted without the
    // enclosing declarations, so the write became a shadowing `const` and never reached the local
    ["12 local written in the try body: handled call", D, `let ok = false\n        if (p != "") {\n        !{\n            ok = ${H}\n        } catch AuthErr as b { ok = false }\n        }\n        return ok ? "LOGGED IN" : "rejected"`],
    ["12 local written in the try body: revokes", D, `let ok = true\n        if (p != "") {\n        !{\n            if (p != "secret") { ok = false }\n        } catch Error as e { ok = false }\n        }\n        return ok ? "LOGGED IN" : "rejected"`],
  ];
}

function page(side, d, body, imports = "") {
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
\${
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

// The other positions of the form, on the sides that have them: an inline event-handler block
// (client / fullstack) and module initialisation (client / library / tool). The client check here is
// a plain `!` function on every side (a server call at module init is refused on its own).
function positionPages(side, srv) {
  const D = `${ENUM}
    ${srv}function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
  const out = [];
  if (side === "client" || side === "fullstack") {
    const hb = (p, body) => `{ !{ ${body.replaceAll("P", `"${p}"`)} } catch AuthErr as b { @ok = false } }`;
    const ev = (body) => `<ok> = false
\${
    ${D}
}
<button id="wrong" onclick=${hb("wrong", body)}>w</button>
<button id="right" onclick=${hb("secret", body)}>r</button>
<p id="out">\${@ok ? "LOGGED IN" : "rejected"}</p>
`;
    out.push(["9 event handler block: nested !{}", ev(`@ok = check(P) !{ _ :> false }`)]);
    out.push(["9 event handler block: string holding }", ev(`const s = "}"\n    @ok = check(P) !{ _ :> false }`)]);
    out.push(["9 event handler block: unhandled call", ev(`@ok = check(P)`)]);
  }
  if (side === "client" || side === "library" || side === "tool") {
    const DC = `${ENUM}
    function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
    const init = (body) => `const g = { gate: false }
    if (true) {
    !{
        ${body}
    } catch AuthErr as b { g.gate = false }
    }`;
    const login = `return (p == "secret" || g.gate) ? "LOGGED IN" : "rejected"`;
    out.push(["10 module init: nested !{}", `${DC}\n    ${init(`g.gate = check("wrong") !{ _ :> false }`)}`, login]);
    out.push(["10 module init: nested block", `${DC}\n    ${init(`if (true) { g.gate = check("wrong") !{ _ :> false } }`)}`, login]);
    out.push(["10 module init: string holding }", `${DC}\n    ${init(`const s = "}"\n        g.gate = check("wrong") !{ _ :> false }`)}`, login]);
    // the bound twins (a handled call written into a member is refused even outside this form)
    out.push(["10 module init: nested !{} (bound first)", `${DC}\n    ${init(`const v = check("wrong") !{ _ :> false }\n        g.gate = v`)}`, login]);
    out.push(["10 module init: nested block (bound first)", `${DC}\n    ${init(`if (true) {\n            const v = check("wrong") !{ _ :> false }\n            g.gate = v\n        }`)}`, login]);
    out.push(["10 module init: string holding } (bound first)", `${DC}\n    ${init(`const s = "}"\n        const v = check("wrong") !{ _ :> false }\n        g.gate = v`)}`, login]);
    out.push(["10 module init: unhandled call", `${DC}\n    ${init(`g.gate = check("wrong")`)}`, login]);
    out.push(["10 module init: after a declaration, body revokes", `${DC}\n    const g = { gate: true }\n    !{ if (true) { g.gate = false } } catch Error as e { g.gate = false }`, login]);
  }
  if (side === "client") {
    // more client positions: a nested function, a loop body, an engine opener `effect=` and an
    // `<onMount>` body (the last two run at boot, before any click: a wrong password never logs in
    // there, and the right one does not either — PASS-DENY is their correct class)
    const DC = `${ENUM}
    function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
    const forms = [
      ["handled", (pw) => `!{\n            @ok = check(${pw}) !{ _ :> false }\n        } catch AuthErr as b { @ok = false }`],
      ["handled, bound first", (pw) => `!{\n            const v = check(${pw}) !{ _ :> false }\n            @ok = v\n        } catch AuthErr as b { @ok = false }`],
      ["unhandled", (pw) => `!{\n            @ok = check(${pw})\n        } catch AuthErr as b { @ok = false }`],
    ];
    const pg = (logic, btn, extra = "", more = "") => `<ok> = false
<pw> = ""
\${
    ${DC}${more}
    function set(p) { @pw = p }
    ${logic}
}
${extra}
<button id="wrong" onclick=${btn}("wrong")>w</button>
<button id="right" onclick=${btn}("secret")>r</button>
<p id="out">\${@ok ? "LOGGED IN" : "rejected"}</p>
`;
    for (const [tag, f] of forms) {
      out.push([`13 nested function: ${tag}`, pg(`function outer(p) {\n        function inner(q) {\n        ${f("q")}\n        }\n        inner(p)\n    }`, "outer")]);
      out.push([`13 loop body: ${tag}`, pg(`function loop(q) {\n        for (let i = 0; i < 1; i++) {\n        ${f("q")}\n        }\n    }`, "loop")]);
      out.push([`13 engine opener effect: ${tag}`, pg("", "set", `<engine for=Ph initial=.A effect=\${ ${f("@pw").replaceAll("\n", " ")} }>\n  <A rule=.B><p>a</p></>\n  <B rule=.A><p>b</p></>\n</>`, "\n    type Ph:enum = { A, B }")]);
      out.push([`13 onMount body: ${tag}`, pg("", "set", `<onMount>\${ ${f('"wrong"').replaceAll("\n", " ")} }</onMount>`)]);
    }
  }
  return out;
}

export function shapesFor(side) {
  const srv = side === "server" || side === "fullstack" ? "server " : "";
  const out = cases(srv).map(([n, d, b, imp, extra]) => [n, page(side, d, b, imp ?? ""), extra ?? undefined]);
  for (const p of positionPages(side, srv)) {
    if (p.length === 2) out.push([p[0], p[1], undefined]);
    else out.push([p[0], page(side, p[1], p[2]), undefined]);
  }
  return out;
}
