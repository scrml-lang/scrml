/**
 * s471-null-in-arm-refused.test.js — S471 SECURITY (gap
 * g-impl1-null-in-expression-position-arm-not-refused-s470).
 *
 * SPEC §42.1: "The token `null` is NOT a valid scrml expression, attribute value, type token,
 * or identifier. The token `undefined` is NOT a valid scrml expression …"; §42.3.2: "Comparing
 * against `null` or `undefined` SHALL be compile error E-SYNTAX-042."
 *
 * `return (local(p) !{ _ :> [p].find(isOk) != null }) ? "LOGGED IN" : "rejected"` compiled: an
 * expression-position `!{ }` arm is carried as the TEXT of a placeholder call
 * (`<operand>.__scrml_guard__("!{ … }")`), which the GCP3 walker never read. The comparison was
 * emitted against JS `null`, which a not-found `undefined` never equals — both passwords logged in.
 * The same walker also skipped a statement guard's arms / guarded statement, `ifExpr`, a `when`
 * body, arrow / function block bodies, template literals, parameter defaults, `for` iterables.
 *
 * The fix (gauntlet-phase3-eq-checks.js `sweepAbsenceTokens`) asks the tree: every node reachable
 * from the file, and every text-held body read by the reader that owns it (the one `!{ }` arm
 * reader, `guard-arm-bodies.ts`; the template-interpolation reader; the strict statement reader).
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { splitBlocks } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { runGauntletPhase3EqChecks } from "../../src/gauntlet-phase3-eq-checks.js";
import { compileScrml } from "../../src/api.js";

function gcp3(src) {
  const r = buildAST(splitBlocks("t.scrml", src));
  return runGauntletPhase3EqChecks({ filePath: "t.scrml", ast: r.ast });
}
const absence = (errs) => errs.filter((e) => e.code === "E-SYNTAX-042");

const PRE = `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function id(x) { return x }
`;
const fn = (body) => PRE + `    function t(p) {\n        ${body}\n    }\n}\n`;

const REFUSED = {
  "expression-position arm, comparison":   fn(`return (local(p) !{ _ :> p != NUL }) ? "a" : "b"`),
  "expression-position arm, bare value":   fn(`return (local(p) !{ _ :> NUL }) ? "a" : "b"`),
  "expression-position arm, call argument": fn(`return (local(p) !{ _ :> id(NUL) }) ? "a" : "b"`),
  "expression-position arm, braced body":  fn(`return (local(p) !{ _ :> { const z = NUL\n false } }) ? "a" : "b"`),
  "expression-position variant arm":       fn(`return (local(p) !{ | .Denied(r) :> r == NUL | _ :> false }) ? "a" : "b"`),
  "nested expression-position arm":        fn(`return (local(p) !{ _ :> (local(p) !{ _ :> NUL }) }) ? "a" : "b"`),
  "arm in argument position":              fn(`return id(local(p) !{ _ :> NUL })`),
  "lambda block body inside an arm":       fn(`return (local(p) !{ _ :> [p].some((q) => { return q == NUL }) }) ? "a" : "b"`),
  "template literal inside an arm":        fn("return (local(p) !{ _ :> `${p == NUL}` == \"true\" }) ? \"a\" : \"b\""),
  "statement guard, unbraced arm":         fn(`const x = local(p) !{ _ :> NUL }\n return x`),
  "statement guard, braced arm":           fn(`const x = local(p) !{ _ :> { const z = NUL\n false } }\n return x`),
  "statement guard, comparison arm":       fn(`const x = local(p) !{ | .Denied(r) :> r == NUL | _ :> false }\n return x`),
  "statement guard, guarded operand":      fn(`const x = local(NUL) !{ _ :> false }\n return x`),
  "if used as a value, arm":               fn(`const k = if (p != "") { NUL } else { 1 }\n return k`),
  "if used as a value, condition":         fn(`const k = if (p == NUL) { 1 } else { 2 }\n return k`),
  "arrow block body":                      fn(`const f = (x) => { return NUL }\n return f(p)`),
  "function expression body":              fn(`const f = function (x) { return x == NUL }\n return f(p)`),
  "template literal":                      fn("return `${p == NUL}`"),
  "for-of iterable":                       fn(`for (const x of [NUL]) { id(x) }\n return 1`),
  "parameter default":                     PRE + `    function t(p = NUL) { return p }\n}\n`,
  "match expression arm":                  PRE + `    type C:enum = { Red, Green }\n    function t(c: C) {\n        const k = match c { .Red => NUL .Green => 1 }\n        return k\n    }\n}\n`,
  "when body":                             `\${ @m = "x"\n @n = 1\n when @m changes { @n = NUL } }\n`,
};

describe("S471 — E-SYNTAX-042 reaches every expression the tree holds (§42.1)", () => {
  for (const [name, tpl] of Object.entries(REFUSED)) {
    for (const tok of ["null", "undefined"]) {
      test(`${name} [${tok}] → E-SYNTAX-042`, () => {
        const errs = absence(gcp3(tpl.replaceAll("NUL", tok)));
        expect(errs.length).toBeGreaterThan(0);
        expect(errs[0].message).toContain(`\`${tok}\``);
      });
    }
  }
});

describe("S471 — `== not` / `!= not` inside an arm is E-EQ-002 (§45), as everywhere else", () => {
  // Lowered to `!_scrml_structural_eq(x, null)`: `find`'s not-found `undefined` never equals it, so
  // `(local(p) !{ _ :> [p].find(isOk) != not }) ? "IN" : "no"` logged a wrong password in.
  for (const op of ["!=", "=="]) {
    test(`expression-position arm \`${op} not\` → E-EQ-002`, () => {
      const errs = gcp3(fn(`return (local(p) !{ _ :> [p].find(id) ${op} not }) ? "a" : "b"`)).filter((e) => e.code === "E-EQ-002");
      expect(errs.length).toBe(1);
    });
    test(`statement guard braced arm \`${op} not\` → E-EQ-002 (the arm reader's own parse reports it)`, () => {
      const dir = mkdtempSync(join(tmpdir(), "s471-eqnot-"));
      try {
        const input = join(dir, "app.scrml");
        writeFileSync(input, fn(`const x = local(p) !{ _ :> { const r = [p].find(id)\n r ${op} not } }\n return x`));
        const r = compileScrml({ inputFiles: [input], write: false, outputDir: join(dir, "out") });
        expect((r.errors ?? []).map((e) => e.code)).toContain("E-EQ-002");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe("S471 — controls stay clean, nothing is reported twice", () => {
  test("`is not` / `is given` / `not` inside an arm are canonical", () => {
    expect(absence(gcp3(fn(`return (local(p) !{ _ :> p is not }) ? "a" : "b"`)))).toEqual([]);
    expect(absence(gcp3(fn(`return (local(p) !{ _ :> p is given }) ? "a" : "b"`)))).toEqual([]);
    expect(absence(gcp3(fn(`const x = local(p) !{ _ :> not }\n return x`)))).toEqual([]);
  });
  test("the string \"null\" is a string", () => {
    expect(absence(gcp3(fn(`return (local(p) !{ _ :> p == "null" }) ? "a" : "b"`)))).toEqual([]);
    expect(absence(gcp3(fn("return `null ${p}`")))).toEqual([]);
  });
  test("a comparison the walk already reports is reported once", () => {
    expect(absence(gcp3(fn(`return p == null`))).length).toBe(1);
    expect(absence(gcp3(fn(`return p ? null : 1`))).length).toBe(1);
  });
  test("an arm diagnostic is anchored at the statement holding the arm", () => {
    const errs = absence(gcp3(fn(`return (local(p) !{ _ :> p != null }) ? "a" : "b"`)));
    expect(errs.length).toBe(1);
    expect(errs[0].line).toBe(9); // PRE is lines 1-7, `function t(p) {` line 8, the return line 9
  });
});

describe("S471 — the h16/024 review repro is refused end to end", () => {
  test("library: `[p].find(isOk) != null` in an expression-position arm does not compile", () => {
    const dir = mkdtempSync(join(tmpdir(), "s471-null-arm-"));
    try {
      const src = `import { hmac } from "scrml:crypto"
\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function isOk(p) {
        const h = hmac("k", p)
        return p == "secret" && h != ""
    }
    function local(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    export function login(p) {
        return (local(p) !{ _ :> [p].find(isOk) != null }) ? "LOGGED IN" : "rejected"
    }
}
`;
      const input = join(dir, "app.scrml");
      writeFileSync(input, src);
      const out = join(dir, "out");
      const r = compileScrml({ inputFiles: [input], write: true, outputDir: out });
      const codes = (r.errors ?? []).map((e) => e.code);
      expect(codes).toContain("E-SYNTAX-042");
      const emitted = existsSync(out) ? readdirSync(out).filter((f) => f.endsWith(".js")) : [];
      expect(emitted).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
