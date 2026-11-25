/**
 * s482-seed-timing — when a seed runs, in a REAL browser (Playwright Chromium).
 *
 * Q13 — ruling:user-voice-scrml.md-S482-locked-field-derived: "a locked field is derived exactly when its
 * initializer reads a cell, directly or through any function it calls, at any depth. Otherwise it's a
 * constant, whose initializer is a seed computed at its place, meaning the instance's mount." Base pulled
 * every locked field / prop default at its first read (#2096 r2 review MED-A, probes z01–z03: 11, not 2).
 *
 * Q12 — ruling:user-voice-scrml.md-S482-outside-cell-seed-time: a cell declared outside the program body
 * (an imported file, or the same file outside `<program>`) has its seed run "before the body, in link
 * order" — "the same as the library's plain `let` / `const` initializers, even when nothing reads the
 * cell". Base ran it lazily, at its first read.
 *
 * Skipped (with a note) when Chromium cannot be launched on this machine.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  dir = mkdtempSync(join(tmpdir(), "s482-seed-timing-chromium-"));
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
// compile `main.scrml` (and, when given, a `lib.scrml` beside it) with the bootstrap CLI into a fresh dir
function build(src, lib) {
  const case_ = join(dir, `c${n++}`);
  mkdirSync(case_ + "-src", { recursive: true });
  const file = join(case_ + "-src", "main.scrml");
  writeFileSync(file, src);
  if (lib !== undefined) writeFileSync(join(case_ + "-src", "lib.scrml"), lib);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
}

// serve `out` over http, load it, optionally click `#click`, read the text of each `#id`
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
    if (click) { await page.click("#" + click); await page.waitForTimeout(200); }
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

const N = "${ let n: int = 1; }";
const R = "${ function rn() -> int { return n; } }";

describe("Q13 — a locked field that reads no cell is a constant seeded at the instance's mount (Chromium)", () => {
  test("z01: a field calling a function, shown only after `n = 10` — 2 (the mount saw n = 1; base 11)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
${R}
let <show:boolean=false/>
<card t:string="x">
    <v:int=(rn() + 1)/>
</> renders <b if=(@show) id="o">\${v}</b>
<card/>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["2"] });
  }, 120000);

  test("z02: a prop default calling a function — 2 (base 11)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
${R}
let <show:boolean=false/>
<cp v:int=(rn() + 1)>
</> renders <p if=(@show) id="o">\${v}</p>
<cp/>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["2"] });
  }, 120000);

  test("z03: a field reading the `let` directly — 2 (base 11)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
let <show:boolean=false/>
<card t:string="x">
    <v:int=(n + 1)/>
</> renders <b if=(@show) id="o">\${v}</b>
<card/>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["2"] });
  }, 120000);

  test("an instance mounted at load, shown at load: 2, and still 2 after `n = 10` (never recomputed)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
${R}
let <tick:int=0/>
<card t:string="x">
    <v:int=(rn() + 1)/>
</> renders <b id="o">\${v}</b>
<card/>
<p id="o2">\${@tick}</p>
<button id="b" onclick={ n = 10; @tick = @tick + 1; }>b</button>
</program>
`);
    expect(await load(out, ["o", "o2"], "b")).toEqual({ errors: [], texts: ["2", "1"] });
  }, 120000);

  test("an instance under `if=` mounts when the branch shows — after `n = 10`: 11", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
${R}
let <show:boolean=false/>
<card t:string="x">
    <v:int=(rn() + 1)/>
</> renders <b id="o">\${v}</b>
<div if=(@show)><card/></div>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["11"] });
  }, 120000);

  test("`<each>` rows: each row's mount — row 1 at load (2), row 2 after `n = 10` (11); base `11 11`", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
${R}
<rows:int[replace]=([1])/>
let <show:boolean=false/>
<card t:string="x">
    <v:int=(rn() + 1)/>
</> renders <b if=(@show)>\${v} </b>
<div id="out"><each in=(@rows)><card/></each></div>
<button id="b" onclick={ n = 10; @rows = [1, 2]; @show = true; }>b</button>
</program>
`);
    const r = await load(out, ["out"], "b");
    expect(r.errors).toEqual([]);
    expect(r.texts[0].replace(/\s+/g, " ").trim()).toBe("2 11");
  }, 120000);

  test("a locked PROGRAM cell is seeded at its declaration: between `n = 5` and `n = 7` — 6 (base 11)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
${R}
let <show:boolean=false/>
\${ n = 5; }
<c:int=(rn() + 1)/>
\${ n = 7; }
<p if=(@show) id="o">\${@c}</p>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["6"] });
  }, 120000);

  test("control: a field that reads a cell is derived — recomputed (11)", async () => {
    if (skip()) return;
    const out = build(`<program>
let <m:int=1/>
let <show:boolean=false/>
<card t:string="x">
    <v:int=(@m + 1)/>
</> renders <b if=(@show) id="o">\${v}</b>
<card/>
<button id="b" onclick={ @m = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["11"] });
  }, 120000);
});

describe("Q12 — a cell declared outside the body is seeded before the body, in link order (Chromium)", () => {
  const LIB = `\${ export let n: int = 1; }
\${ export function setN() { n = 5; } }
export let <z:int=(n + 0)/>
`;
  test("an imported cell read after a body write of what its seed reads — 1 (base 5)", async () => {
    if (skip()) return;
    const out = build(`\${ import { n, setN, z } from "./lib.scrml"; }
<program>
\${ setN(); }
<p id="o">\${@z}</p>
</program>
`, LIB);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["1"] });
  }, 120000);

  test("an imported cell nothing reads still runs its seed before the body (a trapping seed reports at load; base: never ran)", async () => {
    if (skip()) return;
    const out = build(`\${ import { n, z } from "./lib.scrml"; }
<program>
<p id="o">\${n}</p>
</program>
`, `\${ export let n: int = 1; }
\${ export function boom() -> int { const xs: int[] = [1]; return xs[n + 4]; } }
export let <z:int=(boom())/>
`);
    const r = await load(out, ["o"]);
    expect(r.errors.join(" ")).toContain("E-INDEX-OUT-OF-RANGE-RT");
  }, 120000);

  test("a same-file cell before `<program>` — 1 (base 5)", async () => {
    if (skip()) return;
    const out = build(`\${ let w: int = 1; }
\${ function setW() { w = 5; } }
let <m:int=(w + 0)/>
<program>
\${ setW(); }
<p id="o">\${@m}</p>
<p id="o2">\${w}</p>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["1", "5"] });
  }, 120000);

  test("link order inside the library: a later initializer's write is not seen by an earlier cell's seed — 1 (base 5)", async () => {
    if (skip()) return;
    const out = build(`\${ import { n, z, u } from "./lib.scrml"; }
<program>
<p id="o">\${@z}</p>
<p id="o2">\${n + u}</p>
</program>
`, `\${ export let n: int = 1; }
\${ export function setN() -> int { n = 5; return 0; } }
export let <z:int=(n + 0)/>
\${ export const u: int = setN(); }
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["1", "5"] });
  }, 120000);

  test("inside a construct: a read of the imported cell before an initializer (#2082 x3 shape, non-writing seed) — z 1, k 5", async () => {
    if (skip()) return;
    const out = build(`\${ import { n, setN, z } from "./lib.scrml"; }
<program>
\${ setN(); }
<div if=(true)><b id="o2">\${@z}</b>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, LIB);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["5", "1"] });
  }, 120000);
});

// r3 (#2105 r2 review MED-B) — an outside seed reading an outside DERIVED cell whose formula reads a
// program cell: refused at compile time (E-SCOPE-001), never a page that dies at load. Red on 6049c6944:
// it compiled and Chromium reported `Cannot access 'decl_program' before initialization` (main: 10).
describe("MED-B — an outside seed reaching a program cell through an outside derived cell (Chromium)", () => {
  test("m01: refused with E-SCOPE-001; e12d control (the derived cell read only in the body) renders 5, no page error", async () => {
    if (skip()) return;
    expect(() => build(`<d:int=(@n + 1)/>
let <a:int=(@d * 2)/>
<program>
let <n:int=4/>
<p id="o">\${@a}</p>
</program>
`)).toThrow("E-SCOPE-001");
    const out = build(`<a:int=(@n + 1)/>
<program>
let <n:int=4/>
<p id="o">\${@a}</p>
</program>
`);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);
});
