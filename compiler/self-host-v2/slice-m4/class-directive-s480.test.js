// class-directive-s480.test.js — s480-boot-cheap-wins item 4: `class:name=cond` (g-boot-class-directive-unbuilt-s480).
//
// SPEC §5.5.2: "The `class:` prefix directive conditionally applies a single named class based on a
// boolean expression. The expression is evaluated at mount time and re-evaluated whenever any
// reactive variable it references changes." · "The right-hand side SHALL be any of: an `@`-prefixed
// reactive variable, a property access expression (`obj.prop`), a parenthesized boolean expression
// (`(a == b)`), or a function call (`fn()`). A plain unqualified bare identifier (no `@`, no dot)
// SHALL be a compile error (E-ATTR-013). A string literal SHALL be a compile error (E-ATTR-013)." ·
// E-ATTR-013's row: "… or has no value". · "The compiler SHALL emit client-side wiring that calls
// `classList.toggle(name, !!condition)` on the target element when any dependency changes." · "The
// class named in the directive SHALL be applied on initial mount if the expression is truthy at
// mount time. It SHALL be absent on initial mount if the expression is falsy." · "Multiple `class:`
// directives MAY appear on the same element. Each is independent." · "`class:` directives and a
// static `class=` attribute MAY coexist on the same element. The static class is always present" ·
// "The `class:` form does NOT appear in the HTML output."
//
// The value is a CONDITION, typed as `show=`'s (a `bool`, or a `T | not` presence test; anything
// else E-COND-NOT-BOOLEAN — S440 "a condition has no truthiness"): a PA reading, owner question in
// the PR. The DOM write matches impl#1's (`classList.toggle(name, !!v)` on mount and on change —
// samples/compilation-tests/reactive-018-class-binding.scrml).
//
// Before (red on base): every `class:` directive was E-BOOTSTRAP-UNSUPPORTED "`class:active` is not
// in bootstrap slice M2" (analyze.scrml resolveHtml).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const $ = (sel) => document.querySelector(sel);
const cls = (sel) => [...$(sel).classList].sort().join(" ");
let k = 0;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s480-classdir-" + k++);
  return r;
}

const prog = (markup, fns = "function go() { }") => `<program>
type S:enum = { A, B }
type T:struct = { done: bool }
let <lit:bool=false/>
let <s:S=.A/>
let <n:int | not=(not)/>
let <cnt:int=0/>
let <todo:T=({ done: false })/>
fn big() -> bool { return @cnt > 1; }
${fns}
<button id="b" onclick=go()>go</button>
${markup}
</program>
`;

describe("§5.5.2 — `class:name=cond` toggles one class (run)", () => {
  test("each form — `@cell`, `obj.prop`, `(expr)`, `fn()`, a `T | not` presence — beside a static class, independently", async () => {
    await run(prog(`<p id="p" class="base" class:active=@lit class:done=@todo.done class:bee=(@s is .B) class:has=@n class:big=big()>x</p>`,
      `function go() { @lit = true; @s = .B; @n = 1; @cnt = 2; @todo = { done: true }; }`));
    expect(cls("#p")).toBe("base");
    expect($("#p").getAttributeNames().filter((n) => n.startsWith("class:"))).toEqual([]);
    click($("#b"));
    expect(cls("#p")).toBe("active base bee big done has");
  });

  test("the class follows its condition both ways; the static class stays", async () => {
    await run(prog(`<p id="p" class="keep" class:on=@lit>x</p>`, `function go() { @lit = !@lit; }`));
    expect(cls("#p")).toBe("keep");
    click($("#b"));
    expect(cls("#p")).toBe("keep on");
    click($("#b"));
    expect(cls("#p")).toBe("keep");
  });

  test("applied on mount when the condition already holds", async () => {
    await run(prog(`<p id="p" class:on=(!@lit)>x</p>`));
    expect(cls("#p")).toBe("on");
  });
});

describe("§5.5.2 — the codes", () => {
  test("E-ATTR-013: a bare identifier, a string literal, no value", () => {
    expect(codes(prog(`<p class:x=cnt>x</p>`))).toEqual(["E-ATTR-013"]);
    expect(codes(prog(`<p class:x="yes">x</p>`))).toEqual(["E-ATTR-013"]);
    expect(codes(prog(`<p class:x>x</p>`))).toEqual(["E-ATTR-013"]);
  });
  test("the value is a condition: a non-`bool` is E-COND-NOT-BOOLEAN", () => {
    expect(codes(prog(`<p class:x=(@cnt)>x</p>`))).toEqual(["E-COND-NOT-BOOLEAN"]);
  });
});
