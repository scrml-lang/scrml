// kind-tool-s477.test.js — s477-boot-kind-tool: `<program kind="tool">` (SPEC §64) on the
// bootstrap, and the §23.2.4 tool-body foreign blocks it needs (§23.2.4a).
//
// Before this lane every `<program kind=…>` was E-BOOTSTRAP-UNSUPPORTED (gap
// g-boot-kind-tool-emit-unbuilt-s473) and every admitted `_={ … }=` was refused by name
// (g-boot-foreign-block-emission-unbuilt-s473), so no CLI tool compiled on the bootstrap.
//
// The governing sentences (quoted in docs/changes/s477-boot-kind-tool/progress.md):
//   §64.1 "A `kind="tool"` top-level program emits a plain ES module: NO html, NO client.js
//         bundle, NO CSRF scaffold. … It is runnable directly (`bun <emitted>.js <args…>`)."
//   §64.2 "A `kind="tool"` program SHALL declare exactly one top-level entry `function main`.
//         … with NO `main` → `E-TOOL-001`." · "A `fn main` … is `E-TOOL-004`."
//   §64.3 "`function main(args: string[]): number` … → exit-harness … `function main(args:
//         string[])` (NO declared return) → invoke-only harness … does NOT call `process.exit`."
//   §64.4 "`<page>` children, markup body content, or client-reactive UI state inside a
//         `kind="tool"` program → `E-TOOL-003`."
//   §64   "other values → `E-TOOL-002`. `kind=` on a NESTED `<program>` → `E-TOOL-002`."
//   §23.2.4 form 3 (the tool host-I/O form) and §23.2.4a (the sealed slice, the boundary await).
// The sample tools are docs/changes/s477-boot-kind-tool/samples/; each is compiled with the real
// driver (scripts/scrml-boot.ts compileFile) into a temp dir and RUN with `bun`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadM2, frontEnd } from "./harness.js";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const SAMPLES = join(ROOT, "docs", "changes", "s477-boot-kind-tool", "samples");

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const errs = (src) => run(src).diags.filter((d) => String(d.severity).toLowerCase() === "error");
const tool = (body, attrs = ' lang="js"') => `<program kind="tool"${attrs}>\n${body}\n</program>\n`;
const MAIN = "    function main(args: string[]) -> number {\n        return 0;\n    }";

// =============================================================================
// A. The program shape (analyze.scrml kindAttrDiag / toolBodyDiags / mainShapeDiags)
// =============================================================================
describe("A — §64 `kind=` and the tool body", () => {
  test("a minimal tool compiles clean; its Core says tool, main, exit-harness, argv", () => {
    const r = run(tool(MAIN));
    expect(r.diags).toEqual([]);
    expect(r.core.tool).not.toBe(null);
    expect(r.core.tool.main.hint).toBe("main");
    expect(r.core.tool.exits).toBe(true);
    expect(r.core.tool.argv).toBe(true);
    // every `function` of a tool runs in process: main is server-placed (§64.5.1)
    expect(r.core.server.map((s) => s.sym.hint)).toContain("main");
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });

  test("no return type → the invoke-only harness (exits: false); no parameter → argv: false", () => {
    const r = run(tool("    function main() {\n        const x = 1;\n    }"));
    expect(r.diags).toEqual([]);
    expect(r.core.tool.exits).toBe(false);
    expect(r.core.tool.argv).toBe(false);
  });

  test("a web application is not a tool (CoreProgram.tool is not)", () => {
    const r = run('<program>\n    <p>"x"</p>\n</program>\n');
    expect(r.core.tool).toBe(null);
  });

  test("E-TOOL-001: no `function main`", () => {
    expect(codes(tool("    function helper() -> number {\n        return 0;\n    }"))).toEqual(["E-TOOL-001"]);
  });

  test("E-TOOL-004: `fn main` (and not also E-TOOL-001)", () => {
    expect(codes(tool("    fn main(args: string[]) -> number {\n        return 0;\n    }"))).toEqual(["E-TOOL-004"]);
  });

  test("E-TOOL-003: markup in a tool body, and a §66 declaration (reactive state) in one", () => {
    expect(codes(tool(MAIN + '\n    <p>"x"</p>'))).toEqual(["E-TOOL-003"]);
    expect(codes(tool(MAIN + "\n    let <n:int=0/>"))).toContain("E-TOOL-003");
    expect(codes(tool(MAIN + '\n    <page path="/">"x"</page>'))).toContain("E-TOOL-003");
  });

  for (const v of [`kind="cli"`, `kind="Tool"`, `kind=""`, `kind`, `kind=@k`]) {
    test(`E-TOOL-002: ${v} on the top-level program`, () => {
      const d = run(`<program ${v} lang="js">\n${MAIN}\n</program>\n`).diags;
      expect(d.map((x) => x.code)).toContain("E-TOOL-002");
      expect(d.find((x) => x.code === "E-TOOL-002").message).toContain('"tool"');
    });
  }

  test("E-TOOL-002: `kind=` on a nested `<program>` (the nested program itself stays refused)", () => {
    const c = codes(`<program>\n    <program kind="tool">\n    </program>\n    <p>"x"</p>\n</program>\n`);
    expect(c).toContain("E-TOOL-002");
  });

  test("`kind=\"service\"` (§68, DRAFT) is refused by name — INTERIM, pointing at its gap", () => {
    const d = run(`<program kind="service" lang="js">\n${MAIN}\n</program>\n`).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("g-boot-kind-service-unbuilt-s473");
  });

  test("§64.9 `serve=`: misplaced on a web app / nested program; a bad port; a tool's serve-harness is INTERIM", () => {
    expect(codes('<program serve=7878>\n    <p>"x"</p>\n</program>\n')).toEqual(["E-TOOL-SERVE-MISPLACED"]);
    expect(codes(`<program>\n    <program serve=7878>\n    </program>\n    <p>"x"</p>\n</program>\n`)).toContain("E-TOOL-SERVE-MISPLACED");
    for (const bad of [`serve="7878"`, `serve=70000`, `serve`, `serve=-1`]) {
      expect(codes(`<program kind="tool" ${bad} lang="js">\n${MAIN}\n</program>\n`)).toContain("E-TOOL-SERVE-PORT-INVALID");
    }
    const d = run(`<program kind="tool" serve=7878 lang="js">\n${MAIN}\n</program>\n`).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("g-boot-tool-serve-unbuilt-s477");
  });

  test("E-TOOL-006 (§64.5.1 / §64.6): a tool imports a page-shaped or export-less local file; a library is linked in", () => {
    const two = (lib) => frontEnd(mods, [
      { path: "lib.scrml", src: lib },
      { path: "t.scrml", src: tool('    import { f } from "./lib.scrml";\n    function main(args: string[]) -> number {\n        return 0;\n    }') },
    ], "t.scrml");
    const page = two('<program>\n    <p>"a page"</p>\n</program>\n').diags;
    expect(page.filter((d) => d.code === "E-TOOL-006").map((d) => d.file)).toEqual(["lib.scrml"]);
    expect(page.map((d) => d.code)).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    const none = two("${\n    fn f() -> int {\n        return 1;\n    }\n}\n").diags;
    expect(none.map((d) => d.code)).toContain("E-TOOL-006");
    const lib = two("${\n    export fn f() -> int {\n        return 1;\n    }\n}\n");
    expect(lib.diags).toEqual([]);
    // a web application importing the same page-shaped file keeps the old refusal (no E-TOOL-006)
    const web = frontEnd(mods, [
      { path: "lib.scrml", src: '<program>\n    <p>"a page"</p>\n</program>\n' },
      { path: "t.scrml", src: '<program>\n    ${ import { f } from "./lib.scrml"; }\n    <p>"x"</p>\n</program>\n' },
    ], "t.scrml").diags.map((d) => d.code);
    expect(web).not.toContain("E-TOOL-006");
  });

  test("main shapes the SPEC gives no meaning are refused by name (INTERIM), never compiled", () => {
    const shapes = [
      "    function main(a: string[], b: string[]) -> number {\n        return 0;\n    }",
      "    function main(n: int) -> number {\n        return 0;\n    }",
      "    function main(args: string[]) -> string {\n        return \"x\";\n    }",
    ];
    for (const s of shapes) {
      const d = run(tool(s)).diags;
      expect(d.map((x) => x.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(d.find((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("INTERIM");
    }
    // `-> int` is a numeric return (§64.3 "declares a numeric return")
    expect(codes(tool("    function main(args: string[]) -> int {\n        return 0;\n    }"))).toEqual([]);
  });
});

// =============================================================================
// B. §23.2.4 form 3 — foreign blocks in a tool, built
// =============================================================================
describe("B — tool-body foreign blocks (§23.2.4 form 3, §23.2.4a)", () => {
  test("a bare block and a value block in tool functions are admitted, lowered as Suspends on Core Foreign", () => {
    const r = run(tool('    function shout(w: string) -> string {\n        const u: string = _={ in: { w } w.toUpperCase() }=;\n        return u;\n    }\n    function main(args: string[]) -> number {\n        const s = shout("a");\n        _={ in: { s } console.log(s) }=;\n        return 0;\n    }'));
    expect(r.diags).toEqual([]);
    expect(mods.check.checkCore(r.core)).toEqual([]);
    const slices = mods["print-server"].toolSlices(r.core);
    expect(slices.map((s) => s.params.join(",")).sort()).toEqual(["s", "w"]);
    expect(slices.find((s) => s.params[0] === "w").body.trim()).toBe("w.toUpperCase()");
  });

  test("a foreign block in a `fn` of a tool is still E-FOREIGN-004 (a `fn` is pure)", () => {
    expect(codes(tool(MAIN + '\n    fn f(t: string) -> string {\n        const v: string = _={ in: { t } t }=;\n        return v;\n    }'))).toContain("E-FOREIGN-004");
  });

  test("outside a tool, a bare block is E-FOREIGN-004, and a value block in a server function stays refused by name", () => {
    const web = (b) => `<program lang="js">\n${b}\n    <p>"x"</p>\n</program>\n`;
    expect(codes(web("    function a(t: string) {\n        _={ in: { t } console.log(t) }=;\n    }"))).toContain("E-FOREIGN-004");
    const d = errs(web("    function a(t: string) -> string {\n        const v: string = _={ in: { t } t }=;\n        return v;\n    }"));
    expect(d.map((x) => x.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(d.find((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("web application's server function");
  });
});

// =============================================================================
// C. The module, compiled by the driver and RUN (scrml-boot compileFile + bun)
// =============================================================================
let tmp;
let compileFile;
let compileSource;
beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "s477-kind-tool-"));
  ({ compileFile, compileSource } = await import("../../../scripts/scrml-boot.ts"));
});
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// copy `name` (a sample, or inline source) into its own dir, compile it there, return the output dir
async function build(name, src) {
  const dir = mkdtempSync(join(tmp, name + "-"));
  const file = join(dir, name + ".scrml");
  writeFileSync(file, src ?? readFileSync(join(SAMPLES, name + ".scrml"), "utf8"));
  const out = join(dir, "out");
  const r = await compileFile(file, { outDir: out });
  return { r, dir, out, js: join(out, name + ".js") };
}

function exec(js, args = [], cwd) {
  const p = Bun.spawnSync(["bun", js, ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

describe("C — §64.1 the emitted module, run with bun", () => {
  test("echo-args: a plain module (no html, no client), args echoed, the exit code is main's return", async () => {
    const b = await build("echo-args");
    expect(b.r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(b.r.ok).toBe(true);
    expect(b.r.tool).toBe("echo-args.js");
    expect(readdirSync(b.out).sort()).toEqual([".scrml-boot-manifest.json", "echo-args.js", "runtime.js", "scrml-server-runtime.js"]);
    const js = readFileSync(b.js, "utf8");
    expect(js).not.toContain("document");
    expect(js).not.toContain("createServer");
    expect(js).toContain("const exitCode$ = await main(globalThis.process.argv.slice(2));");
    const two = exec(b.js, ["a", "b c"]);
    expect(two.out).toBe("arg: a\narg: b c\nhello a (2 args)\n");
    expect(two.code).toBe(2);
    const none = exec(b.js, []);
    expect(none.out).toBe("hello nobody (0 args)\n");
    expect(none.code).toBe(0);
  }, 300000);

  test("line-count: a value foreign block reads a host file; a usage error goes to stderr with exit 2", async () => {
    const b = await build("line-count");
    expect(b.r.ok).toBe(true);
    const f = join(b.dir, "three.txt");
    writeFileSync(f, "a\nb\nc");
    const ok = exec(b.js, [f]);
    expect(ok.out).toBe("lines: 3\n");
    expect(ok.code).toBe(0);
    const usage = exec(b.js, []);
    expect(usage.out).toBe("");
    expect(usage.err).toBe("usage: line-count <file>\n");
    expect(usage.code).toBe(2);
  }, 300000);

  test("notes-db: `?{}` against SQLite in process (§64.5) — the file beside the source, kept across runs", async () => {
    const b = await build("notes-db");
    expect(b.r.ok).toBe(true);
    const js = readFileSync(b.js, "utf8");
    expect(js).toContain("rt.connection(host$");
    expect(js).toContain("rt.envelope(");          // a `!` function's body is one transaction (§8.9.2)
    const a = exec(b.js, ["add", "first note"], tmp);
    expect(a.out).toBe("1: first note\ntotal: 1\n");
    expect(a.code).toBe(0);
    const c = exec(b.js, ["add", "second"], tmp);
    expect(c.out).toBe("1: first note\n2: second\ntotal: 2\n");
    // the database is the §8.1.1 file — beside the declaring source, not in the working directory
    expect(existsSync(join(b.dir, "notes.db"))).toBe(true);
    expect(existsSync(join(tmp, "notes.db"))).toBe(false);
  }, 300000);

  test("invoke-only (no return type): the harness never calls process.exit — a pending timer still runs; exit 0", async () => {
    const b = await build("invoke-only", tool('    function main(args: string[]) {\n        _={\n            process.stdout.write("setup\\n");\n            setTimeout(() => process.stdout.write("later\\n"), 30);\n        }=;\n    }'));
    expect(b.r.ok).toBe(true);
    const js = readFileSync(b.js, "utf8");
    expect(js).not.toContain("process.exit");
    const r = exec(b.js);
    expect(r.out).toBe("setup\nlater\n");
    expect(r.code).toBe(0);
  }, 300000);

  test("§23.2.4a the seal: a slice sees only its crossings — an uncrossed local is a ReferenceError naming the rule", async () => {
    const b = await build("sealed", tool('    function main(args: string[]) -> number {\n        const secret = "s";\n        const shown = "v";\n        _={ in: { shown } console.log(typeof secret + " " + shown) }=;\n        _={ in: { shown } console.log(secret) }=;\n        return 0;\n    }'));
    expect(b.r.ok).toBe(true);
    const r = exec(b.js);
    expect(r.out).toBe("undefined v\n");
    expect(r.err).toContain("ReferenceError");
    expect(r.err).toContain("§23.2.4a");
    expect(r.code).not.toBe(0);
  }, 300000);

  test("§23.2.4a §42.9: a slice that settles to undefined arrives as `not`", async () => {
    const b = await build("absent", tool('    function main(args: string[]) -> number {\n        const v: string | not = _={ undefined }=;\n        if (v is not) {\n            _={ console.log("absent") }=;\n            return 3;\n        }\n        return 0;\n    }'));
    expect(b.r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const r = exec(b.js);
    expect(r.out).toBe("absent\n");
    expect(r.code).toBe(3);
  }, 300000);

  test("E-FOREIGN-006 (crossing shadow) and E-FOREIGN-007 (unbuildable slice) at compile time, nothing written", async () => {
    const sh = await build("shadow", tool('    function main(args: string[]) -> number {\n        const n = args.length;\n        const o = _={ in: { n }\n            const n = 1;\n            return n;\n        }=;\n        return 0;\n    }'));
    expect(sh.r.ok).toBe(false);
    expect(sh.r.diagnostics.map((d) => d.code)).toEqual(["E-FOREIGN-006"]);
    expect(sh.r.diagnostics[0].message).toContain("`n`");
    expect(existsSync(sh.out)).toBe(false);
    const bad = await build("bad", tool('    function main(args: string[]) -> number {\n        _={ console.log(1 +) }=;\n        return 0;\n    }'));
    expect(bad.r.diagnostics.map((d) => d.code)).toEqual(["E-FOREIGN-007"]);
    expect(bad.r.diagnostics[0].line).toBe(3);
    // statements with no `;` and no `return` read as ONE expression — the message says which shape to use
    const multi = await build("multi", tool('    function main(args: string[]) -> number {\n        _={\n            console.log(1)\n            console.log(2)\n        }=;\n        return 0;\n    }'));
    expect(multi.r.diagnostics.map((d) => d.code)).toEqual(["E-FOREIGN-007"]);
    expect(multi.r.diagnostics[0].message).toContain("statement shape");
  }, 300000);

  test("the driver does not serve a tool: compileSource reports it as a tool (no client artifact)", async () => {
    const dir = mkdtempSync(join(tmp, "cs-"));
    writeFileSync(join(dir, "t.scrml"), tool(MAIN));
    const c = await compileSource(join(dir, "t.scrml"));
    expect(c.ok).toBe(true);
    expect(c.client).toBeUndefined();
    expect(c.tool.file).toBe("t.js");
    // a tool never takes the name of the runtime written beside it
    const { toolFileName } = await import("../../../scripts/scrml-boot.ts");
    expect(toolFileName("/x/runtime.scrml")).toBe("runtime.tool.js");
    expect(toolFileName("/x/scrml-server-runtime.scrml")).toBe("scrml-server-runtime.tool.js");
    expect(toolFileName("/x/fleet.scrml")).toBe("fleet.js");
  }, 300000);
});
