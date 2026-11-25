// hold-body-s482.test.js — lane s482-hold-body: effect and request runs triggered during the program body
// are held until the body ends, then run in trigger order.
//
// RULED S482, ruling:user-voice-scrml.md-S482-hold-until-body-ends — Q6 (b): "the runtime holds effect and
// request runs triggered during the body, running them after the body in trigger order." Rec (PERMANENT):
// "makes §7.6's 'they run after the mount' true as written". Owner: "yes, the runtime holds them".
// SPEC §7.6 R5, §6.7.4, §6.7.7 Mount behavior. Gaps g-boot-effect-fires-in-body-before-place-s482 and
// g-boot-request-runs-in-body-s482 (resolved).
//
// Built: print.scrml's boot runs the program's render inside `rt.runBody`; the runtime's flush takes no
// effect / request run while it runs; reachOf no longer walks an `<effect>` / `<request>` body (so what it
// reaches runs at its place). Shipping path (scripts/scrml-boot.ts compileSource → print.scrml) and the
// conformance runner's `runBootstrapArtifact` (happy-dom); the same probes in Chromium:
// compiler/tests/browser/hold-body-chromium-s482.browser.test.js.
//
// A plain `let` an effect or request writes is untracked, so its display shows the value at its place (before
// the held run); a click copies it into a cell to show what the run wrote.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-hold-body-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function compile(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function texts(res, ids, input = []) {
  const run = await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}
const CLICK = [{ click: "#b" }];

const LOG = `\${ let log: string = ""; }
\${ function lg(s: string) -> int { log = log + s; return 1; } }
let <o:string=""/>`;
const SHOW = `<button id="b" onclick=\${ @o = log; }>go</button>
<p id="o">\${@o}</p>`;

describe("the printed boot", () => {
  test("the program's render runs inside rt.runBody", async () => {
    const res = await compile(`<program>\n<p>x</p>\n</program>\n`);
    expect(res.client.js).toMatch(/rt\.runBody\(\(\) => \{\s*render_program\(/);
  }, 120000);
});

describe("trigger order", () => {
  test("three effects: writes `@c, @a, @b, @c` run c, a, b — once each, at the first trigger (base `cabc`, mid-body)", async () => {
    const res = await compile(`<program>
${LOG}
let <a:int=0/>
let <b2:int=0/>
let <c:int=0/>
<effect deps=[@a]>\${ lg("a"); }</>
<effect deps=[@b2]>\${ lg("b"); }</>
<effect deps=[@c]>\${ lg("c"); }</>
\${ @c = 1; }
\${ @a = 1; }
\${ @b2 = 1; }
\${ @c = 2; }
<p id="s">[\${log}]</p>
${SHOW}
</program>
`);
    expect(await texts(res, ["s"])).toEqual(["[]"]);
    expect(await texts(res, ["s", "o"], CLICK)).toEqual(["[]", "cab"]);
  }, 120000);

  test("a request and an effect: the effect's trigger first — E then R", async () => {
    const res = await compile(`<program>
${LOG}
let <a:int=0/>
let <m:int=0/>
<effect deps=[@a]>\${ lg("E"); }</>
\${ @a = 1; }
<request id="rq">\${ @m = lg("R"); }</request>
<p id="s">[\${log}] \${@m}</p>
${SHOW}
</program>
`);
    expect(await texts(res, ["s", "o"], CLICK)).toEqual(["[] 1", "ER"]);
  }, 120000);

  test("a request and an effect: the request's mount first — R then E", async () => {
    const res = await compile(`<program>
${LOG}
let <a:int=0/>
let <m:int=0/>
<effect deps=[@a]>\${ lg("E"); }</>
<request id="rq">\${ @m = lg("R"); }</request>
\${ @a = 1; }
<p id="s">[\${log}] \${@m}</p>
${SHOW}
</program>
`);
    expect(await texts(res, ["s", "o"], CLICK)).toEqual(["[] 1", "RE"]);
  }, 120000);
});

// what a held run reaches runs at its place: `k` = 5 (source order), never the pre-body 1
const K = `\${ let n: int = 1; }
\${ n = 5; }
\${ let out: int = 0; }`;

describe("constructs mounted as part of the body", () => {
  test("an `<each>` row's effect (two rows): each reads `k` = 5 after the body — out 10 (base `2 1` / 2)", async () => {
    const res = await compile(`<program>
${K}
\${ function note() -> int { out = out + k; return 1; } }
let <a:int=0/>
let <o:int=0/>
<xs:int[replace]=([1, 2])/>
<ul><each in=@xs as x><li>\${x}<effect deps=[@a]>\${ note(); }</></li></each></ul>
\${ @a = 2; }
\${ const k: int = n + 0; }
<p id="s">\${out} \${k}</p>
<button id="b" onclick=\${ @o = out; }>go</button>
<p id="o">\${@o}</p>
</program>
`);
    expect(await texts(res, ["s", "o"], CLICK)).toEqual(["0 5", "10"]);
  }, 120000);

  test("an effect and a request nested in an `if=` construct: R then E, each reading `k` = 5 (base `[RE] 2 1`)", async () => {
    const res = await compile(`<program>
${K}
${LOG}
\${ function lgk(s: string) -> int { log = log + s; out = out + k; return 1; } }
let <a:int=0/>
let <m:int=0/>
let <o2:int=0/>
<div if=(true)><section><effect deps=[@a]>\${ lgk("E"); }</><request id="rq" deps=[]>\${ @m = lgk("R"); }</request><b>\${@m}</b></section></div>
\${ @a = 2; }
\${ const k: int = n + 0; }
<p id="s">[\${log}] \${out} \${k}</p>
<button id="b" onclick=\${ @o = log; @o2 = out; }>go</button>
<p id="o">\${@o} \${@o2}</p>
</program>
`);
    expect(await texts(res, ["s"])).toEqual(["[] 0 5"]);
    expect(await texts(res, ["o"], CLICK)).toEqual(["RE 10"]);
  }, 120000);

  // A component (a declaration's renders) cannot hold an `<effect>` or a `<request>` in the bootstrap
  // (E-BOOTSTRAP-UNSUPPORTED); a component instance's SEED, mounted in the body, is read before a held request.
  test("a component instance's prop default, after a request that writes what it reads: 1 (the request is held; base 5)", async () => {
    const res = await compile(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function rd() -> int { return n; } }
let <r:int=0/>
<cp v:int=(rd())>
</> renders <p id="o">\${v}</p>
<request id="rq" deps=[]>\${ @r = bump(); }</request><cp/>
</program>
`);
    expect(await texts(res, ["o"])).toEqual(["1"]);
  }, 120000);
});

describe("a construct mounted LATER needs no hold of its own (its mount is a flush's render effect)", () => {
  test("an `if=` turning true on a click: the request runs after its mount — the display inside shows `[]`", async () => {
    const res = await compile(`<program>
${LOG}
let <f:boolean=false/>
let <m:int=0/>
<div if=(@f)><request id="rq" deps=[]>\${ @m = lg("R"); }</request><b>\${@m}</b><p id="in">[\${log}]</p></div>
<button id="b" onclick=\${ @f = true; }>go</button>
<button id="c" onclick=\${ @o = log; }>show</button>
<p id="o">\${@o}</p>
</program>
`);
    expect(await texts(res, ["in", "o"], [{ click: "#b" }, { click: "#c" }])).toEqual(["[]", "R"]);
  }, 120000);
});
