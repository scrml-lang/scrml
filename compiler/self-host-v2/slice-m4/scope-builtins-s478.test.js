// s478-boot-scope-builtins — spurious E-SCOPE-001 on supported programs.
//
//  1. §50.8.5 / §50.10 — "The keywordless bare naming statement `x = value` declares `x` exactly as
//     `const x = value` does": a statement `x = e;` whose `x` names nothing in scope is a declaration
//     (analyze.scrml resolveEvalStmt, re-read by parse.scrml PNs.kw), not "`x` is not a writable local".
//  2. The built-in names the bootstrap does not build (§20.1 navigate, §20.4 route, §20.6 log, §20.7
//     print / println, §6.7.3 cleanup, the browser roots of §21.3.3) are refused BY NAME —
//     E-BOOTSTRAP-UNSUPPORTED (S473 D30) — never "`log` is not declared". A user binding of the name
//     wins (§20.6.7, §20.7.5).
//  3. §20.5 / §34 E-SESSION-VALUE — a bare `session` value-use.
//  4. §6.7.3 — `cleanup(42)` is E-LIFECYCLE-004, `cleanup(f())` E-LIFECYCLE-002.
import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "s.scrml", src }]);
const codes = (src) => run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code).sort();
const prog = (fns, markup = `    <button id="b" onclick=go()>go</button>`) => `<program>\n${fns}\n${markup}\n</program>\n`;

describe("§50.8.5 — the keywordless declaration", () => {
  test("`x = 42; return x;` declares `x` (was E-SCOPE-001 twice)", () => {
    expect(codes(prog(`    function go() -> int {\n        x = 42;\n        return x;\n    }`))).toEqual([]);
  });

  test("it is `const`: a second write is refused as a write of a const local", () => {
    const c = codes(prog(`    function go() -> int {\n        x = 1;\n        x = 2;\n        return x;\n    }`));
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("E-SCOPE-001");
    expect(c).not.toContain("E-SCOPE-REDECLARE");
  });

  test("a write to a declared `let` local stays a write", () => {
    expect(codes(prog(`    function go() -> int {\n        let x = 1;\n        x = 2;\n        return x;\n    }`))).toEqual([]);
  });

  test("a parameter is written, not redeclared", () => {
    const c = codes(prog(`    function f(x: int) -> int {\n        x = 2;\n        return x;\n    }\n    function go() { const r = f(1); }`));
    expect(c).not.toContain("E-SCOPE-REDECLARE");
  });

  test("an event handler body declares too", () => {
    expect(codes(`<program>\n    let <n:int=0/>\n    <button id="b" onclick={ y = 3; @n = y; }>go</button>\n    <p>\${@n}</p>\n</program>\n`)).toEqual([]);
  });

  test("§5.2 sinks are judged first: `location = data` is never a declaration", () => {
    expect(codes(`<program>\n    let <s:string="x"/>\n    function go() {\n        location = @s;\n    }\n    <button onclick=go()>b</button>\n    <p>\${@s}</p>\n</program>\n`)).toContain("E-LOGIC-EXECUTABLE-SINK");
  });

  test("a parenthesized assignment is not a declaration", () => {
    expect(codes(prog(`    function go() {\n        (z = 1);\n    }`))).not.toEqual([]);
  });
});

describe("unbuilt built-ins are refused by name, never undeclared", () => {
  for (const [what, body] of [
    ["log", `log("x");`],
    // s478-boot-print-builtins: `print(…)` / `println(…)` are built (print-builtins-s478.test.js);
    // only the bare name — a function value — stays refused by name
    ["println (as a value)", `const f = println;`],
    ["print (as a value)", `const f = print;`],
    ["navigate", `navigate("/a");`],
    ["document (read)", `const t = document.title;`],
    ["document (write)", `document.title = "t";`],
    ["window", `const w = window.innerWidth;`],
  ]) {
    test(`\`${what}\``, () => {
      const c = codes(prog(`    function go() {\n        ${body}\n    }`));
      expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(c).not.toContain("E-SCOPE-001");
    });
  }

  test("a user-declared `log` wins over the built-in (§20.6.7)", () => {
    const c = codes(prog(`    function log(s: string) {\n        const t = s;\n    }\n    function go() {\n        log("x");\n    }`));
    expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(c).not.toContain("E-SCOPE-001");
  });

  test("an undeclared ordinary name is still E-SCOPE-001", () => {
    expect(codes(prog(`    function go() {\n        frobnicate("x");\n    }`))).toContain("E-SCOPE-001");
  });
});

describe("§20.5 — `session`", () => {
  test("a bare value-use is E-SESSION-VALUE", () => {
    const c = codes(`<program kind="tool">\n    function main(args: string[]) -> int {\n        const s = session;\n        return 0;\n    }\n</program>\n`);
    expect(c).toContain("E-SESSION-VALUE");
    expect(c).not.toContain("E-SCOPE-001");
  });

  test("a member read is not a value-use (refused by name: the session context is unbuilt)", () => {
    const c = codes(prog(`    function go() {\n        const u = session.userId;\n    }`));
    expect(c).not.toContain("E-SESSION-VALUE");
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

describe("§6.7.3 — `cleanup()` arguments", () => {
  test("a literal argument is E-LIFECYCLE-004", () => {
    expect(codes(`<program>\n  <div>\n    \${ cleanup(42) }\n  </div>\n</program>\n`)).toContain("E-LIFECYCLE-004");
  });

  test("a call argument is E-LIFECYCLE-002", () => {
    const c = codes(prog(`    function close() -> int { return 1; }\n    function go() {\n        cleanup(close());\n    }`));
    expect(c).toContain("E-LIFECYCLE-002");
  });

  test("a function argument is the supported form — refused by name (cleanup is unbuilt)", () => {
    const c = codes(prog(`    function close() { const k = 1; }\n    function go() {\n        cleanup(close);\n    }`));
    expect(c).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// s478 fix round 1 (S239 review of #1887)
describe("fix round 1 — the keywordless declaration is `const`'s twin everywhere", () => {
  const fs = (body, pre = "", markup = "<p>hi</p>") => `<program>\n    <n:int=0/>\n${pre}    \${\n        ${body}\n    }\n    ${markup}\n    <p>\${@n}</p>\n</program>\n`;

  test("MED-1: at file scope `x = 1;` is the file-scope constant (read by markup and functions)", () => {
    expect(codes(`<program>\n    \${\n        x = 1;\n        function go() -> int { return x; }\n    }\n    <p>\${x}</p>\n    <button id="b" onclick=go()>go</button>\n</program>\n`)).toEqual([]);
  });

  test("MED-1: a body-top `x = 1;` is the same item", () => {
    expect(codes(`<program>\n    x = 1;\n    <p>\${x}</p>\n</program>\n`)).toEqual([]);
  });

  test("MED-1: it gets the file-scope const's refusals (a cell read, a call)", () => {
    for (const [kw, cst] of [
      [fs("yy = @n + 1;"), fs("const yy = @n + 1;")],
      [fs("yy = f();", "    function f() -> int { return 3; }\n"), fs("const yy = f();", "    function f() -> int { return 3; }\n")],
    ]) {
      const a = codes(kw);
      expect(a).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(a).toEqual(codes(cst));
    }
  });

  test("MED-1: a second file-scope write is an assignment to a file-scope const", () => {
    expect(codes(`<program>\n    \${\n        x = 1;\n        x = 2;\n    }\n    <p>\${x}</p>\n</program>\n`)).toContain("E-ASSIGN-004");
  });

  test("MED-2 (INTERIM): an unread keywordless declaration is refused by name, never accepted", () => {
    const r = run(prog(`    function go() -> int {\n        unusedThing = 42;\n        return 1;\n    }`));
    const errs = r.diags.filter((d) => d.severity === "Error");
    expect(errs.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs[0].message).toContain("E-MU-001");
  });

  test("MED-2: a read one, and a `_`-prefixed one, are accepted", () => {
    expect(codes(prog(`    function go() -> int {\n        usedThing = 42;\n        return usedThing;\n    }`))).toEqual([]);
    expect(codes(prog(`    function go() -> int {\n        _unused = 42;\n        return 1;\n    }`))).toEqual([]);
  });

  test("LOW-5: `log = 1;` / `navigate = 1;` declare, as `const log = 1` does (§20.6.7)", () => {
    for (const n of ["log", "navigate"]) {
      expect(codes(prog(`    function go() -> int {\n        ${n} = 1;\n        return ${n};\n    }`))).toEqual([]);
    }
  });

  test("LOW-9: a cell declared after the function is never re-declared by `count = 1`", () => {
    expect(codes(`<program>\n    function go() {\n        count = 1;\n    }\n    <count:int=0/>\n    <button id="b" onclick=go()>go</button>\n    <p>\${@count}</p>\n</program>\n`)).toContain("E-SCOPE-001");
  });

  test("LOW-9: nor one declared in nested markup", () => {
    const c = codes(`<program>\n    <main>\n        <count:int=0/>\n        <button id="b" onclick={ count = 1; }>go</button>\n        <p>\${@count}</p>\n    </main>\n</program>\n`);
    expect(c).toContain("E-SCOPE-001");
  });

  test("LOW-4: `cleanup(v)` with `v` of unknown (possibly function) type is never E-LIFECYCLE-004", () => {
    const c = codes(prog(`    function go() { const v = () => 1; cleanup(v); }`));
    expect(c).not.toContain("E-LIFECYCLE-004");
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("LOW-4: a typed local value is still E-LIFECYCLE-004", () => {
    expect(codes(prog(`    function go() { const v = 3; cleanup(v); }`))).toContain("E-LIFECYCLE-004");
  });
});
