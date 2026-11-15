// attr-forms-s478.test.js — s478-boot-attr-values: the attribute-value forms of SPEC §5.2.1 /
// §5.2.3 / §5.2.4 in the bootstrap (cluster C2a of the S478 conformance triage).
//
// SPEC, verbatim:
//   §5.2.1  "`onclick=${expr}` on an event attribute SHALL use the `${...}` expression directly as the
//           event handler, with `@var` references rewritten to reactive getters."
//   §5.2    "An unquoted value is read WHOLE (S457). An unquoted (undelimited) attribute value is read to
//           its end — never cut short with its tail dropped or turned into further attributes." An
//           event-handler value "is ONE expression and continues across whitespace wherever the
//           expression does … `onclick=@count = @count + 1`"; "any other attribute followed by an
//           operator (`title=@a + "x"`, …) is `E-ATTR-UNQUOTED-OPERATOR` … A `;` after it is
//           `E-ATTR-MULTI-STATEMENT` (§5.2.4)"; "text after it that cannot begin an attribute
//           (`onclick=fn() (g)`, `title=x "y"`) is `E-ATTR-UNQUOTED-OPERATOR`; and … an event-handler
//           EXPRESSION (an assignment or operator form) followed by `>` after inline whitespace —
//           `<button onclick=@big = @n > 1>` — is `E-ATTR-UNQUOTED-OPERATOR` too".
//   §5.2.3  "A BARE event-handler value that contains a `;` outside of expression-internal contexts … is
//           compile error `E-MULTI-STATEMENT-HANDLER`"; "A multi-statement `:`-shorthand body is still
//           `E-MULTI-STATEMENT-HANDLER`".
//   §5.2.4  "A `(…)`, `{…}` or `${…}` value of an attribute that is not an event handler … SHALL be
//           exactly one expression. When it holds two or more statements, the compiler SHALL report
//           E-ATTR-MULTI-STATEMENT"; "A trailing `;` after the one expression (`${ f(); }`) does not make
//           a second statement."
//
// The `${…}` value has no lowering of its own: a non-handler `name=${e}` is the value `name=(e)`, a
// handler's `${e}` / `${() => e}` the listener `name=(e)`, a handler's `${ s1; s2 }` the inline block
// `name={ s1; s2 }` — so every interpolated value takes the one escape path the bootstrap already has
// (pinned below by byte-identical output). A handler function that takes the event object, or has a
// braced body, is the function-values slice (g-bootstrap-function-values-slice-s451): refused by name.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const prog = (body) => `<program>\nlet <count:int=0/>\nlet <last=""/>\nlet <ok=true/>\nfunction track(name: string) { @last = name; }\n${body}\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const printed = (src) => mods.print.printProgram(clean(src).core, "t.client.js", "scrml-runtime.js");
const $ = (sel) => document.querySelector(sel);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s478attr-" + k++, []);

// ---------------------------------------------------------------------------
describe("1 — the forms compile and RUN (click a handler, check the effect)", () => {
  test("`onclick=@count = @count + 1` is read WHOLE: two clicks add two", async () => {
    await load(prog(`<button id="b" onclick=@count = @count + 1>add</>\n<p id="o">\${@count}</p>`));
    click($("#b"));
    click($("#b"));
    expect($("#o").textContent).toBe("2");
  });
  test("`onclick=${() => @count = @count + 1}` — the §5.2.1 expression form (one arrow expression)", async () => {
    await load(prog(`<button id="b" onclick=\${() => @count = @count + 1}>+</>\n<p id="o">\${@count}</p>`));
    click($("#b"));
    click($("#b"));
    expect($("#o").textContent).toBe("2");
  });
  test("`onclick=${track(\"x\")}` — a non-function `${…}` value is the compiler-written listener", async () => {
    await load(prog(`<button id="b" onclick=\${track("x")}>t</>\n<p id="o">\${@last}</p>`));
    expect($("#o").textContent).toBe("");
    click($("#b"));
    expect($("#o").textContent).toBe("x");
  });
  test("`onclick=${ track(\"y\"); @count = 5; }` — a handler's `${…}` statement list runs every statement in order", async () => {
    await load(prog(`<button id="b" onclick=\${ track("y"); @count = @count + 5; }>t</>\n<p id="o">\${@last}:\${@count}</p>`));
    click($("#b"));
    expect($("#o").textContent).toBe("y:5");
  });
  test("a bare ternary assignment `onclick=@last = @ok ? \"y\" : \"n\"` continues across `?` and `:`", async () => {
    await load(prog(`<button id="b" onclick=@last = @ok ? "y" : "n">t</>\n<p id="o">\${@last}</p>`));
    click($("#b"));
    expect($("#o").textContent).toBe("y");
  });
  test("a whole read stops at the next attribute: `onclick=@count = @count + 1 id=\"b\"` keeps `id`", async () => {
    await load(prog(`<button onclick=@count = @count + 1 id="b">add</>\n<p id="o">\${@count}</p>`));
    click($("#b"));
    expect($("#o").textContent).toBe("1");
  });
  test("a non-handler `title=${@last}` tracks the cell", async () => {
    await load(prog(`<button id="b" onclick=\${track("hi")}>t</>\n<p id="e" title=\${@last}>a</p>`));
    expect($("#e").getAttribute("title")).toBe("");
    click($("#b"));
    expect($("#e").getAttribute("title")).toBe("hi");
  });
  test("a handler `${ if (…) { … } else { … } }` is the `if` statement (not a value-`if` with assignment arms)", async () => {
    await load(prog(`<button id="b" onclick=\${ if (@ok) { @last = "yes"; } else { @last = "no"; } }>go</>\n<p id="o">\${@last}</p>`));
    click($("#b"));
    expect($("#o").textContent).toBe("yes");
  });
});

// ---------------------------------------------------------------------------
describe("2 — one lowering: an interpolated value is escaped on the existing path", () => {
  test("`title=${@last}` prints byte-identically to `title=(@last)`", () => {
    const a = printed(prog(`<p id="e" title=\${@last}>a</p>`));
    const b = printed(prog(`<p id="e" title=(@last)>a</p>`));
    expect(a.js).toBe(b.js);
    expect(a.html).toBe(b.html);
  });
  test("handler `${…}` forms print byte-identically to the forms they are", () => {
    const pairs = [
      [`<button onclick=\${track("x")}>t</>`, `<button onclick=(track("x"))>t</>`],
      [`<button onclick=\${() => @count = @count + 1}>t</>`, `<button onclick=(@count = @count + 1)>t</>`],
      [`<button onclick=\${ track("y"); @count = 5; }>t</>`, `<button onclick={ track("y"); @count = 5; }>t</>`],
    ];
    for (const [x, y] of pairs) expect(printed(prog(x)).js).toBe(printed(prog(y)).js);
  });
  test("an interpolated value carrying markup is set as TEXT — no element is created, the quote does not close the attribute", async () => {
    const evil = `\\"><img id=pwn src=x onerror=alert(1)>`;
    await load(prog(`<button id="b" onclick=\${track("${evil}")}>t</>\n<p id="e" title=\${@last}>a</p>`));
    click($("#b"));
    expect($("#e").getAttribute("title")).toBe(`"><img id=pwn src=x onerror=alert(1)>`);
    expect($("#pwn")).toBe(null);
    expect(document.querySelectorAll("img").length).toBe(0);
  });
  test("a static interpolated value is set as text too (a JS string literal, never HTML)", async () => {
    await load(prog(`<p id="e" title=\${"a\\"><b>x"}>a</p>`));
    expect($("#e").getAttribute("title")).toBe(`a"><b>x`);
    expect(document.querySelectorAll("b").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("3 — the named codes", () => {
  test("E-MULTI-STATEMENT-HANDLER: a bare `;` sequence on a handler — once, the tail not read as attributes", () => {
    for (const v of [`startGame(); track("start")`, `@count = 0; track("reset")`, `@count = @count + 1; track("go")`, `track("a");track("b")`]) {
      const c = codes(prog(`function startGame() { @count = 1; }\n<button onclick=${v}>Begin</>`));
      expect(c).toEqual(["E-MULTI-STATEMENT-HANDLER"]);
    }
  });
  test("E-MULTI-STATEMENT-HANDLER: a multi-statement `:`-shorthand body (§4.14)", () => {
    expect(codes(prog(`<li : track("a"); track("b")>`))).toEqual(["E-MULTI-STATEMENT-HANDLER"]);
  });
  test("an inline block or a handler `${…}` statement list never fires it", () => {
    expect(codes(prog(`<button onclick={ track("a"); track("b"); }>x</>`))).toEqual([]);
    expect(codes(prog(`<button onclick=\${ track("a"); track("b"); }>x</>`))).toEqual([]);
  });
  test("E-ATTR-MULTI-STATEMENT: `(…)`, `{…}`, `${…}` and a bare `;` on a non-handler attribute — once, naming the attribute", () => {
    for (const v of [`(track("a"); "t")`, `{track("a"); "t"}`, `\${track("a"); "t"}`, `\${ if (@ok) { track("a"); } "t" }`, `track("a"); "t"`]) {
      const e = errs(prog(`<p title=${v}>x</p>`));
      expect(e.map((d) => d.code)).toEqual(["E-ATTR-MULTI-STATEMENT"]);
      expect(e[0].message).toContain("title=");
    }
  });
  test("a non-handler statement list that does not parse keeps the parse's own report (no E-ATTR-MULTI-STATEMENT on top)", () => {
    const c = codes(`type Phase:enum = { Idle, Busy }\n<program>\nlet <phase:Phase=.Idle/>\n<p if=\${switch (@phase) { case .Idle: true }}>Idle</>\n</program>\n`);
    expect(c).toContain("E-SWITCH-FORBIDDEN");
    expect(c).not.toContain("E-ATTR-MULTI-STATEMENT");
  });
  test("one expression the bootstrap cannot parse is that expression's own report, never a statement-list reading", () => {
    const c = codes(`type S:enum = { Busy, Idle }\n<program>\nlet <s:S=.Idle/>\n<button disabled=\${@s is .Busy}>x</button>\n</program>\n`);
    expect(c).not.toContain("E-ATTR-MULTI-STATEMENT");
    expect(c.length).toBeGreaterThan(0);
  });
  test("one expression is legal: a trailing `;`, a `;` in a string, an arrow body", () => {
    expect(codes(prog(`<p title=\${ @last; }>x</p>`))).toEqual([]);
    expect(codes(prog(`<p title=\${ "a;b" }>x</p>`))).toEqual([]);
    expect(codes(prog(`<p title=("a;b")>x</p>`))).toEqual([]);
  });
  test("E-ATTR-UNQUOTED-OPERATOR: an operator after a non-handler value, read whole and refused once", () => {
    for (const v of [`@last + "x"`, `@last == "x"`, `@ok ? "a" : "b"`]) {
      expect(codes(prog(`<p title=${v}>t</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    }
  });
  test("E-ATTR-UNQUOTED-OPERATOR: a handler expression before a spaced `>`", () => {
    expect(codes(prog(`<button onclick=@count = @count + 1 > 1>go</>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    // the truncated reading (`@ok = @count`, a type clash) is refused whole, never judged
    expect(codes(prog(`<button onclick=@ok = @count > 1>go</>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    // a call is not an operator form, and an unspaced `>` closes the tag
    expect(codes(prog(`<button onclick=track("a") >go</>`))).toEqual([]);
    expect(codes(prog(`<button onclick=@count = @count + 1>go</>`))).toEqual([]);
  });
  test("E-ATTR-UNQUOTED-OPERATOR: text after a value that cannot begin an attribute", () => {
    expect(codes(prog(`<p title=@last "y">t</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    expect(codes(prog(`<button onclick=track("a") (track)>t</>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
  });
  // r1 (#1865 F1) — §5.2: an unquoted value "continues … before … the keyword tests `is` / `instanceof` /
  // `in`", and `and` / `or` are operators "in all expression positions (… attribute values …)" (§45.9).
  // A word TOUCHING `-` and a name character is a hyphenated attribute name, never that operator.
  test("a hyphenated attribute name led by a keyword word follows an unquoted value: it compiles and renders", async () => {
    for (const n of [`in-view`, `is-active`, `or-x="1"`, `and-y`, `instanceof-z`]) {
      expect(codes(prog(`<p title=@last ${n}>x</p>`))).toEqual([]);
    }
    await load(prog(`<p id="e" title=@last in-view is-active or-x="1">a</p>\n<button id="h" onclick=track("a") in-view>t</>`));
    expect($("#e").getAttribute("title")).toBe("");
    expect($("#e").hasAttribute("in-view")).toBe(true);
    expect($("#e").hasAttribute("is-active")).toBe(true);
    expect($("#e").getAttribute("or-x")).toBe("1");
    expect($("#h").hasAttribute("in-view")).toBe(true);
    click($("#h"));
    expect($("#e").getAttribute("title")).toBe("a");
  });
  test("an exact keyword word after an unquoted value continues it (§5.2) and is refused once BY NAME, never E-PARSE-TRAILING", () => {
    for (const w of [`in`, `is`, `instanceof`, `and`, `or`]) {
      expect(codes(prog(`<p title=@last ${w}>x</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
      expect(codes(prog(`<button onclick=track("a") ${w}>x</button>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    }
    expect(codes(prog(`<p title=@ok and class="z">x</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    expect(codes(prog(`<p if=@ok and @ok>x</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    const e = errs(prog(`<p title=@last in>x</p>`))[0];
    expect(e.message).toContain("`title=@last in`");
    expect(e.message).toContain("`title=(…) in`");
    // a handler's word-form operator WITH an operand is legal §45.9 the bootstrap refuses by name
    expect(codes(prog(`<button onclick=@ok = @ok and @ok>x</button>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    // the escape the message gives: a parenthesized value ends before the word, which is an attribute
    expect(codes(prog(`<p title=(@last) in>x</p>`))).toEqual([]);
  });
  test("a leading-hyphen word after an unquoted value is the operator `-`: the named code alone, the value refused whole", () => {
    expect(codes(prog(`<p title=@last -x>x</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    expect(codes(prog(`<p title=@last in -x>x</p>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
  });
  test("the `:`-shorthand body after an unquoted value is not read into it", () => {
    expect(codes(prog(`<p title=@last : "hi">`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("4 — refused by name, never silently accepted", () => {
  test("`${(e) => …}` — a handler taking the event object (function values, C2b)", () => {
    const e = errs(prog(`<button onclick=\${(e) => @last = e.type}>go</>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("event object");
  });
  test("`${() => { … }}` — a braced arrow body", () => {
    const e = errs(prog(`<button onclick=\${() => { @count = 1; }}>go</>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("braced body");
  });
  test("`${() => f}` — an arrow returning a function", () => {
    const e = errs(prog(`<button onclick=\${() => track}>go</>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("`effect=${…}` — the §51.0.H engine block / plain attribute the parser cannot tell apart", () => {
    const e = errs(prog(`<div effect=\${ track("a") }>x</div>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("§51.0.H");
  });
  test("a declaration's own value written `${…}` (§66.2.4: parenthesized)", () => {
    expect(codes(`<program>\nlet <n:int=\${1}/>\n<p>\${@n}</p>\n</program>\n`)).toEqual(["E-DECL-OPENER-EXPR-UNPARENTHESIZED"]);
  });
});
