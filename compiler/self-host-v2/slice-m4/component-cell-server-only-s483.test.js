// component-cell-server-only-s483.test.js — lane s483-component-cell-server-only (SECURITY). A cell declared
// in a COMPONENT's body is a field of every instance; its seed was printed in the client's `mk_<decl>` whether
// or not any code read the field — and with it the server-only binding the seed reached. Red on c58d24b7c:
// program.client.js held `const API_KEY = "zz-sk-live-123"` for an unread component cell (probe b04) — gap
// g-boot-component-cell-server-only-s483.
//
// Ruled S483 (ruling:user-voice-scrml.md-S483-component-cell-server-only): RULED (a) — *"an unread component
// cell whose seed reaches server-only code becomes an empty client stand-in and nothing runs its seed"*. Built:
// print.scrml outerPlaced judges each component-body cell (bodyCands: FieldRole.Child, no use site gives it) in
// the same serverInits fixed point as program-body cells (bodyCellsOf / bodyUseOf now name every
// declaration's fields). The classification is the DECLARATION's: a read through any instance keeps the field
// client for all instances; otherwise every instance holds the shell (`rt.seeded(() => null)`) and no artifact
// runs the seed (bodyAsConsts gives it no binding in the printed program — the server holds no instance).
//
// Also (#2121 review MED-1, prov=pa-ruled:S483-reset-is-write): a reset — `reset(@c)`, a `reset-on=` rule — is a
// whole-value WRITE of the cell, not a read. lower.scrml makes a program cell's reset InitOf (as a user
// declaration's was); print.scrml prints it where it stands, the same JS as before, or `null` for a shell.
//
// Shipping path: the scrml-boot CLI (every client file read; the server artifact imported) and
// scripts/bootstrap-conformance.ts `runBootstrapArtifact` (happy-dom). Chromium:
// compiler/tests/browser/component-cell-server-only-chromium-s483.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-component-cell-")); });
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

// Compile through the CLI; every CLIENT file read back; the server artifact imported (a load failure fails
// the test) and the value of its module-level binding matching `pat`, if given.
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
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${tag(@out)}</p>
${extra}
</program>
`;
const CARD = (body, renders) => `<card t:string="x">\n  ${body}\n</> renders ${renders}`;
const KCELL = `let <k:string=(tag(API_KEY))/>`;

describe("a component cell nothing on the client reads, whose seed reaches server-only code, is an empty stand-in", () => {
  test("b04: one instance — the field is a shell in the client; no artifact runs the seed", async () => {
    const b = await build(PROG(CARD(KCELL, `<b id="k">x</b>`) + "\n<card/>"));
    expect(b.ok).toBe(true);
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(b.js).toContain("k */] = rt.seeded(() => null)");
    // nothing runs the seed: the server artifact holds no binding for it (it loads — build imported it)
    expect(b.server).not.toMatch(/^(?:const|let) k\w* = /m);
    expect(await texts(PROG(CARD(KCELL, `<b id="k">x</b>`) + "\n<card/>"), ["k", "c"])).toEqual(["x", "[]"]);
  }, 180000);

  test("instanced 0, 3 times, in an `<each>` row; nested (the inner and the outer declaration's cell)", async () => {
    for (const extra of [
      CARD(KCELL, `<b>x</b>`),
      CARD(KCELL, `<b>x</b>`) + "\n<card/><card/><card/>",
      CARD(KCELL, `<b>x</b>`) + "\n<each in=([1, 2]) as=i><card/></each>",
      `<inner u:string="u">\n  ${KCELL}\n</> renders <i>u</i>\n<card t:string="x"/> renders <b>x<inner/></b>\n<card/>`,
      `<inner u:string="u"/> renders <i>u</i>\n` + CARD(KCELL, `<b>x<inner/></b>`) + "\n<card/>",
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
    }
  }, 600000);

  test("through a function, a locked (constant) cell, a seed also reading a prop, a derived cell reading it, a slot that does not read it, an unused `as=` handle", async () => {
    for (const extra of [
      CARD(`let <k:string=(mk())/>`, `<b>x</b>`) + "\n<card/>",
      CARD(`<k:string=(tag(API_KEY))/>`, `<b>x</b>`) + "\n<card/>",
      CARD(`let <k:string=(tag(API_KEY) + t)/>`, `<b>x</b>`) + `\n<card t="y"/>`,
      CARD(`${KCELL}\n  <j:string=(k + "!")/>`, `<b>x</b>`) + "\n<card/>",
      CARD(KCELL, `<div><slot/></div>`) + `\n<card><p id="s">s</p></card>`,
      CARD(KCELL, `<b>x</b>`) + `\n<card as=h/>\n<p id="h">h</p>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
    }
  }, 600000);

  test("written by the component's handler, never read — the client writes the shell; the handler still runs", async () => {
    const s = PROG(`let <cnt:int=0/>\n<p id="n">\${@cnt}</p>\n` + CARD(KCELL, `<button id="b" onclick={ @card.k = "w"; @cnt = @cnt + 1; }>b</button>`) + "\n<card/>");
    const b = await build(s);
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(await texts(s, ["n"], [{ click: "#b" }, { click: "#b" }])).toEqual(["2"]);
  }, 180000);

  test("reset by the component's handler, never read — a reset is a write (prov=pa-ruled:S483-reset-is-write)", async () => {
    const s = PROG(`let <cnt:int=0/>\n<p id="n">\${@cnt}</p>\n` + CARD(KCELL, `<button id="b" onclick={ reset(@card.k); @cnt = @cnt + 1; }>b</button>`) + "\n<card/>");
    const b = await build(s);
    expect(leaked(b.client, SECRET)).toEqual([]);
    expect(await texts(s, ["n"], [{ click: "#b" }])).toEqual(["1"]);
  }, 180000);
});

describe("a READ through any instance keeps the component cell client-read (unchanged)", () => {
  test("own markup, own handler, own attribute, a slot through a handle, a handle read in the program, the shared instance, a `<*x/>`, a displayed derived cell, a compound write", async () => {
    for (const extra of [
      CARD(KCELL, `<b id="k">\${k}</b>`) + "\n<card/>",
      CARD(KCELL, `<button id="b" onclick={ @out = k; }>b</button>`) + "\n<card/>",
      CARD(KCELL, `<b id="k" title=(k)>x</b>`) + "\n<card/>",
      CARD(KCELL, `<div><slot/></div>`) + `\n<card as=h><p id="s">\${@h.k}</p></card>`,
      CARD(KCELL, `<b>x</b>`) + `\n<card as=h/>\n<button id="b" onclick={ @out = @h.k; }>b</button>`,
      CARD(KCELL, `<b>x</b>`) + `\n<p id="sh">\${@card.k}</p>`,
      CARD(KCELL, `<b id="k">\${k}</b>`) + `\n<card as=h/>`,
      CARD(`${KCELL}\n  <j:string=(k + "!")/>`, `<b id="j">\${j}</b>`) + "\n<card/>",
      CARD(KCELL, `<button id="b" onclick={ @card.k = @card.k + "w"; }>b</button>`) + "\n<card/>",
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    }
    expect(await texts(PROG(CARD(KCELL, `<b id="k">\${k}</b>`) + "\n<card/><card/>"), ["k"])).toEqual(["[zz-sk-live-123]"]);
  }, 900000);

  test("a component cell that reaches nothing server-only keeps its seed", async () => {
    const s = PROG(CARD(`let <k:string=(tag("plain"))/>`, `<b id="k">\${k}</b>`) + "\n<card/>");
    const b = await build(s);
    expect(b.js).toContain('tag("plain")');
    expect(await texts(s, ["k"])).toEqual(["[plain]"]);
  }, 180000);
});

describe("not covered here — a component ATTRIBUTE (a prop) is not a body cell (gap g-boot-component-attr-server-only-s483)", () => {
  test("a prop default or a use-site value reaching the secret still ships it (pinned, open)", async () => {
    for (const extra of [
      `<card t:string=(API_KEY)>\n  let <k:string=(tag(t))/>\n</> renders <b>x</b>\n<card/>`,
      CARD(`let <k:string=(tag(t))/>`, `<b>x</b>`) + `\n<card t=(API_KEY)/>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    }
  }, 300000);
});

describe("the 'only server code reads it' sub-case is refused upstream (no accepted program reaches it)", () => {
  // c30: an unread program cell seeded from `mk() + @card.k` compiled on c58d24b7c and shipped the secret (k's
  // seed in the client made API_KEY client-read); with k judged, the cell's seed reaches server-only code and
  // reads a cell, so it is the S483 INTERIM refusal (g-boot-outer-cell-server-seed-reads-cell-s482) — newly
  // rejecting, as b11 / b12 were in #2121.
  test("a server function reading `@card.k` is E-REACTIVE-003; an unread body cell seeded from it is the INTERIM refusal", async () => {
    const a = await build(PROG(`\${ server function sr() -> string { return @card.k; } }\n` + CARD(KCELL, `<b>x</b>`) + `\n<card/>\n<button id="b" onclick={ @out = sr() !{ .Transport(t2) :> return }; }>b</button>`));
    expect(a.ok).toBe(false);
    expect(a.err).toContain("E-REACTIVE-003");
    const z = await build(PROG(CARD(KCELL, `<b>x</b>`) + `\nlet <z:string=(mk() + @card.k)/>\n<card/>`));
    expect(z.ok).toBe(false);
    expect(z.err).toContain("E-BOOTSTRAP-UNSUPPORTED");
  }, 300000);
});

describe("#2121 review MED-1 — a reset of a program cell is a whole-value write, not a read", () => {
  const KC = `let <kc:string=(tag(API_KEY))/>`;
  test("x59 reset(@kc) only, x56 reset-on= with kc unread, x58 reset-on= + a write: no secret in the client; the server runs the seed", async () => {
    for (const extra of [
      `${KC}\n<button id="b" onclick={ reset(@kc); }>b</button>`,
      `let <t:int=0/>\nlet <kc:string=(tag(API_KEY)) reset-on=[@t]/>\n<button id="b" onclick={ @t = @t + 1; }>b</button>`,
      `let <t:int=0/>\nlet <kc:string=(tag(API_KEY)) reset-on=[@t]/>\n<button id="b" onclick={ @t = @t + 1; @kc = "w"; }>b</button>`,
    ]) {
      const b = await build(PROG(extra), "kc\\w*");
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
      expect(b.value).toBe("[zz-sk-live-123]");
    }
  }, 600000);

  test("a reset of a client-read cell still restores its seed — in a handler, in a function, by reset-on=", async () => {
    const h = PROG(`let <kc:string=(tag("p"))/>\n<p id="d">\${@kc}</p>\n<button id="b" onclick={ @kc = "w"; }>b</button>\n<button id="r" onclick={ reset(@kc); }>r</button>`);
    expect(await texts(h, ["d"], [{ click: "#b" }])).toEqual(["w"]);
    expect(await texts(h, ["d"], [{ click: "#b" }, { click: "#r" }])).toEqual(["[p]"]);
    const f = PROG(`\${ function again() { reset(@kc); } }\nlet <kc:string=(tag("p"))/>\n<p id="d">\${@kc}</p>\n<button id="b" onclick={ @kc = "w"; }>b</button>\n<button id="r" onclick={ again(); }>r</button>`);
    expect(await texts(f, ["d"], [{ click: "#b" }, { click: "#r" }])).toEqual(["[p]"]);
    const o = PROG(`let <t:int=0/>\nlet <kc:string=(tag("p")) reset-on=[@t]/>\n<p id="d">\${@kc}</p>\n<button id="b" onclick={ @kc = "w"; }>b</button>\n<button id="r" onclick={ @t = @t + 1; }>r</button>`);
    expect(await texts(o, ["d"], [{ click: "#b" }, { click: "#r" }])).toEqual(["[p]"]);
  }, 600000);
});
