/**
 * enum-value-member-read-s470.test.js — S470 lane B (s470-typed-payload-binders):
 * g-impl1-enum-value-member-read-unchecked-s470 + escape 3 of
 * g-impl1-whole-error-binder-allowlist-escapes-s469. Executed floor: security-failable-pack
 * r9-shapes.js (families s12 / f10 / l7 / t7).
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
