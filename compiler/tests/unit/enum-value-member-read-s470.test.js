/**
 * enum-value-member-read-s470.test.js — S470 lane B (s470-typed-payload-binders):
 * g-impl1-enum-value-member-read-unchecked-s470 + escape 3 of
 * g-impl1-whole-error-binder-allowlist-escapes-s469. Executed floor: security-failable-pack
 * r11-shapes.js (families s14 / f17 / l9 / t9).
 *
 * Ruling (bryan, S470, user-voice-scrml.md "(B) Type the binders (Recommended)"):
 *  - a payload binder has its field's DECLARED type — SPEC §18.7 "The type of each bound variable
 *    SHALL be the declared type of the corresponding field in the enum variant definition";
 *  - a member read other than `.variant` on an ENUM-typed value is refused — §34 E-TYPE-004
 *    "Struct field access on non-struct type" (§14.3).
 * And `==` / `!=` between an enum value and a primitive literal is E-EQ-001 (§45.3 "`==` between
 * incompatible types is a compile error").
 *
 * Before: impl#1 checked member reads on STRUCT-typed names only and bound every payload binder
 * `asIs`, so `x.reason` with `x: Inner` compiled and read `undefined` (a wrong password logged in).
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";
import { enumReadInferenceCount } from "../../src/type-system.ts";

function compileFiles(files, mode) {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s470-evmr-${uniq}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, src] of Object.entries(files)) writeFileSync(resolve(dir, name), src);
  try {
    const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: resolve(dir, "out"), log: () => {}, ...(mode ? { mode } : {}) });
    return (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const codesOf = (src, extra = {}, mode) => compileFiles({ "app.scrml": src, ...extra }, mode).map((e) => e.code);

const D = `type Inner:enum = { Bad(reason: string), Ok2 }
    type Outer:enum = { Wrapped(inner: Inner), Plain(code: number), None }
    type Holder:struct = { st: Inner, n: number }
    type AuthErr:enum = { Denied(reason: string), Wrapped(inner: Inner), Gone }
    function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Wrapped(Inner::Bad("bad"))
        return true
    }`;
const lib = (more, body) => `\${
    ${D}
    ${more}
    export function login(p) {
        ${body}
    }
}
`;
const R = (cond) => `return (${cond}) ? "rejected" : "LOGGED IN"`;

describe("a member read off an enum-typed value is E-TYPE-004 (§14.3, §34)", () => {
  const REFUSED = [
    ["a parameter typed with the enum", `function chk(x: Inner) { return x.reason == "bad" }`, R(`chk(Inner.Bad("bad"))`)],
    ["a typed local", "", `const x: Inner = Inner.Bad("bad")\n        ${R(`x.reason == "bad"`)}`],
    ["a local bound to `E.V(…)`", "", `const x = Inner.Bad("bad")\n        ${R(`x.reason == "bad"`)}`],
    ["a local bound to `E::V(…)`", "", `const x = Inner::Bad("bad")\n        ${R(`x.reason == "bad"`)}`],
    ["a `let` bound to a constructor", "", `let x = Inner.Bad("bad")\n        ${R(`x.reason == "bad"`)}`],
    ["a constructor read inline", "", R(`Inner.Bad("bad").reason == "bad"`)],
    ["`.data` off a constructor (impl#1's runtime shape is not a scrml member)", "", R(`Inner.Bad("bad").data.reason == "bad"`)],
    ["a struct field holding the enum", `function chk(h: Holder) { return h.st.reason == "bad" }`, R(`chk({ st: Inner.Bad("bad"), n: 1 })`)],
    ["a call of a function declared `-> Inner`", `function mk() -> Inner { return Inner.Bad("bad") }`, R(`mk().reason == "bad"`)],
    ["a call of a function that returns a constructor", `function mk() { return Inner.Bad("bad") }`, R(`mk().reason == "bad"`)],
    ["a method call on the enum value", `function chk(x: Inner) { return x.toString() == "bad" }`, R(`chk(Inner.Bad("bad"))`)],
    ["a bracket read", `function chk(x: Inner) { return x["reason"] == "bad" }`, R(`chk(Inner.Bad("bad"))`)],
    ["a tape element in a for-of", "", `const xs: Inner[] = [Inner.Bad("bad")]\n        let o = "LOGGED IN"\n        for (const x of xs) { if (x.reason == "bad") { o = "rejected" } }\n        return o`],
    ["a local aliasing an enum-typed parameter", `function chk(x: Inner) { const y = x\n return y.reason == "bad" }`, R(`chk(Inner.Bad("bad"))`)],
    ["an optional enum (`Inner | not`)", `function chk(x: Inner | not) { return x.reason == "bad" }`, R(`chk(Inner.Bad("bad"))`)],
  ];
  for (const [name, more, body] of REFUSED) {
    test(name, () => { expect(codesOf(lib(more, body), {}, "library")).toContain("E-TYPE-004"); });
  }
  test("an imported enum's parameter", () => {
    const types = { "types.scrml": "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n}\n" };
    const src = `<program kind="tool">\nimport { Inner } from "./types.scrml"\n\${\n    function chk(x: Inner) { return x.reason == "bad" }\n    function main(args) { log(chk(Inner.Bad("bad"))) }\n}\n</program>\n`;
    expect(codesOf(src, types)).toContain("E-TYPE-004");
  });
  test("an enum-typed state cell", () => {
    const src = `<st>: Inner = Inner.Bad("bad")\n<msg> = ""\n\${\n    type Inner:enum = { Bad(reason: string), Ok2 }\n    function go() { @msg = @st.reason == "bad" ? "a" : "b" }\n}\n<button onclick=go()>\${@msg}</button>\n`;
    expect(codesOf(src)).toContain("E-TYPE-004");
  });
  test("an `<each>` binder over an enum tape, and a tape element", () => {
    const src = `\${\n    type Inner:enum = { Bad(reason: string), Ok2 }\n}\n<xs>: Inner[] = [Inner.Bad("bad")]\n<ul><each in=@xs as x><li>\${x.reason}</li></each></ul>\n<p>\${ @xs[0].reason }</p>\n`;
    const msgs = compileFiles({ "app.scrml": src }).filter((e) => e.code === "E-TYPE-004").map((e) => e.message);
    expect(msgs.some((m) => m.includes("`x.reason`"))).toBe(true);
    expect(msgs.some((m) => m.includes("`@xs[0].reason`"))).toBe(true);
  });
  test("a markup `<match>` arm binder of an enum-typed field", () => {
    const src = `\${\n    type Inner:enum = { Bad(reason: string), Ok2 }\n    type Outer:enum = { Wrapped(inner: Inner), None }\n}\n<w>: Outer = Outer.Wrapped(Inner.Bad("bad"))\n<match for=Outer on=@w>\n  <Wrapped inner><p>\${inner.reason}</p></>\n  <None>n</>\n</match>\n`;
    expect(codesOf(src)).toContain("E-TYPE-004");
  });
  test("NOT refused: the engine-cell transition `@cell.advance(.V)` and the `.V.history` restore target", () => {
    const src = `<program>\ntype Mode:enum = { Nav, Edit }\n<transitions> = 0\nfunction go() { if (@mode == Mode.Nav) { @mode.advance(.Edit) } }\n<engine for=Mode initial=.Nav>\n  <Nav rule=.Edit>\n    <onTransition to=.Edit>\${ @transitions = @transitions + 1 }</onTransition>\n  </>\n  <Edit rule=.Nav />\n</engine>\n<div><button onclick=go()>go</button><span>\${@mode}</span><span>\${@transitions}</span></div>\n</program>`;
    expect(codesOf(src)).toEqual([]);
  });
  test("the diagnostic names the read, the enum and the variant way to the payload", () => {
    const errs = compileFiles({ "app.scrml": lib(`function chk(x: Inner) { return x.reason == "bad" }`, R(`chk(Inner.Bad("bad"))`)) }, "library");
    const m = errs.find((e) => e.code === "E-TYPE-004")?.message ?? "";
    expect(m).toContain("`x.reason`");
    expect(m).toContain("`Inner`");
    expect(m).toContain(".Bad(reason)");
    expect(m).toContain("`.variant`");
  });
});

describe("payload binders have their field's DECLARED type (§18.7)", () => {
  const REFUSED = [
    ["`match` expression arm, positional", `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        const r = match w { .Wrapped(i) :> i.reason == "bad", else :> true }\n        ${R("r")}`],
    ["`match` expression arm, named", `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        const r = match w { .Wrapped(inner: i) :> i.reason == "bad", else :> true }\n        ${R("r")}`],
    ["`match` statement block arm", `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        let o = "LOGGED IN"\n        match w { .Wrapped(i) :> { if (i.reason == "bad") { o = "rejected" } } else :> { } }\n        return o`],
    ["`!{}` arm `.V(i)` (Q4)", `const v = wrap(p) !{ .Wrapped(i) :> i.reason == "bad" ? "rejected" : "LOGGED IN", _ :> "rejected" }\n        return v == true ? "LOGGED IN" : v`],
    ["`!{}` arm `::V(i)`", `const v = wrap(p) !{ ::Wrapped(i) :> i.reason == "bad" ? "rejected" : "LOGGED IN", _ :> "rejected" }\n        return v == true ? "LOGGED IN" : v`],
    ["`!{}` arm `| ::V i`", `const v = wrap(p) !{\n            | ::Wrapped i :> i.reason == "bad" ? "rejected" : "LOGGED IN"\n            | _ :> "rejected"\n        }\n        return v == true ? "LOGGED IN" : v`],
    ["`!{}` block arm `.V(i) :> { … }`", `let o = "LOGGED IN"\n        const v = wrap(p) !{ .Wrapped(i) :> { if (i.reason == "bad") { o = "rejected" } }, _ :> { o = "rejected" } }\n        return v == true ? "LOGGED IN" : o`],
  ];
  for (const [name, body] of REFUSED) {
    test(name, () => { expect(codesOf(lib("", body), {}, "library")).toContain("E-TYPE-004"); });
  }
  test("a struct-typed binder's unknown field is E-TYPE-004 too (the binder is the struct)", () => {
    const src = `\${\n    type Meta:struct = { code: number }\n    type E2:enum = { Has(m: Meta), Not }\n    export function f(x: E2) { return match x { .Has(m) :> m.nope == 1, else :> false } }\n}\n`;
    expect(codesOf(src, {}, "library")).toContain("E-TYPE-004");
  });
});

describe("enum value vs a primitive literal is E-EQ-001 (§45.3)", () => {
  test("a binder holding an enum compared with a string", () => {
    const body = `const w: Outer = Outer.Wrapped(Inner.Bad("bad"))\n        const r = match w { .Wrapped(i) :> i == "bad", else :> true }\n        ${R("r")}`;
    expect(codesOf(lib("", body), {}, "library")).toContain("E-EQ-001");
  });
  test("a typed parameter compared with a number", () => {
    expect(codesOf(lib(`function chk(x: Inner) { return x != 1 }`, R(`chk(Inner.Ok2)`)), {}, "library")).toContain("E-EQ-001");
  });
});

describe("still ALLOWED", () => {
  const OK = [
    ["`.variant` on an enum value", `function chk(x: Inner) { return x.variant == "Bad" }`, R(`chk(Inner.Bad("bad"))`)],
    ["`is` on an enum value", `function chk(x: Inner) { return x is .Bad }`, R(`chk(Inner.Bad("bad"))`)],
    ["`==` between two enum values", `function chk(x: Inner) { return x == Inner.Ok2 }`, R(`chk(Inner.Ok2)`)],
    ["`match` the enum value, read the primitive binder", `function chk(x: Inner) { return match x { .Bad(r) :> r == "bad", else :> false } }`, R(`chk(Inner.Bad("bad"))`)],
    ["a primitive binder of a `!{}` arm, via a nested match", "", `const v = wrap(p) !{ .Wrapped(i) :> (match i { .Bad(r) :> r == "bad", else :> false }) ? "rejected" : "LOGGED IN", _ :> "rejected" }\n        return v == true ? "LOGGED IN" : v`],
    ["`is` on a `!{}` payload binder holding an enum", "", `const v = wrap(p) !{ .Wrapped(i) :> i is .Bad ? "rejected" : "LOGGED IN", _ :> "rejected" }\n        return v == true ? "LOGGED IN" : v`],
    ["a primitive field of a struct holding an enum", `function chk(h: Holder) { return h.n == 1 }`, R(`chk({ st: Inner.Bad("bad"), n: 1 })`)],
    ["the struct's enum field `.variant`", `function chk(h: Holder) { return h.st.variant == "Bad" }`, R(`chk({ st: Inner.Bad("bad"), n: 1 })`)],
    ["a lambda parameter shadowing an enum-typed name", `function chk(x: Inner) { const f = (x) => x.length\n return f("ab") == 2 }`, R(`chk(Inner.Ok2)`)],
    ["a local shadowing an enum-typed parameter", `function chk(x: Inner) { if (true) { const x = { reason: "bad" }\n return x.reason == "bad" } return false }`, R(`chk(Inner.Ok2)`)],
  ];
  for (const [name, more, body] of OK) {
    test(name, () => { expect(codesOf(lib(more, body), {}, "library")).toEqual([]); });
  }
  test("the SPEC §18.6.1 idiom: a whole error held in a state through a constructor", () => {
    const src = `\${\n    type SaveError:enum = { Conflict(id: string), Offline }\n    type DraftState:enum = { Idle, Saving, Failed(error: SaveError) }\n    function saveDraft()! -> SaveError { fail .Offline }\n    function save() { saveDraft() !{ _ err :> { @state = .Failed(err) } } }\n}\n<state>: DraftState = .Idle\n<button onclick=save()>s</button>\n`;
    expect(codesOf(src)).toEqual([]);
  });
});

describe("F4 — a `!{}` in an event handler in a `<match>` nested in a `<match>` arm (no false refusal)", () => {
  const PAGE = (arm) => `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    type Ph:enum = { A, B(n: number) }
    function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
<msg> = "init"
<ph>: Ph = .A
<match for=Ph on=@ph>
  <A><match for=Ph on=@ph>
  <A><button id="b" onclick=\${ @msg = wrap("x") !{ ${arm} } }>b</button></>
  <B n>b</>
</match></>
  <B n>b</>
</match>
<p id="out">\${@msg}</p>
`;
  test("OK: `_ e :> e is .Denied ? …` compiles", () => {
    expect(codesOf(PAGE(`_ e :> e is .Denied ? "rejected" : "LOGGED IN"`))).toEqual([]);
  });
  test("OK: a binder-less `_ :> \"rejected\"` compiles", () => {
    expect(codesOf(PAGE(`_ :> "rejected"`))).toEqual([]);
  });
  test("BAD: `_ e :> e.reason …` is still refused (E-TYPE-004)", () => {
    const codes = codesOf(PAGE(`_ e :> e.reason == "bad" ? "rejected" : "LOGGED IN"`));
    expect(codes).toContain("E-TYPE-004");
    expect(codes).not.toContain("E-TYPE-031");
  });
});

// S470 fix round 1 (adversarial review of 7453d57ff) — the enum fact read from the TYPE, not the form.
describe("fix round 1 — enum facts from the type (aliases, returns, imports, flows)", () => {
  const DA = `type I2 = Inner
    type SA:struct = { i: I2 }
    function u1(p) {
        if (p != "secret") return Inner::Bad("bad")
        return Inner.Ok2
    }
    function u2(p) {
        if (p != "secret") return Inner::Bad("bad")
        return .Ok2
    }
    function u3(p) {
        const r = Inner::Bad("bad")
        return p != "secret" ? r : Inner.Ok2
    }
    function ra(p) -> I2 { return Inner::Bad("bad") }`;
  const REFUSED = [
    ["B-ALIAS parameter", `function g(y: I2) { return y.reason }\n        ${R(`g(Inner::Bad("bad")) == "bad"`)}`],
    ["B-ALIAS local", `const x: I2 = Inner::Bad("bad")\n        ${R(`x.reason == "bad"`)}`],
    ["B-ALIAS tape", `const xs: I2[] = [Inner::Bad("bad")]\n        ${R(`xs[0].reason == "bad"`)}`],
    ["B-ALIAS return", R(`ra(p).reason == "bad"`)],
    ["B-ALIAS struct field", `const s: SA = { i: Inner::Bad("bad") }\n        ${R(`s.i.reason == "bad"`)}`],
    ["B-UNITRET E.Unit", R(`u1(p).reason == "bad"`)],
    ["B-UNITRET .Unit", R(`u2(p).reason == "bad"`)],
    ["B-UNITRET local + ternary", R(`u3(p).reason == "bad"`)],
    ["ternary of constructors", `const x = p != "" ? Inner::Bad("bad") : Inner.Ok2\n        ${R(`x.reason == "bad"`)}`],
    ["|| of constructors", `const x = Inner::Bad("bad") || Inner.Ok2\n        ${R(`x.reason == "bad"`)}`],
    ["lin", `lin x = Inner::Bad("bad")\n        ${R(`x.reason == "bad"`)}`],
    ["typed tape destructured", `const xs: Inner[] = [Inner::Bad("bad")]\n        const [x] = xs\n        ${R(`x.reason == "bad"`)}`],
    ["typed tape .find", `const xs: Inner[] = [Inner::Bad("bad")]\n        ${R(`xs.find((v) => true).reason == "bad"`)}`],
    ["typed tape .at", `const xs: Inner[] = [Inner::Bad("bad")]\n        ${R(`xs.at(0).reason == "bad"`)}`],
    ["typed tape callback parameter", `const xs: Inner[] = [Inner::Bad("bad")]\n        ${R(`xs.map((v) => v.reason)[0] == "bad"`)}`],
    ["value match of typed values", `const a: Inner = Inner::Bad("bad")\n        const x = match a { .Bad(r) :> a, else :> a }\n        ${R(`x.reason == "bad"`)}`],
    ["closure result", `const f = () => Inner::Bad("bad")\n        ${R(`f().reason == "bad"`)}`],
    [".V.history read outside the restore form", R(`Inner.Ok2.history == "bad"`)],
  ];
  for (const [name, body] of REFUSED) {
    test(name, () => { expect(codesOf(lib(DA, body), {}, "library")).toContain("E-TYPE-004"); });
  }
  test("B-IMPORTFN: an imported fn declared -> Inner, a constructor-returning fn, a const ctor, an alias", () => {
    const h = "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export const badC = Inner::Bad(\"bad\")\n    export function mkI(p) { return Inner::Bad(\"bad\") }\n    export function mkT(p) -> Inner { return Inner::Bad(\"bad\") }\n    export type I3 = Inner\n}\n";
    for (const body of [`mkT("x").reason == "bad"`, `mkI("x").reason == "bad"`, `badC.reason == "bad"`]) {
      const src = `import { Inner, badC, mkI, mkT, I3 } from "./h.scrml"\n<msg> = ""\n\${\n    function go() { @msg = ${body} ? "a" : "b" }\n}\n<button onclick=go()>\${@msg}</button>\n`;
      expect(codesOf(src, { "h.scrml": h })).toContain("E-TYPE-004");
    }
    const src = `import { Inner, I3 } from "./h.scrml"\n<msg> = ""\n\${\n    function go() { const x: I3 = Inner::Bad("bad")\n @msg = x.reason }\n}\n<button onclick=go()>\${@msg}</button>\n`;
    expect(codesOf(src, { "h.scrml": h })).toContain("E-TYPE-004");
  });
  test("X-ADV: `.advance` on a NON-engine cell is a payload read", () => {
    const src = `<ac>: Ad = Ad::Bad("bad")\n<msg> = ""\n\${\n    type Ad:enum = { Bad(advance: string), Ok2 }\n    function go() { @msg = @ac.advance == "bad" ? "a" : "b" }\n}\n<button onclick=go()>\${@msg}</button>\n`;
    expect(codesOf(src)).toContain("E-TYPE-004");
  });
  test("still ALLOWED: the restore form `@cell = .V.history` / `.advance(.V.history)` on an engine cell", () => {
    const src = `<program>\ntype Ph:enum = { A, B }\nfunction f() { @ph = .B.history }\nfunction g() { @ph.advance(.B.history) }\n<engine for=Ph initial=.A>\n  <A rule=.B><button onclick=f()>x</button><button onclick=g()>y</button></>\n  <B rule=.A>b</>\n</engine>\n</program>`;
    expect(codesOf(src).filter((c) => c === "E-TYPE-004")).toEqual([]);
  });
});

// S470 fix round 2 (adversarial review of baef28219).
describe("fix round 2 — imported alias chains, E | not returns, recursive returns", () => {
  const DN = `function m1(p) {
        if (p != "secret") return Inner::Bad("bad")
        return not
    }
    function m3(p, n) {
        if (p != "secret") return Inner::Bad("bad")
        if (n > 0) return m3(p, n - 1)
        return Inner::Ok2
    }
    function m7(p) {
        if (p != "secret") return Inner::Bad("bad")
        return
    }
    function m8(p) {
        const r = m1(p)
        return r
    }
    function m9(p) { return p != "secret" ? Inner::Bad("bad") : not }
    function h0(p) { return p > 0 ? Inner.Ok2 : h1(p - 1) }
    function h1(p) { return p > 1 ? Inner.Ok2 : h2(p - 1) }
    function h2(p) { return p > 2 ? Inner::Bad("bad") : h0(p - 1) }`;
  const REFUSED = [
    ["U-NOT: a constructor or `not`", R(`m1(p).reason == "bad"`)],
    ["U-NOT: a bare `return`", R(`m7(p).reason == "bad"`)],
    ["U-NOT: passed through a local", R(`m8(p).reason == "bad"`)],
    ["U-NOT: a ternary with `not`", R(`m9(p).reason == "bad"`)],
    ["U-NOT: an optional read", R(`m1(p)?.reason == "bad"`)],
    ["U-REC: a recursive return", R(`m3(p, 2).reason == "bad"`)],
    ["U-REC: a cycle of functions", R(`h0(3).reason == "bad"`)],
  ];
  for (const [name, body] of REFUSED) {
    test(name, () => { expect(codesOf(lib(DN, body), {}, "library")).toContain("E-TYPE-004"); });
  }
  test("ALLOWED: an E | not result tested with `is` / read as `.variant` with `?.`", () => {
    expect(codesOf(lib(DN, R(`m1(p) is not || m1(p)?.variant == "Bad"`)), {}, "library")).toEqual([]);
  });
  test("ALLOWED: a recursive function of numbers", () => {
    expect(codesOf(lib(`function fib(n) { if (n < 2) return n\n return fib(n - 1) + fib(n - 2) }`, R(`fib(10).toFixed(0) == "55"`)), {}, "library")).toEqual([]);
  });
  test("K-ALIAS2: an imported alias of an imported alias (local, tape, local alias of it)", () => {
    const h = "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export type I2 = Inner\n}\n";
    const h2 = "import { I2 } from \"./h.scrml\"\n${\n    export type I3 = I2\n    export type I3L = I2[]\n}\n";
    for (const body of [`const x: I3 = Inner::Bad("bad")\n @msg = x.reason`, `const xs: I3L = [Inner::Bad("bad")]\n @msg = xs[0].reason`, `const x: L4 = Inner::Bad("bad")\n @msg = x.reason`]) {
      const src = `import { Inner } from "./h.scrml"\nimport { I3, I3L } from "./h2.scrml"\n<msg> = ""\n\${\n    type L4 = I3\n    function go() { ${body} }\n}\n<button onclick=go()>\${@msg}</button>\n`;
      expect(codesOf(src, { "h.scrml": h, "h2.scrml": h2 })).toContain("E-TYPE-004");
    }
  });
});

// S470 fix round 3 (adversarial review of 73d4e2e2d).
describe("fix round 3 — cycles in any order, imported struct fields, re-exports, the chain limit", () => {
  // PENDING-POISON: the verdict on a cycle of functions must not depend on which member is declared,
  // inferred or called first.
  const F = {
    fa: `function fa(p) {\n        if (p != "secret") return Inner::Bad("bad")\n        return ga(p)\n    }`,
    ga: `function ga(p) { return fa("x") }`,
    fc: `function fc(p) { return gc(p) }`,
    gc: `function gc(p) { return hc(p) }`,
    hc: `function hc(p) {\n        if (p != "secret") return Inner::Bad("bad")\n        return fc("x")\n    }`,
  };
  const perms = (xs) => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
  for (const order of perms(["fa", "ga"])) {
    for (const calls of perms(["fa", "ga"])) {
      test(`2-cycle: declared ${order.join(",")}, called ${calls.join(",")} → E-TYPE-004 for each read`, () => {
        const body = calls.map((c, i) => `const x${i} = ${c}(p)\n        const r${i} = x${i}.reason`).join("\n        ") + `\n        return "x"`;
        const errs = compileFiles({ "app.scrml": lib(order.map((o) => F[o]).join("\n    "), body) }, "library").filter((e) => e.code === "E-TYPE-004");
        for (let i = 0; i < calls.length; i++) expect(errs.some((e) => e.message.includes(`\`x${i}.reason\``))).toBe(true);
      });
    }
  }
  for (const order of perms(["fc", "gc", "hc"])) {
    test(`3-cycle: declared ${order.join(",")}, each member called → E-TYPE-004 for each read`, () => {
      const body = ["gc", "hc", "fc"].map((c, i) => `const x${i} = ${c}(p)\n        const r${i} = x${i}.reason`).join("\n        ") + `\n        return "x"`;
      const errs = compileFiles({ "app.scrml": lib(order.map((o) => F[o]).join("\n    "), body) }, "library").filter((e) => e.code === "E-TYPE-004");
      for (let i = 0; i < 3; i++) expect(errs.some((e) => e.message.includes(`\`x${i}.reason\``))).toBe(true);
    });
  }
  const H0 = "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export type I0 = Inner\n}\n";
  const PAGE = (imports, decls, fn) => `${imports}\n<msg> = ""\n\${\n    ${decls}\n    ${fn}\n}\n<button onclick=go()>\${@msg}</button>\n`;
  test("IMP-STRUCT: a struct field of an imported enum, alias and alias of an alias", () => {
    const m = "import { I0 } from \"./h0.scrml\"\n${\n    export type K = I0\n}\n";
    for (const [imp, ft] of [[`import { Inner } from "./h0.scrml"`, "Inner"], [`import { I0, Inner } from "./h0.scrml"`, "I0"], [`import { K } from "./m.scrml"\nimport { Inner } from "./h0.scrml"`, "K"]]) {
      const src = PAGE(imp, `type SS:struct = { k: ${ft} }`, `function go() { const s: SS = { k: Inner::Bad("bad") }\n @msg = s.k.reason }`);
      expect(codesOf(src, { "h0.scrml": H0, "m.scrml": m })).toContain("E-TYPE-004");
    }
  });
  test("EXPORT-STAR / named re-export: an alias of a name re-exported through `export *` or `export { X } from`", () => {
    for (const s of ["${\n    export * from \"./h0.scrml\"\n}\n", "${\n    export { I0 } from \"./h0.scrml\"\n}\n"]) {
      const m = "import { I0 } from \"./s.scrml\"\n${\n    export type K = I0\n}\n";
      const src = PAGE(`import { K } from "./m.scrml"\nimport { Inner } from "./h0.scrml"`, "", `function go() { const x: K = Inner::Bad("bad")\n @msg = x.reason }`);
      expect(codesOf(src, { "h0.scrml": H0, "m.scrml": m, "s.scrml": s })).toContain("E-TYPE-004");
    }
  });
  const chain = (n) => {
    const files = { "h0.scrml": "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export type C0 = Inner\n}\n" };
    for (let k = 1; k <= n; k++) files[`h${k}.scrml`] = `import { C${k - 1} } from "./h${k - 1}.scrml"\n\${\n    export type C${k} = C${k - 1}\n}\n`;
    return files;
  };
  test("DEPTH: a chain of 40 imported aliases is followed (E-TYPE-004)", () => {
    const src = PAGE(`import { C40 } from "./h40.scrml"\nimport { Inner } from "./h0.scrml"`, "", `function go() { const x: C40 = Inner::Bad("bad")\n @msg = x.reason }`);
    expect(codesOf(src, chain(40))).toContain("E-TYPE-004");
  });
  test("DEPTH: past the bound (80 files) the read is REFUSED, fail closed (E-TYPE-031), with the limit named", () => {
    const src = PAGE(`import { C80 } from "./h80.scrml"\nimport { Inner } from "./h0.scrml"`, "", `function go() { const x: C80 = Inner::Bad("bad")\n @msg = x.reason }`);
    const errs = compileFiles({ "app.scrml": src, ...chain(80) });
    const e = errs.find((x) => x.code === "E-TYPE-031");
    expect(e).toBeDefined();
    expect(e.message).toContain("stops reading after");
    expect(e.message).toContain("impl#1 limitation");
  });
  test("ALLOWED: `.variant` off a struct field of an imported enum", () => {
    const src = PAGE(`import { Inner } from "./h0.scrml"`, `type SS:struct = { k: Inner }`, `function go() { const s: SS = { k: Inner::Bad("bad") }\n @msg = s.k.variant }`);
    expect(codesOf(src, { "h0.scrml": H0 })).toEqual([]);
  });
});

// S470 fix round 4 (adversarial review of 3620e8670).
describe("fix round 4 — strongly connected groups solved once, dependency inference, deep expressions, star precedence", () => {
  // SCC-EXP: a group of n mutually calling functions (each calls the next twice and the first) is
  // inferred in O(n) bodies — the visit plus a fixpoint pass or two — never exponentially.
  const scc = (n) => {
    const fns = [];
    for (let i = 1; i <= n; i++) {
      const nx = i === n ? 1 : i + 1;
      fns.push(`function f${i}(p) {\n        if (p == "a${i}") return Inner::Bad("bad")\n        if (p == "b${i}") return f${nx}(p)\n        if (p == "c${i}") return f${nx}(p + "x")\n        return f1(p + "y")\n    }`);
    }
    return fns.join("\n    ");
  };
  test("SCC perf guard: a 24-function group is inferred in at most 4 bodies per function, and refused", () => {
    const errs = compileFiles({ "app.scrml": lib(scc(24), `const x = f12(p)\n        return x.reason`) }, "library");
    expect(errs.map((e) => e.code)).toContain("E-TYPE-004");
    expect(enumReadInferenceCount()).toBeLessThanOrEqual(4 * 24);
  });
  test("SCC perf guard: the bound grows linearly (40 functions)", () => {
    compileFiles({ "app.scrml": lib(scc(40), `const x = f7(p)\n        return x.reason`) }, "library");
    expect(enumReadInferenceCount()).toBeLessThanOrEqual(4 * 40);
  });
  const H = "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    function helper(p) {\n        if (p != \"secret\") return Inner::Bad(\"bad\")\n        return Inner::Ok2\n    }\n    export function viaHelper(p) { return helper(p) }\n    export function mutA(p) {\n        if (p != \"secret\") return Inner::Bad(\"bad\")\n        return mutB(p)\n    }\n    export function mutB(p) { return mutA(\"x\") }\n}\n";
  const H2 = "import { cross2 } from \"./h3.scrml\"\nimport { Inner } from \"./h.scrml\"\n${\n    export function cross1(p) {\n        if (p != \"secret\") return Inner::Bad(\"bad\")\n        return cross2(p)\n    }\n}\n";
  const H3 = "import { cross1 } from \"./h2.scrml\"\n${\n    export function cross2(p) { return cross1(\"x\") }\n}\n";
  for (const [name, call, imp] of [
    ["I1 an imported fn through the dependency's local helper", "viaHelper", `import { Inner, viaHelper } from "./h.scrml"`],
    ["I2 imported mutual recursion, call A", "mutA", `import { Inner, mutA } from "./h.scrml"`],
    ["I3 imported mutual recursion, call B", "mutB", `import { Inner, mutB } from "./h.scrml"`],
  ]) {
    test(name, () => {
      const src = `${imp}\n<msg> = ""\n\${\n    function go() { const x = ${call}("y")\n @msg = x.reason }\n}\n<button onclick=go()>\${@msg}</button>\n`;
      expect(codesOf(src, { "h.scrml": H })).toContain("E-TYPE-004");
    });
  }
  test("I-cross: mutual recursion ACROSS two dependency files", () => {
    const src = `import { cross1 } from "./h2.scrml"\nimport { Inner } from "./h.scrml"\n<msg> = ""\n\${\n    function go() { const x = cross1("y")\n @msg = x.reason }\n}\n<button onclick=go()>\${@msg}</button>\n`;
    expect(codesOf(src, { "h.scrml": H, "h2.scrml": H2, "h3.scrml": H3 })).toContain("E-TYPE-004");
  });
  const nest = (k) => { let s = `Inner::Bad("bad")`; for (let i = 0; i < k; i++) s = `(p != "q${i}" ? ${s} : Inner::Ok2)`; return s; };
  test("DEEP-EXPR: a 40-deep ternary and a 40-long || chain are read (E-TYPE-004)", () => {
    expect(codesOf(lib("", `const x = ${nest(40)}\n        return x.reason`), {}, "library")).toContain("E-TYPE-004");
    const ors = Array.from({ length: 40 }, () => `Inner::Bad("bad")`).join(" || ");
    expect(codesOf(lib("", `const x = ${ors}\n        return x.reason`), {}, "library")).toContain("E-TYPE-004");
  });
  test("DEEP-EXPR: past the bound (a 300-deep ternary) the read is REFUSED, fail closed (E-TYPE-031)", () => {
    const errs = compileFiles({ "app.scrml": lib("", `const x = ${nest(300)}\n        return x.reason`) }, "library");
    const e = errs.find((x) => x.code === "E-TYPE-031");
    expect(e).toBeDefined();
    expect(e.message).toContain("stops reading after");
  });
  const EN = (nm) => `\${\n    export type ${nm}:enum = { Bad(reason: string), Ok2 }\n}\n`;
  const ST = (nm) => `\${\n    export type ${nm}:struct = { reason: string }\n}\n`;
  const APP = `import { K } from "./m.scrml"\n\${\n    export function f(x: K) { return x.reason }\n}\n`;
  const M = "import { I0 } from \"./s.scrml\"\n${\n    export type K = I0\n}\n";
  test("STAR-PREC: a named re-export of an ENUM wins over an earlier `export *` of a struct (refused)", () => {
    const files = { "m.scrml": M, "s.scrml": "${\n    export * from \"./a.scrml\"\n    export { I0 } from \"./b.scrml\"\n}\n", "a.scrml": ST("I0"), "b.scrml": EN("I0") };
    expect(codesOf(APP, files, "library")).toContain("E-TYPE-004");
  });
  test("STAR-PREC: a named re-export of a STRUCT wins over an earlier `export *` of an enum (allowed)", () => {
    const files = { "m.scrml": M, "s.scrml": "${\n    export * from \"./b.scrml\"\n    export { I0 } from \"./a.scrml\"\n}\n", "a.scrml": ST("I0"), "b.scrml": EN("I0") };
    expect(codesOf(APP, files, "library")).not.toContain("E-TYPE-004");
  });
});
