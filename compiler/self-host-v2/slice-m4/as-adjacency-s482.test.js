// as-adjacency-s482.test.js — lane s482-as-adjacency.
//
// 1. The owner ruling (user-voice-scrml.md "RULED — `as.value`: adjacency decides",
//    ruling:user-voice-scrml.md-S482-as-adjacency, PERMANENT): "a `.` touching `as` with no space is
//    member access; a spaced `as .V` stays a bare variant. This follows §7.2.2 rule 4's 'adjacency
//    decides' precedent." Built in lex.scrml `dotLastKind` (SPEC §14.12.6.2, g-boot-contextual-as-member-s482).
// 2. The #2058 review follow-ups: LOW-1 (a named function expression with a contextual name reaches the
//    named refusal), LOW-2 (a `given` head names a contextual-word binding), LOW-3 (the arm-list scanner
//    reads a contextual-word binder as parsePattern does), INFO-1 (W-RENDER-SHADOWED / W-LOG-SHADOWED,
//    §20.3a / §20.6.7).
//
// Red on base a7f50def5: `as.value` lexed `Keyword:as BareVariant:.value` (E-STMT-MISSING-SEMICOLON,
// E-TYPE-VARIANT); the LOW cases gave E-SYNTAX-044 / E-PARSE-ARM / E-SCOPE-001 cascades; no W-*-SHADOWED.

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
  dir = mkdtempSync(join(tmpdir(), "s482-as-adjacency-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const allDiags = (src) => frontEnd(mods, [{ path: "s.scrml", src }]).diags;
const errorsOf = (src) => allDiags(src).filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const codes = (src) => allDiags(src).filter((d) => d.severity === "Error").map((d) => d.code);
const clean = (src) => expect(errorsOf(src)).toEqual([]);
const prog = (decls) => `<program>\n\${\n${decls}\n}\n</program>\n`;
const TY = `    type P:struct = { value: int }\n    type D:struct = { deep: int }\n    type Q:struct = { value: D }\n`;

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

describe("the ruling — a `.` touching `as` is member access", () => {
  test("`as.value`, `as.f()`, `as.value.deep` lex Dot + Ident", () => {
    expect(lexed("as.value")).toEqual(["Keyword:as", "Dot:.", "Ident:value", "Eof:"]);
    expect(lexed("as.f()")).toEqual(["Keyword:as", "Dot:.", "Ident:f", "LParen:(", "RParen:)", "Eof:"]);
    expect(lexed("as.value.deep")).toEqual(["Keyword:as", "Dot:.", "Ident:value", "Dot:.", "Ident:deep", "Eof:"]);
  });
  test("member reads through a binding named `as` compile (the self-host's analyze.scrml shape)", () => {
    clean(prog(TY + `    fn b(o: P) -> int { const as: P = o; return as.value + 1; }
    fn c(o: Q) -> int { const as: Q = o; return as.value.deep; }
    fn d(xs: int[]) -> int { const as: int[] = xs; return as.concat([1]).length; }
    fn e(o: P | not) -> int { const as: P | not = o; if (as is given) { return as.value; } return 0; }`));
  });
  test("the values run", async () => {
    const src = `<program>
\${
${TY}    fn b(o: P) -> int { const as: P = o; return as.value + 1; }
    fn c(o: Q) -> int { const as: Q = o; return as.value.deep * 2; }
    fn e(xs: int[]) -> int { const as: int[] = xs; return as.length; }
}
<p id="a">\${b({ value: 4 })}</p>
<p id="b">\${c({ value: { deep: 5 } })}</p>
<p id="c">\${e([1, 2, 3])}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c"])).toEqual(["5", "10", "3"]);
  }, 180000);
});

describe("the ruling — a spaced `as .V` stays the bare-variant cast (§14.12.6.2)", () => {
  test("a space, a newline or a comment between `as` and `.` keeps the bare variant", () => {
    expect(lexed("return a as .Published;")).toEqual(["Keyword:return", "Ident:a", "Keyword:as", "BareVariant:.Published", "Semicolon:;", "Eof:"]);
    expect(lexed("x as\n.V")).toEqual(["Ident:x", "Keyword:as", "BareVariant:.V", "Eof:"]);
    expect(lexed("as /*c*/.V")).toEqual(["Keyword:as", "BareVariant:.V", "Eof:"]);
    expect(lexed("as //c\n.V")).toEqual(["Keyword:as", "BareVariant:.V", "Eof:"]);
  });
  test("the import / export `as` forms are unchanged", () => {
    expect(lexed(`import { a as b } from "./x"`).slice(0, 6)).toEqual(["Keyword:import", "LBrace:{", "Ident:a", "Keyword:as", "Ident:b", "RBrace:}"]);
    expect(lexed(`import * as m from "./x"`)).toEqual(["Keyword:import", "Star:*", "Keyword:as", "Ident:m", "Keyword:from", "StringLit:\"./x\"", "Eof:"]);
    expect(lexed(`export { a as b }`)).toEqual(["Keyword:export", "LBrace:{", "Ident:a", "Keyword:as", "Ident:b", "RBrace:}", "Eof:"]);
  });
  test("a SPACED `/` after `as` is read as before (a touching one divides: selfhost-residue-s482.test.js)", () => {
    expect(lexed("as /re/")).toEqual(["Keyword:as", "RegexLit:/re/", "Eof:"]);
  });
});

describe("#2058 review LOW-1 — `function from(…)` as a value reaches the named-function-expression refusal", () => {
  test("one named refusal, no cascade", () => {
    const es = errorsOf(prog(`    function t() -> int { const f = function from(x: int) { return x; }; return 1; }`));
    expect(es.length).toBe(1);
    expect(es[0]).toContain("E-BOOTSTRAP-UNSUPPORTED: a NAMED function expression `function from(…) { … }`");
  });
});

describe("#2058 review LOW-2 — a `given` head names a contextual-word binding", () => {
  test("`given some :>`, `given as :>`, `given from, some :>` compile and run", async () => {
    const src = `<program>
\${
    fn t(x: int | not) -> int { const some: int | not = x; given some :> { return some + 1; } return 0; }
    fn u(x: int | not) -> int { const as: int | not = x; given as :> { return as + 1; } return 0; }
    fn v(x: int | not, y: int | not) -> int { const from: int | not = x; const some: int | not = y; given from, some :> { return from + some; } return 0; }
}
<p id="a">\${t(1)}</p>
<p id="b">\${u(2)}</p>
<p id="c">\${v(1, 2)}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c"])).toEqual(["2", "3", "3"]);
  }, 180000);
  test("the markup guard `${ given some :> … }` is the named markup-guard refusal, not a cascade", () => {
    const es = errorsOf(`<program>\n\${\n    const some: int | not = 1;\n}\n<p>\${ given some :> { <b>x</b> } }</p>\n</program>\n`);
    expect(es.length).toBe(1);
    expect(es[0]).toContain("E-BOOTSTRAP-UNSUPPORTED: the markup presence guard `given some :> { … }`");
  });
});

describe("#2058 review LOW-3 — the arm-list scanner reads a contextual-word binder as parsePattern does", () => {
  const E = `    type E:enum = { A, B }\n`;
  test("`_ some` on a new line: the missing `,` and E-MATCH-BARE-BINDER", () => {
    expect(codes(prog(E + `    fn t(e: E) -> int { return match e {\n        .A :> 1\n        _ some :> 2\n    }; }`))).toEqual(["E-MATCH-ARM-SEPARATOR", "E-MATCH-BARE-BINDER"]);
  });
  test("`as :>` (after a `,` and on a new line): E-MATCH-BARE-BINDER", () => {
    expect(codes(prog(E + `    fn t(e: E) -> int { return match e { .A :> 1, as :> 2 }; }`))).toEqual(["E-MATCH-BARE-BINDER"]);
    expect(codes(prog(E + `    fn t(e: E) -> int { return match e {\n        .A :> 1\n        as :> 2\n    }; }`))).toEqual(["E-MATCH-ARM-SEPARATOR", "E-MATCH-BARE-BINDER"]);
  });
  test("the legacy paren-free binder `.A as :>` on a new line: the missing `,` and its E-PARSE-ARM", () => {
    const cs = codes(prog(`    type E:enum = { A(n: int), B }\n    fn t(e: E) -> int { return match e {\n        .B :> 1\n        .A as :> 2\n    }; }`));
    expect(cs).toEqual(["E-MATCH-ARM-SEPARATOR", "E-PARSE-ARM"]);
  });
});

describe("#2058 review INFO-1 — W-RENDER-SHADOWED / W-LOG-SHADOWED (§20.3a, §20.6.7)", () => {
  const infos = (src) => allDiags(src).filter((d) => d.severity === "Info").map((d) => d.code);
  test("a `fn render` declaration (top level or nested) is W-RENDER-SHADOWED, Info, and still compiles", () => {
    expect(infos(prog(`    fn render(x: int) -> int { return x + 1; }`))).toEqual(["W-RENDER-SHADOWED"]);
    expect(infos(prog(`    fn t() -> int { fn render(x: int) -> int { return x; } return render(2); }`))).toEqual(["W-RENDER-SHADOWED"]);
    clean(prog(`    fn render(x: int) -> int { return x + 1; }`));
  });
  test("a `function log` declaration is W-LOG-SHADOWED", () => {
    expect(infos(prog(`    function log(s: string) { let _ = s; }`))).toEqual(["W-LOG-SHADOWED"]);
  });
  test("a non-function binding of the name is not linted (impl#1 parity: declarations of a function)", () => {
    expect(infos(prog(`    fn t() -> int { const render: int = 2; return render; }`))).toEqual([]);
  });
  test("the shadowing function runs", async () => {
    const src = `<program>\n\${\n    fn render(x: int) -> int { return x + 1; }\n}\n<p id="a">\${render(5)}</p>\n</program>\n`;
    expect(await run(src, ["a"])).toEqual(["6"]);
  }, 180000);
});
