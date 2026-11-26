/**
 * s483-body-cell-server-only (SECURITY) — a cell of the PROGRAM BODY is judged by §7.6 rule (b) like a
 * file-scope binding (ruling:user-voice-scrml.md-S482-body-cell-server-only: "treat body cells like
 * top-level ones, so the same rule (b) classification applies"). One no client code reads whose seed
 * reaches a server-only binding is server-only: the client's program record holds its SHELL (seed `not`),
 * and the server artifact runs the seed. This file pins, in a REAL browser (Playwright Chromium), that a
 * page with such a cell loads, that the client's writes to the shell run without error (a statement after
 * the write in the same handler still runs: `@n` counts the clicks), and that a cell the page reads is
 * unchanged. The leak checks, server-artifact values and happy-dom values:
 * compiler/self-host-v2/slice-m4/body-cell-server-only-s483.test.js.
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
  dir = mkdtempSync(join(tmpdir(), "s483-body-cell-chromium-"));
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

describe("a server-only program-body cell is a shell in the client (Chromium)", () => {
  test("s12 / s13: an unread `let` cell and its locked form — not in the client; the page loads", async () => {
    if (skip()) return;
    for (const cell of [`let <keyCell:string=(tag(API_KEY))/>`, `<keyCell:string=(tag(API_KEY))/>`]) {
      const out = build(PROG(LIB, cell));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["n", "c"])).toEqual({ errors: [], texts: ["0", "[]"] });
    }
  }, 120000);

  test("n31: written by a handler, never read — the write runs on the shell; two clicks count 2", async () => {
    if (skip()) return;
    const out = build(PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @keyCell = "w"; @n = @n + 1; }>b</button>`));
    expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
    expect(await load(out, ["n", "c"], ["b", "b"])).toEqual({ errors: [], texts: ["2", "[]"] });
  }, 120000);

  test("written through a function; a persisted cell written by a handler", async () => {
    if (skip()) return;
    const a = build(PROG(LIB, `\${ function setK() { @keyCell = "w"; } }\nlet <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ setK(); @n = @n + 1; }>b</button>`));
    expect(clientHolds(a, "zz-sk-live-123")).toEqual([]);
    expect(await load(a, ["n"], ["b"])).toEqual({ errors: [], texts: ["1"] });
    const p = build(PROG(LIB, `let <keyCell:string=(tag(API_KEY)) persist="local" key="s483.k"/>\n<button id="b" onclick={ @keyCell = "w"; @n = @n + 1; }>b</button>`));
    expect(clientHolds(p, "zz-sk-live-123")).toEqual([]);
    expect(await load(p, ["n"], ["b"])).toEqual({ errors: [], texts: ["1"] });
  }, 120000);

  test("o2b: an unread derived body cell reading an unread outer cell — neither in the client", async () => {
    if (skip()) return;
    const out = build(`${LIB}\nlet <keyCell:string=(tag(API_KEY))/>\n` + PROG("", `<d:string=(@keyCell + "!")/>`).trimStart());
    expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
    expect(await load(out, ["n", "c"])).toEqual({ errors: [], texts: ["0", "[]"] });
  }, 120000);

  test("control: a body cell the page reads keeps its seed and shows the write", async () => {
    if (skip()) return;
    const out = build(PROG(LIB, `let <keyCell:string=(tag(API_KEY))/>\n<button id="b" onclick={ @keyCell = "w"; }>b</button>\n<p id="d">\${@keyCell}</p>`));
    expect(await load(out, ["d"])).toEqual({ errors: [], texts: ["[zz-sk-live-123]"] });
    expect(await load(out, ["d"], ["b"])).toEqual({ errors: [], texts: ["w"] });
  }, 120000);
});
