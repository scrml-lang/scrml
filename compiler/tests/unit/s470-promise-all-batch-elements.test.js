/**
 * s470-promise-all-batch-elements.test.js — g-promise-all-batch-puts-unawaited-call-under-sync-operator.
 *
 * In a CLIENT function the §13.2 parallel batch (`const [a, v] = await Promise.all([...])`,
 * `compiler/src/codegen/scheduling.ts:scheduleStatements`) used each declaration's WHOLE initializer
 * as an array element. A waiting call under an operator was then never awaited — the element was
 * evaluated synchronously while the array was built:
 *
 *   const a = ping(1)
 *   const v = isOk(p) ? "LOGGED IN" : "rejected"
 *   →  const [a, v] = await Promise.all([_scrml_fetch_ping(1), _scrml_fetch_isOk(p) ? "LOGGED IN" : "rejected"])
 *
 * so the ternary tested the pending Promise (truthy) and a wrong password logged in. SPEC §13.8 "The
 * rule": a waiting value stands only at a suspension point, where the compiler awaits it; in the batch
 * the only such point is the element itself.
 *
 * Fix: a decl joins the batch only when its element is "bare" (exactly one call — the whole initializer
 * — of a plain name, with call-free arguments) or "inert" (no call anywhere). Any other decl is
 * emitted in place by the sequential path, which awaits every call site in it, and it ENDS the batch
 * (nothing after it is hoisted over it). Bare independent calls still batch (§13.2 parallelism).
 * Executed end to end by the security-failable-pack family r21 (f27).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { compileScrml } from "../../src/api.js";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as acornParse } from "acorn";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/s470-promise-all-batch-elements");

beforeAll(() => { if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true }); });
afterAll(() => { if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true, force: true }); });

let seq = 0;
function compileBody(stmts) {
  const name = `case${seq++}`;
  const dir = join(FIXTURE_DIR, name);
  mkdirSync(dir, { recursive: true });
  const src = `<msg> = "init"
\${
    server function isOk(p) { return p == "secret" }
    server function ping(q) { return q }
    server function info(p) { return { denied: p != "secret" } }
    function allowed(q) { return isOk(q) }
    function flip(x) { return !x }
    function login(p) {
        ${stmts.join("\n        ")}
        return v
    }
    function go(p) { @msg = login(p) }
}
<button onclick=go("x")>go</button>
<p>\${@msg}</p>
`;
  writeFileSync(join(dir, "app.scrml"), src);
  const r = compileScrml({ inputFiles: [join(dir, "app.scrml")], outputDir: join(dir, "out"), write: true, log: () => {} });
  const errors = (r.errors || []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
  let clientJs = "";
  const out = join(dir, "out");
  if (existsSync(out)) for (const f of readdirSync(out)) if (f.endsWith(".client.js")) clientJs = readFileSync(join(out, f), "utf8");
  return { errors, clientJs, body: fnBody(clientJs, "login") };
}

function fnBody(code, fnName) {
  const m = new RegExp(`(?:async )?function _scrml_${fnName}_\\d+\\(`).exec(code);
  if (!m) return "";
  const start = code.indexOf("{", m.index);
  let depth = 0;
  for (let k = start; k < code.length; k++) {
    if (code[k] === "{") depth++;
    else if (code[k] === "}") { depth--; if (depth === 0) return code.slice(start, k + 1); }
  }
  return code.slice(start);
}

// Every `_scrml_fetch_isOk_N(` / `_scrml_allowed_N(` call in the body is directly awaited.
function everyWaitingCallAwaited(body, stem) {
  const re = new RegExp(`(await\\s+)?_scrml_(?:fetch_)?${stem}_\\d+\\(`, "g");
  let m, n = 0;
  while ((m = re.exec(body))) { n++; if (!m[1]) return false; }
  return n > 0;
}

const MIXED = [
  ["ternary", `const v = isOk(p) ? "LOGGED IN" : "rejected"`],
  ["ternary, nested in the else branch", `const v = p == "zz" ? "zz" : (isOk(p) ? "LOGGED IN" : "rejected")`],
  ["not", `const v = !isOk(p)`],
  ["and", `const v = isOk(p) && true`],
  ["or", `const v = isOk(p) || false`],
  ["nullish", `const v = isOk(p) ?? false`],
  ["comparison", `const v = isOk(p) != false`],
  ["array literal", `const v = [isOk(p)]`],
  ["array spread", `const v = [...[isOk(p)]]`],
  ["object literal", `const v = { ok: isOk(p) }`],
  ["call argument, builtin", `const v = String(isOk(p))`],
  ["call argument, sync helper", `const v = flip(isOk(p))`],
  ["call argument of a server call", `const v = ping(isOk(p))`],
  ["member read off the call", `const v = info(p).denied`],
  ["index read off the call", `const v = info(p)["denied"]`],
  ["let under a ternary", `let v = isOk(p) ? 1 : 0`],
];

describe("g-promise-all-batch-puts-unawaited-call-under-sync-operator — a call under an operator is not a batch element", () => {
  for (const [label, decl] of MIXED) {
    test(`${label}: no Promise.all; every call awaited in place`, () => {
      const { errors, clientJs, body } = compileBody([`const a = ping(1)`, decl]);
      expect(errors.map((e) => e.code)).toEqual([]);
      expect(body).not.toBe("");
      expect(body).not.toContain("Promise.all");
      const stem = /info\(/.test(decl) ? "info" : "isOk";
      expect(everyWaitingCallAwaited(body, stem)).toBe(true);
      expect(everyWaitingCallAwaited(body, "ping")).toBe(true);
      expect(() => acornParse(clientJs, { ecmaVersion: "latest", sourceType: "module" })).not.toThrow();
    });
  }

  test("async-coloured client helper under a ternary: awaited in place", () => {
    const { body } = compileBody([`const a = ping(1)`, `const v = allowed(p) ? "LOGGED IN" : "rejected"`]);
    expect(body).not.toContain("Promise.all");
    expect(everyWaitingCallAwaited(body, "allowed")).toBe(true);
  });

  test("the operator decl as the SEED batches with nothing", () => {
    const { body } = compileBody([`const v = isOk(p) ? "LOGGED IN" : "rejected"`, `const a = ping(1)`, `const b = ping(2)`]);
    // v is in place; the two bare calls after it may batch with each other.
    const iV = body.indexOf("const v = await");
    const iBatch = body.indexOf("Promise.all");
    expect(iV).toBeGreaterThan(-1);
    expect(iBatch).toBeGreaterThan(iV);
    expect(body.slice(iBatch)).not.toContain("isOk");
  });

  test("the operator decl ENDS the batch: nothing after it is hoisted over it", () => {
    const { body } = compileBody([`const a = ping(1)`, `const v = !isOk(p)`, `const b = ping(2)`]);
    expect(body).not.toContain("Promise.all");
    const ia = body.indexOf("const a = await");
    const iv = body.indexOf("const v = !await");
    const ib = body.indexOf("const b = await");
    expect(ia).toBeGreaterThan(-1);
    expect(iv).toBeGreaterThan(ia);
    expect(ib).toBeGreaterThan(iv);
  });

  test("a template literal with an interpolation is not provably inert (fails closed)", () => {
    const { body } = compileBody([`const a = ping(1)`, "const s = `x${p}`", `const v = s`]);
    expect(body).not.toContain("Promise.all");
  });

  test("a lambda value is not a batch element", () => {
    const { body } = compileBody([`const a = ping(1)`, `const f = (q) => q + 1`, `const v = f(1)`]);
    expect(body).not.toContain("Promise.all");
  });
});

describe("fix round 1 — F2 element emitted in the statement's own context; F4 destructuring decls", () => {
  function compileWith(cell, stmts) {
    const name = `r1case${seq++}`;
    const dir = join(FIXTURE_DIR, name);
    mkdirSync(dir, { recursive: true });
    const src = `<msg> = "init"
${cell}\${
    server function ping(q) { return q }
    server function info(p) { return { denied: p != "secret" } }
    server function pair(p) { return [p != "secret", 1] }
    function flip(x) { return !x }
    function login(p) {
        ${stmts.join("\n        ")}
        return 1
    }
    function go(p) { @msg = login(p) }
}
<button onclick=go("x")>go</button>
<p>\${@msg}</p>
`;
    writeFileSync(join(dir, "app.scrml"), src);
    const r = compileScrml({ inputFiles: [join(dir, "app.scrml")], outputDir: join(dir, "out"), write: true, log: () => {} });
    const errors = (r.errors || []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    let clientJs = "";
    const out = join(dir, "out");
    if (existsSync(out)) for (const f of readdirSync(out)) if (f.endsWith(".client.js")) clientJs = readFileSync(join(out, f), "utf8");
    return { errors, body: fnBody(clientJs, "login") };
  }
  const DENY = `\${ <deny>: [string:bool] = ["wrong": true] }\n`;

  test("an inert map read in the batch is lowered exactly as the in-place path lowers it", () => {
    const solo = compileWith(DENY, [`const d = @deny[p]`]).body;
    const inPlace = /const d = (.*);/.exec(solo)[1];
    const { errors, body } = compileWith(DENY, [`const a = ping(1)`, `const d = @deny[p]`]);
    expect(errors.map((e) => e.code)).toEqual([]);
    expect(body).toMatch(/const \[a, d\] = await _scrml_g\.Promise\.all\(\[/);
    expect(body).toContain(inPlace);
    expect(body).not.toContain(`_scrml_cs_reactive_get("deny")[p]`);
  });

  test("a map read as a bare call's argument is lowered in the statement's context", () => {
    const solo = compileWith(DENY, [`const d = flip(@deny[p])`]).body;
    const inPlace = /const d = (.*);/.exec(solo)[1];
    const { body } = compileWith(DENY, [`const a = ping(1)`, `const d = flip(@deny[p])`]);
    expect(body).toContain(inPlace);
  });

  for (const decl of [`const { denied } = info(p)`, `const [d, n] = pair(p)`]) {
    test(`a destructuring decl beside a seed compiles and is not a batch member: ${decl}`, () => {
      const { errors, body } = compileWith("", [`const a = ping(1)`, decl]);
      expect(errors.map((e) => e.code)).toEqual([]);
      expect(body).not.toContain("Promise.all");
    });
  }
});

describe("§13.2 parallelism kept — bare independent calls still batch", () => {
  test("two bare independent server calls form one Promise.all", () => {
    const { body } = compileBody([`const v = isOk(p)`, `const a = ping(1)`]);
    expect(body).toMatch(/const \[v, a\] = await _scrml_g\.Promise\.all\(\[\s*_scrml_fetch_isOk_\d+\(p\),\s*_scrml_fetch_ping_\d+\(1\)\s*\]\);/);
  });

  test("three bare independent server calls form one Promise.all", () => {
    const { body } = compileBody([`const a = ping(1)`, `const v = isOk(p)`, `const b = ping(2)`]);
    expect(body).toMatch(/const \[a, v, b\] = await _scrml_g\.Promise\.all\(\[/);
  });

  test("a bare call whose argument is an operator expression still batches", () => {
    const { body } = compileBody([`const a = ping(1)`, `const v = isOk(p + "")`]);
    expect(body).toMatch(/const \[a, v\] = await _scrml_g\.Promise\.all\(\[/);
  });

  test("a bare call beside an inert member still batches", () => {
    const { body } = compileBody([`const v = isOk(p)`, `const k = 3`, `const a = ping(1)`]);
    expect(body).toMatch(/const \[v, k, a\] = await _scrml_g\.Promise\.all\(\[/);
  });

  test("the operator applied to a batched binding afterwards", () => {
    const { body } = compileBody([`const a = ping(1)`, `const ok = isOk(p)`, `const v = ok ? "LOGGED IN" : "rejected"`]);
    expect(body).toMatch(/const \[a, ok\] = await _scrml_g\.Promise\.all\(\[/);
    expect(body).toContain(`const v = ok ? "LOGGED IN" : "rejected";`);
  });

  test("a bare async client helper still batches", () => {
    const { body } = compileBody([`const a = ping(1)`, `const v = allowed(p)`]);
    expect(body).toMatch(/const \[a, v\] = await _scrml_g\.Promise\.all\(\[/);
  });
});
