/**
 * s483-component-cell-server-only (SECURITY) — a cell of a COMPONENT's body is judged by §7.6 rule (b) like a
 * program-body cell (ruling:user-voice-scrml.md-S483-component-cell-server-only, RULED (a): "an unread component
 * cell whose seed reaches server-only code becomes an empty client stand-in and nothing runs its seed"), and a
 * reset is a whole-value write, not a read (#2121 review MED-1, prov=pa-ruled:S483-reset-is-write). This file
 * pins, in a REAL browser (Playwright Chromium), that pages with such cells (one instance, many, nested, written
 * or reset by the component's own handler) load and run without error, that the secret is in no client file,
 * and that a cell the page reads — and a reset of it — is unchanged. Leak checks, server artifact and happy-dom
 * values: compiler/self-host-v2/slice-m4/component-cell-server-only-s483.test.js.
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
  dir = mkdtempSync(join(tmpdir(), "s483-component-cell-chromium-"));
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
const PROG = (extra) => `${LIB}
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
const CARD = (body, renders) => `<card t:string="x">\n  ${body}\n</> renders ${renders}`;
const KCELL = `let <k:string=(tag(API_KEY))/>`;

describe("a server-only component cell is an empty stand-in in every instance (Chromium)", () => {
  test("b04 one instance, three instances, nested — not in the client; the page loads", async () => {
    if (skip()) return;
    for (const extra of [
      CARD(KCELL, `<b id="k">x</b>`) + "\n<card/>",
      CARD(KCELL, `<b class="k">x</b>`) + "\n<card/><card/><card/>",
      `<inner u:string="u">\n  ${KCELL}\n</> renders <i id="k">u</i>\n<card t:string="x"/> renders <b>x<inner/></b>\n<card/>`,
    ]) {
      const out = build(PROG(extra));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["n", "c", "k"])).toEqual({ errors: [], texts: ["0", "[]", extra.includes('class="k"') ? "<none>" : extra.includes("<inner") ? "u" : "x"] });
    }
  }, 180000);

  test("written, and reset, by the component's own handler, never read — the handler runs on the shell", async () => {
    if (skip()) return;
    for (const act of [`@card.k = "w";`, `reset(@card.k);`]) {
      const out = build(PROG(CARD(KCELL, `<button id="b" onclick={ ${act} @n = @n + 1; }>b</button>`) + "\n<card/>"));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["n"], ["b", "b"])).toEqual({ errors: [], texts: ["2"] });
    }
  }, 120000);

  test("MED-1: a program cell only reset (reset(@kc), reset-on=) — not in the client; the page runs", async () => {
    if (skip()) return;
    const a = build(PROG(`let <kc:string=(tag(API_KEY))/>\n<button id="b" onclick={ reset(@kc); @n = @n + 1; }>b</button>`));
    expect(clientHolds(a, "zz-sk-live-123")).toEqual([]);
    expect(await load(a, ["n"], ["b"])).toEqual({ errors: [], texts: ["1"] });
    const o = build(PROG(`let <t:int=0/>\nlet <kc:string=(tag(API_KEY)) reset-on=[@t]/>\n<button id="b" onclick={ @t = @t + 1; @n = @n + 1; }>b</button>`));
    expect(clientHolds(o, "zz-sk-live-123")).toEqual([]);
    expect(await load(o, ["n"], ["b", "b"])).toEqual({ errors: [], texts: ["2"] });
  }, 120000);

  test("control: a component cell its markup reads keeps its seed; a program cell's reset restores its seed", async () => {
    if (skip()) return;
    const out = build(PROG(CARD(KCELL, `<b id="k">\${k}</b>`) + "\n<card/>"));
    expect(await load(out, ["k"])).toEqual({ errors: [], texts: ["[zz-sk-live-123]"] });
    const r = build(PROG(`let <kc:string=(tag("p"))/>\n<p id="d">\${@kc}</p>\n<button id="b" onclick={ @kc = "w"; }>b</button>\n<button id="r" onclick={ reset(@kc); }>r</button>`));
    expect(await load(r, ["d"], ["b"])).toEqual({ errors: [], texts: ["w"] });
    expect(await load(r, ["d"], ["b", "r"])).toEqual({ errors: [], texts: ["[p]"] });
  }, 120000);
});
