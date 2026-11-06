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
// pre-transition read rule (E-TYPE-001, §13.9.3 / §14.12.3) is slice S1, a waiting initializer
// (a pending cell, §13.9.1) is slice S4 and still gives E-VALUE-SERVER-CALL here (pinned below).

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

describe("a `(not to T)` cell behaves exactly as a `T | not` cell (INTERIM until S1)", () => {
  // same length spellings, so every span — and so the Core — lines up
  const pair = (body) => [body.replaceAll("(not to int)", "int  |   not"), body];
  const BODIES = {
    writes: `let <m:(not to int)=not/>\nfunction f() { @m = 5; }\nfunction g() { @m = "x"; }\nfunction h() { @m = not; }\nfunction k() -> int { return @m + 1; }`,
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

describe("S4 pin: a waiting initializer is NOT a pending cell yet (§13.9.1, slice S4 flips this)", () => {
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
  test("E-VALUE-SERVER-CALL, exactly as an undeclared cell", () => expect(codes(SRC)).toEqual(["E-VALUE-SERVER-CALL"]));
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
