/**
 * bang-catch-try-body-s470.test.js — g-impl1-bang-catch-try-body-cut-at-first-brace-s470 (security).
 *
 * The statement form `!{ tryBody } catch T [as b] { handler }` cut its try body at the FIRST `}`
 * (a nested `!{}` handler lost its handler, the catch arms were dropped), was glued to the statement
 * before it as a postfix handler (the body dropped), and its catch could never handle a scrml
 * failure (a failable call RETURNS its error). S470 ruling: the form is REFUSED (E-TRY-NOT-IN-SCRML,
 * SPEC §19.1 "There is NO try/catch"). The block splitter's extent record is what detects it, so
 * these tests lock the record and the refusal wherever the form is written.
 * The wrong-password floor for every shape × side is the r10 family of
 * ../integration/security-failable-pack (n29 / s13 / f16 / l8 / t8).
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { splitBlocks } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { compileScrml } from "../../src/api.js";

const SCRATCH = resolve(process.env.TMPDIR ?? "/tmp", "scrml-bang-catch-s470");

function findBlocks(blocks, type, out = []) {
  for (const b of blocks) {
    if (b.type === type) out.push(b);
    if (b.children) findBlocks(b.children, type, out);
  }
  return out;
}

function findNodes(node, kind, out = [], seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return out;
  seen.add(node);
  if (node.kind === kind) out.push(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === "span") continue;
    if (Array.isArray(v)) v.forEach((c) => findNodes(c, kind, out, seen));
    else if (v && typeof v === "object") findNodes(v, kind, out, seen);
  }
  return out;
}

const DECLS = `    type AuthErr:enum = { Denied(reason: string), Gone }
    function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
const fileWith = (fnBody) => `\${\n${DECLS}\n    function go(p) {\n${fnBody}\n    }\n}\n<p>x</p>\n`;
const FORM = (body, handler = "@ok = false") => `        !{\n            ${body}\n        } catch AuthErr as b { ${handler} }`;

function parse(src) {
  const bs = splitBlocks("test.scrml", src);
  return { bs, tab: buildAST(bs) };
}
function errCodes(errors) { return (errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info").map((e) => e.code); }

function compile(src) {
  const dir = resolve(SCRATCH, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  mkdirSync(dir, { recursive: true });
  const input = resolve(dir, "app.scrml");
  writeFileSync(input, src);
  try {
    const r = compileScrml({ inputFiles: [input], write: false, outputDir: resolve(dir, "out"), log: () => {} });
    const out = [...(r.outputs?.values?.() ?? [])][0] ?? {};
    const errors = (r.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    return { codes: errors.map((e) => e.code), clientJs: out.clientJs ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1. The block splitter records where IT ended the try body and each catch arm.
// ---------------------------------------------------------------------------
describe("block splitter — errorEffectExtent", () => {
  const extentOf = (fnBody) => {
    const src = fileWith(fnBody);
    const ee = findBlocks(splitBlocks("t.scrml", src).blocks, "error-effect").find((b) => b.errorEffectExtent?.arms.length);
    return { src, ee };
  };

  for (const [name, body] of [
    ["a nested !{}", `@ok = check(p) !{ _ :> false }`],
    ["a nested block", `if (p != "") { @ok = check(p) !{ _ :> false } }`],
    ["an object literal", `const o = { v: 1 }`],
    ["a string holding }", `const s = "}"`],
    ["a line comment holding }", `// }\n            const s = 1`],
  ]) {
    test(`the try body ends at its own brace, past ${name}`, () => {
      const { src, ee } = extentOf(FORM(body));
      expect(ee).toBeTruthy();
      const { tryEnd } = ee.errorEffectExtent;
      expect(src[tryEnd]).toBe("}");
      expect(src.slice(tryEnd).trimStart().startsWith("} catch AuthErr")).toBe(true);
      expect(src.slice(ee.span.start + 2, tryEnd)).toContain(body.split("\n")[0]);
    });
  }

  test("each arm's start is recorded and the block ends after the last handler", () => {
    const { src, ee } = extentOf(`        !{ @ok = check(p) !{ _ :> false } } catch AuthErr as b { @ok = false } catch Error { @ok = false }`);
    const arms = ee.errorEffectExtent.arms;
    expect(arms.length).toBe(2);
    expect(src.slice(arms[0].start).startsWith("catch AuthErr as b {")).toBe(true);
    expect(src.slice(arms[1].start).startsWith("catch Error {")).toBe(true);
    expect(src.slice(ee.span.start, ee.span.end).endsWith("catch Error { @ok = false }")).toBe(true);
  });

  test("a handler is read by the same loop: a `}` in its string does not end it", () => {
    const { src, ee } = extentOf(FORM(`@ok = false`, `const s = "}"\n            @ok = false`));
    expect(src.slice(ee.span.start, ee.span.end).endsWith(`const s = "}"\n            @ok = false }`)).toBe(true);
    expect(splitBlocks("t.scrml", src).errors.length).toBe(0);
  });

  test("a postfix handler (no catch) records no arm", () => {
    const src = fileWith(`        const v = check(p) !{ _ :> false }`);
    const ee = findBlocks(splitBlocks("t.scrml", src).blocks, "error-effect")[0];
    expect(ee.errorEffectExtent.arms.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The statement form is REFUSED (S470 ruling — SPEC §19.1 "There is NO try/catch"), once, at its
//    `!{`, wherever it is written; a stray `catch` is refused at the `catch`.
// ---------------------------------------------------------------------------
const TRY = "E-TRY-NOT-IN-SCRML";
const tryErrs = (errors) => (errors ?? []).filter((e) => e.code === TRY);

describe("AST — the statement form is refused", () => {
  for (const [name, fnBody] of [
    ["the F2 repro (a nested `!{}`)", FORM(`@ok = check(p) !{ _ :> false }`)],
    ["a nested block", FORM(`if (p != "") { @ok = check(p) !{ _ :> false } }`)],
    ["a string and a comment holding braces", FORM(`const s = "}"\n            // a } here\n            @ok = false`)],
    ["a handler holding a string with }", FORM(`@ok = false`, `const s = "}"\n            @ok = false`)],
    ["two arms", `        !{ @ok = false } catch AuthErr { @ok = false } catch Error as e { @ok = false }`],
    ["after a declaration", `        const st = { ok: true }\n        !{ if (p != "secret") { st.ok = false } } catch Error as e { st.ok = false }`],
    ["after a semicolon", `        let n = 1;\n        !{ @ok = false } catch Error as e { @ok = false }`],
    ["after a cell write", `        @ok = true\n        !{ @ok = false } catch Error as e { @ok = false }`],
    ["nested in another", FORM(`!{ @ok = false } catch AuthErr as c { @ok = false }`)],
    ["a malformed arm header", `        !{ @ok = false } catch (e) { @ok = false }`],
    ["a catch with no handler body", `        !{ @ok = false } catch AuthErr`],
  ]) {
    test(`${name}: one E-TRY-NOT-IN-SCRML at the form's \`!{\``, () => {
      const src = fileWith(fnBody);
      const { tab } = parse(src);
      const errs = tryErrs(tab.errors);
      expect(errs.length).toBeGreaterThanOrEqual(1);
      const at = errs[0].tabSpan.start;
      expect(src.slice(at, at + 2)).toBe("!{");
      expect(errs[0].message).toContain("!{ _ e :>");
      // nothing of the form is kept to lower
      for (const ee of findNodes(tab.ast, "error-effect")) expect(ee.body ?? []).toEqual([]);
    });
  }

  test("written after a statement, it is not glued to that statement as its handler", () => {
    const { tab } = parse(fileWith(`        const st = { ok: true }\n        !{ if (p != "secret") { st.ok = false } } catch Error as e { st.ok = false }`));
    const fn = findNodes(tab.ast, "function-decl").find((f) => f.name === "go");
    expect(fn.body.map((n) => n.kind).includes("guarded-expr")).toBe(false);
  });

  test("a postfix handler after a statement is still that statement's handler (not refused)", () => {
    const { tab } = parse(fileWith(`        const v = check(p)\n        !{ _ :> false }`));
    const fn = findNodes(tab.ast, "function-decl").find((f) => f.name === "go");
    expect(fn.body.map((n) => n.kind)).toEqual(["guarded-expr"]);
    expect(tryErrs(tab.errors)).toEqual([]);
  });

  test("a statement form whose extent was not recorded is still refused (judged from its text)", () => {
    const bs = splitBlocks("t.scrml", fileWith(FORM(`@ok = check(p) !{ _ :> false }`)));
    for (const b of findBlocks(bs.blocks, "error-effect")) delete b.errorEffectExtent;
    expect(tryErrs(buildAST(bs).errors).length).toBe(1);
  });

  for (const [name, raw] of [
    ["first in its body", "${ function go(p) { !{ @ok = false } catch Error as e { @ok = false } } }"],
    ["after a statement", "${ function go(p) { const n = 1\n !{ @ok = false } catch Error as e { @ok = false } } }"],
    ["a bare catch clause", "${ function go(p) { catch Error as e { @ok = false } } }"],
  ]) {
    test(`a \`!{ … }\` re-read from text with its \`catch\` left behind (${name}) is refused at the \`catch\``, () => {
      // A logic block with NO pre-split children: the tokenizer synthesizes the `!{ … }` BLOCK_REF
      // (it stops at the block's own brace), leaving `catch …` as tokens.
      const bs = { filePath: "t.scrml", errors: [], blocks: [{ type: "logic", raw, span: { start: 0, end: raw.length, line: 1, col: 1 }, depth: 0, children: [], name: null, closerForm: null, isComponent: false }] };
      const errs = tryErrs(buildAST(bs).errors);
      expect(errs.length).toBe(1);
      expect(raw.slice(errs[0].tabSpan.start, errs[0].tabSpan.start + 5)).toBe("catch");
    });
  }
});

// ---------------------------------------------------------------------------
// 3. End to end: never compiles, on any side or position.
// ---------------------------------------------------------------------------
describe("compile — the statement form never compiles", () => {
  const page = (fnBody) => `<ok> = false\n${fileWith(fnBody)}<button onclick=go("x")>go</button>\n<p>\${@ok}</p>\n`;
  for (const [name, src] of [
    ["in a function", page(FORM(`@ok = check(p) !{ _ :> false }`))],
    ["after a statement", page(`        @ok = true\n        !{ if (p != "secret") { @ok = false } } catch Error as e { @ok = false }`)],
    ["at module init", `<ok> = false\n\${\n${DECLS}\n    if (true) {\n    !{ @ok = check("x") !{ _ :> false } } catch AuthErr as b { @ok = false }\n    }\n}\n<p>\${@ok}</p>\n`],
  ]) {
    test(`${name}: E-TRY-NOT-IN-SCRML, no output`, () => {
      const r = compile(src);
      expect(r.codes).toContain(TRY);
    });
  }

  // A `when` body is held as TEXT: the form there is not detected as such, but the body's reader
  // refuses any `!{ … }` it cannot read (E-TYPE-031) — fail closed, never compiled.
  test("in a when body (held as text): refused, never compiled", () => {
    const r = compile(`<ok> = false\n<pw> = ""\n\${\n${DECLS}\n    when @pw changes {\n        !{ @ok = true } catch Error as e { @ok = false }\n    }\n}\n<p>\${@ok}</p>\n`);
    expect(r.codes.length).toBeGreaterThan(0);
  });

  test("the `!{}` handler the message points at compiles", () => {
    const r = compile(page(`        @ok = check(p) !{ _ e :> false }`));
    expect(r.codes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Review round (S470, lane C round 3).
// ---------------------------------------------------------------------------
describe("review F1 — a `!` statement after a value is never dropped silently", () => {
  const page = (body) => `<msg> = ""\n\${\n    function login(p) {\n        const st = { ok: true }\n        ${body}\n        return st.ok ? "LOGGED IN" : "rejected"\n    }\n    function go(p) { @msg = login(p) }\n}\n<button onclick=go("wrong")>go</button>\n<p>\${@msg}</p>\n`;
  for (const [name, body, code] of [
    ["`! { … }`", `! { if (p != "secret") { st.ok = false } }`, "E-ERROR-014"],
    ["`! { … } catch …`", `! { if (p != "secret") { st.ok = false } } catch AuthErr as b { st.ok = true }`, TRY],
    ["`!` then a newline then `{ … }`", `!\n        { if (p != "secret") { st.ok = false } }`, "E-ERROR-014"],
    ["`!` a comment `{ … }`", `! /* x */ { if (p != "secret") { st.ok = false } }`, "E-ERROR-014"],
    ["`!` a tab `{ … }`", `!\t{ if (p != "secret") { st.ok = false } }`, "E-ERROR-014"],
  ]) {
    test(`${name} after a declaration is refused at the \`!\` (${code})`, () => {
      const r = compile(page(body));
      expect(r.codes).toContain(code);
    });
  }
  // PA ruling (round 4, R1) — §7.2.2 rule 4: a newline is whitespace, so a `!`-led line after a
  // value-ending line with no `;` is `a !b` (a missing operator): refused, never run as its own
  // statement and never swallowed.
  for (const [name, body] of [
    ["`! ( … )`", `! (st.ok = p == "secret")`],
    ["`!x` (a missing `&&`)", `const banned = p != "secret"\n        const ok = st.ok\n          !banned\n        st.ok = ok`],
    ["`!(x)`", `const banned = p != "secret"\n        const ok = st.ok\n          !(banned)\n        st.ok = ok`],
  ]) {
    test(`${name} after a value-ending line is E-STMT-UNEXPECTED-TOKEN`, () => {
      const r = compile(page(body));
      expect(r.codes).toContain("E-STMT-UNEXPECTED-TOKEN");
    });
  }
  test("a `!`-led statement after a `;` or at the start of a block is unaffected", () => {
    expect(compile(page(`const z = 1;\n        !(st.ok = p == "secret")`)).codes).toEqual([]);
    expect(compile(page(`if (true) {\n            !(st.ok = p == "secret")\n        }`)).codes).toEqual([]);
  });
  test("a next-line postfix `!{ … }` still handles the line above", () => {
    const r = compile(`<msg> = ""\n\${\n    type AuthErr:enum = { Denied }\n    function check(p)! -> AuthErr { if (p != "secret") fail AuthErr::Denied\n return true }\n    function go(p) {\n        const v = check(p)\n        !{ _ :> false }\n        @msg = v ? "LOGGED IN" : "rejected"\n    }\n}\n<button onclick=go("x")>go</button>\n<p>\${@msg}</p>\n`);
    expect(r.codes).toEqual([]);
  });
  test("`!=` on a later line still continues the expression", () => {
    const r = compile(page(`const same = p\n            != "x"\n        if (!same) { st.ok = false }`));
    expect(r.codes).toEqual([]);
  });
});

describe("review F6 — a `!{ arms }` attached to no expression is refused (E-ERROR-014)", () => {
  const page = (fnBody) => `type E:enum = { Bad }\n<ok> = true\n\${\n    function risky()! -> E { fail E::Bad }\n    function f() {\n        ${fnBody}\n        risky() !{ _ :> 0 }\n    }\n}\n<button onclick=f()>b</button>\n<p>\${@ok}</p>\n`;
  for (const [name, body] of [
    ["the first statement of a body", `!{ _ e :> @ok = false }`],
    ["a braceless if body", `if (true) !{ _ :> @ok = false }`],
  ]) {
    test(`${name}`, () => {
      const r = compile(page(body));
      expect(r.codes).toContain("E-ERROR-014");
    });
  }
  test("a postfix handler is unaffected", () => {
    expect(compile(page(`risky() !{ _ :> @ok = false }`)).codes).toEqual([]);
  });
});

describe("review F4 — the statement form inside an expression or loop head is refused", () => {
  const D = `    type AuthErr:enum = { Denied }\n    function lst(p)! -> AuthErr { if (p != "secret") fail AuthErr::Denied\n return [1] }`;
  const F = `lst(p) !{ _ :> [] } catch AuthErr { st.ok = true }`;
  const page = (body) => `<msg> = ""\n\${\n${D}\n    function login(p) {\n        const st = { ok: true }\n        ${body}\n        return st.ok ? "LOGGED IN" : "rejected"\n    }\n    function go(p) { @msg = login(p) }\n}\n<button onclick=go("wrong")>go</button>\n<p>\${@msg}</p>\n`;
  for (const [name, body] of [
    ["a for-of head", `for (const r of ${F}) { st.ok = false }`],
    ["a while condition", `while ((${F}).length > 5) { st.ok = false }`],
    ["an if condition", `if ((${F}).length > 0) { st.ok = false }`],
    ["a call argument", `String(${F})`],
    ["an array literal", `const a = [${F}]`],
  ]) {
    test(`${name}: E-TRY-NOT-IN-SCRML`, () => {
      expect(compile(page(body)).codes).toContain(TRY);
    });
  }
});
