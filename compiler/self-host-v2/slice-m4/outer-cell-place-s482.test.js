// outer-cell-place-s482.test.js — #2105 review r1 (lane s482-seed-timing): a cell declared OUTSIDE
// the program body (an imported file, or the entry file before / after `<program>`) is seeded before
// the body, in link order — "the same as the library's plain let / const initializers, even when
// nothing reads the cell" (ruling:user-voice-scrml.md-S482-outside-cell-seed-time).
//
// HIGH-1 — the same server-only classification as a plain initializer (§7.6 rule (b) / R6, S481;
//   ruling:user-voice-scrml.md-S482-circular-server-only, the largest set): an unread outer cell whose
//   seed reaches server-only code is in NO client file; the server artifact runs its seed at module
//   initialization. Red on fc3097098 (program.client.js held `const API_KEY = "zz-sk-live-123"`).
//   A server-only seed that also reads a cell is refused by name (INTERIM,
//   g-boot-outer-cell-server-seed-reads-cell-s482).
// MED-1 / MED-2 — such a seed reaching a binding placed after it (later in link order, or anywhere in
//   the program body — a cell written after `</program>` too) is E-SCOPE-001 at compile time
//   (§7.6 R1 + R2), not a load-time ReferenceError (red on fc3097098: c05c / c06 / y16 / y26 crashed
//   the page at load) nor a value from the wrong order (y20: k = 2, source order 10).
//
// LOW-1 (built) — §66.7.6 rule 5: a use-site value that reads no cell is a seed computed at the
//   instance's mount, as the same expression written as the default is (Q13). Red on fc3097098:
//   `<cp v=(rn() + 1)/>` gave 11 (computed at the first read, after the click), the default 2.
//
// r2 (#2105 r1 review):
// HIGH-A — a use-site value reading an `<each>` row item or a `<match>` arm payload reads a cell (the
//   item is the cell's element): derived, not a constant seed (Q13 — "derived exactly when its
//   initializer reads a cell"). Red on c122902d6: `rt.givenSeed(() => it.get())`, w11 `D7L1L10`.
//   Chromium: compiler/tests/browser/use-site-row-chromium-s482.browser.test.js.
// MED-A — an outer cell's seed reading a PROGRAM cell (`let <a=(@n + 1)/>`, `<program> let <n/>`) is
//   E-SCOPE-001 (§7.6 R1 + R2: the program instance is built in the body, after every outside seed).
//   Red on c122902d6: the page died at load (`Cannot access 'decl_program' before initialization`).
//
// Every case runs on the SHIPPING path: the scrml-boot CLI (leak checks: every client file read) and
// scripts/scrml-boot.ts `compileSource` + the conformance runner's happy-dom `runBootstrapArtifact`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-outer-cell-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
// files: { "main.scrml": src, "lib.scrml": src, … } — written into a fresh directory
function writeApp(files) {
  const sub = join(dir, `app${n++}`);
  mkdirSync(sub, { recursive: true });
  for (const [name, src] of Object.entries(files)) writeFileSync(join(sub, name), src);
  return join(sub, "main.scrml");
}
async function errors(files) {
  const res = await compileSource(writeApp(files));
  return res.diagnostics.filter((d) => d.severity === "error");
}
async function texts(files, ids, input = []) {
  const res = await compileSource(writeApp(files));
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");
const SERVER_FILES = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];

// Compile through the CLI; every CLIENT file, and the server artifact's module-level binding `pat`
// (imported, so its module initialization runs the seed) read back.
async function build(files, pat) {
  const main = writeApp(files);
  const out = main.replace(/main\.scrml$/, "out");
  const p = Bun.spawnSync(["bun", CLI, "compile", main, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  const names = readdirSync(out);
  const client = names.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(out, f), "utf8") }));
  let value;
  let atModule = false;
  if (names.includes("program.server.js")) {
    const server = readFileSync(join(out, "program.server.js"), "utf8");
    const m = server.match(new RegExp("^(?:const|let) (" + pat + ") = ", "m"));
    atModule = m !== null && server.indexOf(m[0]) < server.indexOf("export function createServer");
    if (m) {
      writeFileSync(join(out, "probe.server.js"), server + `\nexport { ${m[1]} as __probe };\n`);
      value = (await import(pathToFileURL(join(out, "probe.server.js")).href)).__probe;
    }
  }
  return { client, atModule, value };
}
function leaked(client, needles) {
  const out = [];
  for (const c of client) for (const nd of needles) if (c.text.includes(nd)) out.push(c.f + ": " + nd);
  return out;
}

// `label` is server-placed (§12.2 Trigger 5: it reaches a `?{}`), so API_KEY is read only by server code.
const HDR = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
}`;
const PROG = (extra = "") => `<program db="./app.db">
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
${extra}</program>
`;
const SECRET = ["zz-sk-live-123", "API_KEY", "keyCell"];

describe("HIGH-1 — an unread outer cell whose seed reaches server-only code is server-only", () => {
  test("s10: before `<program>` — no client file holds it; the server runs the seed at module initialization", async () => {
    const b = await build({ "main.scrml": `${HDR}\nlet <keyCell:string=(tag(API_KEY))/>\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.atModule).toBe(true);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("s14: the locked form (a constant seed, Q13)", async () => {
    const b = await build({ "main.scrml": `${HDR}\n<keyCell:string=(tag(API_KEY))/>\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("s20: in an imported library, unread by the page", async () => {
    const lib = `\${ export const API_KEY: string = "zz-sk-live-123"; }
\${ export function tag(s: string) -> string { return "[" + s + "]"; } }
export let <keyCell:string=(tag(API_KEY))/>
`;
    const main = `\${ import { API_KEY, tag } from "./lib.scrml"; }\n${PROG()}`;
    const b = await build({ "lib.scrml": lib, "main.scrml": main }, "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("t7: imported through a re-export, and t8: imported by name but unread", async () => {
    const lib = `\${ export const API_KEY: string = "zz-sk-live-123"; }
\${ export function tag(s: string) -> string { return "[" + s + "]"; } }
export let <keyCell:string=(tag(API_KEY))/>
`;
    const mid = `\${ export { keyCell, API_KEY, tag } from "./lib.scrml"; }\n`;
    const b1 = await build({ "lib.scrml": lib, "mid.scrml": mid, "main.scrml": `\${ import { API_KEY, tag } from "./mid.scrml"; }\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(b1.client, SECRET)).toEqual([]);
    const b2 = await build({ "lib.scrml": lib, "main.scrml": `\${ import { API_KEY, tag, keyCell } from "./lib.scrml"; }\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(b2.client, SECRET)).toEqual([]);
  }, 180000);

  test("t6: the seed reaches the secret through a client function; t6c: the plain-const control (fixed with it — the largest set)", async () => {
    const G = `\${ function g() -> string { return tag(API_KEY); } }`;
    const b = await build({ "main.scrml": `${HDR}\n${G}\nlet <keyCell:string=(g())/>\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(b.client, [...SECRET, "function g("])).toEqual([]);
    expect(b.value).toBe("[zz-sk-live-123]");
    const c = await build({ "main.scrml": `${HDR}\n${G}\n\${ const keyTag: string = g(); }\n${PROG()}` }, "keyTag\\w*");
    expect(leaked(c.client, ["zz-sk-live-123", "API_KEY", "keyTag", "function g("])).toEqual([]);
    expect(c.value).toBe("[zz-sk-live-123]");
  }, 180000);

  test("t10: read only by a function nothing calls; t11: a seed that only reads the secret (no call)", async () => {
    const b = await build({ "main.scrml": `${HDR}\nlet <keyCell:string=(tag(API_KEY))/>\n\${ function dead() -> string { return @keyCell; } }\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(b.client, SECRET)).toEqual([]);
    const c = await build({ "main.scrml": `${HDR}\nlet <keyCell:string=(API_KEY)/>\n${PROG()}` }, "keyCell\\w*");
    expect(leaked(c.client, SECRET)).toEqual([]);
  }, 180000);

  test("controls: a cell the page reads ships its value; an unread cell reaching nothing server-only is still seeded in the client", async () => {
    const b = await build({ "main.scrml": `${HDR}\nlet <keyCell:string=(tag(API_KEY))/>\n${PROG(`<p id="o">\${@keyCell}</p>\n`)}` }, "keyCell\\w*");
    expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    const pub = `\${ function tag(s: string) -> string { return "[" + s + "]"; } }
let <z:string=(tag("pub"))/>
<program>
<p id="o">hi</p>
</program>
`;
    const c = await build({ "main.scrml": pub }, "z\\w*");
    expect(leaked(c.client, ['tag("pub")']).length).toBeGreaterThan(0);
  }, 180000);

  test("t3 / t5: a server-only seed that reads another cell (a chain, a cycle) is refused by name", async () => {
    for (const cells of [
      `let <a:string=(tag(API_KEY))/>\nlet <b:string=(@a + "x")/>`,
      `let <a:string=(tag(API_KEY) + @b)/>\nlet <b:string=(@a + "x")/>`,
    ]) {
      const es = await errors({ "main.scrml": `${HDR}\n${cells}\n${PROG()}` });
      expect(es.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(es.map((d) => d.message).join(" ")).toContain("g-boot-outer-cell-server-seed-reads-cell-s482");
    }
  }, 180000);
});

describe("MED-1 / MED-2 — an outer cell's seed reaching a binding placed after it is E-SCOPE-001", () => {
  const scope = async (files, name, says) => {
    const es = await errors(files);
    expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(es[0].message).toContain("`" + name + "` is used before it is initialized");
    expect(es[0].message).toContain("a cell declared outside the program body");
    expect(es[0].message).toContain(says);
  };

  test("c05c: a library cell nothing reads, reaching a later library binding (was: the whole page dead at load)", async () => {
    await scope({
      "lib.scrml": `\${ export let n: int = 1; }
\${ export function rk() -> int { return k; } }
export let <a:int=(rk() + 1)/>
\${ export const k: int = n + 10; }
`,
      "main.scrml": `\${ import { n } from "./lib.scrml"; }\n<program>\n<p id="o">\${n}</p>\n</program>\n`,
    }, "k", "is declared after `@a`");
  }, 180000);

  test("c06 / y26: the same before `<program>`, and a later library `let`", async () => {
    await scope({ "main.scrml": `\${ let n: int = 1; }
\${ function rk() -> int { return k; } }
let <a:int=(rk() + 1)/>
\${ const k: int = n + 10; }
<program>
<p id="o">\${@a}</p>
</program>
` }, "k", "calls `rk()`");
    await scope({
      "lib.scrml": `\${ export function rs() -> string { return s; } }
export let <a:string=(rs() + "!")/>
\${ export let s: string = "v"; }
`,
      "main.scrml": `\${ import { a } from "./lib.scrml"; }\n<program>\n<p id="o">\${@a}</p>\n</program>\n`,
    }, "s", "is declared after `@a`");
  }, 180000);

  test("y16 / y20: a body binding — from before `<program>` and from after `</program>` (MED-2: was k = 2, source order 10)", async () => {
    await scope({ "main.scrml": `\${ function rk() -> int { return k; } }
let <a:int=(rk() + 1)/>
<program>
\${ const k: int = 5; }
<p id="o">\${@a}</p>
</program>
` }, "k", "declared in the program body");
    await scope({ "main.scrml": `\${ let n: int = 1; }
\${ function rk() -> int { return k; } }
<program>
\${ n = 5; }
\${ const k: int = n * 2; }
<p id="o">\${@a}</p>
<p id="o2">\${k}</p>
</program>
let <a:int=(rk() + 1)/>
` }, "k", "declared in the program body");
  }, 180000);

  test("r1: a seed reading a cell declared LATER outside the body constructs it on demand — its seed reaching a binding placed between them is judged at the reader's place", async () => {
    await scope({ "main.scrml": `\${ let n: int = 1; }
let <a:int=(@b + 1)/>
\${ const k: int = n + 10; }
let <b:int=(k + 1)/>
<program>
<p id="o">\${@a},\${@b}</p>
</program>
` }, "k", "uses `@b` before its place");
  }, 180000);

  test("controls: an earlier binding (y17: the seed runs before the body's write — 2), a later outer cell read on demand (c05: 12,11)", async () => {
    expect(await texts({ "main.scrml": `\${ let n: int = 1; }
\${ function rk() -> int { return n; } }
let <a:int=(rk() + 1)/>
<program>
\${ n = 5; }
<p id="o">\${@a}</p>
</program>
` }, ["o"])).toEqual(["2"]);
    expect(await texts({
      "lib.scrml": `\${ export let n: int = 1; }
export let <a:int=(@b + 1)/>
export let <b:int=(n + 10)/>
`,
      "main.scrml": `\${ import { a, b } from "./lib.scrml"; }\n<program>\n<p id="o">\${@a},\${@b}</p>\n</program>\n`,
    }, ["o"])).toEqual(["12,11"]);
  }, 180000);
});

describe("LOW-1 — a constant use-site value is a seed computed at the mount (§66.7.6 rule 5)", () => {
  const CP = (def) => `<program>
\${ let n: int = 1; }
\${ function rn() -> int { return n; } }
let <m:int=1/>
let <show:boolean=false/>
<cp v:int=(${def})>
</> renders <p if=(@show)>\${v}</p>
<span id="o"><cp v=(rn() + 1)/></span>
<span id="o2"><cp v=(@m + 1)/></span>
<span id="o3"><cp/></span>
<button id="b" onclick={ n = 10; @m = 10; @show = true; }>b</button>
</program>
`;
  test("a13 / u3: constant use-site value 2 (the mount), a cell-reading one stays derived (11), the literal default 0", async () => {
    expect(await texts({ "main.scrml": CP("0") }, ["o", "o2", "o3"], [{ click: "#b" }])).toEqual(["2", "11", "0"]);
  }, 180000);

  test("u4: over a DERIVED default — the constant use-site value is seeded (2), the default stays derived (110)", async () => {
    expect(await texts({ "main.scrml": CP("@m + 100") }, ["o", "o3"], [{ click: "#b" }])).toEqual(["2", "110"]);
  }, 180000);

  test("u1: an instance under if= is seeded when its branch mounts (11), not at load", async () => {
    expect(await texts({ "main.scrml": `<program>
\${ let n: int = 1; }
\${ function rn() -> int { return n; } }
let <show:boolean=false/>
<cp v:int=(0)>
</> renders <p id="o">\${v}</p>
<div if=(@show)><cp v=(rn() + 1)/></div>
<button id="b" onclick={ n = 10; @show = true; }>b</button>
</program>
` }, ["o"], [{ click: "#b" }])).toEqual(["11"]);
  }, 180000);
});

describe("MED-A — an outer cell's seed reading a program cell is E-SCOPE-001 (§7.6 R1 + R2)", () => {
  const scope = async (src, says) => {
    const es = await errors({ "main.scrml": src });
    expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(es[0].message).toContain("`@n` is used before it is initialized");
    expect(es[0].message).toContain("`@n` is declared in the program body");
    expect(es[0].message).toContain(says);
  };
  test("e12 / e12c / e12e: before `<program>`, after `</program>`, and read by nothing (was: the page dead at load)", async () => {
    await scope("let <a:int=(@n + 1)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n</program>\n", "reads `@n`");
    await scope("<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n</program>\nlet <a:int=(@n + 1)/>\n", "reads `@n`");
    await scope("let <a:int=(@n + 1)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@n}</p>\n</program>\n", "reads `@n`");
  }, 180000);
  test("e12f: through a function of the body that reads the cell", async () => {
    await scope("<program>\nlet <n:int=4/>\n\${ function rn() -> int { return @n; } }\n<p id=\"o\">\${@a}</p>\n</program>\nlet <a:int=(rn() + 1)/>\n", "calls `rn()`, which uses `@n`");
  }, 180000);
  test("controls: e12b (a function reading no cell: 2 | 4), e12d (a DERIVED outer cell is computed when read: 5)", async () => {
    expect(await texts({ "main.scrml": "\${ function rn() -> int { return 1; } }\nlet <a:int=(rn() + 1)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n<p id=\"o2\">\${@n}</p>\n</program>\n" }, ["o", "o2"])).toEqual(["2", "4"]);
    expect(await texts({ "main.scrml": "<a:int=(@n + 1)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n<button id=\"b\" onclick={ @n = 9; }>b</button>\n</program>\n" }, ["o"], [{ click: "#b" }])).toEqual(["10"]);
  }, 180000);
});

describe("HIGH-A — a use-site value reading a row item or an arm payload is derived (Q13)", () => {
  const LEAF = "<leaf k:int=0>\n</> renders <b>L\${k}</b>\n";
  test("w11: the row's components follow the row (D7L7L70; r1 D7L1L10) — printed derived, not `rt.givenSeed`", async () => {
    const src = LEAF + "<program>\n<items:int[replace, write]=([1, 2])/>\n<p id=\"o\"><each in=@items as it><i>D\${it}</i><leaf k=it/><leaf k=(it * 10)/></each></p>\n<button id=\"b\" onclick={ @items[0] = 7; }>b</button>\n</program>\n";
    expect(await texts({ "main.scrml": src }, ["o"], [{ click: "#b" }])).toEqual(["D7L7L70D2L2L20"]);
    const res = await compileSource(writeApp({ "main.scrml": src }));
    expect(res.client.js).not.toContain("givenSeed(() => it");
  }, 180000);
  test("w08: a `<match>` arm payload (D9L9; r1 D9L1)", async () => {
    const src = LEAF + "<program>\ntype Ph:enum = { A(v: int), B }\nlet <ph:Ph=(Ph.A(1))/>\n<p id=\"o\"><match on=@ph>\n  <A(v)><i>D\${v}</i><leaf k=v/></>\n  <B><span>b</span></>\n</match></p>\n<button id=\"b\" onclick={ @ph = Ph.A(9); }>b</button>\n</program>\n";
    expect(await texts({ "main.scrml": src }, ["o"], [{ click: "#b" }])).toEqual(["D9L9"]);
  }, 180000);
  test("w20: a use-site value in a row reading no row item stays a constant seed (`rt.givenSeed`): 2 2 after `n = 10`", async () => {
    const src = LEAF + "<program>\n\${ let n: int = 1; }\n\${ function rn() -> int { return n; } }\n<items:int[replace, write]=([1, 2])/>\n<p id=\"o\"><each in=@items as it><leaf k=(rn() + 1)/></each></p>\n<button id=\"b\" onclick={ n = 10; @items[0] = 7; }>b</button>\n</program>\n";
    expect(await texts({ "main.scrml": src }, ["o"], [{ click: "#b" }])).toEqual(["L2L2"]);
    const res = await compileSource(writeApp({ "main.scrml": src }));
    expect(res.client.js).toContain("givenSeed(() => rn() + 1)");
  }, 180000);
});

// r3 (#2105 r2 review):
// MED-B — an outer seed reading an outer DERIVED cell runs its formula at the seed's place: a formula
//   reaching a program cell is E-SCOPE-001 there (directly, after `</program>`, read by nothing, through
//   a function). Red on 6049c6944: the page died at load (`Cannot access 'decl_program' before
//   initialization`); main rendered 10 / 5 / 4 / 10.
// LOW-1 — a lambda's own parameters (names bound inside the expression) read no cell (Q13): v14 is a
//   constant seed again (V3; 6049c6944 V12), v13 compiles (6049c6944 refused it).
describe("MED-B — an outer seed reaching a program cell through an outer DERIVED cell is E-SCOPE-001", () => {
  const scope = async (src, says) => {
    const es = await errors({ "main.scrml": src });
    expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(es[0].message).toContain("`@n` is declared in the program body");
    expect(es[0].message).toContain(says);
  };
  const D = "<d:int=(@n + 1)/>\n";
  test("m01 / m06 / m09: before `<program>`, after `</program>`, and read by nothing", async () => {
    const says = "reads `@d`, a derived value computed when it is read, and its formula reads `@n`";
    await scope(D + "let <a:int=(@d * 2)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n</program>\n", says);
    await scope("<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n</program>\n" + D + "let <a:int=(@d * 2)/>\n", says);
    await scope(D + "let <a:int=(@d * 2)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@n}</p>\n</program>\n", says);
  }, 180000);
  test("m10: through a function that reads the derived cell", async () => {
    await scope("\${ function rd() -> int { return @d; } }\n" + D + "let <a:int=(rd() * 2)/>\n<program>\nlet <n:int=4/>\n<p id=\"o\">\${@a}</p>\n</program>\n", "calls `rd()`, which reads `@d`");
  }, 180000);
});

describe("LOW-1 — a lambda's own parameters are not cell reads (Q13)", () => {
  test("v14: a locked field whose initializer maps a lambda over a const tape is a constant seed (V3, not V12)", async () => {
    const src = "<program>\n\${ let n: int = 1; }\n\${ function rn() -> int { return n; } }\n\${ const xs: int[] = [1, 2]; }\nlet <show:boolean=false/>\n<cz t:string=\"x\">\n<v:int=(xs.map(x => x + rn()).length + rn())/>\n</> renders <p if=(@show)>V\${v}</p>\n<p id=\"o\"><cz/></p>\n<button id=\"b\" onclick={ n = 10; @show = true; }>b</button>\n</program>\n";
    expect(await texts({ "main.scrml": src }, ["o"], [{ click: "#b" }])).toEqual(["V3"]);
  }, 180000);
  test("v13: an unread server-only outer cell whose seed maps a lambda compiles, and no client file holds the secret", async () => {
    const r = await build({ "main.scrml": HDR.replace("function tag", "const XS: int[] = [1, 2];\n    function tag") + "\nlet <keyN:int=(API_KEY.length + XS.map(x => x + 1).length)/>\n" + PROG() }, "keyN");
    expect(leaked(r.client, ["zz-sk-live-123"])).toEqual([]);
  }, 180000);
});
