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

// s480 r1 (#2028 review F1) — SPEC §5.5.4 "Exclusive wholesale ownership (Axiom ①)": "If a
// `class:name=` directive (§5.5.2) … also targets `class` on the SAME element, the compiler SHALL
// emit `E-ATTR-WRITER-CONFLICT` (§34) naming both sites". On ae5d75802 both orders compiled clean
// and the `class=` write erased the toggle at run time (in the `class:`-first order it was missing
// at mount).
describe("§5.5.4 — a computed `class=` beside `class:` is E-ATTR-WRITER-CONFLICT (r1 F1)", () => {
  test("`class=(…)` then `class:`, and `class:` then `class=(…)`: one report naming both sites", () => {
    for (const mk of [`<p class=(@lit ? "a" : "b") class:on=(!@lit)>x</p>`, `<p class:on=(!@lit) class=(@lit ? "a" : "b")>x</p>`]) {
      const ds = errs(fe(prog(mk)));
      expect(ds.map((d) => d.code)).toEqual(["E-ATTR-WRITER-CONFLICT"]);
      expect(ds[0].message).toContain("`class=`");
      expect(ds[0].message).toContain("`class:on=`");
    }
  });
  test("both writers changing (a bare `class=@c`, two toggles): still one report, naming every toggle", () => {
    const ds = errs(fe(`<program>
let <c:string="x"/>
let <lit:bool=false/>
function go() { @c = "y"; @lit = true; }
<button id="b" onclick=go()>go</button>
<p class=@c class:on=@lit class:off=(!@lit)>x</p>
</program>
`));
    expect(ds.map((d) => d.code)).toEqual(["E-ATTR-WRITER-CONFLICT"]);
    expect(ds[0].message).toContain("`class:on=`, `class:off=`");
  });
  test("inside `<each>` too", () => {
    expect(codes(prog(`<ul><each in=(["a"]) key=@.><li class=(@s is .A ? "a" : "b") class:on=@lit>x</li></each></ul>`))).toEqual(["E-ATTR-WRITER-CONFLICT"]);
  });
  test("a static `class=\"k\"` stays legal beside `class:` (§5.5.2)", () => {
    expect(codes(prog(`<p class="k" class:on=@lit>x</p>`))).toEqual([]);
  });
});

// s480 r1 (#2028 review F2) — ruling user-voice-scrml.md S480 "⭐ RULED — what a trap renders when
// "nothing" is not safe" item 1: "A trapped data-bound attribute: the element carrying it is the
// hole … the element is replaced by a placeholder, the trap is reported once, and the element is
// restored on recovery — on mount and on every re-run. Removing the element is the only state that
// is safe for every attribute". A `class:` toggle writes `class` (SPEC §19.17, §5.5.2). On
// ae5d75802 a trapping condition REMOVED the class and left the element in the page — a
// `class:hidden` / `class:blur` / `class:redacted` revealed what it hides.
describe("§19.17 — a trapping `class:` condition holds its element out (r1 F2)", () => {
  async function withReports(fn) {
    const reported = [];
    const saved = globalThis.reportError;
    globalThis.reportError = (e) => reported.push(e);
    try { await fn(reported); } finally { globalThis.reportError = saved; }
    return reported;
  }
  const codesOf = (reported) => reported.map((e) => e.code);
  // `@xs[@i]` traps (E-INDEX-OUT-OF-RANGE-RT) while @i is out of range: @i starts at 5;
  // `in` sets it to 1 (reads 20), `zero` to 0 (reads 10), `out` to 7.
  const trapProg = (view) => `<program>
    <xs:int[]=([10, 20])/>
    let <i:int=5/>
    let <lit:bool=false/>
    function into() { @i = 1; }
    function zero() { @i = 0; }
    function out() { @i = 7; }
    function flip() { @lit = !@lit; }
    <main>
        <button onclick=into()>in</button>
        <button onclick=zero()>zero</button>
        <button onclick=out()>out</button>
        <button onclick=flip()>flip</button>
        <div id="box">${view}<span id="sib">sib</span></div>
    </main>
</program>
`;
  const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
  const load = (src) => withReports(async () => { const r = fe(src); expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]); expect(mods.check.checkCore(r.core)).toEqual([]); await loadProgram(r.core, "s480-classdir-trap-" + k++); });

  test("at MOUNT: the element is held out (never shown without its `hidden` class), one report", async () => {
    const reported = await load(trapProg(`<p id="p" class="k" class:hidden=(@xs[@i] == 10)>secret</p>`));
    expect(codesOf(reported)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);   // ae5d75802: <p class="k"> shown
    expect($("#p")).toBeNull();
    expect($("#box").firstChild.nodeType).toBe(8);                    // the placeholder holds its place
    expect($("#sib").textContent).toBe("sib");
  });

  test("on a RE-RUN it leaves; recovery writes the class state, THEN re-inserts the same node in place", async () => {
    await load(trapProg(`<p id="p" class="k" class:hidden=(@xs[@i] == 10) class:on=@lit>secret</p>`));
    const later = await withReports(async () => {
      click(btn("zero"));
      const node = $("#p");
      expect(cls("#p")).toBe("hidden k");
      click(btn("out"));                                               // ae5d75802: <p class="k"> — revealed
      expect($("#p")).toBeNull();
      expect($("#box").querySelector(".k")).toBeNull();
      click(btn("flip"));                                              // a toggle while held: to its slot
      expect($("#p")).toBeNull();
      expect(node.classList.contains("on")).toBe(false);              // nothing written to a held element
      // recovery: the class is written while the node is still out, THEN it goes back
      const obs = new window.MutationObserver(() => {});
      obs.observe(node, { attributes: true });
      obs.observe($("#box"), { childList: true });
      click(btn("in"));
      const recs = obs.takeRecords().map((m) => m.type === "attributes" ? "class=" + (m.target.className) : (m.addedNodes.length && m.addedNodes[0] === node ? "inserted" : "other"));
      obs.disconnect();
      const at = recs.indexOf("inserted");
      expect(at).toBeGreaterThan(0);                                   // re-inserted, after …
      expect(recs.slice(0, at).every((r) => r.startsWith("class="))).toBe(true);   // … its class writes
      expect(recs.slice(at).some((r) => r.startsWith("class="))).toBe(false);     // nothing written once back
      expect($("#p")).toBe(node);                                      // the same node
      expect($("#box").firstChild).toBe(node);
      expect($("#box").childNodes.length).toBe(2);                     // the placeholder is gone
      expect(cls("#p")).toBe("k on");
    });
    expect(codesOf(later)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);      // reported once
  });

  test("with no trap the toggle is unchanged: written at once on a live element", async () => {
    const reported = await load(trapProg(`<p id="p" class="k" class:on=@lit>x</p>`));
    expect(reported).toEqual([]);
    expect(cls("#p")).toBe("k");
    click(btn("flip"));
    expect(cls("#p")).toBe("k on");
    click(btn("flip"));
    expect(cls("#p")).toBe("k");
  });
});

// s480 (s480-static-class, #2028 re-review LOW) — SPEC §5.5.2: "`class:` directives and a static
// `class=` attribute MAY coexist on the same element. The static class is always present; each
// `class:` directive independently adds or removes its named class." On c15225d88
// `<p class="hidden" class:hidden=@f>` rendered `<p class="">` at mount while `@f` was false — a
// static `hidden` stripped REVEALS what it hides. A class the static `class=` names is never removed
// by a `class:` toggle: on mount, on a re-run, while held by a trap, on restore, inside `<each>`.
describe("§5.5.2 — a `class:` toggle never removes a class the static `class=` names", () => {
  test("at MOUNT, the condition false: the static class is present", async () => {
    await run(prog(`<p id="p" class="hidden k" class:hidden=@lit>secret</p>`));
    expect(cls("#p")).toBe("hidden k");                                // c15225d88: "k"
  });

  test("the static list's whitespace (several spaces, a tab) still names the class", async () => {
    await run(prog(`<p id="p" class="a  hidden\tb" class:hidden=@lit>secret</p>`));
    expect(cls("#p")).toBe("a b hidden");
  });

  test("toggled true → false at run time: the static class stays", async () => {
    await run(prog(`<p id="p" class="hidden" class:hidden=(!@lit)>secret</p>`, `function go() { @lit = !@lit; }`));
    expect(cls("#p")).toBe("hidden");
    click($("#b"));
    expect(cls("#p")).toBe("hidden");                                  // c15225d88: ""
    click($("#b"));
    expect(cls("#p")).toBe("hidden");
  });

  test("inside `<each>`: every row keeps it, on mount and on each re-run", async () => {
    await run(prog(`<ul id="u"><each in=(["a", "b"]) key=@.><li class="hidden" class:hidden=@lit>\${@.}</li></each></ul>`, `function go() { @lit = !@lit; }`));
    const rows = () => [...document.querySelectorAll("#u li")].map((li) => li.className);
    expect(rows()).toEqual(["hidden", "hidden"]);                      // c15225d88: ["", ""]
    click($("#b"));
    expect(rows()).toEqual(["hidden", "hidden"]);
    click($("#b"));
    expect(rows()).toEqual(["hidden", "hidden"]);
  });

  test("held by a trap, then restored: it comes back WITH the static class; a trap still holds it out", async () => {
    const reported = [];
    const saved = globalThis.reportError;
    globalThis.reportError = (e) => reported.push(e);
    try {
      // `@xs[@i]` traps while @i is out of range (@i starts at 5); `in` → 1 (reads 20: false),
      // `zero` → 0 (reads 10: true), `out` → 7 (traps).
      const r = fe(`<program>
    <xs:int[]=([10, 20])/>
    let <i:int=5/>
    function into() { @i = 1; }
    function zero() { @i = 0; }
    function out() { @i = 7; }
    <main>
        <button onclick=into()>in</button>
        <button onclick=zero()>zero</button>
        <button onclick=out()>out</button>
        <div id="box"><p id="p" class="hidden" class:hidden=(@xs[@i] == 10)>secret</p><span id="sib">sib</span></div>
    </main>
</program>
`);
      expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
      await loadProgram(r.core, "s480-classdir-static-" + k++);
      const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
      expect($("#p")).toBeNull();                                      // held at mount (the trap rule is kept)
      expect(reported.map((e) => e.code)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
      click(btn("in"));                                                // restored with the condition false
      expect(cls("#p")).toBe("hidden");                                // c15225d88: ""
      click(btn("zero"));
      expect(cls("#p")).toBe("hidden");
      click(btn("out"));                                               // held again
      expect($("#p")).toBeNull();
      click(btn("in"));
      expect(cls("#p")).toBe("hidden");
    } finally { globalThis.reportError = saved; }
  });

  test("guard: a toggle naming a DIFFERENT class still removes its own class (the static one stays)", async () => {
    await run(prog(`<p id="p" class="Hidden" class:on=(!@lit) class:hidden=(!@lit)>x</p>`, `function go() { @lit = !@lit; }`));
    expect(cls("#p")).toBe("Hidden hidden on");
    click($("#b"));
    expect(cls("#p")).toBe("Hidden");                                  // `on` and `hidden` (class names are case-sensitive) go
    click($("#b"));
    expect(cls("#p")).toBe("Hidden hidden on");
  });
});
