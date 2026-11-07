// literal-carriers-s475.test.js — s475-boot-literal-carriers: THE LITERAL READING of §19.9.5 transport
// carriers. Every client `!` function that MAKES a server call is a transport carrier — even when it handles
// that call fully (`!{}` with every arm, a `match`) — so its failure set is always `E + Transport` and its
// callers' handlers cover `Transport` (or `_`). #1797 built the narrow reading (only a `?` on a server call
// seeded a carrier).
//
// Governing text:
//   Owner ruling, user-voice-scrml.md "⭐ RULED — S475 second batch of owner questions, PA recs adopted
//   wholesale (S475, 2026-11-07)" item 2: "**§19.9.5 transport carriers: the LITERAL reading.** Every client
//   `!` function that makes a server call is a transport carrier (stable failure set, even when the call is
//   fully handled), not only those that `?`-propagate one. #1797 landed the narrow reading; it is to be
//   widened".
//   SPEC §19.9.5: "Its client call fails with the §19.9.10 failure set: the function's declared error
//   variants, if it is declared `!`, plus `Transport(t: ServerCallError)`".
//
// ⚑ PA reading (g-boot-transport-carrier-dead-question-seeds-s475): a server call in unreachable code (after a
// `return` / `fail` / `break` / `continue` of its block) is never MADE, so it seeds nothing.
//
// RED on base (origin/main 95c63e4d7): the fully-handled shapes below compiled with a caller handler that
// omits `Transport`, and a `.Transport` arm at such a caller was E-TYPE-VARIANT.

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 300000 });

const SQ = "?" + "{";
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const codes = (src) => errs(src).map((x) => x.split(":")[0]);

const S = `    server function s(x: int)! E {
        if (x < 0) fail E.Bad;
        ${SQ}\`INSERT INTO log (a) VALUES (\${x})\`}.run() !{ _ :> { return 0; } };
        return x;
    }
`;
const P = (fns, handler, enumDecl = "type E:enum = { Bad }") => `<program db="./app.db">
    let <r:int=0/>
    ${enumDecl}
${fns}    <main>
        <button id="go" onclick={ ${handler} }>go</button>
    </main>
</program>
`;

// each `f` makes ONE server call and handles it fully; `if (x == 0) fail E.Bad` is its own failure
const SHAPES = {
  "guard with every arm": `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        const v: int = s(x) !{ .Bad :> 0, .Transport(t) :> 1 };
        return v + 1;
    }
`,
  "guard with `_`": `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        const v: int = s(x) !{ _ :> 0 };
        return v + 1;
    }
`,
  "the call inside an `if` block": `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        let v: int = 0;
        if (x > 2) {
            v = s(x) !{ _ :> 0 };
        }
        return v + 1;
    }
`,
};

for (const [name, F] of Object.entries(SHAPES)) {
  describe("a client `! E` function that fully handles its server call is a carrier — " + name, () => {
    test("its caller's handler must cover `Transport`: E-TYPE-080 names `E + Transport` (RED on base: compiled)", () => {
      const e = errs(P(S + F, `@r = f(5) !{ .Bad :> 8 };`));
      expect(e.length).toBe(1);
      expect(e[0]).toContain("E-TYPE-080");
      expect(e[0]).toContain("E + Transport");
    });
    test("a `.Transport` arm at the caller is valid (RED on base: E-TYPE-VARIANT), and `_` covers it", () => {
      expect(errs(P(S + F, `@r = f(5) !{ .Transport(t) :> 7, .Bad :> 8 };`))).toEqual([]);
      expect(errs(P(S + F, `@r = f(5) !{ _ :> 8 };`))).toEqual([]);
    });
  });
}

describe("a `match` on the server call", () => {
  const F = `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        const v: int = match s(x) {
            .Ok(n) :> n,
            _ e :> 0,
        };
        return v + 1;
    }
`;
  test("makes the function a carrier too (RED on base: compiled; `.Transport` was E-TYPE-VARIANT)", () => {
    expect(codes(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toEqual(["E-TYPE-080"]);
    expect(errs(P(S + F, `@r = f(5) !{ .Transport(t) :> 7, .Bad :> 8 };`))).toEqual([]);
  });
});

// The seeding walks the composition fold (cfStmts): a server call in a `for` head's init and one in a
// handler's BLOCK arm are found. Both shapes are refused on their own today (a waiting call there needs a
// continuation — E-BOOTSTRAP-UNSUPPORTED); the carrier's `E + Transport` is reported at the caller as well.
describe("the seeding reaches a `for` init and a handler's block arm", () => {
  test("a server call in a `for` init seeds the carrier", () => {
    const F = `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        let n: int = 0;
        for (let i: int = s(x) !{ _ :> 0 }; i < 3; i = i + 1) {
            n = n + i;
        }
        return n;
    }
`;
    expect(codes(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toContain("E-TYPE-080");
    expect(codes(P(S + F, `@r = f(5) !{ .Transport(t) :> 7, .Bad :> 8 };`))).not.toContain("E-TYPE-080");
  });
  test("a server call in a nested handler's block arm seeds the carrier", () => {
    const F = `    function loc(x: int)! E {
        if (x == 1) fail E.Bad;
        return x;
    }
    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        const v: int = loc(x) !{ _ :> { return s(x) !{ _ :> 0 }; } };
        return v + 1;
    }
`;
    expect(codes(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toContain("E-TYPE-080");
    expect(codes(P(S + F, `@r = f(5) !{ .Transport(t) :> 7, .Bad :> 8 };`))).not.toContain("E-TYPE-080");
  });
});

describe("transitively: a client caller `?`-propagating a carrier is one; one HANDLING it is not", () => {
  const F = SHAPES["guard with `_`"];
  test("`?` on the carrier's call: the outer caller covers `Transport`", () => {
    const G = `    function g(x: int)! E {
        const v: int = f(x)?;
        return v + 10;
    }
`;
    expect(codes(P(S + F + G, `@r = g(5) !{ .Bad :> 8 };`))).toEqual(["E-TYPE-080"]);
    expect(errs(P(S + F + G, `@r = g(5) !{ .Transport(t) :> 7, .Bad :> 8 };`))).toEqual([]);
  });
  test("handling the carrier's call is not a server call: its callers owe no `Transport`", () => {
    const H = `    function g(x: int)! E {
        if (x == 0) fail E.Bad;
        const v: int = f(x) !{ _ :> 0 };
        return v + 10;
    }
`;
    expect(errs(P(S + F + H, `@r = g(5) !{ .Bad :> 8 };`))).toEqual([]);
  });
});

describe("⚑ a server call in unreachable code is never made: no carrier (g-boot-transport-carrier-dead-question-seeds-s475)", () => {
  test("a `?` after `return`: no E-ERROR-010 at the dead `?`, and the caller owes no `Transport` (RED on base: E-TYPE-080)", () => {
    const F = `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        return 1;
        const v: int = s(x)?;
    }
`;
    expect(errs(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toEqual([]);
  });
  test("a handled call after `fail` inside a block: no carrier", () => {
    const F = `    function f(x: int)! E {
        if (x == 0) {
            fail E.Bad;
            const v: int = s(x) !{ _ :> 0 };
        }
        return 1;
    }
`;
    expect(errs(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toEqual([]);
  });
  test("the same call where it can run IS a carrier", () => {
    const F = `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        const v: int = s(x) !{ _ :> 0 };
        return 1;
    }
`;
    expect(codes(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toEqual(["E-TYPE-080"]);
  });
});

describe("a server function is not a carrier, and a client `!` function with no server call is not one", () => {
  test("a client `! E` function with no server call: its callers owe no `Transport`", () => {
    const F = `    function f(x: int)! E {
        if (x == 0) fail E.Bad;
        return x;
    }
`;
    expect(errs(P(S + F, `@r = f(5) !{ .Bad :> 8 };`))).toEqual([]);
  });
  test("an enum already declaring `Transport(t: ServerCallError)` is unchanged (that IS the set; no re-run needed)", () => {
    const F = SHAPES["guard with `_`"];
    expect(errs(P(S + F, `@r = f(5) !{ .Transport(t) :> 7, .Bad :> 8 };`, "type E:enum = { Bad, Transport(t: ServerCallError) }"))).toEqual([]);
    expect(codes(P(S + F, `@r = f(5) !{ .Bad :> 8 };`, "type E:enum = { Bad, Transport(t: ServerCallError) }"))).toEqual(["E-TYPE-080"]);
  });
});
