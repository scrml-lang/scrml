// placement-not-waiting-s480.test.js — s480-runtime item 24 (g-placement-only-helper-always-async-peer-s466).
//
// Ruling (user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B", item 24):
//   "placement only helper always async (g-placement-only-helper-always-async-peer-s466) — Rec (PERMANENT,
//    newly-accepting): placement does not make a function waiting; a helper with no suspension point is
//    emitted synchronously and is legal in a parameter default (§13.9.6)."
//
// The BOOTSTRAP already holds this (measured S480 on base 8e6144bfc — this file is a pin, green on base):
// print-server.scrml decides nothing about waiting — a function is `async` iff Core says it waits (a
// Suspend in its body, check.scrml C-S8) — so a helper reached only from a server function is printed as a
// plain `function`, called without `await`, and gets no route. (The "parameter default" half has no
// bootstrap form: the bootstrap reads no parameter defaults — g-boot-param-default-and-rest-s473.) The
// open half is impl#1's (always an async peer with a route) — carried, impl#1 frozen.
// Interaction: the S480 waiting-helper server copy (#2000) — a helper that DOES wait keeps its async copy.

import { describe, test, expect, beforeAll } from "bun:test";
import { mods, artifacts } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 300000 });

const SQ = "?" + "{";
const ROW = `const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return 0; } };`;
const P = (decls) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
${decls}
    <w:(not to int)=(top(1) !{ _ :> not })/>
    <main>
        <p id="w" if=@w>\${@w}</p>
    </main>
</program>
`;
const build = (src) => {
  const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  return artifacts(r.core);
};

describe("§13.2 / §12.2 (S479 item 24): placement does not make a function waiting", () => {
  test("a helper only a server function calls, with no suspension point: a plain `function`, called without `await`, no route", () => {
    const { server, client } = build(P(`    function twice(n: int) -> int {
        return n * 2;
    }
    function top(n: int) -> int {
        ${ROW}
        return twice(n) + u.id;
    }`));
    expect(server.refused).toEqual([]);
    expect(server.js).toMatch(/\n\s*function twice\(/);
    expect(server.js).not.toMatch(/async function twice\(/);
    expect(server.js).not.toMatch(/await twice\(/);
    expect(server.js).toMatch(/twice\(n_\d+\)/);
    expect(server.js).not.toContain('fn: "twice"');
    expect(client.js).not.toContain("route$twice");
  });

  test("a helper that DOES wait (it runs a query) stays `async` and awaited where a server function calls it", () => {
    const { server } = build(P(`    function look(n: int) -> int {
        ${ROW}
        return u.id + n;
    }
    function top(n: int) -> int {
        ${ROW}
        return look(n) + u.id;
    }`));
    expect(server.refused).toEqual([]);
    expect(server.js).toMatch(/async function look\(/);
    expect(server.js).toMatch(/await look\(/);
  });
});
