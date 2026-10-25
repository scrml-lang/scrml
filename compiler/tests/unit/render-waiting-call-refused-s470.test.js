/**
 * S470 — a waiting value in a RENDER position is E-VALUE-SERVER-CALL (§13.7 / §13.8).
 *
 * Provenance: ruling:user-voice-scrml.md S469 item 1 — "A server/async call in a render position
 * (`<span if=${allowed(@pw)}>` with an async `allowed`, `${match check(@pw) {…}}` in markup, a
 * derived cell `const <ok> = check(@pw)`): Refuse in impl#1 (Recommended)." SPEC §13.7 already
 * names the code for every value position (an interpolation, an attribute value, a derived
 * formula), so impl#1 reports E-VALUE-SERVER-CALL. Gaps g-markup-gate-tests-server-call-promise,
 * g-derived-cell-rhs-server-call-renders-promise, g-render-match-async-subject-unawaited-s469.
 *
 * A render position re-evaluates synchronously, so on main every REFUSED source below held a pending
 * Promise (always truthy) — an `if=` gate opened on a wrong password. The ACCEPTED sources are action
 * positions (a handler, a function body, a `<request>`, `on mount`, `when … changes`, a default-logic
 * body's bare expression), a sync helper, and the S469 r2 member call `q.includes(…)` beside a server
 * function named `includes` (a member call is not a call of that function).
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const CODE = "E-VALUE-SERVER-CALL";
// fix round 1 of s470-action-body-await (ruling S470 "Mint E-IMPL1 code") — a module-init statement
// is an ACTION position (a body-top statement list, §13.8 (i)): impl#1's refusal there is
// E-IMPL1-ACTION-NOT-AWAITED, not E-VALUE-SERVER-CALL.
const ACTION = "E-IMPL1-ACTION-NOT-AWAITED";

function compile(src) {
  const dir = resolve(tmpdir(), `scrml-s470-render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "app.scrml");
  writeFileSync(file, src);
  try {
    const result = compileScrml({ inputFiles: [file], write: false, outputDir: resolve(dir, "out"), log: () => {} });
    const all = [...(result.errors ?? []), ...(result.warnings ?? [])];
    const hits = all.filter((e) => e.code === CODE || e.code === ACTION);
    return { codes: all.map((e) => e.code), hits, messages: hits.map((e) => e.message) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const page = (view, extra = "") => `type Phase:enum = { Idle, Active }
<ph> = Phase.Idle
<pw> = ""
<xs> = [1]
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function plain(q) { return q == "secret" }
    function login(p) { @pw = p }
${extra}
}
<button onclick=login("wrong")>go</button>
${view}
`;

// [view, fragment the message must name]
const REFUSED = {
  "interpolation, server call": [`<p>\${isOk(@pw) ? "IN" : "no"}</p>`, "server function `isOk`"],
  "interpolation, async helper": [`<p>\${allowed(@pw) ? "IN" : "no"}</p>`, "`allowed`"],
  "if=, async helper": [`<p><span if=\${allowed(@pw)}>IN</span></p>`, "`if=` value"],
  "if=, unbraced call": [`<p><span if=allowed(@pw)>IN</span></p>`, "`if=` value"],
  "if= with &&": [`<p><span if=\${@pw != "" && allowed(@pw)}>IN</span></p>`, "`if=` value"],
  "show=": [`<p><span show=\${isOk(@pw)}>IN</span></p>`, "`show=` value"],
  "else-if=": [`<p><span if=\${@pw == "z"}>a</span><span else-if=\${isOk(@pw)}>IN</span></p>`, "condition"],
  "class=": [`<p class=\${isOk(@pw) ? "a" : "b"}>x</p>`, "`class=` value"],
  "quoted attribute with an interpolation": [`<p title="t \${isOk(@pw)}">x</p>`, "`title=` value"],
  "derived cell": [`\${ const <ok> = @pw != "" && allowed(@pw) }\n<p>\${@ok}</p>`, "derived `@ok`"],
  "derived cell, match subject": [`\${ const <ok> = match isOk(@pw) { true :> "IN", else :> "no" } }\n<p>\${@ok}</p>`, "derived `@ok`"],
  "interpolation, match subject": [`<p>\${match isOk(@pw) { true :> "IN", else :> "no" }}</p>`, "`isOk`"],
  "interpolation, match arm value": [`<p>\${match @pw { "" :> "no", else :> isOk(@pw) ? "IN" : "no" }}</p>`, "`isOk`"],
  "template literal in an interpolation": ["<p>${`v ${isOk(@pw)}`}</p>", "`isOk`"],
  "lambda in an interpolation": [`<p>\${@xs.map((x) => isOk(@pw) ? "IN" : "no")}</p>`, "`isOk`"],
  "markup held by an expression": [`<p>\${ @pw != "" ? <span>\${isOk(@pw)}</span> : "" }</p>`, "`isOk`"],
  "value-form if lifting markup": [`<p>\${ if (allowed(@pw)) { lift <span>IN</span> } }</p>`, "`allowed`"],
  "for lifting markup": [`<p>\${ for (const x of (isOk(@pw) ? @xs : [])) { lift <span>IN</span> } }</p>`, "`isOk`"],
  "for lifting markup in a program body": [`\${ for (const x of @xs) { lift <span>\${isOk(@pw)}</span> } }`, "`isOk`"],
  "<each> row interpolation": [`<p><each in=@xs as x>\${isOk(@pw)}</each></p>`, "`isOk`"],
  "<each if=>": [`<p><each in=@xs as x if=\${isOk(@pw)}>IN</each></p>`, "`if=` value of <each>"],
  "<match on=>": [`<p><match for=Phase on=\${isOk(@pw) ? Phase.Active : Phase.Idle}><Idle>no</Idle><Active>IN</Active></match></p>`, "`<match on=>`"],
  "<match> arm body": [`<p><match for=Phase on=@ph><Idle>\${isOk(@pw)}</Idle><Active>x</Active></match></p>`, "`isOk`"],
  "engine derived=": [`<engine for=Phase derived=isOk(@pw) ? .Active : .Idle>\n  <Idle/>\n  <Active/>\n</>\n<p>\${@phase}</p>`, "engine `derived=`"],
  "component prop": [`<p><Gate ok=\${isOk(@pw)}/></p>`, "`ok=` value", `    const Gate = <span>\${props.ok}</span>`],
};

const ACCEPTED = {
  "handler calling a server function": `<button onclick=\${() => { @pw = isOk("x") ? "a" : "b" }}>x</button>`,
  "function body": `\${ function go() { const v = allowed(@pw); @pw = v ? "a" : "b" } }\n<button onclick=go()>g</button>`,
  // s470-action-body-await — a <request> body is an action body impl#1 runs synchronously: only
  // the whole cell write of one call (awaited by the settle machine) is accepted; the ternary
  // form this entry used to hold is refused (action-body-await-s470.test.js).
  "<request> body": `<request id="r1" deps=[]>\${ @pw = isOk("x") }</>`,
  "on mount": `\${ on mount { allowed("a") } }`,
  "when … changes": `\${ when @pw changes { allowed(@pw) } }`,
  "a sync helper in if=": `<p><span if=\${plain(@pw)}>IN</span></p>`,
  "a sync helper in an interpolation": `<p>\${plain(@pw) ? "IN" : "no"}</p>`,
  "a handler in markup held by an expression": `<p>\${ @pw != "" ? <button onclick=\${() => login(isOk("x") ? "a" : "b")}>s</button> : "" }</p>`,
  "a handler attribute beside a render attribute": `<button class=\${plain(@pw) ? "a" : "b"} onclick=\${() => login(isOk("x") ? "a" : "b")}>s</button>`,
};

describe("S470 E-VALUE-SERVER-CALL — a waiting value in a render position", () => {
  for (const [name, [view, frag, extra]] of Object.entries(REFUSED)) {
    test(`refused: ${name}`, () => {
      const r = compile(page(view, extra ?? ""));
      expect(r.hits.length).toBeGreaterThan(0);
      expect(r.messages.join("\n")).toContain(frag);
      expect(r.messages[0]).toContain("§13.9");
      expect(r.messages[0]).toContain("writes a cell");
    });
  }
  for (const [name, view] of Object.entries(ACCEPTED)) {
    test(`not this code: ${name}`, () => {
      const r = compile(page(view));
      expect(r.messages).toEqual([]);
    });
  }

  test("S469 r2: a member call `q.includes(…)` is not a call of `server function includes`", () => {
    const src = `<pw> = ""
\${
    server function includes(x) { return false }
    function allowed(q) { const s: string = q
        return match s { "" :> false, else :> q.includes("ecre") } }
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
<p><span if=\${allowed(@pw)}>IN</span></p>
`;
    expect(compile(src).messages).toEqual([]);
  });

  test("a server fn declared in an if=/else chain branch, rendered in that branch, is refused too", () => {
    // The file's async set (collectTopLevelStatements) does not see a function declared in a chain
    // branch; the refusal reads the server placement of every function in the tree.
    const src = `<open> = true
<div if=@open>\${ server fn zzload() { return 41 + 1 } }<p>v \${zzload()}</p></div>
<div else><p>c</p></div>
`;
    expect(compile(src).messages.join("\n")).toContain("server function `zzload`");
  });

  // ---- S470 fix round (review of d4e9c2545) ----
  const chainPage = (chain, after = "") => `<pw> = ""
<c> = true
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
${chain}
<div else><p>c</p></div>
${after}`;

  test("#1: a CLIENT helper declared in an if=/else chain branch, used in that branch's if=", () => {
    const r = compile(chainPage(`<div if=@c>\${ function hh(q) { return isOk(q) } }<p><span if=\${hh(@pw)}>IN</span></p></div>`));
    expect(r.messages.join("\n")).toContain("`hh`");
  });

  test("#1: … and used outside the chain", () => {
    const r = compile(chainPage(`<div if=@c>\${ function hh(q) { return isOk(q) } }<p>a</p></div>`, `<p><span if=\${hh(@pw)}>IN</span></p>`));
    expect(r.messages.join("\n")).toContain("`hh`");
  });

  const enginePage = (body) => `type Phase:enum = { Idle, Active }
<pw> = ""
<msg> = ""
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
<engine for=Phase>
${body}
</>
`;
  for (const [name, body] of Object.entries({
    "#3: a state child effect= body": `  <Idle rule=.Active effect=\${ allowed(@pw) }/>\n  <Active/>`,
    "#3: a state child effect= lambda": `  <Idle rule=.Active effect=\${ () => allowed(@pw) }/>\n  <Active/>`,
    "#3: an engine <onTransition> body": `  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ allowed(@pw) }</onTransition>`,
  })) {
    test(`not this code (action position): ${name}`, () => {
      expect(compile(enginePage(body)).messages).toEqual([]);
    });
  }

  test("#3 control: a state child's rendered body is still a render position", () => {
    expect(compile(enginePage(`  <Idle>\${isOk(@pw) ? "IN" : "no"}</Idle>\n  <Active/>`)).messages.length).toBeGreaterThan(0);
  });

  for (const [name, view] of Object.entries({
    "#5: a runtime ^{ } meta block (bare call)": `^{ isOk("x") }\n<p>x</p>`,
    // (`^{ const r = isOk("x") }` — a declaration's initializer holding a pending Promise — is
    // refused since s470-action-body-await: action-body-await-s470.test.js.)
  })) {
    test(`not this code (effect): ${name}`, () => {
      expect(compile(page(view)).messages).toEqual([]);
    });
  }

  test("#7: two sites on one line are two reports (TS boundary report + CG report)", () => {
    const src = `type AuthErr:enum = { Denied(reason: string), Gone }
<pw> = ""
\${
    server function chk(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
<errorBoundary><p>\${chk(@pw)}</p><span if=\${isOk(@pw)}>LOGGED IN</span></errorBoundary>
`;
    const r = compile(src);
    expect(r.hits.length).toBe(2);
    expect(r.messages.join("\n")).toContain("`isOk`");
  });

  test("#8: a `:`-shorthand body is reported once, at its element", () => {
    const r = compile(page(`<p : isOk(@pw) ? "IN" : "no">`));
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].span.line).toBe(13); // the `<p : …>` line of page()
  });

  test("#8: an engine `:`-shorthand state body is reported once", () => {
    const r = compile(enginePage(`  <Idle : isOk(@pw) ? "IN" : "no">\n  <Active/>`));
    expect(r.hits.length).toBe(1);
  });

  test("#2: a plain `const` initializer in a module-init `${ }` block is refused (an action statement since s470-action-body-await)", () => {
    const src = `<pw> = "wrong"
\${
    server function isOk(p) { return p == "secret" }
    const ok = isOk(@pw)
}
<p><span if=\${ok}>LOGGED IN</span></p>
`;
    const r = compile(src);
    expect(r.messages.join("\n")).toContain("the initializer of `ok`");
    expect(r.codes).toContain(ACTION);
  });

  // ---- S470 fix round 2 (review of 110dada2e) ----
  test("round 2 #1: `<engine … if=${…}>` is a render gate (emitGatedStructural)", () => {
    const r = compile(enginePage(`  <Idle><p>SECRET</p></Idle>\n  <Active><p>A</p></Active>`).replace("<engine for=Phase>", "<engine for=Phase if=${isOk(@pw)}>"));
    expect(r.messages.join("\n")).toContain("the `if=` value of <engine>");
  });

  test("round 2 #1 control: `<engine if=@c>` is not this code", () => {
    const r = compile(`<c> = true\n` + enginePage(`  <Idle><p>SECRET</p></Idle>\n  <Active><p>A</p></Active>`).replace("<engine for=Phase>", "<engine for=Phase if=@c>"));
    expect(r.messages).toEqual([]);
  });

  test("round 2 #2: an assignment inside module-init control flow stores a waiting value", () => {
    const src = `<pw> = ""\n<c> = true\n\${\n    server function isOk(p) { return p == "secret" }\n}\n\${ let ok = false\nif (@c) { ok = isOk(@pw) } }\n<p><span if=\${ok}>IN</span></p>\n`;
    const r = compile(src);
    expect(r.messages.join("\n")).toContain("server function `isOk`");
    expect(r.codes).toContain(ACTION);
  });

  test("round 2 #2: a module-scope member assignment stores a waiting value", () => {
    const src = `<pw> = ""\n\${\n    server function isOk(p) { return p == "secret" }\n}\n\${ const box = { v: false }\nbox.v = isOk(@pw) }\n<p><span if=\${box.v}>IN</span></p>\n`;
    const r = compile(src);
    expect(r.messages.join("\n")).toContain("the value assigned at module scope");
    expect(r.codes).toContain(ACTION);
  });

  test("round 2 #2 control: a module-init bare CALL is an effect, and a module-init if's condition is not judged", () => {
    const src = `<pw> = ""\n<c> = true\n\${\n    server function isOk(p) { return p == "secret" }\n}\n\${ isOk("boot")\nif (@c) { isOk("x") } }\n<p>x</p>\n`;
    expect(compile(src).messages).toEqual([]);
  });

  test("an engine derived=match on a failable server call stays E-ERROR-002", () => {
    const src = `type AuthErr:enum = { Denied(reason: string), Gone }
type Access:enum = { Granted, Rejected }
<pw> = ""
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
<engine for=Access derived=match check(@pw) { .Denied(r) :> .Rejected, .Gone :> .Rejected, else :> .Granted }>
  <Granted/>
  <Rejected/>
</>
<p>\${@access}</p>
`;
    expect(compile(src).codes).toContain("E-ERROR-002");
  });
});
