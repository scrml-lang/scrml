// instance-mount-reach-s482.test.js — lane s482-instance-mount-reach (gap
// g-boot-instance-mount-reach-later-binding-s482): a component use in the program body MOUNTS an
// instance at its place, and the code that mount runs — the declaration's field seeds (a `let`
// field's, a constant locked field's, a prop default's) less the fields the use gives, its render's
// displays / attribute values, a derived field its render reads, and the instances its render mounts —
// is judged at the use's place by §7.6 R2: reaching a binding whose place is later is E-SCOPE-001.
//
// Rulings: §7.6 R1 ("Every declaration, statement, display, attribute value and unconditional mount
// has one place in the body") and R2 ("Code that runs at place p … may reach … only bindings whose
// place is before p. Otherwise E-SCOPE-001") — ruling:user-voice-scrml.md-S482-runorder-model-c;
// §66.7.6 rule 5 S482 (an instance's seeds are computed "at its mount"); Q13
// ruling:user-voice-scrml.md-S482-locked-field-derived ("a seed computed at its place, meaning the
// instance's mount").
//
// Red on base 153bd0334: every refusal below compiled, and the probes showed `1 | 1` where the
// source order gives 5 (y04, y03 after the click), or a value read out of the body's order.
// Every case runs on the SHIPPING path (scripts/scrml-boot.ts compileSource; the legal shapes'
// values through the conformance runner's runBootstrapArtifact, happy-dom).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-instance-mount-reach-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return await compileSource(file);
}
async function errors(src) {
  const res = await result(src);
  return res.diagnostics.filter((d) => d.severity === "error");
}
async function texts(src, ids) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}
// one E-SCOPE-001 naming `k`, whose message holds every fragment of `says`
async function refusedNaming(src, says) {
  const es = await errors(src);
  expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001"]);
  expect(es[0].message).toContain("`k` is used before it is initialized");
  for (const s of says) expect(es[0].message).toContain(s);
  return es[0];
}

// `n` is written by an earlier body-top statement, so `k`'s initializer (`n + 0`) gives 5 at its
// place and 1 if it is run before the body — the silent wrong value these refusals prevent.
const N = `\${ let n: int = 1; }`;
const P = (body) => `<program>\n${N}\n${body}\n</program>\n`;
const CARD_LET = `<card t:string="x">
    let <v:int=(k + 0)/>
</> renders <b id="o">\${v}</b>`;

describe("an instance's mount is judged at the use's place (§7.6 R1 / R2)", () => {
  test("y04: a `let` field's seed reaching a later binding (base showed `1 | 1`)", async () => {
    await refusedNaming(P(`${CARD_LET}
\${ n = 5; }
<card/>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["this `<card>` mounts an instance here", "the seed of field `v` of `<card>`", "reads `k`", "Declare `k` before this `<card>`"]);
  }, 120000);

  test("y03: a constant locked field (Q13 — a seed at the mount) whose render shows it only after a click", async () => {
    await refusedNaming(P(`let <show:boolean=false/>
<card t:string="x">
    <v:int=(k + 0)/>
</> renders <b if=(@show) id="o">\${v}</b>
\${ n = 5; }
<card/>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>
<button id="b" onclick={ @show = true; }>b</button>`), ["the seed of field `v`"]);
  }, 120000);

  test("y10: a constant locked field read by nothing", async () => {
    await refusedNaming(P(`<card t:string="x">
    <v:int=(k + 0)/>
</> renders <b>x</b>
\${ n = 5; }
<card/>
\${ const k: int = n + 0; }`), ["the seed of field `v`"]);
  }, 120000);

  test("y11 / y12: through a function, a field seed and a prop default", async () => {
    const F = `\${ function rk() -> int { return k; } }`;
    await refusedNaming(P(`${F}
<card t:string="x">
    <v:int=(rk() + 0)/>
</> renders <b>\${v}</b>
<card/>
\${ const k: int = n + 0; }`), ["calls `rk()`, which uses `k`"]);
    await refusedNaming(P(`${F}
<cp v:int=(rk() + 0)>
</> renders <b>\${v}</b>
<cp/>
\${ const k: int = n + 0; }`), ["the seed of field `v` of `<cp>`"]);
  }, 240000);

  test("y01: a later constant (correct on base, `5`) is refused too — R2 is about the place, not the value", async () => {
    await refusedNaming(`<program>
${CARD_LET}
<card/>
\${ const k: int = 5; }
</program>
`, ["the seed of field `v`"]);
  }, 120000);

  test("the render's display, attribute value, and a function it calls", async () => {
    await refusedNaming(P(`<card t:string="x">
</> renders <b>\${k}</b>
<card/>
\${ const k: int = n + 0; }`), ["its mount runs a display of `<card>`", "reads `k`"]);
    await refusedNaming(P(`\${ function rk() -> int { return k; } }
<card t:string="x">
</> renders <b>\${rk()}</b>
<card/>
\${ const k: int = n + 0; }`), ["calls `rk()`"]);
  }, 240000);

  test("a derived field (it reads a cell) read by the render runs its formula at the mount (R4)", async () => {
    await refusedNaming(P(`let <m:int=1/>
<card t:string="x">
    <v:int=(@m + k)/>
</> renders <b>\${v}</b>
<card/>
\${ const k: int = n + 0; }`), ["reads `@card.v`, a derived value computed when it is read, and its formula reads `k`"]);
  }, 120000);

  test("a field seed reading a cell before the cell's place runs the cell's seed there", async () => {
    await refusedNaming(P(`<card t:string="x">
    let <v:int=(@c + 0)/>
</> renders <b>\${v}</b>
<card/>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`), ["uses `@c` before its place", "that seed reads `k`"]);
  }, 120000);

  test("an instance the render mounts (at any depth) is judged at the outer use's place", async () => {
    const d = await refusedNaming(P(`<inner t:string="x">
    let <v:int=(k + 0)/>
</> renders <b>\${v}</b>
<outer t:string="y">
</> renders <div><inner/></div>
<outer/>
\${ const k: int = n + 0; }`), ["this `<outer>` (whose render mounts `<inner>`)", "the seed of field `v` of `<inner>`", "Declare `k` before this `<outer>`"]);
    expect(d.message).not.toContain("before this `<outer>` (whose");
  }, 120000);

  test("the declaration's own place does not matter: a use before `k`, the declaration after it", async () => {
    await refusedNaming(P(`<card/>
\${ const k: int = n + 0; }
${CARD_LET}`), ["the seed of field `v`"]);
  }, 120000);

  test("a use inside `if=` content or an `<each>` row is judged at its place (it may mount during the body) — as a display there is", async () => {
    await refusedNaming(P(`let <show:boolean=false/>
${CARD_LET}
<div if=(@show)><card/></div>
\${ const k: int = n + 0; }`), ["the seed of field `v`"]);
    await refusedNaming(P(`<rows:int[replace]=([1])/>
${CARD_LET}
<div><each in=(@rows)><card/></each></div>
\${ const k: int = n + 0; }`), ["the seed of field `v`"]);
  }, 240000);
});

// s482 r1 (#2112 review) — red on 47648f0bf: a18 / a03 / a03b / a14 compiled and showed `1 | 1` in
// Chromium where the source order gives 5; a11's message read "a attribute value of `<outer>`".
const FIELD_RENDERS = `<card t:string="x">
    let <v:int=1/>
    renders <b id="o">\${k}</b>
</>
renders <span><*v/></span>`;
const PH = (child) => `\${ type Ph:enum = { A, B } }
<ph:Ph=.A single>
  <A rule=.B>${child}</>
  <B rule=.A : "B">
</>`;

describe("r1: markup `<*f/>` renders, and a shared instance's read, are judged where they run", () => {
  test("MED-1 a18: a child field's own `renders`, shown by `<*v/>` in the render, runs at the mount", async () => {
    await refusedNaming(P(`${FIELD_RENDERS}
\${ n = 5; }
<card/>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["this `<card>` mounts an instance here", "its mount runs a display of `<card>`", "reads `k`"]);
  }, 120000);

  test("MED-2 a03: an instance in a body-level engine's state child, shown by `<*ph/>`, mounts at the `<*ph/>`", async () => {
    await refusedNaming(P(`${CARD_LET}
${PH("<card/>")}
\${ n = 5; }
<main><*ph/></main>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["this `<*ph/>` (whose markup mounts `<card>`) mounts an instance here", "the seed of field `v` of `<card>`", "Declare `k` before this `<*ph/>`"]);
  }, 120000);

  test("MED-2 a03b: a plain display in a state child is judged at the `<*ph/>`'s place, not where it is written", async () => {
    await refusedNaming(P(`${PH(`<b id="o">\${k}</b>`)}
\${ n = 5; }
<main><*ph/></main>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["this `<*ph/>` renders a field's markup here", "that markup runs a display, which reads `k`", "Declare `k` before this `<*ph/>`"]);
    // r05: the engine declared AFTER `k`, its `<*ph/>` before — the `<*ph/>`'s place is the bound
    await refusedNaming(P(`\${ n = 5; }
<main><*ph/></main>
\${ const k: int = n + 0; }
${PH(`<b id="o">\${k}</b>`)}`), ["this `<*ph/>` renders a field's markup here"]);
  }, 240000);

  test("MED-4 a14: a read of a declaration's shared instance constructs it at the read (R4) — its seed reaching a later binding", async () => {
    await refusedNaming(P(`<card t:string="x">
    let <v:int=(k + 0)/>
</>
\${ n = 5; }
<p id="o">\${@card.v}</p>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["this display reads `@card`, the shared instance of `<card>`, constructed at its first reference (§7.6 R4)", "the seed of its field `v` reads `k`"]);
  }, 120000);

  test("MED-4 r06: a derived field read through the shared instance runs its formula at the read", async () => {
    await refusedNaming(P(`let <m:int=1/>
<card t:string="x">
    <d:int=(@m + k)/>
</>
<p id="o">\${@card.d}</p>
\${ const k: int = n + 0; }`), ["reads `@card.d`, a derived value computed when it is read, and its formula reads `k`"]);
  }, 120000);

  test("NIT-1 a11: the attribute is named on the element it is on, with the right article", async () => {
    const d = await refusedNaming(P(`let <m:int=0/>
<inner w:int=0>
</> renders <b id="o">\${w}</b>
<outer t:string="y">
    <d:int=(@m + k)/>
</> renders <div><inner w=(d)/></div>
<outer/>
\${ const k: int = n + 0; }`), ["its mount runs an attribute value (`w=` on `<inner>`) of `<outer>`"]);
    expect(d.message).not.toContain("a attribute");
  }, 120000);
});

describe("r1 legal: the same markup after the binding, and markup never shown", () => {
  test("a child field's `renders`, a state child's instance and display, after `k`: the source-order value", async () => {
    expect(await texts(P(`${FIELD_RENDERS}
\${ n = 5; }
\${ const k: int = n + 0; }
<card/>
<p id="o2">\${k}</p>`), ["o", "o2"])).toEqual(["5", "5"]);
    expect(await texts(P(`${CARD_LET}
${PH("<card/>")}
\${ n = 5; }
\${ const k: int = n + 0; }
<main><*ph/></main>
<p id="o2">\${k}</p>`), ["o", "o2"])).toEqual(["5", "5"]);
    expect(await texts(P(`${PH(`<b id="o">\${k}</b>`)}
\${ n = 5; }
\${ const k: int = n + 0; }
<main><*ph/></main>
<p id="o2">\${k}</p>`), ["o", "o2"])).toEqual(["5", "5"]);
  }, 360000);

  test("r09: a child field's `renders` no `<*v/>` shows is not run, so not judged", async () => {
    expect(await texts(P(`<card t:string="x">
    let <v:int=1/>
    renders <b>\${k}</b>
</>
renders <span id="o">\${v}</span>
\${ n = 5; }
<card/>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["o", "o2"])).toEqual(["1", "5"]);
  }, 120000);

  test("r17: a shared instance whose seed reads an EARLIER binding the body writes before the read", async () => {
    expect(await texts(P(`<card t:string="x">
    let <v:int=(n + 0)/>
</>
\${ n = 5; }
<p id="o">\${@card.v}</p>
<p id="o2">\${n}</p>`), ["o", "o2"])).toEqual(["5", "5"]);
  }, 120000);
});

describe("legal: what the mount does not run, or runs after the binding's place", () => {
  test("a use after the binding shows the value from the source order", async () => {
    expect(await texts(P(`${CARD_LET}
\${ n = 5; }
\${ const k: int = n + 0; }
<card/>
<p id="o2">\${k}</p>`), ["o", "o2"])).toEqual(["5", "5"]);
  }, 120000);

  test("a field the use gives a value: the default is not run", async () => {
    expect(await texts(P(`${CARD_LET}
<card v=(3)/>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>`), ["o", "o2"])).toEqual(["3", "1"]);
    expect(await texts(P(`<cp v:int=(k + 0)>
</> renders <b id="o">\${v}</b>
<cp v=(2)/>
\${ const k: int = n + 0; }`), ["o"])).toEqual(["2"]);
  }, 240000);

  test("an event handler in the render, and a derived field only a handler reads, are not judged (R5 / R4)", async () => {
    expect(await texts(P(`let <out:int=0/>
<card t:string="x">
</> renders <button id="b" onclick={ @out = k; }>b</button>
<card/>
\${ const k: int = n + 0; }
<p id="o">\${@out}</p>`), ["o"])).toEqual(["0"]);
    expect(await texts(P(`let <m:int=1/>
let <out:int=0/>
<card t:string="x">
    <v:int=(@m + k)/>
</> renders <button id="b" onclick={ @out = v; }>b</button>
<card/>
\${ const k: int = n + 0; }
<p id="o">\${@out}</p>`), ["o"])).toEqual(["0"]);
  }, 240000);

  test("y13: a seed reading an earlier binding the body writes after the use reads it at the mount", async () => {
    expect(await texts(P(`\${ function rn() -> int { return n; } }
<card t:string="x">
    let <v:int=(rn() + 0)/>
</> renders <b id="o">\${v}</b>
<card/>
\${ n = 5; }
<p id="o2">\${n}</p>`), ["o", "o2"])).toEqual(["1", "5"]);
  }, 120000);
});
