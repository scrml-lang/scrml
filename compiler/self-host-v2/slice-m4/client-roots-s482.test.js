// client-roots-s482.test.js — lane s482-client-roots: the client artifact holds the functions the
// client can run, and nothing an unreached function reads.
//
// GAP g-boot-dead-client-fn-ships-server-const-s481 (MED): every function that was not server-only
// was a client root whether or not anything reached it (print.scrml printProgram clientRoots, and
// the same roots in bodyInits / serverInits / clientConsts), so a function nothing calls that reads a
// constant only server code otherwise reads published that constant in program.client.js.
// Governing: SPEC §12.2 Trigger 6 "Functions that are never called … are tree-shaken out of all
// output"; S472 "a value read only by server code never reaches the client artifact" (print.scrml
// constsReadIn); §7.6. Red on base 3e539ae73: `zz-sk-live-123` and `function dbg` in the client.
//
// GAP g-boot-server-only-init-no-server-artifact-s481 (LOW): a server-only initializer (serverInits)
// in a program that routes nothing ran nowhere — printServerBuild printed no artifact. Now the
// server artifact is printed (module initialization only, an empty manifest). Red on base: no
// program.server.js.
//
// Every case runs on the SHIPPING path: the bootstrap CLI's `compileSource` (print.scrml
// printProgram / print-server.scrml printServerBuild), the client artifact executed by the
// conformance runner's `runBootstrapArtifact` (happy-dom) — a function the client needs and the
// printer dropped would be a ReferenceError there.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-client-roots-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function compile(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function texts(res, ids, input = []) {
  const run = await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}
const fnDecl = (js, name) => new RegExp("^\\s*(async )?function " + name + "\\(", "m").test(js);

const SECRET = "zz-sk-live-123";

// =============================================================================
// A — an unreached client function is not printed, and nothing only it reads is held
// =============================================================================
describe("A — unreached client functions are tree-shaken (§12.2 Trigger 6)", () => {
  test("a1 (the gap's probe): `dbg()` nothing calls reads a constant a server function reads — the secret is not in the client", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const API_KEY: string = "${SECRET}";
    function tag(s: string) -> string { return "[" + s + "]"; }
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
    function dbg() -> string { return API_KEY; }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${tag(@out)}</p>
</program>
`);
    expect(res.client.js).not.toContain(SECRET);
    expect(fnDecl(res.client.js, "dbg")).toBe(false);
    expect(fnDecl(res.client.js, "tag")).toBe(true);          // reached from the view
    expect(res.serverJs).toContain(SECRET);                   // the server function still reads it
    expect(await texts(res, ["c"])).toEqual(["[]"]);
  }, 120000);

  test("a2: an unreached function called only by another unreached function — neither printed, nothing they read held", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const KEY: string = "${SECRET}";
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + KEY;
    }
    function inner() -> string { return KEY; }
    function outer() -> string { return inner() + "!"; }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain(SECRET);
    expect(fnDecl(res.client.js, "inner")).toBe(false);
    expect(fnDecl(res.client.js, "outer")).toBe(false);
  }, 120000);

  test("a3: a recursive function nothing calls is dropped; one the view reaches is kept and runs", async () => {
    const res = await compile(`<program>
\${
    function fact(k: int) -> int { if (k <= 1) { return 1; } return k * fact(k - 1); }
    function spin(k: int) -> int { if (k <= 0) { return 0; } return spin(k - 1); }
}
<p id="c">\${fact(5)}</p>
</program>
`);
    expect(fnDecl(res.client.js, "fact")).toBe(true);
    expect(fnDecl(res.client.js, "spin")).toBe(false);
    expect(await texts(res, ["c"])).toEqual(["120"]);
  }, 120000);

  test("a4: a dead function reading a server-only initializer's binding (#2041 r1) — the secret stays out", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const SALT: string = "${SECRET}";
    function mix(s: string) -> string { return s + SALT; }
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return mix(r.name);
    }
    const mixed: string = mix("a");
    function dbg() -> string { return mixed; }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain(SECRET);
    expect(fnDecl(res.client.js, "dbg")).toBe(false);
    expect(fnDecl(res.client.js, "mix")).toBe(false);
    expect(await texts(res, ["c"])).toEqual([""]);
  }, 120000);
});

describe("A (imports) — an imported module's functions the program never references are not printed (§41.9)", () => {
  test("a5: `import { used }` — `used` is printed and runs; the module's other functions (exported or not) and the constant only they read are not", async () => {
    const sub = join(dir, "a5");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "scrml.toml"), "");
    writeFileSync(join(sub, "lib.scrml"), `\${
    const LKEY: string = "zz-lib-secret";
    export function used(s: string) -> string { return s + "."; }
    export function unusedExp() -> string { return LKEY; }
    function priv() -> string { return "p"; }
}
`);
    const file = join(sub, "app.scrml");
    writeFileSync(file, `\${
    import { used } from "./lib.scrml";
    export function exportedHere() -> string { return "eh"; }
}
<program>
<p id="c">\${used("a")}</p>
</program>
`);
    const res = await compileSource(file);
    expect(res.ok).toBe(true);
    expect(fnDecl(res.client.js, "used")).toBe(true);
    expect(fnDecl(res.client.js, "unusedExp")).toBe(false);
    expect(fnDecl(res.client.js, "priv")).toBe(false);
    // the entry's own export: the client artifact exports nothing (a library entry is refused, §21.5),
    // so nothing outside the artifact can name it
    expect(fnDecl(res.client.js, "exportedHere")).toBe(false);
    expect(res.client.js).not.toContain("zz-lib-secret");
    expect(await texts(res, ["c"])).toEqual(["a."]);
  }, 120000);
});

// =============================================================================
// B — every way the client reaches a function keeps it (fail closed: a dropped function the client
// needs is a ReferenceError)
// =============================================================================
describe("B — reached functions stay, and run", () => {
  test("b1: reached only from an event handler", async () => {
    const res = await compile(`<program>
\${ function bump(k: int) -> int { return k + 2; } }
let <n:int=0/>
<button id="go" onclick={ @n = bump(@n); }>go</button>
<p id="c">\${@n}</p>
</program>
`);
    expect(fnDecl(res.client.js, "bump")).toBe(true);
    expect(await texts(res, ["c"], [{ click: "#go" }, { click: "#go" }])).toEqual(["4"]);
  }, 120000);

  test("b2: reached only from a component's view", async () => {
    const res = await compile(`\${ function shout(s: string) -> string { return s + "!"; } }
<badge t:string="">
</> renders <span>\${shout(t)}</span>
<program>
<div id="c"><badge t="hi"/></div>
</program>
`);
    expect(fnDecl(res.client.js, "shout")).toBe(true);
    expect(await texts(res, ["c"])).toEqual(["hi!"]);
  }, 120000);

  // (`.map(f)` takes only an arrow function in the bootstrap — E-BOOTSTRAP-UNSUPPORTED — so the
  // function value is passed to a function parameter instead, the other place a FnRef stands)
  test("b3: reached only as a function value passed as an argument", async () => {
    const res = await compile(`<program>
\${
    function twice(k: int) -> int { return k * 2; }
    function apply(f: (x: int) => int, k: int) -> int { return f(k); }
}
let <n:int=0/>
<button id="go" onclick={ @n = apply(twice, 21); }>go</button>
<p id="c">\${@n}</p>
</program>
`);
    expect(fnDecl(res.client.js, "twice")).toBe(true);
    expect(await texts(res, ["c"], [{ click: "#go" }])).toEqual(["42"]);
  }, 120000);

  // (a file-scope binding cannot hold a function value in the bootstrap — E-BOOTSTRAP-UNSUPPORTED — so
  // the value is a function's local, and the only mention of `inc` is that FnRef)
  test("b4: reached only through a function value a local holds", async () => {
    const res = await compile(`<program>
\${
    function inc(k: int) -> int { return k + 1; }
    function viaLocal(k: int) -> int { const step = inc; return step(k); }
}
let <n:int=0/>
<button id="go" onclick={ @n = viaLocal(41); }>go</button>
<p id="c">\${@n}</p>
</program>
`);
    expect(fnDecl(res.client.js, "inc")).toBe(true);
    expect(await texts(res, ["c"], [{ click: "#go" }])).toEqual(["42"]);
  }, 120000);

  test("b5: reached only by an initializer no code reads (it runs in the client: §7.6 S481)", async () => {
    const res = await compile(`<program>
\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 7; }
    const unread: int = note("a");
}
<p id="c">\${log}</p>
</program>
`);
    expect(fnDecl(res.client.js, "note")).toBe(true);
    expect(await texts(res, ["c"])).toEqual(["a"]);
  }, 120000);

  test("b6: a function nested in a reached function is printed with it and runs", async () => {
    const res = await compile(`<program>
\${
    function outer2(k: int) -> int {
        function sq(x: int) -> int { return x * x; }
        return sq(k) + 1;
    }
}
<p id="c">\${outer2(3)}</p>
</program>
`);
    expect(fnDecl(res.client.js, "outer2")).toBe(true);
    expect(await texts(res, ["c"])).toEqual(["10"]);
  }, 120000);

  test("b7: a function reached by both the client and a server function is in both artifacts; one only server code reaches is server-only", async () => {
    const res = await compile(`<program db="./app.db">
\${
    function both(s: string) -> string { return "<" + s + ">"; }
    function srvOnly(s: string) -> string { return s + "#"; }
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return both(srvOnly(r.name));
    }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${both(@out)}</p>
</program>
`);
    expect(fnDecl(res.client.js, "both")).toBe(true);
    expect(fnDecl(res.client.js, "srvOnly")).toBe(false);
    expect(res.serverJs).toMatch(/function both\(/);
    expect(res.serverJs).toMatch(/function srvOnly\(/);
    expect(await texts(res, ["c"])).toEqual(["<>"]);
  }, 120000);
});

// =============================================================================
// C — g-boot-server-only-init-no-server-artifact-s481: a server-only initializer in a program that
// routes nothing gets a server artifact (module initialization only), and it runs there
// =============================================================================
describe("C — a server-only initializer gets a server artifact when nothing is routed", () => {
  test("c1 (the gap's probe r1-residue): `const unused = mix(\"a\")`, mix reached only by an uncalled server function", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const SECRET: string = "zz-secret-salt";
    function mix(s: string) -> string { return s + SECRET; }
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return mix(r.name);
    }
    const unused: string = mix("a");
}
let <out:string=""/>
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain("zz-secret-salt");
    expect(typeof res.serverJs).toBe("string");
    const server = res.serverJs;
    expect(server).toMatch(/^const unused = /m);
    expect(server).toContain("export const manifest = { routes: [] };");
    // module initialization runs the initializer; createServer answers no route
    const sub = join(dir, "c1");
    rmSync(sub, { recursive: true, force: true });
    const { mkdirSync, copyFileSync } = await import("node:fs");
    mkdirSync(sub, { recursive: true });
    const root = join(import.meta.dir, "..", "slice-m1", "runtime");
    copyFileSync(join(root, "server-runtime.js"), join(sub, "scrml-server-runtime.js"));
    copyFileSync(join(root, "runtime.js"), join(sub, "runtime.js"));
    const m = server.match(/^const (unused) = /m);
    writeFileSync(join(sub, "program.server.js"), server + `\nexport { ${m[1]} as __probe };\n`);
    const mod = await import(pathToFileURL(join(sub, "program.server.js")).href);
    expect(mod.__probe).toBe("azz-secret-salt");
    expect(mod.manifest.routes).toEqual([]);
    expect(typeof mod.createServer).toBe("function");
  }, 120000);

  test("c2: a program with no server-only initializer and nothing routed still prints no server artifact", async () => {
    const res = await compile(`<program>
\${ const k: int = 3; }
<p id="c">\${k}</p>
</program>
`);
    expect(res.serverJs).toBeUndefined();
  }, 120000);
});

// =============================================================================
// D — r1 (#2061 adversarial review H1 / M1 / M2 / M3): what the first round still shipped.
// Red on base 62d36cabd (and on the round-0 head e7e78f7ed) — each names what it printed.
// =============================================================================
describe("D — r1: server-only initializers, nested functions, components, routes", () => {
  test("d1 (H1, probe o1): a function only a server-only initializer calls is not in the client, nor the constant only it reads; the server still runs the initializer", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const SECRET: string = "zz-secret-salt";
    const S2: string = "zz-second-secret";
    function mix(s: string) -> string { return s + SECRET; }
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return mix(r.name);
    }
    function combine() -> string { return mix("a") + S2; }
    const unused: string = combine();
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain("zz-");                // base: `const S2 = "zz-second-secret"`
    expect(fnDecl(res.client.js, "combine")).toBe(false);      // base: `function combine()`
    expect(res.serverJs).toMatch(/^const unused = combine\(\);/m);
    expect(res.serverJs).toMatch(/function combine\(/);
    expect(res.serverJs).toContain("zz-second-secret");
    expect(await texts(res, ["c"])).toEqual([""]);
  }, 120000);

  test("d2 (H1, the fixed point's second round): a binding only that function reads, with an acting initializer, runs on the server only", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const SECRET: string = "zz-secret-salt";
    function mix(s: string) -> string { return s + SECRET; }
    function tagged(s: string) -> string { return "{" + s + "}"; }
    const X: string = tagged("zz-x-marker");
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return mix(r.name);
    }
    function combine() -> string { return mix("a") + X; }
    const unused: string = combine();
}
<p id="c">ok</p>
</program>
`);
    expect(res.client.js).not.toContain("zz-");                // base: X, its initializer and combine
    expect(fnDecl(res.client.js, "tagged")).toBe(false);
    expect(fnDecl(res.client.js, "combine")).toBe(false);
    expect(res.serverJs).toContain("zz-x-marker");
    expect(res.serverJs).toMatch(/^const unused = combine\(\);/m);
    expect(await texts(res, ["c"])).toEqual(["ok"]);
  }, 120000);

  test("d3 (M1, probe o3): a nested function its outer function never reaches is not printed, nor the constant only it reads", async () => {
    const res = await compile(`<program db="./app.db">
\${
    const API_KEY: string = "zz-sk-nested";
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
    function live(k: int) -> int {
        function deadNested() -> string { return \`k=\${API_KEY}\`; }
        function deadToo() -> string { return deadNested(); }
        function inc(x: int) -> int { return x + 1; }
        function twice(x: int) -> int { return inc(inc(x)); }
        return twice(k);
    }
}
let <n:int=0/>
<button id="go" onclick={ @n = live(@n); }>go</button>
<p id="c">\${live(5)}</p>
</program>
`);
    expect(res.client.js).not.toContain("zz-sk-nested");      // base: `const API_KEY = …`
    expect(fnDecl(res.client.js, "deadNested")).toBe(false);  // base: printed inside live
    expect(fnDecl(res.client.js, "deadToo")).toBe(false);
    expect(fnDecl(res.client.js, "twice")).toBe(true);        // reached by a call
    expect(fnDecl(res.client.js, "inc")).toBe(true);          // reached only through twice
    expect(await texts(res, ["c"])).toEqual(["7"]);
  }, 120000);

  // (A nested function used as a VALUE is refused by the bootstrap — E-BOOTSTRAP-UNSUPPORTED,
  // §7.3.1 INTERIM — so prunedBody's value rule, a FnRef naming it, has no compiling probe here;
  // it counts as reached, as analyze's usesR counts one.)

  test("d5 (M2, probe o4): a component nothing constructs is not printed, nor what only its view reaches; a used one is", async () => {
    const res = await compile(`\${
    const API_KEY: string = "zz-sk-comp";
    function peek() -> string { return API_KEY; }
    function shown() -> string { return "shown"; }
}
<ghost t:string="">
</> renders <span>\${peek()}</span>
<ghost2 t:string="">
</> renders <ghost t=""/>
<used t:string="">
</> renders <span id="u">\${shown()}</span>
<program db="./app.db">
\${
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<used t=""/>
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain("zz-sk-comp");         // base: `const API_KEY = …` (ghost's view reaches peek)
    expect(fnDecl(res.client.js, "peek")).toBe(false);
    expect(res.client.js).not.toMatch(/render_ghost/);         // neither ghost nor ghost2 (only ghost2 mounts ghost)
    expect(fnDecl(res.client.js, "shown")).toBe(true);
    expect(await texts(res, ["u", "c"])).toEqual(["shown", ""]);
  }, 120000);

  test("d6 (M3, probe o2): a server function only an unreached client function calls gets no route, and the client no route descriptor", async () => {
    const res = await compile(`<program db="./app.db">
\${
    type Row:struct = { name: string }
    function secretRow(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name;
    }
    function dead() -> string { return secretRow(1) !{ .Transport(t) :> return "x" }; }
}
let <out:string=""/>
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain("route$secretRow");    // base: the descriptor
    expect(res.client.js).not.toContain("/_scrml/call/");
    expect(fnDecl(res.client.js, "dead")).toBe(false);
    // base: a server artifact whose manifest routes secretRow; now nothing is routed and nothing
    // runs at module initialization, so there is no server half
    expect(res.serverJs).toBeUndefined();
    expect(await texts(res, ["c"])).toEqual([""]);
  }, 120000);
});
