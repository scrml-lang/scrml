// write-only-secret-s482.test.js — lane s482-write-only-secret (SECURITY). A file-scope binding the
// client WRITES but never READS, whose initializer reaches a server-only binding, shipped that binding:
// print.scrml constReads counts a client write as a use, so serverInitsRound judged the binding
// client-read and kept its initializer in the client. Red on 153bd0334: program.client.js held
// `const API_KEY = "zz-sk-live-123"` for both spellings of the shape — a plain `let` (probe o9-let) and a
// cell declared outside the body (o9; §7.6 R1, ruling:user-voice-scrml.md-S482-outside-cell-seed-time:
// "the same as the library's plain let / const initializers").
//
// §7.6 rule (b) S481: a binding is server-only "when only server code reads it, or when no code reads it
// and its initializer reaches server-only code … or another server-only binding" — a write is not a
// read. Built: "the client reads" is judged by READS (print.scrml constUse / constsOnlyRead); a binding
// the client only overwrites and does not run gets a SHELL — the binding (or, for an outer cell, its
// declaration) with the absence value `not` as its seed, never its initializer — and the server artifact
// runs the initializer (S481 "every file-scope initializer runs … in the artifact its reach places it in").
// A read anywhere in client code — a display, a compound write `x = x + …`, a later handler, `bind:` —
// keeps the binding client-read, unchanged.
//
// Not covered (left, ruling-gated): a cell declared in the program BODY (g-boot-body-unread-cell-server-only-s482
// — §7.6 rule (b)'s classification speaks of file-scope bindings; whether a body cell is one is the open
// owner fork). Its leak is pinned below as today's behaviour.
//
// Shipping path: the scrml-boot CLI (every client file read) and scripts/bootstrap-conformance.ts
// `runBootstrapArtifact` (happy-dom). Chromium: compiler/tests/browser/write-only-secret-chromium-s482.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-write-only-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
function writeApp(src) {
  const sub = join(dir, `app${n++}`);
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "main.scrml"), src);
  return join(sub, "main.scrml");
}

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");
const SERVER_FILES = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];

// Compile through the CLI; every CLIENT file read back, and the server artifact's module-level binding
// matching `pat` (imported, so its module initialization runs the initializer).
async function build(src, pat) {
  const main = writeApp(src);
  const out = main.replace(/main\.scrml$/, "out");
  const p = Bun.spawnSync(["bun", CLI, "compile", main, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  const names = readdirSync(out);
  const client = names.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(out, f), "utf8") }));
  let value;
  if (pat && names.includes("program.server.js")) {
    const server = readFileSync(join(out, "program.server.js"), "utf8");
    const m = server.match(new RegExp("^(?:const|let) (" + pat + ") = ", "m"));
    if (m) {
      writeFileSync(join(out, "probe.server.js"), server + `\nexport { ${m[1]} as __probe };\n`);
      value = (await import(pathToFileURL(join(out, "probe.server.js")).href)).__probe;
    }
  }
  return { client, value, js: client.find((c) => c.f === "program.client.js")?.text ?? "" };
}
function leaked(client, needles) {
  const out = [];
  for (const c of client) for (const nd of needles) if (c.text.includes(nd)) out.push(c.f + ": " + nd);
  return out;
}
async function texts(src, ids, input = []) {
  const res = await compileSource(writeApp(src));
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}

const SECRET = ["zz-sk-live-123", "API_KEY"];
// `label` is server-placed (§12.2 Trigger 5: it reaches a `?{}`), so API_KEY is read only by server code.
const LIB = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
}`;
const LET = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    let keyLet: string = tag(API_KEY);
}`;
const CELL = `${LIB}\nlet <keyCell:string=(tag(API_KEY))/>`;
const PROG = (pre, extra) => `${pre}
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
<p id="c">\${tag(@out)}</p>
${extra}
</program>
`;

describe("a binding the client only writes is server-only when its initializer reaches a server-only binding", () => {
  test("o9-let: a plain `let` written by a handler — no client file holds the secret; the client writes a shell; the server runs the initializer", async () => {
    const b = await build(PROG(LET, `<button id="b" onclick={ keyLet = "w"; }>b</button>`), "keyLet\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.js).toMatch(/^let keyLet\w* = null;$/m);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("o9: a cell declared outside the body, written by a handler — its declaration is a shell (seed `not`); the server runs the seed", async () => {
    const b = await build(PROG(CELL, `<button id="b" onclick={ @keyCell = "w"; }>b</button>`), "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.js).toContain("rt.seeded(() => null)");
    expect(b.js).not.toContain("tag(API_KEY)");
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("written through a function, in an `<effect>`, in a function a `<request>` calls, and as a `${ }` binding in the body", async () => {
    const shapes = [
      PROG(LET, `\${ function setK() { keyLet = "w"; } }\n<button id="b" onclick={ setK(); }>b</button>`),
      PROG(LET, `let <t:int=0/>\n<effect deps=[@t]>\${ keyLet = "e"; }</>\n<button id="b" onclick={ @t = @t + 1; }>b</button>`),
      PROG(LET, `\${ function setK() -> string { keyLet = "r"; return "x"; } }\nlet <m:string=""/>\n<request id="rq">\${ @m = setK(); }</request>`),
      PROG(LIB, `\${ let keyLet: string = tag(API_KEY); }\n<button id="b" onclick={ keyLet = "w"; }>b</button>`),
      PROG(CELL, `\${ function setK() { @keyCell = "w"; } }\n<button id="b" onclick={ setK(); }>b</button>`),
    ];
    for (const s of shapes) expect(leaked((await build(s)).client, SECRET)).toEqual([]);
  }, 300000);

  test("an initializer that reaches the secret through a function; one that reads it with no call; one server code also reads", async () => {
    const viaFn = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    function mk() -> string { return API_KEY + "?"; }
    let keyLet: string = mk();
}`;
    const b1 = await build(PROG(viaFn, `<button id="b" onclick={ keyLet = "w"; }>b</button>`), "keyLet\\w*");
    expect(leaked(b1.client, [...SECRET, "function mk("])).toEqual([]);
    expect(b1.value).toBe("zz-sk-live-123?");
    const noCall = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    let keyLet: string = API_KEY + "!";
}`;
    const b2 = await build(PROG(noCall, `<button id="b" onclick={ keyLet = "w"; }>b</button>`));
    expect(leaked(b2.client, SECRET)).toEqual([]);
    const sreads = `\${
    function sk(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return keyLet; } };
        return r.name + keyLet;
    }
}
<button id="b" onclick={ keyLet = "w"; }>b</button>
<button id="r" onclick={ @out = sk(2) !{ .Transport(t) :> return }; }>r</button>`;
    const b3 = await build(PROG(LET, sreads));
    expect(leaked(b3.client, SECRET)).toEqual([]);
    expect(b3.js).toMatch(/^let keyLet\w* = null;$/m);
  }, 300000);
});

describe("a READ keeps the binding client-read (unchanged)", () => {
  test("a display: the plain `let` and the outer cell show the seed; the cell shows the write", async () => {
    const d1 = PROG(LET, `<button id="b" onclick={ keyLet = "w"; }>b</button>\n<p id="d">\${keyLet}</p>`);
    expect(leaked((await build(d1)).client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    expect(await texts(d1, ["d"], [{ click: "#b" }])).toEqual(["[zz-sk-live-123]"]);
    const d2 = PROG(CELL, `<button id="b" onclick={ @keyCell = "w"; }>b</button>\n<p id="d">\${@keyCell}</p>`);
    expect(await texts(d2, ["d"])).toEqual(["[zz-sk-live-123]"]);
    expect(await texts(d2, ["d"], [{ click: "#b" }])).toEqual(["w"]);
  }, 300000);

  test("a compound write (`x = x + …`), a read in a later handler, `bind:value`", async () => {
    for (const s of [
      PROG(LET, `<button id="b" onclick={ keyLet = keyLet + "x"; }>b</button>`),
      PROG(CELL, `<button id="b" onclick={ @keyCell = @keyCell + "x"; }>b</button>`),
      PROG(CELL, `<button id="b" onclick={ @keyCell = "w"; }>b</button>\n<button id="r" onclick={ @out = @keyCell; }>r</button>`),
      PROG(CELL, `<input id="i" bind:value=@keyCell/>`),
    ]) expect(leaked((await build(s)).client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    const later = PROG(CELL, `<button id="b" onclick={ @keyCell = "w"; }>b</button>\n<button id="r" onclick={ @out = @keyCell; }>r</button>`);
    expect(await texts(later, ["c"], [{ click: "#r" }])).toEqual(["[[zz-sk-live-123]]"]);
    expect(await texts(later, ["c"], [{ click: "#b" }, { click: "#r" }])).toEqual(["[w]"]);
  }, 300000);
});

describe("bindings the client runs, and shells that reach nothing", () => {
  test("a written-only binding whose initializer acts and reaches nothing server-only still runs in the client", async () => {
    const pre = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    let hits: string = "";
    function bump() -> string { hits = hits + "h"; return "b"; }
    let x: string = bump();
    function peek() -> string { return hits; }
}`;
    const s = PROG(pre, `<button id="b" onclick={ x = "w"; @out = peek(); }>b</button>`);
    const b = await build(s);
    expect(b.js).toMatch(/^let x\w* = bump\w*\(\);$/m);
    expect(await texts(s, ["c"], [{ click: "#b" }])).toEqual(["[h]"]);
  }, 180000);

  test("a written-only binding with a literal initializer is a shell (its value is never read)", async () => {
    const pre = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    let lit: string = "plain";
}`;
    const b = await build(PROG(pre, `<button id="b" onclick={ lit = "w"; }>b</button>`));
    expect(b.js).toMatch(/^let lit\w* = null;$/m);
    expect(b.js).not.toContain('"plain"');
  }, 180000);
});

describe("not covered — ruling-gated (g-boot-body-unread-cell-server-only-s482)", () => {
  test("a cell declared in the program BODY, written but never read, still ships the secret (today's behaviour, pinned)", async () => {
    const b = await build(PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @keyCell = "w"; }>b</button>`));
    expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
  }, 180000);
});
