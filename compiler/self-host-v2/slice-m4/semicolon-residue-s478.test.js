// semicolon-residue-s478.test.js — s478 (lane s478-boot-semicolon-residue): three constructs the
// bootstrap parse-REJECTED (or misread) although they are valid scrml, found behind the
// conformance `parse-reject` FAILs once the cases' missing `;` (SPEC §7.2.2 rule 1) were added.
//
// 1. A bare `{ … }` block statement. §7.2.2 "Terms": a statement list is the content of "any
//    `{ … }` block of a statement (`if` / `else` / loop / bare block)"; rule 2 lists "bare block"
//    among the block-like statements. The bootstrap read a statement-start `{` as an object
//    literal (E-TYPE-STRUCT-CONTEXT + a cascade). It now reads it as a block, refused by name
//    (E-BOOTSTRAP-UNSUPPORTED — INTERIM, g-boot-bare-block-statement-s478), and judges the one
//    rule that holds whatever it builds: §19.16.2 "A bare `{ }` block statement … so a `defer`
//    there has no block to attach to … It SHALL be a compile error" (E-DEFER-UNSUPPORTED-SITE).
// 2. A `function (…) { … }` expression (§7.2: logic is JavaScript; §5.4 / §6.7 name "a function
//    expression" as a value). It was read as a name `function` and an object literal; it is now
//    refused by name from the D28 table (refusals.scrml), INTERIM.
// 3. `when message(data) { … }` in a nested `<program>` body (§4.12.4: "a lifecycle hook valid
//    inside worker `<program>` elements"). It was E-PARSE-ITEM ("other statements at logic-block
//    level are not in the bootstrap"). It is now read (its body's own syntax errors report) and
//    keeps no item: analyze reports an error on every nested `<program>` (its §4.12.2 attribute
//    errors, or else E-BOOTSTRAP-UNSUPPORTED), so nothing of it is ever lowered.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).filter((c) => c !== "E-DG-002");

const FN = (body) =>
  `<program>\n    let <trace=""/>\n    function D(s: string) {\n        @trace = @trace + s;\n    }\n    function go() {\n${body}\n    }\n    <button id="go" onclick=go()>Go</button>\n    <p id="out">\${@trace}</p>\n</program>\n`;

describe("§7.2.2 — a `{` that starts a statement is a bare block, not an object literal", () => {
  test("refused by name, once; no object-literal cascade", () => {
    const r = run(FN(`        {\n            D("a;");\n            D("b;");\n        }\n        D("c;");`));
    const cs = r.diags.map((d) => d.code).filter((c) => c !== "E-DG-002");
    expect(cs).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const d = r.diags.find((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(d.message).toContain("bare `{ … }` block statement");
    expect(d.message).toContain("§7.2.2");
  });

  test("block-like: no `;` is owed after its `}` (§7.2.2 rule 2)", () => {
    expect(codes(FN(`        { D("a;"); } D("c;");`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("its statements are still read: a missing `;` inside reports", () => {
    expect(codes(FN(`        {\n            D("a;")\n        }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-STMT-MISSING-SEMICOLON"]);
  });

  test("§19.16.2 — a `defer` at the block's top is E-DEFER-UNSUPPORTED-SITE, spanning the `defer`", () => {
    const src = FN(`        {\n            defer D("x;");\n            D("b;");\n        }`);
    const r = run(src);
    const cs = r.diags.map((d) => d.code).filter((c) => c !== "E-DG-002");
    expect(cs).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-DEFER-UNSUPPORTED-SITE"]);
    const d = r.diags.find((x) => x.code === "E-DEFER-UNSUPPORTED-SITE");
    expect(src.slice(d.span.start, d.span.end)).toStartWith("defer D(\"x;\")");
  });

  test("a `defer` inside a braced `if` inside the block belongs to that `if` — no defer code", () => {
    expect(codes(FN(`        {\n            if (true) {\n                defer D("x;");\n            }\n        }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("recovery: a `{` on the line of an error just reported is that construct's body — no bare-block refusal", () => {
    const r = run(`<program>\n    function f(cb: (x: int) => int) -> int {\n        return 1;\n    }\n    <p>\${f(1)}</p>\n</program>\n`);
    expect(r.diags.length).toBeGreaterThan(0);
    expect(r.diags.some((d) => d.message.includes("bare `{ … }` block statement"))).toBe(false);
    expect(r.diags.some((d) => d.code === "E-TYPE-STRUCT-CONTEXT" || d.code === "E-ASSIGN-POSITION")).toBe(false);
  });

  test("an object literal in a value position is unchanged", () => {
    expect(codes(`<program>\n    type P:struct = { a: int }\n    function go() -> int {\n        const p: P = { a: 1 };\n        return p.a;\n    }\n    <p>\${go()}</p>\n</program>\n`)).toEqual([]);
  });
});

describe("§7.2 — a `function (…) { … }` expression is refused by name", () => {
  test("one E-BOOTSTRAP-UNSUPPORTED naming the construct; no `function`-is-not-declared cascade", () => {
    const r = run(FN(`        let helper = function(v) {\n            return "pos";\n        };\n        @trace = helper(1);`));
    const cs = r.diags.map((d) => d.code).filter((c) => c !== "E-DG-002");
    expect(cs).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags.find((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("`function expression` (§7.2)");
  });

  test("a nested function DECLARATION (§7.3.1) is untouched", () => {
    expect(codes(FN(`        function helper(v: int) -> string {\n            return "pos";\n        }\n        @trace = helper(1);`))).toEqual([]);
  });
});

describe("§4.12.4 — `when message(data) { … }` in a nested `<program>` body", () => {
  const NESTED = (attrs, hook) =>
    `<program>\n<p>app</p>\n<div>\n<program name="w"${attrs}>\n  ${hook}\n</program>\n</div>\n</program>\n`;

  test("parses: a nested program with §4.12.2 attribute errors reports exactly those", () => {
    expect(codes(NESTED(` ratelimit="1/min" headers="strict"`, `when message(d) { send(d); }`))).toEqual(["E-PROGRAM-NESTED-ATTR", "E-PROGRAM-NESTED-ATTR"]);
  });

  test("fail-closed: a nested program with no attribute error is still refused (it is never built)", () => {
    expect(codes(NESTED("", `when message(d) { send(d); }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("the hook's body is read: its missing `;` reports", () => {
    expect(codes(NESTED(` ratelimit="1/min"`, `when message(d) { send(d) }`))).toEqual(["E-STMT-MISSING-SEMICOLON", "E-PROGRAM-NESTED-ATTR"]);
  });

  test("a malformed head (no binding) is a parse error", () => {
    expect(codes(NESTED(` ratelimit="1/min"`, `when message() { send(1); }`))).toContain("E-PARSE-EXPECTED");
  });
});
