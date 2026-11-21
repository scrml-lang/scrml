// contextual-names-s482.test.js — lane s482-boot-contextual-names: the #2056 review follow-ups.
//
// F1 (MED) — `from` / `server` as the binder of `for (… of …)` (and every other binding site). SPEC §54.3:
//   "`from` SHALL NOT be a reserved word outside this position. Existing code that uses `from` as a
//   parameter name, local binding, or field name … SHALL continue to compile without change". Before,
//   only `let` / `const` / `lin` and the destructuring names read a contextual word (parse.scrml
//   bindNameTok); the `for` binder (binderThen), loop labels, function names
//   (g-boot-contextual-word-fn-name-s482), arrow parameters, pattern binders, `given` rebinds and an
//   import's local name still required an identifier.
// F2 (LOW) — `as`, `pure`, `render`, `some` as binding names (the self-host binds each: analyze.scrml
//   `const as` / `const pure`, print.scrml `const render`, url.scrml `let some`). Each is a scrml keyword
//   that is not an ECMAScript strict-mode reserved word (§18: a shorthand name is "an identifier, or a
//   scrml keyword that is not an ECMAScript strict-mode reserved word (`type`, `from`, `is`, `as`, …)"),
//   §7.2 admits every JavaScript name, and no SPEC sentence reserves one (§20.3a: "`render` SHALL NOT be
//   a reserved identifier"). `pure` / `render` / `some` are also names before `.` and `/` (lex.scrml
//   isContextualNameWord); `as` is not — its keyword reading takes a bare variant (`a as .Published`,
//   §14.12.6.2), so `as.x` is an owner question (the binding itself is accepted).
// F3 (INFO) — a spread `...` lexes as three Dots; the word after it is the spread's operand, never a
//   member name (lex.scrml lastIsMemberName), so `[... typeof /re/]` opens a regular expression.
//
// Red on base 2eba1eb75: every "compiles clean" case reported E-PARSE-EXPECTED / E-PARSE-LOCAL /
// E-PARSE-FN / E-PARSE-ARM / E-PARSE-IMPORT / E-STMT-MISSING-SEMICOLON (plus E-SCOPE-001 follow-ons),
// and the spread cases lexed `/` as a division.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let mods;
let dir;
beforeAll(() => {
  ({ mods } = loadM2());
  dir = mkdtempSync(join(tmpdir(), "s482-boot-contextual-names-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const allDiags = (files) => frontEnd(mods, files).diags;
const errorsOf = (files) => allDiags(files).filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const codes = (src) => allDiags([{ path: "s.scrml", src }]).filter((d) => d.severity === "Error").map((d) => d.code);
const clean = (src) => expect(errorsOf([{ path: "s.scrml", src }])).toEqual([]);
const prog = (decls) => `<program>\n\${\n${decls}\n}\n</program>\n`;
const LIB = { path: "b.scrml", src: `\${\n    export const a: int = 1;\n}\n` };

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

describe("F1 — `from` / `server` bind as a `for (… of …)` binder (§54.3)", () => {
  test("`for (const from of xs)`", () => {
    clean(prog(`    fn a(xs: int[]) -> int { let s: int = 0; for (const from of xs) { s = s + from; } return s; }`));
  });
  test("`for (let server of xs)`", () => {
    clean(prog(`    fn a(xs: int[]) -> int { let s: int = 0; for (let server of xs) { s = s + server; } return s; }`));
  });
  test("`for (from of xs)` — a declared binding as the binder", () => {
    clean(prog(`    fn a(xs: int[]) -> int { let s: int = 0; let from: int = 0; for (from of xs) { s = s + from; } return s; }`));
  });
  test("a `for (… in …)` head with a contextual binder is the E-CTRL-011 refusal, not a condition head", () => {
    expect(codes(prog(`    fn a(o: int[]) -> int { let s: int = 0; for (const from in o) { s = s + 1; } return s; }`))).toEqual(["E-CTRL-011"]);
  });
  test("a braceless head with a contextual binder is the one E-FOR-UNPARENTHESIZED-HEAD", () => {
    expect(codes(prog(`    fn a(xs: int[]) -> int { let s: int = 0; for from of xs { s = s + 1; } return s; }`))).toEqual(["E-FOR-UNPARENTHESIZED-HEAD"]);
  });
  test("a loop label `from:` and `break from;`", () => {
    clean(prog(`    fn a(xs: int[]) -> int { let s: int = 0; from: for (const x of xs) { if (x > 2) { break from; } s = s + x; } return s; }`));
  });
});

describe("F1 — every other binding site reads a contextual word as an identifier", () => {
  test("a function name: `fn from(…)` / `fn server(…)` / `function some(…)` (g-boot-contextual-word-fn-name-s482)", () => {
    clean(prog(`    fn from(x: int) -> int { return x + 1; }
    fn server(x: int) -> int { return x + 2; }
    function some(x: int) -> int { return x + 3; }
    function b() -> int { return from(1) + server(1) + some(1); }`));
  });
  test("a nested function declaration `fn render(…)` (§7.3.1)", () => {
    clean(prog(`    fn b() -> int { fn render(x: int) -> int { return x; } return render(2); }`));
  });
  test("arrow parameters: `(from) =>`, `from =>`, `(server: int) =>`", () => {
    clean(prog(`    fn b(xs: int[]) -> int[] { return xs.map((from) => from + 1); }
    fn c(xs: int[]) -> int[] { return xs.map(from => from + 1); }
    function d() -> int { const f = (server: int) => server + 1; return f(1); }`));
  });
  test("a `match` pattern binder `.A(from)`", () => {
    clean(prog(`    type E:enum = { A(n: int), B }\n    fn b(e: E) -> int { return match e { .A(from) :> from, .B :> 0 }; }`));
  });
  test("a `!{}` arm binder `.Bad(from, server)`", () => {
    const src = `<program>\n    type E:enum = { Bad(a: int, b: int) }\n    function g(n: int)! E { if (n > 0) { fail E.Bad(1, 2); } return n; }\n    function h() -> int {\n        const v: int = g(1) !{ .Bad(from, server) :> from + server };\n        return v;\n    }\n    <p>\${h()}</p>\n</program>\n`;
    clean(src);
  });
  test("an import's local name: `import { a as from }` and `import * as from`", () => {
    const one = prog(`    import { a as from } from "./b.scrml";\n    fn c() -> int { return from + 1; }`);
    expect(errorsOf([LIB, { path: "s.scrml", src: one }])).toEqual([]);
    const ns = prog(`    import * as from from "./b.scrml";\n    fn c() -> int { return from.a; }`);
    expect(errorsOf([LIB, { path: "s.scrml", src: ns }])).toEqual([]);
  });
  test("a word that IS reserved still is no local name (`import { a as if }`, `fn if(…)`)", () => {
    const one = prog(`    import { a as if } from "./b.scrml";`);
    expect(errorsOf([LIB, { path: "s.scrml", src: one }]).map((e) => e.split(":")[0])).toContain("E-PARSE-IMPORT");
    expect(codes(prog(`    fn if(x: int) -> int { return x; }`))).toContain("E-PARSE-FN");
  });
});

describe("F2 — `as`, `pure`, `render`, `some` are binding names (§18, §7.2, §20.3a)", () => {
  test("the self-host's own shapes: `const as`, `const pure`, `const render`, `let some`", () => {
    clean(prog(`    fn b1(x: int) -> int { const as: int = x; return as + 1; }
    fn b2(x: boolean) -> boolean { const pure: boolean = x; return pure && true; }
    fn b3(x: int) -> int { const render: int = x; return render * 2; }
    fn b4(xs: int[]) -> boolean {
        let some = false;
        for (const x of xs) { if (x > 1) { some = true; } }
        return some;
    }`));
  });
  test("`pure` / `render` / `some` before `.` read a member of the name", () => {
    clean(prog(`    type S:struct = { n: int, m: number }
    fn c1(pure: S) -> int { return pure.n + 1; }
    fn c2(render: S) -> number { return render.m / 2.0; }
    fn c3(some: S) -> int { return some.n; }`));
  });
  test("`/` after `pure` / `render` / `some` divides", () => {
    expect(lexed("pure / 2")).toEqual(["Keyword:pure", "Slash:/", "NumberLit:2", "Eof:"]);
    expect(lexed("render / 2")).toEqual(["Keyword:render", "Slash:/", "NumberLit:2", "Eof:"]);
    expect(lexed("some.n / 2")).toEqual(["Keyword:some", "Dot:.", "Ident:n", "Slash:/", "NumberLit:2", "Eof:"]);
  });
  test("the keyword readings are unchanged: `x is some` (W-IS-SOME-DEPRECATED), `import * as m`, `a as .Published`", () => {
    const ds = allDiags([{ path: "s.scrml", src: prog(`    fn f(x: int | not) -> boolean { return x is some; }`) }]);
    expect(ds.filter((d) => d.severity === "Error")).toEqual([]);
    expect(ds.map((d) => d.code)).toContain("W-IS-SOME-DEPRECATED");
    expect(errorsOf([LIB, { path: "s.scrml", src: prog(`    import * as m from "./b.scrml";\n    fn c() -> int { return m.a; }`) }])).toEqual([]);
    // `as` keeps its bare-variant reading (§14.12.6.2) — it is NOT a name before `.` (owner question)
    expect(lexed("return a as .Published;")).toEqual(["Keyword:return", "Ident:a", "Keyword:as", "BareVariant:.Published", "Semicolon:;", "Eof:"]);
  });
  test("the values run: each word read as the name it binds", async () => {
    const src = `<program>
\${
    type S:struct = { n: int }
    fn total(xs: int[]) -> int {
        let s: int = 0;
        for (const from of xs) { s = s + from; }
        return s;
    }
    fn mix(x: int) -> int {
        const as: int = x;
        const render: int = as * 2;
        const pure: S = { n: render };
        let some: int = 0;
        some = pure.n + 1;
        return some;
    }
    fn from(x: int) -> int { return x + 100; }
}
<p id="a">\${total([1, 2, 3])}</p>
<p id="b">\${mix(5)}</p>
<p id="c">\${from(1)}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c"])).toEqual(["6", "11", "101"]);
  }, 60000);
});

describe("F3 — the word after a spread `...` is its operand, never a member name", () => {
  test("`[... typeof /re/.source]` opens a regular expression", () => {
    expect(lexed("[... typeof /re/.source]")).toEqual(["LBracket:[", "Dot:.", "Dot:.", "Dot:.", "Keyword:typeof", "RegexLit:/re/", "Dot:.", "Ident:source", "RBracket:]", "Eof:"]);
  });
  test("`{... typeof .X}` reads a bare variant after the operator", () => {
    expect(lexed("{... typeof .X}")).toEqual(["LBrace:{", "Dot:.", "Dot:.", "Dot:.", "Keyword:typeof", "BareVariant:.X", "RBrace:}", "Eof:"]);
  });
  test("a keyword-named member after ONE dot is still a member (`o.await / 2`, `a.typeof / 2`)", () => {
    expect(lexed("o.await / 2")).toEqual(["Ident:o", "Dot:.", "Keyword:await", "Slash:/", "NumberLit:2", "Eof:"]);
    expect(lexed("a.typeof / 2")).toEqual(["Ident:a", "Dot:.", "Keyword:typeof", "Slash:/", "NumberLit:2", "Eof:"]);
  });
});
