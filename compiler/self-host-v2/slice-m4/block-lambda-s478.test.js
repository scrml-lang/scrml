// block-lambda-s478.test.js — s478-boot-block-lambda: BLOCK-bodied lambdas and function expressions.
//
// §7.2: "All JavaScript that is valid in a Bun execution context is valid inside `${ }`, except the
// constructs §7.2.1 excludes" — a braced arrow body `(x) => { … }` and a function expression
// `function (x: T) { … }` are not excluded. Before: the braced arrow was E-BOOTSTRAP-UNSUPPORTED
// (parse.scrml parseLambda) and the function expression a D28 refusal row (refusals.scrml,
// g-boot-function-expression-s478). Now both parse to AExprK.BlockLambda and are BUILT where the
// expression lambda is — a tape method's callback (`.map` / `.filter` / `.some` / `.every` /
// `.sort`) — and as an event handler that takes no event (`onclick=${() => { … }}`, the same value
// as the inline block `onclick={ … }`, §5.2.1 / §5.2.4). Every program here is compiled from source
// by the bootstrap, its Core checked (check.scrml, C-L1), printed and RUN (happy-dom).

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
let k = 0;

// A program: cells, the function `go` (its body `body`, run on a click of #b), `@out` shown in #o.
const prog = (body, extra = "") => `<program>
    let <out:int=0/>
    let <k:int=10/>
    let <count:int=0/>
    <xs:int[replace]=([1, 2, 3, 4])/>
${extra}
    function go() {
${body}
    }
    <button id="b" onclick=go()>b</button>
    <p id="o">\${@out}</p>
    <p id="n">\${@count}</p>
</program>
`;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s478-blam-" + k++);
  return r;
}

async function outAfterClick(body, extra = "") {
  await run(prog(body, extra));
  click($("#b"));
  return $("#o").textContent;
}

describe("§7.2 — a block-bodied callback of a tape method (run)", () => {
  test("`.map((x) => { … })` — locals, an `if`, an early `return`", async () => {
    expect(await outAfterClick(`        const ys: int[] = @xs.map((x) => { const m: int = 3; if (x == 2) { return 100; } return x * m; });
        @out = ys[0] + ys[1] + ys[2];`)).toBe("112");
  });
  test("`.filter(function (v: int) { … })` — a function expression, its parameter annotated (§7.5)", async () => {
    expect(await outAfterClick(`        const ys: int[] = @xs.filter(function (v: int) { if (v > 2) { return true; } return false; });
        @out = ys.length * 10 + ys[0];`)).toBe("23");
  });
  test("`.sort((a, b) => { … })` — a block comparator", async () => {
    expect(await outAfterClick(`        const ys: int[] = @xs.sort((a, b) => { if (a > b) { return -1; } return 1; });
        @out = ys[0] * 1000 + ys[3];`)).toBe("4001");
  });
  test("`.some` / `.every` with block predicates", async () => {
    expect(await outAfterClick(`        const s: bool = @xs.some(x => { return x == 3; });
        const e: bool = @xs.every(x => { if (x > 0) { return true; } return false; });
        if (s && e) { @out = 1; } else { @out = 2; }`)).toBe("1");
  });
  test("a closure over the enclosing function's locals and a cell", async () => {
    expect(await outAfterClick(`        const base: int = 5;
        const ys: int[] = @xs.map(x => { return x + base + @k; });
        @out = ys[3];`)).toBe("19");
  });
  test("the body's own `let` rebound; a `const` per path", async () => {
    expect(await outAfterClick(`        const ys: int[] = @xs.map(x => { let acc: int = 0; acc = acc + x; acc = acc * 2; return acc; });
        @out = ys[2];`)).toBe("6");
  });
  test("nested lambdas — an expression lambda and a block lambda inside a block body", async () => {
    expect(await outAfterClick(`        const ys: int[] = @xs.map(x => {
            const big: int[] = @xs.filter(y => { return y > x; });
            const twice: int[] = big.map(z => z * 2);
            return twice.length;
        });
        @out = ys[0] * 1000 + ys[1] * 100 + ys[2] * 10 + ys[3];`)).toBe("3210");
  });
  test("the printed callback is a JavaScript arrow whose `return`s are its own", () => {
    const r = fe(prog(`        const ys: int[] = @xs.map(x => { if (x == 2) { return 0; } return x; });
        @out = ys[1];`));
    expect(errs(r)).toEqual([]);
    const js = mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
    expect(js).toMatch(/\.map\(x\w* => \{/);
  });
});

describe("§5.2.1 / §5.2.4 — a block-bodied handler with no event (run)", () => {
  const H = (h) => `<program>
    let <count:int=0/>
    <button id="h" onclick=${h}>h</button>
    <p id="n">\${@count}</p>
</program>
`;
  test("`onclick=${() => { … }}` runs its statements, as `onclick={ … }`", async () => {
    await run(H("${() => { @count = @count + 1; @count = @count + 1; }}"));
    click($("#h"));
    click($("#h"));
    expect($("#n").textContent).toBe("4");
  });
  test("`onclick=${function () { … }}` too", async () => {
    await run(H("${function () { @count = @count + 5; }}"));
    click($("#h"));
    expect($("#n").textContent).toBe("5");
  });
});

describe("reactivity — a cell read inside a block body is a dependency of the markup", () => {
  test("`${@xs.filter(x => { return x > @k; }).length}` re-renders when `@k` changes", async () => {
    const src = `<program>
    let <k:int=1/>
    <xs:int[replace]=([1, 2, 3, 4])/>
    <button id="b" onclick={ @k = 3; }>b</button>
    <p id="o">\${@xs.filter(x => { return x > @k; }).length}</p>
</program>
`;
    await run(src);
    expect($("#o").textContent).toBe("3");
    click($("#b"));
    expect($("#o").textContent).toBe("1");
  });
});

describe("never silently allowed", () => {
  test("§19.16.3 rule 4 — a `defer` in an arrow body is E-DEFER-OUTSIDE-FUNCTION", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { defer track(); return x; });
        @out = ys[0];`, "    function track() { }"))).toContain("E-DEFER-OUTSIDE-FUNCTION");
  });
  test("§19.16.3 rule 4 — and in a function expression's body", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(function (x: int) { defer track(); return x; });
        @out = ys[0];`, "    function track() { }"))).toContain("E-DEFER-OUTSIDE-FUNCTION");
  });
  test("§35.4.5 — two appearances of one `lin` in one closure body are E-LIN-002", () => {
    const cs = codes(prog(`        lin t = 7;
        const ys: int[] = @xs.map(x => { if (x > 1) { return t; } return t + 1; });
        @out = ys[0];`));
    expect(cs).toEqual(["E-LIN-002"]);
  });
  test("§35.6 — a `lin` captured by a closure AND used after it is E-LIN-002", () => {
    const cs = codes(prog(`        lin t = 7;
        const ys: int[] = @xs.map(x => { return x + t; });
        @out = ys[0] + t;`));
    expect(cs).toEqual(["E-LIN-002"]);
  });
  test("§35.6 — a `lin` captured once by one closure is its one consumption (clean)", () => {
    expect(codes(prog(`        lin t = 7;
        const ys: int[] = @xs.map(x => { return x + t; });
        @out = ys[0];`))).toEqual([]);
  });
  test("§35.6 — a `lin` captured by two closures is E-LIN-002", () => {
    const cs = codes(prog(`        lin t = 7;
        const ys: int[] = @xs.map(x => { return x + t; });
        const zs: int[] = @xs.map(x => { return x - t; });
        @out = ys[0] + zs[0];`));
    expect(cs).toEqual(["E-LIN-002"]);
  });
  test("a `lin` declared in a callback body is refused (INTERIM)", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { lin t = x; return t; });
        @out = ys[0];`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a write to a cell in a callback body is refused (INTERIM)", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { @count = x; return x; });
        @out = ys[0];`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a write to a captured local is refused (INTERIM)", () => {
    expect(codes(prog(`        let n: int = 0;
        const ys: int[] = @xs.map(x => { n = n + x; return x; });
        @out = ys[0] + n;`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a path that ends without `return` is refused", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { if (x > 1) { return x; } });
        @out = ys[0];`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a bare `return;` is refused", () => {
    expect(codes(prog(`        const ys: int[] = @xs.filter(x => { return; });
        @out = ys.length;`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a loop or an expression statement in a callback body is refused (INTERIM)", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { for (const y of [1]) { } return x; });
        @out = ys[0];`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { track(); return x; });
        @out = ys[0];`, "    function track() { }"))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a `?{}` query in a callback body is refused", () => {
    expect(codes(prog(`        const ys: int[] = @xs.map(x => { const r = ?{\`SELECT 1 AS n\`}.get(); return x; });
        @out = ys[0];`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("§7.5 — a function expression's bare parameter is E-PARAM-TYPE-REQUIRED", () => {
    expect(codes(prog(`        const ys: int[] = @xs.filter(function (v) { return v > 1; });
        @out = ys.length;`))).toEqual(["E-PARAM-TYPE-REQUIRED"]);
  });
  test("§7.5.1 — a function expression's parameter typed other than the tape's elements is E-TYPE-031", () => {
    expect(codes(prog(`        const ys: int[] = @xs.filter(function (v: string) { return true; });
        @out = ys.length;`))).toContain("E-TYPE-031");
  });
  test("a filter's block predicate returning a non-`bool` is E-TYPE-031 (§42.4: no truthiness)", () => {
    expect(codes(prog(`        const ys: int[] = @xs.filter(x => { if (x > 1) { return true; } return 0; });
        @out = ys.length;`))).toContain("E-TYPE-031");
  });
  test("a block lambda bound by `const` (a function value) is refused by name", () => {
    expect(codes(prog(`        const f = (x) => { return x; };
        @out = 1;`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});
