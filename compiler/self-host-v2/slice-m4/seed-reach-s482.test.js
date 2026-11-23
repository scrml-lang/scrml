// seed-reach-s482.test.js — lane s482-seed-reach: a cell's seed that reaches a file-scope binding
// whose place in the program body's one source-ordered run (SPEC §7.6 rule (b) S481/S482) is later
// is E-SCOPE-001.
//  (a) the seed computed EARLY, because the cell is used before its place (a read — a display, a
//      statement, an attribute value, a component's use-site value, a function they call — or a
//      write, which runs the seed first) or because it is a derived cell (computed when it is read).
//      Ruling: user-voice-scrml.md S482 "a cell read before its place whose seed reaches a later
//      binding is E-SCOPE-001" (ruling:user-voice-scrml.md-S482-seed-read-early). Gap
//      g-boot-seed-read-early-reach-s482 (#2053 review MED-2, probe b-cellread → `1 | 1`).
//  (b) the seed at the cell's OWN place reaching a later binding — the S481 run-order follow-ups
//      item 2 rule (ruling:user-voice-scrml.md-S481-run-order-followups) applied to a seed, which is
//      user code running at its place. Gap g-boot-seed-at-place-reaches-later-s482 (#2053 r2 review,
//      probes y-cell-seed-direct / flat / nested / effect → `1 | 1` / `kab`).
//
// Every case runs on the SHIPPING path: scripts/scrml-boot.ts `compileSource` → print.scrml, and
// the conformance runner's `runBootstrapArtifact` (happy-dom) for the values of the legal shapes.
// Red on base 62d36cabd: every refusal compiled (the silent `1 | 1`).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-seed-reach-")); });
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
}

// `n` is written by an earlier body-top statement, so `k`'s initializer (`n + 0`) gives 5 at its
// place and 1 if it is run before the body — the silent wrong value these refusals prevent.
const N = `\${ let n: int = 1; }
\${ n = 5; }`;
const P = (body) => `<program>\n${N}\n${body}\n</program>\n`;

describe("(a) a cell used before its place runs its seed there: a seed reaching a later binding is E-SCOPE-001", () => {
  test("a display reading the cell before its place (the review's b-cellread)", async () => {
    await refusedNaming(P(`<p id="a">\${@c}</p>
\${ const k: int = n + 0; }
let <c:int=(k)/>
<p id="b">\${k}</p>`), ["this display uses `@c` before its place", "that seed reads `k`"]);
  }, 120000);

  test("an attribute value reading it", async () => {
    await refusedNaming(P(`<p id="r" title=(@c)>x</p>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`), ["this attribute value uses `@c`"]);
  }, 120000);

  test("a statement reading it", async () => {
    await refusedNaming(P(`\${ let out: int = 0; }
\${ out = @c; }
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`), ["this statement uses `@c`"]);
  }, 120000);

  test("a statement WRITING it (a write runs the seed first; on base the page trapped)", async () => {
    await refusedNaming(P(`\${ @c = 9; }
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>
<p id="r">\${@c}</p>`), ["this statement uses `@c` before its place"]);
  }, 120000);

  test("a component's use-site value reading it", async () => {
    await refusedNaming(`<card v:int=0>
</> renders <span>\${v}</span>
` + P(`<div id="r"><card v=(@c)/></div>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`), ["this attribute value uses `@c`"]);
  }, 120000);

  test("a display inside `if=` content reading it", async () => {
    await refusedNaming(P(`<f:boolean=(true)/>
<div if=(@f)><p id="r">\${@c}</p></div>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`), ["this display uses `@c`"]);
  }, 120000);

  test("a display calling a function that reads the cell", async () => {
    await refusedNaming(P(`\${ function rc() -> int { return @c; } }
<p id="r">\${rc()}</p>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`), ["calls `rc()`, which uses `@c` before its place"]);
  }, 120000);

  test("the seed reaching it through a function it calls", async () => {
    await refusedNaming(P(`\${ function g() -> int { return k; } }
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }
let <c:int=(g())/>`), ["uses `@c` before its place", "that seed calls `g()`, which uses `k`"]);
  }, 120000);

  test("through a second cell the seed reads before ITS place", async () => {
    await refusedNaming(P(`<p id="r">\${@c}</p>
\${ const k: int = n + 0; }
let <c:int=(@d + 0)/>
let <d:int=(k + 0)/>`), ["uses `@c` before its place", "uses `@d` before its place", "reads `k`"]);
  }, 120000);

  test("a derived cell read before the binding (computed when it is read)", async () => {
    await refusedNaming(P(`<d:int=(k + 0)/>
<p id="r">\${@d}</p>
\${ const k: int = n + 0; }`), ["reads `@d`, a derived value computed when it is read, and its formula reads `k`"]);
  }, 120000);
});

describe("(b) a seed at its own place reaching a later binding is E-SCOPE-001", () => {
  test("directly (the review's y-cell-seed-direct)", async () => {
    await refusedNaming(P(`let <c:int=(k + 0)/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`), ["the seed of `@c` (computed at its place, §7.6 rule (b) S482) reads `k`"]);
  }, 120000);

  test("through a function (y-cell-seed-flat)", async () => {
    await refusedNaming(P(`\${ function g() -> int { return k; } }
let <c:int=(g())/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }`), ["the seed of `@c`", "calls `g()`, which uses `k`"]);
  }, 120000);

  test("through a called nested function (y-cell-seed-nested)", async () => {
    await refusedNaming(P(`\${ function h() -> int {
    function inner() -> int { return k; }
    return inner();
} }
let <c:int=(h())/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }`), ["the seed of `@c`", "calls `h()`, which reaches `inner()`, which uses `k`"]);
  }, 120000);

  test("a seed with an effect (y-cell-seed-effect: on base the log read `kab`)", async () => {
    const src = `<program>
\${ let log: string = ""; }
\${ function note(s: string) -> int { log = log + s; return 1; } }
\${ note("a"); }
let <c:int=(k + 0)/>
\${ note("b"); }
\${ const k: int = note("k"); }
<p id="r">\${log}</p>
</program>
`;
    await refusedNaming(src, ["the seed of `@c`"]);
  }, 120000);

  test("a seed reading a later cell whose seed reaches a later binding", async () => {
    await refusedNaming(P(`let <c:int=(@d + 0)/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }
let <d:int=(k + 0)/>`), ["the seed of `@c`", "uses `@d` before its place"]);
  }, 120000);
});

describe("(a) and (b) together", () => {
  test("a read before the place AND the seed at its place both reach it: one E-SCOPE-001 each", async () => {
    const es = await errors(P(`\${ function g() -> int { return k; } }
<p id="r">\${@c}</p>
let <c:int=(g())/>
\${ const k: int = n + 0; }`));
    expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001", "E-SCOPE-001"]);
    expect(es.some((d) => d.message.includes("this display uses `@c` before its place"))).toBe(true);
    expect(es.some((d) => d.message.includes("the seed of `@c` (computed at its place"))).toBe(true);
  }, 120000);
});

describe("legal shapes still compile, with the source-order values", () => {
  test("a seed reading an EARLIER binding, the cell read after its place (5 | 5)", async () => {
    expect(await texts(P(`\${ const k: int = n + 0; }
let <c:int=(k + 0)/>
<p id="r">\${@c}</p>
<p id="s">\${k}</p>`), ["r", "s"])).toEqual(["5", "5"]);
  }, 120000);

  test("a cell read before its place whose seed reads only an EARLIER binding (5 | 5)", async () => {
    expect(await texts(P(`\${ const k: int = n + 0; }
<p id="r">\${@c}</p>
let <c:int=(k + 0)/>
<p id="s">\${k}</p>`), ["r", "s"])).toEqual(["5", "5"]);
  }, 120000);

  test("a seed reading only other cells and constants, read before its place (4 | 4)", async () => {
    expect(await texts(`<program>
<p id="r">\${@b}</p>
let <a:int=(3)/>
let <b:int=(@a + 1)/>
<p id="s">\${@b}</p>
</program>
`, ["r", "s"])).toEqual(["4", "4"]);
  }, 120000);

  test("a derived cell read after the binding (5 | 5)", async () => {
    expect(await texts(P(`<d:int=(k + 0)/>
\${ const k: int = n + 0; }
<p id="r">\${@d}</p>
<p id="s">\${k}</p>`), ["r", "s"])).toEqual(["5", "5"]);
  }, 120000);

  test("a write after the cell's place (9 | 5)", async () => {
    expect(await texts(P(`\${ const k: int = n + 0; }
let <c:int=(k + 0)/>
\${ @c = 9; }
<p id="r">\${@c}</p>
<p id="s">\${k}</p>`), ["r", "s"])).toEqual(["9", "5"]);
  }, 120000);

  test("a function reaching the binding that the seed never calls (5 | 5)", async () => {
    expect(await texts(P(`\${ function g() -> int { return k; } }
let <c:int=(n + 0)/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }
<p id="s">\${k}</p>`), ["r", "s"])).toEqual(["5", "5"]);
  }, 120000);

  test("a nested function declaration reaching it that is never called compiles (judged as body code is)", async () => {
    const es = await errors(P(`\${ function h() -> int {
    function inner() -> int { return k; }
    return 3;
} }
let <c:int=(h())/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }`));
    expect(es.map((d) => d.code)).toEqual([]);
  }, 120000);

  test("INTERIM: a persisted cell is not judged (its default is computed at construction, g-boot-persist-seed-at-construction-s482)", async () => {
    const at = await errors(P(`let <c:int=(k + 0) persist="local" key="t.seedreach.a"/>
<p id="r">\${@c}</p>
\${ const k: int = n + 0; }`));
    expect(at.map((d) => d.code)).toEqual([]);
    const early = await errors(P(`<p id="r">\${@c}</p>
\${ const k: int = n + 0; }
let <c:int=(k + 0) persist="local" key="t.seedreach.b"/>`));
    expect(early.map((d) => d.code)).toEqual([]);
  }, 120000);

  test("an event handler reading the cell early is not judged (g-boot-handler-reach-runs-binding-early-s482 stays open)", async () => {
    const es = await errors(P(`\${ let out: int = 0; }
<button id="b" onclick=\${ out = @c; }>go</button>
\${ const k: int = n + 0; }
let <c:int=(k + 0)/>`));
    expect(es.map((d) => d.code)).toEqual([]);
  }, 120000);
});
