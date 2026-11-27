// component-attr-server-only-s483.test.js — lane s483-component-attr-server-only (SECURITY). A component
// ATTRIBUTE nothing on the client reads, whose default or use-site value reaches a server-only binding, shipped
// that binding to the client: the default was printed in `mk_<decl>` and each use site's value in the user's
// markup, whether or not anything read the attribute. Red on b5f071c46 (#2125 merged): program.client.js held
// `const API_KEY = "zz-sk-live-123"` for probes c16 (`<card t:string=(API_KEY)>`) and c17 (`<card t=(API_KEY)/>`)
// — gap g-boot-component-attr-server-only-s483.
//
// Ruled S483 (ruling:user-voice-scrml.md-S483-component-attr-server-only): "Same rule as cells" — *"an attribute
// no client code reads gets an empty client stand-in; its default never runs and its use-site value is never
// evaluated in the client … An attribute the client reads stays as today."* Built: print.scrml bodyCands takes
// every field of a component declaration — an attribute or a body cell, given a value at a use site or not —
// into the same §7.6 rule (b) fixed point as program-body and component-body cells. The classification is the
// DECLARATION field's: the binding it judges joins the field's default and every use site's value (fieldVals /
// joinVals), a read through any instance keeps it client for all, and one it makes server-only is a shell in
// every instance with every use site's value dropped (dropGivenDecl): no artifact evaluates any of them.
//
// Folded follow-ups from the #2125 review: MED-1 (ii) — a cell a use site gives a value is judged too (i05: the
// other instance ran the secret seed); MED-1 (i) — a `<*x/>` reads only what x's renders read (d31, d22: no cell
// of a `single` declaration could become a shell); MED-1 (iii) — a handle used as a value still reads every
// component field: ⚑ INTERIM, gap g-boot-component-handle-value-reads-all-s483 (pinned below).
//
// Shipping path: the scrml-boot CLI (every client file read; the server artifact imported) and
// scripts/bootstrap-conformance.ts `runBootstrapArtifact` (happy-dom). Chromium:
// compiler/tests/browser/component-attr-server-only-chromium-s483.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-component-attr-")); });
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

// Compile through the CLI; every CLIENT file read back; the server artifact imported (a load failure fails the test).
async function build(src) {
  const main = writeApp(src);
  const out = main.replace(/main\.scrml$/, "out");
  const p = Bun.spawnSync(["bun", CLI, "compile", main, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return { ok: false, err: p.stderr.toString() + p.stdout.toString() };
  const names = readdirSync(out);
  const client = names.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(out, f), "utf8") }));
  let server = "";
  if (names.includes("program.server.js")) {
    server = readFileSync(join(out, "program.server.js"), "utf8");
    await import(pathToFileURL(join(out, "program.server.js")).href);
  }
  return { ok: true, client, server, js: client.find((c) => c.f === "program.client.js")?.text ?? "" };
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
const T = (renders) => `<card t:string="x"/> renders ${renders}`;
const KCELL = `let <k:string=(tag(API_KEY))/>`;
const CARD = (body, renders) => `<card t:string="x">\n  ${body}\n</> renders ${renders}`;

describe("an attribute nothing on the client reads, whose default or use-site value reaches server-only code, is an empty stand-in", () => {
  test("c16 (a default) / c17 (a use-site value): no secret in the client; the use site passes nothing; no artifact runs either value", async () => {
    const c16 = PROG(`<card t:string=(API_KEY)>\n  let <k:string=(tag(t))/>\n</> renders <b id="k">x</b>\n<card/>`);
    const c17 = PROG(`<card t:string="x">\n  let <k:string=(tag(t))/>\n</> renders <b id="k">x</b>\n<card t=(API_KEY)/>`);
    for (const s of [c16, c17]) {
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
      // the shell: the default is `not`, and no use site gives a value (no rt.givenSeed, no thunk argument)
      expect(b.js).toContain("t */] = rt.derived(inst$.scope, t$ ?? (() => null))");
      expect(b.js).toContain("k */] = rt.seeded(() => null)");
      expect(b.js).not.toContain("givenSeed");
      expect(b.js).toMatch(/mk_card_\w+\(rt\.instance\(decl_card_\w+, inst\$\.scope\)\)/);
      // nothing runs either value: the server artifact holds no binding for the field (it loads — build imported it)
      expect(b.server).not.toMatch(/^(?:const|let) [tk]\w* = /m);
      expect(await texts(s, ["k", "c"])).toEqual(["x", "[]"]);
    }
  }, 300000);

  test("a derived cell reading it, unread; passed down to a child that does not read it (2 and 3 deep); from a server-only program or component cell; an unused `as=` handle; `<*x/>`; a `single` declaration", async () => {
    for (const extra of [
      `<card t:string="x">\n  <j:string=(t + "!")/>\n</> renders <b>x</b>\n<card t=(API_KEY)/>`,
      `<inner u:string="u"/> renders <i>u</i>\n` + T(`<b><inner u=(t)/></b>`) + `\n<card t=(API_KEY)/>`,
      `<inner u:string="u"/> renders <i>u</i>\n<mid v:string="v"/> renders <em><inner u=(v)/></em>\n` + T(`<b><mid v=(t)/></b>`) + `\n<card t=(API_KEY)/>`,
      `let <pk:string=(tag(API_KEY))/>\n` + T(`<b>x</b>`) + `\n<card t=(@pk)/>`,
      T(`<b>x</b>`) + `\n<outer w:string="w">\n  let <pk:string=(tag(API_KEY))/>\n</> renders <em><card t=(pk)/></em>\n<outer/>`,
      T(`<b>x</b>`) + `\n<card as=h t=(API_KEY)/>\n<p id="t">p</p>`,
      `<card t:string=(API_KEY)/> renders <b>x</b>\n<card/>\n<*card/>`,
      `<card t:string=(API_KEY) single/> renders <b>x</b>\n<*card/>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
    }
  }, 900000);

  test("`<each>` instances, two use sites, through a function (default and use site), a required attribute, and a sibling attribute the page reads", async () => {
    for (const extra of [
      T(`<b>x</b>`) + `\n<each in=(["a", "b"]) as=i><card t=(i == "a" ? API_KEY : "n")/><p>\${i}</p></each>`,
      T(`<b>x</b>`) + `\n<card t=(API_KEY)/>\n<card t="safe"/>`,
      `<card t:string=(mk())/> renders <b>x</b>\n<card/>`,
      T(`<b>x</b>`) + `\n<card t=(mk())/>`,
      `<card t:string/> renders <b>x</b>\n<card t=(API_KEY)/>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
    }
    const two = PROG(`<card t:string="x" u:string="y"/> renders <b id="u">\${u}</b>\n<card t=(API_KEY) u="shown"/>`);
    const b2 = await build(two);
    expect(leaked(b2.client, SECRET)).toEqual([]);
    expect(await texts(two, ["u"])).toEqual(["shown"]);
  }, 900000);
});

describe("an attribute the client reads stays as today (any instance's read keeps it client for every instance)", () => {
  test("own markup (default, use site), a handler, a displayed derived cell, `if=`, `class=`, a displayed cell seeded from it, a child that reads it, a handle, the shared instance, a late function, `<*x/>`, `bind:` on a cell seeded from it, an `<each>` row, a second use site, a slot", async () => {
    for (const extra of [
      `<card t:string=(API_KEY)/> renders <b id="t">\${tag(t)}</b>\n<card/>`,
      T(`<b id="t">\${tag(t)}</b>`) + `\n<card t=(API_KEY)/>`,
      T(`<button id="b" onclick={ @out = t; }>b</button>`) + `\n<card t=(API_KEY)/>`,
      `<card t:string="x">\n  <j:string=(t + "!")/>\n</> renders <b id="j">\${j}</b>\n<card t=(API_KEY)/>`,
      T(`<b id="t" if=(t == "q")>x</b><i>y</i>`) + `\n<card t=(API_KEY)/>`,
      T(`<b id="t" class=(t == "q" ? "a" : "b")>x</b>`) + `\n<card t=(API_KEY)/>`,
      CARD(`let <k:string=(tag(t))/>`, `<b id="k">\${k}</b>`) + `\n<card t=(API_KEY)/>`,
      `<inner u:string="u"/> renders <i id="u">\${u}</i>\n` + T(`<b><inner u=(t)/></b>`) + `\n<card t=(API_KEY)/>`,
      T(`<b>x</b>`) + `\n<card as=h t=(API_KEY)/>\n<p id="t">\${@h.t}</p>`,
      `<card t:string=(API_KEY)/> renders <b>x</b>\n<card/>\n<p id="t">\${@card.t}</p>`,
      T(`<b>x</b>`) + `\n<card as=h t=(API_KEY)/>\n\${ function late() -> string { return @h.t; } }\n<button id="b" onclick={ @out = late(); }>b</button>`,
      `<card t:string=(API_KEY)/> renders <b id="t">\${t}</b>\n<*card/>`,
      CARD(`let <v:string=(t)/>`, `<input id="i" bind:value=@card.v/>`) + `\n<card t=(API_KEY)/>`,
      T(`<b>x</b>`) + `\n<each in=(["a", "b"]) as=i><card as=h t=(i == "a" ? API_KEY : "n")/><p if=(i == "b")>\${@h.t}</p></each>`,
      T(`<b>x</b>`) + `\n<card t=(API_KEY)/>\n<card as=h t="safe"/>\n<p id="t">\${@h.t}</p>`,
      `<card t:string=(API_KEY)/> renders <div><slot/></div>\n<card><p id="t">\${@card.t}</p></card>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    }
    expect(await texts(PROG(T(`<b id="t">\${tag(t)}</b>`) + `\n<card t=(API_KEY)/>`), ["t"])).toEqual(["[zz-sk-live-123]"]);
    expect(await texts(PROG(T(`<b>x</b>`) + `\n<card t=(API_KEY)/>\n<card as=h t="safe"/>\n<p id="t">\${@h.t}</p>`), ["t"])).toEqual(["safe"]);
    expect(await texts(PROG(CARD(`let <k:string=(tag(t))/>`, `<b class="k">\${k}</b>`) + `\n<card t=(API_KEY)/>\n<card t="y"/>`), ["c"])).toEqual(["[]"]);
  }, 1200000);

  test("an attribute that reaches nothing server-only keeps its values", async () => {
    const s = PROG(T(`<b id="t">\${t}</b>`) + `\n<card t="plain"/>`);
    const b = await build(s);
    expect(b.js).toContain('"plain"');
    expect(await texts(s, ["t"])).toEqual(["plain"]);
    const u = PROG(T(`<b>x</b>`) + `\n<card t=(@out)/>`);
    expect((await build(u)).js).toContain("inst$.scope), () => inst$.fields[0 /* out */].get())");
  }, 300000);
});

describe("#2125 review MED-1 (ii) — a cell a use site gives a value is judged too (i05)", () => {
  test("i05: `<card k=\"given\"/><card/>`, k never read — neither instance runs the secret seed; a given secret is dropped", async () => {
    for (const extra of [
      CARD(KCELL, `<b>x</b>`) + `\n<card k="given"/>\n<card/>`,
      CARD(`let <k:string="d"/>`, `<b>x</b>`) + `\n<card k=(API_KEY)/>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
      expect(b.js).not.toContain('"given"');
    }
  }, 300000);

  test("read by its own markup, or through another instance's handle — every instance keeps its value", async () => {
    const own = PROG(CARD(KCELL, `<b class="k">\${k}</b>`) + `\n<card k="given"/>\n<card/>`);
    expect(leaked((await build(own)).client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    const h = PROG(CARD(KCELL, `<b>x</b>`) + `\n<card k="given"/>\n<card as=h/>\n<p id="k">\${@h.k}</p>`);
    expect(leaked((await build(h)).client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    expect(await texts(h, ["k"])).toEqual(["[zz-sk-live-123]"]);
    const g = PROG(CARD(KCELL, `<b>x</b>`) + `\n<card as=h k="given"/>\n<p id="k">\${@h.k}</p>`);
    expect(await texts(g, ["k"])).toEqual(["given"]);
  }, 300000);
});

describe("#2125 review MED-1 (i) — a `<*x/>` reads only what x's renders read (d31, d22)", () => {
  test("d31 `<card/>` + `<*card/>`, k unread; d22 a `single` declaration shown only by `<*card/>` — shells", async () => {
    for (const extra of [
      CARD(KCELL, `<b>x</b>`) + `\n<card/>\n<*card/>`,
      `<card t:string="x" single>\n  ${KCELL}\n</> renders <b>x</b>\n<*card/>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, SECRET)).toEqual([]);
    }
  }, 300000);

  test("a `<*x/>` whose renders read the cell, a `single` one, and a slot reading the shared instance — client-read", async () => {
    for (const extra of [
      CARD(KCELL, `<b id="k">\${k}</b>`) + `\n<*card/>`,
      `<card t:string="x" single>\n  ${KCELL}\n</> renders <b id="k">\${k}</b>\n<*card/>`,
      CARD(KCELL, `<div><slot/></div>`) + `\n<*card/>\n<p id="k">\${@card.k}</p>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    }
    expect(await texts(PROG(`<card t:string="x" single>\n  ${KCELL}\n</> renders <b id="k">\${k}</b>\n<*card/>`), ["k"])).toEqual(["[zz-sk-live-123]"]);
  }, 300000);
});

describe("#2125 review MED-1 (iii) — a handle used as a value reads every component field (⚑ INTERIM, g-boot-component-handle-value-reads-all-s483)", () => {
  test("e09 `const g = @h;` with nothing reading `g.t` / `g.k` still ships the secret (fail closed, pinned)", async () => {
    for (const extra of [
      `<card t:string=(API_KEY)/> renders <b>x</b>\n<card as=h/>\n\${ function f() -> string { const g = @h; return "y"; } }\n<p id="f">\${f()}</p>`,
      CARD(KCELL, `<b>x</b>`) + `\n<card as=h/>\n\${ function f() -> string { const g = @h; return "y"; } }\n<p id="f">\${f()}</p>`,
    ]) {
      const b = await build(PROG(extra));
      expect(b.ok).toBe(true);
      expect(leaked(b.client, ["zz-sk-live-123"]).length).toBeGreaterThan(0);
    }
  }, 300000);
});
