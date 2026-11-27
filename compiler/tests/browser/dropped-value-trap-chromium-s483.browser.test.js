/**
 * s483-attr-trap — a dropped value that reaches nothing server-only still runs for its trap
 * (ruling:user-voice-scrml.md-S483-dropped-attr-trap, "Run secret-free ones": *"a dropped value that reaches
 * nothing server-only is still evaluated for its trap and the result discarded; a dropped value that reaches a
 * secret cannot run in the client, so its trap loss is documented in SPEC with a gap"*). This file pins, in a
 * REAL browser (Playwright Chromium), that a page whose unread component field has one value reaching a secret
 * and another that indexes out of range stops with E-INDEX-OUT-OF-RANGE-RT at mount, as it did before #2130
 * (r12g / r12i / r12j), with the secret in no client file; that a kept default runs only for an instance that
 * gives no value; and that a value reaching the secret loses its trap (gap g-boot-dropped-value-trap-s483).
 * Leak checks, server artifact and happy-dom: compiler/self-host-v2/slice-m4/dropped-value-trap-s483.test.js.
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
  dir = mkdtempSync(join(tmpdir(), "s483-dropped-trap-chromium-"));
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

// serve `out` over http, load it, read the text of each `#id`; the page errors, each cut to its trap code
async function load(out, ids) {
  const srv = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push((/^(E-[A-Z0-9-]+-RT)/.exec(e.message) ?? [e.message])[0]));
  try {
    await page.goto(`http://localhost:${srv.port}/`);
    await page.waitForTimeout(300);
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

// `label` is server-placed (it reaches a `?{}`), so API_KEY is otherwise read only by server code
const PROG = (extra) => `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    function mk() -> string { return API_KEY + "?"; }
}
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
\${ const XS: string[] = ["a"]; }
${extra}
<p id="h">alive</p>
</program>
`;

describe("a dropped value that reaches nothing server-only still traps (Chromium)", () => {
  test("r12g a use-site value beside a secret use site, r12j beside a secret default, r12i a use-site-given cell beside a secret seed, k01 a kept default: the mount stops at the trap; no secret in the client", async () => {
    if (skip()) return;
    for (const extra of [
      `<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>\n<card t=(API_KEY)/>`,
      `<card t:string=(mk())/> renders <b>x</b>\n<card t=("p" + XS[5])/>`,
      `<card t:string="x">\n  let <k:string=(API_KEY)/>\n</> renders <b>x</b>\n<card k=("p" + XS[5])/>`,
      `<card t:string=("p" + XS[5])/> renders <b>x</b>\n<card t=(API_KEY)/>\n<card/>`,
    ]) {
      const out = build(PROG(extra));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["h"])).toEqual({ errors: ["E-INDEX-OUT-OF-RANGE-RT"], texts: ["<none>"] });
    }
  }, 240000);

  test("k02 a kept default no instance runs; r12c / r12d / r12h a value that reaches the secret (its trap is lost, g-boot-dropped-value-trap-s483): the page mounts", async () => {
    if (skip()) return;
    for (const extra of [
      `<card t:string=("p" + XS[5])/> renders <b>x</b>\n<card t=(API_KEY)/>`,
      `<card t:string="x"/> renders <b>x</b>\n<card t=(API_KEY + XS[5])/>`,
      `<card t:string=(API_KEY + XS[5])/> renders <b>x</b>\n<card/>`,
      `<card t:string="x">\n  let <k:string=(API_KEY + XS[5])/>\n</> renders <b>x</b>\n<card/>`,
    ]) {
      const out = build(PROG(extra));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["h", "c"])).toEqual({ errors: [], texts: ["alive", "[]"] });
    }
  }, 240000);
});

// s483 r1 (#2134 review HIGH-1 / LOW-1). `S` is read only by `const X = mk() + S` (a binding the server artifact
// runs), so only server code reads it (S472). A value reaching `S` is judged itself against the drop-all
// classification and dropped, however the field is read (n11 a sibling default reads t; n12 the same value also
// traps — its trap is the ruled loss); a value that would be a derived thunk (n33: it reads a cell) is not kept.
const HELD = (extra) => PROG(extra)
  .replace("    function mk()", `    const S: string = "zz-held-S";\n    function mk()`)
  .replace("\n}\n<program", `\n    const X: string = mk() + S;\n}\n<program`);

describe("#2134 r1 — a value reaching a binding only server code reads stays out of the client (Chromium)", () => {
  test("n11 / n12 / n33: no `zz-` string in any client file; the page mounts", async () => {
    if (skip()) return;
    for (const extra of [
      `<card t:string="x" w:string=(t + mk())/> renders <b>x</b>\n<card t=(tag(S))/>\n<card t=(API_KEY)/>`,
      `<card t:string="x" w:string=(t + mk())/> renders <b>x</b>\n<card t=(S + XS[5])/>\n<card t=(API_KEY)/>`,
      `let <cc:string=("c")/>\n<card t:string="x"/> renders <b>x</b>\n<card t=(@cc + XS[5])/>\n<card t=(API_KEY)/>`,
    ]) {
      const out = build(HELD(extra));
      expect(clientHolds(out, "zz-")).toEqual([]);
      expect(await load(out, ["h", "c"])).toEqual({ errors: [], texts: ["alive", "[]"] });
    }
  }, 240000);
});
