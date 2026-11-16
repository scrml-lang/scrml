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

  // s478 (review-followups-2, #1897 F1): recovering, the `{` is that construct's body, not a bare
  // block — a `defer` at its top is not judged as a bare-block defer.
  test("recovery: a `defer` at the top of a body whose head failed to parse is no E-DEFER-UNSUPPORTED-SITE", () => {
    const r = run(`\${ function f(cb: (x: int) => int) -> int { defer log(1); return 1; } }`);
    expect(r.diags.length).toBeGreaterThan(0);
    expect(r.diags.some((d) => d.code === "E-DEFER-UNSUPPORTED-SITE")).toBe(false);
  });

  // #1897 F2 — §19.16.3 rule 4: "`defer` SHALL appear only inside the body of a function
  // DECLARATION … It is E-DEFER-OUTSIDE-FUNCTION in every other position: … a `match` / `!{}` arm
  // or bare block at the top level"; §34 E-DEFER-OUTSIDE-FUNCTION: "(top-level logic, … a `when`
  // body, an `on*=${}` handler attribute …)".
  test("§19.16.3 — a bare block outside any function: its `defer` is E-DEFER-OUTSIDE-FUNCTION", () => {
    const deferCodes = (src) => codes(src).filter((c) => c.startsWith("E-DEFER-"));
    expect(deferCodes(`\${ { defer log(1); } }`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
    expect(deferCodes(`<button onclick={ { defer log(1); } }>b</button>`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
    // a worker's `when message` body (§4.12.4)
    expect(deferCodes(`<program>\n<program name="w">\nwhen message(d) { { defer send(d); } }\n</program>\n</program>\n`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
  });
  test("§19.16.3 — a `when` body or a handler inside a function is still outside one", () => {
    const cs = codes(FN(`        when @trace changes {\n            {\n                defer D("x;");\n            }\n        }`));
    expect(cs).toContain("E-DEFER-OUTSIDE-FUNCTION");
    expect(cs).not.toContain("E-DEFER-UNSUPPORTED-SITE");
  });
  // s478 (review-followups-3, #1902 LOW) — §19.16.3 rule 4: "a `defer` inside a function or arrow
  // DECLARED in a `when` body or a handler attribute is rejected too — declare the function
  // outside the body and call it" (E-DEFER-OUTSIDE-FUNCTION, not §19.16.2's code).
  test("§19.16.3 — a function DECLARED in a `when` / handler / arrow body is still outside one", () => {
    const deferCodes = (src) => codes(src).filter((c) => c.startsWith("E-DEFER-"));
    const G = `function g() -> int { { defer log(1); } return 1; }`;
    expect(deferCodes(`let <c:int=0/>\n\${ function f() -> int { when @c changes { ${G} } return 1; } }`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
    expect(deferCodes(`let <c:int=0/>\n\${ when @c changes { ${G} } }`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
    expect(deferCodes(`<button onclick={\n function g() {\n {\n defer log(1);\n }\n }\n g();\n }>b</button>`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
    expect(deferCodes(`\${ const h = (x) => {\n function g() {\n {\n defer log(1);\n }\n }\n };\n }`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
    expect(deferCodes(`let <c:int=0/>\n\${ when @c changes {\n function g() {\n {\n defer log(1);\n }\n }\n } }`)).toEqual(["E-DEFER-OUTSIDE-FUNCTION"]);
  });
  test("§19.16.2 — inside a function (a loop body, a nested function) it stays E-DEFER-UNSUPPORTED-SITE", () => {
    expect(codes(`\${ function f() { for (const x of [1]) { { defer log(x); } } } }`)).toContain("E-DEFER-UNSUPPORTED-SITE");
    const nested = codes(FN(`        function inner() {\n            {\n                defer D("x;");\n            }\n        }\n        inner();`));
    expect(nested).toContain("E-DEFER-UNSUPPORTED-SITE");
    expect(nested).not.toContain("E-DEFER-OUTSIDE-FUNCTION");
    // after a nested function, the enclosing body is still a function body
    const after = codes(FN(`        function inner() {\n            D("i;");\n        }\n        {\n            defer D("x;");\n        }`));
    expect(after).toContain("E-DEFER-UNSUPPORTED-SITE");
    expect(after).not.toContain("E-DEFER-OUTSIDE-FUNCTION");
  });

  test("an object literal in a value position is unchanged", () => {
    expect(codes(`<program>\n    type P:struct = { a: int }\n    function go() -> int {\n        const p: P = { a: 1 };\n        return p.a;\n    }\n    <p>\${go()}</p>\n</program>\n`)).toEqual([]);
  });
});

// s478-boot-block-lambda: a function expression is now PARSED (a BlockLambda, §7.2) and built as a
// tape method's callback (block-lambda-s478.test.js); bound by `let` it is a function value the
// bootstrap does not build — refused by name at the value, still with no cascade.
describe("§7.2 — a `function (…) { … }` expression bound by `let` is refused by name", () => {
  test("one E-BOOTSTRAP-UNSUPPORTED naming the construct; no `function`-is-not-declared cascade", () => {
    const r = run(FN(`        let helper = function(v) {\n            return "pos";\n        };\n        @trace = helper(1);`));
    const cs = r.diags.map((d) => d.code).filter((c) => c !== "E-DG-002");
    // the value, and the call through the local that holds it — each refused by name (function values)
    expect([...new Set(cs)]).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags.some((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED" && x.message.includes("function expression `function (x: T) { … }`, §7.2"))).toBe(true);
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
