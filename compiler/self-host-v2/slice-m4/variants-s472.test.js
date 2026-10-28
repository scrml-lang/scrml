// variants-s472.test.js — s472-boot-payload-variant (g-boot-payload-variant-value-s472):
// a PAYLOAD-variant value `E.V(a, b)` / `.V(a, b)` is constructed in an expression
// (Core Expr.VariantOf), typed against the variant's declared fields, matched,
// compared, and crosses the server boundary in the §57.8 wire form.
//
// Governing SPEC sentences (quoted in analyze.scrml resolveConstruct):
//   §14.4 "Construction arity" — "supplies exactly one positional argument per declared
//     field, in declaration order … too few, too many, or any payload on a unit variant
//     (`Shape.Point(x)`) — is a hard error (E-TYPE-082) … across every construction
//     locus — `let` / `const` / state-cell initializers, `return`, and `fail`".
//   §14.10 — "An enum-payload-variant CONSTRUCTOR argument is such a position" (a bare
//     argument resolves against the PAYLOAD field's type); a wrong argument variant is
//     the unknown-variant code (E-TYPE-063, superseded in the bootstrap by
//     E-TYPE-VARIANT, §66.20).
//   §45.2 — "Payload variants compare by tag + payload fields."
//   §57.8 / §12.5.1 — an enum value on the wire is `{"variant": "V", "data": {<field>: …}}`.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, codes, check, artifacts, serve, post, pathOf, bridge, spyDriver } from "./server-artifact-harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (globalThis.document) globalThis.document.cookie = "scrml_csrf=; Max-Age=0; Path=/";
  expectNoPageErrors();
});

const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const errs = (src) => codes(src).filter((c) => !c.startsWith("W-") && !c.startsWith("I-"));
let k = 0;

const SHAPE = `    type Shape:enum = { Circle(r: int), Rect(w: int, h: int), Dot }`;
const P = (decls, main = "") => `<program>\n${SHAPE}\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
const AREA = `    function area(s: Shape) -> int {\n        return match s {\n            .Circle(r) :> 3 * r * r,\n            .Rect(w, h) :> w * h,\n            .Dot :> 0\n        };\n    }`;

// The Core expressions of a kind, anywhere in a Core program (a structural walk, test-side).
function findAll(node, variant, out = []) {
  if (Array.isArray(node)) { for (const n of node) findAll(n, variant, out); return out; }
  if (node && typeof node === "object") {
    if (node.variant === variant) out.push(node);
    for (const v of Object.values(node)) findAll(v, variant, out);
  }
  return out;
}

describe("construction is a Core value (Expr.VariantOf) — every §14.4 locus", () => {
  test("a qualified and a bare construction lower to VariantOf; a unit variant stays Lit(Variant); checkCore is clean", () => {
    const r = compile(P(`${AREA}\n    function mk(n: int) -> Shape {\n        if (n == 0) return Shape.Dot;\n        if (n == 1) return .Circle(n);\n        return Shape.Rect(n, n);\n    }`));
    expect(check(r.core)).toEqual([]);
    const vs = findAll(r.core, "VariantOf");
    expect(vs.map((v) => [v.data.enumSym.hint, v.data.idx, v.data.args.length])).toEqual([["Shape", 0, 1], ["Shape", 1, 2]]);
  });

  test("the printed value is THE ENUM VALUE SHAPE a `fail` builds: `{ variant, data: [positional] }`", () => {
    const r = compile(P(`    let <sh:Shape=(Shape.Rect(2, 5))/>`));
    const { client } = artifacts(r.core);
    expect(client.refused).toEqual([]);
    expect(client.js).toContain(`{ variant: "Rect", data: [2 /* w */, 5 /* h */] }`);
  });

  test("checkCore C-V1 refuses a malformed VariantOf (wrong arity, a unit variant, no such variant)", () => {
    const r = compile(P(`    let <sh:Shape=(Shape.Rect(2, 5))/>`));
    const v = findAll(r.core, "VariantOf")[0];
    const orig = { idx: v.data.idx, args: v.data.args };
    v.data.args = [orig.args[0]];
    expect(check(r.core).join("\n")).toMatch(/C-V1: .*carries 1 value\(s\) for 2 payload field\(s\)/);
    v.data.args = orig.args; v.data.idx = 2;
    expect(check(r.core).join("\n")).toMatch(/C-V1: .*carries no payload/);
    v.data.idx = 9;
    expect(check(r.core).join("\n")).toMatch(/C-V1: .*no such variant/);
  });

  test("compiled and RUN: a cell initializer, a write, a return, an argument, nested bare payload arguments, and ==", async () => {
    const r = compile(`<program>
    type Level:enum = { Easy, Hard }
${SHAPE}
    type Mode:enum = { Solo(level: Level), Duo(a: string, b: Shape) }
    let <sh:Shape=(Shape.Rect(2, 5))/>
    let <m:Mode=(.Solo(.Hard))/>
    let <eq:string=""/>
${AREA}
    fn grow(n: int) -> Shape {
        if (n == 1) return .Circle(n);
        return Shape.Rect(n, n + 1);
    }
    function modeText(m: Mode) -> string {
        return match m {
            .Solo(level) :> match level { .Easy :> "easy", .Hard :> "hard" },
            .Duo(a, b) :> \`\${a} \${area(b)}\`
        };
    }
    function step() {
        @sh = grow(3);
        @m = .Duo("duo", .Circle(2));
        const a: bool = Shape.Rect(3, 4) == @sh;
        const b: bool = .Rect(4, 3) != @sh;
        const c: bool = Mode.Duo("duo", Shape.Circle(2)) == @m;
        @eq = (a && b && c) ? "ok" : "bad";
    }
    <main>
        <button id="b" onclick=step()>b</button>
        <p id="area">\${area(@sh)}</p>
        <p id="mode">\${modeText(@m)}</p>
        <p id="eq">\${@eq}</p>
    </main>
</program>
`);
    expect(check(r.core)).toEqual([]);
    await loadProgram(r.core, "s472-pv-" + k++);
    const $ = (s) => document.querySelector(s).textContent;
    expect([$("#area"), $("#mode")]).toEqual(["10", "hard"]);
    click(document.querySelector("#b"));
    await settle();
    expect([$("#area"), $("#mode"), $("#eq")]).toEqual(["12", "duo 12", "ok"]);
  });
});

describe("construction across the server boundary (§57.8 wire form)", () => {
  const SQ = "?" + "{";
  const SRC = `<program db="./app.db">
${SHAPE}
    type Row:struct = { w: int, h: int }
    let <sh:Shape=(Shape.Dot)/>
    let <got:int=0/>
${AREA}
    function load(id: int) -> Shape {
        const r: Row = ${SQ}\`SELECT w, h FROM boxes WHERE id = \${id}\`}.get() !{ _ :> { return Shape.Dot; } };
        return Shape.Rect(r.w, r.h);
    }
    function measure(s: Shape) -> int {
        ${SQ}\`UPDATE boxes SET seen = 1\`}.run() !{ _ :> { return 0; } };
        return area(s);
    }
    <main>
        <button id="load" onclick={ @sh = load(1) !{ .Transport(t) :> return }; }>load</button>
        <button id="send" onclick={ @got = measure(.Circle(2)) !{ .Transport(t) :> return }; }>send</button>
        <p id="area">\${area(@sh)}</p>
        <p id="got">\${@got}</p>
    </main>
</program>
`;
  test("a server function RETURNS a constructed variant: the route answers the §57.8 form; the client decodes and matches it", async () => {
    const r = compile(SRC);
    expect(check(r.core)).toEqual([]);
    const spy = spyDriver(() => [{ w: 3, h: 7 }]);
    const { srv, routes } = await serve(r.core, spy.fn);
    const res = await post(srv, pathOf(routes, "load"), [1]);
    expect([res.status, res.json]).toEqual([200, { variant: "Rect", data: { w: 3, h: 7 } }]);
    await loadProgram(r.core, "s472-pvs-" + k++);
    globalThis.fetch = bridge(srv);
    expect(document.querySelector("#area").textContent).toBe("0");
    click(document.querySelector("#load"));
    await settle();
    expect(document.querySelector("#area").textContent).toBe("21");
  });

  test("the client constructs an ARGUMENT: it is encoded in the §57.8 form and the server decodes and matches it", async () => {
    const r = compile(SRC);
    const spy = spyDriver(() => []);
    const { srv, routes } = await serve(r.core, spy.fn);
    const direct = await post(srv, pathOf(routes, "measure"), [{ variant: "Rect", data: { w: 2, h: 9 } }]);
    expect([direct.status, direct.json]).toEqual([200, 18]);
    await loadProgram(r.core, "s472-pva-" + k++);
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#send"));
    await settle();
    expect(document.querySelector("#got").textContent).toBe("12");
  });
});

describe("refusals — each at the construction, with the SPEC's code", () => {
  const cases = [
    ["too few payload values (§14.4)", `    let <x:Shape=(Shape.Rect(1))/>`, ["E-TYPE-082"]],
    ["too many payload values, bare callee (§14.4)", `    let <x:Shape=(.Circle(1, 2))/>`, ["E-TYPE-082"]],
    ["a payload on a unit variant (§14.4 \`Shape.Point(x)\`)", `    let <x:Shape=(Shape.Dot(1))/>`, ["E-TYPE-082"]],
    ["a payload value of the wrong type (E-TYPE-031)", `    let <x:Shape=(Shape.Circle("big"))/>`, ["E-TYPE-031"]],
    ["a `number` into an `int` field (int enforced, S440)", `    let <x:Shape=(Shape.Circle(1.5))/>`, ["E-TYPE-031"]],
    ["a variant the enum does not declare (E-TYPE-VARIANT)", `    let <x:Shape=(Shape.Square(1))/>`, ["E-TYPE-VARIANT"]],
    ["a bare payload argument not a variant of the FIELD's enum (§14.10)", `    type L:enum = { Easy, Hard }\n    type M:enum = { Solo(level: L) }\n    let <x:M=(.Solo(.Medium))/>`, ["E-TYPE-VARIANT"]],
    ["a bare construction two enums declare, with no type from its position", `    type A:enum = { Box(n: int) }\n    type B:enum = { Box(n: int) }\n    function f() {\n        const v = .Box(1);\n    }`, ["E-VARIANT-AMBIGUOUS"]],
    ["a unit variant with \`()\` — not its spelling (§14.5); refused, fail closed", `    let <x:Shape=(Shape.Dot())/>`, ["E-BOOTSTRAP-UNSUPPORTED"]],
    ["a payload variant named without its payload — the constructor as a function value", `    function f() -> Shape {\n        return Shape.Circle;\n    }`, ["E-BOOTSTRAP-UNSUPPORTED"]],
    ["the wrong arity inside a return (every locus, §14.4)", `    function f() -> Shape {\n        return .Rect(1, 2, 3);\n    }`, ["E-TYPE-082"]],
  ];
  for (const [what, decls, want] of cases) {
    test(what, () => {
      expect([...new Set(errs(P(decls)))]).toEqual(want);
    });
  }
});
