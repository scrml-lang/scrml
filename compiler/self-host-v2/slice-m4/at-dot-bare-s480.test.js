// at-dot-bare-s480.test.js — s480-boot-cheap-wins item 2: a bare `@.` (g-boot-at-dot-bare-unparsed-s480).
//
// SPEC §17.7.3: "Inside the body, `@.` refers to the current item. `@.field` accesses a field of
// the current item." A bare `@.` is the item as a whole value — `<li>${@.}</li>` over a tape of
// strings, an argument `f(@.)`, an attribute value `title=@.`.
//
// Before (red on base): parseAt consumed only the `@` and left the `.` to the postfix loop, which
// read it as a member dot with no name — every bare use failed (E-PARSE-EXPECTED "expected `}`,
// found `.`" + E-PARSE-TRAILING; `f(@.)` "expected `)`"; `title=@.` E-ATTR-UNQUOTED-OPERATOR).
// `@.name` (a member read of the item) was already built and is unchanged.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const $$ = (sel) => [...document.querySelectorAll(sel)];
let k = 0;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s480-atdot-" + k++);
  return r;
}

describe("§17.7.3 — a bare `@.` is the current `<each>` item", () => {
  test("in an interpolation, an argument and an attribute value; `@.length` still a member read", async () => {
    await run(`<program>
<items:string[replace]=(["ab", "c"])/>
fn up(s: string) -> string { return s.toUpperCase(); }
function go() { @items = ["ab", "c", "def"]; }
<button id="b" onclick=go()>go</button>
<ul>
<each in=@items>
<li class="r" title=@.>\${@.}|\${up(@.)}|\${@.length}</li>
</each>
</ul>
</program>
`);
    expect($$(".r").map((li) => li.textContent)).toEqual(["ab|AB|2", "c|C|1"]);
    expect($$(".r").map((li) => li.getAttribute("title"))).toEqual(["ab", "c"]);
    click(document.querySelector("#b"));
    expect($$(".r").map((li) => li.textContent)).toEqual(["ab|AB|2", "c|C|1", "def|DEF|3"]);
  });

  test("`@.` beside a spaced operator reads whole (`@. + \"!\"`, `@. == \"c\"`)", async () => {
    await run(`<program>
<items:string[replace]=(["ab", "c"])/>
<ul>
<each in=@items>
<li class="r">\${@. + "!"} \${@. == "c" ? "yes" : "no"}</li>
</each>
</ul>
</program>
`);
    expect($$(".r").map((li) => li.textContent)).toEqual(["ab! no", "c! yes"]);
  });
});
