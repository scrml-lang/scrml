// p5-holes-s473.test.js — s473-boot-p5-holes: five holes the SPEC-coverage audit (part 5,
// §47–§51) found in the bootstrap. Each describe is RED ON MAIN (before this change) and
// green here; the probes are the audit's (probes-5/), inlined.
//
//   1. §48.8 / §48.4.1 — an unannotated return type is INFERRED from the `return`s, for
//      `fn` and `function` (§48.11 "Returns are the same in every form"): a `string`
//      returned into an `int` cell is E-TYPE-031; a `fn` whose returns differ is E-FN-007.
//      (main: the call was Unknown — `two` rendered in an `int` cell, no diagnostic.)
//   2. §51.0.J / §66.9 rule 3 — a locked declaration with a reactive initializer is
//      DERIVED, state-children or not (main: state-children made it seeded — stale UI);
//      a `rule=` on such a state-child is E-DERIVED-ENGINE-NO-RULES.
//   3. §47.13 — `scrml-boot dev` serves only what the shared impl#1 static policy admits
//      (main: `.env`, `%2eenv`, `*.db`, `.scrml` were served from the output dir).
//   4. §47.1.1 — a declared (or referenced) `_scrml_` / `__scrml_` name is
//      E-NAME-COLLIDES-RESERVED-PREFIX (main: accepted, emitted as written).
//   5. §51.0.E / ⚑ O33 — a `<program>` declaration with no value is refused at compile time,
//      by name (main: compiled clean, then threw at boot).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mods, compile } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });

const one = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const codes = (src) => one(src).diags.map((d) => d.code);
const diag = (src, code) => one(src).diags.find((d) => d.code === code);
const P = (decls, markup = "<p>x</p>") => `<program>\n${decls}\n    <main>${markup}</main>\n</program>\n`;

describe("1 — §48.8: an unannotated return type is inferred from the returns (fn AND function)", () => {
  test("p48-unannret: `fn f() { return \"s\"; }` written into an `int` cell is E-TYPE-031", () => {
    expect(codes(P("    let <n:int=0/>\n    fn f() { return \"s\"; }\n    function g() { @n = f(); }", "<p>${@n}</p><button onclick=g()>g</button>"))).toEqual(["E-TYPE-031"]);
  });
  test("p48-unannretfn: the same with `function` (§48.11 — one return rule for every form)", () => {
    expect(codes(P("    let <n:int=0/>\n    function f() { return \"s\"; }\n    function g() { @n = f(); }", "<p>${@n}</p><button onclick=g()>g</button>"))).toEqual(["E-TYPE-031"]);
  });
  test("p48-mixedret3: a `fn` returning `int` and `string` is E-FN-007 (§48.4.1) — and the write is not reported twice", () => {
    const src = P("    let <n:int=0/>\n    fn f(k: int) { if (k == 1) { return 1; } return \"two\"; }\n    function g() { @n = f(2); }", "<p>${@n}</p><button onclick=g()>g</button>");
    expect(codes(src)).toEqual(["E-FN-007"]);
    expect(diag(src, "E-FN-007").message).toContain("-> int | string");
  });
  test("p48-mixedret: a `fn` returning two struct types is E-FN-007", () => {
    expect(codes(P("    type A:struct = { a: int }\n    type B:struct = { b: int }\n    fn f(k: int) { if (k == 1) { const x: A = { a: 1 }; return x; } const y: B = { b: 2 }; return y; }\n    function g() { const z = f(1); }"))).toEqual(["E-FN-007"]);
  });
  test("a `function` returning `int` and `string` is a choice: into an `int` cell it may be a `string` — E-TYPE-031", () => {
    const src = P("    let <n:int=0/>\n    function f(k: int) { if (k == 1) { return 1; } return \"two\"; }\n    function g() { @n = f(2); }", "<p>${@n}</p><button onclick=g()>g</button>");
    expect(codes(src)).toEqual(["E-TYPE-031"]);
    expect(diag(src, "E-TYPE-031").message).toContain("one of");
  });
  test("an inferred `int` through a chain of unannotated callees (callee typed after its caller) is accepted where an `int` belongs", () => {
    expect(codes(P("    let <n:int=0/>\n    let <s:string=\"\"/>\n    fn h(k: int) { return f(k) * 2; }\n    fn f(k: int) { if (k == 1) { return 1; } return k + 2; }\n    function lbl(k: int) { if (k > 1) { return \"big\"; } return \"small\"; }\n    function g() { @n = h(2); @s = lbl(@n); }", "<p>${@n} ${@s}</p><button onclick=g()>g</button>"))).toEqual([]);
    expect(codes(P("    let <s:string=\"\"/>\n    fn h(k: int) { return f(k) * 2; }\n    fn f(k: int) { return k + 2; }\n    function g() { @s = h(2); }"))).toEqual(["E-TYPE-031"]);
  });
  test("int and `not` returns join to `int | not` (no E-FN-007): into an `int` cell that is the `T | not` refusal", () => {
    const src = P("    let <n:int=0/>\n    fn f(k: int) { if (k == 1) { return 1; } return not; }\n    function g() { @n = f(2); }");
    expect(codes(src)).toEqual(["E-TYPE-031"]);
    expect(diag(src, "E-TYPE-031").message).toContain("T | not");
  });
  test("a lambda's `return` is not the function's (returnSites skips a lambda body)", () => {
    expect(codes(P("    let <n:int=0/>\n    fn f(xs: int[]) { const ys: int[] = xs.map((x) => x + 1); return ys.length; }\n    function g() { @n = f([1]); }"))).toEqual([]);
  });
  test("RUNS: an inferred return written into its own type renders", async () => {
    const { core } = compile(P("    let <n:int=0/>\n    fn f(k: int) { return k * 3; }\n    function g() { @n = f(2); }", "<p id=\"o\">${@n}</p><button id=\"b\" onclick=g()>g</button>"));
    await loadProgram(core, "p5-infer");
    click(document.querySelector("#b"));
    expect(document.querySelector("#o").textContent).toBe("6");
  });
});

describe("2 — §51.0.J / §66.9 rule 3: a locked declaration with a reactive initializer and state-children is DERIVED", () => {
  const DERIVED = "    type Level:enum = { Low, High }\n    let <miles:int=0/>\n    <level:Level=(match @miles > 500 { true :> .High, false :> .Low }) single>\n        <Low : \"low\">\n        <High : \"high\">\n    </>\n    function bump() { @miles = @miles + 600; }";
  test("p51-derived: compiles clean, and RUNS — the rendered state follows its source (was seeded once: stayed `low`)", async () => {
    const { core } = compile(P(DERIVED, "<p id=\"lv\"><*level/></p><button id=\"b\" onclick=bump()>b</button>"));
    await loadProgram(core, "p5-derived");
    expect(document.querySelector("#lv").textContent).toBe("low");
    click(document.querySelector("#b"));
    expect(document.querySelector("#lv").textContent).toBe("high");
  });
  test("the control (no state-children) is derived too — the same behaviour", async () => {
    const { core } = compile(P("    type Level:enum = { Low, High }\n    let <miles:int=0/>\n    <level:Level=(match @miles > 500 { true :> .High, false :> .Low })/>\n    function bump() { @miles = @miles + 600; }", "<p id=\"lv\">${@level == .High}</p><button id=\"b\" onclick=bump()>b</button>"));
    await loadProgram(core, "p5-derived-ctl");
    click(document.querySelector("#b"));
    expect(document.querySelector("#lv").textContent).toBe("true");
  });
  test("a `rule=` on a state-child of a derived value is E-DERIVED-ENGINE-NO-RULES (§51.0.J)", () => {
    const src = P("    type Level:enum = { Low, High }\n    let <miles:int=0/>\n    <level:Level=(match @miles > 500 { true :> .High, false :> .Low }) single>\n        <Low rule=.High : \"low\">\n        <High : \"high\">\n    </>", "<p><*level/></p>");
    expect(codes(src)).toEqual(["E-DERIVED-ENGINE-NO-RULES"]);
  });
  test("twin: `let` before the `<` is the seeded, rule-moved form — still compiles with its rules", () => {
    expect(codes(P("    type Level:enum = { Low, High }\n    let <miles:int=0/>\n    let <level:Level=(match @miles > 500 { true :> .High, false :> .Low }) single>\n        <Low rule=.High : \"low\">\n        <High rule=.Low : \"high\">\n    </>", "<p><*level/></p>"))).toEqual([]);
  });
  test("a write to the derived value is refused", () => {
    expect(codes(P(DERIVED + "\n    function set() { @level = .High; }", "<p><*level/></p>")).length).toBeGreaterThan(0);
  });
});

describe("4 — §47.1.1: `_scrml_` / `__scrml_` names are reserved (E-NAME-COLLIDES-RESERVED-PREFIX)", () => {
  const R = "E-NAME-COLLIDES-RESERVED-PREFIX";
  test("p47-reserved: a local `const _scrml_x`", () => {
    expect(codes(P("    function g() { const _scrml_x: int = 1; }"))).toEqual([R]);
  });
  test("p47-reserved2: a local `__scrml_y` (S457); `_s7km3f2x00` is not reserved", () => {
    expect(codes(P("    function g() { const _s7km3f2x00: int = 1; const __scrml_y: int = 2; }"))).toEqual([R]);
  });
  test("every binder kind: a cell, a function, a parameter, a type, a loop binder", () => {
    expect(codes(P("    let <_scrml_c:int=0/>"))).toEqual([R]);
    expect(codes(P("    function _scrml_f() { }"))).toEqual([R]);
    expect(codes(P("    function f(__scrml_p: int) { }"))).toEqual([R]);
    expect(codes(P("    type _scrml_T:enum = { A, B }"))).toEqual([R]);
    expect(codes(P("    function f(xs: int[]) { for (const _scrml_i of xs) { } }"))).toEqual([R]);
  });
  test("a reference to a declared reserved name is refused too (S440 #9) — declaration + reference", () => {
    expect(codes(P("    let <n:int=0/>\n    function g() { const __scrml_k: int = 1; @n = __scrml_k; }"))).toEqual([R, R]);
  });
  test("twins: a string literal, markup text and an ordinary `_`-name are not names", () => {
    expect(codes(P("    let <s:string=\"_scrml_x\"/>\n    function g() { const _x: int = 1; }", "<p>__scrml_prose__ ${@s}</p>"))).toEqual([]);
  });
  test("stdlib source is exempt by path (S440 #9)", () => {
    const lib = { path: "scrml:p5/index.scrml", src: "${ export fn _scrml_helper() -> int { return 1; } }\n" };
    const r = frontEnd(mods(), [lib, { path: "app.scrml", src: P("    <p>x</p>") }]);
    expect(r.diags.map((d) => d.code).filter((c) => c === R)).toEqual([]);
  });
});

describe("5 — §51.0.E / ⚑ O33: a `<program>` declaration with no value is refused at compile time", () => {
  test("p51-noinitial: `<phase:Phase single>` over state-children — E-BOOTSTRAP-UNSUPPORTED naming O33 (was: clean, then a boot throw)", () => {
    const src = P("    type Phase:enum = { Idle, Loading, Done }\n    <phase:Phase single>\n        <Idle rule=.Loading : \"i\">\n        <Loading rule=.Done : \"l\">\n        <Done rule=.Idle : \"d\">\n    </>", "<p><*phase/></p>");
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const m = diag(src, "E-BOOTSTRAP-UNSUPPORTED").message;
    expect(m).toContain("O33");
    expect(m).toContain("initial state");
  });
  test("`<count:int/>` and `let <s:string/>` — the same (each threw at boot)", () => {
    expect(codes(P("    <count:int/>", "<p>${@count}</p>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P("    let <s:string/>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("the use-site limb: `<card/>` leaving a default-less attribute unset is refused (it threw at construction); set, it compiles", () => {
    const src = (use) => `<program>\n    <card title:string/>\n    renders <div class="card"><h2>\${title}</h2></div>\n    <main>\n        ${use}\n    </main>\n</program>\n`;
    expect(codes(src("<card/>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(diag(src("<card/>"), "E-BOOTSTRAP-UNSUPPORTED").message).toContain("O33");
    expect(codes(src(`<card title="a"/>`))).toEqual([]);
  });
  test("twin: with an initial value it compiles", () => {
    expect(codes(P("    type Phase:enum = { Idle, Loading, Done }\n    <phase:Phase=.Idle single>\n        <Idle rule=.Loading : \"i\">\n        <Loading rule=.Done : \"l\">\n        <Done rule=.Idle : \"d\">\n    </>", "<p><*phase/></p>"))).toEqual([]);
  });
});

describe("3 — §47.13: `scrml-boot dev` serves through the shared static allowlist", () => {
  const ROOT = resolve(import.meta.dir, "..", "..", "..");
  const CLI = join(ROOT, "scripts", "scrml-boot.ts");
  let tmp;
  beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), "p5-serve-")); });
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  test("devStaticTarget: encoded, dotfile, traversal, denied-class and symlink requests are refused; client artifacts are served", async () => {
    const { devStaticTarget } = await import(CLI);
    const out = join(tmp, "unit");
    mkdirSync(join(out, ".git"), { recursive: true });
    mkdirSync(join(tmp, "outside"), { recursive: true });
    for (const f of ["index.html", "program.client.js", "scrml-runtime.js", "app.db", "app.scrml", ".env", "program.client.js.map", "logo.png", "notes.txt"]) writeFileSync(join(out, f), f);
    writeFileSync(join(out, ".git", "config"), "x");
    writeFileSync(join(tmp, "outside", "secret.png"), "SECRET");
    symlinkSync(join(tmp, "outside", "secret.png"), join(out, "leak.png"));
    const assets = new Set(["index.html", "program.client.js", "scrml-runtime.js"]);
    const ok = (p) => devStaticTarget(out, assets, p);
    expect(ok("/")).toBe(join(out, "index.html"));
    expect(ok("/program.client.js")).toBe(join(out, "program.client.js"));
    expect(ok("/logo.png")).toBe(join(out, "logo.png"));                 // passive media
    for (const p of ["/.env", "/%2eenv", "/%2Eenv", "/app.db", "/APP.DB", "/app.scrml", "/program.client.js.map",
                     "/.git/config", "/%2e%2e/outside/secret.png", "/..%2foutside%2fsecret.png", "/x%5c..%5capp.db",
                     "/%00index.html", "/leak.png", "/notes.txt", "/program.server.js", "/%zz"]) {
      expect([p, ok(p)]).toEqual([p, null]);
    }
  });

  test("p47-serve: the dev server over an output dir holding `.env`, a database and the source answers 404 for each", async () => {
    const dir = join(tmp, "serve");
    mkdirSync(dir, { recursive: true });
    const src = join(dir, "app.scrml");
    writeFileSync(src, "<program>\n    let <count:int=0/>\n    function bump() { @count = @count + 1; }\n    <main>\n        <p>${@count}</p>\n        <button onclick=bump()>+</button>\n    </main>\n</program>\n");
    writeFileSync(join(dir, ".env"), "SECRET=1\n");
    writeFileSync(join(dir, "app.db"), "SQLITE");
    const p = Bun.spawn(["bun", CLI, "dev", src, "--port", "0", "--output-dir", dir], {
      cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe",
    });
    const reader = p.stderr.getReader();
    let log = "";
    const until = async (re) => {
      const end = Date.now() + 90000;
      while (!re.test(log)) {
        if (Date.now() > end) throw new Error("dev server: timed out waiting for " + re + "\n" + log);
        const { value, done } = await reader.read();
        if (done) throw new Error("dev server exited:\n" + log);
        log += new TextDecoder().decode(value);
      }
      return re.exec(log);
    };
    try {
      const port = (await until(/http:\/\/127\.0\.0\.1:(\d+)\//))[1];
      const get = (path) => Bun.fetch(`http://127.0.0.1:${port}${path}`);
      expect((await get("/")).status).toBe(200);
      expect((await get("/program.client.js")).status).toBe(200);
      expect((await get("/scrml-runtime.js")).status).toBe(200);
      for (const path of ["/.env", "/%2eenv", "/app.db", "/app.scrml"]) {
        const r = await get(path);
        const body = await r.text();
        expect([path, r.status]).toEqual([path, 404]);
        expect(body).not.toContain("SECRET");
        expect(body).not.toContain("<program>");
      }
    } finally {
      p.kill();
      await p.exited;
    }
  }, { timeout: 150000 });
});
