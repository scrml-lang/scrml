// handled-landing-check-s475.test.js — s475-boot-handled-landing-check
// (g-boot-handled-call-result-landing-unchecked-s473).
//
// §66.1 rule 5: every cell and field write is type-checked against the target's declared
// type. §19.4.3 (value position): every arm SHALL "Yield a value of the call's success
// type … The `match` form's `.Ok(v)` arm is an arm like any other". §19.4.1: a failable
// function has no success-type slot — its success type is inferred from its returns.
//
// Before: the typer gave a `!{}` and a failable `match` NO type (Unknown — nothing checks an
// Unknown), and never inferred a `!` function's success type, so a `string` success value
// reached an `int` cell over the wire, a `check()! E` returning `true` was stored in a
// `string` cell, and `const r: int = match get(1) { .Ok(x) :> "s", … }` compiled.
// Now (analyze.scrml typeHandled / inferReturn / failableSuccs):
//   `?`     — the success type;
//   `!{}`   — the join of the success type and each value arm's value;
//   `match` — the join of its value arms' values; `.Ok(v)` binds the success value;
// checked at every landing site (cell write, field write, annotated const / let, `return`,
// argument) with the code a plain mismatched write already draws, E-TYPE-031.
// The #1767 r1 INTERIM is lifted (armWant): a `!{}` arm takes its position's type even
// where it differs from the callee's success type; with no position type, a `!` callee's
// proven success type gives the arm its struct (it gave none before).
// Every "red on base" test failed on origin/main ed2be0967.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const WDSM = "W-DEPRECATED-SERVER-MODIFIER";
const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).filter((c) => c !== WDSM);
const compiles = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`).filter((c) => !c.startsWith(WDSM))).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
};

const DECLS = [
  "    let <n:int=0/>",
  "    let <ok:bool=true/>",
  "    let <msg:string=\"\"/>",
  "    let <m:string | not=not/>",
  "    let <mi:int | not=not/>",
  "    let <x:number=0/>",
  "    type K:enum = { A, B, C }",
  "    let <k:K=.A/>",
  "    type S:struct = { a: int, b: int }",
  "    type R:struct = { a: int, c: int }",
  "    let <pt:S=({ a: 0, b: 0 })/>",
  "    type L:enum = { NotFound(id: string), Timeout }",
].join("\n");
const P = (d) => `<program>\n${DECLS}\n${d}\n    <main>\n        <p>x</p>\n    </main>\n</program>\n`;

const SRV = `    server function srv() -> S { const s: S = { a: 1, b: 2 }; return s; }\n`;
const FS = `    server function fs() -> string { return "a"; }\n`;
const FI = `    server function fi() -> int { return 1; }\n`;
const FK = `    server function fk() -> K { return .A; }\n`;
const CHK = `    type AuthErr:enum = { Denied, Locked }\n    function check(p: string)! AuthErr {\n        if (p == "locked") fail AuthErr.Locked;\n        if (p != "secret") fail AuthErr.Denied;\n        return true;\n    }\n`;
const GET = `    function get(i: int)! L {\n        if (i < 0) fail L.Timeout;\n        return "v";\n    }\n`;
const GETI = `    function geti(i: int)! L {\n        if (i < 0) fail L.Timeout;\n        return 1;\n    }\n`;
const GETS = `    function gets(i: int)! L {\n        if (i < 0) fail L.Timeout;\n        const s: S = { a: 1, b: 2 };\n        return s;\n    }\n`;

describe("a handled call's value is checked where it lands (red on base)", () => {
  const refused = {
    "#1676 F3: a server `-> string` into an `int` cell, `!{}` arm 0": FS + `    function h() { @n = fs() !{ .Transport(t) :> 0 }; }`,
    "c8 srvGuardInt0: `const r: int` from an `-> S` call": SRV + `    function h() -> int { const r: int = srv() !{ .Transport(t) :> 0 }; return r; }`,
    "c8 srvGuardStr: `const r: string` from an `-> S` call": SRV + `    function h() -> int { const r: string = srv() !{ .Transport(t) :> "x" }; return 0; }`,
    "#1729 b01: a `!` function returning `true` into a `string` cell": CHK + `    function login() { @msg = check("secret") !{ .Locked :> "locked", else :> "denied" }; }`,
    "a failable `match` whose arms are strings, into `const r: int`": GET + `    function h() -> int { const r: int = match get(1) { .Ok(x) :> "s", .NotFound(id) :> "n", .Timeout :> "t" }; return r; }`,
    "a failable `match` yielding the `.Ok` binder (a string) into `int`": GET + `    function h() -> int { const r: int = match get(1) { .Ok(x) :> x, .NotFound(id) :> id, .Timeout :> "t" }; return r; }`,
    "`return` against `-> int`": FS + `    function h() -> int { return fs() !{ .Transport(t) :> 0 }; }`,
    "an argument against an `int` parameter": FS + `    function g(v: int) -> int { return v; }\n    function h() -> int { return g(fs() !{ .Transport(t) :> 0 }); }`,
    "a field write `@pt.a`": FS + `    function h() { @pt.a = fs() !{ .Transport(t) :> 0 }; }`,
    "an annotated `let`": GET + `    function h() -> int { let r: int = get(1) !{ .NotFound(id) :> 0, .Timeout :> 0 }; return r; }`,
    "an arm of the wrong type (success matches)": FI + `    function h() -> int { const r: int = fi() !{ .Transport(t) :> "x" }; return r; }`,
    "`?` of a `!` function returning `bool`, into `string`": CHK + `    function h()! AuthErr { const s: string = check("a")?; return s; }`,
    "a `not` arm into a non-optional cell": FS + `    function h() { @msg = fs() !{ .Transport(t) :> not }; }`,
  };
  for (const [name, d] of Object.entries(refused)) {
    test(name, () => { expect(codes(P(d))).toEqual(["E-TYPE-031"]); });
  }

  test("the message names the target type and the value's", () => {
    const ds = run(P(CHK + `    function login() { @msg = check("secret") !{ .Locked :> "locked", else :> "denied" }; }`)).diags;
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("`@msg` expects `string`");
    expect(ds[0].message).toContain("`bool`");
  });

  test("the #1729 b01 probe program, verbatim", () => {
    const src = `<program>
    let <msg:string=""/>
    type AuthErr:enum = { Denied, Locked }
    function check(p: string)! AuthErr {
        if (p == "locked") fail AuthErr.Locked;
        if (p != "secret") fail AuthErr.Denied;
        return true;
    }

    function login() {
        @msg = check("secret") !{ .Locked :> "locked", else :> "denied" };
    }
    <main>
        <button onclick=login()>go</button>
        <p id="msg">\${@msg}</p>
    </main>
</program>
`;
    expect(codes(src)).toEqual(["E-TYPE-031"]);
  });
});

describe("controls — a handled value that fits its landing compiles (green on both)", () => {
  const clean = {
    "matching types (`int` into `int`)": FI + `    function h() { @n = fi() !{ .Transport(t) :> 0 }; }`,
    "matching types (`string` into `string`)": FS + `    function h() { @msg = fs() !{ .Transport(t) :> "x" }; }`,
    "a `not` arm into a `T | not` cell": FS + `    function h() { @m = fs() !{ .Transport(t) :> not }; }`,
    "`int` into an `int | not` cell (optional widening)": FI + `    function h() { @mi = fi() !{ .Transport(t) :> 0 }; }`,
    "an enum success with a bare-variant arm": FK + `    function h() { @k = fk() !{ .Transport(t) :> .B }; }`,
    "`int` into a `number` cell": FI + `    function h() { @x = fi() !{ .Transport(t) :> 1 }; }`,
    "a local `!` function returning `bool` into a `bool` cell": CHK + `    function login() { @ok = check("secret") !{ .Locked :> false, else :> false }; }`,
    "a failable `match` of ints into `int`": GET + `    function h() -> int { const r: int = match get(1) { .Ok(x) :> 1, .NotFound(id) :> 2, .Timeout :> 3 }; return r; }`,
    "a failable `match` yielding its string binders into `string`": GET + `    function h() -> string { const r: string = match get(1) { .Ok(x) :> x, .NotFound(id) :> id, .Timeout :> "t" }; return r; }`,
    "an annotated `let` from a `!` function returning `int`": GETI + `    function h() -> int { let r: int = geti(1) !{ .NotFound(id) :> 0, .Timeout :> 0 }; return r; }`,
    "`return` and argument of matching type": FI + `    function g(v: int) -> int { return v; }\n    function h() -> int { return g(fi() !{ .Transport(t) :> 0 }) + fi() !{ .Transport(t) :> 0 }; }`,
    "an object arm of the callee's struct into its type": SRV + `    function h() -> int { const r: S = srv() !{ .Transport(t) :> { a: 0, b: 0 } }; return r.a; }`,
    "an arm that leaves (`return`) yields nothing to join": FI + `    function h() -> int { const r: int = fi() !{ .Transport(t) :> { return 0; } }; return r; }`,
    "a statement-position `!{}` (its value is not read)": FS + `    function h() { fs() !{ .Transport(t) :> { @n = 1; } }; }`,
    "`?` of a `!` function returning `bool`, into `bool`": CHK + `    function h()! AuthErr { const s: bool = check("a")?; return s; }`,
    "a `!` function that returns no value, handled as a statement": `    function v(i: int)! L { if (i < 0) fail L.Timeout; }\n    function h() { v(1) !{ .NotFound(id) :> { }, .Timeout :> { } }; }`,
  };
  for (const [name, d] of Object.entries(clean)) {
    test(name, () => compiles(P(d)));
  }
});

describe("the #1767 r1 INTERIM is lifted — a `!{}` arm takes its position's type", () => {
  test("an `S | not` position, an `-> S` call, an object arm: compiles (red on base: E-TYPE-STRUCT-CONTEXT)", () => {
    compiles(P(SRV + `    function h() -> int { const r: S | not = srv() !{ .Transport(t) :> { a: 0, b: 0 } }; return 0; }`));
    compiles(P(SRV + `    function h() -> S | not { return srv() !{ .Transport(t) :> { a: 0, b: 0 } }; }`));
  });
  test("an `R` position, an `-> S` call: the SUCCESS value is refused (E-TYPE-031), the arm is built as R", () => {
    expect(codes(P(SRV + `    function h() -> R { return srv() !{ .Transport(t) :> { a: 0, c: 0 } }; }`))).toEqual(["E-TYPE-031"]);
  });
});

describe("a `!` function's success type is inferred from its returns (§19.4.1)", () => {
  test("no position type: an object arm on a `!` callee takes its proven struct (red on base: E-TYPE-STRUCT-CONTEXT)", () => {
    compiles(P(GETS + `    function h() -> int { const r = gets(1) !{ .NotFound(id) :> { a: 0, b: 0 }, .Timeout :> { a: 0, b: 0 } }; return r.a; }`));
  });
  test("`.Ok(s)` binds the success value: `s.a` resolves (red on base: E-BOOTSTRAP-UNSUPPORTED)", () => {
    compiles(P(GETS + `    function h() -> int { return match gets(1) { .Ok(s) :> s.a, .NotFound(id) :> 0, .Timeout :> 0 }; }`));
  });
  test("… and is checked: an `int` field among string arms into `-> string` is E-TYPE-031", () => {
    expect(codes(P(GETS + `    function h() -> string { return match gets(1) { .Ok(s) :> s.a, .NotFound(id) :> "0", .Timeout :> "0" }; }`))).toEqual(["E-TYPE-031"]);
  });
  test("`?` yields the proven struct: a member of it resolves", () => {
    compiles(P(GETS + `    function h()! L { const s = gets(1)?; return s.a; }`));
  });
});
