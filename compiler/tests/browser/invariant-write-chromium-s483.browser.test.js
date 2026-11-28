/**
 * s483-invariant-2 — declaration invariants checked on every write, in a REAL browser (Playwright Chromium).
 * change-id: s483-invariant-2. SPEC §66.13.5 "When it is checked", "Evaluation order", "Failure".
 *
 * RULED: ruling:user-voice-scrml.md-S483-struct-invariant-syntax item 2 — "check every write, as ruled. The
 * grouped write is the existing spread `@r = { ...@r, start: a, end: b }`: one snapshot, all or nothing, checked
 * once." — "otherwise the E-WRITE-INVARIANT-RT trap before any write (S477)"; ruling:user-voice-scrml.md-S483-
 * invariant-const-read ("Allow compile-time consts (Recommended)").
 * Each run-time trap: the page error names E-WRITE-INVARIANT-RT, the value on screen is unchanged, and the rest
 * of the handler does not run. The happy-dom pins: compiler/self-host-v2/slice-m4/invariant-write-s483.test.js.
 *
 * Skipped (with a note) when Chromium cannot be launched on this machine.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  dir = mkdtempSync(join(tmpdir(), "s483-invariant-write-chromium-"));
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
function build(src) {
  const case_ = join(dir, `c${n++}`);
  const file = case_ + ".scrml";
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
}

// load `out`, read each `#id` after the load and after each click (a `js:` step evaluates its script in the
// page); `init` (optional) runs before the page's own scripts; the page errors raised
async function load(out, ids, clicks = [], init = null) {
  const srv = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  if (init) await page.addInitScript(init);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const read = () => page.evaluate((xs) => xs.map((id) => (document.getElementById(id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim()), ids);
  try {
    await page.goto(`http://localhost:${srv.port}/`);
    await page.waitForFunction((id) => document.getElementById(id) !== null, ids[0], { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    const texts = [await read()];
    for (const c of clicks) {
      if (c.startsWith("js:")) await page.evaluate(c.slice(3));
      else await page.click(c);
      await page.waitForTimeout(100);
      texts.push(await read());
    }
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

const RANGE = `    <dateRange:struct>
        let <start:int=0/>
        let <end:int=10/>
    </>
    invariant (start <= end) [ordered]`;
const prog = (body) => `<program>\n${body}\n</program>\n`;

describe("Chromium: a write that breaks a declaration invariant traps before it writes", () => {
  test("a direct field write: kept, then refused (value unchanged, the handler stops)", async () => {
    if (skip()) return;
    const out = build(prog(`${RANGE}
    let <after:string="-"/>
    function setStart(n: int) { @dateRange.start = n; @after = "ran"; }
    <main><p id="s">\${@dateRange.start}</p><p id="a">\${@after}</p>
    <button id="ok" onclick=setStart(4)>ok</button><button id="bad" onclick=setStart(20)>bad</button></main>`));
    const r = await load(out, ["s", "a"], ["#ok", "#bad"]);
    expect(r.texts).toEqual([["0", "-"], ["4", "ran"], ["4", "ran"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors[0]).toContain("start = 20, end = 10");
  }, 120000);

  test("a spread: both fields move together; a refused spread writes neither (all or nothing)", async () => {
    if (skip()) return;
    const out = build(prog(`${RANGE}
    function shift(n: int) { @dateRange = { ...@dateRange, start: @dateRange.start + n, end: @dateRange.end + n }; }
    function squeeze(a: int, b: int) { @dateRange = { ...@dateRange, start: a, end: b }; }
    <main><p id="s">\${@dateRange.start}</p><p id="e">\${@dateRange.end}</p>
    <button id="sh" onclick=shift(15)>sh</button><button id="bad" onclick=squeeze(30, 3)>bad</button></main>`));
    const r = await load(out, ["s", "e"], ["#sh", "#bad"]);
    expect(r.texts).toEqual([["0", "10"], ["15", "25"], ["15", "25"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("start = 30, end = 3");
  }, 120000);

  test("a deep write into a value of a `type X:struct` with an invariant, and a local part write", async () => {
    if (skip()) return;
    const out = build("type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]\n" + prog(`    let <r:Range=({ lo: 1, hi: 2 })/>
    function deep(n: int) { @r.lo = n; }
    function loc(n: int) { let x: Range = { lo: 1, hi: 2 }; x.lo = n; @r = x; }
    <main><p id="lo">\${@r.lo}</p>
    <button id="d" onclick=deep(9)>d</button><button id="l" onclick=loc(7)>l</button></main>`));
    const r = await load(out, ["lo"], ["#d", "#l"]);
    expect(r.texts).toEqual([["1"], ["1"], ["1"]]);
    expect(r.errors.length).toBe(2);
    expect(r.errors[0]).toContain("[rng] of type Range");
  }, 120000);

  test("a declaration's construction is checked once its fields are seeded", async () => {
    if (skip()) return;
    const out = build(prog(`    \${ fn twelve() -> int { return 12; } }
    <dateRange:struct>
        let <start:int=(twelve())/>
        let <end:int=10/>
    </>
    invariant (start <= end) [ordered]
    <main><p id="x">x</p><p id="s">\${@dateRange.start}</p></main>`));
    const r = await load(out, ["x"], []);
    expect(r.errors.join(" ")).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors.join(" ")).toContain("start = 12, end = 10");
  }, 120000);

  test("evaluation order: a lone graph write refused by its edge traps on the edge, not the invariant", async () => {
    if (skip()) return;
    const out = build(prog(`    type Status:enum = { Placed, Packed, Shipped }
    <order:struct>
        let <tracking:string | not=not/>
        <status:Status=.Placed>
            <Placed rule=.Packed/>
            <Packed rule=.Shipped/>
            <Shipped/>
        </>
    </>
    invariant (status != .Shipped || tracking is given) [shippedHasTracking]
    function go(s: Status) { @order.status = s; }
    <main><p id="s">\${@order.status}</p><button id="x" onclick=go(.Shipped)>x</button><button id="p" onclick=go(.Packed)>p</button></main>`));
    const r = await load(out, ["s"], ["#x", "#p", "#x"]);
    expect(r.texts).toEqual([["Placed"], ["Placed"], ["Packed"], ["Packed"]]);
    expect(r.errors.length).toBe(2);
    expect(r.errors[0]).toContain("E-ENGINE-INVALID-TRANSITION");
    expect(r.errors[1]).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors[1]).toContain("[shippedHasTracking]");
  }, 120000);

  test("a compile-time constant in the invariant is checked at run time", async () => {
    if (skip()) return;
    const out = build(prog(`    \${ const MAX_NIGHTS = 14; }
${RANGE}
    invariant (end - start <= MAX_NIGHTS) [maxNights]
    function setEnd(n: int) { @dateRange.end = n; }
    <main><p id="e">\${@dateRange.end}</p><button id="ok" onclick=setEnd(14)>ok</button><button id="bad" onclick=setEnd(30)>bad</button></main>`));
    const r = await load(out, ["e"], ["#ok", "#bad"]);
    expect(r.texts).toEqual([["10"], ["14"], ["14"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("[maxNights]");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// r1 (#2128 review). H3 — ruling:user-voice-scrml.md-S483-invariant-derived-split ("Split"): an invariant over a
// field derived only from its sibling fields is checked at the sibling's write (the candidate recomputes it).
// H1 — §6.14.2 rules 1, 3, 5: a restored or cross-tab `persist=` value is decoded against the full declared
// contract, the type's invariant included; a value that breaks it takes the default.
// ---------------------------------------------------------------------------------------------------------------
describe("Chromium r1: derived fields are checked at the source write; a restored value is checked", () => {
  test("H3 i08: a field derived from siblings — a sibling write that breaks the invariant traps, nothing written", async () => {
    if (skip()) return;
    const out = build(prog(`    <w:struct>
        let <a:int=0/>
        let <b:int=5/>
        <span:int=(b - a)/>
    </>
    invariant (span <= 10) [ab]
    let <after:string="-"/>
    function setB(n: int) { @w.b = n; @after = "ran"; }
    <main><p id="s">\${@w.span}</p><p id="b">\${@w.b}</p><p id="x">\${@after}</p>
    <button id="ok" onclick=setB(8)>ok</button><button id="bad" onclick=setB(20)>bad</button></main>`));
    const r = await load(out, ["s", "b", "x"], ["#ok", "#bad"]);
    expect(r.texts).toEqual([["5", "5", "-"], ["8", "8", "ran"], ["8", "8", "ran"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors[0]).toContain("span = 20");
  }, 120000);

  test("H3 i10: a bool field derived from siblings, through a cell's value", async () => {
    if (skip()) return;
    const out = build(prog(`    <w:struct>
        let <a:int=0/>
        let <b:int=5/>
        <ok:bool=(a <= b)/>
    </>
    invariant (ok) [ab]
    let <k:int=-20/>
    <main><p id="s">\${@w.ok}</p><p id="b">\${@w.b}</p><button id="bad" onclick={ @w.b = @k; }>b</button></main>`));
    const r = await load(out, ["s", "b"], ["#bad"]);
    expect(r.texts).toEqual([["true", "5"], ["true", "5"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("ok = false");
  }, 120000);

  const PERSIST = "type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]\n" + prog(`    let <r:Range=({ lo: 1, hi: 2 }) persist="local" key="app.r"/>
    <main><p id="lo">\${@r.lo}</p><p id="hi">\${@r.hi}</p></main>`);

  test("H1 c03c: a stored value that breaks the invariant is not restored — the default is", async () => {
    if (skip()) return;
    const out = build(PERSIST);
    const bad = await load(out, ["lo", "hi"], [], `localStorage.setItem("app.r", JSON.stringify({ lo: 14, hi: 10 }))`);
    expect(bad.texts).toEqual([["1", "2"]]);
    expect(bad.errors).toEqual([]);
    // control: a stored value that keeps it is restored
    const good = await load(out, ["lo", "hi"], [], `localStorage.setItem("app.r", JSON.stringify({ lo: 3, hi: 7 }))`);
    expect(good.texts).toEqual([["3", "7"]]);
  }, 120000);

  test("H1 c03d: a cross-tab value that breaks the invariant takes the default; one that keeps it applies", async () => {
    if (skip()) return;
    const out = build(PERSIST);
    const ev = (v) => `js:localStorage.setItem("app.r", ${JSON.stringify(JSON.stringify(v))}); window.dispatchEvent(new StorageEvent("storage", { key: "app.r", newValue: ${JSON.stringify(JSON.stringify(v))}, storageArea: localStorage }))`;
    const r = await load(out, ["lo", "hi"], [ev({ lo: 3, hi: 7 }), ev({ lo: 14, hi: 10 })], `localStorage.clear()`);
    expect(r.texts).toEqual([["1", "2"], ["3", "7"], ["1", "2"]]);
    expect(r.errors).toEqual([]);
  }, 120000);

  test("H1: an element of a restored tape is checked too (the whole depth)", async () => {
    if (skip()) return;
    const out = build("type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]\n" + prog(`    <rs:Range[0..=5, replace]=([{ lo: 1, hi: 2 }]) persist="local" key="app.rs"/>
    <main><p id="n">\${@rs.length}</p></main>`));
    const bad = await load(out, ["n"], [], `localStorage.setItem("app.rs", JSON.stringify([{ lo: 1, hi: 2 }, { lo: 9, hi: 3 }]))`);
    expect(bad.texts).toEqual([["1"]]);
    const good = await load(out, ["n"], [], `localStorage.setItem("app.rs", JSON.stringify([{ lo: 1, hi: 2 }, { lo: 3, hi: 9 }]))`);
    expect(good.texts).toEqual([["2"]]);
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// r2 (#2128 r1 re-review). H4 — a restored / cross-tab value is checked inside an ENUM PAYLOAD too (§6.14.2 rules 1,
// 3, 5). H5 — a whole-value write of a type that CONTAINS an invariant-bearing type judges the written value at its
// whole depth: a host function's return (a tape of Range, a struct holding a Range) and a server function's rows
// (§66.13.5 "When it is checked": every write).
// ---------------------------------------------------------------------------------------------------------------

// compile `files` (name → text; `main.scrml` the entry) in a fresh source dir; the output dir
function buildFiles(files) {
  const case_ = join(dir, `c${n++}`);
  const src = case_ + "-src";
  mkdirSync(src, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(src, f), text);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", join(src, "main.scrml"), "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return { out: case_, src };
}

// load as `load` does, with the server artifact answering `/_scrml/*` (createServer, its root the source dir)
async function loadServed(out, root, ids, clicks) {
  const mod = await import(pathToFileURL(join(out, "program.server.js")).href);
  const server = mod.createServer({ root, log: () => {} });
  const srv = Bun.serve({ port: 0, async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p.startsWith("/_scrml")) return (await server.fetch(req)) ?? new Response("not found", { status: 404 });
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const read = () => page.evaluate((xs) => xs.map((id) => (document.getElementById(id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim()), ids);
  try {
    await page.goto(`http://localhost:${srv.port}/`);
    await page.waitForTimeout(300);
    const texts = [await read()];
    for (const c of clicks) {
      await page.click(c);
      await page.waitForTimeout(500);
      texts.push(await read());
    }
    return { errors, texts };
  } finally {
    await page.close();
    srv.stop();
  }
}

describe("Chromium r2: the whole depth — an enum payload, a host return, a server function's rows", () => {
  test("H4 n21: a stored payload value that breaks the invariant is not restored, and a cross-tab one is refused", async () => {
    if (skip()) return;
    const out = build(`<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    type Slot:enum = { Empty, Held(r: Range) }
}
let <s:Slot=(.Empty) persist="local" key="app.s"/>
<main><p id="v">\${match @s { .Empty :> -1, .Held(r) :> r.lo }}</p></main>
</program>
`);
    const wire = (lo, hi) => JSON.stringify({ variant: "Held", data: { r: { lo, hi } } });
    const bad = await load(out, ["v"], [], `localStorage.setItem("app.s", ${JSON.stringify(wire(14, 2))})`);
    expect(bad.texts).toEqual([["-1"]]);
    expect(bad.errors).toEqual([]);
    const good = await load(out, ["v"], [], `localStorage.setItem("app.s", ${JSON.stringify(wire(1, 2))})`);
    expect(good.texts).toEqual([["1"]]);
    const ev = (w) => `js:localStorage.setItem("app.s", ${JSON.stringify(w)}); window.dispatchEvent(new StorageEvent("storage", { key: "app.s", newValue: ${JSON.stringify(w)}, storageArea: localStorage }))`;
    const x = await load(out, ["v"], [ev(wire(3, 7)), ev(wire(14, 2))], `localStorage.clear()`);
    expect(x.texts).toEqual([["-1"], ["3"], ["-1"]]);
  }, 120000);

  test("H5 n29: a host function's tape of Range, and a struct holding a Range, are checked before the write", async () => {
    if (skip()) return;
    const { out } = buildFiles({
      "glue.js": "export function mk() { return [{ lo: 9, hi: 3 }]; }\nexport function mk2() { return { r: { lo: 9, hi: 3 }, n: 1 }; }\nexport function ok() { return [{ lo: 1, hi: 3 }, { lo: 2, hi: 2 }]; }\n",
      "main.scrml": `<host src="./glue.js">
  mk() -> Range[replace]
  mk2() -> Outer
  ok() -> Range[replace]
</host>
<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    type Outer:struct = { r: Range, n: int }
}
<rs:Range[replace]=([])/>
let <o:Outer=({ r: { lo: 1, hi: 2 }, n: 0 })/>
<main><p id="s">\${@rs.length}</p><p id="o">\${@o.r.lo}/\${@o.r.hi}</p>
<button id="b" onclick={ @rs = mk(); }>b</button><button id="c" onclick={ @o = mk2(); }>c</button><button id="g" onclick={ @rs = ok(); }>g</button></main>
</program>
`,
    });
    const r = await load(out, ["s", "o"], ["#b", "#c", "#g"]);
    expect(r.texts).toEqual([["0", "1/2"], ["0", "1/2"], ["0", "1/2"], ["2", "1/2"]]);
    expect(r.errors.length).toBe(2);
    for (const e of r.errors) {
      expect(e).toContain("E-WRITE-INVARIANT-RT");
      expect(e).toContain("lo = 9, hi = 3");
    }
  }, 120000);

  test("H5 n27: a server function's rows are checked before the write; a single row too", async () => {
    if (skip()) return;
    const { out, src } = buildFiles({
      "main.scrml": `<program db="./app.db">
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    function all() -> Range[replace] {
        const t: Range[replace] = ?{\`SELECT lo, hi FROM rs ORDER BY id\`}.all() !{ _ :> { return []; } };
        return t;
    }
    function one(a: int) -> Range {
        const t: Range = ?{\`SELECT lo, hi FROM rs WHERE id = \${a}\`}.get() !{ _ :> { const z: Range = { lo: 0, hi: 0 }; return z; } };
        return t;
    }
}
<rs:Range[replace]=([])/>
let <r:Range=({ lo: 0, hi: 0 })/>
<main><p id="n">\${@rs.length}</p><p id="r">\${@r.lo}/\${@r.hi}</p>
<button id="go" onclick={ @rs = all() !{ .Transport(_) :> return }; }>go</button>
<button id="one" onclick={ @r = one(1) !{ .Transport(_) :> return }; }>one</button></main>
</program>
`,
    });
    const { Database } = await import("bun:sqlite");
    const db = new Database(join(src, "app.db"), { create: true });
    db.exec("CREATE TABLE rs (id INTEGER PRIMARY KEY, lo INTEGER, hi INTEGER); INSERT INTO rs VALUES (1, 9, 3); INSERT INTO rs VALUES (2, 4, 6);");
    db.close();
    const r = await loadServed(out, src, ["n", "r"], ["#go", "#one"]);
    expect(r.texts).toEqual([["0", "0/0"], ["0", "0/0"], ["0", "0/0"]]);
    const traps = r.errors.filter((e) => e.includes("E-WRITE-INVARIANT-RT"));
    expect(traps.length).toBe(2);
    for (const e of traps) expect(e).toContain("lo = 9, hi = 3");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// r3 (#2128 r2 re-review H6, L9): a write-only cell whose seed reaches a secret stays a shell AND its whole writes
// are checked; a host function's return is checked where it is returned
// ---------------------------------------------------------------------------------------------------------------
const { readdirSync, readFileSync } = await import("node:fs");
// every client-side file of an output directory (the server artifact and its runtime excluded)
function clientFiles(out) {
  let txt = "";
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const q = join(d, f.name);
      if (f.isDirectory()) walk(q);
      else if (!/server/.test(f.name)) txt += readFileSync(q, "utf8") + "\n";
    }
  };
  walk(out);
  return txt;
}

const secretProg = (secret, cells, write) => `\${
    const API_KEY: string = "${secret}";
}
<program db="./app.db">
\${
    type Row:struct = { name: string }
    type Tok:struct = { v: string } invariant (v != "") [nonEmpty]
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
let <s:string=""/>
let <n:int=0/>
${cells}
<main>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p><p id="n">\${@n}</p>
<button id="fill" onclick={ @s = "ok"; }>fill</button>
<button id="w" onclick={ ${write} @n = @n + 1; }>w</button>
</main>
</program>
`;

describe("Chromium r3: a write-only cell seeded from a secret — no secret in the client, every whole write still checked", () => {
  for (const [id, cells, write] of [
    ["w1 a body cell of an invariant-bearing type", `let <tk:Tok=({ v: API_KEY })/>`, "@tk = { v: @s };"],
    ["w3 a component's cell", `<widget:struct>\n    let <tk:string=(API_KEY)/>\n</> renders <i>w</i>\ninvariant (tk != "") [nonEmpty]\n<widget/>`, "@widget.tk = @s;"],
    ["w4 a struct declaration's field", `<tok:struct>\n    let <v:string=(API_KEY)/>\n</>\ninvariant (v != "") [nonEmpty]`, "@tok.v = @s;"],
  ]) {
    test(`${id}: a bad whole write traps (the handler stops), a good one lands`, async () => {
      if (skip()) return;
      const secret = "zz-sk-r3c-" + id.split(" ")[0];
      const out = build(secretProg(secret, cells, write));
      expect(clientFiles(out)).not.toContain(secret);
      const r = await load(out, ["n"], ["#w", "#fill", "#w"]);
      expect(r.texts).toEqual([["0"], ["0"], ["0"], ["1"]]);
      expect(r.errors.length).toBe(1);
      expect(r.errors[0]).toContain("E-WRITE-INVARIANT-RT");
      expect(r.errors[0]).toContain("[nonEmpty]");
    }, 120000);
  }
});

describe("Chromium r3: a host function's return is checked where it is returned (L9)", () => {
  test("held in a local, built into a construction: traps before anything reads it; a good value lands", async () => {
    if (skip()) return;
    const { out } = buildFiles({
      "glue.js": "export function mk2() { return { r: { lo: 9, hi: 3 }, n: 1 }; }\nexport function ok2() { return { r: { lo: 1, hi: 3 }, n: 1 }; }\n",
      "main.scrml": `<host src="./glue.js">
  mk2() -> Outer
  ok2() -> Outer
</host>
<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    type Outer:struct = { r: Range, n: int }
    type Box:struct = { o: Outer }
}
let <out:int=0/>
<main><p id="s">\${@out}</p>
<button id="b" onclick={ const x: Outer = mk2(); @out = x.r.lo; }>b</button>
<button id="c" onclick={ const y: Box = { o: mk2() }; @out = y.o.r.lo; }>c</button>
<button id="g" onclick={ const z: Outer = ok2(); @out = z.r.lo; }>g</button></main>
</program>
`,
    });
    const r = await load(out, ["s"], ["#b", "#c", "#g"]);
    expect(r.texts).toEqual([["0"], ["0"], ["0"], ["1"]]);
    expect(r.errors.length).toBe(2);
    for (const e of r.errors) {
      expect(e).toContain("E-WRITE-INVARIANT-RT");
      expect(e).toContain("lo = 9, hi = 3");
    }
  }, 120000);
});
