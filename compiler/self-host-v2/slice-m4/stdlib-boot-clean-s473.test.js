// stdlib-boot-clean-s473.test.js — s473-stdlib-bootstrap-clean: the REAL stdlib modules that compile
// clean on the bootstrap, pinned one by one (the dispatch: "the slice-m4 test should pin each newly
// clean module as compiling clean on the bootstrap").
//
// A module is pinned by importing it through the stdlib driver exactly as `scrml-boot compile` does
// (slice-m2/lowered.js frontEndStdlib): it must be SUPPLIED (never withdrawn) and the program must
// compile with no Error and pass checkCore. The measurement of every module (clean / errors /
// crash, before and after) is docs/changes/s473-stdlib-bootstrap-clean/{baseline,after}.md, made by
// that directory's measure.ts.
//
// Rulings in force (scrml-support/user-voice-scrml.md): S471 "stdlib host bridge = option A; drop the
// stdlib `<program>` wrapper" — "I guess its ok to drop the <program> wrapper"; S472 "host function
// type …" item 1 (the wrapper rule — an `import:host` binding only as the callee of its fully typed
// wrapper's `return`); S469 E-PARAM-TYPE-REQUIRED (parameters are annotated).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, check } from "./server-artifact-harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import * as randomHost from "../../../stdlib/random/host.js";

const ENTRY = "app.scrml";
beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

const fe = (src) => frontEndStdlib(mods(), [{ path: ENTRY, src }], ENTRY);
const errors = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const refusedWhy = (r) => r.stdlib.refused.map((x) => `${x.module}: ` + x.diags.slice(0, 5).map((d) => `${d.code} ${d.file}: ${String(d.message).slice(0, 160)}`).join(" | "));
const clean = (src) => {
  const r = fe(src);
  expect(refusedWhy(r)).toEqual([]);
  expect(errors(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(check(r.core)).toEqual([]);
  return r;
};
let k = 0;

// module → one exported name an adopter imports (the import is checked against the module's exports,
// so the name must be real) and the files the driver supplies for it.
const CLEAN = [
  ["math", "floor", ["scrml:math/index.scrml"]],
  ["random", "randomInt", ["scrml:random/index.scrml"]],
];

describe("each pinned stdlib module compiles clean on the bootstrap (supplied, not withdrawn)", () => {
  for (const [mod, name, files] of CLEAN) {
    test(`scrml:${mod}`, () => {
      const r = clean(`<program>\n\${ import { ${name} } from "scrml:${mod}"; }\n</program>\n`);
      expect(r.stdlib.supplied.map((s) => [s.module, s.files])).toEqual([[mod, files]]);
    });
  }
});

describe("scrml:random on the bootstrap — host-backed wrappers, compiled and RUN", () => {
  const USER = `<program>
\${
    import { random, randomInt } from "scrml:random";
    function die() -> int { return randomInt(1, 6); }
    function unit() -> number { return random(); }
    function pinned() -> int { return randomInt(7, 7); }
    function swapped() -> int { return randomInt(6, 1); }
}
<main>
    <p id="d">\${die()}</p>
    <p id="u">\${unit()}</p>
    <p id="p">\${pinned()}</p>
    <p id="s">\${swapped()}</p>
</main>
</program>
`;
  test("both members are host-backed (a signature, no body), reached through stdlib/random/host.js", () => {
    const r = clean(USER);
    const hosted = r.core.fns.filter((f) => f.host != null).map((f) => [f.sym.hint, f.host.module, f.host.file, f.host.name]);
    expect(hosted).toEqual([["random", "random", "host.js", "random"], ["randomInt", "random", "host.js", "randomInt"]]);
    for (const f of r.core.fns.filter((x) => x.host != null)) expect(f.body.stmts).toEqual([]);
  });

  test("the page draws: a die roll in 1..6, a unit float in [0, 1), a single-value interval, swapped bounds normalized", async () => {
    const r = clean(USER);
    await loadProgram(r.core, "s473-rnd-" + k++);
    const n = (id) => Number(document.querySelector("#" + id).textContent);
    expect(Number.isInteger(n("d")) && n("d") >= 1 && n("d") <= 6).toBe(true);
    expect(n("u") >= 0 && n("u") < 1).toBe(true);
    expect(n("p")).toBe(7);
    expect(Number.isInteger(n("s")) && n("s") >= 1 && n("s") <= 6).toBe(true);
  });

  test("the host file itself: the moved ~{} assertions (closed interval, both endpoints reachable, swapped bounds)", () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = randomHost.randomInt(1, 6);
      expect(Number.isInteger(v) && v >= 1 && v <= 6).toBe(true);
      seen.add(v);
      const f = randomHost.random();
      expect(f >= 0 && f < 1).toBe(true);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(randomHost.randomInt(7, 7)).toBe(7);
    const s = randomHost.randomInt(6, 1);
    expect(s >= 1 && s <= 6).toBe(true);
  });
});
