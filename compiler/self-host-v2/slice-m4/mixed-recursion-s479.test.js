// mixed-recursion-s479.test.js — s479 lane s479-mixed-recursion (g-boot-mixed-recursion-escalation-s479,
// filed by review #1966). Placement over a call graph with cycles, and the client referrer a
// `<request>` body is.
//
// Governing sentences:
//   §31.2 (S479): "A cycle of calls between functions — direct recursion, or mutual recursion such as two
//     server functions that call each other (§13.4) — is recursion, not a dependency cycle. The compiler
//     SHALL NOT reject it."
//   §12.2 Trigger 5: "A function with no direct triggers (1-4) and no capture-taint, called only from
//     server-classified callers and never from a client-classified function, SHALL escalate to server by
//     inheritance. A function with at least one client-classified caller SHALL remain ambient
//     (client-classified)."
//   §19.9.10 scope item 2: "The call is evaluated on the client: … in a lifecycle body (…) or a
//     `<request>` body" — and a pending cell's load IS a `<request>` (§13.9.2).
//
// The defect: a `<request>` body (an author's, or the compiler-written half of a pending cell) was no
// referrer at all in the Trigger-5 computation, so a helper its load called that a server function
// ALSO called was placed by inheritance — a false E-ERROR-013 ("server→server") on the helper's handled
// server call, and a load lowered as a ServerCall of a function that is no server function
// (E-BOOTSTRAP-CORE-ILL-FORMED, C-R2 / C-S3 / C-S7).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const SQ = "?" + "{";
const USER = `    type User:struct = { id: int, name: string }`;
const P = (decls, main = `        <p id="v" if=@v>\${@v}</p>`) => `<program db="./app.db">\n${USER}\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
const DOWN_BACK = `    function down(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        if (n <= 0) { return u.id; }
        return step(n - 1);
    }`;
const fnInfo = (r, name) => r.typed.tables.fns.find((f) => f.name === name);
const placeOf = (r, name) => {
  const p = r.typed.tables.server.places.find((x) => x.name === name);
  return p && (p.place.variant || p.place);
};
const inherited = (r, name) => r.typed.tables.server.inherited.includes(fnInfo(r, name).sym.id);
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (r) => errs(r).map((d) => d.code);

describe("a pending cell's load is a client referrer (§12.2 Trigger 5, §19.9.10 item 2)", () => {
  test("the #1966 probe (handled): `step` stays client-placed — no false E-ERROR-013, no ill-formed Core; `down`'s call runs `step`'s server copy (s479-waiting-helper-server-copy)", () => {
    const r = run(P(`    function step(n: int) -> int {
        if (n <= 0) { return 0; }
        const d = down(n - 1) !{ _ :> 0 };
        return 1 + d;
    }
${DOWN_BACK}
    let <v:(not to int)=(step(4))/>`));
    expect(placeOf(r, "step")).toBe("Ambient");
    expect(inherited(r, "step")).toBe(false);
    expect(placeOf(r, "down")).toBe("Server");
    expect(codes(r)).not.toContain("E-ERROR-013");
    expect(codes(r)).not.toContain("E-BOOTSTRAP-CORE-ILL-FORMED");
    expect(codes(r)).toEqual([]);
    const cp = r.typed.tables.server.copies.map((c) => c.orig.hint);
    expect(cp).toEqual(["step"]);
  });

  test("the #1966 probe (unhandled): `step`'s call of `down` is a CLIENT call — E-ERROR-002, naming the pending cell as the cause (§19.9.10 F5)", () => {
    const src = P(`    function step(n: int) -> int {
        if (n <= 0) { return 0; }
        return 1 + down(n - 1);
    }
${DOWN_BACK}
    let <v:(not to int)=(step(4))/>`);
    const r = run(src);
    expect(placeOf(r, "step")).toBe("Ambient");
    const d = errs(r).find((x) => x.code === "E-ERROR-002");
    expect(d).toBeDefined();
    const line = src.split("\n").findIndex((l) => l.includes("let <v:")) + 1;
    expect(d.message).toContain("`step()` is client-placed because the initializer of `@v` calls it (t.scrml:" + line + ")");
    expect(codes(r)).not.toContain("E-BOOTSTRAP-CORE-ILL-FORMED");
  });

  test("not a cycle defect: an acyclic helper the pending cell AND a server function call is client-placed", () => {
    const r = run(P(`    function h(n: int) -> int {
        const d = down(n) !{ _ :> 0 };
        return 1 + d;
    }
    function down(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        return u.id + n;
    }
    function other(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        return h(n) + u.id;
    }
    let <v:(not to int)=(h(4))/>`, `        <p id="v" if=@v>\${@v}</p>\n        <button onclick={ const r = other(1) !{ _ :> 0 }; }>x</button>`));
    expect(placeOf(r, "h")).toBe("Ambient");
    expect(inherited(r, "h")).toBe(false);
    expect(codes(r)).not.toContain("E-ERROR-013");
    expect(codes(r)).toEqual([]);
    expect(r.typed.tables.server.copies.map((c) => c.orig.hint)).toEqual(["h"]);
  });
});

describe("an author's `<request>` body is a client referrer too", () => {
  test("a helper the load calls and a server function calls is client-placed (not inherited)", () => {
    const r = run(P(`    let <uid:int=1/>
    let <v:int=0/>
    function pick(id: int) -> int {
        return down(id) !{ .Transport(t) :> 0 };
    }
    function down(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        if (n <= 0) { return u.id; }
        return pick(n - 1);
    }
    <request id="r">\${ @v = pick(@uid); }</request>`));
    expect(placeOf(r, "pick")).toBe("Ambient");
    expect(inherited(r, "pick")).toBe(false);
    expect(codes(r)).not.toContain("E-ERROR-013");
    expect(codes(r)).not.toContain("E-BOOTSTRAP-CORE-ILL-FORMED");
  });
});

describe("cycles that place as a fixed point (§12.2 Trigger 5 — the greatest fixpoint) keep compiling", () => {
  const clean = (src) => {
    const r = run(src);
    expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    return r;
  };

  test("mixed 2-cycle, the plain function called only by the server one: inherited, both calls in place", () => {
    const r = clean(P(`${DOWN_BACK}
    function step(n: int) -> int {
        if (n <= 0) { return 0; }
        return 1 + down(n - 1);
    }
    <v:(not to int)=(down(4) !{ _ :> not })/>`));
    expect(inherited(r, "step")).toBe(true);
    expect(placeOf(r, "down")).toBe("Server");
  });

  test("mixed 3-cycle (server → plain → plain → server): both plain functions inherited", () => {
    const r = clean(P(`    function down(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        if (n <= 0) { return u.id; }
        return a(n - 1);
    }
    function a(n: int) -> int { return 10 + b(n); }
    function b(n: int) -> int {
        if (n <= 0) { return 0; }
        return 100 + down(n - 1);
    }
    <v:(not to int)=(down(2) !{ _ :> not })/>`));
    expect(inherited(r, "a")).toBe(true);
    expect(inherited(r, "b")).toBe(true);
  });

  test("server ↔ server mutual recursion and server self-recursion", () => {
    clean(P(`    function even(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        if (n <= 0) { return u.id; }
        return odd(n - 1);
    }
    function odd(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        if (n <= 0) { return 0; }
        return even(n - 1);
    }
    function self(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        if (n <= 0) { return u.id; }
        return 1 + self(n - 1);
    }
    <v:(not to int)=(even(3) !{ _ :> not })/>
    <w:(not to int)=(self(3) !{ _ :> not })/>`, `        <p id="v" if=@v>\${@v}</p>\n        <p id="w" if=@w>\${@w}</p>`));
  });

  test("client ↔ client mutual recursion and a client self-recursive function calling the server", () => {
    const r = clean(P(`    function isEven(n: int) -> boolean {
        if (n <= 0) { return true; }
        return isOdd(n - 1);
    }
    function isOdd(n: int) -> boolean {
        if (n <= 0) { return false; }
        return isEven(n - 1);
    }
    function down(n: int) -> int {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };
        return u.id + n;
    }
    function walk(n: int) -> int {
        if (n <= 0) { return 0; }
        const d = down(n) !{ _ :> 0 };
        return d + walk(n - 1);
    }
    <v:(not to int)=(walk(3))/>
    let <e:boolean=false/>`, `        <p id="v" if=@v>\${@v}</p>\n        <button onclick={ @e = isEven(4); }>e</button>`));
    expect(placeOf(r, "walk")).toBe("Ambient");
    expect(inherited(r, "walk")).toBe(false);
    expect(inherited(r, "isEven")).toBe(false);
  });
});
