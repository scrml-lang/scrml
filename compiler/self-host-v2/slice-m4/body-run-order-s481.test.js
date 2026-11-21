// body-run-order-s481.test.js — lane s481-body-run-order: the program body runs once, top to bottom,
// in source order (SPEC §7.6 S481, §40.8).
// Ruling: user-voice-scrml.md "⭐ RULED — program-body run order: one source-ordered sequence (#2025
// review P1–P3), PA rec adopted (S481)" — "The program body runs once, top to bottom, in source
// order, and that sequence is the module initialization. Every file-scope initializer runs whether
// or not anything reads it, so the S480 tool ruling extends to web programs. A display of a `free`
// value reads it where it stands." (owner: "yes, adopt your rec on P1–P3").
// Gaps g-spec-file-scope-unread-init-web-s481 (P1), g-spec-file-scope-init-vs-body-top-write-s481
// (P2), g-spec-body-render-order-free-s481 (P3).
//
// Every case runs on the SHIPPING path: the bootstrap CLI artifact (scripts/scrml-boot.ts
// `compileSource` → print.scrml printProgram) executed by the conformance runner's
// `runBootstrapArtifact` (happy-dom). Red on base 0d775f390: P1 rendered "1" (the unread
// initializer was never printed), P2 rendered "1" (the initializer ran at module initialization,
// before the earlier body-top write). P3 already rendered "1" / "10" there; it is pinned so the
// sequence keeps it.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s481-body-order-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function compile(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function texts(src, ids) {
  const res = await compile(src);
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}

const P1 = `<program>
\${
    let o: int[free, write] = [1];
    function bump() -> int { o[0] = o[0] + 10; return o[0]; }
    const unused: int = bump();
}
<p id="c">\${o[0]}</p>
</program>
`;

const P2 = `<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const k: int = n; }
<p id="c">\${k}</p>
</program>
`;

const P3 = `<program>
\${ let o: int[free, write] = [1]; }
<p id="a">\${o[0]}</p>
\${ o[0] = 10; }
<p id="c">\${o[0]}</p>
</program>
`;

describe("§7.6 S481 — one source-ordered program body (ruling S481 P1–P3)", () => {
  test("P1: an initializer nothing reads still runs (its effect is seen)", async () => {
    expect(await texts(P1, ["c"])).toEqual(["11"]);
  }, 120000);

  test("P2: an initializer runs after the body-top statement written before it", async () => {
    expect(await texts(P2, ["c"])).toEqual(["5"]);
  }, 120000);

  test("P3: a display of a `free` value reads it where it stands", async () => {
    expect(await texts(P3, ["a", "c"])).toEqual(["1", "10"]);
  }, 120000);

  test("several unread initializers run in source order, between the body's statements", async () => {
    const src = `<program>
\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 0; }
    const a: int = note("a");
}
\${ note("b"); }
\${ const c: int = note("c"); }
<p id="c">\${log}</p>
</program>
`;
    expect(await texts(src, ["c"])).toEqual(["abc"]);
  }, 120000);
});

describe("§7.6 S481 — a binding read before its place is set before it is read", () => {
  test("a cell seed that reads a file-scope binding sees its value", async () => {
    const src = `<program>
\${
    function three() -> int { return 3; }
    const start: int = three();
}
let <c:int=(start)/>
<p id="c">\${@c}</p>
</program>
`;
    expect(await texts(src, ["c"])).toEqual(["3"]);
  }, 120000);

  test("a component's use-site value is seeded at the instance's place (S482; was INTERIM: both read 1 at construction)", async () => {
    // s482 (§7.6 rule (b) / §66.7.6 rule 5 S482, ruling:user-voice-scrml.md-S481-run-order-followups
    // item 1): "each seed is computed at its place in the sequence; records are still created at
    // construction" — the first instance's seed runs before the write, the second's after it
    const src = `<card n:int=0>
    let <m:int=(n)/>
</> renders <span>\${m}</span>
<program>
\${ let o: int[free, write] = [1]; }
<div id="a"><card n=(o[0])/></div>
\${ o[0] = 10; }
<div id="c"><card n=(o[0])/></div>
</program>
`;
    expect(await texts(src, ["a", "c"])).toEqual(["1", "10"]);
  }, 120000);

  // s482 (item B): this was the INTERIM (the binding ran at module initialization, early, and
  // both displays showed 7). Ruled S481 (ruling:user-voice-scrml.md-S481-run-order-followups
  // item 2): "E-SCOPE-001, the S479 file-scope-initializer rule extended to body code".
  test("a display before the place, through a function, is E-SCOPE-001 (S482; was INTERIM: set early)", async () => {
    const src = `<program>
\${
    function seven() -> int { return 7; }
    function g() -> int { return k; }
}
<p id="a">\${g()}</p>
\${ const k: int = seven(); }
<p id="c">\${k}</p>
</program>
`;
    const file = join(dir, `later${n++}.scrml`);
    writeFileSync(file, src);
    const res = await compileSource(file);
    expect(res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("a derived cell over a free value: e02 (with a CSS bridge) / e03 keep their values", async () => {
    const e02 = `<program>
\${ let o: int[free, write] = [1]; }
<s:int=100/>
<dd:int=(@s + o[0])/>
\${ o[0] = 10; }
<p id="c" class="x">\${@dd}</p>
#{ .x { width: @dd; } }
</program>
`;
    const e03 = `<program>
\${ let o: int[free, write] = [1]; }
<s:int=100/>
<dd:int=(@s + o[0])/>
<p id="a">\${@dd}</p>
\${ o[0] = 10; }
<p id="c">\${@dd}</p>
</program>
`;
    expect(await texts(e02, ["c"])).toEqual(["101"]);
    expect(await texts(e03, ["a", "c"])).toEqual(["101", "101"]);
  }, 120000);
});

describe("§7.6 S481 — artifacts", () => {
  test("a binding only server code reads stays out of the client artifact", async () => {
    const src = `<program>
\${
    const SALT: string = "zz-server-only-salt";
    server function salted(s: string) -> string { return s + SALT; }
}
<p id="c">hi</p>
</program>
`;
    const res = await compile(src);
    expect(res.client.js).not.toContain("zz-server-only-salt");
  }, 120000);

  test("an in-sequence binding is declared at module level and assigned in its place", async () => {
    const res = await compile(P2);
    expect(res.client.js).toMatch(/^let k;$/m);
    expect(res.client.js).toMatch(/k = n;/);
  }, 120000);
});

// =============================================================================
// r1 (#2041 S239 review H1 / M1): an unread file-scope initializer whose reach includes
// server-only code — a function the client does not hold (§12.2 Trigger 5) or a binding only
// server code reads — is SERVER-ONLY (PA reading S481 of the S472 placement + S481 "every
// initializer runs"): nothing of it reaches ANY client artifact file, and the server artifact
// runs it once, at module initialization. Run through the shipping CLI (`scrml-boot compile`);
// the server artifact is imported, and the binding read back, to show it ran there.
// Red on 0b55e0208 (the secret reached program.client.js; a6: the server never ran it) and on
// base 0d775f390 (the server never ran any of them).
// =============================================================================
const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");
const SERVER_FILES = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];

async function build(src, bindingPat) {
  const sub = join(dir, `srv${n++}`);
  const file = sub + ".scrml";
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", CLI, "compile", file, "--output-dir", sub], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString());
  const files = readdirSync(sub);
  const client = files.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(sub, f), "utf8") }));
  // the server artifact: the binding is a module-level `const` (before createServer); export it
  // under a probe name and import the module — its module initialization runs the initializer
  let server = readFileSync(join(sub, "program.server.js"), "utf8");
  const m = server.match(new RegExp("^const (" + bindingPat + ") = ", "m"));
  const atModule = m !== null && server.indexOf(m[0]) < server.indexOf("export function createServer");
  let value;
  if (m) {
    writeFileSync(join(sub, "probe.server.js"), server + `\nexport { ${m[1]} as __probe };\n`);
    value = (await import(pathToFileURL(join(sub, "probe.server.js")).href)).__probe;
  }
  return { client, atModule, value };
}
function leaked(client, needles) {
  const out = [];
  for (const c of client) for (const nd of needles) if (c.text.includes(nd)) out.push(c.f + ": " + nd);
  return out;
}

const DBFN = `    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return BODY;
    }`;
const GO = `let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>`;

describe("§7.6 S481 r1 — an unread initializer that reaches server-only code is server-only", () => {
  test("a7: it reads a binding only server code reads — the secret is in no client file; the server runs it", async () => {
    const src = `<program db="./app.db">
\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
${DBFN.replace("BODY", "r.name + API_KEY")}
    const keyTag: string = tag(API_KEY);
}
${GO}
<p id="c">\${tag(@out)}</p>
</program>
`;
    const b = await build(src, "keyTag\\w*");
    expect(leaked(b.client, ["zz-sk-live-123", "API_KEY", "keyTag"])).toEqual([]);
    expect(b.atModule).toBe(true);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("a1: it calls a helper only a server function reaches — neither the helper nor its secret is in a client file", async () => {
    const src = `<program db="./app.db">
\${
    const SECRET: string = "zz-secret-salt";
    function mix(s: string) -> string { return s + SECRET; }
${DBFN.replace("BODY", "mix(r.name)")}
    const unused: string = mix("a");
}
${GO}
<p id="c">\${@out}</p>
</program>
`;
    const b = await build(src, "unused\\w*");
    expect(leaked(b.client, ["zz-secret-salt", "function mix", "unused"])).toEqual([]);
    expect(b.atModule).toBe(true);
    expect(b.value).toBe("azz-secret-salt");
  }, 180000);

  test("a5: the helper's only other reader is an <endpoint> arm — server-only too", async () => {
    const src = `<program>
\${
    type M:enum = {
      Hello(id: int)
    }
    const SALT: string = "zz-ep-salt";
    function mix(s: string) -> string { return s + SALT; }
    const unused: string = mix("q");
}
<endpoint path="/api/look" method="POST" accepts=M>
  <Hello(id) : { why: mix("w") }>
</endpoint>
<p id="c">x</p>
</program>
`;
    const b = await build(src, "unused\\w*");
    expect(leaked(b.client, ["zz-ep-salt", "function mix", "unused"])).toEqual([]);
    expect(b.atModule).toBe(true);
    expect(b.value).toBe("qzz-ep-salt");
  }, 180000);

  test("a6 (M1): the same initializer written outside the body runs — on the server — not nowhere", async () => {
    const src = `\${
    const SECRET: string = "zz-secret-salt";
    function mix(s: string) -> string { return s + SECRET; }
    const unused: string = mix("a");
}
<program db="./app.db">
\${
${DBFN.replace("BODY", "mix(r.name)")}
}
${GO}
<p id="c">\${@out}</p>
</program>
`;
    const b = await build(src, "unused\\w*");
    expect(leaked(b.client, ["zz-secret-salt", "function mix", "unused"])).toEqual([]);
    expect(b.atModule).toBe(true);
    expect(b.value).toBe("azz-secret-salt");
  }, 180000);
});

// =============================================================================
// r1 (#2041 review M2): only a declaration the program constructs runs before the body. An
// unused component that reads the binding never runs, so it does not force the binding early:
// the ruling's P2 answer (5) holds. Red on 0b55e0208 and base ("1").
// =============================================================================
describe("§7.6 S481 r1 — what forces a binding early", () => {
  test("b4: an unused component reading the binding does not move it before the body", async () => {
    const src = `<card n:int=0>
    let <m:int=(n + k)/>
</> renders <span>\${m}</span>
<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const k: int = n + 0; }
<p id="c">\${k}</p>
</program>
`;
    expect(await texts(src, ["c"])).toEqual(["5"]);
  }, 120000);

  // s482: FLIPPED — ruling:user-voice-scrml.md-S481-run-order-followups item 1 ("each seed is
  // computed at its place in the sequence"): the card's seed runs at its mount, after `k`'s place,
  // so `k` runs in its place (5), not at module initialization (1, the S481 INTERIM).
  test("b3: a component mounted after the place no longer forces it early (S482 flip; was INTERIM 1 / 1)", async () => {
    const src = `<card n:int=0>
    let <m:int=(n)/>
</> renders <span>\${m}</span>
<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const k: int = n + 0; }
<p id="c">\${k}</p>
<div id="d"><card n=(k)/></div>
</program>
`;
    expect(await texts(src, ["c", "d"])).toEqual(["5", "5"]);
  }, 120000);
});

// =============================================================================
// r1 (#2041 review L1): §17.1.1 "no element, text node, or other syntactic construct appears
// between the chain members" — a `${ }` declaring a binding between `if=` and `else` breaks the
// chain (E-CTRL-001), as a `${ }` statement there already did and as impl#1 does. Accepted on
// 0b55e0208 and base (the place was moved after the chain).
// =============================================================================
describe("§17.1.1 — a declaration between if-chain members breaks the chain (r1 L1)", () => {
  const chain = (mid) => `<program>
\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 1; }
}
let <flag:boolean=false/>
<p id="a" if=(@flag)>yes</p>
${mid}
<p id="b" else>no \${log}</p>
</program>
`;
  async function errCodes(src) {
    const file = join(dir, `chain${n++}.scrml`);
    writeFileSync(file, src);
    const res = await compileSource(file);
    return res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  }
  test("a `${ const }` between `if=` and `else` is E-CTRL-001", async () => {
    expect(await errCodes(chain('${ const a: int = note("a"); }'))).toEqual(["E-CTRL-001"]);
  }, 120000);
  test("a `${ }` statement there is E-CTRL-001 (unchanged)", async () => {
    expect(await errCodes(chain('${ note("a"); }'))).toEqual(["E-CTRL-001"]);
  }, 120000);
  test("a function declared INSIDE a member (hoisted to a program item) does not break the chain", async () => {
    expect(await errCodes(chain("").replace('<p id="a" if=(@flag)>yes</p>', '<div id="a" if=(@flag)>\n    ${\n        function inner() -> int { return 1; }\n    }\n    <p>yes</p>\n</div>'))).toEqual([]);
  }, 120000);
  test("the declaration before the chain compiles", async () => {
    expect(await errCodes(chain("").replace('<p id="a"', '${ const a: int = note("a"); }\n<p id="a"'))).toEqual([]);
  }, 120000);
});

// =============================================================================
// r2 (#2041 re-review MED-1): a `${ const }` written INSIDE an element runs in its place there —
// the parser hoists it to a program item listed after the enclosing top-level element, and r1
// ran it after that whole element. Red on 4f65869bb: l20 rendered "1", l17 "y" (and the place
// landed after the <div>). Inside a construct whose content does not render once in place (an
// `if=` element, a component's slot content) the place is just after that construct (INTERIM,
// g-boot-nested-init-place-in-construct-s481); inside an `<each>` row a declaration is refused
// (pre-existing, unchanged).
// =============================================================================
const LOG = `\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 1; }
}`;

describe("§7.6 S481 r2 — a place nested in an element runs where it stands (MED-1)", () => {
  test("l20: P1 wrapped in a <div> — the unread initializer runs before the display after it", async () => {
    const src = `<program>
\${
    let o: int[free, write] = [1];
    function bump() -> int { o[0] = o[0] + 10; return o[0]; }
}
<div id="w">
\${ const unused: int = bump(); }
<p id="c">\${o[0]}</p>
</div>
</program>
`;
    expect(await texts(src, ["c"])).toEqual(["11"]);
  }, 120000);

  test("l17: between two displays inside a <div> — after the first, before the second", async () => {
    const src = `<program>
${LOG}
<div id="w">
<p id="x">x\${log}</p>
\${ const a: int = note("a"); }
<p id="y">y\${log}</p>
</div>
<p id="z">z\${log}</p>
</program>
`;
    expect(await texts(src, ["x", "y", "z"])).toEqual(["x", "ya", "za"]);
  }, 120000);

  test("three levels deep, between siblings — the earlier siblings, then the place, then the later ones", async () => {
    const src = `<program>
${LOG}
<div id="w"><ul><li id="l1">1\${log}</li><li>\${ const a: int = note("a"); }<b id="b">b\${log}</b></li><li id="l3">3\${log}</li></ul></div>
</program>
`;
    expect(await texts(src, ["l1", "b", "l3"])).toEqual(["1", "ba", "3a"]);
  }, 120000);

  test("a nested binding read after its place reads its value; a free display before it does not see the effect", async () => {
    const src = `<program>
\${
    let o: int[free, write] = [1];
    function bump() -> int { o[0] = o[0] + 10; return o[0]; }
}
<div id="w">
<p id="a">\${o[0]}</p>
\${ const k: int = bump(); }
<p id="c">\${k} \${o[0]}</p>
</div>
</program>
`;
    expect(await texts(src, ["a", "c"])).toEqual(["1", "11 11"]);
  }, 120000);

  // s482 (lane s482-runorder-followups, item C): these two were the INTERIM (the acting
  // initializer ran once, just after the construct). Ruled S481
  // (ruling:user-voice-scrml.md-S481-nested-init-chain-comments item 1): "make it a compile error
  // naming the construct" — E-FILE-SCOPE-INIT-IN-CONSTRUCT. One that does not act keeps the
  // INTERIM place (after the construct), which nothing can observe.
  async function codesOf(src) {
    const file = join(dir, `cons${n++}.scrml`);
    writeFileSync(file, src);
    const res = await compileSource(file);
    return res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  }
  test("inside an `if=` element an acting initializer is refused (S482, was INTERIM: ran after the element)", async () => {
    const src = `<program>
${LOG}
let <flag:boolean=false/>
<div id="w"><p id="a" if=(@flag)>\${ const a: int = note("a"); }yes</p><p id="y">y\${log}</p></div>
</program>
`;
    expect(await codesOf(src)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("inside a component's slot content an acting initializer is refused (S482, was INTERIM: ran after the instance)", async () => {
    const src = `<card n:int=0>
</> renders <div class="card"><slot/></div>
<program>
${LOG}
<div id="w"><card><p id="in">in\${log}</p>\${ const a: int = note("a"); }</card><p id="y">y\${log}</p></div>
</program>
`;
    expect(await codesOf(src)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("inside an `if=` element one that does not act runs just after the element (unobservable)", async () => {
    const src = `<program>
let <flag:boolean=false/>
<div id="w"><p id="a" if=(@flag)>\${ const a: int = 2 + 3; }yes</p><p id="y">y\${a}</p></div>
</program>
`;
    expect(await texts(src, ["y"])).toEqual(["y5"]);
  }, 120000);

  test("a nested unread initializer reaching a server-only helper stays server-only (no client leak)", async () => {
    const src = `<program db="./app.db">
\${
    const SECRET: string = "zz-secret-salt";
    function mix(s: string) -> string { return s + SECRET; }
${DBFN.replace("BODY", "mix(r.name)")}
}
let <out:string=""/>
<div id="w"><section>
\${ const unused: string = mix("a"); }
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
</section></div>
<p id="c">\${@out}</p>
</program>
`;
    const b = await build(src, "unused\\w*");
    expect(leaked(b.client, ["zz-secret-salt", "function mix", "unused"])).toEqual([]);
    expect(b.atModule).toBe(true);
    expect(b.value).toBe("azz-secret-salt");
  }, 180000);
});

// =============================================================================
// r2 (#2041 re-review LOW-1): the chain-gap judgment at every level, not only the program's top
// level. Red on 4f65869bb: l07 compiled (exit 0; the place moved after the <div>), impl#1 gives
// E-CTRL-001. The accepted shapes stay accepted nested.
// =============================================================================
describe("§17.1.1 r2 — a declaration between chain members breaks the chain at any level (LOW-1)", () => {
  async function errCodes(src) {
    const file = join(dir, `nchain${n++}.scrml`);
    writeFileSync(file, src);
    const res = await compileSource(file);
    return res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  }
  const nested = (body) => `<program>
${LOG}
let <flag:boolean=false/>
<div id="w"><section>
${body}
</section></div>
</program>
`;
  test("l07 (nested): a `${ const }` between `if=` and `else` inside a <div> is E-CTRL-001", async () => {
    expect(await errCodes(nested(`<p id="a" if=(@flag)>yes</p>
\${ const a: int = note("a"); }
<p id="b" else>no \${log}</p>`))).toEqual(["E-CTRL-001"]);
  }, 120000);
  test("a function between `if=` and `else-if=` two levels down is E-CTRL-002", async () => {
    expect(await errCodes(nested(`<p if=(@flag)>yes</p>
\${ function g() -> int { return 2; } }
<p else-if=(!@flag)>no</p>`))).toEqual(["E-CTRL-002"]);
  }, 120000);
  test("accepted nested: a function inside a member, a declaration between two chains, after an `if=` with no `else`", async () => {
    expect(await errCodes(nested(`<p if=(@flag)>yes</p>
<p else>no \${ function f() -> int { return 1; } }</p>
\${ const a: int = note("a"); }
<p if=(@flag)>y2</p>
<p else-if=(!@flag)>n2</p>
\${ const b: int = note("b"); }
<p if=(@flag)>y3</p>

<p else>n3</p>`))).toEqual([]);
  }, 120000);
});
