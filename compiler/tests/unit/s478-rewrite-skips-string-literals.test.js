/**
 * S478 — g-impl1-bootstrap-build-rewrites-string-literals-s473 (and its siblings
 * g-match-arm-string-literal-fn-rewritten-to-function,
 * g-match-arm-string-literal-paren-dot-capital-rewritten-as-enum-variant).
 *
 * impl#1's text rewrite passes (compiler/src/codegen/rewrite.ts) rewrote INSIDE string
 * literals: `"a pure fn body"` shipped as `"a pure function body"`, `"x is .A"` as
 * `"x === "A""` (invalid JS), `"see (a). Call it"` as `"see (a)"Call" it"`. They now act
 * in CODE only, through one shared fence (code-segments.ts `replaceInCode` /
 * `codeOnlyView`, built on `rewriteCodeSegments`). A template literal's static text is
 * literal text; its `${ … }` holes are code and are still rewritten.
 *
 * Each pass is checked × { "…" string, '…' string, template text, template hole }.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  rewriteFnKeyword,
  rewriteEnumVariantAccess,
  rewriteIsOperator,
  rewriteWorkerRefs,
  rewriteRequestRefs,
  rewriteInputStateRefs,
  rewriteTransitionCalls,
  rewriteReplayCalls,
  rewriteEnumToEnum,
  rewriteStructConstruction,
  rewriteTildeRef,
  rewriteRenderKeyword,
  rewriteMatchExpr,
  rewriteInlineFunctionBodies,
  rewriteExpr,
} from "../../src/codegen/rewrite.ts";
import { replaceInCode, codeOnlyView, matchAllInCode, NON_CODE } from "../../src/codegen/code-segments.ts";
import { compileScrml } from "../../src/api.js";

describe("code-segments: codeOnlyView / replaceInCode / matchAllInCode", () => {
  test("codeOnlyView keeps code, blanks literal text, keeps template holes as code", () => {
    const src = 'a + "fn" + `t ${fn} u` + \'q\' /* fn */ + b';
    const v = codeOnlyView(src);
    expect(v.length).toBe(src.length);
    // `a + ` and ` + b` survive; the string, the template text and the comment do not.
    expect(v.startsWith("a + ")).toBe(true);
    expect(v.endsWith(" + b")).toBe(true);
    expect(v).toContain("fn"); // only the hole's `fn`
    expect(v.split("fn").length - 1).toBe(1);
    expect(v.indexOf("fn")).toBe(src.indexOf("${fn}") + 2);
    expect(v).toContain(NON_CODE);
  });

  test("text with nothing that opens a literal is all code (identity view)", () => {
    expect(codeOnlyView("a.b + fn(x)")).toBe("a.b + fn(x)");
  });

  test("a mark character inside a literal is never taken for code", () => {
    const src = '"\u0001\u0002" + fn';
    expect(replaceInCode(src, /\u0001/g, "X")).toBe(src);
  });

  test("replaceInCode acts in code only; groups and the spanned literal come from the original", () => {
    expect(replaceInCode('fn + "fn" + `fn ${fn}`', /\bfn\b/g, "F")).toBe('F + "fn" + `fn ${F}`');
    // A match that SPANS a literal keeps the literal byte for byte (the group is the original's).
    expect(replaceInCode('T.toEnum(")")', /\.toEnum\(([^)]+)\)/g, "[$1]")).toBe('T[")"]');
    // `$&` and `$$`
    expect(replaceInCode("a", /a/g, "$&$$")).toBe("a$");
  });

  test("replaceInCode replacer gets (match, ...groups, offset, whole) like String.replace", () => {
    const seen = [];
    replaceInCode('x "y" Ab', /(A)(b)/g, (...args) => { seen.push(args); return "z"; });
    expect(seen).toEqual([["Ab", "A", "b", 6, 'x "y" Ab']]);
  });

  test("matchAllInCode reports code hits only", () => {
    const hits = matchAllInCode('render a( "render b(" `render c( ${render d(}`', /render\s+(\w+)\s*\(/g);
    expect(hits.map((h) => h.groups[0])).toEqual(["a", "d"]);
  });
});

describe("rewriteFnKeyword — fn → function, code only", () => {
  test('"…" string', () => expect(rewriteFnKeyword('f("a pure fn body")')).toBe('f("a pure fn body")'));
  test("'…' string", () => expect(rewriteFnKeyword("f('my fn')")).toBe("f('my fn')"));
  test("template text", () => expect(rewriteFnKeyword("`tmpl fn ${n}`")).toBe("`tmpl fn ${n}`"));
  test("template hole is code", () => expect(rewriteFnKeyword("`a ${fn () { return 1 }}`")).toBe("`a ${function () { return 1 }}`"));
  test("bare code still rewritten", () => expect(rewriteFnKeyword("fn (x) { return x }")).toBe("function (x) { return x }"));
});

describe("rewriteEnumVariantAccess — .V / T::V, code only", () => {
  test('"…" string: `). Capital` is text (was `"see (a)"Call" it"`)', () =>
    expect(rewriteEnumVariantAccess('"see (a). Call it"')).toBe('"see (a). Call it"'));
  test("'…' string", () => expect(rewriteEnumVariantAccess("'go .Home now'")).toBe("'go .Home now'"));
  test("template text", () => expect(rewriteEnumVariantAccess("`pick .Red or T::Blue ${x}`")).toBe("`pick .Red or T::Blue ${x}`"));
  test("template hole is code", () => expect(rewriteEnumVariantAccess("`c ${.Red}`")).toBe('`c ${"Red"}`'));
  test("bare code still rewritten", () => {
    expect(rewriteEnumVariantAccess("x = .Red")).toBe('x = "Red"');
    expect(rewriteEnumVariantAccess("x = Color::Red")).toBe('x = "Red"');
    expect(rewriteEnumVariantAccess("Color.variants")).toBe("Color_variants");
  });
});

describe("rewriteIsOperator — is .V / is null, code only", () => {
  test('"…" string (was `"x === "A" here"`)', () => expect(rewriteIsOperator('"x is .A here"')).toBe('"x is .A here"'));
  test("'…' string", () => expect(rewriteIsOperator("'it is null'")).toBe("'it is null'"));
  test("template text", () => expect(rewriteIsOperator("`and is .B ${n}`")).toBe("`and is .B ${n}`"));
  test("template hole is code", () => {
    const out = rewriteIsOperator("`h ${y is null}`");
    expect(out).toBe("`h ${y === null}`");
    const v = rewriteIsOperator("`h ${h is .A}`");
    expect(v).not.toContain("is .A");
    expect(v).toContain('"A"');
  });
});

describe("rewriteWorkerRefs / rewriteRequestRefs / rewriteInputStateRefs — <#name>, code only", () => {
  test('"…" string', () => {
    expect(rewriteWorkerRefs('"<#w>.send(1)"')).toBe('"<#w>.send(1)"');
    expect(rewriteRequestRefs('"<#r>.loading"')).toBe('"<#r>.loading"');
    expect(rewriteInputStateRefs('"<#k>"')).toBe('"<#k>"');
  });
  test("'…' string", () => expect(rewriteInputStateRefs("'_scrml_input_k_'")).toBe("'_scrml_input_k_'"));
  test("template text", () => expect(rewriteInputStateRefs("`see <#k> ${1}`")).toBe("`see <#k> ${1}`"));
  test("template hole is code", () => {
    expect(rewriteInputStateRefs("`${<#k>.x}`")).toBe('`${_scrml_input_state_registry.get("k").x}`');
    expect(rewriteWorkerRefs("`${<#w>.send(1)}`")).toBe("`${_scrml_worker_w.send(1)}`");
    expect(rewriteRequestRefs("`${<#r>.data}`")).toBe("`${_scrml_request_r.data}`");
  });
});

describe("rewriteTransitionCalls / rewriteReplayCalls — code only", () => {
  test('"…" string', () => {
    expect(rewriteTransitionCalls('log("transition(x)")')).toBe('log("transition(x)")');
    expect(rewriteReplayCalls('log("replay(@a, @b)")')).toBe('log("replay(@a, @b)")');
  });
  test("'…' string", () => expect(rewriteTransitionCalls("'transition(y);'")).toBe("'transition(y);'"));
  test("template text", () => expect(rewriteReplayCalls("`replay(@a, @b) ${1}`")).toBe("`replay(@a, @b) ${1}`"));
  test("template hole is code", () => {
    expect(rewriteTransitionCalls("`${transition(x)}`")).toBe("`${}`");
    expect(rewriteReplayCalls("`${replay(@a, @b)}`")).toBe('`${_scrml_replay("a", _scrml_reactive_get("b"))}`');
  });
  test("a paren inside a string argument cannot unbalance the replay call", () =>
    expect(rewriteReplayCalls('replay(@a, @b, f(")"))')).toBe('_scrml_replay("a", _scrml_reactive_get("b"), f(")"))'));
});

describe("rewriteEnumToEnum — code only", () => {
  test('"…" string', () => expect(rewriteEnumToEnum('"S.toEnum(x)"')).toBe('"S.toEnum(x)"'));
  test("'…' string", () => expect(rewriteEnumToEnum("'toEnum(S, x)'")).toBe("'toEnum(S, x)'"));
  test("template text", () => expect(rewriteEnumToEnum("`S.toEnum(x) ${1}`")).toBe("`S.toEnum(x) ${1}`"));
  test("template hole is code", () => expect(rewriteEnumToEnum("`${S.toEnum(x)}`")).toBe("`${(S_toEnum[x] ?? null)}`"));
  test("a string argument is kept byte for byte (incl. a `)` in it)", () =>
    expect(rewriteEnumToEnum('S.toEnum(")")')).toBe('(S_toEnum[")"] ?? null)'));
});

describe("rewriteStructConstruction — Name { → {, code only", () => {
  test('"…" string (was `"{name}"`)', () => expect(rewriteStructConstruction('"Hello {name}"')).toBe('"Hello {name}"'));
  test("'…' string", () => expect(rewriteStructConstruction("'Point { x }'")).toBe("'Point { x }'"));
  test("template text", () => expect(rewriteStructConstruction("`Hi {a} ${b}`")).toBe("`Hi {a} ${b}`"));
  test("template hole is code", () => expect(rewriteStructConstruction("`${Point { x: 1 }}`")).toBe("`${{ x: 1 }}`"));
});

describe("rewriteTildeRef — ~, code only", () => {
  test('"…" string', () => expect(rewriteTildeRef('"~/notes" + ~', "_t1")).toBe('"~/notes" + _t1'));
  test("'…' string", () => expect(rewriteTildeRef("'~' + ~", "_t1")).toBe("'~' + _t1"));
  test("template text", () => expect(rewriteTildeRef("`~ ${~}`", "_t1")).toBe("`~ ${_t1}`"));
});

describe("rewriteRenderKeyword — E-TYPE-071 diagnostic, code only", () => {
  const errs = (s) => { const e = []; rewriteRenderKeyword(s, e); return e.length; };
  test('"…" string', () => expect(errs('"render foo(x)"')).toBe(0));
  test("'…' string", () => expect(errs("'render foo(x)'")).toBe(0));
  test("template text", () => expect(errs("`render foo( ${1}`")).toBe(0));
  test("template hole is code", () => expect(errs("`${render foo(x)}`")).toBe(1));
});

describe("rewriteMatchExpr / rewriteInlineFunctionBodies — keyword found in code only", () => {
  test('"…" string: `match ` in a string is not an inline match', () => {
    const s = 'f("no match x { a :> b }")';
    expect(rewriteMatchExpr(s)).toBe(s);
  });
  test("'…' string: a brace in an arm string does not end the arm list", () => {
    const out = rewriteMatchExpr("match x { .A :> '}' .B :> 'b' }");
    expect(out).toContain("'}'");
    expect(out).toContain("'b'");
  });
  test("the `- >` arrow repair does not touch an arm string", () => {
    const out = rewriteMatchExpr('match x { .A - > "a - > b" .B :> "c" }');
    expect(out).toContain('"a - > b"');
    expect(out).toContain('=== "A"');
  });
  test("template text: `function (…) {` in a template is text", () => {
    const s = "`function (a) { x y }`";
    expect(rewriteInlineFunctionBodies(s)).toBe(s);
  });
  test("template hole is code", () =>
    expect(rewriteInlineFunctionBodies("`${function (a) { x y }}`")).toBe("`${function (a) { x; y }}`"));
});

describe("rewriteExpr — the whole client pipeline keeps literal text", () => {
  test("stripTransitionsBlock: `transitions {` in a string is text", () => {
    const out = rewriteExpr('log("transitions { a }")');
    expect(out).toContain('"transitions { a }"');
  });
  test("fn / is / .V in strings survive the whole pipeline; holes are rewritten", () => {
    const out = rewriteExpr('f("a fn", \'is .A\', `see (a). Call ${fn} text fn`)');
    expect(out).toContain('"a fn"');
    expect(out).toContain("'is .A'");
    expect(out).toContain("`see (a). Call ${function} text fn`");
  });
});

describe("end to end — match-arm strings compile verbatim (the reported shapes)", () => {
  test("fn / is .V / ). Capital in match-arm strings and template text; hole still lowered", () => {
    const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "s478-strlit-"));
    try {
      const src = join(root, "app.scrml");
      writeFileSync(src, [
        "<program>",
        "type H:enum = { A, B, C }",
        "fn msg(s: string) -> string { return s }",
        "fn a(h: H) -> string {",
        "  return match h {",
        '    .A :> "a pure `fn` body"',
        '    .B :> msg("see (a). Call it")',
        '    .C :> "x is .A here"',
        "  }",
        "}",
        "fn t(h: H, n: number) -> string {",
        "  return match h {",
        "    .A :> `tmpl fn text ${n}`",
        '    .B :> `hole ${h is .A ? "y" : "n"} and is .B`',
        "    .C :> 'single fn Q. Zed'",
        "  }",
        "}",
        "@out = a(H.A) + t(H.B, 1)",
        "<p>${@out}</p>",
        "</program>",
        "",
      ].join("\n"));
      const out = join(root, "out");
      mkdirSync(out, { recursive: true });
      const r = compileScrml({ inputFiles: [src], outputDir: out, write: true, log: () => {} });
      const errors = (r.errors ?? []).filter((e) => e && e.severity !== "warning" && !/^[WI]-/.test(e.code ?? ""));
      expect(errors.map((e) => e.code)).toEqual([]);
      const js = readFileSync(join(out, readdirSync(out).find((f) => f.endsWith(".client.js"))), "utf8");
      expect(js).toContain('"a pure `fn` body"');
      expect(js).toContain('"see (a). Call it"');
      expect(js).toContain('"x is .A here"');
      expect(js).toContain("`tmpl fn text ${n}`");
      expect(js).toContain(" and is .B`");
      expect(js).toContain("fn Q. Zed");
      // The hole's `h is .A` is code and is lowered.
      expect(js).not.toContain("${h is .A");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
