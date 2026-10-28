// stdlib-s471.test.js — s471-bootstrap-stdlib-import step 3/4: a `scrml:` stdlib
// module joins the compile AS SOURCE through the front end's ordinary module path
// (slice-m2/lowered.js `frontEndStdlib`; link.scrml `importTarget` resolves
// `scrml:NAME` to `scrml:NAME/index.scrml` / `scrml:NAME.scrml`), so a module is
// importable BY CONSTRUCTION when the bootstrap compiles its source — and one it
// does not compile is withdrawn and its import refused BY NAME.
//
// The real stdlib (stdlib/**) compiles on the bootstrap nowhere yet (every module
// is the pre-§66 dialect inside a top-level `<program>` — see
// docs/changes/s471-bootstrap-stdlib-import/progress.md), so the mechanism is
// proven over a FIXTURE stdlib root (src/stdlib-s471/: ruled-dialect modules in
// the directory form, the file form, one importing another, one that does not
// compile, one that imports that one). The real-stdlib refusal is pinned too.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { mods, check, serve, post, pathOf, bridge, spyDriver } from "./server-artifact-harness.js";
import { frontEndStdlib, stdlibSources } from "../slice-m2/lowered.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

const FIXTURE = join(import.meta.dir, "src", "stdlib-s471");
const ENTRY = "app.scrml";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (globalThis.document) globalThis.document.cookie = "scrml_csrf=; Max-Age=0; Path=/";
  expectNoPageErrors();
});

const fe = (src, root = FIXTURE) => frontEndStdlib(mods(), [{ path: ENTRY, src }], ENTRY, { stdlibRoot: root });
const errors = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const clean = (src) => {
  const r = fe(src);
  expect(errors(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(check(r.core)).toEqual([]);
  return r;
};
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
let k = 0;

describe("a stdlib module that compiles on the bootstrap is importable — client side", () => {
  const SRC = `<program>
\${ import { greet } from "scrml:greet"; import { double } from "scrml:calc"; import { welcome } from "scrml:welcome"; }
let <name:string="world"/>
let <n:int=21/>
<main>
    <p id="g">\${greet(@name)}</p>
    <p id="d">\${double(@n)}</p>
    <p id="w">\${welcome("ann")}</p>
    <button id="more" onclick={ @n = double(@n); @name = "scrml"; }>more</button>
</main>
</program>
`;
  test("the directory form, the file form, and a module importing a module resolve; each module's files are supplied once", () => {
    const r = clean(SRC);
    expect(r.stdlib.refused).toEqual([]);
    expect(r.stdlib.supplied.map((s) => [s.module, s.files])).toEqual([
      ["greet", ["scrml:greet/index.scrml", "scrml:greet/shout.scrml"]],
      ["calc", ["scrml:calc.scrml"]],
      ["welcome", ["scrml:welcome/index.scrml"]],
    ]);
    expect(r.stdlib.sources.map((s) => s.path).sort()).toEqual(["scrml:calc.scrml", "scrml:greet/index.scrml", "scrml:greet/shout.scrml", "scrml:welcome/index.scrml"]);
  });

  test("compiled and RUN: the imported functions compute in the page, and on a write", async () => {
    const r = clean(SRC);
    await loadProgram(r.core, "s471-c-" + k++);
    const $ = (s) => document.querySelector(s).textContent;
    expect([$("#g"), $("#d"), $("#w")]).toEqual(["Hello, WORLD!", "42", "Hello, ANN! Welcome."]);
    click(document.querySelector("#more"));
    await settle();
    expect([$("#g"), $("#d")]).toEqual(["Hello, SCRML!", "84"]);
  });
});

describe("a stdlib module that compiles on the bootstrap is importable — server side", () => {
  const SQ = "?" + "{";
  const SRC = `<program db="./app.db">
\${ import { greet } from "scrml:greet"; }
type Row:struct = { name: string }
let <out:string=""/>
function hello(id: int) -> string {
    const r: Row = ${SQ}\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
    return greet(r.name);
}
<main>
    <button id="go" onclick={ @out = hello(1) !{ .Transport(t) :> return }; }>go</button>
    <p id="out">\${@out}</p>
</main>
</program>
`;
  test("a server function calls the imported function: the route answers with its value, and the client shows it", async () => {
    const r = clean(SRC);
    const spy = spyDriver(() => [{ name: "bo" }]);
    const { srv, routes, js } = await serve(r.core, spy.fn);
    expect(js).toMatch(/function greet\(/);
    const res = await post(srv, pathOf(routes, "hello"), [1]);
    expect([res.status, res.json]).toEqual([200, "Hello, BO!"]);
    await loadProgram(r.core, "s471-s-" + k++);
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#go"));
    await settle();
    expect(document.querySelector("#out").textContent).toBe("Hello, BO!");
  });
});

describe("a stdlib module the bootstrap does not compile is withdrawn; its import is refused by name", () => {
  test("its own errors never reach the user: ONE E-BOOTSTRAP-UNSUPPORTED at the import, naming the module", () => {
    const src = `<program>\n\${ import { loud } from "scrml:broken"; }\n<p>\${loud("x")}</p>\n</program>\n`;
    const r = fe(src);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", ENTRY]]);
    expect(r.diags[0].message).toContain("`scrml:broken`");
    expect(r.stdlib.refused.map((x) => [x.module, x.direct])).toEqual([["broken", true]]);
    expect(r.stdlib.refused[0].diags.length).toBeGreaterThan(0);
    expect(r.stdlib.refused[0].diags.every((d) => d.file === "scrml:broken/index.scrml")).toBe(true);
  });

  test("a module importing a withdrawn one is withdrawn too (a fixpoint); a sound sibling import still works", () => {
    const src = `<program>\n\${ import { lean } from "scrml:leans"; import { double } from "scrml:calc"; }\n<p>\${lean(" a ")} \${double(2)}</p>\n</program>\n`;
    const r = fe(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("`scrml:leans`");
    expect(r.stdlib.refused.map((x) => [x.module, x.direct])).toEqual([["broken", false], ["leans", true]]);
    expect(r.stdlib.supplied.map((s) => s.module)).toEqual(["calc"]);
  });

  test("a module with no file under the root, the deferred `scrml:compiler` family, and a name that is not a stdlib name are not supplied", () => {
    const sup = (from) => stdlibSources(mods(), [{ path: ENTRY, src: `<program>\n\${ import { x } from "${from}"; }\n</program>\n` }], { stdlibRoot: FIXTURE }).sources;
    expect(sup("scrml:nope")).toEqual([]);
    expect(sup("scrml:compiler")).toEqual([]);
    expect(sup("scrml:../slice-m4")).toEqual([]);
    expect(sup("scrml:greet/../calc")).toEqual([]);
  });

  test("a project file may not be named under the stdlib prefix — a named refusal (s472 F2; was a driver throw)", () => {
    const r = frontEndStdlib(mods(), [{ path: "scrml:greet/index.scrml", src: "${ }" }, { path: ENTRY, src: "<program>\n</program>\n" }], ENTRY, { stdlibRoot: FIXTURE });
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", "scrml:greet/index.scrml"]]);
    expect(r.diags[0].message).toContain("stdlib prefix");
    expect(r.core).toBe(null);
  });
});

describe("the REAL stdlib today: no module compiles on the bootstrap, so each import is refused by name", () => {
  test("`scrml:format` (the s471 symptom): one E-BOOTSTRAP-UNSUPPORTED at the import, no E-SCOPE-001 at the use", () => {
    const src = `<program>\n\${ import { slug } from "scrml:format"; }\nlet <title:string="Hello World"/>\n<p>\${slug(@title)}</p>\n</program>\n`;
    const r = frontEndStdlib(mods(), [{ path: ENTRY, src }], ENTRY);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", ENTRY]]);
    expect(r.stdlib.refused.find((x) => x.direct).module).toBe("format");
  });
});
