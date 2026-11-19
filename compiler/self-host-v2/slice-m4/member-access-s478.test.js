// member-access-s478.test.js — s478-boot-member-access: a member of a `T | not` receiver.
//
// §42.3.5: "A member access whose receiver's static type admits `not` (a plain-optional `T | not` /
// `T?` receiver) SHALL be compile error E-TYPE-046 UNLESS the access is made absence-safe by one of:
// … 2. Narrowing `recv` from `T | not` to `T` in an enclosing scope … Inside the narrowed scope
// `recv` is `T` and bare `.field` access is safe."
//
// Before: every member of a `T | not` receiver (a struct field, `.length`) was E-BOOTSTRAP-UNSUPPORTED
// ("member access `.<name>` on a value that is not a struct or an instance is not in bootstrap slice
// M2"). Now the binder resolves it on `T` and the typer — which owns narrowing — reports E-TYPE-046
// where the receiver is not narrowed. A loop now keeps a cell's narrowing when it writes none of it
// ("A write to the narrowed place — direct, in a nested block, or by a call that writes it or whose
// write set cannot be determined — ends the narrowing from that point"); before, every cell
// narrowing was dropped at a loop. A receiver the bootstrap cannot type stays refused by name (fail
// closed). Every positive program is compiled by the bootstrap, its Core checked, printed and RUN.

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
let <user:User | not=({ name: "ann", addr: { city: "oslo" } })/>
let <other:User | not=(not)/>
let <s:string | not="héllo"/>
<xs:int[] | not=([1, 2, 3])/>
let <out=""/>
let <n:int=0/>`;

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
  await loadProgram(r.core, "s478-member-" + k++);
  return r;
}

const UNSUP_M2 = "on a value that is not a struct or an instance is not in bootstrap slice M2";

describe("§42.3.5 — a narrowed `T | not` receiver's member is read (run)", () => {
  test("a struct field of a narrowed cell (`if (@user is given)`)", async () => {
    await run(prog(`function go() { if (@user is given) { @out = @user.name; } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann");
  });

  test("an early return narrows the rest of the block (`if (@user is not) return`)", async () => {
    await run(prog(`function go() { if (@user is not) { return; } @out = @user.name + "!"; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann!");
  });

  test("per hop: an optional field is narrowed on its own (`@user.addr is given`)", async () => {
    await run(prog(`function go() { if (@user is given) { if (@user.addr is given) { @out = @user.addr.city; } } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("oslo");
  });

  test("a `T | not` parameter narrowed in the function", async () => {
    await run(prog(`function nameOf(u: User | not) -> string { if (u is given) { return u.name; } return "none"; }
function go() { @out = nameOf(@user) + "," + nameOf(@other); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann,none");
  });

  test("`.length` of a narrowed `string | not` counts code points; of a narrowed `T[] | not`, elements", async () => {
    await run(prog(`function go() { if (@s is given) { if (@xs is given) { @n = @s.length * 10 + @xs.length; } } }`));
    click($("#b"));
    expect($("#n").textContent).toBe("53");
  });

  test("an `if=` gate narrows its children (markup read)", async () => {
    await run(prog(`function go() { @user = not; }`, `<p id="g" if=@user>\${@user.name}</p>`));
    expect($("#g").textContent).toBe("ann");
    click($("#b"));
    expect($("#g")).toBe(null);
  });

  test("a loop that writes none of the cell keeps its narrowing — in the body and after it", async () => {
    await run(prog(`function go() { if (@user is given) { for (const x of [1, 2]) { @out = @out + @user.name; } @out = @out + "|" + @user.name; } }`));
    click($("#b"));
    expect($("#o").textContent).toBe("annann|ann");
  });
});

describe("§42.3.5 — E-TYPE-046 where the receiver may be `not` (red on base: E-BOOTSTRAP-UNSUPPORTED)", () => {
  test("an un-narrowed cell's field", () => {
    const m = msgs(prog(`function go() { @out = @user.name; }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-TYPE-046");
    expect(m[0]).toContain("`@user`");
    expect(m[0]).toContain("@user?.name");     // §42.3.5: the message steers to `?.` and to narrowing
    expect(m[0]).not.toContain(UNSUP_M2);
  });

  test("an un-narrowed markup read, and one under `show=` (not a narrowing guard)", () => {
    expect(codes(prog(`function go() { }`, `<p>\${@user.name}</p>`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog(`function go() { }`, `<p show=@user>\${@user.name}</p>`))).toEqual(["E-TYPE-046"]);
  });

  test("per hop: a narrowed receiver's optional field is `F | not` again", () => {
    expect(codes(prog(`function go() { if (@user is given) { @out = @user.addr.city; } }`))).toEqual(["E-TYPE-046"]);
  });

  test("a write ends the narrowing — direct, and by a call that writes the cell", () => {
    expect(codes(prog(`function go() { if (@user is given) { @user = not; @out = @user.name; } }`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog(`function clear() { @user = not; }
function go() { if (@user is given) { clear(); @out = @user.name; } }`))).toEqual(["E-TYPE-046"]);
  });

  test("a loop that writes the cell (later in its body, in a nested loop, or by a call) does not keep it", () => {
    expect(codes(prog(`function go() { if (@user is given) { for (const x of [1]) { @out = @user.name; @user = not; } } }`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog(`function go() { if (@user is given) { for (const x of [1]) { for (const y of [1]) { @user = not; } @out = @user.name; } } }`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog(`function clear() { @user = not; }
function go() { if (@user is given) { for (const x of [1]) { @out = @user.name; clear(); } } }`))).toEqual(["E-TYPE-046"]);
  });

  test("a loop's write ends the narrowing after the loop too", () => {
    expect(codes(prog(`function go() { if (@user is given) { for (const x of [1]) { @user = not; } @out = @user.name; } }`))).toEqual(["E-TYPE-046"]);
  });

  test("`.length` of an un-narrowed `string | not` / `T[] | not`", () => {
    expect(codes(prog(`function go() { @n = @s.length; }`))).toEqual(["E-TYPE-046"]);
    expect(codes(prog(`function go() { @n = @xs.length; }`))).toEqual(["E-TYPE-046"]);
  });

  test("an un-narrowed `T | not` parameter", () => {
    expect(codes(prog(`function nameOf(u: User | not) -> string { return u.name; }
function go() { @out = nameOf(@user); }`))).toEqual(["E-TYPE-046"]);
  });

  test("a lifecycle `(not to T)` receiver fires E-TYPE-001 only — never both (§42.3.5)", () => {
    const c = codes(`<program>
type User:struct = { name: string }
let <u:(not to User)=(not)/>
let <out=""/>
function go() { @out = @u.name; }
function go2() { if (@u is given) { @out = @u.name; } }
<button id="b" onclick=go()>go</button>
<p>\${@out}</p>
</program>
`);
    expect(c).toEqual(["E-TYPE-001"]);       // go's read only; go2's is discriminated
  });
});

describe("fail closed — receivers the bootstrap cannot type stay refused", () => {
  test("an unknown field of a `T | not` struct is E-TYPE-004 (§34, §14.3), not a typed read", () => {
    expect(codes(prog(`function go() { if (@user is given) { @out = @user.nope; } }`))).toEqual(["E-TYPE-004"]);
  });

  test("an unknown member of a tape stays refused", () => {
    const m = msgs(prog(`function go() { const ys: int[] = [1]; @n = ys.size; }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("`.length` of an `int` (and of an `int | not`) stays refused", () => {
    expect(msgs(prog(`function go() { @n = @n.length; }`)).join("\n")).toContain(UNSUP_M2);
    expect(msgs(`<program>
let <m:int | not=(1)/>
let <n:int=0/>
function go() { if (@m is given) { @n = @m.length; } }
<button id="b" onclick=go()>go</button>
<p>\${@n}</p>
</program>
`).join("\n")).toContain(UNSUP_M2);
  });

  test("a member of an untyped parameter is not typed (no int / string guess)", () => {
    expect(msgs(prog(`function f(it) -> int { return it.id; }
function go() { @n = f(1); }`)).join("\n")).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("a write of a field through a `T | not` cell is not built by this lane (still refused)", () => {
    expect(codes(prog(`function go() { if (@user is given) { @user.name = "b"; } }`)).length).toBeGreaterThan(0);
  });
});

// s478 fix round 1 (#1917 review H1) — the receiver is what the binder resolved the step on.
// The binder resolves `.field` / `.length` from a receiver's declared or init-inferred type; an
// unannotated `let` rebound to a value of another type (`let u = @user; u = @car`) is flow-typed by
// the typer as the new type. Before: the read compiled and read a field the value does not have
// (undefined / a TypeError / NaN or a number written into a `string` / `int` cell at run time) — on
// BASE already for a non-optional receiver. §7.5.1: a value SHALL satisfy the type of the position
// it reaches. Now every struct-field / `.length` read is held to it: refused by name, fail closed.
const HEAD2 = `type User:struct = { name: string }
type Pet:struct = { name: int }
type Car:struct = { make: string }
let <user:User | not=({ name: "ann" })/>
let <pu:User=({ name: "pat" })/>
let <pet:Pet | not=({ name: 7 })/>
let <car:Car | not=({ make: "vw" })/>
let <pcar:Car=({ make: "vw" })/>
let <s:string | not="hey"/>
let <out=""/>
let <n:int=0/>`;
const prog2 = (fns, markup = "") => `<program>
${HEAD2}
${fns}
<button id="b" onclick=go()>go</button>
<p id="o">\${@out}</p>
<p id="n">\${@n}</p>
${markup}
</program>
`;
const MISMATCH = "was resolved on the receiver's declared or initial type";

describe("#1917 H1 — a member read through a receiver rebound to another type is refused", () => {
  const refused = (name, fns) => test(name, () => {
    const m = msgs(prog2(fns));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(m[0]).toContain(MISMATCH);
  });
  refused("untyped-let-car-len: `let u = @user; u = @car` then `u.name.length`",
    `function go() { let u = @user; u = @car; if (u is given) { @n = u.name.length + 1; } }`);
  refused("untyped-let-str-len: `let u = @s; u = 5` then `u.length`",
    `function go() { let u = @s; u = 5; if (u is given) { @n = u.length + 1; } }`);
  refused("untyped-let-pet: `u = @pet` (a `name: int`) then `@out = u.name`",
    `function go() { let u = @user; u = @pet; if (u is given) { @out = u.name; } }`);
  refused("untyped-let-loop-rebind-pet: a rebind in a loop",
    `function go() { let u = @user; if (u is given) { for (const x of [1, 2]) { @out = @out + u.name; u = @pet; } } }`);
  refused("preexisting-nonopt-rebind-car: a non-optional receiver (refused on BASE neither)",
    `function go() { let u = @pu; u = @pcar; @out = u.name; }`);
  refused("preexisting-str-rebind-int-len: `let u = \"abc\"; u = 5` then `u.length`",
    `function go() { let u = "abc"; u = 5; @n = u.length + 1; }`);

  test("controls: a local never rebound, or rebound to its own type, still reads (run)", async () => {
    await run(prog2(`function go() { let u = @user; if (u is given) { @out = u.name; } let v = @pu; v = { name: "q" }; @out = @out + v.name; let w = "abc"; w = "de"; @n = w.length; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("annq");
    expect($("#n").textContent).toBe("2");
  });
});

// s478 fix round 1 (#1917 review L1) — a click handler lifted in a loop under an `if=` gate keeps the
// gate's narrowing (s462 Q18 gateMark). Before: tLoopEnv dropped the gate mark, so the handler's
// `@user.name` was E-TYPE-046 (fail closed, an over-refusal).
describe("#1917 L1 — a gated click handler lifted in a loop keeps the gate narrowing (run)", () => {
  test("`<div if=@user>${ for … { lift <button onclick={ … @user.name; @user = not; }> } }`", async () => {
    await run(prog(`function go() {}`, `<div if=@user>\${ for (const x of [1, 2]) { lift <button class="q" onclick={ @out = @out + @user.name; @user = not; }>q</button>; } }</div>`));
    const bs = document.querySelectorAll(".q");
    expect(bs.length).toBe(2);
    click(bs[0]);
    click(bs[1]);
    expect($("#o").textContent).toBe("ann");
  });

  test("a loop that writes the gated cell still ends it", () => {
    expect(codes(prog(`function kill() { @user = not; }\nfunction go() {}`, `<div if=@user>\${ for (const x of [1, 2]) { lift <button class="q" onclick={ @out = @out + @user.name; }>q</button>; kill(); } }</div>`))).toContain("E-TYPE-046");
  });
});
