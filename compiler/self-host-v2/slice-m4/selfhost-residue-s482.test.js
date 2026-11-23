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

describe("`x is T.V` — one named refusal, no cascade (§18.17 `is-expression ::= expression 'is' '.' VariantName`)", () => {
  const T = `    type T:enum = { Str, Num }\n    type R:struct = { k: boolean, j: int }\n`;
  test("as a statement value, a return operand and an object-literal field value", () => {
    for (const body of [
      `const b: boolean = t is T.Str; return b;`,
      `return t is T.Str;`,
      `const o: R = { k: t is T.Str, j: 1 }; return o.k;`,
    ]) {
      const es = errorsOf(prog(T + `    fn c(t: T) -> boolean { ${body} }\n    fn d() -> int { return 1; }`));
      expect(es.length).toBe(1);
      expect(es[0]).toContain("E-PARSE-EXPECTED: `is` takes a bare variant — write `is .Str`, not `is T.Str`");
    }
  });
  test("the bare form is clean", () => {
    clean(prog(T + `    fn c(t: T) -> boolean { const o: R = { k: t is .Str, j: 1 }; return o.k; }`));
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
