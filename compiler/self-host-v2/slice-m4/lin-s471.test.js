// lin-s471.test.js — s471 (g-bootstrap-lin-not-implemented-s469): linear
// types, SPEC §35, in the bootstrap — the declaration (§35.2), `lin`
// parameters (§35.2.1), exactly-once consumption (§35.3), control flow
// (§35.4), closures (§35.6), the server boundary (§35.7), and the codes
// (§35.5: E-LIN-001 / -002 / -003 / -005; W-LIN-001).
//
//   §35.1: "A `lin` variable is a value with exactly-once consumption and
//   restricted intermediate visibility. The binding is immutable, must be
//   consumed on every execution path, and must not be referenced by any code
//   between the declaration site and the consumption site except the
//   consumption itself."
//   §35.2: "Every appearance of a `lin` identifier in a position that is not a
//   declaration SHALL count as a consumption event (§35.3). The compiler SHALL
//   reject any second reference — read-only or otherwise — with E-LIN-002."
//   §35.2.1: "A `lin` parameter annotation SHALL have no effect on the emitted
//   JS output. The constraint is compile-time only."
//
// Graded on exact codes and on the RUNTIME effect (a `lin` program runs as the
// same program without `lin`).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errCodes = (src) => run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code).sort();
const allCodes = (src) => run(src).diags.map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);

// helpers `mint() -> string`, `use(t: string) -> string`, `other(t: string) -> string`
const H = `    function mint() -> string {\n        return "tok";\n    }\n    function use(t: string) -> string {\n        return \`used:\${t}\`;\n    }\n    function other(t: string) -> string {\n        return \`other:\${t}\`;\n    }`;
const prog = (decls, body = `        <p id="o">\${f(true)}</p>`) => `<program>\n${H}\n${decls}\n    <main>\n${body}\n    </main>\n</program>\n`;
// one function `f(c: boolean) -> string` with body `b`
const F = (b) => prog(`    function f(c: boolean) -> string {\n${b}\n    }`);

let k = 0;
const load = (src) => loadProgram(clean(src).core, "lin-" + k++);

describe("§35.2 / §35.3 — the declaration and exactly-once consumption", () => {
  test("`lin t = …;` consumed once — compiles, and runs as the same program without `lin`", async () => {
    await load(F(`        lin t = mint();\n        return use(t);`));
    expect($("#o").textContent).toBe("used:tok");
  });
  test("each consumption event counts once: an argument, a read into a local, a `return`, a template slot", async () => {
    clean(F(`        lin t = mint();\n        const s = t;\n        return use(s);`));
    clean(F(`        lin t = mint();\n        return t;`));
    clean(F(`        lin t = mint();\n        return \`[\${t}]\`;`));
  });
  test("zero consumptions: E-LIN-001", () => {
    expect(errCodes(F(`        lin t = mint();\n        return "x";`))).toEqual(["E-LIN-001"]);
    expect(errCodes(F(`        lin t = mint();\n        const u = 1;\n        return "x";`))).toEqual(["E-LIN-001"]);
  });
  test("two consumptions on one path: E-LIN-002 — any second reference, read-only or otherwise", () => {
    expect(errCodes(F(`        lin t = mint();\n        const a = use(t);\n        return other(t);`))).toEqual(["E-LIN-002"]);
    expect(errCodes(F(`        lin t = mint();\n        return \`\${t}\${t}\`;`))).toEqual(["E-LIN-002"]);
    expect(errCodes(F(`        lin t = mint();\n        const s = t;\n        return use(t);`))).toEqual(["E-LIN-002"]);
  });
  test("the binding is immutable: a write to it is refused", () => {
    expect(errCodes(F(`        lin t = mint();\n        t = "y";\n        return use(t);`)).length).toBeGreaterThan(0);
  });
  test("a `lin` initialised from another `lin` consumes it", () => {
    clean(F(`        lin a = mint();\n        lin b = a;\n        return use(b);`));
    expect(errCodes(F(`        lin a = mint();\n        lin b = a;\n        return use(a);`))).toEqual(["E-LIN-001", "E-LIN-002"]);
  });
  test("a `lin` in a handler block", async () => {
    const src = prog(`    let <out:string=""/>`, `        <button onclick={ lin t = mint(); @out = use(t); }>go</button>\n        <p id="o">\${@out}</p>`);
    await load(src);
    click(btn("go"));
    expect($("#o").textContent).toBe("used:tok");
    expect(errCodes(prog(`    let <out:string=""/>`, `        <button onclick={ lin t = mint(); @out = "x"; }>go</button>`))).toEqual(["E-LIN-001"]);
  });
});

describe("§35.4 — control flow", () => {
  test("`if` / `else` consuming on both branches is valid (runtime, both paths)", async () => {
    const src = prog(`    function f(c: boolean) -> string {\n        lin t = mint();\n        if (c) {\n            return use(t);\n        } else {\n            return other(t);\n        }\n    }`,
      `        <p id="a">\${f(true)}</p>\n        <p id="b">\${f(false)}</p>`);
    await load(src);
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["used:tok", "other:tok"]);
  });
  test("consumed in one branch only — or in an `if` with no `else`: E-LIN-003", () => {
    expect(errCodes(F(`        lin t = mint();\n        let r = "";\n        if (c) {\n            r = use(t);\n        }\n        return r;`))).toEqual(["E-LIN-003"]);
    expect(errCodes(F(`        lin t = mint();\n        let r = "";\n        if (c) {\n            r = use(t);\n        } else {\n            r = "n";\n        }\n        return r;`))).toEqual(["E-LIN-003"]);
  });
  test("consumed in neither branch: E-LIN-001 (§35.4.2)", () => {
    expect(errCodes(F(`        lin t = mint();\n        let r = "";\n        if (c) { r = "a"; } else { r = "b"; }\n        return r;`))).toEqual(["E-LIN-001"]);
  });
  test("an early `return` path that does not consume: E-LIN-001 on that path", () => {
    expect(errCodes(F(`        lin t = mint();\n        if (c) { return "early"; }\n        return use(t);`))).toEqual(["E-LIN-001"]);
    clean(F(`        lin t = mint();\n        if (c) { return use(t); }\n        return other(t);`));
  });
  test("`&&` / `||` / `? :` — a consumption on one side only: E-LIN-003; on both arms of `? :`: valid", () => {
    expect(errCodes(F(`        lin t = mint();\n        const ok = c && use(t) == "x";\n        return "r";`))).toEqual(["E-LIN-003"]);
    clean(F(`        lin t = mint();\n        return c ? use(t) : other(t);`));
    expect(errCodes(F(`        lin t = mint();\n        return c ? use(t) : "n";`))).toEqual(["E-LIN-003"]);
  });
  test("`match` arms: every arm consumes — valid; one arm does not — E-LIN-003 (§35.4.3)", async () => {
    const decls = `    type Role:enum = { Admin, User, Guest }`;
    const ok = prog(`${decls}\n    function g(r: Role) -> string {\n        lin t = mint();\n        return match r {\n            .Admin :> use(t),\n            .User :> other(t),\n            .Guest :> use(t),\n        };\n    }`,
      `        <p id="o">\${g(.User)}</p>`);
    await load(ok);
    expect($("#o").textContent).toBe("other:tok");
    const bad = prog(`${decls}\n    function g(r: Role) -> string {\n        lin t = mint();\n        return match r {\n            .Admin :> use(t),\n            .User :> other(t),\n            .Guest :> "none",\n        };\n    }`,
      `        <p id="o">\${g(.User)}</p>`);
    expect(errCodes(bad)).toEqual(["E-LIN-003"]);
  });
  test("a `lin` used as the `match` subject is its consumption (§35.3 rule 5)", () => {
    const decls = `    type Role:enum = { Admin, User }\n    function role() -> Role {\n        return .User;\n    }`;
    expect(errCodes(prog(`${decls}\n    function g() -> string {\n        lin r = role();\n        return match r {\n            .Admin :> "a",\n            .User :> "u",\n        };\n    }`, `        <p id="o">\${g()}</p>`))).toEqual([]);
  });
  test("loops: an outer `lin` consumed inside any loop body — E-LIN-002 (§35.4.4), every head", () => {
    expect(errCodes(F(`        lin t = mint();\n        let r = "";\n        for (i of 0..2) {\n            r = use(t);\n        }\n        return r;`))).toEqual(["E-LIN-002"]);
    expect(errCodes(F(`        lin t = mint();\n        let r = "";\n        for {\n            r = use(t);\n            break;\n        }\n        return r;`))).toEqual(["E-LIN-002"]);
    expect(errCodes(F(`        lin t = mint();\n        let n = 0;\n        for (use(t) == "z") {\n            n = n + 1;\n        }\n        return "r";`))).toEqual(["E-LIN-002"]);
  });
  test("a `lin` declared AND consumed in one iteration is valid (§35.4.4.1, runtime); unconsumed — E-LIN-001", async () => {
    await load(F(`        let r = "";\n        for (i of 0..2) {\n            lin t = mint();\n            r = \`\${r}\${use(t)};\`;\n        }\n        return r;`));
    expect($("#o").textContent).toBe("used:tok;used:tok;");
    expect(errCodes(F(`        for (i of 0..2) {\n            lin t = mint();\n        }\n        return "r";`))).toEqual(["E-LIN-001"]);
  });
  test("a loop-local `lin` unconsumed on a `break` / `continue` path: E-LIN-001 on that path (§49.5.3)", () => {
    expect(errCodes(F(`        let r = "";\n        for (i of 0..3) {\n            lin t = mint();\n            if (i == 1) { continue; }\n            r = use(t);\n        }\n        return r;`))).toEqual(["E-LIN-001"]);
    expect(errCodes(F(`        let r = "";\n        for (i of 0..3) {\n            lin t = mint();\n            if (i == 1) { break; }\n            r = use(t);\n        }\n        return r;`))).toEqual(["E-LIN-001"]);
    clean(F(`        let r = "";\n        for (i of 0..3) {\n            lin t = mint();\n            if (i == 1) {\n                r = other(t);\n                continue;\n            }\n            r = use(t);\n        }\n        return r;`));
  });
  test("a `defer` that consumes the `lin` is its one consumption (§19.16.9); another use as well — E-LIN-002", () => {
    const D = `    let <out:string=""/>\n    function sink(t: string) {\n        @out = t;\n    }`;
    expect(errCodes(prog(`${D}\n    function g() {\n        lin t = mint();\n        defer sink(t);\n        @out = "body";\n    }`, `        <button onclick=g()>go</button>`))).toEqual([]);
    expect(errCodes(prog(`${D}\n    function g() {\n        lin t = mint();\n        defer sink(t);\n        sink(t);\n    }`, `        <button onclick=g()>go</button>`))).toEqual(["E-LIN-002"]);
  });
});

describe("§35.2.1 — `lin` parameters; §35.6 closures; §35.5 E-LIN-005", () => {
  test("a `lin` parameter consumed once — compiles and runs; the emitted JS is the same as without `lin`", async () => {
    const src = prog(`    function redeem(lin ticket: string, who: string) -> string {\n        return \`\${who}:\${ticket}\`;\n    }`, `        <p id="o">\${redeem("t1", "bob")}</p>`);
    await load(src);
    expect($("#o").textContent).toBe("bob:t1");
    const plain = prog(`    function redeem(ticket: string, who: string) -> string {\n        return \`\${who}:\${ticket}\`;\n    }`, `        <p id="o">\${redeem("t1", "bob")}</p>`);
    const jsOf = (s) => mods.print.printProgram(clean(s).core, "t.client.js", "scrml-runtime.js").js;
    expect(jsOf(src)).toBe(jsOf(plain));
  });
  test("a `lin` parameter: unconsumed E-LIN-001, twice E-LIN-002, one branch E-LIN-003, in a loop E-LIN-002", () => {
    const P = (b) => prog(`    function g(lin tok: string, c: boolean) -> string {\n${b}\n    }`, `        <p id="o">\${g("a", true)}</p>`);
    expect(errCodes(P(`        return "x";`))).toEqual(["E-LIN-001"]);
    expect(errCodes(P(`        const a = use(tok);\n        return use(tok);`))).toEqual(["E-LIN-002"]);
    // the path through `return "n"` has no consumption: E-LIN-001 on that path (PA reading — see progress.md)
    expect(errCodes(P(`        if (c) { return use(tok); }\n        return "n";`))).toEqual(["E-LIN-001"]);
    expect(errCodes(P(`        let r = "";\n        if (c) { r = use(tok); }\n        return r;`))).toEqual(["E-LIN-003"]);
    expect(errCodes(P(`        let r = "";\n        for (i of 0..2) { r = use(tok); }\n        return r;`))).toEqual(["E-LIN-002"]);
  });
  test("a closure capture is the consumption — once; a second capture or a use outside it: E-LIN-002", () => {
    const N = `    function seven() -> int {\n        return 7;\n    }\n    function total(xs: int[]) -> int {\n        let s = 0;\n        for (x of xs) { s = s + x; }\n        return s;\n    }`;
    const L = (b) => prog(`${N}\n    function g() -> int {\n${b}\n    }`, `        <p id="o">\${g()}</p>`);
    expect(errCodes(L(`        lin n = seven();\n        const xs = [1, 2].map(x => x + n);\n        return total(xs);`))).toEqual([]);
    expect(errCodes(L(`        lin n = seven();\n        const xs = [1, 2].map(x => x + n);\n        const ys = [1].map(y => y + n);\n        return total(xs);`))).toEqual(["E-LIN-002"]);
    expect(errCodes(L(`        lin n = seven();\n        const xs = [1, 2].map(x => x + n);\n        return total(xs) + n;`))).toEqual(["E-LIN-002"]);
    expect(errCodes(L(`        lin n = seven();\n        const xs = [1, 2].map(x => x + n + n);\n        return total(xs);`))).toEqual(["E-LIN-002"]);
  });
  test("a closure capture runs as the same program without `lin` (runtime)", async () => {
    const N = `    function seven() -> int {\n        return 7;\n    }\n    function total(xs: int[]) -> int {\n        let s = 0;\n        for (x of xs) { s = s + x; }\n        return s;\n    }`;
    await load(prog(`${N}\n    function g() -> int {\n        lin n = seven();\n        const xs = [1, 2].map(x => x + n);\n        return total(xs);\n    }`, `        <p id="o">\${g()}</p>`));
    expect($("#o").textContent).toBe("17");
  });
  test("a `?` propagation is a path out of the function: a `lin` unconsumed there is E-LIN-001", () => {
    const E = `    type E:enum = { Bad }\n    function may(x: string)! E {\n        if (x == "") fail .Bad;\n        return x;\n    }`;
    const G = (b) => prog(`${E}\n    function g()! E {\n${b}\n    }`, `        <p id="o">x</p>`);
    expect(errCodes(G(`        lin t = mint();\n        const v: string = may("a")?;\n        return use(t);`))).toEqual(["E-LIN-001"]);
    expect(errCodes(G(`        lin t = mint();\n        const v: string = may(t)?;\n        return use(v);`))).toEqual([]);
  });
  test("a non-exhaustive `match` is not judged by the linear pass (§35.4.3): E-TYPE-020 only", () => {
    const decls = `    type Role:enum = { Admin, User, Guest }`;
    const src = prog(`${decls}\n    function g(r: Role) -> string {\n        lin t = mint();\n        return match r {\n            .Admin :> use(t),\n            .User :> "u",\n        };\n    }`, `        <p id="o">\${g(.User)}</p>`);
    const cs = errCodes(src);
    expect(cs).toContain("E-TYPE-020");
    expect(cs.filter((c) => c.startsWith("E-LIN"))).toEqual([]);
  });
  test("W-LIN-001: a `lin` passed to a server function from the client (§35.7) — a warning, the program compiles", () => {
    const SQ = "?" + "{";
    const src = `<program db="./app.db">\n${H}\n    type Cnt:struct = { n: int }\n    type LoadError:enum = { Db, Transport(t: ServerCallError) }\n    let <out:int=0/>\n    function redeem(lin ticket: string)! LoadError {\n        const r: Cnt = ${SQ}\`SELECT COUNT(*) AS n FROM t WHERE k = \${ticket}\`}.get() !{ _ :> { fail .Db; } };\n        return r.n;\n    }\n    function go() {\n        lin t = mint();\n        @out = redeem(t) !{ _ :> 0 };\n    }\n    <main>\n        <button onclick=go()>go</button>\n    </main>\n</program>\n`;
    expect(errCodes(src)).toEqual([]);
    expect(allCodes(src)).toContain("W-LIN-001");
  });
  test("a declaration that shadows an enclosing `lin`: E-LIN-005", () => {
    expect(errCodes(F(`        lin t = mint();\n        for (i of 0..1) {\n            let t = 1;\n        }\n        return use(t);`))).toContain("E-LIN-005");
  });
});
