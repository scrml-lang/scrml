/**
 * fix-loops.test.js — the `scrml fix` rules `loop-while` and `loop-do-while` (S469 "⭐ RULED — loops:
 * one `for`" F1; SPEC §49.4.1 / §49.3.6 / §34 E-LOOP-WHILE-RETIRED). change-id: s481-trackm2-selfhost.
 *
 * SPEC §49.4.1: "A `while` statement SHALL be rejected with E-LOOP-WHILE-RETIRED, whose fix-it is
 * `for (cond) { … }` (the same head, the keyword renamed). A `do...while` statement SHALL be rejected
 * with E-LOOP-DO-WHILE-RETIRED, whose fix-it is §49.3.6's body-first loop."
 *
 * Covered: the rewrite (labels kept, nested, `!{}` bodies, program-body code); no touch in strings,
 * comments, templates, `?{}` / `^{}` / `~{}`, members named `while`; the refusals (braceless, a head
 * holding `in` / `of`, a `do` body with `continue` or a captured name); idempotence; the impl#1 verify
 * (via the impl#1-readable heads, canonical loop shape); the wiring (opt-in, never an impl#1-safe
 * default; conformance twins exclude it).
 */

import { describe, test, expect } from "bun:test";
import { fixLoops, planLoops, canonicalLoops, WHILE_RULE, DO_WHILE_RULE, LOOP_RULES } from "../../src/commands/fix-loops.js";
import { normalizedArtifact } from "../../src/commands/fix-terminators.js";
import { fixS66, S66_RULES, IMPL1_SAFE_RULES, RULED_ONLY_RULES } from "../../src/commands/fix-s66.js";
import { parseFixArgs } from "../../src/commands/fix.js";
import { compileScrml } from "../../src/api.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const F = "/virtual/app.scrml";
const prog = (body) => `<program>\n\${\n${body}\n}\n</program>\n`;
/** Plan + apply without the verify; a second plan of the output finds nothing (idempotence). */
function fixed(src) {
  const r = fixLoops(src, { filePath: F, verify: false });
  expect(planLoops(F, r.output).sites).toEqual([]);
  return r.output;
}
const notes = (src) => fixLoops(src, { filePath: F, verify: false }).blockers.map((b) => b.reason).join("\n");

describe("loop-while — `while (cond) { … }` → `for (cond) { … }`", () => {
  test("the keyword is renamed; head and body stay as written", () => {
    expect(fixed(prog("    function f(n) {\n        let i = 0;\n        while (i < n) {\n            i = i + 1;\n        }\n        return i;\n    }")))
      .toBe(prog("    function f(n) {\n        let i = 0;\n        for (i < n) {\n            i = i + 1;\n        }\n        return i;\n    }"));
  });

  test("a label is kept; `break` / `continue` (labelled too) are untouched", () => {
    const src = prog("    function f(g) {\n        outer: while (g.more()) {\n            while (g.inner()) { if (g.x) { continue outer; } break; }\n        }\n    }");
    expect(fixed(src)).toBe(prog("    function f(g) {\n        outer: for (g.more()) {\n            for (g.inner()) { if (g.x) { continue outer; } break; }\n        }\n    }"));
  });

  test("`while(c)` glued, multi-line heads, and a loop inside a `!{}` arm body", () => {
    expect(fixed(prog("    function f() {\n        while(a &&\n              b) { g(); }\n    }"))).toBe(prog("    function f() {\n        for(a &&\n              b) { g(); }\n    }"));
    const src = prog("    function f() {\n        const v = load() !{\n            _ :> { while (busy()) { tick(); } }\n        };\n    }");
    expect(fixed(src)).toContain("_ :> { for (busy()) { tick(); } }");
  });

  test("bare <program> body code is rewritten too", () => {
    expect(fixed("<program>\n    let i = 0;\n    while (i != 3) { i = i + 1; }\n</program>\n")).toBe("<program>\n    let i = 0;\n    for (i != 3) { i = i + 1; }\n</program>\n");
  });

  test("never in strings, templates, comments, `?{}`, `^{}`, `~{}`, markup text, or a member named `while`", () => {
    const src = prog([
      '    const s = "while (x) { }";',
      "    const t = `while (y) { }`;",
      "    // while (z) { }",
      "    /* do { } while (q) */",
      "    const k = cfg.while;",
      "    function q() { return ?{SELECT 1 WHERE 1 = 1}.get(); }",
    ].join("\n")) + "<p>while (you wait) { we deliver }</p>\n";
    expect(planLoops(F, src).sites).toEqual([]);
    expect(fixLoops(src, { filePath: F, verify: false }).changed).toBe(false);
  });

  test("refused, reported: a braceless body, and a head with `in` / `of` at its top level", () => {
    const a = prog("    function f() { while (more()) step(); }");
    expect(fixLoops(a, { filePath: F, verify: false }).changed).toBe(false);
    expect(notes(a)).toContain("braceless");
    const b = prog("    function f(o) { while (k in o) { g(); } }");
    expect(fixLoops(b, { filePath: F, verify: false }).changed).toBe(false);
    expect(notes(b)).toContain("holds `in` at its top level");
    // `in` nested in a call is fine
    expect(fixed(prog("    function f(o) { while (has(k in o)) { g(); } }"))).toContain("for (has(k in o))");
  });

  test("a `while` inside a template literal's `${ … }` is reported, not rewritten", () => {
    const src = prog("    const t = `${ (() => { while (a()) { b(); } return 1; })() }`;");
    const r = fixLoops(src, { filePath: F, verify: false });
    expect(r.changed).toBe(false);
    expect(notes(src)).toContain("does not enter it");
  });
});

describe("loop-do-while — §49.3.6's body-first `for { …; if (done) { break; } }`", () => {
  test("multi-line body: the break check on its own line, the `while (c);` tail removed", () => {
    const src = prog("    function f() {\n        let n = 0;\n        do {\n            n = n + 1;\n        } while (n < 3);\n        return n;\n    }");
    expect(fixed(src)).toBe(prog("    function f() {\n        let n = 0;\n        for {\n            n = n + 1;\n            if (!(n < 3)) { break; }\n        }\n        return n;\n    }"));
  });

  test("one-line body, a missing `;` supplied; a label kept", () => {
    expect(fixed(prog("    function f() { let n = 0; again: do { n++ } while (n < 3) return n; }")))
      .toBe(prog("    function f() { let n = 0; again: for { n++; if (!(n < 3)) { break; } } return n; }"));
  });

  test("refused, reported: a body with `continue` (§49.3.6 names the counted rewrite)", () => {
    const src = prog("    function f() { let n = 0; do { n = n + 1; if (n == 2) { continue; } g(n); } while (n < 5); }");
    expect(fixLoops(src, { filePath: F, verify: false }).changed).toBe(false);
    expect(notes(src)).toContain("for (let first = true; first || cond; first = false)");
  });

  test("refused, reported: a body that declares a name the condition reads", () => {
    const src = prog("    function f() { let x = 0; do { let x = 5; g(x); } while (x < 3); }");
    expect(fixLoops(src, { filePath: F, verify: false }).changed).toBe(false);
    expect(notes(src)).toContain("declares `x`, which the condition reads");
  });

  test("a `while` nested in a `do` body is rewritten with it", () => {
    const src = prog("    function f() {\n        do {\n            while (a()) { b(); }\n        } while (c());\n    }");
    expect(fixed(src)).toBe(prog("    function f() {\n        for {\n            for (a()) { b(); }\n            if (!(c())) { break; }\n        }\n    }"));
  });
});

describe("verify — impl#1 compiles the impl#1-readable spelling of the same edits", () => {
  test("canonicalLoops: `while` ≡ `for (; c; )`, `do { S } while (c)` ≡ `for (;;) { S if (!(c)) { break; } }`", () => {
    const n = (s) => normalizedArtifact(s, canonicalLoops);
    expect(n("while (a < b) { f(); }")).toBe(n("for (; a < b; ) { f(); }"));
    expect(n("x: do { f(); } while (a && b);")).toBe(n("x: for (;;) { f(); if (!(a && b)) { break; } }"));
    expect(n("while (a) { f(); }")).not.toBe(n("while (a) { g(); }"));
    expect(n("do { f(); } while (a);")).not.toBe(n("for (;;) { f(); if (a) { break; } }"));
  });

  test("a compiling program: every loop rewritten, verified, no blocker; idempotent", () => {
    const src = prog("    function f(n) {\n        let i = 0;\n        let s = 0;\n        outer: while (i < n) {\n            i = i + 1;\n            if (i == 2) { continue; }\n            if (i == 5) { break outer; }\n            s = s + i;\n        }\n        do {\n            s = s + 1;\n        } while (s < 100);\n        return s;\n    }") + "<p>${f(10)}</p>\n";
    const r = fixLoops(src, { filePath: F });
    expect(r.blockers).toEqual([]);
    expect(r.applied.map((a) => a.rule)).toEqual([WHILE_RULE, DO_WHILE_RULE]);
    expect(r.output).toContain("outer: for (i < n) {");
    expect(r.output).toContain("            if (!(s < 100)) { break; }\n        }\n        return s;");
    expect(fixLoops(r.output, { filePath: F }).changed).toBe(false);
  });

  test("a file that does not compile is not rewritten (no vacuous verify)", () => {
    const src = prog("    function f() {\n        while (undeclaredThing) { g(); }\n    }");
    const r = fixLoops(src, { filePath: F });
    expect(r.changed).toBe(false);
    expect(r.blockers.map((b) => b.reason).join("\n")).toContain("cannot verify");
  });

  test("measured precondition: impl#1 refuses the condition head it is rewritten to (§49.8), so the rule is not impl#1-safe", () => {
    const dir = mkdtempSync(join(tmpdir(), "fix-loops-"));
    try {
      const file = join(dir, "a.scrml");
      writeFileSync(file, prog("    function f(n) {\n        let i = 0;\n        for (i < n) { i = i + 1; }\n        return i;\n    }"));
      const r = compileScrml({ inputFiles: [file], write: false, outputDir: join(dir, "out"), log: () => {} });
      expect((r.errors ?? []).map((e) => e.code)).toContain("E-IMPL1-RULED-FORM-UNSUPPORTED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("wiring", () => {
  test("opt-in only: in S66_RULES (after the terminators, before the declaration rules), never an impl#1-safe default", () => {
    expect([...LOOP_RULES]).toEqual(["loop-while", "loop-do-while"]);
    for (const r of LOOP_RULES) {
      expect(S66_RULES).toContain(r);
      expect(IMPL1_SAFE_RULES).not.toContain(r);
      expect(RULED_ONLY_RULES).toContain(r);
    }
    expect(S66_RULES.indexOf("loop-while")).toBeGreaterThan(S66_RULES.indexOf("arm-comma"));
    expect(S66_RULES.indexOf("loop-do-while")).toBeLessThan(S66_RULES.indexOf("rhs-decl"));
  });

  test("the CLI refuses `--rules=loop-while` without --s66 (its output does not compile with impl#1)", () => {
    expect(() => parseFixArgs(["a.scrml", "--rules=loop-while"])).toThrow(/impl#1 cannot compile/);
    expect(parseFixArgs(["a.scrml", "--s66", "--rules=loop-while"]).rules).toEqual(["loop-while"]);
  });

  test("fixS66 applies the loop edits with the others, and the terminators still verify first", () => {
    const src = prog("    function f(n) {\n        let i = 0\n        while (i < n) {\n            i = i + 1\n        }\n        return i\n    }");
    const r = fixS66(src, { filePath: F, rules: ["stmt-semi", "loop-while"], verify: false });
    expect(r.output).toBe(prog("    function f(n) {\n        let i = 0;\n        for (i < n) {\n            i = i + 1;\n        }\n        return i;\n    }"));
    expect(r.applied.filter((a) => a.rule === "loop-while")).toHaveLength(1);
  });
});
