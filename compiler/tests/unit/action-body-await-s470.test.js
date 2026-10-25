/**
 * s470-action-body-await (SECURITY, impl#1) — a waiting value in an ACTION body impl#1 emits
 * synchronously is refused; in an action body it emits async, it is awaited.
 *
 * SPEC §13.8 "The rule": a waiting value SHALL stand only "(i) At a suspension point of an action
 * position, where the compiler awaits it" — the action positions include a lifecycle element body,
 * an engine `effect=` / `<onTransition>` and a body-top statement list — and "Everywhere else a
 * waiting value SHALL be a compile error." impl#1 has an async host for a function body, an event
 * handler, `on mount { }`, a `when … changes { }` body and an engine opener `effect=`. It has none
 * for module-init statements, a `<request>` / `<timer>` / `<poll>` body, a runtime `^{ }`, an engine
 * state-child `effect=`, an `<onTransition>` body / guard, a message arm, an `after=` delay: there
 * it emitted the call un-awaited, so `if (isOk(@pw))` tested a pending Promise (always truthy) and a
 * wrong password logged in. Every REFUSED source below compiled at exit 0 on main 4058bd052 and
 * emitted the server stub (or helper) without `await` (measured: docs/changes/s470-action-body-await).
 *
 * Two shapes stay accepted in a synchronous body because their emission is already right: a whole
 * cell write of one call of a function the file declares (`@cell = f(args)`, which emit-client's
 * reactive-set lift awaits — NOT in a `^{ }`, which is lowered through `_scrml_cap.*` and is not
 * lifted, fix round 1 H1) and a bare call statement (its value is discarded).
 *
 * Fix round 1 (ruling: user-voice-scrml.md S470 "Mint E-IMPL1 code (Recommended)") — an action
 * position impl#1 cannot await is E-IMPL1-ACTION-NOT-AWAITED (an impl#1 limit, not a language rule);
 * render / value positions (a cell declaration's initializer) keep E-VALUE-SERVER-CALL. H2: a local
 * function (a lambda / `function` value, a nested `function`, an IIFE) whose body waits, declared in
 * an engine body, a `^{ }`, a `when` body or the opener `effect=`, and a waiting call inside a
 * callback in a `when` body / the opener, are refused: nothing awaits them there.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const CODE = "E-VALUE-SERVER-CALL";
const ACTION = "E-IMPL1-ACTION-NOT-AWAITED";

function compileFiles(files) {
  const dir = resolve(tmpdir(), `scrml-s470-await-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const [name, src] of Object.entries(files)) {
    const p = resolve(dir, name);
    writeFileSync(p, src);
    paths.push(p);
  }
  try {
    const result = compileScrml({ inputFiles: paths, write: false, outputDir: resolve(dir, "out"), log: () => {} });
    const all = [...(result.errors ?? []), ...(result.warnings ?? [])];
    const hits = all.filter((e) => e.code === CODE || e.code === ACTION);
    const outs = [...(result.outputs?.values?.() ?? [])];
    const page = outs.find((o) => /app/.test(String(o.sourceFile ?? o.filePath ?? ""))) ?? outs[outs.length - 1] ?? {};
    return { codes: all.map((e) => e.code), hits, hitCodes: [...new Set(hits.map((e) => e.code))], messages: hits.map((e) => e.message), clientJs: page.clientJs ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const compile = (src) => compileFiles({ "app.scrml": src });

const page = (view) => `<pw> = ""
<msg> = ""
<c> = true
\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
${view}
<p>\${@msg}</p>
`;
const ENG = (body) => `type Phase:enum = { Idle, Active }\n${body}`;

// [view, fragment the message must name]
// [view, fragment the message must name, code (default E-IMPL1-ACTION-NOT-AWAITED)]
const H2 = {
  "a const lambda": "const f = () => isOk(@pw)\n if (f()) { @msg = \"IN\" }",
  "a block lambda": "const f = () => { return isOk(@pw) }\n if (f()) { @msg = \"IN\" }",
  "a function expression": "const f = function () { return isOk(@pw) }\n if (f()) { @msg = \"IN\" }",
  "a nested function": "function f() { return isOk(@pw) }\n if (f()) { @msg = \"IN\" }",
  "a helper through a lambda": "const f = () => allowed(@pw)\n if (f()) { @msg = \"IN\" }",
  "an alias of the function": "const f = isOk\n if (f(@pw)) { @msg = \"IN\" }",
};
const H2_HOSTS = {
  "state effect=": (b) => ENG(`<engine for=Phase>\n  <Idle rule=.Active effect=\${ ${b} }/>\n  <Active/>\n</>`),
  "<onTransition>": (b) => ENG(`<engine for=Phase>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>\${ ${b} }</onTransition>\n</>`),
  "^{ }": (b) => `^{ ${b} }`,
  "when body": (b) => `\${ when @pw changes { ${b} } }`,
  "opener effect=": (b) => ENG(`<engine for=Phase effect=\${ ${b} }>\n  <Idle rule=.Active/>\n  <Active/>\n</>`),
};
const REFUSED_FR1 = {
  // H1 — a `^{ }` cell write is lowered through `_scrml_cap.*` and NOT lifted
  "^{ } whole cell write": ["^{ @msg = isOk(@pw) }", "a runtime `^{ }` body"],
  "^{ } whole cell write under if": ["^{ if (@c) { @msg = isOk(@pw) } }", "a runtime `^{ }` body"],
  "^{ } whole cell write under for": ["^{ for (const x of [1]) { @msg = isOk(@pw) } }", "a runtime `^{ }` body"],
  // H2 sync callbacks in the async hosts
  "when body: a forEach callback": ["${ when @pw changes { [@pw].forEach(x => { if (isOk(x)) { @msg = \"IN\" } }) } }", "inside a nested function"],
  "when body: an IIFE": ["${ when @pw changes { if ((() => isOk(@pw))()) { @msg = \"IN\" } } }", "inside a nested function"],
  "opener effect=: a forEach callback": [ENG("<engine for=Phase effect=${ [@pw].forEach(x => { if (isOk(x)) { @msg = \"IN\" } }) }>\n  <Idle rule=.Active/>\n  <Active/>\n</>"), "inside a nested function"],
  "when body: a `!{ }`-handled call": ["${ when @pw changes { @msg = isOk(@pw) !{ _ :> \"err\" } } }", "handled with"],
};
for (const [hn, h] of Object.entries(H2_HOSTS)) for (const [bn, b] of Object.entries(H2)) REFUSED_FR1[`H2 ${hn}: ${bn}`] = [h(b), "`"];

const REFUSED = {
  // module init — the lane-2 reproducers (l2c/miss)
  "module init: block `{ ok = isOk(@pw) }`": ["${ let ok = false\n{ ok = isOk(@pw) } }", "server function `isOk`"],
  "module init: `if ((ok = isOk(@pw)))`": ["${ let ok = false\nif ((ok = isOk(@pw))) { } }", "module init"],
  "module init: `console.log(ok = isOk(@pw))`": ["${ let ok = false\nconsole.log(ok = isOk(@pw)) }", "module init"],
  "module init: `@c && (ok = isOk(@pw))`": ["${ let ok = false\n@c && (ok = isOk(@pw)) }", "module init"],
  "module init: ternary assignment": ["${ let ok = false\n@c ? (ok = isOk(@pw)) : 0 }", "module init"],
  "module init: `Object.assign(box, { v: isOk(@pw) })`": ["${ const box = {}\nObject.assign(box, { v: isOk(@pw) }) }", "module init"],
  "module init: `arr.push(isOk(@pw))`": ["${ const arr = []\narr.push(isOk(@pw)) }", "module init"],
  "module init: C-style `for` head": ["${ let ok = false\nfor (ok = isOk(@pw); false; ) { } }", "module init"],
  "module init: `if (isOk(@pw))` condition": ["${ let ok = false\nif (isOk(@pw)) { ok = true } }", "module init"],
  "module init: `if (allowed(@pw))` (async helper)": ["${ let ok = false\nif (allowed(@pw)) { ok = true } }", "`allowed`"],
  "module init: cell write that tests the call": ["${ @msg = isOk(@pw) ? \"IN\" : \"no\" }", "the value written to `@msg`"],
  "module init: a lambda body (`setTimeout`)": ["${ setTimeout(() => { if (isOk(@pw)) { @msg = \"IN\" } }, 10) }", "module init"],
  "module init: a collection callback": ["${ const xs = [1]\nxs.forEach(x => { if (isOk(@pw)) { @msg = \"IN\" } }) }", "module init"],
  "module init: the call is an argument of a bare call": ["${ console.log(isOk(@pw)) }", "module init"],
  "cell declaration whose initializer tests the call": ["<v> = isOk(@pw) ? \"a\" : \"b\"\n<p>${@v}</p>", "the initializer of cell `@v`", CODE],
  "a non-rendering `${ }` in markup": ["<div>${ if (isOk(@pw)) { @msg = \"IN\" } }</div>", "<div>"],
  "<onMount> tag body (a plain element: its `${ }` runs at module init)": ["<onMount>${ if (isOk(@pw)) { @msg = \"IN\" } }</>", "<onMount>"],
  "<onUnmount> tag body": ["<onUnmount>${ @msg = isOk(@pw) ? \"a\" : \"b\" }</>", "<onUnmount>"],
  "<timeout> body": ["<timeout delay=10>${ @msg = isOk(@pw) ? \"a\" : \"b\" }</>", "<timeout>"],
  // lifecycle element bodies
  "<request> body ternary": ["<request id=\"r\">${ @msg = isOk(@pw) ? \"a\" : \"b\" }</>", "the body of <request>"],
  "<request> body test": ["<request id=\"r\" deps=[@pw]>${ if (isOk(@pw)) { @msg = \"IN\" } }</>", "the body of <request>"],
  "<request> body helper ternary": ["<request id=\"r\">${ @msg = allowed(@pw) ? \"a\" : \"b\" }</>", "`allowed`"],
  "<timer> body test": ["<timer interval=1000>${ if (isOk(@pw)) { @msg = \"IN\" } }</timer>", "the body of <timer>"],
  "<timer> body helper": ["<timer interval=1000>${ @msg = allowed(@pw) ? \"a\" : \"b\" }</timer>", "`allowed`"],
  "<timer> body lambda": ["<timer interval=1000>${ setTimeout(() => { if (isOk(@pw)) { @msg = \"IN\" } }, 1) }</timer>", "the body of <timer>"],
  "<poll> body ternary": ["<poll interval=1000>${ @msg = isOk(@pw) ? \"a\" : \"b\" }</poll>", "the body of <poll>"],
  // runtime meta
  "runtime ^{ } ternary": ["^{ @msg = isOk(@pw) ? \"IN\" : \"no\" }", "a runtime `^{ }` body"],
  "runtime ^{ } test": ["^{ if (isOk(@pw)) { @msg = \"IN\" } }", "a runtime `^{ }` body"],
  "runtime ^{ } declaration": ["^{ const r = isOk(\"x\") }", "the initializer of `r`"],
  // engine bodies
  "engine state-child effect= ternary": [ENG("<engine for=Phase>\n  <Idle rule=.Active effect=${ @msg = isOk(@pw) ? \"a\" : \"b\" }/>\n  <Active/>\n</>"), "the `effect=` body of state .Idle"],
  "engine state-child effect= test": [ENG("<engine for=Phase>\n  <Idle rule=.Active effect=${ if (isOk(@pw)) { @msg = \"IN\" } }/>\n  <Active/>\n</>"), "the `effect=` body of state .Idle"],
  "engine <onTransition> body ternary": [ENG("<engine for=Phase>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>${ @msg = isOk(@pw) ? \"a\" : \"b\" }</onTransition>\n</>"), "the <onTransition> body"],
  "engine <onTransition> body test": [ENG("<engine for=Phase>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>${ if (isOk(@pw)) { @msg = \"IN\" } }</onTransition>\n</>"), "the <onTransition> body"],
  "engine <onTransition if=> guard": [ENG("<engine for=Phase>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active if=${isOk(@pw)}>${ @msg = \"IN\" }</onTransition>\n</>"), "the <onTransition if=> guard"],
  "engine message arm": ["type Phase:enum = { Idle, Active }\ntype Msg:enum = { Go }\n<engine for=Phase initial=.Idle accepts=Msg>\n  <Idle rule=.Active>\n    | .Go :> { @msg = isOk(@pw) ? \"IN\" : \"no\"; .Active }\n    | _ :> @phase\n  </>\n  <Active rule=.Idle>\n    | _ :> @phase\n  </>\n</>\n<button onclick=@phase.advance(.Go)>adv</button>", "the message arm .Go of state .Idle"],
};

// Accepted: action bodies impl#1 awaits, and the two synchronous shapes whose emission is right.
const ACCEPTED = {
  "module init: whole cell write of a server call": "${ @msg = isOk(@pw) }",
  "module init: whole cell write of an async helper": "${ @msg = allowed(@pw) }",
  "module init: whole cell write under `if`": "${ if (@c) { @msg = isOk(@pw) } }",
  "module init: whole cell write with `!{ }`": "${ @msg = isOk(@pw) !{ _ :> \"err\" } }",
  "module init: a bare call (fire-and-forget)": "${ isOk(@pw) }",
  "cell declaration of a server call": "<v> = isOk(@pw)\n<p>${@v}</p>",
  "<request> whole cell write": "<request id=\"r\">${ @msg = isOk(@pw) }</>",
  "<request> whole cell write of a helper": "<request id=\"r\">${ @msg = allowed(@pw) }</>",
  "<poll> whole cell write": "<poll interval=1000>${ @msg = isOk(@pw) }</poll>",
  "<timer> bare call": "<timer interval=1000>${ isOk(@pw) }</timer>",
  "engine <onTransition> whole cell write": ENG("<engine for=Phase>\n  <Idle rule=.Active/>\n  <Active/>\n  <onTransition from=.Idle to=.Active>${ @msg = isOk(@pw) }</onTransition>\n</>"),
  "function body": "${ function f() { if (isOk(@pw)) { @msg = \"IN\" } } }\n<button onclick=f()>x</button>",
  "function body, helper": "${ function f() { if (allowed(@pw)) { @msg = \"IN\" } } }\n<button onclick=f()>x</button>",
  "event handler block": "<button onclick=${ if (isOk(@pw)) { @msg = \"IN\" } }>x</button>",
  "event handler ternary": "<button onclick=${ @msg = isOk(@pw) ? \"IN\" : \"no\" }>x</button>",
  "event handler, helper": "<button onclick=${ if (allowed(@pw)) { @msg = \"IN\" } }>x</button>",
  "on mount": "${ on mount { if (isOk(@pw)) { @msg = \"IN\" } } }",
  "on mount, helper": "${ on mount { if (allowed(@pw)) { @msg = \"IN\" } } }",
  "when … changes": "${ when @pw changes { @msg = isOk(@pw) ? \"IN\" : \"no\" } }",
  "when … changes, helper": "${ when @pw changes { if (allowed(@pw)) { @msg = \"IN\" } } }",
  "engine opener effect=": ENG("<engine for=Phase effect=${ @msg = isOk(@pw) ? \"a\" : \"b\" }>\n  <Idle rule=.Active/>\n  <Active/>\n</>"),
  "engine opener effect=, helper": ENG("<engine for=Phase effect=${ if (allowed(@pw)) { @msg = \"IN\" } }>\n  <Idle rule=.Active/>\n  <Active/>\n</>"),
  "a sync helper in a timer": "${ function plain(q) { return q == \"secret\" } }\n<timer interval=1000>${ if (plain(@pw)) { @msg = \"IN\" } }</timer>",
};

describe("s470-action-body-await — a waiting value in a synchronous action body is refused", () => {
  for (const [name, [view, frag, code]] of Object.entries({ ...REFUSED, ...REFUSED_FR1 })) {
    test(`refused: ${name}`, () => {
      const r = compile(page(view));
      expect(r.hits.length).toBeGreaterThan(0);
      expect(r.hitCodes).toEqual([code ?? ACTION]);
      const all = r.messages.join("\n");
      expect(all).toContain(frag);
      if ((code ?? ACTION) === ACTION) {
        // The impl#1-limit framing and the fix (a handler / `on mount`, or a `<request>` into a cell).
        expect(all).toContain("impl#1 limit, not a language rule");
        expect(all).toContain("`on mount { }`");
        expect(all).toContain("<request");
        // Never the H1 advice (a whole cell write is not awaited everywhere).
        expect(all).not.toContain("as the whole statement");
      } else {
        expect(all).toContain("writes a cell");
      }
    });
  }
});

describe("s470-action-body-await — accepted: awaited hosts and the two right synchronous shapes", () => {
  for (const [name, view] of Object.entries(ACCEPTED)) {
    test(`not this code: ${name}`, () => {
      const r = compile(page(view));
      expect(r.messages).toEqual([]);
    });
  }
});

describe("s470-action-body-await — the async hosts await an async-coloured client helper", () => {
  test("a `when … changes` body awaits a helper call (was un-awaited)", () => {
    const r = compile(page("${ when @pw changes { if (allowed(@pw)) { @msg = \"IN\" } } }"));
    expect(r.messages).toEqual([]);
    expect(r.clientJs).toMatch(/async function\(\) \{ if \(await _scrml_allowed_\d+\(/);
  });
  test("an engine opener effect= awaits a helper call (was un-awaited)", () => {
    const r = compile(page(ENG("<engine for=Phase effect=${ if (allowed(@pw)) { @msg = \"IN\" } }>\n  <Idle rule=.Active/>\n  <Active/>\n</>")));
    expect(r.messages).toEqual([]);
    expect(r.clientJs).toMatch(/\(async function \(\) \{\s*if \(await _scrml_allowed_\d+\(/);
  });
  test("control: the server-call form of both is still awaited", () => {
    const w = compile(page("${ when @pw changes { if (isOk(@pw)) { @msg = \"IN\" } } }"));
    expect(w.clientJs).toMatch(/if \(await _scrml_fetch_isOk_\d+\(/);
  });
});

describe("s470-action-body-await — the lift exemption is limited to what the lift awaits", () => {
  const lib = "${\n    export server function isOk(p) { return p == \"secret\" }\n}\n";
  const app = (view) => `<pw> = ""\n<msg> = ""\n\${\n    import { isOk } from "./lib.scrml"\n    function login(p) { @pw = p }\n}\n<button onclick=login("wrong")>go</button>\n${view}\n<p>\${@msg}</p>\n`;
  test("a whole cell write of an IMPORTED server function at module init is refused (emitted un-awaited)", () => {
    const r = compileFiles({ "lib.scrml": lib, "app.scrml": app("${ @msg = isOk(@pw) }") });
    expect(r.hits.length).toBeGreaterThan(0);
  });
  test("…and in a <request> body", () => {
    const r = compileFiles({ "lib.scrml": lib, "app.scrml": app("<request id=\"r\">${ @msg = isOk(@pw) }</>") });
    expect(r.hits.length).toBeGreaterThan(0);
  });
  test("control: the imported function in a handler is awaited, not refused", () => {
    const r = compileFiles({ "lib.scrml": lib, "app.scrml": app("<button onclick=${ if (isOk(@pw)) { @msg = \"IN\" } }>x</button>") });
    expect(r.messages).toEqual([]);
  });
});
