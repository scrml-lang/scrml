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

  test("a compile with an Error reports no W-UNUSED-BINDING (the reads inside a refused construct are not known)", () => {
    const ds = diags(fnProg(`        const a = 1;\n        @n = nope;`));
    expect(ds.some((d) => d.severity === "Error")).toBe(true);
    expect(ds.map((d) => d.code)).not.toContain("W-UNUSED-BINDING");
  });
});

// S480 ruling item 2 (`ruling:user-voice-scrml.md-S480-unused-binding-six`): "Unread `match` / `!{}` /
// `<match>` arm binders ARE reported … they are binding forms and `.A(_)` is the cheap fix".
describe("§7.3.5 — arm binders (S480 ruling item 2)", () => {
  const TY = `    type T:enum = { A(v: int), B, C(x: int, y: int) }\n`;
  const valueProg = (arms) => `<program>\n${TY}    function f(t: T) -> int {\n        return match t {\n${arms}\n        };\n    }\n    <p>\${f(T.B)}</p>\n</program>\n`;
  const stmtProg = (arms) => `<program>\n${TY}    let <n:int=0/>\n    function go(t: T) {\n        match t {\n${arms}\n        };\n    }\n    <p>\${@n}</p>\n    <button onclick=go(T.B)>go</button>\n</program>\n`;
  const ERR = `    type E:enum = { Bad(why: string), Gone }\n    let <n:int=0/>\n    let <s:string=""/>\n    function g(k: int)! E { if (k > 0) { fail E.Gone; } return k; }\n`;
  const errProg = (rhs) => `<program>\n${ERR}    function go() {\n        const a: int = ${rhs};\n        @n = a;\n    }\n    <p>\${@n} \${@s}</p>\n    <button onclick=go()>go</button>\n</program>\n`;

  test("an unread `match` arm binder warns, at the binder; the read one does not", () => {
    expect(unused(valueProg(`            .A(v) :> 1,\n            .B :> 0,\n            .C(x, y) :> x`))).toEqual(["v", "y"]);
  });

  test("the arm message names the `_` fix", () => {
    const [m] = unusedMsgs(valueProg(`            .A(v) :> 1,\n            .B :> 0,\n            .C(_, _) :> 2`));
    expect(m).toContain("`v` is bound by this arm's pattern, but nothing in the arm reads it (§7.3.5)");
    expect(m).toContain("`.V(_)`");
  });

  test("`_` and a `_`-prefixed arm binder are exempt", () => {
    expect(unused(valueProg(`            .A(_) :> 1,\n            .B :> 0,\n            .C(_x, _) :> 2`))).toEqual([]);
  });

  test("an arm binder read in a block arm, by a closure, or in a loop's `lift` is read", () => {
    expect(unused(stmtProg(`            .A(v) :> { const w = v + 1; @n = w; },\n            .B :> { @n = 0; },\n            .C(x, y) :> { const h = () => x + y; @n = h(); }`))).toEqual([]);
    expect(unused(stmtProg(`            .A(v) :> { const xs = for (i of [1, 2]) { lift v + i; }; @n = xs.length; },\n            .B :> { @n = 0; },\n            .C(_, _) :> { @n = 2; }`))).toEqual([]);
  });

  test("an arm binder used to rebuild a value is read", () => {
    const src = `<program>\n${TY}    function f(t: T) -> T {\n        return match t {\n            .A(v) :> T.A(v + 1),\n            .B :> T.B,\n            .C(x, y) :> T.C(y, x)\n        };\n    }\n    function k(t: T) -> int {\n        return match f(t) {\n            .A(_) :> 1,\n            .B :> 0,\n            .C(_, _) :> 2\n        };\n    }\n    <p>\${k(T.B)}</p>\n</program>\n`;
    expect(unused(src)).toEqual([]);
  });

  test("an arm binder read only by an unread local's initializer is read; the local warns (and an unread one still does)", () => {
    expect(unused(stmtProg(`            .A(v) :> { @n = 1; },\n            .B :> { @n = 0; },\n            .C(x, y) :> { let z = x; z = y; @n = 2; }`))).toEqual(["v", "let z = x"]);
  });

  test("an unread `!{}` arm binder warns; a whole-error `_ err` binder too", () => {
    expect(unused(errProg(`g(1) !{ .Bad(why) :> 1, _ err :> 2 }`))).toEqual(["why", "err"]);
  });

  test("a failable `match`: `.Ok(v)` and payload binders read do not warn; an unread `_ err` does", () => {
    expect(unused(errProg(`match g(1) { .Ok(v) :> v, .Bad(why) :> { @s = why; lift 1; }, _ err :> 2 }`))).toEqual(["err"]);
  });

  test("a `<match>` arm binder unread in its markup warns; one read in an interpolation or attribute does not", () => {
    const src = `<program>\n${TY}    <t:T=.B/>\n    <match for=T on=@t>\n        <A(v)><p>a</p></>\n        <B><p>b</p></>\n        <C(x, y)><p title=x>\${y}</p></>\n    </match>\n</program>\n`;
    expect(unused(src)).toEqual(["v"]);
  });

  // s480-unused-sweep (review of #2009, LOW): the fix is spelled in the arm's own syntax, and every arm
  // message names the `_`-prefixed-name alternative (§7.3.5 "or a `_`-prefixed name").
  test("a `<match>` arm's message spells the fix in markup (`<V(_)>`), not `.V(_)`; both arm forms name `_v`", () => {
    const mk = `<program>\n${TY}    <t:T=.B/>\n    <match for=T on=@t>\n        <A(v)><p>a</p></>\n        <B><p>b</p></>\n        <C(_, _)><p>c</p></>\n    </match>\n</program>\n`;
    const [m] = unusedMsgs(mk);
    expect(m).toContain("`<V(_)>`");
    expect(m).not.toContain("`.V(_)`");
    expect(m).toContain("`_v`");
    const [v] = unusedMsgs(valueProg(`            .A(v) :> 1,\n            .B :> 0,\n            .C(_, _) :> 2`));
    expect(v).toContain("`.V(_)`");
    expect(v).toContain("`_v`");
    const ws = unusedMsgs(errProg(`g(1) !{ .Bad(_) :> 1, _ err :> 2 }`));
    expect(ws.length).toBe(1);
    expect(ws[0]).toContain("`_err`");
  });
});

// S480 ruling (`ruling:user-voice-scrml.md-S480-each-binders`) item 1: "Unread `<each>` binders are
// reported … for the same reason you gave for loop binders"; item 2: nested `function` declarations are not.
describe("§7.3.5 — `<each>` binders (S480 each-binders ruling)", () => {
  const RT = `    type R:struct = { id: int, name: string, on: boolean, cells: string[] }\n    <rs:R[]=([])/>\n`;
  const eachProg = (body, decls = "") => `<program>\n${RT}${decls}    <ul>\n${body}\n    </ul>\n</program>\n`;

  test("an unread `as name` warns, at the name, with the `<each>` message", () => {
    const src = eachProg(`        <each in=@rs as r>\n            <li>row</li>\n        </each>`);
    expect(unused(src)).toEqual(["r"]);
    const [m] = unusedMsgs(src);
    expect(m).toContain("`r` is bound by this `<each>`'s `as r`, but nothing in the row reads it (§7.3.5)");
    expect(m).toContain("remove `as r`");
    expect(m).toContain("`_r`");
  });

  test("a binder read in an interpolation, attribute, handler, row `if=`, or its `<each>`'s `key=` is read", () => {
    const decls = `    let <pick:int=0/>\n    function sel(i: int) { @pick = i; }\n    <p>\${@pick}</p>\n`;
    const rows = [
      `<each in=@rs as a>\n            <li>\${a.name}</li>\n        </each>`,
      `<each in=@rs as b>\n            <li title=b.name>x</li>\n        </each>`,
      `<each in=@rs as c>\n            <li onclick=sel(c.id)>x</li>\n        </each>`,
      `<each in=@rs as d>\n            <li onclick={ @pick = d.id; }>x</li>\n        </each>`,
      `<each in=@rs as e>\n            <li if=e.on>x</li>\n        </each>`,
      `<each in=@rs as f key=f.id>\n            <li>x</li>\n        </each>`,
    ];
    for (const r of rows) expect(unused(eachProg(`        ${r}`, decls))).toEqual([]);
  });

  test("nested `<each>`: an outer binder read in the inner row (or as its source) is read; an unread inner one warns", () => {
    expect(unused(eachProg(`        <each in=@rs as f>\n            <each in=@rs as g>\n                <li>\${f.name} \${g.name}</li>\n            </each>\n        </each>`))).toEqual([]);
    expect(unused(eachProg(`        <each in=@rs as row>\n            <each in=row.cells as cell>\n                <li>c</li>\n            </each>\n        </each>`))).toEqual(["cell"]);
  });

  test("a binder read by a component's prop, or inside a `<match>` arm in the row, is read", () => {
    const card = `<card t:string/>\nrenders <div class="c"><span>\${t}</span></div>\n`;
    expect(unused(card + eachProg(`        <each in=@rs as r>\n            <li><card t=r.name/></li>\n        </each>`))).toEqual([]);
    const P = `    type P:enum = { A(v: int), B }\n    <p:P=.B/>\n`;
    expect(unused(eachProg(`        <each in=@rs as r>\n            <match for=P on=@p>\n                <A(v)><li>\${v} \${r.name}</li></>\n                <B><li>b</li></>\n            </match>\n        </each>`, P))).toEqual([]);
  });

  test("a read through `@.` reads the binding (§17.7.3: `name` and `@.` are aliases)", () => {
    expect(unused(eachProg(`        <each in=@rs as r>\n            <li>\${@.name}</li>\n        </each>`))).toEqual([]);
  });

  test("an `<each>` with no `as`, and a `_`-prefixed `as _r`, are not reported", () => {
    expect(unused(eachProg(`        <each in=@rs>\n            <li>row</li>\n        </each>\n        <each in=@rs as _r>\n            <li>row</li>\n        </each>`))).toEqual([]);
  });

  test("item 2: an unused nested `function` declaration is not reported by W-UNUSED-BINDING", () => {
    expect(unused(fnProg(`        function helper() -> int { return 1; }\n        @n = 2;`))).toEqual([]);
  });
});
