// nested-logic-s478.test.js — s478-boot-nested-logic (S478 conformance triage C10): a `${ … }` LOGIC
// BLOCK inside markup that holds declarations / statements (`<div>${ function f() { … } }</div>`,
// `<ul>${ type …; server function … }</ul>`, `<p>${ let x = 1; }</p>`).
//
// Governing text:
//   §7.1: "Logic contexts are valid inside markup contexts and state blocks."
//   §7.6 (S439 #12): "A declaration in a `${…lift…}` block nested inside an `if=` element is a
//   file-scope declaration: it runs ONCE, at file init — not once per mount of the `if=` scope. The
//   block's `lift` statements run per mount (§6.7.2.1)."
//   §17.3 (S449): "A `${ … }` written in a markup (free-text) body is a render expression: it may not
//   write reactive state".
//
// Built: the block's `function` / `fn` / `type` / `const` items are hoisted to the enclosing item list
// (file scope); the block renders nothing. Its statements, an `import` / `export`, a declaration are
// refused by name (INTERIM, g-boot-nested-logic-statements-s478).
//
// RED ON MAIN: the block was read as ONE interpolated expression — `function` / `server` / `type` /
// `let` were E-SCOPE-001 "is not declared" plus E-PARSE-EXPECTED / E-PARSE-TRAILING.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;
const textOf = (sel) => document.querySelector(sel).textContent;

describe("§7.6 S439 #12 — declarations in a `${ … }` inside markup are file-scope declarations", () => {
  test("a function declared inside an `if=` element is callable from a sibling handler, and runs", async () => {
    const r = run(P(`let <open:boolean=true/>\nlet <label:string="pending"/>\n<div id="wrap" if=@open>\n    \${\n        function pull() {\n            @label = "pulled";\n        }\n    }\n    <button id="go" onclick=pull()>Go</button>\n</div>\n<p id="out">\${@label}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "nl-fn");
    expect(textOf("#out")).toBe("pending");
    click(document.querySelector("#go"));
    expect(textOf("#out")).toBe("pulled");
  });

  test("a type and a function inside a `<ul>` block compile clean and render nothing there", async () => {
    const r = run(P(`<ul id="u">\n\${\n  type Item:struct = { id: int, name: string }\n  fn label(i: Item) -> string { return i.name; }\n}\n<li>x</li>\n</ul>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "nl-type");
    expect(textOf("#u").trim()).toBe("x");
  });

  test("a `const` there is a file-scope constant (§7.6)", async () => {
    const r = run(P(`<div>\${ const K = 7; }</div>\n<p id="k">\${K * 6}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "nl-const");
    expect(textOf("#k")).toBe("42");
  });

  test("an ordinary interpolation is still one expression", async () => {
    const r = run(P(`let <n:int=2/>\n<p id="z">\${@n + 1}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "nl-interp");
    expect(textOf("#z")).toBe("3");
  });
});

describe("what such a block holds besides declarations is refused by name (INTERIM)", () => {
  test("statements (§7.6: once per mount; §17.3: a render position)", () => {
    expect(codes(run(P(`<p>\${ let x = 1; }</p>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(run(P(`<div>\${\n  function f() { return 1; }\n  f();\n}</div>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("an `export` / an `import` there", () => {
    expect(codes(run(P(`<div>\${ export fn g() -> int { return 1; } }</div>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
