// render-cycle-s483.test.js — lane s483-self-render: a render that holds itself (§66.6.2 S483).
//
// Rulings: ruling:user-voice-scrml.md-S483-star-self-render-error (item 1 — a `<*f/>` inside the
// markup it renders is E-DECL-RENDER-CYCLE-STAR, every cycle, guarded too: "Guards do not make it
// legal") and ruling:user-voice-scrml.md-S483-component-self-mount-error (item 2 — a use of a
// declaration inside its own render, unconditional on every path, is E-DECL-RENDER-CYCLE-USE at the
// use; "Guarded recursion (under `if=` / `<match>`, a new instance each level) stays legal").
//
// Red on base d58e768e8: every item-1 refusal was E-BOOTSTRAP-UNSUPPORTED (INTERIM); every item-2
// refusal compiled and its page overflowed the stack at load (Chromium: "Maximum call stack size
// exceeded"). The legal shapes rendered the same finite trees on base and head. Every case runs on the
// SHIPPING path (scripts/scrml-boot.ts compileSource; values through the conformance runner's
// runBootstrapArtifact, happy-dom).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-render-cycle-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return { res: await compileSource(file), name: `app${n - 1}.scrml` };
}
async function errors(src) {
  const { res, name } = await result(src);
  return { es: res.diagnostics.filter((d) => d.severity === "error"), name };
}
async function texts(src, ids) {
  const { res } = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}
const P = (body) => `<program>\n${body}\n</program>\n`;
const PH = `\${ type Ph:enum = { A, B } }`;

describe("item 1: E-DECL-RENDER-CYCLE-STAR — a `<*f/>` inside the markup it renders", () => {
  test("s08: a state arm showing its own field (direct) — names the place", async () => {
    const { es, name } = await errors(P(`${PH}
<ph:Ph=.A single>
  <A rule=.B><b id="o">x</b></>
  <B rule=.A><div><*ph/></div></>
</>
<main><*ph/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-STAR"]);
    expect(es[0].message).toContain("`<*ph/>` (" + name + ":5:19) stands inside the markup it renders");
    expect(es[0].message).toContain("same field of the same instance at every level");
    expect(es[0].message).toContain("Show a different field there, or make the nested part a component with a depth attribute");
  }, 120000);

  test("c03: guarded by `if=` — still refused (guards do not make it legal)", async () => {
    const { es } = await errors(P(`${PH}
let <show:bool=false/>
<ph:Ph=.A single>
  <A rule=.B><b id="o">x</b></>
  <B rule=.A><div if=(@show)><*ph/></div></>
</>
<main><*ph/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-STAR"]);
  }, 120000);

  test("y02: a three-field cycle names every `<*f/>` on it, in order, with its place", async () => {
    const { es, name } = await errors(P(`${PH}
<ah:Ph=.A single>
  <A rule=.B><b id="o">a</b></>
  <B rule=.A><div><*bh/></div></>
</>
<bh:Ph=.A single>
  <A rule=.B><b>b</b></>
  <B rule=.A><div><*ch/></div></>
</>
<ch:Ph=.A single>
  <A rule=.B><b>c</b></>
  <B rule=.A><div><*ah/></div></>
</>
<main><*ah/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-STAR"]);
    expect(es[0].message).toContain(`through the cycle \`<*ah/>\` (${name}:13:19) → \`<*bh/>\` (${name}:5:19) → \`<*ch/>\` (${name}:9:19) → \`<*ah/>\` (${name}:13:19)`);
  }, 120000);

  test("c02 / y03: a nested `<*qh/>` that does not lead back still compiles and renders", async () => {
    expect(await texts(P(`${PH}
<qh:Ph=.A single>
  <A rule=.B><b>y</b></>
  <B rule=.A><i>q</i></>
</>
<ph:Ph=.A single>
  <A rule=.B><div id="o"><*qh/></div></>
  <B rule=.A><b>x</b></>
</>
<main><*ph/></main>`), ["o"])).toEqual(["y"]);
  }, 120000);

  // s483 r1 (#2139 review MED-1) — the cycle runs through a declaration's render
  test("s08 (r1): a program field's arm mounts `<card/>`, whose render shows that field — refused, every hop named", async () => {
    const { es, name } = await errors(P(`${PH}
<ph:Ph=.B single>
  <A rule=.B><b>x</b></>
  <B rule=.A><div><card/></div></>
</>
<card t:string="c">
</> renders <i><*ph/></i>
<main><*ph/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-STAR"]);
    expect(es[0].message).toContain(`through the cycle \`<*ph/>\` (${name}:8:16) → \`<card>\` (${name}:5:19) → \`<*ph/>\` (${name}:8:16)`);
    expect(es[0].message).toContain("`<*ph/>`'s `<B>` state-child body holds `<card>`; `<card>`'s `renders` (a new `<card>` instance) holds `<*ph/>`");
  }, 120000);

  test("s09 (r1): through the shared instance `<*card/>`, and guarded inside the render — refused", async () => {
    const { es, name } = await errors(P(`${PH}
<ph:Ph=.B single>
  <A rule=.B><b>x</b></>
  <B rule=.A><div><*card/></div></>
</>
<card t:string="c">
</> renders <i><*ph/></i>
<main><*ph/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-STAR"]);
    expect(es[0].message).toContain("`renders` (the shared `<card>` instance) holds `<*ph/>`");
    const g = await errors(P(`${PH}
<ph:Ph=.B single>
  <A rule=.B><b>x</b></>
  <B rule=.A><div><card/></div></>
</>
<card t:string="c">
</> renders <i><span if=(t == "q")><*ph/></span></i>
<main><*ph/></main>`));
    expect(g.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-STAR"]);
    void name;
  }, 120000);

  test("r1: a component's render showing a program field that does not lead back still renders", async () => {
    expect(await texts(P(`${PH}
<ph:Ph=.B single>
  <A rule=.B><b>x</b></>
  <B rule=.A><b>y</b></>
</>
<card t:string="c">
</> renders <i id="o"><*ph/></i>
<main><card/></main>`), ["o"])).toEqual(["y"]);
  }, 120000);
});

describe("item 2: E-DECL-RENDER-CYCLE-USE — a use inside its own render, unconditional on every path", () => {
  test("c05: `<card>`'s render mounts `<card>` — refused at the use, not a stack overflow at load", async () => {
    const { es, name } = await errors(P(`<card t:string="x">
</> renders <div id="o"><card/></div>
<main><card/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(es[0].message).toContain("`<card>` is used inside its own render: `<card>`'s render mounts `<card>` (" + name + ":3:25)");
    expect(es[0].message).toContain("without end");
    expect(es[0].message).toContain("`<card depth=(depth - 1) if=(depth > 0)/>`");
    expect([es[0].line, es[0].col]).toEqual([3, 25]);
  }, 120000);

  test("a mutual pair: one report at each use, each naming the cycle", async () => {
    const { es, name } = await errors(P(`<pa t:string="x">
</> renders <div><pb/></div>
<pb t:string="y">
</> renders <span><pa/></span>
<main id="o"><pa/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE", "E-DECL-RENDER-CYCLE-USE"]);
    expect(es[0].message).toContain(`\`<pa>\`'s render mounts \`<pb>\` (${name}:3:18); \`<pb>\`'s render mounts \`<pa>\` (${name}:5:19)`);
  }, 120000);

  test("through a child field's own `renders` shown by `<*v/>` — refused", async () => {
    const { es } = await errors(P(`<card t:string="x">
    let <v:int=1/>
    renders <i><card/></i>
</>
renders <div id="o"><*v/></div>
<main><card/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
  }, 120000);

  test("as slot content of a use whose declaration shows its `<slot/>` unconditionally — refused", async () => {
    const { es } = await errors(P(`<wrap t:string="w">
</> renders <div><slot/></div>
<card t:string="x">
</> renders <wrap><card/></wrap>
<main id="o"><card/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
  }, 120000);

  test("guarded recursion is legal and renders a finite tree: `if=` on the use, an ancestor `if=`, `else`", async () => {
    expect(await texts(P(`<tree depth:int=3>
</> renders <div>\${depth}<tree depth=(depth - 1) if=(depth > 0)/></div>
<main id="o"><tree/></main>`), ["o"])).toEqual(["3210"]);
    expect(await texts(P(`<tree depth:int=3>
</> renders <div>\${depth}<span if=(depth > 0)><tree depth=(depth - 1)/></span></div>
<main id="o"><tree/></main>`), ["o"])).toEqual(["3210"]);
    expect(await texts(P(`<tree depth:int=3>
</> renders <div>\${depth}<b if=(depth == 0)>leaf</b><tree depth=(depth - 1) else/></div>
<main id="o"><tree/></main>`), ["o"])).toEqual(["3210leaf"]);
  }, 240000);

  test("guarded recursion: a `<match>` arm, an `<each>` row, a state arm (#2116 y04)", async () => {
    expect(await texts(P(`${PH}
<tree depth:int=2>
</> renders <div>\${depth}<match for=Ph on=(depth > 0 ? Ph.B : Ph.A)><A><b>leaf</b></A><B><tree depth=(depth - 1)/></B></match></div>
<main id="o"><tree/></main>`), ["o"])).toEqual(["210leaf"]);
    expect(await texts(P(`<tree depth:int=2>
</> renders <div>\${depth}<each in=(depth > 0 ? [depth - 1] : []) as d><tree depth=(d)/></each></div>
<main id="o"><tree/></main>`), ["o"])).toEqual(["210"]);
    expect(await texts(P(`${PH}
<card t:string="x">
    <ph:Ph=.A>
      <A rule=.B><b>leaf</b></>
      <B rule=.A><div><card/></div></>
    </>
</> renders <div id="o"><*ph/></div>
<card/>`), ["o"])).toEqual(["leaf"]);
  }, 240000);

  test("a chain that does not lead back, and slot content a guarded `<slot/>` holds, stay legal", async () => {
    expect(await texts(P(`<pc t:string="c">
</> renders <b>c</b>
<pb t:string="b">
</> renders <div><pc/><pc/></div>
<pa t:string="a">
</> renders <div><pb/></div>
<main id="o"><pa/></main>`), ["o"])).toEqual(["cc"]);
    expect(await texts(P(`<wrap t:string="w">
</> renders <div><b if=(t == "q")><slot/></b></div>
<card t:string="x">
</> renders <wrap><card/></wrap>
<main id="o"><card/></main>
<p id="o2">z</p>`), ["o", "o2"])).toEqual(["", "z"]);
  }, 240000);
});

describe("item 2 (r1, #2139 review MED-2): every branch mounts it — PA reading pa-ruled:S483-every-path-mounts", () => {
  test("m03: both branches of an `if=` / `else` chain — refused quickly (was a compile hang), one use per branch named", async () => {
    const { es, name } = await errors(P(`<card t:string="x">
</> renders <div><card if=(t == "a")/><card else/></div>
<main><card/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(es[0].message).toContain(`\`<card>\` in every branch of the \`if=\` chain at ${name}:3:18 (\`<card>\` (${name}:3:18) in the \`if=\` branch; \`<card>\` (${name}:3:39) in the \`else\` branch)`);
  }, 120000);

  test("m03b / n11: wrapped branches, and a three-branch chain into a mutual pair — refused", async () => {
    const a = await errors(P(`<card t:string="x">
</> renders <div><span if=(t == "a")><card/></span><span else><card/></span></div>
<main><card/></main>`));
    expect(a.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    const b = await errors(P(`<pa t:string="x">
</> renders <div><pb if=(t == "a")/><span else-if=(t == "b")><pb/></span><pb else/></div>
<pb t:string="y">
</> renders <p><pa/></p>
<main><pa/></main>`));
    expect(b.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE", "E-DECL-RENDER-CYCLE-USE"]);
  }, 120000);

  test("m04 / n10: every arm of an exhaustive `<match>` (variants, or `<_>`) — refused (was a compile hang)", async () => {
    const a = await errors(P(`${PH}
<card t:string="x">
</> renders <div><match for=Ph on=(t == "a" ? Ph.A : Ph.B)><A><card/></A><B><card/></B></match></div>
<main><card/></main>`));
    expect(a.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(a.es[0].message).toContain("in every arm of the `<match>`");
    expect(a.es[0].message).toContain("in the `<A>` arm");
    expect(a.es[0].message).toContain("in the `<B>` arm");
    const b = await errors(P(`\${ type Ph3:enum = { A, B, C } }
<card t:string="x">
</> renders <div><match for=Ph3 on=(t == "a" ? Ph3.A : Ph3.B)><A><card/></A><_><span><card/></span></_></match></div>
<main><card/></main>`));
    expect(b.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
  }, 120000);

  test("m15: a `<slot/>` in both branches of an `if=` / `else` — slot content mounting its holder is refused", async () => {
    const { es } = await errors(P(`<wrap t:string="w">
</> renders <div><b if=(t == "q")><slot/></b><i else><slot/></i></div>
<card t:string="x">
</> renders <wrap><card/></wrap>
<main><card/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(es[0].message).toContain("whose render shows its `<slot/>` in every branch of the `if=` chain");
  }, 120000);

  test("n03: every state arm of the declaration's own field mounts it — refused", async () => {
    const { es } = await errors(P(`${PH}
<card t:string="x">
    <ph:Ph=.B>
      <A rule=.B><i><card/></i></>
      <B rule=.A><div><card/></div></>
    </>
</> renders <div><*ph/></div>
<main><card/></main>`));
    expect(es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(es[0].message).toContain("in every state arm of `<*ph/>`");
  }, 120000);

  test("LOW-1: the message names every hop — the slot carriers, the `<*v/>` / `<*w/>` a use stands in", async () => {
    const a = await errors(P(`<w2 t:string="w">
</> renders <div><slot/></div>
<w1 t:string="w">
</> renders <w2><slot/></w2>
<card t:string="x">
</> renders <w1><card/></w1>
<main><card/></main>`));
    expect(a.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(a.es[0].message).toContain(`\`<card>\` (${a.name}:7:17) in the slot content of \`<w1>\` (${a.name}:7:13), whose render shows its \`<slot/>\` through \`<w2>\` (${a.name}:5:13)`);
    const b = await errors(P(`<card t:string="x">
    let <v:int=1/>
    renders <i><*w/></i>
    let <w:int=2/>
    renders <u><card/></u>
</>
renders <div><*v/></div>
<main><card/></main>`));
    expect(b.es.map((d) => d.code)).toEqual(["E-DECL-RENDER-CYCLE-USE"]);
    expect(b.es[0].message).toContain(`in \`<*w/>\` (${b.name}:4:16)'s own \`renders\` in \`<*v/>\` (${b.name}:8:14)'s own \`renders\``);
  }, 120000);

  test("legal: a branch that does not mount it ends the recursion — chain, `<match>` arm into a mutual pair, slot in one branch", async () => {
    expect(await texts(P(`<leaf t:string="L">
</> renders <b>\${t}</b>
<tree d:int=2>
</> renders <div>\${d}<leaf if=(d == 0)/><tree d=(d - 1) else/></div>
<main id="o"><tree/></main>`), ["o"])).toEqual(["210L"]);
    expect(await texts(P(`${PH}
<pa d:int=2>
</> renders <div>\${d}<match for=Ph on=(d > 0 ? Ph.B : Ph.A)><A><b>leaf</b></A><B><pb d=(d - 1)/></B></match></div>
<pb d:int=2>
</> renders <span><pa d=(d)/></span>
<main id="o"><pa/></main>`), ["o"])).toEqual(["210leaf"]);
    expect(await texts(P(`<wrap t:string="w">
</> renders <div><b if=(t == "q")><slot/></b><i else>none</i></div>
<card t:string="x">
</> renders <wrap><card/></wrap>
<main id="o"><card/></main>`), ["o"])).toEqual(["none"]);
  }, 240000);
});
