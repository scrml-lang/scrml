// optional-chain-s478.test.js — s478-boot-optional-chain: `?.` optional chaining (SPEC §42.3.6).
//
// §42.3.6: "When the receiver `expr` is `not`, the access short-circuits: the whole optional-chain
// expression evaluates to `not`, and the remainder of the chain is NOT evaluated" · "Short-circuit
// is chain-wide from the `?.` point, but each hop is guarded only against its own receiver" ·
// "`recv?.field` has type `F | not` where `F` is the declared type of `field` … a further BARE
// dereference on it fires E-TYPE-046 (§42.3.5)".
//
// Before (red on base): every `?.` was refused by name — "`?. optional chaining` (§42.3.6) is not
// in the bootstrap yet" (refusals.scrml). Now the parser reads a chain holding `?.` hops as the
// presence tests of their receivers around the chain read plainly (parse.scrml optHop /
// closeOpt): `a?.b.c` is `a is given ? a.b.c : not`. Every read in the chain is a PLAIN member
// read, typed by typeMember — so it goes through memberRecvMismatch (#1917 H1) and E-TYPE-046 like
// any other; nothing bypasses the receiver-type check. Receivers the bootstrap cannot test twice
// (a call, a parenthesized expression) and the optional CALL `f?.(…)` stay refused by name.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const msgs = (src) => errs(fe(src)).map((d) => `${d.code}: ${d.message}`);
const $ = (sel) => document.querySelector(sel);
let k = 0;

const HEAD = `type Addr:struct = { city: string }
type User:struct = { name: string, addr: Addr | not }
type Car:struct = { wheels: int }
let <user:User | not=({ name: "ann", addr: { city: "oslo" } })/>
let <bare:User | not=({ name: "bo", addr: not })/>
let <car:Car | not=({ wheels: 4 })/>
let <s:string | not="héllo"/>
let <out=""/>
let <n:int | not=(not)/>`;

const prog = (fns, markup = "") => `<program>
${HEAD}
${fns}
<button id="b" onclick=go()>go</button>
<p id="o">\${@out}</p>
<p id="n">\${@n}</p>
${markup}
</program>
`;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s478-optchain-" + k++);
  return r;
}

describe("§42.3.6 — `?.` reads through a present receiver and short-circuits on `not` (run)", () => {
  test("markup `${@user?.name}`: the field while present, nothing once the cell is `not`", async () => {
    await run(prog(`function go() { @user = not; }`, `<p id="m">\${@user?.name}</p>`));
    expect($("#m").textContent).toBe("ann");
    click($("#b"));
    expect($("#m").textContent).toBe("");
  });

  test("logic: the result is `F | not` — narrowed to read it, `not` when the receiver is", async () => {
    await run(prog(`function go() {
    const a: string | not = @user?.name;
    if (a is given) { @out = a; }
    @user = not;
    const b: string | not = @user?.name;
    if (b is not) { @out = @out + "|none"; }
}`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann|none");
  });

  test("chained `a?.b?.c`: each optional hop guarded on its own receiver", async () => {
    await run(prog(`function go() {
    const c1: string | not = @user?.addr?.city;
    const c2: string | not = @bare?.addr?.city;
    if (c1 is given) { @out = c1; }
    if (c2 is not) { @out = @out + "|no-addr"; }
}`));
    click($("#b"));
    expect($("#o").textContent).toBe("oslo|no-addr");
  });

  test("`?.` then a bare hop on a non-optional field (`@s?.length`, `@user?.name.length`): `int | not`", async () => {
    await run(prog(`function go() {
    const a: int | not = @s?.length;
    const b: int | not = @user?.name.length;
    if (a is given) { if (b is given) { @n = a * 10 + b; } }
}`));
    click($("#b"));
    expect($("#n").textContent).toBe("53");
  });

  test("the remainder of the chain is not evaluated when the receiver is `not`", async () => {
    await run(prog(`function go() { @user = not; @n = @user?.name.length; if (@n is not) { @out = "short"; } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("short");
    expect($("#n").textContent).toBe("");
  });

  test("a `T | not` parameter, and a presence test of the chain as a whole", async () => {
    await run(prog(`function nm(u: User | not) -> string | not { return u?.name; }
function go() { const x: string | not = nm(@bare); if (x is given) { @out = x; } @user = not; if (nm(@user) is not) { @out = @out + "|gone"; } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("bo|gone");
  });
});

describe("§42.3.6 typing — the `F | not` result and the per-hop rule (red on base: refused by name)", () => {
  test("a `?.` result into a non-optional slot without narrowing is E-TYPE-031", () => {
    const m = msgs(prog(`function go() { const x: string = @user?.name; @out = x; }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-TYPE-031");
    expect(m[0]).toContain("string | not");
  });

  test("into a non-optional cell, too", () => {
    expect(codes(prog(`let <t:string=""/>\nfunction go() { @t = @user?.name; }`, `<p>\${@t}</p>`))).toEqual(["E-TYPE-031"]);
  });

  test("`?.` on an unknown member is E-SCOPE-001", () => {
    const m = msgs(prog(`function go() { const x: string | not = @user?.nope; if (x is given) { @out = x; } }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-SCOPE-001");
    expect(m[0]).toContain("`nope`");
  });

  test("per hop: a BARE hop after `?.` on an optional field is E-TYPE-046 (`@user?.addr.city`)", () => {
    const m = msgs(prog(`function go() { const x: string | not = @user?.addr.city; if (x is given) { @out = x; } }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-TYPE-046");
    expect(m[0]).toContain("Addr | not");
  });

  test("the chain ends at its parentheses: `(@user?.name).length` dereferences `string | not`, E-TYPE-046", () => {
    expect(codes(prog(`function go() { @n = (@user?.name).length; }`))).toEqual(["E-TYPE-046"]);
  });

  test("`a?.b` does not narrow `a`: neither after it nor under `if (a?.b is given)`", () => {
    expect(codes(prog(`function go() { const x: string | not = @user?.name; @out = @user.name; }`))).toContain("E-TYPE-046");
    expect(codes(prog(`function go() { if (@user?.name is given) { @out = @user.name; } }`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog(`function go() { }`, `<p if=(@user?.name is given)>\${@user.name}</p>`))).toEqual(["E-TYPE-046"]);
  });

  test("#1917 H1 shape: a receiver rebound to another type is refused by name (memberRecvMismatch), not read", () => {
    const m = msgs(prog(`function go() { let u = @user; u = @car; const x: string | not = u?.name; if (x is given) { @out = x; } }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(m[0]).toContain("was resolved on the receiver's declared or initial type");
  });

  test("H1 shape, chained and with `.length` after the hop", () => {
    expect(codes(prog(`function go() { let u = @user; u = @car; @n = u?.name.length; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    // both hops read through `u` (each refused on its own read)
    const c = codes(prog(`function go() { let u = @user; u = @car; const x: string | not = u?.addr?.city; if (x is given) { @out = x; } }`));
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x === "E-BOOTSTRAP-UNSUPPORTED")).toBe(true);
  });

  test("a foreign (`asIs`) receiver is not read through `?.` (fail closed)", () => {
    const src = `<program lang="ts">
    function a() -> string | not {
        const v = _={ ({ name: "x" }) }=;
        return v?.name;
    }
    <main><p>"x"</p></main>
</program>
`;
    const m = msgs(src);
    expect(m.some((x) => x.startsWith("E-BOOTSTRAP-UNSUPPORTED") && x.includes("member access `.name`"))).toBe(true);
  });
});

// s478 fix round 1 (#1927 review) — the presence test closeOpt adds is the receiver's ONE read.
const HD2 = `type Addr:struct = { city: string }
type User:struct = { name: string, addr: Addr | not, i: int }
type Box:struct = { items: string[], i: int }
let <user:User | not=({ name: "ann", addr: { city: "oslo" }, i: 1 })/>
let <box:Box | not=({ items: ["a", "b"], i: 1 })/>
let <out=""/>
let <k:int=0/>`;
const prog2 = (fns, markup = "") => `<program>\n${HD2}\n${fns}\n<button id="b" onclick=go()>go</button>\n<p id="o">\${@out}|\${@k}</p>\n${markup}\n</program>\n`;

describe("`lin` receiver — the presence test and the chain's read are one use (#1927 review MED-1; red on head: E-LIN-002)", () => {
  test("`lin t = @user; t?.name` is one use — clean, and it runs", async () => {
    await run(prog2(`function go() { lin t = @user; const x: string | not = t?.name; if (x is given) { @out = x; } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann|0");
  });
  test("`t?.length` and the two-hop `t?.addr?.city` are one use each", () => {
    expect(codes(prog2(`function go() { lin t = "ab"; const n: int | not = t?.length; if (n is given) { @k = n; } }`))).toEqual([]);
    expect(codes(prog2(`function go() { lin t = @user; const x: string | not = t?.addr?.city; if (x is given) { @out = x; } }`))).toEqual([]);
  });
  test("a real second use is still E-LIN-002 — once, at the second use", () => {
    expect(codes(prog2(`function go() { lin t = @user; const x: string | not = t?.name; const y: string | not = t?.name; }`))).toEqual(["E-LIN-002"]);
    expect(codes(prog2(`function go() { lin t = @user; const x: string | not = t?.name; const y = t; }`))).toEqual(["E-LIN-002"]);
    // a hop's argument is not the chain's spine: naming `t` there is a second use
    expect(codes(prog2(`function go() { lin t = "abc"; const n: string | not = t?.slice(t.length); }`))).toEqual(["E-LIN-002"]);
  });
  test("a `lin` in a hop's argument is consumed only where the receiver is present (E-LIN-003)", () => {
    expect(codes(prog2(`function go() { lin u = 1; const n: string | not = @user?.name.slice(u); }`))).toEqual(["E-LIN-003"]);
  });
});

describe("the presence test narrows the chain's spine only — not a hop's argument or index (#1927 review LOW-2; red on head: accepted)", () => {
  // §42.3.6 "each hop is guarded only against its own receiver"; §42.3.5 "`?.` guards ONLY its immediate receiver"
  test("a bare `@user.i` in a hop's argument is E-TYPE-046, as it is without the `?.`", () => {
    expect(codes(prog2(`function go() { const x: string | not = @user?.name.slice(@user.i); }`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog2(`function go() { const x: string | not = @user.name.slice(@user.i); }`))).toContain("E-TYPE-046");
  });
  test("a bare `@box.i` in a hop's index is E-TYPE-046", () => {
    expect(codes(prog2(`function go() { const x: string | not = @box?.items[@box.i]; }`))).toEqual(["E-TYPE-046"]);
  });
  test("the second hop's argument is not narrowed by either test", () => {
    expect(codes(prog2(`function go() { const x: string | not = @user?.addr?.city.slice(@user.addr.city.length); }`))).toEqual(["E-TYPE-046", "E-TYPE-046"]);
  });
  test("the spine reads stay narrowed, and an argument narrowed by an enclosing test is fine (run)", async () => {
    await run(prog2(`function go() { const x: string | not = @user?.name.slice(1); const y: string | not = @box?.items[0]; if (@user is given) { const z: string | not = @user?.name.slice(@user.i); if (z is given && x is given && y is given) { @out = x + y + z; } } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("nnann|0");
  });
});

describe("`?.` on an `@.` row read is refused by name — INTERIM g-boot-optional-chain-atitem-s478 (#1927 review LOW-3)", () => {
  const each = (body) => `<program>\ntype Addr:struct = { city: string }\ntype U:struct = { name: string, addr: Addr | not }\n<us:U[]=([{ name: "a", addr: not }, { name: "b", addr: { city: "x" } }])/>\n<ul id="z">${body}</ul>\n</program>\n`;
  test("`@.addr?.city` names the refusal (not E-TYPE-046 at a hop the user did not write)", () => {
    const m = msgs(each(`<each in=@us><li>\${@.addr?.city}</li></each>`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("`?. on an `@.` row read` (§42.3.6) is not in the bootstrap yet");
  });
  test("the named row binding is built: `<each in=@us as u>` … `u.addr?.city`", () => {
    expect(codes(each(`<each in=@us as u><li>\${u.addr?.city}</li></each>`))).toEqual([]);
  });
});

describe("refused by name — INTERIM (g-boot-optional-call-s478, g-boot-optional-chain-receiver-s478)", () => {
  test("an optional call `f?.(…)`", () => {
    const m = msgs(prog(`function g() -> int { return 1; }\nfunction go() { @n = g?.(); }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(m[0]).toContain("`?.(…) optional call` (§42.3.6) is not in the bootstrap yet");
  });

  test("`?.` on a call result (a receiver that cannot be tested and re-read)", () => {
    const m = msgs(prog(`function g() -> User | not { return not; }\nfunction go() { const x: string | not = g()?.name; if (x is given) { @out = x; } }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("`?. on a computed receiver` (§42.3.6) is not in the bootstrap yet");
  });

  test("a conditional receiver (parentheses alone are grouping: `(@user)?.name` is `@user?.name`)", () => {
    expect(codes(prog(`function go() { const x: string | not = (@user is given ? @user : @bare)?.name; if (x is given) { @out = x; } }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(prog(`function go() { const x: string | not = (@user)?.name; if (x is given) { @out = x; } }`))).toEqual([]);
  });
});

describe("fail closed where the bootstrap reads no narrowed index (g-boot-index-narrowed-optional-s478)", () => {
  test("`@xs?.[0]` on a `T[] | not` is refused by name (as `if (@xs is given) { @xs[0] }` is)", () => {
    const c = codes(`<program>\n<xs:int[] | not=([1, 2])/>\nlet <n:int | not=(not)/>\nfunction go() { @n = @xs?.[0]; }\n<p>\${@n}</p>\n</program>\n`);
    expect(c).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("lexing — `?.` followed by a digit is a conditional (ECMAScript OptionalChainingPunctuator)", () => {
  const kinds = (src) => mods.lex.lex(src).map((t) => t.kind.variant ?? t.kind);
  test("`a?.b` is one `?.` token; `a ?.5 : 1` is `?` then `.5`", () => {
    expect(kinds("${ a?.b }")).toContain("OptionalChain");
    const k2 = kinds("${ a ?.5 : 1 }");
    expect(k2).not.toContain("OptionalChain");
    expect(k2).toContain("Question");
  });
});
