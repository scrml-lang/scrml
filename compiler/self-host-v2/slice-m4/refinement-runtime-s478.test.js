// refinement-runtime-s478.test.js — s478-boot-refinement-runtime: the BOUNDARY zone's runtime
// check of a refinement type (SPEC §53.4.3, §53.4.5, §53.9).
//
// §53.11: "The compiler SHALL emit a runtime check for every boundary-zone assignment that it cannot
// statically elide. The runtime check SHALL halt execution and produce E-CONTRACT-001-RT before the
// assignment is applied." Built here at two positions:
//   A. a function declaration's refined PARAMETER — checked at the function's entry (§53.9.1 "The
//      compiler SHALL emit a runtime check when the function is called with an unconstrained
//      argument"), a nested function's too; a LITERAL argument is the static zone (§53.4.2 rule 1):
//      one that demonstrably fails is E-CONTRACT-001 at compile time;
//   B. a `const` local whose value is not a literal — checked as it binds (§53.4.3 rule 1, §53.4.5
//      "The check SHALL be emitted at the assignment site");
//   C. what stays refused by name (fail closed): a `let` local, a return type, a refinement inside a
//      type (`T(p)[]`, `T(p) | not`), a function expression's parameter, a host-backed wrapper.
// Every program is compiled from source by the bootstrap, its Core checked (check.scrml), printed
// and RUN (happy-dom).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "t.scrml", src }], "t.scrml");
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code).sort();
const clean = (src) => {
  const r = fe(src);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const clickTrap = (el) => {
  const out = [];
  const onErr = (e) => out.push(e.error);
  window.addEventListener("error", onErr);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.removeEventListener("error", onErr);
  takePageErrors();
  return out;
};
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s478rr-" + k++, []);
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};
const opName = (op) => (typeof op === "string" ? op : op && op.variant);
const refineChecks = (core) => find(core, (n) => n.variant === "Prim" && opName(n.data.op) === "RefineCheck");

describe("A — a refined parameter is checked at the function's entry (§53.9.1)", () => {
  const src = `<program>
    let <amount:number=5000/>
    function process(amt: number(>0 && <10000)) { @amount = amt; }
    <button id="ok" onclick=process(@amount + 100)>Ok</button>
    <button id="bad" onclick=process(@amount * 3)>Bad</button>
    <p id="amt">\${@amount}</p>
</program>
`;

  test("a conforming argument passes; a violating one traps E-CONTRACT-001-RT before the body runs", async () => {
    expect(refineChecks(clean(src).core).length).toBe(1);
    await load(src);
    expect(clickTrap($("#ok"))).toEqual([]);
    expect($("#amt").textContent).toBe("5100");
    const e = clickTrap($("#bad"));
    expect(e.map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect(e[0].detail.value).toBe(15300);
    expect(e[0].detail.failing).toBe("value < 10000");
    expect(e[0].detail.what).toBe("parameter `amt` of `process`");
    expect(e[0].detail.at).toBe("t.scrml:3");
    expect($("#amt").textContent).toBe("5100");      // the prior value is preserved (§53.11)
  });

  test("`number` into an `int(>0)` parameter is the typer's error — the base type is checked before any predicate (§53.3.4)", async () => {
    const s = `<program>
    let <shown:number=0/>
    <x:number=2.5/>
    function take(n: int(>0)) { @shown = n; }
    <button id="b" onclick=take(@x)>b</button>
    <p id="o">\${@shown}</p>
</program>
`;
    // `number` into `int` is the typer's question; only a fraction that types — none here — reaches the check
    expect(codes(s).length).toBeGreaterThan(0);
  });

  test("a `.length` predicate counts code points (App. D.1)", async () => {
    const s = `<program>
    let <shown:string="none"/>
    <a:string="😀😀"/>
    <b:string="x"/>
    function take(s: string(.length >= 2)) { @shown = s; }
    <button id="a" onclick=take(@a)>a</button>
    <button id="b" onclick=take(@b)>b</button>
    <p id="o">\${@shown}</p>
</program>
`;
    await load(s);
    expect(clickTrap($("#a"))).toEqual([]);
    expect($("#o").textContent).toBe("😀😀");
    expect(clickTrap($("#b")).map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect($("#o").textContent).toBe("😀😀");
  });

  test("a named shape: `string(email)` admits an address and refuses anything else", async () => {
    const s = `<program>
    let <shown:string="none"/>
    <good:string="user@example.com"/>
    <bad:string="not an address"/>
    function take(e: string(email)) { @shown = e; }
    <button id="g" onclick=take(@good)>g</button>
    <button id="b" onclick=take(@bad)>b</button>
    <p id="o">\${@shown}</p>
</program>
`;
    await load(s);
    expect(clickTrap($("#g"))).toEqual([]);
    expect($("#o").textContent).toBe("user@example.com");
    expect(clickTrap($("#b")).map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect($("#o").textContent).toBe("user@example.com");
  });

  test("`string(url)` refuses a non-safe scheme, read case-insensitively (§53.6.1, normative)", async () => {
    const s = `<program>
    let <shown:string="none"/>
    <safe:string="https://scrml.dev/"/>
    <evil:string="JaVaScRiPt:alert(1)"/>
    <rel:string="/users/1"/>
    function show(link: string(url)) { @shown = link; }
    <button id="ok" onclick=show(@safe)>ok</button>
    <button id="bad" onclick=show(@evil)>bad</button>
    <button id="rel" onclick=show(@rel)>rel</button>
    <p id="o">\${@shown}</p>
</program>
`;
    await load(s);
    expect(clickTrap($("#ok"))).toEqual([]);
    expect($("#o").textContent).toBe("https://scrml.dev/");
    expect(clickTrap($("#bad")).map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect(clickTrap($("#rel")).map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect($("#o").textContent).toBe("https://scrml.dev/");
  });

  test("a NESTED function's refined parameter is checked too", async () => {
    const s = `<program>
    <good:string="https://scrml.dev/"/>
    <evil:string="javascript:alert(1)"/>
    let <shown:string="none"/>
    function show(v: string) {
        function pick(u: string(url)) -> string {
            return u;
        }
        @shown = pick(v);
    }
    <button id="good" onclick=show(@good)>Good</button>
    <button id="bad" onclick=show(@evil)>Bad</button>
    <p id="out">\${@shown}</p>
</program>
`;
    await load(s);
    expect(clickTrap($("#good"))).toEqual([]);
    expect(clickTrap($("#bad")).map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect($("#out").textContent).toBe("https://scrml.dev/");
  });

  test("`||`, `!` and the range form `lo < value < hi`", async () => {
    const s = `<program>
    let <shown:int=0/>
    let <v:int=0/>
    function take(n: int(value < 0 || 10 < value < 20 && !(==15))) { @shown = n; }
    function set(n: int) { @v = n; }
    <button id="go" onclick=take(@v)>go</button>
    <button id="m5" onclick=set(-5)>m5</button>
    <button id="p12" onclick=set(12)>p12</button>
    <button id="p15" onclick=set(15)>p15</button>
    <button id="p3" onclick=set(3)>p3</button>
    <p id="o">\${@shown}</p>
</program>
`;
    // `value < 0` is not in the §53.2.1 grammar (`value` stands only in the range form) — the reader refuses it
    expect(codes(s)).toEqual(["E-CONTRACT-002"]);
    const s2 = s.replace("value < 0 || 10 < value < 20 && !(==15)", "<0 || 10 < value < 20 && !(==15)");
    await load(s2);
    const go = () => clickTrap($("#go")).map((x) => x.code);
    clickTrap($("#m5"));
    expect(go()).toEqual([]);
    expect($("#o").textContent).toBe("-5");
    clickTrap($("#p12"));
    expect(go()).toEqual([]);
    expect($("#o").textContent).toBe("12");
    clickTrap($("#p15"));
    expect(go()).toEqual(["E-CONTRACT-001-RT"]);
    clickTrap($("#p3"));
    expect(go()).toEqual(["E-CONTRACT-001-RT"]);
    expect($("#o").textContent).toBe("12");
  });
});

describe("A — a literal argument is the static zone (§53.4.2 rule 1)", () => {
  const prog = (arg) => `<program>
    function rate(score: number(>=0 && <=100)) -> number {
        return score;
    }
    <p>\${rate(${arg})}</p>
</program>
`;
  test("a literal that satisfies the predicate compiles clean", () => {
    expect(codes(prog("75"))).toEqual([]);
  });
  test("a literal that demonstrably fails is E-CONTRACT-001", () => {
    expect(codes(prog("150"))).toEqual(["E-CONTRACT-001"]);
    expect(codes(prog("-1"))).toEqual(["E-CONTRACT-001"]);
  });
});

describe("B — a `const` local whose value is not a literal is checked as it binds", () => {
  const src = `<program>
    <good:string="https://scrml.dev/"/>
    <evil:string="javascript:alert(1)"/>
    let <shown:string="none"/>
    function show(v: string) {
        const link: string(url) = v;
        @shown = link;
    }
    <button id="good" onclick=show(@good)>Good</button>
    <button id="bad" onclick=show(@evil)>Bad</button>
    <p id="out">\${@shown}</p>
</program>
`;
  test("passes a safe URL, traps an executable one before any later statement", async () => {
    expect(refineChecks(clean(src).core).length).toBe(1);
    await load(src);
    expect(clickTrap($("#good"))).toEqual([]);
    const e = clickTrap($("#bad"));
    expect(e.map((x) => x.code)).toEqual(["E-CONTRACT-001-RT"]);
    expect(e[0].detail.what).toBe("the local `link`");
    expect($("#out").textContent).toBe("https://scrml.dev/");
  });

  test("a literal the reader proves needs no runtime check (§53.4.1: zero checks for a provable body)", () => {
    const s = `<program>
    let <shown:number=0/>
    function go() {
        const n: number(>0) = 5;
        @shown = n;
    }
    <button onclick=go()>go</button>
    <p>\${@shown}</p>
</program>
`;
    expect(refineChecks(clean(s).core).length).toBe(0);
  });

  test("a failing literal is still E-CONTRACT-001", () => {
    const s = `<program>
    function go() -> number {
        const n: number(>0) = -5;
        return n;
    }
    <p>\${go()}</p>
</program>
`;
    expect(codes(s)).toEqual(["E-CONTRACT-001"]);
  });
});

describe("C — positions not built stay refused by name (fail closed)", () => {
  const wrap = (body) => `<program>\n${body}\n    <p>x</p>\n</program>\n`;
  test("a `let` local", () => {
    expect(codes(wrap(`    function go(v: number) -> number {\n        let n: number(>0) = v;\n        return n;\n    }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a return type", () => {
    expect(codes(wrap(`    function go(v: number) -> number(>0) {\n        return v;\n    }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a refinement inside a parameter's type (`T(p)[]`, `T(p) | not`)", () => {
    expect(codes(wrap(`    function go(v: number(>0)[]) -> int {\n        return 1;\n    }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(wrap(`    function go(v: number(>0) | not) -> int {\n        return 1;\n    }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a function expression's parameter", () => {
    expect(codes(wrap(`    function go() -> int {\n        const f = function (v: number(>0)) { return 1; };\n        return 1;\n    }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a `let` cell", () => {
    expect(codes(wrap(`    let <c:number(>0)=1/>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("A — a SERVER function's refined parameter is checked on the server, before its body (§53.9.4)", () => {
  test("a conforming argument runs the body; a violating one is refused before any query (raw HTTP cannot bypass it)", async () => {
    const h = await import("./server-artifact-harness.js");
    h.mods();
    const SQ = "?" + "{";
    const src = `<program db="./app.db">
    function save(n: int(>0 && <=100)) -> int {
        ${SQ}\`INSERT INTO t (n) VALUES (\${n})\`}.run() !{ _ :> { return 0; } };
        return n;
    }
    let <n:int=0/>
    <button onclick={ @n = save(5) !{ .Transport(t) :> return }; }>save</button>
</program>
`;
    const r = h.compile(src);
    expect(h.check(r.core)).toEqual([]);
    expect(refineChecks(r.core.server).length).toBe(1);
    const spy = h.spyDriver();
    const { srv, routes } = await h.serve(r.core, spy.fn);
    const path = h.pathOf(routes, "save");
    expect((await h.post(srv, path, [5])).status).toBe(200);
    expect(spy.calls.length).toBe(1);
    expect((await h.post(srv, path, [500])).status).toBe(500);
    expect((await h.post(srv, path, [0])).status).toBe(500);
    expect(spy.calls.length).toBe(1);      // nothing reached the database
  });
});
