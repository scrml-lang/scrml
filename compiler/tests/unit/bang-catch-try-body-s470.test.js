/**
 * bang-catch-try-body-s470.test.js — g-impl1-bang-catch-try-body-cut-at-first-brace-s470 (security).
 *
 * The statement form `!{ tryBody } catch T [as b] { handler }`:
 *   1. the try body was cut at the FIRST `}` of the block (ast-builder), so a nested `!{}` handler,
 *      a block, an object literal or a `}` in a string / comment ended it early — the handled call
 *      lost its handler and every catch arm was dropped;
 *   2. written after a statement, the form was glued to it as a postfix handler, dropping the body;
 *   3. the body was emitted with no options, so a write to an enclosing local became a `const`;
 *   4. the body was never type-checked, so an unhandled failable call in it compiled — and a catch
 *      arm cannot handle one (the call returns its error, it does not throw).
 * The wrong-password floor for every shape × side is the r9 family of
 * ../integration/security-failable-pack (n29 / s12 / f15 / l7 / t7).
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

  test("each arm is recorded: header, handler open and close", () => {
    const { src, ee } = extentOf(`        !{ @ok = check(p) !{ _ :> false } } catch AuthErr as b { @ok = false } catch Error { @ok = false }`);
    const arms = ee.errorEffectExtent.arms;
    expect(arms.length).toBe(2);
    expect(src.slice(arms[0].start, arms[0].open)).toBe("catch AuthErr as b ");
    expect(src.slice(arms[1].start, arms[1].open)).toBe("catch Error ");
    for (const a of arms) { expect(src[a.open]).toBe("{"); expect(src[a.close]).toBe("}"); }
    expect(ee.span.end).toBe(arms[1].close + 1);
  });

  test("a handler is read by the same loop: a `}` in its string does not end it", () => {
    const { src, ee } = extentOf(FORM(`@ok = false`, `const s = "}"\n            @ok = false`));
    const [a] = ee.errorEffectExtent.arms;
    expect(src.slice(a.open + 1, a.close)).toContain(`const s = "}"`);
    expect(src.slice(a.open + 1, a.close)).toContain(`@ok = false`);
    expect(splitBlocks("t.scrml", src).errors.length).toBe(0);
  });

  test("a postfix handler (no catch) records no arm", () => {
    const src = fileWith(`        const v = check(p) !{ _ :> false }`);
    const ee = findBlocks(splitBlocks("t.scrml", src).blocks, "error-effect")[0];
    expect(ee.errorEffectExtent.arms.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The AST builder slices the body / arms where the splitter ended them.
// ---------------------------------------------------------------------------
describe("AST — the statement form", () => {
  test("the F2 repro: the nested `!{}` stays on its call and the catch arm is kept", () => {
    const { tab } = parse(fileWith(FORM(`@ok = check(p) !{ _ :> false }`)));
    expect(errCodes(tab.errors)).toEqual([]);
    const [ee] = findNodes(tab.ast, "error-effect").filter((n) => Array.isArray(n.body));
    expect(ee.body.map((n) => n.kind)).toEqual(["guarded-expr"]);
    expect(ee.arms.map((a) => [a.pattern, a.binding, a.handler])).toEqual([["AuthErr", "b", "@ok = false"]]);
  });

  test("a nested block, a string and a comment holding braces stay in the body", () => {
    const { tab } = parse(fileWith(FORM(`const s = "}"\n            // a } here\n            if (p != "") {\n                @ok = check(p) !{ _ :> false }\n            }`)));
    expect(errCodes(tab.errors)).toEqual([]);
    const [ee] = findNodes(tab.ast, "error-effect").filter((n) => Array.isArray(n.body));
    expect(ee.body.map((n) => n.kind)).toEqual(["const-decl", "if-stmt"]);
    expect(findNodes(ee.body, "guarded-expr").length).toBe(1);
    expect(ee.arms.length).toBe(1);
  });

  test("two arms, and an arm without a binder", () => {
    const { tab } = parse(fileWith(`        !{ @ok = check(p) !{ _ :> false } } catch AuthErr { @ok = false } catch Error as e { @ok = false }`));
    const [ee] = findNodes(tab.ast, "error-effect").filter((n) => Array.isArray(n.body));
    expect(ee.arms.map((a) => [a.pattern, a.binding])).toEqual([["AuthErr", ""], ["Error", "e"]]);
  });

  test("written after a statement it is its own statement, not that statement's handler", () => {
    for (const lead of ["const st = { ok: true }", "let n = 1;", "@ok = true"]) {
      const { tab } = parse(fileWith(`        ${lead}\n        !{ if (p != "secret") { @ok = false } } catch Error as e { @ok = false }`));
      const fn = findNodes(tab.ast, "function-decl").find((f) => f.name === "go");
      expect(fn.body.map((n) => n.kind).includes("guarded-expr")).toBe(false);
      const ee = fn.body.find((n) => n.kind === "error-effect");
      expect(ee).toBeTruthy();
      expect(ee.body.map((n) => n.kind)).toEqual(["if-stmt"]);
    }
  });

  test("a postfix handler after a statement is still that statement's handler", () => {
    const { tab } = parse(fileWith(`        const v = check(p)\n        !{ _ :> false }`));
    const fn = findNodes(tab.ast, "function-decl").find((f) => f.name === "go");
    expect(fn.body.map((n) => n.kind)).toEqual(["guarded-expr"]);
  });

  test("a malformed arm header is refused with its location", () => {
    const src = fileWith(`        !{ @ok = false } catch (e) { @ok = false }`);
    const { tab } = parse(src);
    const e = tab.errors.find((x) => x.code === "E-PARSE-001" && /catch/.test(x.message));
    expect(e).toBeTruthy();
    expect(src.slice(e.tabSpan.start, e.tabSpan.start + 5)).toBe("catch");
  });

  test("a statement form whose extent was not recorded is refused, never re-scanned", () => {
    const bs = splitBlocks("t.scrml", fileWith(FORM(`@ok = check(p) !{ _ :> false }`)));
    for (const b of findBlocks(bs.blocks, "error-effect")) delete b.errorEffectExtent;
    const tab = buildAST(bs);
    expect(tab.errors.some((x) => x.code === "E-PARSE-001" && /try body ends/.test(x.message))).toBe(true);
  });

  test("an extent the logic tokenizer does not read as a balanced body is refused", () => {
    const src = fileWith(FORM(`const s = "a}b"\n            @ok = false`));
    const bs = splitBlocks("t.scrml", src);
    const ee = findBlocks(bs.blocks, "error-effect").find((b) => b.errorEffectExtent?.arms.length);
    ee.errorEffectExtent.tryEnd = src.indexOf("a}b") + 1; // inside the string
    const tab = buildAST(bs);
    expect(tab.errors.some((x) => x.code === "E-PARSE-001" && /disagree/.test(x.message))).toBe(true);
  });

  test("a `!{ … }` re-read from text with its `catch` left behind is refused", () => {
    // A logic block with NO pre-split children: the tokenizer synthesizes the `!{ … }` BLOCK_REF
    // (it stops at the block's own brace), leaving `catch …` as tokens.
    const raw = "${ function go(p) { const n = 1\n !{ @ok = false } catch Error as e { @ok = false } } }";
    const bs = { filePath: "t.scrml", errors: [], blocks: [{ type: "logic", raw, span: { start: 0, end: raw.length, line: 1, col: 1 }, depth: 0, children: [], name: null, closerForm: null, isComponent: false }] };
    const tab = buildAST(bs);
    expect(tab.errors.some((x) => x.code === "E-PARSE-001" && /catch/.test(x.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3 / 4. Codegen and the type checker.
// ---------------------------------------------------------------------------
describe("compile — the statement form", () => {
  const page = (fnBody) => `<ok> = false\n${fileWith(fnBody)}<button onclick=go("x")>go</button>\n<p>\${@ok}</p>\n`;

  test("the F2 repro lowers the nested handler inside the try and keeps the catch arm", () => {
    const r = compile(page(FORM(`@ok = check(p) !{ _ :> false }`)));
    expect(r.codes).toEqual([]);
    const fn = r.clientJs.slice(r.clientJs.indexOf("function _scrml_go_"));
    expect(fn).toMatch(/try \{[\s\S]*__scrml_error[\s\S]*\} catch \(/);
    expect(fn).toMatch(/\.type === "AuthErr"/);
  });

  test("a local declared before the form is written, not shadowed", () => {
    const r = compile(page(`        let granted = false\n        if (p != "") {\n${FORM(`granted = true`, `granted = false`)}\n        }\n        @ok = granted`));
    expect(r.codes).toEqual([]);
    const fn = r.clientJs.slice(r.clientJs.indexOf("function _scrml_go_"));
    expect(fn).toMatch(/try \{\s*granted = true;/);
    expect(fn).not.toMatch(/const granted = true/);
  });

  for (const [name, body] of [
    ["an unhandled call in the try body", `@ok = check(p)`],
    ["an unhandled call in a block in the try body", `if (p != "") { @ok = check(p) }`],
    ["an unhandled call bound in the try body", `const v = check(p)\n            @ok = v`],
  ]) {
    test(`${name} is E-ERROR-002 — a catch arm cannot handle a returned error`, () => {
      expect(compile(page(FORM(body))).codes).toContain("E-ERROR-002");
    });
  }

  test("an undeclared name in the try body is reported", () => {
    const r = compile(page(FORM(`@ok = noSuchName(p)`)));
    expect(r.codes.length).toBeGreaterThan(0);
  });
});
