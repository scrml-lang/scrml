// foreign-blocks-s473.test.js — s473-boot-foreign-blocks: §23.2 foreign code blocks
// (`_{ … }`, `_={ … }=`, `_=={ … }==`) in LOGIC, read by the bootstrap.
//
// Before this lane the bootstrap lexed `_={ … }=` as `_ = { …object… }` and parsed the
// JavaScript inside it: a measurement of flogence (31 files) found 7,061 of 9,620 errors
// inside foreign blocks, function bodies broken and statements spilled to file scope.
//
// SPEC §23.2 (governing sentences, quoted in docs/changes/s473-boot-foreign-blocks/progress.md):
//   "The block splitter SHALL recognize `_` followed by zero or more `=` followed by `{` as a
//    foreign code block opener." · "A `_` immediately preceded by an identifier character …
//    is the tail of that identifier, never a foreign code block opener." · "The block splitter
//    SHALL scan for the matching closer: `}` followed by the same number of `=` characters as
//    the opener. No other character sequence closes the foreign code block." · "The interior of
//    a `_{}` block is opaque. The compiler SHALL NOT parse, tokenize, or type-check the
//    content." · "Level-0 uses the same brace-depth counting as all other scrml sigils".
// §23.2.4 (where a block may stand), §23.2.4a (the `in:{}` header; "The block's OUT value is
// an UNOWNED foreign value. It is typed `asIs` … by DEFAULT"), §23.2.1 / §23.6 (language).
//
// The shapes below are minimal excerpts of real flogence code (src/ports/*.scrml), copied,
// never edited in place.
//
// Emission is NOT built: an admitted block is refused by name (E-BOOTSTRAP-UNSUPPORTED,
// "not in the bootstrap yet") — fail closed, never printed wrong.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => String(d.severity).toLowerCase() === "error");
const codes = (src) => [...new Set(run(src).diags.map((d) => d.code))].sort();
const diagsOf = (src, code) => run(src).diags.filter((d) => d.code === code);
const EMIT = "is not in the bootstrap yet";
// every Error is the named emission refusal, one per admitted block
const onlyEmitRefusals = (src, n) => {
  const es = errs(src);
  expect(es.map((d) => `${d.code}: ${d.message}`).filter((m) => !m.includes(EMIT))).toEqual([]);
  expect(es.length).toBe(n);
};
const prog = (body, attrs = ' lang="ts"') => `<program${attrs}>\n${body}\n    <main><p>"x"</p></main>\n</program>\n`;
const toks = (src) => mods.lex.lex(src);
const foreignToks = (src) => toks(src).filter((t) => t.kind.variant === "Foreign");

// =============================================================================
// L. The lexer: one opaque token, bounded by characters (§23.2)
// =============================================================================
describe("L — a foreign block is ONE token; its interior is never tokenized", () => {
  test("`_={ … }=`: level 1, the verbatim interior, closer 1", () => {
    const src = 'const v = _={ in: { args, n, d } const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }=;';
    const ft = foreignToks(src);
    expect(ft.length).toBe(1);
    expect(ft[0].kind.data.level).toBe(1);
    expect(ft[0].kind.data.closer).toBe(1);
    expect(ft[0].kind.data.body).toBe(" in: { args, n, d } const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d ");
    expect(ft[0].text.startsWith("_={")).toBe(true);
    expect(ft[0].text.endsWith("}=")).toBe(true);
    // the tokens after it are the scrml statement's own
    const kinds = toks(src).map((t) => t.kind.variant ?? t.kind);
    expect(kinds.slice(kinds.indexOf("Foreign") + 1)).toEqual(["Semicolon", "Eof"]);
  });

  test("a lone `}` in a string, a regex, a template and a comment does not close a level-1 block", () => {
    const body = ' in: { md }\n    const shape = /^\\[\\d+\\]/ // }\n    const s = "}" + `${md}}`\n    /* } */ return s\n  ';
    const ft = foreignToks(`const bad = _={${body}}=;`);
    expect(ft.length).toBe(1);
    expect(ft[0].kind.data.body).toBe(body);
  });

  test("level 2 holds `}=`; only `}==` closes it", () => {
    const ft = foreignToks('const s = _=={ const o = {a: 1}= ; return "}=" }==;');
    expect(ft.length).toBe(1);
    expect(ft[0].kind.data.level).toBe(2);
    expect(ft[0].kind.data.body).toBe(' const o = {a: 1}= ; return "}=" ');
  });

  test("level 0 counts raw braces (§23.2: \"the same brace-depth counting as all other scrml sigils\")", () => {
    const ft = foreignToks("const s = _{ if (a) { b() } return 1 };");
    expect(ft.length).toBe(1);
    expect(ft[0].kind.data.level).toBe(0);
    expect(ft[0].kind.data.body).toBe(" if (a) { b() } return 1 ");
  });

  test("identifier guard (S444): `my_={` is the identifier `my_` then `= {`", () => {
    expect(foreignToks("my_={ a: 1 }").length).toBe(0);
    expect(foreignToks("a1_={ a: 1 }").length).toBe(0);
    expect(foreignToks("$_={ a: 1 }").length).toBe(0);
    expect(foreignToks("_ = { a: 1 }").length).toBe(0);     // spaced: an assignment
    expect(foreignToks("(_={ 1 }=)").length).toBe(1);       // after punctuation: an opener
  });

  test("unclosed: closer -1, the interior runs to the end of input", () => {
    const ft = foreignToks("const x = _={ return 1 }");
    expect(ft.length).toBe(1);
    expect(ft[0].kind.data.closer).toBe(-1);
  });

  test("mismatched closer `}==` on `_={`: closer 2, consumed whole", () => {
    const ft = foreignToks("const x = _={ 1 }==;");
    expect(ft[0].kind.data.closer).toBe(2);
    expect(toks("const x = _={ 1 }==;").map((t) => t.kind.variant ?? t.kind).slice(-2)).toEqual(["Semicolon", "Eof"]);
  });

  test("a `/` after a foreign block divides (it is a value)", () => {
    const kinds = toks("const x = _={ 4 }= / 2;").map((t) => t.kind.variant ?? t.kind);
    expect(kinds).toContain("Slash");
    expect(kinds).not.toContain("RegexLit");
  });
});

// =============================================================================
// P. The parser: the node, the `in:{}` header, E-FOREIGN-001 / -002 / -007, W-FOREIGN-001
// =============================================================================
describe("P — the foreign node and its header", () => {
  const fnBody = (body) => prog(`    function f(args: string[]) {\n${body}\n    }`);

  test("a real multi-statement slice (flogence bridge-tool) parses with NO parse error and no spill", () => {
    const src = fnBody(`        const bad = _={ in: { args }
            const shape = /^\\[\\d+\\]/
            const out = []
            for (const line of args) {
              if (!shape.test(line)) continue
              out.push(line)
            }
            return out
        }=;
        return bad;`);
    onlyEmitRefusals(src, 1);
  });

  test("the crossings are reads at their own spans; the header is stripped from the body", () => {
    const src = fnBody('        const v = _={ in: { args , n } args.indexOf(n) }=;\n        return v;');
    const p = mods.parse.parseFile("t.scrml", src, 0);
    expect(p.diags.filter((d) => String(d.severity).toLowerCase() === "error")).toEqual([]);
    const j = JSON.stringify(p.ast);
    const m = /"variant":"Foreign","data":\{"f":(\{.*?"body":"[^"]*"\})/.exec(j);
    expect(m).not.toBeNull();
    const f = JSON.parse(m[1]);
    expect(f.level).toBe(1);
    expect(f.body).toBe(" args.indexOf(n) ");
    expect(f.crossings.map((x) => x.k.data.name)).toEqual(["args", "n"]);
    expect(f.crossings.map((x) => src.slice(x.span.start, x.span.end))).toEqual(["args", "n"]);
  });

  test("no header, `in: {}`, a trailing comma", () => {
    for (const b of ["_={ new Date().toISOString() }=", "_={ in: {} 1 }=", "_={ in: { args, } args.length }="]) {
      onlyEmitRefusals(fnBody(`        const v = ${b};\n        return v;`), 1);
    }
  });

  test("a word starting `in` is not a header (`index`, `in` without `:`)", () => {
    onlyEmitRefusals(fnBody("        const v = _={ index(args) }=;\n        return v;"), 1);
  });

  test("a malformed header (a field, not a name) is E-FOREIGN-007 — the slice would start `in:`", () => {
    const src = fnBody("        const id = _={ in: { args.length } 1 }=;\n        return id;");
    expect(codes(src)).toContain("E-FOREIGN-007");
  });

  test("E-FOREIGN-002: an unclosed block", () => {
    expect(codes(fnBody("        const v = _={ 1 }"))).toContain("E-FOREIGN-002");
  });

  test("E-FOREIGN-001: `_={ … }==`", () => {
    expect(codes(fnBody("        const v = _={ 1 }==;\n        return v;"))).toContain("E-FOREIGN-001");
  });

  test("W-FOREIGN-001: a level-0 block (§23.2: \"The compiler SHALL emit W-FOREIGN-001 on any level-0 `_{` block\")", () => {
    const src = fnBody("        const v = _{ 1 };\n        return v;");
    expect(diagsOf(src, "W-FOREIGN-001").length).toBe(1);
    onlyEmitRefusals(src, 1);
  });

  test("a foreign block is an expression in a scrml statement: its `;` is required (§7.2.2)", () => {
    expect(codes(fnBody("        const v = _={ 1 }=\n        return v;"))).toContain("E-STMT-MISSING-SEMICOLON");
  });

  test("a markup-body foreign block stays E-FOREIGN-004 (unchanged)", () => {
    expect(codes('<program lang="ts">\n    <main><p>_={ 1 }=</p></main>\n</program>\n')).toContain("E-FOREIGN-004");
  });

  test("the markup-body reader and the logic lexer share ONE extent reader (lex.scrml foreignExtentAt)", () => {
    // level 2 holds `}=`; the block ends at `}==` in markup exactly as in logic — one report, no stray text
    const src = '<program lang="ts">\n    <main><p>_=={ a }= "}" }==</p></main>\n</program>\n';
    expect(diagsOf(src, "E-FOREIGN-004").length).toBe(1);
    expect(errs(src).map((d) => d.code)).toEqual(["E-FOREIGN-004"]);
    const x = mods.lex.foreignExtentAt("x _=={ a }= }== y", 2);
    expect([x.level, x.closer, "x _=={ a }= }== y".slice(x.end)]).toEqual([2, 2, " y"]);
    expect(mods.lex.foreignOpenAt("my_={", 2)).toBe(-1);
  });
});

// =============================================================================
// C. Where a block may stand (§23.2.4) and its language (§23.2.1, §23.6)
// =============================================================================
describe("C — positions and language", () => {
  test("admitted: `const x =`, `let x =`, `return` in a `function` body — each refused only as not-yet-emitted", () => {
    const src = prog(`    function a(s: string) {\n        const x = _={ in: { s } s + "!" }=;\n        let y = _={ 2 }=;\n        return _={ in: { x, y } x + y }=;\n    }`);
    onlyEmitRefusals(src, 3);
  });

  test("a foreign block makes its function a server function (§23.2.4: it \"escalates its enclosing function to the server boundary\")", () => {
    const src = prog(`    function a() -> int {\n        const x = _={ 1 }=;\n        return 1;\n    }\n    <button onclick={ document.title = "t"; }>"b"</button>`);
    // a server trigger beside a DOM access in ONE body cannot be placed (§12.4)
    const both = prog(`    function a() {\n        const x = _={ 1 }=;\n        document.title = "t";\n    }`);
    expect(codes(both)).toContain("E-ROUTE-005");
    expect(diagsOf(both, "E-ROUTE-005")[0].message).toContain("foreign code block");
    expect(codes(src)).not.toContain("E-ROUTE-005");
  });

  test("E-FOREIGN-004 in a `fn` body (§23.2.4: \"NOT `fn`/pure helpers\") — flogence compare-tool's `flagVal`", () => {
    const src = prog("    fn flagVal(args: string[], n: string, d: string) -> string {\n        const v = _={ in: { args, n, d } const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }=;\n        return v;\n    }");
    const d = diagsOf(src, "E-FOREIGN-004");
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("`fn`");
  });

  test("E-FOREIGN-004: a bare block outside a `kind=\"tool\"` program", () => {
    const d = diagsOf(prog('    function a(t: string) {\n        _={ in: { t } console.log(t) }=;\n    }'), "E-FOREIGN-004");
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("kind=\"tool\"");
  });

  test("a bare block in a `kind=\"tool\"` program's function is admitted (§23.2.4 form 3) — the tool program itself is refused", () => {
    const src = '<program kind="tool" lang="ts">\n    function main(args: string[]) -> int {\n        _={ console.log("no pending tasks to dispatch.") }=;\n        return 0;\n    }\n</program>\n';
    expect(codes(src)).not.toContain("E-FOREIGN-004");
    expect(run(src).diags.some((d) => d.message.includes(EMIT))).toBe(true);
  });

  test("E-FOREIGN-004: inside another expression, an assignment's value, a handler, a file-scope const", () => {
    expect(diagsOf(prog("    function a() -> int {\n        const n = _={ 1 }= + 1;\n        return n;\n    }"), "E-FOREIGN-004").length).toBe(1);
    expect(diagsOf(prog("    function a() {\n        let n = 0;\n        n = _={ 1 }=;\n    }"), "E-FOREIGN-004").length).toBe(1);
    expect(codes(prog('    let <n:int=0/>\n    <button onclick={ const x = _={ 1 }=; @n = 1; }>"b"</button>'))).toContain("E-FOREIGN-004");
    expect(codes('${\n    const T = _={ 1 }=;\n}\n<program lang="ts">\n    <main><p>"x"</p></main>\n</program>\n')).toContain("E-FOREIGN-004");
  });

  test("fail closed: in EVERY other position a foreign block is an Error (it is never silently dropped or printed)", () => {
    const F = "_={ 1 }=";
    const sites = [
      `    <main><p>\${${F}}</p></main>`,                                              // a markup interpolation
      `    let <n:int=0/>\n    <p if=(${F})>"x"</p>`,                                  // an if= condition
      `    let <n:int=0/>\n    <input value=(${F})/>`,                                // an attribute value
      `    function a() -> int {\n        return f2(${F});\n    }\n    function f2(x: int) -> int { return x; }`, // a call argument
      `    function a(b: bool) -> int {\n        const v = b ? ${F} : 2;\n        return v;\n    }`,              // a ternary arm
      `    function a(xs: int[]) -> int[] {\n        return xs.map((x) => ${F});\n    }`,                         // a lambda body
      `    function a() -> int {\n        if (${F}) { return 1; }\n        return 0;\n    }`,                      // an if condition
      `    function a() -> int[] {\n        const xs = for (const i of [1, 2]) { lift ${F}; };\n        return xs;\n    }`, // a lift
      `    function a() -> int {\n        for (const i of ${F}) { }\n        return 0;\n    }`,                    // a for head
      `    let <n:int=${F}/>`,                                                         // a cell initializer
    ];
    for (const s of sites) {
      const es = errs(prog(s));
      expect(es.length).toBeGreaterThan(0);
      expect(es.some((d) => String(d.code).startsWith("E-FOREIGN-") || d.message.includes(EMIT))).toBe(true);
    }
  });

  test("E-FOREIGN-003: no `lang=` on the `<program>`", () => {
    expect(codes(prog("    function a() {\n        const x = _={ 1 }=;\n    }", ""))).toContain("E-FOREIGN-003");
  });

  test("`lang=\"ts\"` / `\"js\"` are read; another language is refused at the attribute and E-FOREIGN-005 at the block", () => {
    expect(codes(prog("    <p>\"x\"</p>")).filter((c) => c.startsWith("E-"))).toEqual([]);
    expect(codes(prog("    <p>\"x\"</p>", ' lang="js"')).filter((c) => c.startsWith("E-"))).toEqual([]);
    const go = prog("    function a() {\n        const x = _={ 1 }=;\n    }", ' lang="go"');
    expect(codes(go)).toContain("E-FOREIGN-005");
    expect(diagsOf(go, "E-BOOTSTRAP-UNSUPPORTED").some((d) => d.message.includes("lang="))).toBe(true);
  });

  test("a crossing names an enclosing binding: an undeclared one is E-SCOPE-001 at the crossing", () => {
    const src = prog("    function a() {\n        const x = _={ in: { nope } nope }=;\n    }");
    const d = diagsOf(src, "E-SCOPE-001");
    expect(d.length).toBe(1);
    expect(src.slice(d[0].span.start, d[0].span.end)).toBe("nope");
  });
});

// =============================================================================
// T. The value is an untyped JavaScript-boundary value (§23.2.4a "typed `asIs` … by DEFAULT")
// =============================================================================
describe("T — the OUT value is untyped unless annotated", () => {
  test("unannotated, as a condition: E-COND-NOT-BOOLEAN (§42.4 statement 5: \"a value that crosses the JavaScript boundary with no scrml type\")", () => {
    const src = prog("    function a(body: string) -> int {\n        const ok = _={ in: { body } body.length > 0 ? true : false }=;\n        if (ok) { return 1; }\n        return 0;\n    }");
    expect(codes(src)).toContain("E-COND-NOT-BOOLEAN");
  });

  test("annotated (`const ok: bool = …`, \"A call-site annotation … STATES the intended type\"): the condition is a bool", () => {
    const src = prog("    function a(body: string) -> int {\n        const ok: bool = _={ in: { body } body.length > 0 }=;\n        if (ok) { return 1; }\n        return 0;\n    }");
    expect(codes(src)).not.toContain("E-COND-NOT-BOOLEAN");
    onlyEmitRefusals(src, 1);
  });

  test("unannotated, in a template slot: E-TEXT-NON-PRIMITIVE (an unresolved value has no honest text)", () => {
    const src = prog("    function a() -> string {\n        const at = _={ new Date().toISOString() }=;\n        return `at ${at}`;\n    }");
    expect(codes(src)).toContain("E-TEXT-NON-PRIMITIVE");
  });

  test("the compiler never reads the slice: scrml-invalid JavaScript inside is no scrml error", () => {
    // `===`, `null`, `typeof`, a braced arrow — each refused in scrml logic; opaque here
    const src = prog("    function a(x: string) -> string {\n        const s: string = _={ in: { x } const f = (v) => { return typeof v === \"string\" ? v : null }; return f(x) }=;\n        return s;\n    }");
    onlyEmitRefusals(src, 1);
  });
});
