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
    // s479 (s479-file-scope-init): `let x = 1;` there is a file-scope `let` DECLARATION (§7.6 S439 #12),
    // hoisted as a `const` is — no longer a by-name refusal
    expect(codes(run(P(`<p>\${ let x = 1; }</p>`)))).toEqual([]);
    expect(codes(run(P(`<div>\${\n  function f() { return 1; }\n  f();\n}</div>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("an `export` / an `import` there", () => {
    expect(codes(run(P(`<div>\${ export fn g() -> int { return 1; } }</div>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// s478 r1 (H2) — a hoisted declaration is FILE-SCOPE (§7.6), so one written in a `${ … }` that stands
// inside a binder scope would lose the binder and silently bind a same-named file-scope name. RED before
// r1: `const x = 100; … for (const x of @xs) { lift <li>${ fn h() -> int { return x; } }…` compiled
// clean and `h()` returned 100. Refused by name, as a `<db>`-body function there is (dbNestedWhy).
describe("a `${ … }` hoist inside a binder scope is refused by name (never re-bound to file scope)", () => {
  const XS = `<xs:int[]=([1, 2])/>\n`;
  const refusedAt = (src, what) => {
    const r = run(src);
    const ds = errs(r).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(ds.length).toBe(1);
    expect(src.slice(ds[0].span.start, ds[0].span.end)).toBe(what);
    expect(ds[0].message).toContain("FILE-SCOPE");
  };
  test("inside a loop's lifted row, beside a same-named file-scope constant", () => {
    const src = P(`const x = 100;\n${XS}<ul>\${ for (const x of @xs) { lift <li>\${ fn h() -> int { return x; } }\${x}</li>; } }</ul>\n<p>\${h()}</p>`);
    refusedAt(src, "fn h() -> int { return x; }");
    expect(codes(run(src))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("inside an `<each>` row", () => {
    refusedAt(P(`const r = 7;\n${XS}<each in=@xs as="r"><li>\${ fn h3() -> int { return r; } }</li></each>\n<p>\${h3()}</p>`), "fn h3() -> int { return r; }");
  });
  test("a constant there too", () => {
    refusedAt(P(`${XS}<ul>\${ for (const r of @xs) { lift <li>\${ const KK = 9; }</li>; } }</ul>\n<p>\${KK}</p>`), "const KK = 9;");
  });
});

// s478 r1 (LOW-7) — `${ type … }` is a declaration only in a type-declaration shape; a binding named
// `type` keeps its interpolation (RED before r1: E-BOOTSTRAP-UNSUPPORTED / parse errors on `${ type }`).
describe("`${ type }` reads a binding named `type` unless a type declaration follows", () => {
  test("a loop binder named `type`, and a constant named `type`", async () => {
    const r = run(P(`<types:string[]=(["a", "b"])/>\n<ul id="u">\${ for (const type of @types) { lift <li>\${ type }</li>; } }</ul>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "nl-type-binder");
    expect(textOf("#u")).toBe("ab");
    expect(codes(run(P(`const type = "q";\n<p id="z">\${ type }</p>`)))).toEqual([]);
  });
  test("`type T:enum = …` there is still a hoisted declaration", () => {
    expect(codes(run(P(`<div>\${ type K:enum = { A, B } }</div>\n<p>x</p>`)))).toEqual([]);
  });
});
