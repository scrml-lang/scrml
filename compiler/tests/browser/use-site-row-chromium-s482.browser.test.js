/**
 * s482-seed-timing r2 (#2105 r1 review HIGH-A) — a component's use-site value that reads an `<each>` row
 * item or a `<match>` arm payload, in a REAL browser (Playwright Chromium).
 *
 * Ruling: ruling:user-voice-scrml.md-S482-locked-field-derived — "a locked field is derived exactly when its
 * initializer reads a cell, directly or through any function it calls, at any depth. Otherwise it's a
 * constant, whose initializer is a seed computed at its place, meaning the instance's mount." A row item
 * (`as it`) and a match-arm payload are projections of a cell's element: a use-site value reading one READS
 * A CELL, so it is derived (§66.9 rule 8) — it follows the row. r1 (c122902d6) printed it as a constant seed
 * (`rt.givenSeed(() => it.get())`) and it froze at the mount: w11 `D7 L1 L10` while the row's own text
 * showed 7 (base / now: `D7 L7 L70`). The printer's reach (print.scrml readsCellReach) now fails closed on
 * any `Local` that is not a file-scope binding.
 *
 * Expected values are base's (main 1e8a11758) for w01 / w02 / w04 / w08 / w10 / w11 / w12; a13 keeps the
 * Q13 value 2 (base 11); w20 — a use-site constant in a row that reads no row item — is seeded at EACH
 * row's mount (rows at load 2, a row mounted after `n = 10` 11).
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
  dir = mkdtempSync(join(tmpdir(), "s482-use-site-row-chromium-"));
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

// serve `out` over http, load it, click each of `click` (an id, or a list of ids) in order, read the text of each `#id`
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

const LEAF_INT = "<leaf k:int=0>\n</> renders <b>${k}</b>\n";
const LEAF_L = "<leaf k:int=0>\n</> renders <b>L${k}</b>\n";
const LEAF_S = "${ type It:struct = { name: string } }\n<leaf k:string=\"\">\n</> renders <b>${k}</b>\n";

describe("HIGH-A — a use-site value reading a row item or an arm payload is derived (Chromium)", () => {
  const rows = [
    ["w01: `<leaf k=it/>`, the tape replaced — 52 (r1: 12)", LEAF_INT + `<program>
<items:int[replace, write]=([1, 2])/>
<p id="o"><each in=@items as it><leaf k=it/></each></p>
<button id="b" onclick={ @items = [5, 2]; }>b</button>
</program>
`, ["o"], "b", ["52"]],
    ["w02: `<leaf k=(it + 0)/>`, an index write — 72 (r1: 12)", LEAF_INT + `<program>
<items:int[replace, write]=([1, 2])/>
<p id="o"><each in=@items as it><leaf k=(it + 0)/></each></p>
<button id="b" onclick={ @items[0] = 7; }>b</button>
</program>
`, ["o"], "b", ["72"]],
    ["w04: `<leaf k=(it.name)/>`, a struct row field — zb (r1: ab)", LEAF_S + `<program>
<items:It[replace, write]=([{ name: "a" }, { name: "b" }])/>
<p id="o"><each in=@items as it><leaf k=(it.name)/></each></p>
<button id="b" onclick={ @items = [{ name: "z" }, { name: "b" }]; }>b</button>
</program>
`, ["o"], "b", ["zb"]],
    ["w10: `<leaf k=(it.name + \"!\")/>` — z!b! (r1: a!b!)", LEAF_S + `<program>
<items:It[replace]=([{ name: "a" }, { name: "b" }])/>
<p id="o"><each in=@items as it><leaf k=(it.name + "!")/></each></p>
<button id="b" onclick={ @items = [{ name: "z" }, { name: "b" }]; }>b</button>
</program>
`, ["o"], "b", ["z!b!"]],
    ["w11: the row's own text and its components agree — D7L7L70 (r1: D7L1L10)", LEAF_L + `<program>
<items:int[replace, write]=([1, 2])/>
<p id="o"><each in=@items as it><i>D\${it}</i><leaf k=it/><leaf k=(it * 10)/></each></p>
<button id="b" onclick={ @items[0] = 7; }>b</button>
</program>
`, ["o"], "b", ["D7L7L70D2L2L20"]],
    ["w12: a row record reused for a new tape — L3 (r1: L1)", LEAF_L + `<program>
<items:int[replace, write]=([1, 2])/>
<p id="o"><each in=@items as it><leaf k=(it + 0)/></each></p>
<p id="o2">\${@items.length}</p>
<button id="b" onclick={ @items = [3]; }>b</button>
</program>
`, ["o", "o2"], "b", ["L3", "1"]],
    ["w08: a `<match>` arm payload — D9L9 (r1: D9L1)", LEAF_L + `<program>
type Ph:enum = { A(v: int), B }
let <ph:Ph=(Ph.A(1))/>
<p id="o"><match on=@ph>
  <A(v)><i>D\${v}</i><leaf k=v/></>
  <B><span>b</span></>
</match></p>
<button id="b" onclick={ @ph = Ph.A(9); }>b</button>
</program>
`, ["o"], "b", ["D9L9"]],
  ];
  for (const [name, src, ids, click, want] of rows) {
    test(name, async () => {
      if (skip()) return;
      expect(await load(build(src), ids, click)).toEqual({ errors: [], texts: want });
    }, 120000);
  }

  test("w20: a use-site value in a row that reads NO row item is a constant seeded at each row's mount — 2 2, then a new row 11", async () => {
    if (skip()) return;
    const out = build(LEAF_L + `<program>
\${ let n: int = 1; }
\${ function rn() -> int { return n; } }
<items:int[replace, write]=([1, 2])/>
<p id="o"><each in=@items as it><i>D\${it}</i><leaf k=(rn() + 1)/></each></p>
<button id="b" onclick={ n = 10; @items[0] = 7; }>b</button>
<button id="go" onclick={ @items = [1, 2, 3]; }>go</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["D7L2D2L2"] });
    expect(await load(out, ["o"], ["b", "go"])).toEqual({ errors: [], texts: ["D1L2D2L2D3L11"] });
  }, 120000);

  test("a13 (control, Q13): a constant use-site value outside a row is still seeded at the mount — 2 (base 11)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ function rn() -> int { return n; } }
let <m:int=1/>
let <show:boolean=false/>
<cp v:int=(0)>
</> renders <p if=(@show)>\${v}</p>
<span id="o"><cp v=(rn() + 1)/></span>
<button id="b" onclick={ n = 10; @m = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["2"] });
  }, 120000);
});

// r3 (#2105 r2 review LOW-1) — a lambda's own parameter is bound inside the initializer and reads no
// cell (Q13): the field is a constant seeded at the mount. 6049c6944 counted `x` as a free local and
// made it derived (V12).
describe("LOW-1 — a lambda parameter in a locked field is not a cell read (Chromium)", () => {
  test("v14: `xs.map(x => x + rn())` over a const tape — V3 (the mount saw n = 1), not V12", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ function rn() -> int { return n; } }
\${ const xs: int[] = [1, 2]; }
let <show:boolean=false/>
<cz t:string="x">
<v:int=(xs.map(x => x + rn()).length + rn())/>
</> renders <p if=(@show)>V\${v}</p>
<p id="o"><cz/></p>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
`);
    expect(await load(out, ["o"], "b")).toEqual({ errors: [], texts: ["V3"] });
  }, 120000);
});
