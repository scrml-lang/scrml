// selfhost-residue-s482.test.js — lane s482-selfhost-parse-residue.
//
// 1. Owner ruling (user-voice-scrml.md "RULED — `/` after `as` by adjacency; `lin` as a binding name",
//    ruling:user-voice-scrml.md-S482-as-slash-lin-name), item 1, PERMANENT: "it is your `.` ruling
//    applied to `/`" — a `/` touching `as` is division; a spaced `as /re/` keeps the regular expression.
//    Built in lex.scrml `dotLastKind` (SPEC §14.12.6.2).
// 2. Item 2: "allow it the way `as` and `from` now are; after `const` or `let` it can't be confused
//    with the keyword" — `lin` is a binding name (parse.scrml isContextualName / linKeywordAt; lex.scrml
//    isContextualNameWord). `lin x = …` stays the §35.2 declaration.
// 3. `of` (§49.2.4 "the contextual keyword `of`") is a binding name too.
// 4. `x is T.V` (outside §18.17's grammar) is ONE named refusal — before, it cascaded, and inside an
//    object literal it swallowed the rest of the file (g-boot-self-host-parse-residue-s482).
//    s482-rulings-records: now ACCEPTED when `T` is the left operand's enum (ruling S482-is-qualified-
//    variant), and `of` follows the `as` adjacency rule (ruling S482-of-adjacency) — the two describes
//    below item 3's.
// 5. Every self-host file parses to its end: the only parse-level codes left are the named payload-binder
//    / alternation refusals (E-PARSE-ARM) and the E-SCOPE-REDECLARE they leave.
//
// Red on base e178c32c8: `as/2` lexed a RegexLit; `const lin` / `let of` were E-PARSE-LOCAL; `lin.x`
// lexed a bare variant; `x is T.V` cascaded (E-PARSE-EXPECTED + E-PARSE-TRAILING + E-SCOPE-001 …);
// analyze.scrml carried E-PARSE-LOCAL / E-PARSE-EXPECTED / E-PARSE-TRAILING / E-STMT-MISSING-SEMICOLON.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadM2, frontEnd } from "./harness.js";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = join(HERE, "..");

let mods;
let dir;
beforeAll(() => {
  ({ mods } = loadM2());
  dir = mkdtempSync(join(tmpdir(), "s482-selfhost-residue-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const allDiags = (src) => frontEnd(mods, [{ path: "s.scrml", src }]).diags;
const errorsOf = (src) => allDiags(src).filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const codes = (src) => allDiags(src).filter((d) => d.severity === "Error").map((d) => d.code);
const clean = (src) => expect(errorsOf(src)).toEqual([]);
const prog = (decls) => `<program>\n\${\n${decls}\n}\n</program>\n`;

const kindOf = (k) => (typeof k === "object" && k !== null ? k.variant : k);
const lexed = (src) => mods.lex.lexFrom(src, 0, mods.lex.LexStop?.Balanced ?? { variant: "Balanced" }).tokens.map((t) => kindOf(t.kind) + ":" + t.text);

let n = 0;
async function run(src, ids) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const out = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(out.body.querySelector("#" + id)?.textContent ?? "<none>").trim());
}

describe("ruling item 1 — a `/` touching `as` divides", () => {
  test("`as/2`, `as/2/3`, `x as/2` lex Slash", () => {
    expect(lexed("as/2")).toEqual(["Keyword:as", "Slash:/", "NumberLit:2", "Eof:"]);
    expect(lexed("as/2/3")).toEqual(["Keyword:as", "Slash:/", "NumberLit:2", "Slash:/", "NumberLit:3", "Eof:"]);
    expect(lexed("x as/2")).toEqual(["Ident:x", "Keyword:as", "Slash:/", "NumberLit:2", "Eof:"]);
  });
  test("a spaced `/` (whitespace, a newline or a comment between) keeps the regular expression", () => {
    expect(lexed("as /x/")).toEqual(["Keyword:as", "RegexLit:/x/", "Eof:"]);
    expect(lexed("as\n/x/")).toEqual(["Keyword:as", "RegexLit:/x/", "Eof:"]);
    expect(lexed("as /*c*/ /x/")).toEqual(["Keyword:as", "RegexLit:/x/", "Eof:"]);
    expect(lexed("as/*c*/ /x/")).toEqual(["Keyword:as", "RegexLit:/x/", "Eof:"]);
    expect(lexed("as//c\n/x/")).toEqual(["Keyword:as", "RegexLit:/x/", "Eof:"]);
  });
  test("a binding named `as` divides, in logic and in a markup slot", () => {
    clean(prog(`    fn f(x: number) -> number { const as: number = x; return as/2; }`));
    clean(`<program>\n\${\n    const as: number = 8;\n}\n<p>\${as/2}</p>\n</program>\n`);
  });
  test("the values run", async () => {
    const src = `<program>
\${
    fn f(x: number) -> number { const as: number = x; return as/2; }
    fn g(x: number) -> number { const as: number = x; return as/2/4; }
    const as: number = 12;
}
<p id="a">\${f(8)}</p>
<p id="b">\${g(16)}</p>
<p id="c">\${as/3}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c"])).toEqual(["4", "2", "4"]);
  }, 180000);
});

describe("ruling item 2 — `lin` as a binding name", () => {
  test("`lin.x` / `lin / 2` lex a member read / a division", () => {
    expect(lexed("lin.x")).toEqual(["Keyword:lin", "Dot:.", "Ident:x", "Eof:"]);
    expect(lexed("lin / 2")).toEqual(["Keyword:lin", "Slash:/", "NumberLit:2", "Eof:"]);
  });
  test("`const lin` / `let lin`, reads, writes, member reads, arguments", () => {
    clean(prog(`    fn f(x: int) -> int { const lin: int = x; return lin + 1; }`));
    clean(prog(`    fn f(x: int) -> int { let lin: int = x; lin = lin * 2; return lin; }`));
    clean(prog(`    type P:struct = { v: int }\n    fn f(o: P) -> int { const lin: P = o; return lin.v; }`));
    clean(prog(`    fn g(k: int) -> int { return k; }\n    fn f(x: int) -> int { const lin: int = x; return g(lin); }`));
    clean(prog(`    fn f(x: number) -> number { const lin: number = x; return lin / 2; }`));
  });
  test("a parameter, an arrow parameter, a `for` binder, a function name", () => {
    clean(prog(`    fn f(lin: int) -> int { return lin + 1; }`));
    clean(prog(`    fn f(xs: int[]) -> int { let s: int = 0; for (const lin of xs) { s = s + lin; } return s; }`));
    clean(prog(`    function f(x: int) -> int { const g = (lin: int) => lin + 1; return g(x); }`));
    clean(prog(`    fn lin(x: int) -> int { return x + 1; }\n    fn f(x: int) -> int { return lin(x); }`));
  });
  test("`lin` stays the §35.2 declaration and the §35.2.1 parameter prefix", () => {
    clean(prog(`    fn f(x: int) -> int { lin t = x; return t; }`));
    clean(prog(`    fn f(lin t: int) -> int { return t + 1; }`));
    clean(prog(`    fn f(x: int) -> int { lin lin = x; return lin; }`));
    expect(codes(prog(`    fn f(x: int) -> int { lin t = x; return t + t; }`))).toEqual(["E-LIN-002"]);
    expect(codes(prog(`    fn f(x: int) -> int { lin t = x; return 1; }`))).toEqual(["E-LIN-001"]);
  });
  test("the values run", async () => {
    const src = `<program>
\${
    type P:struct = { v: int }
    fn a(x: int) -> int { let lin: int = x; lin = lin * 2; return lin; }
    fn b(o: P) -> int { const lin: P = o; return lin.v + 1; }
    fn c(lin: int) -> int { return lin + 10; }
    fn d(x: int) -> int { lin t = x; return t; }
}
<p id="a">\${a(3)}</p>
<p id="b">\${b({ v: 4 })}</p>
<p id="c">\${c(5)}</p>
<p id="d">\${d(7)}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c", "d"])).toEqual(["6", "5", "15", "7"]);
  }, 180000);
});

describe("`of` as a binding name (§49.2.4: the contextual keyword `of`)", () => {
  test("`let of`, a parameter, a `for` binder, a pattern binder", () => {
    clean(prog(`    fn f(x: int) -> int { let of: int = x; of = of + 1; return of; }`));
    clean(prog(`    fn f(of: int) -> int { return of * 2; }`));
    clean(prog(`    fn f(xs: int[]) -> int { let s: int = 0; for (const of of xs) { s = s + of; } return s; }`));
    clean(prog(`    type E:enum = { A(n: int), B }\n    fn f(e: E) -> int { return match e { .A(of) :> of, .B :> 0 }; }`));
  });
  test("the values run", async () => {
    const src = `<program>
\${
    fn a(x: int) -> int { let of: int = x; of = of + 1; return of; }
    fn b(xs: int[]) -> int { let s: int = 0; for (const of of xs) { s = s + of; } return s; }
}
<p id="a">\${a(1)}</p>
<p id="b">\${b([1, 2, 3])}</p>
</program>
`;
    expect(await run(src, ["a", "b"])).toEqual(["2", "6"]);
  }, 180000);
});

// s482-rulings-records — owner ruling S482 (user-voice-scrml.md "RULED — `of` adjacency follows the `as`
// rule", ruling:user-voice-scrml.md-S482-of-adjacency; SPEC §49.2.4): a `.` or `/` touching `of` reads
// the name; spaced, the keyword's operand. Red on base a81d8cc80: `of.value` lexed a BareVariant, `of/2`
// a RegexLit (E-STMT-MISSING-SEMICOLON + E-TYPE-VARIANT / E-PARSE-EXPR).
describe("`of` by adjacency (ruling S482-of-adjacency; §49.2.4)", () => {
  test("a `.` or `/` touching `of` reads the name: member access, a call, division", () => {
    expect(lexed("of.value")).toEqual(["Keyword:of", "Dot:.", "Ident:value", "Eof:"]);
    expect(lexed("of.f()")).toEqual(["Keyword:of", "Dot:.", "Ident:f", "LParen:(", "RParen:)", "Eof:"]);
    expect(lexed("x of.value")).toEqual(["Ident:x", "Keyword:of", "Dot:.", "Ident:value", "Eof:"]);
    expect(lexed("of/2")).toEqual(["Keyword:of", "Slash:/", "NumberLit:2", "Eof:"]);
    expect(lexed("of/2/4")).toEqual(["Keyword:of", "Slash:/", "NumberLit:2", "Slash:/", "NumberLit:4", "Eof:"]);
  });
  test("spaced (whitespace, a newline or a comment between), the keyword's operand: a bare variant, a regular expression", () => {
    expect(lexed("of .Items")).toEqual(["Keyword:of", "BareVariant:.Items", "Eof:"]);
    expect(lexed("of\n.Items")).toEqual(["Keyword:of", "BareVariant:.Items", "Eof:"]);
    expect(lexed("of /x/")).toEqual(["Keyword:of", "RegexLit:/x/", "Eof:"]);
    expect(lexed("of /*c*/ /x/")).toEqual(["Keyword:of", "RegexLit:/x/", "Eof:"]);
    expect(lexed("of//c\n/x/")).toEqual(["Keyword:of", "RegexLit:/x/", "Eof:"]);
  });
  // s482 r1 (#2092 review LOW-1): a `for` head whose operand touches `of` has no operand (the touching
  // `.` / `/` reads the name) — refused, and the message says to space it.
  test("a `for` head whose operand touches `of` is refused, with a hint to space it", () => {
    for (const [head, glyph] of [["for (const x of.items)", "."], ["for (const x of/re/.exec(s))", "/"]]) {
      const es = errorsOf(prog(`    fn f(o: int[], s: string) -> int { ${head} { } return 1; }`));
      const hit = es.find((e) => e.startsWith("E-PARSE-EXPR: "));
      expect(hit).toBeDefined();
      expect(hit).toContain("a `" + glyph + "` touching `of` reads the name `of` (§49.2.4); for the loop operand, write `of " + glyph + "…` with a space");
    }
  });
  test("a binding named `of`: a field read and a division compile clean; a `for … of` loop is unchanged", () => {
    clean(prog(`    type R:struct = { value: int }\n    fn f() -> int { const of: R = { value: 2 }; return of.value; }`));
    clean(prog(`    fn f(x: number) -> number { const of: number = x; return of/2; }`));
    clean(prog(`    fn f(xs: int[]) -> int { let s: int = 0; for (const x of xs) { s = s + x; } return s; }`));
  });
  test("the values run", async () => {
    const src = `<program>
\${
    type R:struct = { value: int }
    fn a() -> int { const of: R = { value: 7 }; return of.value; }
    fn b(x: number) -> number { const of: number = x; return of/2/4; }
    fn c(xs: int[]) -> int { let s: int = 0; for (const x of xs) { s = s + x; } return s; }
}
<p id="a">\${a()}</p>
<p id="b">\${b(16)}</p>
<p id="c">\${c([1, 2, 3])}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c"])).toEqual(["7", "2", "6"]);
  }, 180000);
});

// s482-rulings-records — owner ruling S482 (user-voice-scrml.md "RULED — `x is T.V` accepted when `T` is
// the left operand's enum", ruling:user-voice-scrml.md-S482-is-qualified-variant; SPEC §18.17
// `'is' (TypeName)? '.' VariantName`). Before: one named refusal (E-PARSE-EXPECTED, this lane's
// predecessor); now the qualified test, judged as a qualified match arm is (§18.13).
describe("`x is T.V` — accepted when `T` is the left operand's enum (ruling S482-is-qualified-variant; §18.17)", () => {
  const T = `    type T:enum = { Str, Num }\n    type U:enum = { Str, Other }\n    type R:struct = { k: boolean, j: int }\n`;
  test("as a statement value, a return operand and an object-literal field value: clean", () => {
    for (const body of [
      `const b: boolean = t is T.Str; return b;`,
      `return t is T.Str;`,
      `const o: R = { k: t is T.Str, j: 1 }; return o.k;`,
    ]) {
      clean(prog(T + `    fn c(t: T) -> boolean { ${body} }\n    fn d() -> int { return 1; }`));
    }
  });
  test("a type naming another enum is E-TYPE-VARIANT; a name that is no type too; an unknown variant E-TYPE-063", () => {
    const one = (body, code, text) => {
      const es = errorsOf(prog(T + `    fn c(t: T) -> boolean { ${body} }`));
      expect(es.length).toBe(1);
      expect(es[0]).toStartWith(code + ": ");
      expect(es[0]).toContain(text);
    };
    one(`return t is U.Str;`, "E-TYPE-VARIANT", "`U.Str` names `U`, but the subject is `T` (§18.13)");
    one(`const o: R = { k: t is U.Str, j: 1 }; return o.k;`, "E-TYPE-VARIANT", "`U.Str` names `U`");
    one(`return t is Nope.Str;`, "E-TYPE-VARIANT", "`Nope.Str` names `Nope`");
    one(`return t is T.Nope;`, "E-TYPE-063", "`.Nope` is not a variant of `T`");
  });
  test("the bare form is clean", () => {
    clean(prog(T + `    fn c(t: T) -> boolean { const o: R = { k: t is .Str, j: 1 }; return o.k; }`));
  });
  // s482 r1 (#2092 review LOW-3): `T` through a namespace import (`x is m.T.V`) is read as a qualified
  // arm reads `m.T.V`; an import alias (`import { T as Q }`) makes `T.V` name no type in scope, and the
  // message says so (before: "names `T`, but the subject is `T`").
  test("through a namespace import, `x is m.T.V` runs; under an import alias, `T.V` is refused with a clear message", async () => {
    writeFileSync(join(dir, "m.scrml"), "${\n    export type T:enum = { Str, Num }\n}\n");
    const ns = `<program>
\${
    import * as m from "./m.scrml";
    fn a(t: m.T) -> boolean { return t is m.T.Str; }
}
<p id="a">\${a(.Str)}</p>
<p id="b">\${a(.Num)}</p>
</program>
`;
    expect(await run(ns, ["a", "b"])).toEqual(["true", "false"]);
    const file = join(dir, "alias.scrml");
    writeFileSync(file, `<program>
\${
    import { T as Q } from "./m.scrml";
    fn b(t: Q) -> boolean { return t is T.Str; }
}
<p id="a">\${b(.Str)}</p>
</program>
`);
    const res = await compileSource(file);
    expect(res.ok).toBe(false);
    const es = res.diagnostics.filter((d) => d.severity === "error");
    expect(es.map((d) => d.code)).toEqual(["E-TYPE-VARIANT"]);
    // s482-rulings-records-fu (#2092 r1 review LOW-2): the message names the spelling to qualify with
    expect(es[0].message).toContain("no type `T` is in scope here — the subject's enum `T` (declared in `");
    expect(es[0].message).toContain("is in scope here as `Q`: qualify with that name (`Q.Str`), or write `.Str` (§18.13)");
  }, 180000);
  test("the values run: the qualified test answers as the bare one does", async () => {
    const src = `<program>
\${
    type T:enum = { Str, Num }
    fn q(t: T) -> boolean { return t is T.Str; }
    fn b(t: T) -> boolean { return t is .Str; }
}
<p id="a">\${q(.Str)}</p>
<p id="b">\${q(.Num)}</p>
<p id="c">\${b(.Str)}</p>
<p id="d">\${b(.Num)}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c", "d"])).toEqual(["true", "false", "true", "false"]);
  }, 180000);
});

// s482-rulings-records-fu (#2092 r1 review LOW-1 / LOW-2 / LOW-3): messages only — every program below
// was refused before and is refused now with the same code. Red on base f58e2a503: LOW-1 read "`T.Str`
// names `T`, but the subject is `T` (§18.13)"; LOW-2 "… under another name (an import alias) …" for a
// namespace import; LOW-3 gave the `for`-operand hint to `return of./2;`, where there is no loop.
describe("qualifier messages name each enum's spelling and declaration (#2092 r1 review LOW-1/2/3)", () => {
  const M = "${\n    export type T:enum = { Str, Num }\n    export type U:enum = { Str, Num }\n}\n";
  const N = "${\n    export type T:enum = { Str, Num }\n}\n";
  const two = (decls) => frontEnd(mods, [{ path: "m.scrml", src: M }, { path: "n.scrml", src: N }, { path: "s.scrml", src: prog(decls) }]).diags
    .filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
  const only = (decls, short = false) => {
    const es = two(decls);
    expect(es.length).toBe(1);
    expect(es[0]).toStartWith("E-TYPE-VARIANT: ");
    if (!short) expect(es[0]).not.toContain("but the subject is `T`");
    return es[0];
  };
  test("LOW-1: a local `T` and `m.T` — both directions, an `is` test and a match arm", () => {
    const local = "    type T:enum = { Str, Num }\n";
    let e = only(`    import * as m from "./m.scrml";\n` + local + `    fn a(t: m.T) -> boolean { return t is T.Str; }`);
    expect(e).toContain("`T.Str` names `T` (declared in this file at line 4), but the subject's type is `m.T` (declared in `m.scrml`) — two different enums named `T`: qualify with `m.T`, or write `.Str` (§18.13)");
    e = only(`    import * as m from "./m.scrml";\n` + local + `    fn a(t: T) -> boolean { return t is m.T.Str; }`);
    expect(e).toContain("`m.T.Str` names `m.T` (declared in `m.scrml`), but the subject's type is `T` (declared in this file at line 4) — two different enums named `T`");
    e = only(`    import * as m from "./m.scrml";\n` + local + `    fn a(t: m.T) -> string { return match t { T.Str :> "s", else :> "n" }; }`);
    expect(e).toContain("but the subject's type is `m.T` (declared in `m.scrml`) — two different enums named `T`: qualify with `m.T`");
  });
  test("LOW-1: an import alias `Q` and a local `T`; two modules' `T`", () => {
    let e = only(`    import { T as Q } from "./m.scrml";\n    type T:enum = { Str, Num }\n    fn a(t: Q) -> boolean { return t is T.Str; }`);
    expect(e).toContain("but the subject's type is `Q` (`T` declared in `m.scrml`) — two different enums named `T`: qualify with `Q`, or write `.Str` (§18.13)");
    e = only(`    import * as m from "./m.scrml";\n    import * as n from "./n.scrml";\n    fn a(t: m.T) -> boolean { return t is n.T.Str; }`);
    expect(e).toContain("`n.T.Str` names `n.T` (declared in `n.scrml`), but the subject's type is `m.T` (declared in `m.scrml`)");
  });
  test("LOW-1: enums of different names keep the short message", () => {
    const e = only(`    import * as m from "./m.scrml";\n    type T:enum = { Str, Num }\n    fn a(t: T) -> boolean { return t is m.U.Str; }`, true);
    expect(e).toContain("`m.U.Str` names `m.U`, but the subject is `T` (§18.13)");
  });
  test("LOW-2: under a namespace import the message names `m.T`, not an import alias", () => {
    const e = only(`    import * as m from "./m.scrml";\n    fn a(t: m.T) -> boolean { return t is T.Str; }`);
    expect(e).toContain("no type `T` is in scope here — the subject's enum `T` (declared in `m.scrml`) is in scope here as `m.T`: qualify with that name (`m.T.Str`), or write `.Str` (§18.13)");
    expect(e).not.toContain("import alias");
  });
  test("LOW-3: the `of` hint only in a `for` head", () => {
    const outside = errorsOf(prog(`    fn f(x: number) -> number { const of: number = x; return of./2; }`));
    expect(outside.some((e) => e.startsWith("E-PARSE-EXPR: "))).toBe(true);
    expect(outside.some((e) => e.includes("touching `of`"))).toBe(false);
    const inHead = errorsOf(prog(`    fn f(o: int[]) -> int { for (const x of.items) { } return 1; }`));
    expect(inHead.some((e) => e.startsWith("E-PARSE-EXPR: ") && e.includes("touching `of` reads the name `of`"))).toBe(true);
  });
});

describe("every self-host file parses to its end", () => {
  test("no parse-level code but the named payload-binder / alternation refusals", () => {
    const files = readdirSync(SELF).filter((f) => f.endsWith(".scrml")).sort();
    expect(files).toContain("analyze.scrml");
    const left = [];
    for (const f of files) {
      const p = mods.parse.parseFile("compiler/self-host-v2/" + f, readFileSync(join(SELF, f), "utf8"), 0);
      for (const d of p.diags) {
        if (d.code === "E-SCOPE-REDECLARE" || d.code.startsWith("W-")) continue;
        if (d.code === "E-PARSE-ARM" && (d.message.startsWith("expected a binder name (or `_`) in the pattern's `(…)`, found `:`") || d.message.startsWith("expected a binder name (or `_`) in the pattern's `(…)`, found `fn`") || d.message.startsWith("alternation `|` between patterns"))) continue;
        left.push(f + " " + d.code + " " + d.message.slice(0, 80));
      }
    }
    expect(left).toEqual([]);
  }, 180000);
});
