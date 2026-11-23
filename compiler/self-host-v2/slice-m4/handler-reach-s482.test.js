// handler-reach-s482.test.js — lane s482-handler-reach: an event handler (and a lifted row's, an
// `<each>` row's, a component's handler) written before a binding's place, that reaches the
// binding, no longer makes the printer run the binding before the body.
//
// SPEC §7.6 rule (b) S481 (ruling:user-voice-scrml.md-S481-body-run-order): "the program body runs
// once, top to bottom, in source order"; S482: "Code that does not run in the body is not judged: an
// event handler …". A handler runs on an event, after the body, so it reads the binding's value
// from its place. Gap g-boot-handler-reach-runs-binding-early-s482: print.scrml bodyInits folded
// every view before a place into `reached` with reachOf, which walked the view's handlers as if
// they ran in the body — `k` ran at module initialization, before `n = 5` (Chromium `1`, the
// source order `5`). Fix: reachOf walks only the code that runs when its roots run (runsNowNode).
// An `<effect>` / `<request>` body is still walked — both run during the body today
// (g-boot-effect-fires-in-body-before-place-s482, g-boot-request-runs-in-body-s482); "E" pins it.
//
// Every case runs on the SHIPPING path: scripts/scrml-boot.ts `compileSource` → print.scrml, and
// the conformance runner's `runBootstrapArtifact` (happy-dom; the values were also measured in
// Chromium, ~/.cache/scrml/review/s482-handler-reach/h/run.sh). Red on base 7d4dca2f8 (the #2063
// head): A a1–a4, B b1–b3, C c1–c2 and D d1 (10 tests) showed `1` (`2` in a row); the guards
// ("unchanged", c3, c4, E) pass on both.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-handler-reach-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return await compileSource(file);
}
async function compile(src) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function texts(res, ids, input = []) {
  const run = await runBootstrapArtifact(res.client.html, res.client.js, input, {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}
const fnDecl = (js, name) => new RegExp("^\\s*(async )?function " + name + "\\(", "m").test(js);

// `n` is written by an earlier body-top statement, so `k`'s initializer (`n + 0`) gives 5 at its
// place and 1 if it is run before the body — the silent wrong value of the gap.
const N = `\${ let n: int = 1; }
\${ n = 5; }
let <o:int=0/>`;
const P = (body) => `<program>\n${N}\n${body}\n</program>\n`;
const CLICK = [{ click: "#b" }];

describe("A — a handler before the place reaching the binding: the binding runs at its place", () => {
  test("a1: directly (`@o = k`)", async () => {
    const res = await compile(P(`<button id="b" onclick=\${ @o = k; }>go</button>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`));
    expect(await texts(res, ["o", "s"])).toEqual(["0", "5"]);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["5", "5"]);
  }, 120000);

  test("a2: through a function (the gap's probe) — the function still ships (#2061 client roots)", async () => {
    const res = await compile(`<program>
\${ let n: int = 1; }
\${ function g() -> int { return k; } }
\${ n = 5; }
let <o:int=0/>
<button id="b" onclick=\${ @o = g(); }>go</button>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>
</program>
`);
    expect(fnDecl(res.client.js, "g")).toBe(true);
    expect(await texts(res, ["o", "s"])).toEqual(["0", "5"]);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["5", "5"]);
  }, 120000);

  test("a3: through a cell's seed (#2063 review LOW-1, probe o-handler-only)", async () => {
    const res = await compile(P(`<button id="b" onclick=\${ @o = @c; }>go</button>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>
<p id="s">\${@c}</p>`));
    expect(await texts(res, ["o", "s"])).toEqual(["0", "5"]);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["5", "5"]);
  }, 120000);

  test("a4: a handler writing the cell whose seed reaches the binding", async () => {
    const res = await compile(P(`<button id="b" onclick=\${ @c = @c + 1; }>go</button>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>
<p id="s">\${@c}</p>`));
    expect(await texts(res, ["s"])).toEqual(["5"]);
    expect(await texts(res, ["s"], CLICK)).toEqual(["6"]);
  }, 120000);

  test("unchanged: the handler after the place", async () => {
    const res = await compile(P(`\${ const k: int = n + 0; }
<button id="b" onclick=\${ @o = k; }>go</button>
<p id="o">\${@o}</p>
<p id="s">\${k}</p>`));
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["5", "5"]);
  }, 120000);
});

describe("B — the handler in a row or a component", () => {
  test("b1: an `<each>` row's handler", async () => {
    const res = await compile(P(`<ul><each in=([1]) as=x><li><button id="b" onclick=\${ @o = k + x; }>b</button></li></each></ul>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`));
    expect(await texts(res, ["o", "s"])).toEqual(["0", "5"]);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["6", "5"]);
  }, 120000);

  test("b2: a lifted gather row's handler (probe r1-gather-handler)", async () => {
    const res = await compile(P(`<ul>\${ for (const x of [1]) { lift <li><button id="b" onclick=\${ @o = k + x; }>b</button></li>; } }</ul>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`));
    expect(await texts(res, ["o", "s"])).toEqual(["0", "5"]);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["6", "5"]);
  }, 120000);

  test("b3: a component's handler (its renders, constructed at its mount)", async () => {
    const res = await compile(P(`<card t:string="">
</> renders <button id="b" onclick=\${ @o = k; }>\${t}</button>
<div><card t="b"/></div>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`));
    expect(await texts(res, ["o", "s"])).toEqual(["0", "5"]);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["5", "5"]);
  }, 120000);
});

describe("C — fail closed: a binding a handler reads is initialized, at its place", () => {
  test("c1: the handler is the ONLY reader — initialized at its place, never dropped", async () => {
    const res = await compile(P(`<button id="b" onclick=\${ @o = k; }>go</button>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }`));
    expect(await texts(res, ["o"])).toEqual(["0"]);
    expect(await texts(res, ["o"], CLICK)).toEqual(["5"]);
  }, 120000);

  test("c2: two handlers", async () => {
    const src = P(`<button id="b" onclick=\${ @o = k; }>go</button>
<button id="c" onclick=\${ @o = k + 100; }>go2</button>
<p id="o">\${@o}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`);
    const res = await compile(src);
    expect(await texts(res, ["o", "s"], CLICK)).toEqual(["5", "5"]);
    expect(await texts(res, ["o", "s"], [{ click: "#c" }])).toEqual(["105", "5"]);
  }, 120000);

  test("c3: a handler and a display both before the place — the display is E-SCOPE-001 (unchanged)", async () => {
    const res = await result(P(`<button id="b" onclick=\${ @o = k; }>go</button>
<p id="o">\${k}</p>
\${ const k: int = n + 0; }`));
    const es = res.diagnostics.filter((d) => d.severity === "error");
    expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(es[0].message).toContain("this display reads `k`");
  }, 120000);

  test("c4: a handler calling a server function that reads a body binding — the binding stays server-only", async () => {
    const SECRET = "zz-sk-handler-reach";
    const res = await compile(`<program db="./app.db">
\${
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + KEY;
    }
}
let <out:string=""/>
<button id="b" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
\${ const KEY: string = "${SECRET}"; }
<p id="c">\${@out}</p>
</program>
`);
    expect(res.client.js).not.toContain(SECRET);
    expect(res.serverJs).toContain(SECRET);
  }, 120000);
});

describe("D — a function value handed on in a handler", () => {
  test("d1: a handler passing a function value (runorder-followups B r1 shape) — 5", async () => {
    const res = await compile(`<program>
\${ let n: int = 1; }
\${ let out: int = 0; }
\${ function g() -> int { return k; } }
\${ function run(f: () => int) -> int { return f(); } }
\${ n = 5; }
let <o:int=0/>
<button id="b" onclick=\${ @o = run(g); }>go</button>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>
<p id="o">\${@o}</p>
</program>
`);
    expect(await texts(res, ["s", "o"], CLICK)).toEqual(["5", "5"]);
  }, 120000);
});

describe("E — kept as they are (they run during the body today): `<effect>` and `<request>`", () => {
  // g-boot-effect-fires-in-body-before-place-s482 (OPEN owner question): a body-top write of the
  // effect's dependency runs it during the body, so what it reaches is still run early (`1`, the
  // source order 5) — not made worse here: skipping it would read `k` uninitialized.
  test("e1: an effect whose dependency a body-top statement writes (probe r1-effect-fire) — unchanged", async () => {
    const res = await compile(P(`\${ let out: int = 0; }
\${ function note() -> int { out = k; return 1; } }
let <a:int=0/>
<effect deps=[@a]>\${ note(); }</effect>
\${ @a = 2; }
\${ const k: int = n + 0; }
<p id="s">\${out} \${k}</p>`));
    expect(await texts(res, ["s"])).toEqual(["1 1"]);
  }, 120000);

  // g-boot-request-runs-in-body-s482: rt.requestOn runs a request's first load where it stands,
  // during the body — skipping its body (as the lane brief proposed, after §7.6's "they run after
  // the mount") showed `NaN 5` (the later `k` read uninitialized). Kept: `2 1` (source order `6 5`).
  test("e2: a `<request>` body reaching a later binding (probe r1-request) — unchanged, never uninitialized", async () => {
    const res = await compile(P(`let <m:int=0/>
\${ function cnt(x: int) -> int { return x + k; } }
<request id="load">\${ @m = cnt(1); }</request>
\${ const k: int = n + 0; }
<p id="s">\${@m} \${k}</p>`));
    expect(await texts(res, ["s"])).toEqual(["2 1"]);
  }, 120000);
});
