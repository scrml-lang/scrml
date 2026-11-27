// body-cell-server-only-s483.test.js — lane s483-body-cell-server-only (SECURITY). A cell declared in the
// program BODY is a field of the program declaration, a client root, so its seed was printed in the client
// whether or not any code read it — and with it the server-only binding the seed reached. Red on 2d40d8407:
// program.client.js held `const API_KEY = "zz-sk-live-123"` for an unread body cell (probe s12), its locked
// form (s13), an unread body DERIVED cell reading an outer cell (o2b) and a body cell written but never read
// (n31) — gap g-boot-body-unread-cell-server-only-s482.
//
// Ruled S482 (ruling:user-voice-scrml.md-S482-body-cell-server-only): *"(a) treat body cells like top-level
// ones, so the same rule (b) classification applies"*. §7.6 rule (b): a binding is server-only "when only
// server code reads it, or when no code reads it and its initializer reaches server-only code"; a write is
// not a read. Built: print.scrml outerPlaced judges each body cell in the one classification
// (serverInits), as a binding whose initializer is its seed (bodyAsConsts; a reference to the field is a use
// of it — bodyUseOf). A server-only body cell keeps its field as a SHELL (seed `not`) and its seed runs in
// the server artifact; a derived one (its formula runs only when read) runs nowhere. A read — a display, a
// compound write, `bind:`, an effect dependency, a request body, a client function, an argument to a server
// call — keeps the cell client-read, unchanged. A reset is a whole-value write, not a read (S483, lane
// s483-component-cell-server-only, prov=pa-ruled:S483-reset-is-write — component-cell-server-only-s483.test.js).
//
// Shipping path: the scrml-boot CLI (every client file read) and scripts/bootstrap-conformance.ts
// `runBootstrapArtifact` (happy-dom). Chromium: compiler/tests/browser/body-cell-server-only-chromium-s483.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-body-cell-")); });
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

// Compile through the CLI; every CLIENT file read back; the server artifact imported (its module
// initialization runs every initializer it holds — a load failure fails the test) and the value of its
// module-level binding matching `pat`, if given.
async function build(src, pat) {
  const main = writeApp(src);
  const out = main.replace(/main\.scrml$/, "out");
  const p = Bun.spawnSync(["bun", CLI, "compile", main, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return { ok: false, err: p.stderr.toString() + p.stdout.toString() };
  const names = readdirSync(out);
  const client = names.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(out, f), "utf8") }));
  let value;
  let server = "";
  if (names.includes("program.server.js")) {
    server = readFileSync(join(out, "program.server.js"), "utf8");
    const m = pat ? server.match(new RegExp("^(?:const|let) (" + pat + ") = ", "m")) : null;
    writeFileSync(join(out, "probe.server.js"), server + (m ? `\nexport { ${m[1]} as __probe };\n` : ""));
    value = (await import(pathToFileURL(join(out, "probe.server.js")).href)).__probe;
  }
  return { ok: true, client, value, server, js: client.find((c) => c.f === "program.client.js")?.text ?? "" };
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
// `label` is server-placed (§12.2 Trigger 5: it reaches a `?{}`), so API_KEY is otherwise read only by server code.
const LIB = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    function mk() -> string { return API_KEY + "?"; }
}`;
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

describe("a program-body cell nothing on the client reads, whose seed reaches a server-only binding, is server-only", () => {
  test("s12: an unread `let` cell — its field is a shell (seed `not`); the server artifact runs the seed", async () => {
    const b = await build(PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>`), "keyCell\\w*");
    expect(b.ok).toBe(true);
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.js).toContain("rt.seeded(() => null)");
    expect(b.js).not.toContain("keyCell */] = rt.seeded(() => tag(");
    expect(b.value).toBe("[zz-sk-live-123]");
    expect(await texts(PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>`), ["c"])).toEqual(["[]"]);
  }, 180000);

  test("s13: the locked form (a constant seed) — the same", async () => {
    const b = await build(PROG(LIB, `<keyCell:string=(tag(API_KEY))/>`), "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("n31: written but never read — the client writes the shell; a statement after the write still runs", async () => {
    const s = PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>\nlet <k:int=0/>\n<p id="k">\${@k}</p>\n<button id="b" onclick={ @keyCell = "w"; @k = @k + 1; }>b</button>`);
    const b = await build(s, "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.value).toBe("[zz-sk-live-123]");
    expect(await texts(s, ["k"], [{ click: "#b" }, { click: "#b" }])).toEqual(["2"]);
  }, 180000);

  test("written through a function; the seed reaching the secret through a function; through a body `const`", async () => {
    for (const [s, v] of [
      [PROG(LIB, `\${ function setK() { @keyCell = "w"; } }\nlet <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ setK(); }>b</button>`), "[zz-sk-live-123]"],
      [PROG(LIB, `let <keyCell:string=(mk())/>`), "zz-sk-live-123?"],
      [PROG(LIB, `let <keyCell:string=(mk())/>\n<button id="b" onclick={ @keyCell = "w"; }>b</button>`), "zz-sk-live-123?"],
    ]) {
      const b = await build(s, "keyCell\\w*");
      expect(leaked(b.client, [...SECRET, "function mk("])).toEqual([]);
      expect(b.value).toBe(v);
    }
    const viaConst = await build(PROG(LIB, `\${ const k2: string = mk(); }\nlet <c:string=(k2 + "!")/>`), "c");
    expect(leaked(viaConst.client, SECRET)).toEqual([]);
    expect(viaConst.value).toBe("zz-sk-live-123?!");
  }, 300000);

  test("a function that reads the cell but that nothing calls does not make it client-read (§12.2 Trigger 6)", async () => {
    const b = await build(PROG(LIB, `\${ function show() -> string { return @keyCell; } }\nlet <keyCell:string=(tag(API_KEY))/>`));
    expect(leaked(b.client, SECRET)).toEqual([]);
  }, 180000);

  test("o2b: an unread body DERIVED cell reading an unread outer cell — neither is in the client; nothing runs the formula", async () => {
    const s = `${LIB}\nlet <keyCell:string=(tag(API_KEY))/>\n` + PROG("", `<d:string=(@keyCell + "!")/>`).trimStart();
    const b = await build(s, "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.js).toContain("rt.derived(inst$.scope, () => null)");
    expect(b.value).toBe("[zz-sk-live-123]");
    expect(b.server).not.toMatch(/^(?:const|let) d\w* = /m);
  }, 180000);

  test("an unread derived body cell whose formula reaches the secret is a shell", async () => {
    const b = await build(PROG(LIB, `<d:string=(@out + API_KEY)/>`));
    expect(leaked(b.client, SECRET)).toEqual([]);
  }, 180000);

  test("no secret is needed: a seed reading a binding only server code reads is server-only too (rule (b))", async () => {
    const s = PROG(LIB, `\${ let sx: string = "qx"; function sv() -> string { const r: Row = ?{\`SELECT name FROM users WHERE id = 1\`}.get() !{ _ :> { return sx; } }; return r.name + sx; } }\nlet <c:string=(tag(sx))/>`);
    const b = await build(s, "c");
    expect(b.js).not.toContain('"qx"');
    expect(b.value).toBe("[qx]");
  }, 180000);

  test("a persisted body cell, written: a shell; its seed runs in the server artifact", async () => {
    const b = await build(PROG(LIB, `let <keyCell:string=(tag(API_KEY)) persist="local" key="app.k"/>\n<button id="b" onclick={ @keyCell = "w"; }>b</button>`), "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);
});

describe("a READ keeps the body cell client-read (unchanged)", () => {
  test("a display, a locked display, a compound write, `bind:value`, an effect dependency, a request body, a client function, a server-call argument, a later read", async () => {
    for (const extra of [
      `let <keyCell:string=(tag(API_KEY))/>\n<p id="d">\${@keyCell}</p>`,
      `<keyCell:string=(tag(API_KEY))/>\n<p id="d">\${@keyCell}</p>`,
      `let <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @keyCell = @keyCell + "x"; }>b</button>`,
      `let <keyCell:string=(tag(API_KEY))/>\n<input id="i" bind:value=@keyCell/>`,
      `\${ let hits: int = 0; }\nlet <keyCell:string=(tag(API_KEY))/>\n<effect deps=[@keyCell]>\${ hits = hits + 1; }</>`,
      `let <keyCell:string=(tag(API_KEY))/>\nlet <m:string=""/>\n<request id="rq">\${ @m = @keyCell; }</request>`,
      `\${ function show() -> string { return @keyCell; } }\nlet <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @out = show(); }>b</button>`,
      `\${ function sk(s: string) -> string { const r: Row = ?{\`SELECT name FROM users WHERE id = 1\`}.get() !{ _ :> { return s; } }; return r.name + s; } }\nlet <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @out = sk(@keyCell) !{ .Transport(t) :> return }; }>b</button>`,
      `let <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @keyCell = "w"; }>b</button>\n<button id="r" onclick={ @out = @keyCell; }>r</button>`,
    ]) {
      const b = await build(PROG(LIB, extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    }
    const d = PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>\n<p id="d">\${@keyCell}</p>\n<button id="b" onclick={ @keyCell = "w"; }>b</button>`);
    expect(await texts(d, ["d"])).toEqual(["[zz-sk-live-123]"]);
    expect(await texts(d, ["d"], [{ click: "#b" }])).toEqual(["w"]);
  }, 600000);

  test("a body cell that reaches nothing server-only stays in the client with its seed", async () => {
    const b = await build(PROG(LIB, `let <c:string=(tag("plain"))/>\n<p id="d">x</p>`));
    expect(b.js).toContain('tag("plain")');
  }, 180000);
});

describe("⚑ INTERIM — a server-only body-cell seed that reads a cell (g-boot-outer-cell-server-seed-reads-cell-s482)", () => {
  test("a seed reading a client cell and the secret, and a chain of two unread body cells, are refused by name", async () => {
    for (const extra of [
      `let <keyCell:string=(tag(API_KEY) + @out)/>`,
      `let <a:string=(tag(API_KEY))/>\nlet <b:string=(@a + "x")/>`,
    ]) {
      const b = await build(PROG(LIB, extra));
      expect(b.ok).toBe(false);
      expect(b.err).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(b.err).toContain("a cell of the program body");
      expect(b.err).toContain("g-boot-outer-cell-server-seed-reads-cell-s482");
    }
  }, 300000);
});
