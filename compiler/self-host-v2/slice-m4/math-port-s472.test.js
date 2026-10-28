// math-port-s472.test.js — s472-boot-math-port: the bootstrap EMITS an admitted
// `import:host` (SPEC §21.3.1) and `scrml:math` is ported to the §66 dialect and
// the S469 §41.18 API, its `Math.*` reach in the thin host file stdlib/math/host.js.
//
// Rulings in force (scrml-support/user-voice-scrml.md, S472):
//   "stdlib host `.js` output location" — "a stdlib module's host `.js` file … is
//   copied to `<outputDir>/_scrml/<module>/<file>` and imported from there by BOTH
//   `program.client.js` and `program.server.js`; a host file that climbs out of its
//   module directory is refused."
//   "host function type, math API, remaining review debt" — 1. "an `import:host`
//   binding is usable ONLY as the direct callee of a `return` in a fully typed
//   scrml function; the wrapper's signature IS the host function's type, and the
//   returned value is decoded against it at that point (… mismatch =
//   `E-HOST-VALUE-MISMATCH-RT`)"; 2. "`scrml:math` port ships the S469 §41.18 API
//   directly"; 3. "`min`/`max` are 2-arg; `minOf(xs)` / `maxOf(xs)` take a tape and
//   return `number | not` (`not` for an empty tape)".

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { mods, check, serve, post, pathOf, bridge, spyDriver, plainRequest, plainRespond } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { hostResult, ScrmlTrap } from "../slice-m1/runtime/runtime.js";
import * as host from "../../../stdlib/math/host.js";

const FIXTURE = join(import.meta.dir, "src", "stdlib-s472m");
const ENTRY = "app.scrml";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (globalThis.document) globalThis.document.cookie = "scrml_csrf=; Max-Age=0; Path=/";
  expectNoPageErrors();
});

const fe = (src, root) => frontEndStdlib(mods(), [{ path: ENTRY, src }], ENTRY, root ? { stdlibRoot: root } : {});
const errors = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errors(r).map((d) => d.code).sort();
const clean = (src, root) => {
  const r = fe(src, root);
  expect(errors(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(r.stdlib.refused).toEqual([]);
  expect(check(r.core)).toEqual([]);
  return r;
};
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
let k = 0;

// a stdlib file + an entry that imports it, as the stdlib driver supplies them (s472 F2)
const STD = "scrml:hb/index.scrml";
const std = (libSrc, use = "<p>${f(2)}</p>", entryImports = "f") =>
  frontEnd(mods(), [{ path: STD, src: libSrc }, { path: ENTRY, src: `<program>\n\${ import { ${entryImports} } from "scrml:hb"; }\n${use}\n</program>\n` }], ENTRY, { stdlibPaths: [STD] });
const HEAD = 'import:host { hf } from "./h.js";\n';
const lib = (body) => HEAD + "${\n" + body + "\n}\n";
const at = (src, d) => src.slice(d.span.start, d.span.end);

// The user program the brief names: round / floor / min / minOf / parseInt from scrml:math, on the
// client AND in a server function.
const USER = `<program>
\${
    import { round, Rounding, floor, min, minOf, parseInt } from "scrml:math";

    fn showMin(xs: number[]) -> string {
        const m: number | not = minOf(xs);
        if (m is not) {
            return "none";
        }
        return \`\${m}\`;
    }

    fn showHex(s: string) -> string {
        const n: int | not = parseInt(s, 16);
        if (n is not) {
            return "bad";
        }
        return \`\${n}\`;
    }

    server function onServer(x: number) -> string {
        return \`\${round(x, .HalfEven)} \${round(x, .HalfUp)} \${floor(x)} \${min(x, 1.0)} \${showMin([x, 9.0, -1.5])} \${showHex("7f")}\`;
    }
}
let <out:string=""/>
<main>
    <p id="a">\${round(2.5, .HalfEven)} \${round(3.5, Rounding.HalfEven)} \${round(-2.5, .HalfEven)}</p>
    <p id="b">\${round(2.5, .HalfUp)} \${round(-2.5, .HalfUp)} \${round(2.4, .HalfUp)}</p>
    <p id="c">\${round(-2.5, .Floor)} \${round(-2.5, .Ceil)} \${round(-2.5, .Trunc)} \${floor(-2.1)}</p>
    <p id="d">\${min(3.0, 1.5)}</p>
    <p id="e">\${showMin([3.0, 1.5, 2.0])} \${showMin([])}</p>
    <p id="f">\${showHex("ff")} \${showHex("FF")} \${showHex("0xff")} \${showHex("-1a")} \${showHex("")}</p>
    <button id="go" onclick={ @out = onServer(-2.5) !{ .Transport(t) :> return }; }>go</button>
    <p id="out">\${@out}</p>
</main>
</program>
`;
const EXPECT_PAGE = ["2 4 -2", "3 -3 2", "-3 -2 -2 -3", "1.5", "1.5 none", "255 255 bad -26 bad"];
const EXPECT_SERVER = "-2 -3 -3 -2.5 -2.5 127";

describe("scrml:math on the bootstrap — compiled and RUN, client and server", () => {
  test("the real stdlib/math compiles on the bootstrap (no withdrawal); its Math.* reach is host-backed functions only", () => {
    const r = clean(USER);
    expect(r.stdlib.supplied.map((s) => [s.module, s.files])).toEqual([["math", ["scrml:math/index.scrml"]]]);
    const hosted = r.core.fns.filter((f) => f.host != null).map((f) => [f.sym.hint, f.host.module, f.host.file, f.host.name]);
    expect(hosted).toEqual([
      ["floor", "math", "host.js", "floor"], ["ceil", "math", "host.js", "ceil"], ["trunc", "math", "host.js", "trunc"],
      ["roundHalfEven", "math", "host.js", "roundHalfEven"], ["roundHalfUp", "math", "host.js", "roundHalfUp"],
      ["abs", "math", "host.js", "abs"], ["min", "math", "host.js", "min"], ["max", "math", "host.js", "max"],
      ["parseInt", "math", "host.js", "parseInt"], ["parseFloat", "math", "host.js", "parseFloat"],
      ["toNumber", "math", "host.js", "toNumber"], ["isNaN", "math", "host.js", "isNaN"],
    ]);
    // a host-backed function is a signature, no body (check.scrml C-H1)
    for (const f of r.core.fns.filter((x) => x.host != null)) expect(f.body.stmts).toEqual([]);
  });

  test("client: the page computes every member (ties by mode, directed modes, 2-arg min, minOf / empty tape, whole-string parseInt)", async () => {
    const r = clean(USER);
    await loadProgram(r.core, "s472-mp-c-" + k++);
    const texts = ["a", "b", "c", "d", "e", "f"].map((id) => document.querySelector("#" + id).textContent);
    expect(texts).toEqual(EXPECT_PAGE);
  });

  test("server: a server function computes the same members (the server artifact imports the host module too), and the client shows its answer", async () => {
    const r = clean(USER);
    const { srv, routes, js } = await serve(r.core, spyDriver().fn);
    expect(js).toContain('import * as hostmod$0 from "./_scrml/math/host.js";');
    const res = await post(srv, pathOf(routes, "onServer"), [-2.5]);
    expect([res.status, res.json]).toEqual([200, EXPECT_SERVER]);
    await loadProgram(r.core, "s472-mp-s-" + k++);
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#go"));
    await settle();
    expect(document.querySelector("#out").textContent).toBe(EXPECT_SERVER);
  });

  test("scrml-boot compile: the host file lands at <outputDir>/_scrml/math/host.js, both artifacts import it from there, and both run from that directory", async () => {
    const { compileFile } = await import("../../../scripts/scrml-boot.ts");
    const dir = mkdtempSync(join(tmpdir(), "s472-mp-"));
    try {
      writeFileSync(join(dir, "app.scrml"), USER);
      const out = join(dir, "out");
      const c = await compileFile(join(dir, "app.scrml"), { outDir: out });
      expect(c.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(c.ok).toBe(true);
      expect(c.written).toContain("_scrml/math/host.js");
      expect(readFileSync(join(out, "_scrml", "math", "host.js"), "utf8")).toBe(readFileSync(join(import.meta.dir, "..", "..", "..", "stdlib", "math", "host.js"), "utf8"));
      const client = readFileSync(join(out, "program.client.js"), "utf8");
      const server = readFileSync(join(out, "program.server.js"), "utf8");
      for (const js of [client, server]) expect(js).toContain('import * as hostmod$0 from "./_scrml/math/host.js";');
      // the server artifact, loaded FROM the output directory, resolves the host module there
      const mod = await import(pathToFileURL(join(out, "program.server.js")).href);
      const srv = mod.createServer({ connect: () => spyDriver().fn, log: () => {}, respond: plainRespond });
      const route = mod.manifest.routes.find((x) => x.fn === "onServer").path;
      const res = await srv.fetch(plainRequest(route, "POST", { "Content-Type": "application/json", Cookie: "scrml_csrf=t", "X-CSRF-Token": "t" }, "[2.5]"));
      expect([res.status, JSON.parse(await res.text())]).toEqual([200, "2 3 2 1 -1.5 127"]);
      // a recompile with no host module clears the compiler's `_scrml/` directory
      writeFileSync(join(dir, "app.scrml"), "<program>\n<p>hi</p>\n</program>\n");
      const c2 = await compileFile(join(dir, "app.scrml"), { outDir: out });
      expect(c2.ok).toBe(true);
      expect(existsSync(join(out, "_scrml"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  test("E-INT-CONVERSION-RT: floor / ceil / trunc / round of NaN, ±∞, or a result outside ±(2^53−1) traps (§41.18, §19.17) — in a server function, a 500", async () => {
    const src = `<program>
\${
    import { round, Rounding, floor, ceil, trunc } from "scrml:math";
    server function conv(x: number, which: int) -> int {
        if (which == 0) { return floor(x); }
        if (which == 1) { return ceil(x); }
        if (which == 2) { return trunc(x); }
        return round(x, .HalfEven);
    }
}
let <out:int=0/>
<main><button id="go" onclick={ @out = conv(1.0, 0) !{ .Transport(t) :> return }; }>go</button></main>
</program>
`;
    const r = clean(src);
    const logs = [];
    const { srv, routes } = await serve(r.core, spyDriver().fn, logs);
    const path = pathOf(routes, "conv");
    expect((await post(srv, path, [2.9, 0])).json).toBe(2);
    for (const which of [0, 1, 2, 3]) {
      const res = await post(srv, path, [1e300, which]);
      expect([res.status, res.json]).toEqual([500, { error: "Internal Server Error" }]);
      expect(res.text).not.toContain("E-INT-CONVERSION-RT");
    }
    expect(logs.map((l) => String(l.error?.code ?? l.code ?? JSON.stringify(l))).filter((x) => x.includes("E-INT-CONVERSION-RT")).length).toBe(4);
  });
});

describe("the host file itself (stdlib/math/host.js) — the §41.18 semantics", () => {
  const trapCode = (f) => { try { f(); return null; } catch (e) { return e.code; } };
  test("rounding modes and ties; -0 is the int 0", () => {
    expect([host.roundHalfEven(2.5), host.roundHalfEven(-2.5), host.roundHalfEven(3.5), host.roundHalfEven(-3.5), host.roundHalfEven(0.5), host.roundHalfEven(-0.5), host.roundHalfEven(2.4), host.roundHalfEven(2.6)]).toEqual([2, -2, 4, -4, 0, 0, 2, 3]);
    expect([host.roundHalfUp(2.5), host.roundHalfUp(-2.5), host.roundHalfUp(-0.4), host.roundHalfUp(0.5), host.roundHalfUp(-2.6)]).toEqual([3, -3, 0, 1, -3]);
    expect(Object.is(host.trunc(-0.5), 0)).toBe(true);
    expect([host.floor(-2.1), host.ceil(-2.9), host.trunc(-2.9), host.floor(9007199254740991)]).toEqual([-3, -2, -2, 9007199254740991]);
  });
  test("NaN / ±∞ / past 2^53−1 → the E-INT-CONVERSION-RT trap, never a wrong int", () => {
    for (const f of [host.floor, host.ceil, host.trunc, host.roundHalfEven, host.roundHalfUp]) {
      for (const x of [NaN, Infinity, -Infinity, 2 ** 53, -(2 ** 53), 1e300]) expect(trapCode(() => f(x))).toBe("E-INT-CONVERSION-RT");
    }
  });
  test("parseInt: whole string, base 2–36, either letter case, ASCII digits only; `not` otherwise", () => {
    expect([host.parseInt("ff", 16), host.parseInt("FF", 16), host.parseInt("-1010", 2), host.parseInt("z", 36), host.parseInt("42", 10), host.parseInt("-0", 10)]).toEqual([255, 255, -10, 35, 42, 0]);
    for (const [s, r] of [["0xff", 16], ["10px", 10], [" 1", 10], ["+1", 10], ["", 10], ["-", 10], ["2", 2], ["1", 1], ["1", 37], ["1", 2.5], ["K", 36], ["9007199254740992", 10]]) {
      expect(host.parseInt(s, r)).toBe(null);
    }
    expect(host.parseInt("9007199254740991", 10)).toBe(9007199254740991);
  });
  test("parseFloat / toNumber: the whole string, as number.parse — finite only, `-0` reads 0; `not` otherwise", () => {
    expect([host.parseFloat("3.14"), host.parseFloat("-1e3"), host.parseFloat(".5"), host.parseFloat("5."), host.toNumber("42"), Object.is(host.toNumber("-0"), 0)]).toEqual([3.14, -1000, 0.5, 5, 42, true]);
    for (const s of ["", "1.5kg", " 1", "+1", "abc", "1e400", "NaN", "Infinity", "0x10"]) {
      expect([s, host.parseFloat(s), host.toNumber(s)]).toEqual([s, null, null]);
    }
  });
  test("min / max are two-argument; abs; isNaN does not coerce", () => {
    expect([host.min(3, 1), host.max(3, 1), host.abs(-5), host.isNaN(NaN), host.isNaN(1)]).toEqual([1, 3, 5, true, false]);
  });
});

describe("§41.18 API negatives on the bootstrap", () => {
  test("bare `round(x)` is E-CALL-ARITY (the mode is REQUIRED; no default)", () => {
    const src = `<program>\n\${ import { round } from "scrml:math"; }\n<p>\${round(2.5)}</p>\n</program>\n`;
    const r = fe(src);
    expect(codes(r)).toEqual(["E-CALL-ARITY"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toBe("round(2.5)");
  });

  test("`min` / `max` take exactly two numbers (3 args is E-CALL-ARITY); `minOf` takes a tape", () => {
    expect(codes(fe(`<program>\n\${ import { min } from "scrml:math"; }\n<p>\${min(3.0, 1.0, 2.0)}</p>\n</program>\n`))).toEqual(["E-CALL-ARITY"]);
    expect(codes(fe(`<program>\n\${ import { minOf } from "scrml:math"; }\n<p>\${minOf(3.0)}</p>\n</program>\n`)).length).toBeGreaterThan(0);
  });

  test("`parseInt` without its radix is E-CALL-ARITY; its result is `int | not` — used as an int unnarrowed it is refused", () => {
    expect(codes(fe(`<program>\n\${ import { parseInt } from "scrml:math"; }\n<p>\${parseInt("42")}</p>\n</program>\n`))).toEqual(["E-CALL-ARITY"]);
    const r = fe(`<program>\n\${ import { parseInt } from "scrml:math"; fn f() -> int { return parseInt("42", 10); } }\n<p>\${f()}</p>\n</program>\n`);
    expect(codes(r).length).toBeGreaterThan(0);
  });

  test("importing a NON-exported internal of scrml:math (the private wrappers) is E-IMPORT-004, and its use does not cascade", () => {
    const src = `<program>\n\${ import { roundHalfEven } from "scrml:math"; }\n<p>\${roundHalfEven(2.5)}</p>\n</program>\n`;
    const r = fe(src);
    expect(codes(r)).toEqual(["E-IMPORT-004"]);
    expect(r.diags[0].message).toContain("`roundHalfEven` is not exported by `scrml:math`");
  });

  test("the host binding names of scrml:math are not in a user's scope (`hostFloor` is not declared; importing it is E-IMPORT-004)", () => {
    expect(codes(fe(`<program>\n<p>\${hostFloor(2.5)}</p>\n</program>\n`))).toEqual(["E-SCOPE-001"]);
    expect(codes(fe(`<program>\n\${ import { hostFloor } from "scrml:math"; }\n<p>\${hostFloor(2.5)}</p>\n</program>\n`))).toEqual(["E-IMPORT-004"]);
  });
});

describe("the S472 wrapper rule — a host binding is usable ONLY as the direct callee of a whole-body `return` of a fully typed function, passing its parameters in order", () => {
  test("the rule's own shape is admitted: the wrapper becomes host-backed (a signature + the host reference, no body)", () => {
    const r = std(lib("    export fn f(x: int) -> int {\n        return hf(x);\n    }"));
    expect(errors(r)).toEqual([]);
    const f = r.core.fns.find((x) => x.sym.hint === "f");
    expect([f.host.module, f.host.file, f.host.name, f.body.stmts.length]).toEqual(["hb", "h.js", "hf", 0]);
    expect(check(r.core)).toEqual([]);
  });

  const refused = [
    ["a bare reference (not a call)", "    export fn f(x: int) -> int {\n        const g: int = hf;\n        return x;\n    }"],
    ["a call that is not the return's whole operand", "    export fn f(x: int) -> int {\n        return hf(x) + 1;\n    }"],
    ["a call in a statement before the return", "    export fn f(x: int) -> int {\n        const y: int = hf(x);\n        return y;\n    }"],
    ["a return that is not the WHOLE body", "    export fn f(x: int) -> int {\n        if (x > 0) {\n            return x;\n        }\n        return hf(x);\n    }"],
    ["arguments that are not the parameters in order", "    export fn f(x: int, y: int) -> int {\n        return hf(y, x);\n    }"],
    ["an argument that is not a parameter", "    export fn f(x: int) -> int {\n        return hf(x + 1);\n    }"],
    ["fewer arguments than parameters", "    export fn f(x: int, y: int) -> int {\n        return hf(x);\n    }"],
    ["no declared return type (not fully typed)", "    export fn f(x: int) {\n        return hf(x);\n    }"],
    ["a `!` wrapper", "    export fn f(x: int) -> int ! {\n        return hf(x);\n    }"],
    ["a call in another function's body", "    export fn f(x: int) -> int {\n        return g(x);\n    }\n    fn g(x: int) -> int {\n        const y: int = x;\n        return hf(y) + 0;\n    }"],
  ];
  for (const [what, body] of refused) {
    test(`refused: ${what} — E-HOST-BINDING-USE at the binding`, () => {
      const src = lib(body);
      const r = std(src);
      const hits = errors(r).filter((d) => d.code === "E-HOST-BINDING-USE");
      expect(hits.length).toBe(1);
      expect(hits[0].message).toContain("usable ONLY as the direct callee");
      expect(hits[0].file).toBe(STD);
      expect(at(src, hits[0])).toBe("hf");
      // the wrapper is not host-backed
      expect((r.core?.fns ?? []).filter((x) => x.host != null)).toEqual([]);
    });
  }

  test("refused: a second wrapper of the same binding (a host function has ONE type)", () => {
    const src = lib("    export fn f(x: int) -> int {\n        return hf(x);\n    }\n    export fn f2(x: int) -> int {\n        return hf(x);\n    }");
    const r = std(src, "<p>${f(2)}</p>");
    expect(errors(r).map((d) => [d.code, at(src, d)])).toEqual([["E-HOST-BINDING-USE", "hf"]]);
    expect(errors(r)[0].message).toContain("already wrapped");
  });

  test("a wrapper type the bootstrap cannot carry across (a tape parameter, a struct / enum result) is E-BOOTSTRAP-UNSUPPORTED at the wrapper, not also E-HOST-BINDING-USE", () => {
    const tape = lib("    export fn f(xs: int[]) -> int {\n        return hf(xs);\n    }");
    expect(codes(std(tape, "<p>${f([1])}</p>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const en = lib("    export type E:enum = { A, B }\n    export fn f(x: int) -> E {\n        return hf(x);\n    }");
    expect(codes(std(en, "<p>hi</p>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("a host binding's local name also declared in the file is E-SCOPE-010", () => {
    const src = lib("    export fn f(x: int) -> int {\n        return x;\n    }\n    fn hf(x: int) -> int {\n        return x;\n    }");
    expect(codes(std(src))).toEqual(["E-SCOPE-010"]);
  });
});

describe("the S472 output-location ruling — the host file stays inside its module directory", () => {
  test("a target that climbs out of the module directory is E-IMPORT-012 (and its bindings do not cascade)", () => {
    for (const from of ["../other/h.js", "./sub/../../h.js", "h.js"]) {
      const src = `import:host { hf } from "${from}";\n\${\n    export fn f(x: int) -> int {\n        return hf(x);\n    }\n}\n`;
      expect(codes(std(src))).toEqual(["E-IMPORT-012"]);
    }
  });

  test("a FILE-form stdlib module (`scrml:x.scrml`) has no module directory: E-IMPORT-012", () => {
    const P = "scrml:flat.scrml";
    const r = frontEnd(mods(), [{ path: P, src: HEAD + "${\n    export fn f(x: int) -> int {\n        return hf(x);\n    }\n}\n" }, { path: ENTRY, src: '<program>\n${ import { f } from "scrml:flat"; }\n<p>${f(1)}</p>\n</program>\n' }], ENTRY, { stdlibPaths: [P] });
    expect(codes(r)).toEqual(["E-IMPORT-012"]);
  });

  test("a subdirectory of the module is inside it: `./lib/h.js` lands at `_scrml/<module>/lib/h.js`", () => {
    const src = 'import:host { hf } from "./lib/h.js";\n${\n    export fn f(x: int) -> int {\n        return hf(x);\n    }\n}\n';
    const r = std(src);
    expect(errors(r)).toEqual([]);
    expect(r.core.fns.filter((x) => x.host != null).map((x) => [x.host.module, x.host.file])).toEqual([["hb", "lib/h.js"]]);
  });

  test("a TypeScript target is E-BOOTSTRAP-UNSUPPORTED (the artifacts are JavaScript)", () => {
    expect(codes(std('import:host { hf } from "./h.ts";\n${\n    export fn f(x: int) -> int {\n        return hf(x);\n    }\n}\n'))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("the driver: a missing host file is E-IMPORT-006, a name it does not export as a function E-IMPORT-004; a host file that is a link out of the module, E-IMPORT-012", async () => {
    const { compileSource } = await import("../../../scripts/scrml-boot.ts");
    const dir = mkdtempSync(join(tmpdir(), "s472-mp-drv-"));
    try {
      const go = async (mod, name) => {
        writeFileSync(join(dir, "app.scrml"), `<program>\n\${ import { ${name} } from "scrml:${mod}"; }\n<p>\${${name}(1)}</p>\n</program>\n`);
        return (await compileSource(join(dir, "app.scrml"), { stdlibRoot: FIXTURE })).diagnostics.map((d) => d.code);
      };
      expect(await go("missing", "f")).toEqual(["E-IMPORT-006"]);
      expect(await go("noexport", "g")).toEqual(["E-IMPORT-004"]);
      if (process.platform !== "win32") {
        // a stdlib root whose module's host file is a symlink to a file outside the module
        const root = join(dir, "std");
        mkdirSync(join(root, "lnk"), { recursive: true });
        writeFileSync(join(dir, "outside.js"), "export function hf(x) { return x; }\n");
        symlinkSync(join(dir, "outside.js"), join(root, "lnk", "h.js"));
        writeFileSync(join(root, "lnk", "index.scrml"), HEAD + "${\n    export fn f(x: int) -> int {\n        return hf(x);\n    }\n}\n");
        writeFileSync(join(dir, "app.scrml"), '<program>\n${ import { f } from "scrml:lnk"; }\n<p>${f(1)}</p>\n</program>\n');
        expect((await compileSource(join(dir, "app.scrml"), { stdlibRoot: root })).diagnostics.map((d) => d.code)).toEqual(["E-IMPORT-012"]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});

describe("the return-point decode — a host file returning the wrong type is the E-HOST-VALUE-MISMATCH-RT trap", () => {
  const SRC = `<program>\n\${ import { anInt, maybeInt, aString, aBool, aNumber } from "scrml:bad"; }\n<p id="ok">\${anInt(0)} \${aString(0)} \${aBool(0)} \${aNumber(0)}</p>\n</program>\n`;
  const trapOf = (f) => { try { f(); return "no trap"; } catch (e) { return e.code; } };

  test("compiled and run: a fitting value passes; every non-fitting one traps (no coercion, no null into a non-optional, no thenable, int range)", async () => {
    const r = clean(SRC, FIXTURE);
    const { program } = await loadProgram(r.core, "s472-mp-bad-" + k++, ["anInt", "maybeInt", "aString", "aBool", "aNumber"], { stdlibRoot: FIXTURE });
    expect(document.querySelector("#ok").textContent).toBe("7 seven true 7.5");
    // anInt: "7", 1.5, null, undefined, a Promise, 2^53, NaN
    for (const k2 of [1, 2, 3, 4, 5, 6, 8]) expect([k2, trapOf(() => program.anInt(k2))]).toEqual([k2, "E-HOST-VALUE-MISMATCH-RT"]);
    // maybeInt: null and undefined are `not`; a string still traps
    expect([program.maybeInt(0), program.maybeInt(3), program.maybeInt(4), trapOf(() => program.maybeInt(1))]).toEqual([7, null, null, "E-HOST-VALUE-MISMATCH-RT"]);
    expect([trapOf(() => program.aString(7)), trapOf(() => program.aString(3)), trapOf(() => program.aBool(7)), trapOf(() => program.aNumber(1))]).toEqual(Array(4).fill("E-HOST-VALUE-MISMATCH-RT"));
    expect(program.aNumber(8)).toBeNaN(); // NaN is a `number`
  });

  test("on the server: a mismatch in a server function fails the request (500, the fixed text — nothing about the value reaches the client)", async () => {
    const src = `<program>\n\${\n    import { anInt } from "scrml:bad";\n    server function s(k: int) -> int {\n        return anInt(k);\n    }\n}\nlet <out:int=0/>\n<main><button onclick={ @out = s(1) !{ .Transport(t) :> return }; }>go</button></main>\n</program>\n`;
    const r = clean(src, FIXTURE);
    const logs = [];
    const { srv, routes } = await serve(r.core, spyDriver().fn, logs, { stdlibRoot: FIXTURE });
    expect((await post(srv, pathOf(routes, "s"), [0])).json).toBe(7);
    const res = await post(srv, pathOf(routes, "s"), [1]);
    expect([res.status, res.json]).toEqual([500, { error: "Internal Server Error" }]);
    expect(res.text).not.toContain("7");
    expect(JSON.stringify(logs)).toContain("E-HOST-VALUE-MISMATCH-RT");
  });

  test("runtime.js hostResult directly: each descriptor", () => {
    const t = (v, ty) => { try { return hostResult(v, ty, "t()"); } catch (e) { expect(e).toBeInstanceOf(ScrmlTrap); return e.code; } };
    const M = "E-HOST-VALUE-MISMATCH-RT";
    expect([t(3, { k: "int" }), t(-0, { k: "int" }), t(3.5, { k: "int" }), t(9007199254740992, { k: "int" }), t("3", { k: "int" })]).toEqual([3, 0, M, M, M]);
    expect([t(NaN, { k: "number" }), t("1", { k: "number" }), t(null, { k: "number" })]).toEqual([NaN, M, M]);
    expect([t("s", { k: "string" }), t(1, { k: "string" }), t(true, { k: "bool" }), t(0, { k: "bool" })]).toEqual(["s", M, true, M]);
    const mi = { k: "maybe", inner: { k: "int" } };
    expect([t(null, mi), t(undefined, mi), t(2, mi), t(2.5, mi), t(Promise.resolve(1), mi), t({ then() {} }, { k: "string" })]).toEqual([null, null, 2, M, M, M]);
  });
});

describe("adopter files never reach the host (§21.3.1 / §22.13)", () => {
  test("an adopter `import:host` is still E-IMPORT-008, its uses do not cascade, and nothing is host-backed", () => {
    const src = 'import:host { floor as hfloor } from "./h.js";\n<program>\n${\n    fn f(x: number) -> int {\n        return hfloor(x);\n    }\n}\n<p>${f(2.5)}</p>\n</program>\n';
    const r = frontEnd(mods(), [{ path: ENTRY, src }], ENTRY);
    expect(codes(r)).toEqual(["E-IMPORT-008"]);
    expect((r.core?.fns ?? []).filter((x) => x.host != null)).toEqual([]);
  });
});

describe("checkCore C-H — a host-backed Fn is a signature and a host reference, nothing else", () => {
  test("a body, a non-scalar parameter, and a path out of the module are each refused", () => {
    const r = std(lib("    export fn f(x: int) -> int {\n        return hf(x);\n    }"));
    const f = r.core.fns.find((x) => x.host != null);
    const other = r.core.fns.find((x) => x.host == null && x.body.stmts.length > 0) ?? null;
    const withFn = (g) => ({ ...r.core, fns: r.core.fns.map((x) => (x === f ? g : x)) });
    const bodyStmts = other ? other.body.stmts : [{ variant: "Return", data: { e: { variant: "Lit", data: { lit: { variant: "Int", data: { v: 1 } } } } } }];
    expect(check(withFn({ ...f, body: { stmts: bodyStmts } })).some((m) => m.startsWith("C-H1"))).toBe(true);
    expect(check(withFn({ ...f, params: [{ ...f.params[0], ty: { variant: "Seq", data: { elem: "Int", grants: f.params[0].ty } } }] })).some((m) => m.startsWith("C-H2"))).toBe(true);
    expect(check(withFn({ ...f, host: { ...f.host, file: "../x.js" } })).some((m) => m.startsWith("C-H3"))).toBe(true);
    expect(check(withFn({ ...f, host: { ...f.host, module: "a/b" } })).some((m) => m.startsWith("C-H3"))).toBe(true);
  });
});
