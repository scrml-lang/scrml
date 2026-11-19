// waiting-helper-server-copy-s479.test.js — lane s479-waiting-helper-server-copy
// (g-boot-waiting-helper-server-copy-s479, filed by #1978). A client-placed helper that WAITS (its body
// makes a client call of a server function) and that a server-side body also calls gets a SERVER COPY:
// the same source, lowered under its own server-side plan, its server calls made in place.
//
// Governing sentences:
//   §12.2 Trigger 5: "A function with at least one client-classified caller SHALL remain ambient
//     (client-classified)."
//   §13.4: "The callee SHALL NOT generate an additional HTTP route when called from a server-escalated
//     caller. The compiler SHALL inline the callee's logic into the caller's generated server handler."
//     … "the compiler SHALL generate TWO representations of B: one inlined version (used by A's server
//     handler) and one fetch-based route handler (used by client call sites of B). These are independent
//     code paths."
//   §19.9.10 "Not affected": "A server→server call. A call whose caller is itself server-placed runs in
//     the same server handler: the callee is inlined (§13.4), no request is made, and nothing on the wire
//     can fail. Its failure set is the callee's own — none for a function not declared `!`."
//
// RED ON MAIN: every test — on main the server caller's call of the helper was refused
// (E-BOOTSTRAP-UNSUPPORTED "a second, server-side copy of `…`", INTERIM g-boot-waiting-helper-server-copy-s479).

import { describe, test, expect, beforeAll } from "bun:test";
import { mods, artifacts, realDb, serve, post, pathOf } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 300000 });

const SQ = "?" + "{";
const USER = `    type User:struct = { id: int, name: string }`;
const ROW = `const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };`;
const P = (decls, main) => `<program db="./app.db">\n${USER}\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");

// `k` → `h` → the db-touching server function `down`; the pending cell `v` (a client caller) keeps both
// helpers client-placed; the server function `top` calls `k` too.
const CHAIN = P(`    function down(n: int) -> int {
        ${ROW}
        return u.id + n;
    }
    function h(n: int) -> int {
        const d = down(n) !{ _ :> 0 };
        return d + 1;
    }
    function k(n: int) -> int {
        return h(n) * 10;
    }
    function top(n: int) -> int {
        ${ROW}
        return k(n) + u.id;
    }
    <v:(not to int)=(k(1))/>
    <w:(not to int)=(top(1) !{ _ :> not })/>`, `        <p id="v" if=@v>\${@v}</p>\n        <p id="w" if=@w>\${@w}</p>`);

// `pick` handles the `!` server function `look` with its own `.Gone` arm and the client call's `.Transport`.
const BANG = P(`    type LookError:enum = {
        Gone
    }
    function look(n: int)! LookError {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { fail .Gone; } };
        if (n < 0) fail .Gone;
        return u.id + n;
    }
    function pick(n: int) -> int {
        const r = look(n) !{
            .Gone :> -1,
            .Transport(t) :> -2
        };
        return r * 10;
    }
    function srv(n: int) -> int {
        ${ROW}
        return pick(n) + pick(-1) + u.id;
    }
    <v:(not to int)=(pick(2))/>
    <w:(not to int)=(srv(3) !{ _ :> not })/>`, `        <p id="v" if=@v>\${@v}</p>`);

// The server-side body of the function printed `async function <name>_<n>(` — a copy's minted name.
const copyBody = (js, name) => {
  const m = new RegExp(`async function ${name}_\\d+\\(`).exec(js);
  if (!m) return null;
  const rest = js.slice(m.index);
  const end = rest.indexOf("\n  }\n");
  return rest.slice(0, end + 4);
};

describe("the server copy is built and the server callers name it (§13.4, §19.9.10)", () => {
  test("a chain of waiting helpers: each gets one server copy; no diagnostic; Core well-formed", () => {
    const r = run(CHAIN);
    expect(errs(r)).toEqual([]);
    expect(r.typed.tables.server.copies.map((c) => c.orig.hint).sort()).toEqual(["h", "k"]);
    expect(mods().check.checkCore(r.core)).toEqual([]);
  });

  test("the copies are server-only: no route, not in the client artifact; the server callers call them in place", () => {
    const r = run(CHAIN);
    const { client, server } = artifacts(r.core);
    expect(client.refused).toEqual([]);
    expect(server.refused).toEqual([]);
    // no route for a copy (only the server functions the client calls)
    expect(server.routes.map((x) => x.fn).sort()).toEqual(["down", "top"]);
    // the client artifact keeps the helpers as they were (their call of `down` a client call) and holds no copy
    expect(client.js).toMatch(/function h\(task\$, n\)/);
    expect(client.js).toContain("rt.call(route$down");
    expect(client.js).not.toMatch(/function [hk]_\d+\(/);
    // the server artifact: `top` calls `k`'s copy, which calls `h`'s copy, which calls `down` in place
    const k1 = copyBody(server.js, "k");
    const h1 = copyBody(server.js, "h");
    expect(k1).not.toBeNull();
    expect(h1).not.toBeNull();
    expect(server.js).toMatch(/await k_\d+\(n_\d+\)/);
    expect(k1).toMatch(/await h_\d+\(/);
    expect(h1).toMatch(/await down\(n\)/);
    for (const b of [k1, h1]) expect(b).not.toContain("rt.call(");
  });

  test("`!{}` on a callee not declared `!` is the bare call in the copy (its failure set is the callee's own — none)", () => {
    const h1 = copyBody(artifacts(run(CHAIN).core).server.js, "h");
    expect(h1).not.toContain("rt.failed(");
  });

  test("a `!` callee: the copy keeps the callee's own arm and drops the `.Transport` arm", () => {
    const r = run(BANG);
    expect(errs(r)).toEqual([]);
    const { client, server } = artifacts(r.core);
    expect(server.refused).toEqual([]);
    const p1 = copyBody(server.js, "pick");
    expect(p1).not.toBeNull();
    expect(p1).toContain("\"Gone\"");
    expect(p1).not.toContain("Transport");
    expect(p1).toMatch(/await look\(n\)/);
    expect(server.routes.map((x) => x.fn).sort()).toEqual(["look", "srv"]);
    // the client's `pick` still handles both (the client call's failure set carries `.Transport`)
    expect(client.js).toContain("Transport");
  });
});

describe("SERVED: the server function runs the helper in place (no route, no request)", () => {
  test("POST `top` → k(1) + 1 = (down(1) + 1) * 10 + 1 = 31; the copies are never routes", async () => {
    const r = run(CHAIN);
    expect(errs(r)).toEqual([]);
    const sql = await realDb(["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"], { users: [{ id: 1, name: "a" }] });
    const { srv, routes } = await serve(r.core, sql);
    const res = await post(srv, pathOf(routes, "top"), [1]);
    expect(res.status).toBe(200);
    expect(res.json).toBe(31);
    expect(() => pathOf(routes, "k")).toThrow();
    expect(() => pathOf(routes, "h")).toThrow();
  });

  test("POST `srv` → pick(3) + pick(-1) + 1 = 40 - 10 + 1 = 31 (`.Gone` reaches its arm on the server)", async () => {
    const r = run(BANG);
    const sql = await realDb(["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"], { users: [{ id: 1, name: "a" }] });
    const { srv, routes } = await serve(r.core, sql);
    const res = await post(srv, pathOf(routes, "srv"), [3]);
    expect(res.status).toBe(200);
    expect(res.json).toBe(31);
  });
});

describe("a `!` copy's transaction envelope (§8.9.2)", () => {
  const BANG_HELPER = (callers) => P(`    type PE:enum = {
        Neg
    }
    function down(n: int) -> int {
        ${ROW}
        return u.id + n;
    }
    function h(n: int)! PE {
        if (n < 0) fail .Neg;
        const d = down(n) !{ _ :> 0 };
        return d + 1;
    }
${callers}`, `        <p id="v" if=@v>\${@v}</p>`);

  test("a `!` helper a server function calls directly: its copy runs in its own envelope; served", async () => {
    const r = run(BANG_HELPER(`    function top(n: int) -> int {
        ${ROW}
        const x = h(n) !{ _ :> 5 };
        return x + u.id;
    }
    <v:(not to int)=(h(1) !{ _ :> not })/>
    <w:(not to int)=(top(1) !{ _ :> not })/>`));
    expect(errs(r)).toEqual([]);
    const h1 = copyBody(artifacts(r.core).server.js, "h");
    expect(h1).toContain("rt.envelope(");
    const sql = await realDb(["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"], { users: [{ id: 1, name: "a" }] });
    const { srv, routes } = await serve(r.core, sql);
    expect((await post(srv, pathOf(routes, "top"), [1])).json).toBe(4);    // h(1) = down(1) + 1 = 3; + 1
    expect((await post(srv, pathOf(routes, "top"), [-1])).json).toBe(6);   // h(-1) fails `.Neg` → 5; + 1
  });

  test("a `!` helper reached only through another copy: refused by name, fail closed (INTERIM g-boot-server-copy-bang-envelope-s479)", () => {
    const r = run(BANG_HELPER(`    function k(n: int) -> int {
        return h(n) !{ _ :> 7 };
    }
    function top(n: int) -> int {
        ${ROW}
        return k(n) + u.id;
    }
    <v:(not to int)=(k(1))/>
    <w:(not to int)=(top(1) !{ _ :> not })/>`));
    const es = errs(r);
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(es[0].message).toContain("g-boot-server-copy-bang-envelope-s479");
  });
});

describe("the helper's diagnostics are reported once, not once per copy", () => {
  test("a refused wait in the helper's `defer` body: one report at the site (the copy's planning adds none)", () => {
    const src = P(`    function down(n: int) -> int {
        ${ROW}
        return u.id + n;
    }
    function h(n: int) -> int {
        defer { const q = down(n) !{ _ :> 0 }; }
        const d = down(n) !{ _ :> 0 };
        return d + 1;
    }
    function top(n: int) -> int {
        ${ROW}
        return h(n) + u.id;
    }
    <v:(not to int)=(h(1))/>
    <w:(not to int)=(top(1) !{ _ :> not })/>`, `        <p id="v" if=@v>\${@v}</p>`);
    const es = errs(run(src));
    const at = src.indexOf("down(n) !{ _ :> 0 }; }");
    const sites = es.map((d) => `${d.code}@${d.span.start}`);
    expect(new Set(sites).size).toBe(sites.length);
    // the two reports: the defer body's wait, and the `defer` in a function that waits — no server-copy refusal
    expect(es.length).toBe(2);
    expect(es.filter((d) => d.span.start === at).length).toBe(1);
    expect(es.some((d) => d.message.includes("server-side copy"))).toBe(false);
  });
});
