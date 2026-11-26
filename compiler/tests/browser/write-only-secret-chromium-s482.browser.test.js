/**
 * s482-write-only-secret (SECURITY) — a file-scope binding the client WRITES but never READS, whose
 * initializer reaches a server-only binding, is server-only (§7.6 rule (b) S481: "when no code reads it
 * and its initializer reaches … another server-only binding" — a write is not a read). The client gets a
 * SHELL to write to — a plain `let` with the absence value as its seed, or a cell declared outside the
 * body whose declaration has that seed — never the initializer. This file pins, in a REAL browser
 * (Playwright Chromium), that the client's writes to a shell run without error (a statement after the
 * write in the same handler still runs: `@n` counts the clicks) and that the page is otherwise unchanged.
 * The leak checks and happy-dom values: compiler/self-host-v2/slice-m4/write-only-secret-s482.test.js.
 *
 * Skipped (with a note) when Chromium cannot be launched on this machine.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");

let chromium = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  chromium = null;
}

let browser = null;
let launchError = null;
let dir = null;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "s482-write-only-chromium-"));
  if (!chromium) { launchError = "playwright not installed"; return; }
  try {
    browser = await chromium.launch();
  } catch (e) {
    launchError = String(e?.message ?? e).split("\n")[0];
  }
});

afterAll(async () => {
  if (browser) await browser.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

let n = 0;
// compile with the bootstrap CLI (the shipping path) into a fresh dir
function build(src) {
  const case_ = join(dir, `c${n++}`);
  mkdirSync(case_ + "-src", { recursive: true });
  const file = join(case_ + "-src", "main.scrml");
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
}

// every client file of `out` that holds `needle`
function clientHolds(out, needle) {
  const server = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];
  return readdirSync(out).filter((f) => !server.includes(f) && /\.(js|html)$/.test(f) && readFileSync(join(out, f), "utf8").includes(needle));
}

// serve `out` over http, load it, click each of `click` (ids) in order, read the text of each `#id`
async function load(out, ids, click) {
  const srv = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://localhost:${srv.port}/`);
    await page.waitForTimeout(300);
    for (const c of [].concat(click ?? [])) { await page.click("#" + c); await page.waitForTimeout(200); }
    const texts = await page.evaluate((xs) => xs.map((id) => document.getElementById(id)?.textContent ?? "<none>"), ids);
    return { errors, texts };
  } finally {
    await page.close();
    srv.stop();
  }
}

function skip() {
  if (!browser) { console.log(`[skip] Chromium unavailable: ${launchError}`); return true; }
  return false;
}

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
// `label` is server-placed (it reaches a `?{}`), so API_KEY is otherwise read only by server code
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
let <n:int=0/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${tag(@out)}</p>
<p id="n">\${@n}</p>
${extra}
</program>
`;

describe("a write to a shell runs without error (Chromium)", () => {
  test("o9-let: a plain `let` written by a handler — not in the client; two clicks count 2", async () => {
    if (skip()) return;
    const out = build(PROG(LET, `<button id="b" onclick={ keyLet = "w"; @n = @n + 1; }>b</button>`));
    expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
    expect(await load(out, ["n", "c"], ["b", "b"])).toEqual({ errors: [], texts: ["2", "[]"] });
  }, 120000);

  test("o9: a cell declared outside the body written by a handler — its shell is constructed at the first write", async () => {
    if (skip()) return;
    const out = build(PROG(CELL, `<button id="b" onclick={ @keyCell = "w"; @n = @n + 1; }>b</button>`));
    expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
    expect(await load(out, ["n", "c"], ["b", "b"])).toEqual({ errors: [], texts: ["2", "[]"] });
  }, 120000);

  test("written through a function, and a `${ }` binding in the body written by a handler", async () => {
    if (skip()) return;
    const a = build(PROG(CELL, `\${ function setK() { @keyCell = "w"; } }\n<button id="b" onclick={ setK(); @n = @n + 1; }>b</button>`));
    expect(clientHolds(a, "zz-sk-live-123")).toEqual([]);
    expect(await load(a, ["n"], ["b"])).toEqual({ errors: [], texts: ["1"] });
    const b = build(PROG(LIB, `\${ let keyLet: string = tag(API_KEY); }\n<button id="b" onclick={ keyLet = "w"; @n = @n + 1; }>b</button>`));
    expect(clientHolds(b, "zz-sk-live-123")).toEqual([]);
    expect(await load(b, ["n"], ["b"])).toEqual({ errors: [], texts: ["1"] });
  }, 120000);

  // s482 r1 (#2113 review HIGH-1 / PRE-1 / MED-1): an acting initializer nothing reads runs in the client
  // alone; what it reads is client-read. 19a014391 printed `let lit = null; let z = rec(lit);` (v01: the
  // page showed `null`, not `plain`); 153bd0334 and 19a014391 left `lit` out with no write (v01c:
  // ReferenceError at load). v02: the binding reaches the secret, so it and z are server-only (rule (b),
  // the largest set) — z's side effect runs on the server and the page shows nothing.
  const ACT = (init, mark) => `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    let lit: string = ${init};
    let hits: string = "";
    function rec(s: string) -> string { hits = hits + ${mark}; return "r"; }
    let z: string = rec(lit);
    function peek() -> string { return hits; }
}`;
  const ACT_UI = `<button id="r" onclick={ @out = peek(); @n = @n + 1; }>r</button>`;

  test("v01 / v01c: a binding read only by an acting, unread initializer keeps its value", async () => {
    if (skip()) return;
    const a = build(PROG(ACT('"plain"', "s"), `${ACT_UI}\n<button id="b" onclick={ lit = "w"; @n = @n + 1; }>b</button>`));
    expect(await load(a, ["n", "c"], ["b", "b", "r"])).toEqual({ errors: [], texts: ["3", "[plain]"] });
    const c = build(PROG(ACT('"plain"', "s"), ACT_UI));
    expect(await load(c, ["n", "c"], ["r"])).toEqual({ errors: [], texts: ["1", "[plain]"] });
  }, 120000);

  test("v02: the binding reaches the secret — not in the client; z's side effect is the server's", async () => {
    if (skip()) return;
    const out = build(PROG(ACT("tag(API_KEY)", '"<" + s + ">"'), `${ACT_UI}\n<button id="b" onclick={ lit = "w"; @n = @n + 1; }>b</button>`));
    expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
    expect(await load(out, ["n", "c"], ["b", "b", "r"])).toEqual({ errors: [], texts: ["3", "[]"] });
  }, 120000);

  // s482 r1 (#2113 review PRE-2): a kept condition-head assignment is a whole-value write — the binding
  // gets a shell (153bd0334 and 19a014391: ReferenceError at the click)
  test("v07 / v07b: a `let` written only in a condition head", async () => {
    if (skip()) return;
    const COND = `<button id="r" onclick={ if ((keyLet = "w") == "w") { @out = "ok"; } @n = @n + 1; }>r</button>`;
    const a = build(PROG(LET, COND));
    expect(clientHolds(a, "zz-sk-live-123")).toEqual([]);
    expect(await load(a, ["n", "c"], ["r"])).toEqual({ errors: [], texts: ["1", "[ok]"] });
    const b = build(PROG(LIB + `\n\${ let keyLet: string = "plain"; }`, COND));
    expect(await load(b, ["n", "c"], ["r"])).toEqual({ errors: [], texts: ["1", "[ok]"] });
  }, 120000);

  test("control: a cell the page reads keeps its seed and shows the write", async () => {
    if (skip()) return;
    const out = build(PROG(CELL, `<button id="b" onclick={ @keyCell = "w"; }>b</button>\n<p id="d">\${@keyCell}</p>`));
    expect(await load(out, ["d"])).toEqual({ errors: [], texts: ["[zz-sk-live-123]"] });
    expect(await load(out, ["d"], ["b"])).toEqual({ errors: [], texts: ["w"] });
  }, 120000);
});
