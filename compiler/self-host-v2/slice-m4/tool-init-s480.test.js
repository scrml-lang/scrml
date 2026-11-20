// tool-init-s480.test.js — s479-timed-onidle (S480): §7.6 rule (a) in a `kind="tool"` program.
// Ruling: user-voice-scrml.md S479 "⭐ RULED — three open S479 questions, PA recs adopted", item 1:
//   "in a tool, refuse an initializer only when it reaches something that suspends (`?{}`, `_{}`,
//    a waiting call). Run synchronous initializers at module load, as for any other program."
// Gap g-spec-tool-file-scope-init-rule-a-s479. Every tool `function` is server-placed (FnFacts.tool),
// so before this change `const A = tick();` was E-FILE-SCOPE-SERVER-ONLY-REACH for ANY `tick`
// (red on base c9f62ee5c: tests 1 and 2 below fail there); and the tool printer did not print an
// initializer's callee that `main` does not reach (print-server serverReach).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 180000 });

const run = (src) => frontEnd(mods(), [{ path: "t.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);

// `tick` is NOT reached from `main`: only the initializers call it, at module load.
const SYNC = `<program kind="tool" lang="js">
    \${
        let calls = 0;
        function tick() -> int { calls = calls + 1; return calls * 10; }
        function twice() -> int { return tick() + tick(); }
        const A = tick();
        const B: int = twice() + A;
    }
    function main(args: string[]) -> number {
        return B + calls;
    }
</program>
`;

const SUSPENDS = `<program kind="tool" lang="js">
    \${
        function readIt() -> string { const t: string = _={ return "x" }=; return t; }
        function wrap() -> string { return readIt(); }
        const A = wrap();
    }
    function main(args: string[]) -> number {
        return 0;
    }
</program>
`;

describe("§7.6 rule (a) in a tool — synchronous initializers run at module load (ruling S479 item 1)", () => {
  test("a tool initializer calling a synchronous function compiles clean", () => {
    expect(codes(run(SYNC))).toEqual([]);
  });

  let tmp;
  let compileFile;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "s480-tool-init-"));
    ({ compileFile } = await import("../../../scripts/scrml-boot.ts"));
  });
  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  test("…and RUNS: each initializer once, in order, at module load (A=10, B=20+30+10=60, calls=3 → exit 63)", async () => {
    const file = join(tmp, "t.scrml");
    writeFileSync(file, SYNC);
    const out = join(tmp, "out");
    const r = await compileFile(file, { outDir: out });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    const p = Bun.spawnSync(["bun", join(out, "t.js")], { cwd: tmp, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    expect(p.stderr.toString()).toBe("");
    expect(p.exitCode).toBe(63);
  }, 120000);

  test("an initializer reaching a `_{}` host block (which suspends) stays E-FILE-SCOPE-SERVER-ONLY-REACH, tool-worded", () => {
    const r = run(SUSPENDS);
    expect(codes(r)).toEqual(["E-FILE-SCOPE-SERVER-ONLY-REACH"]);
    const m = errs(r)[0].message;
    expect(m).toContain("`wrap()`, which reaches `readIt()`");
    expect(m).toContain("suspends");
    expect(m).not.toContain("on the server");
  });

  test("rule (b)'s other checks still apply in a tool: a later binding through a call is E-SCOPE-001", () => {
    const r = run(`<program kind="tool" lang="js">
    \${
        function f() -> int { return Z + 1; }
        const A = f();
        const Z: int = 2;
    }
    function main(args: string[]) -> number {
        return A;
    }
</program>
`);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
  });

  test("a web program is unchanged: an initializer calling a server-placed function stays E-FILE-SCOPE-SERVER-ONLY-REACH", () => {
    const r = frontEnd(mods(), [{ path: "app.scrml", src: `<program>
    \${
        function srv() -> int { println("x"); return 1; }
        const A = srv();
    }
    <main><p>\${A}</p></main>
</program>
` }]);
    expect(codes(r)).toEqual(["E-FILE-SCOPE-SERVER-ONLY-REACH"]);
  });
});

// S480 (s480-ruled-followups) — ruling:user-voice-scrml.md-S480-four-recs-2 item 3: "in a tool,
// evaluate every file-scope initializer in source order" (#1999 review: an UNREAD initializer was
// elided by the tool printer's constsReadIn / serverReach, so a `tick()` counter was
// order-dependent). Red on base 71f68da72: `U` was not printed, so B was 20 and calls 2 (exit 32 for 43), and `bump` was not printed (exit 0 for 5).
describe("a tool evaluates every file-scope initializer, in source order (ruling S480 four-recs-2 item 3)", () => {
  const UNREAD = `<program kind="tool" lang="js">
    \${
        let calls = 0;
        function tick() -> int { calls = calls + 1; return calls * 10; }
        const A = tick();
        const U = tick();
        const B = tick();
    }
    function main(args: string[]) -> number {
        return A + B + calls;
    }
</program>
`;
  // `bump` is called ONLY by the unread initializer — it must still be printed and run.
  const ONLY_INIT = `<program kind="tool" lang="js">
    \${
        let hits = 0;
        function bump() -> int { hits = hits + 5; return hits; }
        const U = bump();
    }
    function main(args: string[]) -> number {
        return hits;
    }
</program>
`;

  let tmp;
  let compileFile;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "s480-tool-every-init-"));
    ({ compileFile } = await import("../../../scripts/scrml-boot.ts"));
  });
  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  const runTool = async (name, src) => {
    const file = join(tmp, name + ".scrml");
    writeFileSync(file, src);
    const out = join(tmp, "out-" + name);
    const r = await compileFile(file, { outDir: out });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    const p = Bun.spawnSync(["bun", join(out, name + ".js")], { cwd: tmp, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    expect(p.stderr.toString()).toBe("");
    return p.exitCode;
  };

  test("an unread initializer between two read ones runs in its place: A=10, U=20, B=30, calls=3 → exit 43", async () => {
    expect(await runTool("unread", UNREAD)).toBe(43);
  }, 120000);

  test("a function only an unread initializer calls is printed and run at module load: hits=5 → exit 5", async () => {
    expect(await runTool("onlyinit", ONLY_INIT)).toBe(5);
  }, 120000);
});
