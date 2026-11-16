// markup-in-logic-s478.test.js — s478-boot-markup-in-logic: MARKUP in a `${ if … }` logic block
// in markup, built on the Tier-0 `${ for … lift }` path (one path for markup-in-logic), and the
// §17.6.10.1 error for statement-position markup that would not render.
//
// Governing text:
//   §10.1: "When `lift` appears in an anonymous `${}` block whose parent is a markup or style
//   context, `lift` appends the value to the block's accumulator array." · §10.8.1: lifts
//   "accumulate in evaluation order" · §10.8.2: "When `lift` appears in an `if`/`else` body, only
//   the taken branch's `lift` calls SHALL be added to the accumulator. The not-taken branch SHALL
//   contribute zero values."
//   §17.6.10: "A control-flow statement that is the sole content of a markup `${…}` interpolation
//   and whose every branch is exactly one expression SHALL be a value-form" · "A branch body that is
//   exactly one expression SHALL be equivalent to `{ lift <expression> }`" · "When the `else` is
//   absent, the false path … SHALL render as nothing" · "A value-form SHALL re-evaluate reactively
//   on change of any reactive cell it reads."
//   §17.6.10.1: statement-position markup renders "as the single element of an `if` / `given`
//   branch (the implied `lift` above), or named by a `lift`"; otherwise E-MARKUP-STATEMENT-NOT-
//   RENDERED — including "`${ <p>hello</p> }`; two elements in one branch; an element after a
//   statement in a branch or block …; a `for` / `while` body without `lift`; … and markup in
//   statement position in a `function` body"; a single element beside a sibling branch that "is not
//   (it uses `lift`, or holds statements)" gets a message naming that cause; "A single-element branch
//   is a value-form in every markup `${…}` position, including a `${ if }` nested inside the element
//   of an enclosing single-element branch".
//   §7.2.2 rule 2: "`lift <…>` is a statement and takes `;`".
//   §49.9: E-LOOP-001 "`break` outside any loop", E-LOOP-002 "`continue` outside any loop".
//
// RED ON MAIN (213dd1203): every `${ if … }` holding markup was E-BOOTSTRAP-UNSUPPORTED ("lifting
// MARKUP is in the bootstrap only in a Tier-0 `${ for … }`") or a cascade of E-PARSE-EXPR (a
// single-element branch), and statement-position markup was E-BOOTSTRAP-UNSUPPORTED or E-PARSE-*.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 180000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(run(src)).map((d) => d.code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s478mil-" + k++, []);
const $ = (sel) => document.querySelector(sel);
const all = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);

const P = (body, top = "") => `<program>
    let <yes:boolean=true/>
    let <no:boolean=false/>
    let <n:int=0/>
    let <mode:string="a"/>
${top}
    <main>
${body}
        <button onclick={ @n = @n + 1; }>inc</button>
        <button onclick={ @mode = "b"; }>toB</button>
        <button onclick={ @mode = "c"; }>toC</button>
        <button onclick={ @yes = !@yes; }>flip</button>
    </main>
</program>
`;
// a markup `${ … }` whose error is the case: the cells it does not read are `_`-free reads elsewhere
const E = (body) => P(`${body}\n        <p>\${@yes}\${@no}\${@n}\${@mode}</p>`);
// the same, with `top` written at the `<program>` BODY TOP (§40.8; §17.3: "evaluated, not rendered")
const T = (top) => P(`        <p>\${@yes}\${@no}\${@n}\${@mode}</p>`, top);

// ---------------------------------------------------------------------------
describe("§17.6.10 — the value-form: a branch that is ONE element renders it", () => {
  test("if / else: the taken branch's element; the else-less false path renders nothing", async () => {
    await load(E(`        <div id="a">\${ if @yes { <p class="r">Admin</p> } else { <p class="r">User</p> } }</div>
        <div id="g">\${ if @no { <p class="r">Admin</p> } else { <p class="r">User</p> } }</div>
        <div id="ne">\${ if @yes { <p class="r">yes</p> } }</div>
        <div id="nf">\${ if (@no) { <p class="r">no</p> } }</div>`));
    expect(all("#a p.r")).toEqual(["Admin"]);
    expect(all("#g p.r")).toEqual(["User"]);
    expect(all("#ne p.r")).toEqual(["yes"]);
    expect($("#nf").children.length).toBe(0);
  });

  test("re-rendered when the condition's cell changes (§17.6.10 \"SHALL re-evaluate reactively\")", async () => {
    await load(E(`        <div id="a">\${ if @yes { <p class="r">on</p> } else { <p class="r">off</p> } }</div>`));
    expect(all("#a p.r")).toEqual(["on"]);
    click(btn("flip"));
    expect(all("#a p.r")).toEqual(["off"]);
    click(btn("flip"));
    expect(all("#a p.r")).toEqual(["on"]);
  });

  test("a value branch beside an element branch: the value renders as text (`{ e }` is `{ lift e; }`)", async () => {
    await load(E(`        <div id="m">\${ if @yes { "A" } else { <b>B</b> } }</div>`));
    expect($("#m").textContent).toBe("A");
    click(btn("flip"));
    expect(all("#m b")).toEqual(["B"]);
  });

  test("a `${ if }` nested inside the element of a single-element branch renders its own element", async () => {
    await load(E(`        <div id="x">\${ if (@n > -1) { <div class="o">outer \${ if (@n > -2) { <b>inner</b> } } tail</div> } }</div>`));
    expect(all("#x div.o b")).toEqual(["inner"]);
    expect($("#x div.o").textContent).toBe("outer inner tail");
  });

  test("an else-if chain of single elements", async () => {
    await load(E(`        <div id="c">\${ if (@mode == "a") { <i>a</i> } else if (@mode == "b") { <i>b</i> } else { <i>c</i> } }</div>`));
    expect(all("#c i")).toEqual(["a"]);
    click(btn("toB"));
    expect(all("#c i")).toEqual(["b"]);
    click(btn("toC"));
    expect(all("#c i")).toEqual(["c"]);
  });
});

// ---------------------------------------------------------------------------
describe("§10.1 / §10.8 — explicit `lift` in an `if` in markup: accumulation, taken branch only", () => {
  test("a chain whose taken arm does not change still re-renders the reads inside it; every arm is selected", async () => {
    await load(E(`        <div id="host">\${ if (@yes) { lift <p id="np">\${@n}</p>; } }</div>
        <div id="chain">\${ if (@mode == "a") { lift <p id="pa">a-\${@n}</p>; } else if (@mode == "b") { lift <p id="pb">b-\${@n}</p>; } else { lift <p id="pc">c-\${@n}</p>; } }</div>`));
    expect($("#np").textContent).toBe("0");
    click(btn("inc"));
    expect($("#np").textContent).toBe("1");
    expect($("#pa").textContent).toBe("a-1");
    click(btn("toB"));
    click(btn("inc"));
    click(btn("toC"));
    expect($("#np").textContent).toBe("2");
    expect([$("#pa"), $("#pb")]).toEqual([null, null]);
    expect($("#pc").textContent).toBe("c-2");
  });

  test("several lifts in a branch, after a statement, in evaluation order (§10.8.1)", async () => {
    await load(E(`        <div id="s">\${ if (@n > -1) { let k = 7; lift <p>one \${k}</p>; lift <p>two</p>; } else { lift <p>never</p>; } }</div>`));
    expect(all("#s p")).toEqual(["one 7", "two"]);
  });

  test("a branch may lift a VALUE beside markup", async () => {
    await load(E(`        <div id="v">\${ if @yes { lift "t"; lift <b>u</b>; } }</div>`));
    expect($("#v").textContent).toBe("tu");
  });

  test("a row's handler is an action position (it may write)", async () => {
    await load(E(`        <div id="h">\${ if @yes { lift <button onclick={ @n = 5; }>five</button>; } }</div>
        <p id="nn">\${@n}</p>`));
    click(btn("five"));
    expect($("#nn").textContent).toBe("5");
  });

  test("§7.2.2 rule 2: `lift <…>` takes its `;` (a single-element branch does not)", () => {
    expect(codes(E(`        <div>\${ if @yes { lift <p>x</p> } }</div>`))).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });

  test("§6.15: the block is a render position — a write in a branch is E-VALUE-WRITES-STATE", () => {
    expect(codes(E(`        <div>\${ if @yes { @n = 1; lift <p>x</p>; } }</div>`))).toContain("E-VALUE-WRITES-STATE");
  });

  test("§49.9: an unlabelled `break` / `continue` in the chain has no loop to leave (E-LOOP-001 / -002)", () => {
    expect(codes(E(`        <div>\${ if @yes { lift <p>x</p>; break; } }</div>`))).toEqual(["E-LOOP-001"]);
    expect(codes(E(`        <div>\${ if @yes { lift <p>x</p>; continue; } }</div>`))).toEqual(["E-LOOP-002"]);
    // a loop of its own inside the branch keeps its own `break`
    expect(codes(E(`        <div>\${ if @yes { for (i of 0..3) { if (i == 1) { break; } } lift <p>x</p>; } }</div>`))).toEqual([]);
  });

  test("a value-form `${ if }` with no markup stays the expression value-form (unchanged)", async () => {
    await load(E(`        <p id="t">\${ if @yes { "Admin" } else { "User" } }</p>`));
    expect($("#t").textContent).toBe("Admin");
  });
});

// ---------------------------------------------------------------------------
describe("§17.6.10.1 — statement-position markup that would not render is E-MARKUP-STATEMENT-NOT-RENDERED", () => {
  const one = (src) => {
    const r = run(src);
    const es = errs(r);
    return { codes: es.map((d) => d.code), texts: es.map((d) => src.slice(d.span.start, d.span.end)), msgs: es.map((d) => d.message) };
  };

  test("a single element beside a sibling that lifts: the message names that cause", () => {
    const o = one(E(`        <div>\${ if @yes { <p>a</p> } else { lift <p>b</p>; } }</div>`));
    expect(o.codes).toEqual(["E-MARKUP-STATEMENT-NOT-RENDERED"]);
    expect(o.texts).toEqual(["<p>a</p>"]);
    expect(o.msgs[0]).toContain("sibling branch");
    expect(o.msgs[0]).toContain("single-element branch renders only when every branch is one");
  });

  test("two elements in one branch; an element after a statement; a `for` body without `lift`", () => {
    expect(one(E(`        <div>\${ if @yes { <p>a</p> <p>b</p> } }</div>`)).texts).toEqual(["<p>a</p>", "<p>b</p>"]);
    expect(one(E(`        <div>\${ if @yes { let k = 1; <p>after</p> } }</div>`)).texts).toEqual(["<p>after</p>"]);
    const f = one(E(`        <ul>\${ for (x of 0..2) { <li>\${x}</li> } }</ul>`));
    expect(f.codes).toEqual(["E-MARKUP-STATEMENT-NOT-RENDERED"]);
    expect(f.msgs[0]).toContain("is not rendered");
    expect(f.msgs[0]).toContain("lift <tag>");
  });

  test("`${ <p>hello</p> }` in markup (the SPEC's own first shape); a second element after it", () => {
    const o = one(E(`        <div>\${ <p>hello</p> }</div>`));
    expect(o.codes).toEqual(["E-MARKUP-STATEMENT-NOT-RENDERED"]);
    expect(o.texts).toEqual(["<p>hello</p>"]);
    expect(o.msgs[0]).toContain("lift <tag>");
    expect(one(E(`        <div>\${ <p>a</p> <p>b</p> }</div>`)).texts).toEqual(["<p>a</p>", "<p>b</p>"]);
  });

  test("a body-top `${ <p>hello</p> }` — evaluated, not rendered (§17.3) — names the body as the fix", () => {
    const o = one(T(`    \${ <p>hello</p> }`));
    expect(o.codes).toEqual(["E-MARKUP-STATEMENT-NOT-RENDERED"]);
    expect(o.texts).toEqual(["<p>hello</p>"]);
    expect(o.msgs[0]).toContain("evaluated, not rendered");
  });

  test("markup in a `function` / `server function` body in a logic block: `return` it (§10.4)", () => {
    for (const kw of ["function", "server function"]) {
      const o = one(T(`    \${ ${kw} f() -> int { <p>fn</p> return 1; } }`));
      expect(o.codes).toEqual(["E-MARKUP-STATEMENT-NOT-RENDERED"]);
      expect(o.msgs[0]).toContain("`return` the markup");
    }
  });

  test("§10.4: `lift` of markup in a bare `function` body is E-SYNTAX-002 (unchanged)", () => {
    expect(codes(T(`    \${ function g() -> int { lift <p>g</p>; return 1; } }`))).toEqual(["E-SYNTAX-002"]);
  });

  test("§4.15: a locus-bound structural element in a logic block is E-STRUCTURAL-ELEMENT-MISPLACED, not this error", () => {
    expect(codes(T(`    \${ <onTimeout after=30s to=.Idle/> }`))).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
    expect(codes(E(`        <div>\${ if @yes { <onIdle after=5s to=.Idle/> } }</div>`))).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
  });

  test("a §66 declaration in a logic block is not markup: not this error", () => {
    expect(codes(T(`    \${ <z=1/> }`))).not.toContain("E-MARKUP-STATEMENT-NOT-RENDERED");
  });
});

// ---------------------------------------------------------------------------
describe("held back (INTERIM, refused by name) — a body-top `${ … }` that would render", () => {
  // §17.3 (S449): a body-top `${ … }` "is a statement list, evaluated, not rendered", and
  // §17.6.10.1 renders only a value-form in a MARKUP interpolation — but the conformance corpus
  // (type-state-codes/e-type-045-*, element-refusal/*-neg) reads these as rendered. Owner question.
  test("`${ if (c) { <p/> } }` and `${ lift <p/>; }` at a body top stay E-BOOTSTRAP-UNSUPPORTED", () => {
    expect(codes(T(`    \${ if (@yes) { <p>held</p> } }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(T(`    \${ lift <p>held</p>; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
