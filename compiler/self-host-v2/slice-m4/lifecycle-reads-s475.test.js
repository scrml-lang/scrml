// lifecycle-reads-s475.test.js — s475-boot-lifecycle-reads (slice S1 of the §13.9 pending-cells plan):
// the presence lifecycle `(not to T)` on a program cell is a READ rule and a WRITE contract.
//
// SPEC §14.12.10: "Per-access transition-state tracking SHALL fire `E-TYPE-001` at every read of a
// lifecycle-annotated location whose local transition state is `pre`." §14.12.3 (S160): a `(not to T)`
// cell "transitions to `post` on EITHER a `T`-shaped assignment (`@cell = value`, …) OR a
// presence-discrimination on the cell". §13.9.3: "Any other read SHALL be **E-TYPE-001**. That includes
// a whole-cell read (`${@users}`, `f(@users)`), not only a member access." … "A suspension point ends
// every reactive cell's narrowing (§42.3.5)". §66.11.6: "A lifecycle annotation `(A to B)` (§14.12) is
// a **write permission along the declared path** … a write that does not follow `A → B` is
// `E-WRITE-NOT-GRANTED`." §66.11.1: "a lifecycle `(A to B)` | a write along the declared path `A → B`".
//
// Red on base (origin/main 44048559b): every read below compiled with NO diagnostic (display, pass,
// `==`, template) or gave the `T | not` code (E-OPERAND-NOT-NARROWED for `+`, E-COND-NOT-BOOLEAN for a
// bare `bool` test); `@m = not` compiled; a write to a LOCKED `(not to T)` cell was E-WRITE-NOT-GRANTED
// ("is locked"). The four S475 r1 probes (docs/changes/s475-boot-lifecycle-type/probes/) compiled clean.

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const T1 = "E-TYPE-001";
const WNG = "E-WRITE-NOT-GRANTED";
const P = (body, main = `<p>x</p>`) => `<program>\n${body}\n<main>${main}</main>\n</program>\n`;
const DB = (body, main = `<p>x</p>`) => `<program db="./app.db">\n${body}\n<main>${main}</main>\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.code.startsWith("E-"));
const codes = (src) => errs(src).map((d) => d.code);
const M = `let <m:(not to int)=not/>`;
const MAYBE = `let <m:int | not=not/>`;

describe("E-TYPE-001 at each read before a discrimination (red on base: silent / the `T | not` code)", () => {
  const READS = {
    display: [M, `<p>\${@m}</p>`],
    pass: [`${M}\nfunction g(x: int | not) -> int { return 1; }\nfunction f() -> int { return g(@m); }`, `<p>\${f()}</p>`],
    eq: [`${M}\nfunction f() -> bool { return @m == 5; }`, `<p>\${f()}</p>`],
    arith: [`${M}\nfunction f() -> int { return @m + 1; }`, `<p>\${f()}</p>`],
    template: [`${M}\nfunction f() -> string { return \`n=\${@m}\`; }`, `<p>\${f()}</p>`],
    lockedCell: [`<m:(not to int)=not/>`, `<p>\${@m}</p>`],
    boolTernary: [`let <b:(not to bool)=not/>\nfunction f() -> string { return @b ? "t" : "f"; }`, `<p>\${f()}</p>`],
    attrValue: [M, `<p title=@m>x</p>`],
    // the initial value does not decide the LOCAL state: a handler may write a `T | not` value
    // (legal, §13.9.4), so only a local discrimination or assignment proves the cell present
    tInitialized: [`let <m:(not to int)=5/>`, `<p>\${@m}</p>`],
    afterOtherFnWrite: [`${M}\nfunction w() { @m = 5; }\nfunction f() -> int { return @m + 1; }`, `<button onclick=w()>w</button><p>\${f()}</p>`],
  };
  for (const [name, [body, main]] of Object.entries(READS)) {
    test(name + ": exactly one E-TYPE-001", () => {
      const e = errs(P(body, main));
      expect(e.map((d) => d.code)).toEqual([T1]);
      expect(e[0].message).toContain("read before it is discriminated");
      expect(e[0].message).toContain("§13.9.3");
    });
  }
  test("the message names the declared lifecycle and the fixes", () => {
    const m = errs(P(M, `<p>\${@m}</p>`))[0].message;
    expect(m).toContain("`(not to int)`");
    expect(m).toContain("if (@m is not) return");
    expect(m).toContain("match @m");
  });
  test("one report per read: two reads, two reports", () => {
    expect(codes(P(`${M}\nfunction f() -> int { return @m + @m; }`, `<p>\${f()}</p>`))).toEqual([T1, T1]);
  });
  test("a member read gets ONE report (the resolver's named refusal of a `T | not` receiver)", () => {
    const cs = codes(P(`type S:struct = { id: int }\nlet <s:(not to S)=not/>\nfunction f() -> int { return @s.id; }`, `<p>\${f()}</p>`));
    expect(cs.length).toBe(1);
  });
});

describe("legal under each presence discrimination (§13.9.3) and after a `T`-shaped assignment (§14.12.3)", () => {
  const OK = {
    earlyReturn: [`${M}\nfunction f() -> int { if (@m is not) return 0; return @m + 1; }`, `<p>\${f()}</p>`],
    isGivenBlock: [`${M}\nfunction f() -> int { if (@m is given) { return @m + 1; } return 0; }`, `<p>\${f()}</p>`],
    barePresence: [`${M}\nfunction f() -> int { if (@m) { return @m + 1; } return 0; }`, `<p>\${f()}</p>`],
    isGivenAnd: [`${M}\nfunction f() -> bool { return @m is given && @m > 3; }`, `<p>\${f()}</p>`],
    isGivenTernary: [`${M}\nfunction f() -> int { return @m is given ? @m : 0; }`, `<p>\${f()}</p>`],
    match: [`${M}\nfunction f() -> int { return match @m { not :> 0, else :> @m + 1 }; }`, `<p>\${f()}</p>`],
    ifAttr: [M, `<p if=@m>\${@m}</p>`],
    ifAttrIsGiven: [M, `<p if=(@m is given)>\${@m + 1}</p>`],
    elseAfterIsNot: [M, `<p if=(@m is not)>none</p>\n  <p else>\${@m + 1}</p>`],
    elseIfChain: [`${M}\nlet <k:int=0/>`, `<p if=(@m is not)>none</p><p else-if=(@k > 0)>\${@m}</p><p else>\${@m + 1}</p>`],
    assignment: [`${M}\nfunction f() -> int { @m = 5; return @m + 1; }`, `<button onclick=f()>a</button>`],
    discriminationItself: [M, `<p>\${@m is given}</p><p>\${@m is not}</p>`],
    boolIsGiven: [`let <b:(not to bool)=not/>`, `<p if=(@b is given && @b)>yes</p>`],
  };
  for (const [name, [body, main]] of Object.entries(OK)) {
    test(name, () => expect(codes(P(body, main))).toEqual([]));
  }
  test("the narrowing ends with its scope: a read after the `if` block is E-TYPE-001", () => {
    expect(codes(P(`${M}\nfunction f() -> int { if (@m is given) { return @m; } return @m + 1; }`, `<p>\${f()}</p>`))).toEqual([T1]);
  });
  test("an `else` after a bare `if=@m` proves nothing: E-TYPE-001", () => {
    expect(codes(P(M, `<p if=@m>a</p><p else>\${@m}</p>`))).toEqual([T1]);
  });
  test("a non-blank node between `if=` and `else` breaks the chain (chainCheck's rule) — no narrowing leaks", () => {
    const cs = codes(P(M, `<p if=(@m is not)>none</p>\${"x"}<p else>\${@m}</p>`));
    expect(cs).toContain(T1);
  });
});

describe("a suspension point re-arms the check (§13.9.3, §42.3.5)", () => {
  const LOAD = `function load() -> int {\n  const r = ?{\`SELECT count(*) AS n FROM t\`}.get() !{ _ :> { return 0; } };\n  return 1;\n}`;
  test("a read after an awaited server call is E-TYPE-001", () => {
    const src = DB(`${M}\n${LOAD}\nfunction f() { if (@m is not) return; const x: int = load() !{ _ :> 0 }; @m = @m + x; }`, `<button onclick=f()>a</button>`);
    expect(codes(src)).toEqual([T1]);
  });
  test("the same read before the call is legal", () => {
    const src = DB(`${M}\n${LOAD}\nfunction f() { if (@m is not) return; @m = @m + 1; const x: int = load() !{ _ :> 0 }; }`, `<button onclick=f()>a</button>`);
    expect(codes(src)).toEqual([]);
  });
});

describe("the write contract (§66.11.6, §66.11.1)", () => {
  test("`@m = not` (back to the pre-state) is E-WRITE-NOT-GRANTED — `let` cell", () => {
    const e = errs(P(`${M}\nfunction h() { @m = not; }`, `<button onclick=h()>b</button>`));
    expect(e.map((d) => d.code)).toEqual([WNG]);
    expect(e[0].message).toContain("§66.11.6");
    expect(e[0].message).toContain("`not → int`");
  });
  test("`@m = not` is E-WRITE-NOT-GRANTED — locked cell", () => {
    expect(codes(P(`<m:(not to int)=not/>\nfunction h() { @m = not; }`, `<button onclick=h()>b</button>`))).toEqual([WNG]);
  });
  test("`not → T` and `T → T′` writes are granted on a `let` cell", () => {
    expect(codes(P(`${M}\nfunction f() { @m = 5; }\nfunction g() { @m = 6; }`, `<button onclick=f()>a</button><button onclick=g()>b</button>`))).toEqual([]);
  });
  // red on base: E-WRITE-NOT-GRANTED "`@m` is locked — nothing grants this write"
  test("…and on a LOCKED cell the lifecycle grants the whole `not → T` write (§66.11.1)", () => {
    expect(codes(P(`<m:(not to int)=not/>\nfunction f() { @m = 5; }`, `<button onclick=f()>a</button>`))).toEqual([]);
  });
  // s475 r1 (#1783 review F2b, INTERIM pending an owner ruling on `T → T′`): only `not → T`
  test("…but a LOCKED cell's write where it is provably present already (`T → T′`) is E-WRITE-NOT-GRANTED", () => {
    const e = errs(P(`<m:(not to int)=not/>\nfunction g() { if (@m is not) return; @m = @m + 1; }`, `<button onclick=g()>b</button>`));
    expect(e.map((d) => d.code)).toEqual([WNG]);
    expect(e[0].message).toContain("int → int");
    expect(codes(P(`<m:(not to int)=not/>\nfunction g() { @m = 1; @m = 2; }`, `<button onclick=g()>b</button>`))).toEqual([WNG]);
  });
  test("a locked cell's writes print exactly as a `let` cell's (no new runtime representation)", () => {
    const body = (kw) => P(`${kw}<m:(not to int)=not/>\nfunction f() { @m = 5; }`, `<button onclick=f()>a</button><p if=@m>\${@m}</p>`);
    const js = (src) => {
      const r = run(src);
      expect(r.diags.map((d) => d.code)).toEqual([]);
      return mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
    };
    expect(js(body("    "))).toBe(js(body("let ")));
  });
  // s475 r1 (#1783 review F2a; red on #1783 head faa84ccff: compiled, and at run time the cell
  // reverted to `not`). INTERIM: the capable form is S4's pending-cell handled waiting write (§13.9.4).
  test("a value that MAY be `not` is E-WRITE-NOT-GRANTED — let and locked, call and ternary (§66.11.2)", () => {
    const G = `function g() -> int | not { return not; }`;
    for (const kw of ["let ", ""]) {
      const e = errs(P(`${kw}<m:(not to int)=not/>\n${G}\nfunction f() { @m = g(); }`, `<button onclick=f()>a</button>`));
      expect(e.map((d) => d.code)).toEqual([WNG]);
      expect(e[0].message).toContain("may be `not`");
      expect(e[0].message).toContain("§66.11.2");
      expect(codes(P(`${kw}<m:(not to int)=not/>\nlet <k:bool=true/>\nfunction f() { @m = @k ? 1 : not; }`, `<button onclick=f()>a</button>`))).toEqual([WNG]);
    }
  });
  test("a discriminated value is granted (`const v = g(); if (v is given) { @m = v; }`)", () => {
    expect(codes(P(`${M}\nfunction g() -> int | not { return not; }\nfunction f() { const v = g(); if (v is given) { @m = v; } }`, `<button onclick=f()>a</button>`))).toEqual([]);
  });
  test("`reset(@m)` on a `let` cell is granted (its `replace`; §14.12.10 reverts the transition state)", () => {
    expect(codes(P(`${M}\nfunction r() { reset(@m); }`, `<button onclick=r()>r</button>`))).toEqual([]);
  });
  test("`reset(@m)` on a locked cell writes the pre-state: E-WRITE-NOT-GRANTED naming the lifecycle", () => {
    const e = errs(P(`<m:(not to int)=not/>\nfunction r() { reset(@m); }`, `<button onclick=r()>r</button>`));
    expect(e.map((d) => d.code)).toEqual([WNG]);
    expect(e[0].message).toContain("§66.11.6");
  });
  test("a reset re-arms the read rule", () => {
    expect(codes(P(`${M}\nfunction r() -> int { @m = 5; reset(@m); return @m + 1; }`, `<button onclick=r()>r</button>`))).toEqual([T1]);
  });
});

describe("`T | not` cells keep their diagnostics", () => {
  const SAME = {
    display: [MAYBE, `<p>\${@m}</p>`, []],
    eq: [`${MAYBE}\nfunction f() -> bool { return @m == 5; }`, `<p>\${f()}</p>`, []],
    arith: [`${MAYBE}\nfunction f() -> int { return @m + 1; }`, `<p>\${f()}</p>`, ["E-OPERAND-NOT-NARROWED"]],
    boolTernary: [`let <b:bool | not=not/>\nfunction f() -> string { return @b ? "t" : "f"; }`, `<p>\${f()}</p>`, ["E-COND-NOT-BOOLEAN"]],
    writeNot: [`${MAYBE}\nfunction h() { @m = 5; @m = not; }`, `<button onclick=h()>b</button>`, []],
    locked: [`<m:int | not=not/>\nfunction f() { @m = 5; }`, `<button onclick=f()>a</button>`, [WNG]],
  };
  for (const [name, [body, main, want]] of Object.entries(SAME)) {
    test(name, () => expect(codes(P(body, main))).toEqual(want));
  }
  // the `<p else>` chain narrowing is general (sound: §17.1.1 "Exactly the first true branch is in the
  // DOM"); for a `T | not` cell it is newly-accepting (red on base: E-OPERAND-NOT-NARROWED)
  test("an `else` after `if=(@m is not)` narrows a `T | not` cell too", () => {
    expect(codes(P(MAYBE, `<p if=(@m is not)>none</p><p else>\${@m + 1}</p>`))).toEqual([]);
  });
});

describe("the S475 r1 probes (docs/changes/s475-boot-lifecycle-type/probes/) — red on base: all compiled clean", () => {
  const dir = join(import.meta.dir, "../../../docs/changes/s475-boot-lifecycle-type/probes");
  const WANT = {
    "life-display-read.scrml": [T1],
    "life-pass-read.scrml": [T1],
    "life-eq-read.scrml": [T1],
    "life-write-back-not.scrml": [WNG],
  };
  for (const [file, want] of Object.entries(WANT)) {
    test(file, () => expect(codes(readFileSync(join(dir, file), "utf8"))).toEqual(want));
  }
});

// ---- s475 r1 (#1783 review) — red on #1783 head faa84ccff unless noted ----------------------------
const L = `<m:(not to int)=not/>`;
const N = `let <n:int=0/>`;
const B = `<button onclick=f()>b</button>`;

// F1 — §42.2.3: "the present case is the arm after `not :>`". A wildcard / `else` with no `not :>`
// before it is where `not` lands. Red on faa84ccff: all four compiled clean, and at run time
// `@n = match @m { 5 :> 1, _ :> @m + 1 }` stored `not + 1` (→ 1) in the `int` cell.
describe("F1: a match arm reached by `not` keeps `T | not`", () => {
  const RED = {
    lifeWild: [`${M}\n${N}\nfunction f() { @n = match @m { 5 :> 1, _ :> @m + 1 }; }`, [T1]],
    lifeElse: [`${M}\n${N}\nfunction f() { @n = match @m { 5 :> 1, else :> @m + 1 }; }`, [T1]],
    lifeStmt: [`${M}\n${N}\nfunction f() { match @m { 5 :> { @n = 1; }, _ :> { @n = @m + 1; } } }`, [T1]],
    maybeWild: [`${MAYBE}\n${N}\nfunction f() { @n = match @m { 5 :> 1, _ :> @m + 1 }; }`, ["E-OPERAND-NOT-NARROWED"]],
    maybeStmt: [`${MAYBE}\n${N}\nfunction f() { match @m { 5 :> { @n = 1; }, _ :> { @n = @m + 1; } } }`, ["E-OPERAND-NOT-NARROWED"]],
  };
  for (const [name, [body, want]] of Object.entries(RED)) {
    test(name, () => expect(codes(P(body, B))).toEqual(want));
  }
  const OK = {
    notArmFirst: `${M}\n${N}\nfunction f() { @n = match @m { not :> 0, _ :> @m + 1 }; }`,
    notArmMid: `${MAYBE}\n${N}\nfunction f() { @n = match @m { 5 :> 1, not :> 0, else :> @m + 1 }; }`,
    literalArmExcludesNot: `${M}\n${N}\nfunction f() { @n = match @m { 5 :> @m + 1, not :> 0, _ :> 2 }; }`,
  };
  for (const [name, body] of Object.entries(OK)) {
    test(name + " (legal)", () => expect(codes(P(body, B))).toEqual([]));
  }
});

// F2b — §66.11.1 "a write along the declared path `A → B`": a LOCKED cell is granted the whole
// `not → T` write only (INTERIM pending an owner ruling on `T → T′`). Red on faa84ccff: every
// edit and the bind compiled (the grant rode the whole `replace` channel).
describe("F2b: a locked `(not to T)` cell takes no edit and no `bind:`", () => {
  const S = `<xs:(not to int[])=not/>`;
  const RED = {
    append: [`${S}\nfunction f() { if (@xs is not) return; @xs.append(1); }`, B],
    pop: [`${S}\nfunction f() { if (@xs is not) return; @xs.pop(); }`, B],
    shape: [`${S}\nfunction f() { if (@xs is not) return; @xs = [...@xs, 1]; }`, B],
    bind: [`<s:(not to string)=not/>`, `<input bind:value=@s/>`],
    bindGated: [`<s:(not to string)=not/>`, `<div if=@s><input bind:value=@s/></div>`],
  };
  for (const [name, [body, main]] of Object.entries(RED)) {
    test(name, () => {
      const e = errs(P(body, main));
      expect(e.map((d) => d.code)).toEqual([WNG]);
      expect(e[0].message).toContain("locked `(not to");
    });
  }
  test("the whole `not → T` write of a locked sequence is granted", () => {
    expect(codes(P(`${S}\nfunction f() { @xs = [1]; }`, B))).toEqual([]);
  });
  test("a `let` cell keeps its `replace` (T → T′) and its reset", () => {
    expect(codes(P(`${M}\nfunction f() { if (@m is given) { @m = @m + 1; } }\nfunction r() { reset(@m); }`, `${B}<button onclick=r()>r</button>`))).toEqual([]);
  });
});

// F3 — §13.9.3 "Any other read SHALL be E-TYPE-001. That includes a whole-cell read". Red on faa84ccff: clean.
describe("F3: `bind:value` on a `let` `(not to string)` cell reads it", () => {
  test("undiscriminated: E-TYPE-001", () => {
    const e = errs(P(`let <s:(not to string)=not/>`, `<input bind:value=@s/>`));
    expect(e.map((d) => d.code)).toEqual([T1]);
    expect(e[0].message).toContain("<div if=@s>");
  });
  test("under a presence gate: legal", () => {
    expect(codes(P(`let <s:(not to string)=not/>`, `<div if=@s><input bind:value=@s/></div>`))).toEqual([]);
  });
});

// F5 — a call's arguments are evaluated before the call (and before it suspends). Red on faa84ccff:
// E-TYPE-001 at `save(@count)` (docs/tutorial.md 02b pinned it).
describe("F5: a call's own writes do not un-narrow its arguments", () => {
  const SAVE = `let <saveError:string=""/>\nfunction persistCount(n: int)! -> SqlError { ?{\`UPDATE t SET v = \${n}\`}.run(); return n; }\nfunction save(n: int) { persistCount(n) !{ _ :> { @saveError = "x"; } }; }`;
  test("`@count = @count + 1; save(@count);` is legal", () => {
    expect(codes(DB(`let <count:(not to int)=not/>\n${SAVE}\nfunction f() { if (@count is given) { @count = @count + 1; save(@count); } }`, B))).toEqual([]);
  });
  test("…and a read AFTER the call is still E-TYPE-001 (the call may write / suspend)", () => {
    expect(codes(DB(`let <count:(not to int)=not/>\n${N}\n${SAVE}\nfunction f() { if (@count is given) { @count = @count + 1; save(@count); @n = @count; } }`, B))).toEqual([T1]);
  });
  test("a call nested IN an argument still un-narrows the arguments", () => {
    expect(codes(P(`${M}\nfunction clr() -> int { @m = 5; return 1; }\nfunction h(a: int, b: int) -> int { return a + b; }\nfunction f() { if (@m is given) { h(clr(), @m); } }`, B))).toEqual([T1]);
  });
});
