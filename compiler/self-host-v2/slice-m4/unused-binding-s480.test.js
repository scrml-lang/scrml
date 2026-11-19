// s480-w-unused-binding — SPEC §7.3.5 (S479 ruling, user-voice "⭐ RULED — unused-binding lint code:
// W-UNUSED-BINDING (S479, 2026-11-18)"): "any local binding (`let`, `const`, keywordless; `lin` excluded
// because §35 governs it) not read before its scope ends gets the warning, and a `_` prefix exempts it".
// A lint never rejects: every program here compiles (no Error). Gap g-spec-unused-binding-lint-code-s479.
import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const diags = (src) => {
  const r = frontEnd(mods, [{ path: "s.scrml", src }]);
  return [...(r.parseDiags || []), ...r.diags];
};
// The W-UNUSED-BINDING reports, each as the source text at its span; asserts the compile has no Error.
const unused = (src) => {
  const ds = diags(src);
  expect(ds.filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message)).toEqual([]);
  const ws = ds.filter((d) => d.code === "W-UNUSED-BINDING");
  for (const w of ws) expect(w.severity).toBe("Warning");
  return ws.map((d) => src.slice(d.span.start, d.span.end));
};
const unusedMsgs = (src) => diags(src).filter((d) => d.code === "W-UNUSED-BINDING").map((d) => d.message);

// One function body in a program that compiles clean.
const fnProg = (body, decls = "") => `<program>\n    let <n:int=0/>\n${decls}    function go() {\n${body}\n    }\n    <p>\${@n}</p>\n    <button onclick=go()>go</button>\n</program>\n`;

describe("§7.3.5 — the binding forms that are warned", () => {
  test("an unread `let`, `const` and keywordless declaration each warn, at the declaration", () => {
    expect(unused(fnProg(`        let a = 1;\n        @n = 2;`))).toEqual(["let a = 1"]);
    expect(unused(fnProg(`        const a = 1;\n        @n = 2;`))).toEqual(["const a = 1"]);
    expect(unused(fnProg(`        a = 1;\n        @n = 2;`))).toEqual(["a = 1"]);
  });

  test("the message names the binding, §7.3.5, and the `_` hatch", () => {
    const [m] = unusedMsgs(fnProg(`        const total = 1;\n        @n = 2;`));
    expect(m).toContain("`total` is declared, but nothing reads it before its scope ends");
    expect(m).toContain("§7.3.5");
    expect(m).toContain("`_total`");
  });

  test("a write-only binding (assigned, never read) warns, and says the writes are lost", () => {
    const src = fnProg(`        let a = 1;\n        a = 2;\n        @n = 3;`);
    expect(unused(src)).toEqual(["let a = 1"]);
    expect(unusedMsgs(src)[0]).toContain("is assigned, but nothing reads it");
  });

  test("an unread iterate-head binder warns (§49.3.5: the binder is a `const`)", () => {
    expect(unused(fnProg(`        for (const x of [1, 2]) { @n = @n + 1; }`))).toEqual(["x"]);
    expect(unused(fnProg(`        for (x of [1, 2]) { @n = @n + 1; }`))).toEqual(["x"]);
  });

  test("an unread binder of a Tier-0 `${ for }` in markup warns; one read in the lifted row does not", () => {
    const src = `<program>\n    <ul>\${ for (x of [1, 2]) { lift <li>\${x}</li>; } }</ul>\n    <ul>\${ for (y of [1, 2]) { lift <li>k</li>; } }</ul>\n</program>\n`;
    expect(unused(src)).toEqual(["y"]);
  });

  test("an unread loop bound as a value warns", () => {
    expect(unused(fnProg(`        const xs = for (x of [1, 2]) { lift x; };\n        @n = 1;`))).toEqual(["xs"]);
  });

  test("an unread destructured name warns; the one that is read does not", () => {
    const src = fnProg(`        const o: Pt = { a: 1, b: 2 };\n        const { a, b } = o;\n        @n = a;`, `    type Pt:struct = { a: int, b: int }\n`);
    expect(unused(src)).toEqual(["b"]);
  });

  test("an unread local of an event-handler body warns", () => {
    const src = `<program>\n    let <n:int=0/>\n    <p>\${@n}</p>\n    <button onclick={ const t = 1; @n = 2; }>go</button>\n</program>\n`;
    expect(unused(src)).toEqual(["const t = 1"]);
  });

  test("a binding read only by the initializer of a later binding is read; the later one is not", () => {
    expect(unused(fnProg(`        const a = 1;\n        const b = a + 1;\n        @n = 2;`))).toEqual(["const b = a + 1"]);
  });
});

describe("§7.3.5 — shadowing is exact", () => {
  test("an inner binding unread while the outer one is read: the inner one warns", () => {
    expect(unused(fnProg(`        const a = 1;\n        if (@n > 0) { const a = 2; }\n        @n = a;`))).toEqual(["const a = 2"]);
  });

  test("an outer binding unread while an inner one of the name is read: the outer one warns", () => {
    expect(unused(fnProg(`        const a = 1;\n        if (@n > 0) { const a = 2; @n = a; }`))).toEqual(["const a = 1"]);
  });
});

describe("§7.3.5 — what counts as a read", () => {
  test("a plain read, a read in a nested function, and a read in a closure", () => {
    expect(unused(fnProg(`        const a = 1;\n        @n = a;`))).toEqual([]);
    expect(unused(fnProg(`        const a = 1;\n        function inner() -> int { return a; }\n        @n = inner();`))).toEqual([]);
    expect(unused(fnProg(`        let a = 1;\n        const f = () => a + 1;\n        @n = f();`))).toEqual([]);
  });

  test("a read only inside a branch that never runs is a read", () => {
    expect(unused(fnProg(`        const a = 1;\n        if (false) { @n = a; }`))).toEqual([]);
  });

  test("a read in a lifted row's attribute is a read", () => {
    expect(unused(`<program>\n    <ul>\${ for (x of [1, 2]) { lift <li title=x>k</li>; } }</ul>\n</program>\n`)).toEqual([]);
  });

  test("lane reading: a reassignment whose value names the binding reads it (`a = a + 1`)", () => {
    expect(unused(fnProg(`        let a = 1;\n        a = a + 1;\n        @n = 3;`))).toEqual([]);
  });

  test("a counted head's `let` read by its own condition is read", () => {
    expect(unused(fnProg(`        for (let i = 0; i < 3; i = i + 1) { @n = @n + 1; }`))).toEqual([]);
  });
});

describe("§7.3.5 — the forms that are not warned", () => {
  test("a `_`-prefixed name is exempt — every form", () => {
    expect(unused(fnProg(`        const _a = 1;\n        let _b = 2;\n        _c = 3;\n        @n = 2;`))).toEqual([]);
    expect(unused(fnProg(`        for (const _x of [1, 2]) { @n = @n + 1; }`))).toEqual([]);
  });

  test("a consumed `lin` gets no lint (§35 governs `lin`)", () => {
    expect(unused(fnProg(`        lin a = 1;\n        @n = a;`))).toEqual([]);
  });

  test("an unread `lin` is §35's E-LIN-001, never W-UNUSED-BINDING", () => {
    const ds = diags(fnProg(`        lin a = 1;\n        @n = 2;`));
    expect(ds.map((d) => d.code)).toContain("E-LIN-001");
    expect(ds.map((d) => d.code)).not.toContain("W-UNUSED-BINDING");
  });

  test("an unread function parameter is not reported", () => {
    const src = `<program>\n    let <n:int=0/>\n    function go(p: int) {\n        @n = 2;\n    }\n    <p>\${@n}</p>\n    <button onclick=go(1)>go</button>\n</program>\n`;
    expect(unused(src)).toEqual([]);
  });

  test("an unread file-scope binding is not local — not reported", () => {
    expect(unused(`<program>\n    \${ const k = 1; let m = 2; }\n    <p>x</p>\n</program>\n`)).toEqual([]);
  });

  test("an unread `match` arm binder is not reported (a pattern binder, §18.7)", () => {
    const src = `<program>\n    type T:enum = { A(v: int), B }\n    function f(t: T) -> int {\n        return match t {\n            .A(v) :> 1,\n            .B :> 0\n        };\n    }\n    <p>\${f(T.B)}</p>\n</program>\n`;
    expect(unused(src)).toEqual([]);
  });

  test("a compile with an Error reports no W-UNUSED-BINDING (the reads inside a refused construct are not known)", () => {
    const ds = diags(fnProg(`        const a = 1;\n        @n = nope;`));
    expect(ds.some((d) => d.severity === "Error")).toBe(true);
    expect(ds.map((d) => d.code)).not.toContain("W-UNUSED-BINDING");
  });
});
