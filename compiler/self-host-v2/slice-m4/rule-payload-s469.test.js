// rule-payload-s469.test.js — gap g-bootstrap-rule-transition-into-payload-variant-s469
// (found by the #1530 review): a `rule=` transition INTO a payload variant, written
// through a `!{ _ e :> @s = e }` handler, compiled clean and had NO EFFECT at run time —
// the runtime edge check compared the payload VALUE (`{ variant, data }`) against the
// edge table's variant TAGS (`.Dot → .[object Object]` was refused), and the state
// view tested the cell by identity (`=== "Box"`), so even a written payload value
// rendered no arm.
//
// Graded on the RUNTIME effect, not only on a clean compile: the cell's value after
// the write, and what the state view shows.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const clean = (src) => {
  const r = frontEnd(mods, [{ path: "t.scrml", src }]);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
const cell = (r, i) => [...r.rt.devtools.instances.values()].find((x) => x.decl.name === "program").fields[i].peek();

const SRC = `<program>
    type Shape:enum = { Dot, Box(w: int) }
    <s:Shape=.Dot single>
        <Dot rule=.Box : "dot">
        <Box rule=.Dot : "box">
    </>
    function mk()! Shape {
        fail .Box(3);
    }
    function grow() {
        mk() !{ _ e :> @s = e };
    }
    function back() {
        @s = .Dot;
    }
    <main>
        <p id="s"><*s/></p>
        <button onclick=grow()>grow</button>
        <button onclick=back()>back</button>
    </main>
</program>
`;

describe("a `rule=` transition into a payload variant (runtime effect)", () => {
  test("the write lands along the edge `.Dot → .Box`, and the state view shows the `Box` arm", async () => {
    const r = await loadProgram(clean(SRC).core, "rule-payload-1");
    expect($("#s").textContent).toBe("dot");
    click(btn("grow"));
    expect(cell(r, 0)).toEqual({ variant: "Box", data: [3] });
    expect($("#s").textContent).toBe("box");
    click(btn("back"));
    expect(cell(r, 0)).toBe("Dot");
    expect($("#s").textContent).toBe("dot");
    click(btn("grow"));
    expect($("#s").textContent).toBe("box");
  });
  test("the edge table still refuses a payload write that is NOT an edge", async () => {
    const src = SRC.replace(`<Dot rule=.Box : "dot">`, `<Dot rule=.Dot : "dot">`);
    const r = await loadProgram(clean(src).core, "rule-payload-2");
    let thrown = null;
    try { r.rt.checkEdge({ peek: () => "Dot" }, { Dot: ["Dot"], Box: ["Dot"] }, { variant: "Box", data: [3] }); } catch (e) { thrown = e; }
    expect(String(thrown)).toContain("E-ENGINE-INVALID-TRANSITION: .Dot → .Box");
    // a same-variant payload write is not an edge question (§51.0.F.1)
    expect(() => r.rt.checkEdge({ peek: () => ({ variant: "Box", data: [1] }) }, { Dot: [], Box: [] }, { variant: "Box", data: [2] })).not.toThrow();
  });
});
