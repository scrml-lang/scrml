// file-scope-follow-s479.test.js — s479-file-scope-follow: the #1962 (s479-file-scope-init)
// follow-ups, ruled S479.
//
// Ruling: user-voice-scrml.md "⭐ RULED — #1962 file-scope questions 1–4 + `parseVariant` duplicate
// keys, PA recs adopted (S479, 2026-11-18)", items 1–4:
//   1. "Tool programs and §7.6 rule (c): exempt tool programs — §64.5.1 says a tool has no client
//      boundary; a tool has no requests and no other users, so a file-scope `let` write in a §64
//      tool is not refused by E-FILE-SCOPE-LET-SERVER-WRITE." — RULED yes.
//   2. "An initializer reaching a later binding through a call (`const A = f();` where `f` reads a
//      `Z` declared after `A`): E-SCOPE-001, the same error as reading the later binding
//      directly." — RULED yes.
//   3. "Writing another file's file-scope `let`: refuse it, PERMANENT. The alternative is to write
//      through a function the other file exports (the §66.19 pattern), so nothing is lost." — RULED yes.
//   4. "Rule (c) reading confirmed" — the §7.6 sentences stand (the §13.4 citation is corrected
//      to §12.4; the messages here follow).
// And the #1962 review LOWs:
//   L1 E-FILE-SCOPE-LET-SERVER-WRITE named an `<endpoint>` arm by its internal name
//      (`endpoint#0#Dispatch()`); L2 a call of a server-placed callee with no known result type
//      was E-BOOTSTRAP-UNSUPPORTED ("write the type") instead of E-FILE-SCOPE-SERVER-ONLY-REACH;
//   L3 `reset(x)` of a plain `let` compiled to nothing — §6.8.2: "Any other expression shape —
//      literal, function-call result, binary / ternary / unary expression, bare identifier without
//      `@`, member chain rooted at a non-`@` identifier, or computed-index access — is
//      **E-RESET-INVALID-TARGET**".
//
// RED ON MAIN (origin/main 5f20efc52): A — E-FILE-SCOPE-LET-SERVER-WRITE twice; B —
// E-BOOTSTRAP-UNSUPPORTED by name; C — E-BOOTSTRAP-UNSUPPORTED by name (direct / alias), E-SCOPE-001
// "`L` is not a writable local" (namespace); D — `endpoint#0#Dispatch()` in the message,
// E-BOOTSTRAP-UNSUPPORTED "the type … is not known", and no diagnostic at all for `reset(n)`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 180000 });

const run = (files) => frontEnd(mods(), files);
const one = (src) => run([{ path: "app.scrml", src }]);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const textOf = (sel) => document.querySelector(sel).textContent;

// =============================================================================
// A. Item 1 — a `kind="tool"` program is exempt from §7.6 rule (c)
// =============================================================================
const TOOL = `<program kind="tool" lang="js">
    \${
        let n = 0;
        function bump() { n = n + 1; }
    }
    function main(args: string[]) -> number {
        bump();
        n = n + 2;
        return n;
    }
</program>
`;

describe("A — item 1: a tool's functions may write a file-scope `let` (§7.6 rule (c), §64.5.1)", () => {
  test("a tool writing a file-scope `let` in `main` and through a helper compiles clean", () => {
    const r = run([{ path: "t.scrml", src: TOOL }]);
    expect(codes(r)).toEqual([]);
    expect(r.core.tool).not.toBe(null);
  });

  let tmp;
  let compileFile;
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), "s479-fsf-tool-"));
    ({ compileFile } = await import("../../../scripts/scrml-boot.ts"));
  });
  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

  test("…and RUNS: the `let` is the one process's state (main returns 3, its exit code)", async () => {
    const file = join(tmp, "t.scrml");
    writeFileSync(file, TOOL);
    const out = join(tmp, "out");
    const r = await compileFile(file, { outDir: out });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    const p = Bun.spawnSync(["bun", join(out, "t.js")], { cwd: tmp, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    expect(p.stderr.toString()).toBe("");
    expect(p.exitCode).toBe(3);
  }, 120000);

  test("the same writes in a web program's server function stay E-FILE-SCOPE-LET-SERVER-WRITE", () => {
    const r = one(`<program>
    \${
        let n = 0;
        function bump() { n = n + 1; }
        function srv() -> int { println("x"); bump(); return n; }
    }
    <main>
        <button onclick={ const v = srv() !{ _ :> return }; }>b</button>
    </main>
</program>
`);
    expect(codes(r)).toEqual(["E-FILE-SCOPE-LET-SERVER-WRITE"]);
  });

  // r1 (#1975 review F1) — the ruling's reason ("a tool has no requests and no other users")
  // does not hold for a §64.9 `serve=` tool, which mounts routes: rule (c) stays, whatever the
  // `serve=` value (beside the serve refusal itself). RED on edfae4e6: only the serve refusal.
  const SERVED = (attr) => `<program kind="tool" lang="js" ${attr}>
    \${
        let n = 0;
        function bump() { n = n + 1; }
    }
    function main(args: string[]) -> number {
        bump();
        return n;
    }
</program>
`;
  for (const [what, attr, serveCode] of [
    ["a well-formed `serve=7878`", "serve=7878", "E-BOOTSTRAP-UNSUPPORTED"],
    ["a misshapen `serve=\"x\"`", `serve="x"`, "E-TOOL-SERVE-PORT-INVALID"],
  ]) {
    test(`a \`serve=\` tool (${what}) is NOT exempt: E-FILE-SCOPE-LET-SERVER-WRITE beside the serve refusal`, () => {
      const r = run([{ path: "t.scrml", src: SERVED(attr) }]);
      expect(codes(r).sort()).toEqual([serveCode, "E-FILE-SCOPE-LET-SERVER-WRITE"].sort());
    });
  }
});

// =============================================================================
// B. Item 2 — an initializer reaching a later binding through a call is E-SCOPE-001
// =============================================================================
const logicProg = (logic, shown = "A") => `\${\n${logic}\n}\n<program>\n    <main>\n        <p id="v">\${${shown}}</p>\n    </main>\n</program>\n`;

describe("B — item 2: E-SCOPE-001 through a call, as for the direct read (§7.6)", () => {
  test("the direct read is E-SCOPE-001 (unchanged — the reference)", () => {
    const r = one(logicProg("    const A: int = Z + 1;\n    const Z = 5;"));
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
  });

  const cases = {
    "one call (`late()` reads `Z`)": "    function late() -> int { return Z + 1; }\n    const A: int = late();\n    const Z = 5;",
    "two calls (`mid()` → `late()`)": "    function late() -> int { return Z + 1; }\n    function mid() -> int { return late(); }\n    const A: int = mid();\n    const Z = 5;",
    "three calls (`top()` → `mid()` → `late()`)": "    function late() -> int { return Z + 1; }\n    function mid() -> int { return late() * 2; }\n    function top() -> int { return mid() + 1; }\n    const A: int = top();\n    const Z = 5;",
    "a call inside an operator (`1 + late()`)": "    function late() -> int { return Z + 1; }\n    const A: int = 1 + late();\n    const Z = 5;",
    "a later `let` WRITTEN through a call": "    function g() -> int { Z = 2; return 1; }\n    const A: int = g();\n    let Z = 5;",
    "the binding being initialized, through a call": "    function f() -> int { return A + 1; }\n    const A: int = f();",
  };
  for (const [what, logic] of Object.entries(cases)) {
    test(`${what}: E-SCOPE-001, and nothing else`, () => {
      const r = one(logicProg(logic));
      expect(codes(r)).toEqual(["E-SCOPE-001"]);
      expect(r.diags[0].message).toContain("§7.6");
    });
  }

  test("the message names the chain and the later binding", () => {
    const r = one(logicProg(cases["two calls (`mid()` → `late()`)"]));
    const m = r.diags[0].message;
    expect(m).toContain("`mid()`");
    expect(m).toContain("`late()`");
    expect(m).toContain("`Z`");
  });

  test("the same chain with `Z` declared BEFORE `A` compiles and runs (8 = (5 + 1) * 2 - … )", async () => {
    const r = one(logicProg("    const Z = 5;\n    function late() -> int { return Z + 1; }\n    function mid() -> int { return late() * 2; }\n    const A: int = mid();"));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "fsf-early-chain");
    expect(textOf("#v")).toBe("12");
  });
});

// r1 (#1975 review F2) — E-SCOPE-001 is a permanent language code: it is reported only for a use
// reached through DIRECT calls. A use reached only through a function value (an arrow function,
// a block lambda) or a nested function declaration is not proven to run at module
// initialization (`const g = () => Z;` stored, never called, is legal), so it keeps the by-name
// INTERIM refusal (E-BOOTSTRAP-UNSUPPORTED, g-boot-file-scope-init-residue-s479) — never admitted
// (a function value that IS called at init would read `Z` in its temporal dead zone).
// RED on edfae4e6: E-SCOPE-001 for every "INTERIM" case below.
describe("B2 — r1: E-SCOPE-001 only for a direct reach; a function value's reach stays INTERIM", () => {
  const interim = {
    "a stored arrow function reading `Z`": "    function mk() -> int { const g = () => Z; return 1; }\n    const A: int = mk();\n    const Z: int = 2;",
    "a stored arrow function calling a function that reads `Z`": "    function h() -> int { return Z; }\n    function mk() -> int { const g = () => h(); return 1; }\n    const A: int = mk();\n    const Z: int = 2;",
    "a nested function reading `Z`, never called": "    function mk() -> int { function inner() -> int { return Z; } return 1; }\n    const A: int = mk();\n    const Z: int = 2;",
    "a callback handed to a sequence method (called now — still not E-SCOPE-001's proof)": "    const XS: int[] = [1, 2];\n    function mk() -> int { const ys: int[] = XS.map(x => x + Z); return ys.length; }\n    const A: int = mk();\n    const Z: int = 2;",
  };
  for (const [what, logic] of Object.entries(interim)) {
    test(`${what}: E-BOOTSTRAP-UNSUPPORTED by name (INTERIM), not E-SCOPE-001`, () => {
      const r = one(logicProg(logic));
      expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(r.diags[0].message).toContain("g-boot-file-scope-init-residue-s479");
      expect(r.diags[0].message).toContain("`Z`");
    });
  }

  const proven = {
    "a direct read beside a stored arrow function": "    function mk() -> int { const g = () => Z; return Z + 1; }\n    const A: int = mk();\n    const Z: int = 2;",
    "a nested function that is called": "    function mk() -> int { function inner() -> int { return Z; } return inner(); }\n    const A: int = mk();\n    const Z: int = 2;",
    // over-approximation, pinned: `f(false)` never takes the branch that reads `Z`, but the
    // reach is static (gap g-boot-file-scope-init-residue-s479, the r1 note)
    "a read in a branch the call does not take (`f(false)`)": "    function f(b: boolean) -> int { if (b) { return Z; } return 0; }\n    const A: int = f(false);\n    const Z: int = 2;",
  };
  for (const [what, logic] of Object.entries(proven)) {
    test(`${what}: E-SCOPE-001`, () => {
      expect(codes(one(logicProg(logic)))).toEqual(["E-SCOPE-001"]);
    });
  }

  test("the stored arrow function with `Z` declared BEFORE `A` compiles", () => {
    expect(codes(one(logicProg("    const Z: int = 2;\n    function mk() -> int { const g = () => Z; return 1; }\n    const A: int = mk();")))).toEqual([]);
  });
});

// =============================================================================
// C. Item 3 — a write of another file's file-scope `let`: E-FILE-SCOPE-LET-FOREIGN-WRITE
// =============================================================================
const LIB = `\${
    type Pt:struct = { x: int, y: int }
    export let pt: Pt = { x: 0, y: 0 };
    export let xs: int[append free] = [];
    export let n = 0;
    export function setN(v: int) { n = v; }
    export function getN() -> int { return n; }
}
`;
const app = (stmt, logic = "") => `<program>
    \${ import { pt, xs, n as m, setN, getN } from "./lib.scrml"; import * as L from "./lib.scrml"; }
    \${
${logic}
    }
    let <shown:int=0/>
    <main>
        <button id="b" onclick={ ${stmt} }>b</button>
        <p id="v">\${@shown}</p>
        <p>\${m}</p>
    </main>
</program>
`;
const two = (stmt, logic) => run([{ path: "lib.scrml", src: LIB }, { path: "app.scrml", src: app(stmt, logic) }]);

describe("C — item 3: a file-scope `let` is written only in its own file (§7.6, PERMANENT)", () => {
  const cases = {
    "a named import, rebound (`m = 3`, `n as m`)": "m = 3;",
    "a part (`pt.x = 3`)": "pt.x = 3;",
    "a position (`xs[0] = 3`)": "xs[0] = 3;",
    "a tape edit (`xs.append(3)`)": "xs.append(3);",
    "a removal used as a value (`const v = xs.pop()`)": "const v = xs.pop();",
    "a namespace member, rebound (`L.n = 3`)": "L.n = 3;",
    "a namespace member's part (`L.pt.x = 3`)": "L.pt.x = 3;",
    "a namespace member's position (`L.xs[0] = 3`)": "L.xs[0] = 3;",
    "a namespace member's tape edit (`L.xs.append(3)`)": "L.xs.append(3);",
    "a namespace member's removal as a value (`const v = L.xs.pop()`)": "const v = L.xs.pop();",
  };
  for (const [what, stmt] of Object.entries(cases)) {
    test(`${what}: E-FILE-SCOPE-LET-FOREIGN-WRITE, and nothing else`, () => {
      const r = two(stmt);
      expect(codes(r)).toEqual(["E-FILE-SCOPE-LET-FOREIGN-WRITE"]);
      const msg = r.diags[0].message;
      expect(msg).toContain("lib.scrml");
      expect(msg).toContain("§66.19");
    });
  }

  test("a write inside a function of the importing file is refused the same way", () => {
    const r = two("bumpIt();", "        function bumpIt() { m = m + 1; }");
    expect(codes(r)).toEqual(["E-FILE-SCOPE-LET-FOREIGN-WRITE"]);
    expect(r.diags[0].message).toContain("`m` (`n` there)");
  });

  test("reading another file's `let` — named, aliased, through a namespace — is admitted", () => {
    expect(codes(two("@shown = m + L.n + xs.length + pt.x;"))).toEqual([]);
  });

  test("a local that shadows the imported name is the local's write", () => {
    expect(codes(two("let m = 1; m = 2; @shown = m;"))).toEqual([]);
  });

  test("the capable alternative — a function the declaring file exports (§66.19) — compiles and runs", async () => {
    const r = two("setN(getN() + 4); @shown = getN();");
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "fsf-setter");
    click(document.querySelector("#b"));
    click(document.querySelector("#b"));
    expect(textOf("#v")).toBe("8");
  });
});

// =============================================================================
// D. The #1962 review LOWs
// =============================================================================
const FSP = `type FspMethod:enum = {
  FleetStatus
  Dispatch(prompt: string, project: string)
}`;

describe("D — L1: the E-FILE-SCOPE-LET-SERVER-WRITE message names an endpoint arm as the source does", () => {
  test("the `<Dispatch>` arm of `<endpoint path=\"/fsp\">`, never `endpoint#0#Dispatch()`", () => {
    const r = one(`<program>\n${FSP}\n\${\n    let hits = 0;\n    function bump(p: string) -> int { hits = hits + 1; return hits; }\n}\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { n: bump(prompt) }>\n</endpoint>\n<p>x</p>\n</program>\n`);
    expect(codes(r)).toEqual(["E-FILE-SCOPE-LET-SERVER-WRITE"]);
    const m = r.diags[0].message;
    expect(m).toContain("The `<Dispatch>` arm of `<endpoint path=\"/fsp\">`");
    expect(m).toContain("`bump()`");
    expect(m).not.toContain("endpoint#");
    expect(m).toContain("§12.4");
    expect(m).not.toContain("§13.4");
  });
});

describe("D — L2: a server-placed callee with no known result type is §7.6 rule (a)", () => {
  for (const [what, init] of [["a direct call `lg()`", "lg()"], ["a call inside an operator `lg() + 1`", "lg() + 1"], ["an undeclared result (`function lg2()`)", "lg2()"]]) {
    test(`${what}: E-FILE-SCOPE-SERVER-ONLY-REACH, not E-BOOTSTRAP-UNSUPPORTED`, () => {
      const r = one(`<program>\n    \${\n        function lg() -> int { println("hi"); return 1; }\n        function lg2() { println("hi"); }\n        const A = ${init};\n    }\n    <main>\n        <p>\${A}</p>\n    </main>\n</program>\n`);
      expect(codes(r)).toEqual(["E-FILE-SCOPE-SERVER-ONLY-REACH"]);
    });
  }
});

describe("D — L3: `reset` of anything but a cell is E-RESET-INVALID-TARGET (§6.8.2)", () => {
  const prog = (stmt, logic = "") => `<program>\n    type P:struct = { x: int }\n    \${\n        let n = 0;\n${logic}\n    }\n    let <c:int=0/>\n    <xs:int[replace]=([1, 2])/>\n    <main>\n        <button onclick={ ${stmt} }>b</button>\n        <p>\${n}\${@c}</p>\n    </main>\n</program>\n`;
  const cases = {
    "a file-scope `let` (`reset(n)`)": "reset(n);",
    "a local (`reset(k)`)": "let k = 1; reset(k); @c = k;",
    "a member chain rooted at a non-`@` name (`reset(p.x)`)": "let p: P = { x: 1 }; reset(p.x); @c = p.x;",
    "a computed-index access (`reset(@xs[0])`)": "reset(@xs[0]);",
    "a literal (`reset(5)`)": "reset(5);",
  };
  for (const [what, stmt] of Object.entries(cases)) {
    test(`${what}: E-RESET-INVALID-TARGET, and nothing else`, () => {
      expect(codes(one(prog(stmt)))).toEqual(["E-RESET-INVALID-TARGET"]);
    });
  }
  test("`reset(@c)` stays clean", () => {
    expect(codes(one(prog("reset(@c);")))).toEqual([]);
  });
});
