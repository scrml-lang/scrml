// lifecycle-type-s475.test.js — s475-boot-lifecycle-type (slice S0 of the §13.9 pending-cells plan):
// the presence lifecycle type `(not to T)` is READ in every type position and BUILT on a program
// cell; every other lifecycle, and every other position, is refused by name.
//
// SPEC §66.2.4 (amended S449): "a refinement type (§53) or a lifecycle type (§14.12) MAY stand
// bare — `<hp:number(>0)=5/>`, `<p:(.A to .B)=.A/>`. … A `>` or `/` inside the type's OWN
// parentheses … does not end the opener". §14.12.3: lifecycle annotation is permitted on a
// "Shape 1 plain reactive cell". §13.9.1: `<users:(not to User[])=(loadUsers() !{ _ :> not })/>`;
// "The compiler SHALL NOT infer `(not to T)`". §13.9.2: "No new runtime representation".
//
// Red on base (origin/main 16ffdaee8): every opener below gave E-PARSE-TYPE + E-PARSE-TAG
// cascades (+ E-TYPE-UNKNOWN ``), every code position an E-PARSE-TYPE / E-PARSE-EXPECTED
// cascade, and `transition(…)` E-SCOPE-001.
//
// INTERIM (this slice): a `(not to T)` cell is typed exactly as a `T | not` cell — the
// pre-transition read rule (E-TYPE-001, §13.9.3 / §14.12.3) is slice S1 (BUILT by
// s475-boot-lifecycle-reads: lifecycle-reads-s475.test.js), a waiting initializer
// (a pending cell, §13.9.1) is slice S4 and gives a named E-BOOTSTRAP-UNSUPPORTED here (pinned
// below — r1 F1: §13.9.1 "A `(not to T)`-declared cell initializer is no longer E-VALUE-SERVER-CALL").
// s475-boot-pending-cells: slice S4 is BUILT — the pin is flipped (pending-cells-s475.test.js).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const U = "E-BOOTSTRAP-UNSUPPORTED";
const P = (body) => `<program>\n${body}\n<main><p>x</p></main>\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "app.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.code.startsWith("E-"));
const codes = (src) => errs(src).map((d) => d.code);
const js = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => d.code)).toEqual([]);
  return mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
};

describe("`(not to T)` on a program cell compiles (red on base: E-PARSE-TYPE + E-PARSE-TAG)", () => {
  const OK = {
    letInt: `let <m:(not to int)=not/>`,
    lockedInt: `<m:(not to int)=not/>`,
    lockedValue: `<m:(not to int)=5/>`,
    users: `type User:struct = { id: int }\n<users:(not to User[])=not/>`,
    struct: `type S:struct = { id: int }\nlet <s:(not to S)=not/>`,
    spaces: `let <m:(  not   to   int  )=not/>`,
    newline: `let <m:(not\n    to int)=not/>`,
    seeded: `let <a:int=1/>\nlet <m:(not to int)=(@a + 1)/>`,
  };
  for (const [name, decl] of Object.entries(OK)) test(name, () => expect(codes(P(decl))).toEqual([]));
});

// s475-boot-lifecycle-reads (slice S1) built the read rule and the write contract: an undiscriminated
// read, `@m = not` and `reset` of a locked cell now differ from `T | not` (lifecycle-reads-s475.test.js).
// What stays the same: a `T`-shaped write's type check, and the runtime representation.
describe("a `(not to T)` cell shares the `T | not` type check and representation", () => {
  // same length spellings, so every span — and so the Core — lines up
  const pair = (body) => [body.replaceAll("(not to int)", "int  |   not"), body];
  const BODIES = {
    writes: `let <m:(not to int)=not/>\nfunction f() { @m = 5; }\nfunction g() { @m = "x"; }\nfunction k() -> int { if (@m is not) return 0; return @m + 1; }`,
    lockedWrongValue: `<m:(not to int)="x"/>`,
    render: `let <m:(not to int)=not/>\nfunction f() { @m = 5; }\n<p>\${@m is not ? "none" : "some"}</p>`,
  };
  for (const [name, body] of Object.entries(BODIES)) {
    test(name + ": the same diagnostics", () => {
      const [maybe, life] = pair(body);
      const strip = (ds) => ds.map((d) => `${d.code}@${d.span.start}-${d.span.end}`);
      expect(strip(run(P(life)).diags)).toEqual(strip(run(P(maybe)).diags));
    });
  }
  test("the type is checked: a `string` write is E-TYPE-031", () => expect(codes(P(BODIES.writes))).toContain("E-TYPE-031"));
  test("the same client JS — no new runtime representation (§13.9.2)", () => {
    const [maybe, life] = pair(BODIES.render);
    expect(js(P(life))).toBe(js(P(maybe)));
  });
});

describe("a lifecycle's own parentheses shield `>` and `/` (§66.2.4): one diagnostic, no tag cascade", () => {
  test("`->` inside: the legacy glyph, refused by name", () => {
    const e = errs(P(`let <m:(not -> int)=not/>`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("§14.12.2");
  });
  test("`/` inside: one E-PARSE-TYPE, the opener goes on", () => {
    expect(codes(P(`let <m:(not to in/t)=not/>`))).toEqual(["E-PARSE-TYPE"]);
  });
  test("a chain `(A to B to C)`: one E-PARSE-TYPE (§14.12.6.4)", () => {
    const e = errs(P(`let <m:(not to int to string)=not/>`));
    expect(e.map((d) => d.code)).toEqual(["E-PARSE-TYPE"]);
    expect(e[0].message).toContain("§14.12.6.4");
  });
});

describe("code positions read the lifecycle whole and refuse it by name (INTERIM)", () => {
  const CODE = {
    local: `function f() -> int { let x: (not to int) = not; return 1; }`,
    param: `type User:struct = { id: int }\nfunction f(u: (not to User)) -> int { return 1; }`,
    ret: `type User:struct = { id: int }\nfunction f() -> (not to User) { return not; }`,
    structField: `type User:struct = { id: int, hash: (not to string) }`,
    variantField: `type R:enum = { A(x: (not to int)), B }`,
  };
  for (const [name, src] of Object.entries(CODE)) {
    test(name, () => {
      const e = errs(P(src));
      expect(e.map((d) => d.code)).toEqual([U]);
      expect(e[0].message).toContain("§14.12.3");
      expect(e[0].message).toContain("code position");
    });
  }
  test("`->` in a code position: the glyph refusal", () => {
    const e = errs(P(`function f(p: (not -> int)) -> int { return 1; }`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("`->`");
  });
});

describe("other lifecycles and other declarations are refused by name", () => {
  test("variant lifecycle on a cell `(.Idle to .Done)`", () => {
    const e = errs(P(`type Ph:enum = { Idle, Done }\nlet <ph:(.Idle to .Done)=.Idle/>`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("§14.12.6.2");
  });
  test("variant lifecycle in a code position", () => {
    const e = errs(P(`type Ph:enum = { Idle, Done }\nfunction f(p: (.Idle to .Done)) -> int { return 1; }`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("§14.12.6.2");
  });
  test("a typed attribute", () => {
    const e = errs(P(`<Card t:(not to int)=not>\n<p>x</p>\n</>`));
    expect(e.map((d) => d.code)).toContain(U);
    expect(e.find((d) => d.code === U).message).toContain("the attribute `t`");
  });
  test("a child field", () => {
    const e = errs(P(`<Box t:int=0>\n<m:(not to int)=not/>\n<p>x</p>\n</>`));
    expect(e.find((d) => d.message.includes("lifecycle")).message).toContain("the child field `m`");
  });
  test("a derived cell", () => {
    const e = errs(P(`let <a:int=1/>\n<m:(not to int)=(@a + 1)/>`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("derived");
    expect(e[0].message).toContain("reads the cell `@a`");
  });
  // r1 F5 (red on 91e235c2c: "whose initializer reads cells" — `g` reads none)
  test("a derived cell whose initializer only calls: the message says it calls, not that it reads cells", () => {
    const e = errs(P(`function g() -> int { return 1; }\n<m:(not to int)=(g())/>`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("calls a function, which the bootstrap counts as reading cells");
    expect(e[0].message).not.toContain("initializer reads cells");
  });
  // r1 F5 (red on 91e235c2c: E-PARSE-TYPE "expected `)` … found `(`")
  test("a refinement as the second state `(not to number(>0))`: the open refinement limb, named", () => {
    for (const src of [`let <m:(not to number(>0))=not/>`, `function f(p: (not to number(>0))) -> int { return 1; }`]) {
      const e = errs(P(src));
      expect(e.map((d) => d.code)).toEqual([U]);
      expect(e[0].message).toContain("refinement type (§53)");
    }
  });
  test("a granted tape inside the lifecycle", () => {
    const e = errs(P(`<m:(not to int[append])=not/>`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("granted sequence");
  });
  test("`transition()` (§14.12.6.3): named, not E-SCOPE-001", () => {
    const e = errs(P(`let <n:int=0/>\nfunction f() { transition(n); }`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("§14.12.6.3");
  });
});

// s475-boot-pending-cells (slice S4) flipped the pin: a waiting initializer on a `(not to T)` cell is a
// pending cell, BUILT (§13.9.2 — pending-cells-s475.test.js grades it end to end).
describe("S4: a waiting initializer is a pending cell (§13.9.1; was the S4 pin — E-BOOTSTRAP-UNSUPPORTED)", () => {
  const SRC = `<program db="./app.db">
let <u:int=1/>
function cnt(id: int) -> int {
  const r = ?{\`SELECT count(*) AS n FROM t WHERE id = \${id}\`}.get() !{ _ :> { return 0; } };
  return 1;
}
let <m:(not to int)=(cnt(@u) !{ _ :> not })/>
<main><p>x</p></main>
</program>
`;
  // r1 F1 (red on 91e235c2c: E-VALUE-SERVER-CALL with §13.7's fix — §13.9.1: "A `(not to T)`-declared
  // cell initializer is no longer E-VALUE-SERVER-CALL")
  test("it compiles — no E-VALUE-SERVER-CALL (§13.9.1), no refusal (S4 built)", () => {
    expect(codes(SRC)).toEqual([]);
  });
  test("the same initializer on a `T | not` cell keeps E-VALUE-SERVER-CALL (§13.9.1: no marker, no pending)", () => {
    expect(codes(SRC.replace("(not to int)", "int | not"))).toEqual(["E-VALUE-SERVER-CALL"]);
  });
  test("a DERIVED `(not to T)` cell that waits keeps E-VALUE-SERVER-CALL (§13.9.1: a derived cell cannot be a pending cell; ruling S475 item 7)", () => {
    expect(codes(SRC.replace("let <m:", "<m:"))).toEqual([U, "E-VALUE-SERVER-CALL"]);
  });
});

// r1 F3 (red on 91e235c2c: a `)` inside `[…]` or a string closed the lifecycle early — E-PARSE-TAG
// cascades, and `int[(]` swallowed the markup to `</program>` (E-PARSE-CLOSER, E-PARSE-UNCLOSED))
describe("the opener's paren matcher skips `[…]` and strings: a malformed lifecycle swallows nothing", () => {
  test("`int[a)b]`", () => {
    const cs = codes(P(`let <m:(not to int[a)b])=not/>\n<p>after</p>`));
    expect(cs).toContain(U);
    expect(cs.some((c) => c.startsWith("E-PARSE-"))).toBe(false);
  });
  test("`int[(]` does not swallow the markup after it", () => {
    const cs = codes(P(`let <m:(not to int[(])=not/>\n<p>after</p>\nfunction f() -> int { return 1; }\n<p>z)</p>`));
    expect(cs.some((c) => c.startsWith("E-PARSE-"))).toBe(false);
    expect(cs).not.toContain("E-DECL-STATE-CHILD");
  });
  test("a `)` inside a string", () => {
    expect(codes(P(`let <m:(not to string(=="a)"))=not/>\n<p>after</p>`))).toEqual([U]);
  });
  test("an unclosed `[` falls back to the plain paren count (no longer swallow)", () => {
    const cs = codes(P(`let <m:(not to int[)=not/>\n<p>after</p>`));
    expect(cs).not.toContain("E-PARSE-UNCLOSED");
  });
});

describe("the s473 probes (docs/changes/s473-spec-coverage/probes/part-2/s14a/b3/)", () => {
  const PROBES = {
    // lc-cell names its cell `p` (E-DECL-ELEMENT-NAME-COLLIDES) and reads `.length` off a `string | not`
    "lc-cell": [`<program>\n    let <p:(not to string)=not/>\n    function f() -> int { return @p.length; }\n    <p>\${f()}</p>\n</program>`, ["E-DECL-ELEMENT-NAME-COLLIDES", U]],
    "lc-variant-cell": [`<program>\n    type Ph:enum = { Idle, Done }\n    let <p:(.Idle to .Done)=.Idle/>\n    <p>\${@p}</p>\n</program>`, [U, "E-DECL-ELEMENT-NAME-COLLIDES"]],
    "lc-legacy": [`<program>\n    type User:struct = { id: int, hash: (not -> string) }\n    <p>hi</p>\n</program>`, [U]],
    "lc-param": [`<program>\n    type User:struct = { id: int }\n    function f(u: (not to User)) -> int { return u.id; }\n    <p>hi</p>\n</program>`, [U, U]],
  };
  for (const [name, [src, want]] of Object.entries(PROBES)) {
    test(name + ": no parse cascade", () => {
      const cs = codes(src);
      expect(cs).toEqual(want);
      expect(cs.some((c) => c.startsWith("E-PARSE-"))).toBe(false);
    });
  }
});
