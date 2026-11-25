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
async function texts(files, ids) {
  const res = await compileSource(writeApp(files));
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
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
