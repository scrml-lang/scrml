// lift-cell-arm-s473.test.js — s473-lift-cell-ref-scope: `lift <cell read>` as a value-position
// arm's yield (flogence S60 delta [594]: impl#1 refused `lift @x` / `lift (@x)` with E-SCOPE-001
// on the keyword `lift`).
//
// SPEC §18.5 (S469): "A block arm in a VALUE position — a `match` or `!{}` whose result is used
// (§18.9, §19.4.3) — yields its value with **`lift <expr>;`**". A cell read is an expression.
//
// The bootstrap reads every shape already; these pin it (front end clean, and the arm's value
// executed into the target), so the centre of gravity cannot regress to impl#1's refusal.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const prog = (decls, body) => `<program>\n${decls}\n    <main>\n${body}\n    </main>\n</program>\n`;
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s473lift-" + k++, []);
const $ = (sel) => document.querySelector(sel);

const L = `    type LoadError:enum = { NotFound(id: string), Timeout }
    type S:struct = { n: int }
    let <x:int=7/>
    let <s:S=({ n: 2 })/>
    function load(id: string)! LoadError {
        if (id == "bad") fail LoadError.NotFound(id);
        return 5;
    }`;
const VIEW = `        <p id="o">\${@x}</p>\n        <button id="bad" onclick=go("bad")>bad</button>\n        <button id="ok" onclick=go("ok")>ok</button>`;
const FORMS = {
  "a cell write `@x = load(id) !{ _ e :> … }`": (arm) => `    function go(id: string) {\n        @x = load(id) !{ _ e :> ${arm} };\n    }`,
  "a `const` binding": (arm) => `    function go(id: string) {\n        const r = load(id) !{ _ e :> ${arm} };\n        @x = r;\n    }`,
  "a failable `match` arm": (arm) => `    function go(id: string) {\n        @x = match load(id) {\n            .Ok(v) :> v,\n            _ :> ${arm}\n        };\n    }`,
};
const ARMS = {
  "`{ lift @x; }`": ["{ lift @x; }", "7"],
  "`{ lift (@x); }`": ["{ lift (@x); }", "7"],
  "`{ lift @s.n; }`": ["{ lift @s.n; }", "2"],
  "`{ lift @x + 1; }`": ["{ lift @x + 1; }", "8"],
};

describe("`lift <cell read>` yields a value-position arm (§18.5)", () => {
  for (const [form, f] of Object.entries(FORMS)) {
    for (const [name, [arm, want]] of Object.entries(ARMS)) {
      test(`${form}, ${name}: clean, and the failure arm's value lands (${want})`, async () => {
        await load(prog(L + "\n" + f(arm), VIEW));
        expect($("#o").textContent).toBe("7");
        click($("#bad"));
        expect($("#o").textContent).toBe(want);
        click($("#ok"));
        expect($("#o").textContent).toBe("5");
      });
    }
  }
  test("a plain `${ for … { lift @x; } }` reads the same operands (comparison)", () => {
    for (const e of ["@x", "(@x)", "@s.n", "@x + 1"]) {
      expect([e, codes(prog(L, `        <p>\${ for (i of [1]) { lift ${e}; } }</p>`))]).toEqual([e, []]);
    }
  });
});
