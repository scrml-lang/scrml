// channel-served-s478.test.js — s478-boot-channel: SPEC §38 `<channel>`, the emitted halves SERVED.
//
//   C. the server half — the program is compiled from source, its server artifact printed
//      (print-server.scrml) and loaded, and served by a real Bun.serve with the artifact's own
//      `fetch` and `websocket` handlers (§38.8); real WebSocket clients connect to it. §38.4 relay;
//      the negative probes (malformed frame, wrong type, unknown cell, unknown channel, size);
//      §40.2 cross-origin refusal.
//   D. the client half — runtime.js `channel`, the call the client artifact prints (print.scrml
//      channelBoot): two clients' cells synchronized through the served route.
//
// RED ON BASE: every test (on base a `<channel>` was E-BOOTSTRAP-UNSUPPORTED and there was no
// channel runtime).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mods, artifacts, loadServer } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import * as rt from "../slice-m1/runtime/runtime.js";

// A real server and real sockets need Bun's own `Response` / `WebSocket`: a page environment
// (happy-dom) another test file in this process registered replaces both globals. It is lifted
// for this file and put back after it.
let pageEnv = false;
beforeAll(async () => {
  if (GlobalRegistrator.isRegistered) {
    pageEnv = true;
    await GlobalRegistrator.unregister();
  }
  mods();
}, { timeout: 300000 });
afterAll(() => { if (pageEnv) GlobalRegistrator.register(); });

const prog = (body, attrs = "") => `<program${attrs}>\n${body}\n</program>\n`;
const chan = (attrs, body) => `<channel ${attrs}>\n${body}\n</channel>`;
const SYNC = prog(`${chan(`name="chat"`, `  let <count:int=0/>\n  let <note:string=""/>\n  function bump() { @count = @count + 1; }`)}\n<p>\${@count} \${@note}</p>\n<button onclick=bump()>+</button>`);

async function served(src) {
  const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  const { client, server } = artifacts(r.core);
  expect(client.refused).toEqual([]);
  expect(server.refused).toEqual([]);
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (s) => logs.push(s) });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, s) => srv.fetch(req, s), websocket: srv.websocket });
  return { client, server, srv, bun, base: `127.0.0.1:${bun.port}`, logs };
}

// A raw WebSocket client: resolves on open (rejects when the upgrade is refused); records frames and the close.
// S478 open-Qs items 50–51 (§38.4.2): the relay's first message is the `__replay` of its frame log
// (kept in `replays`); every relayed frame carries `__seq` and `__own` — `frames` keeps them whole,
// `got` keeps the relayed edit without them (what the earlier tests assert about the payload).
function connect(base, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}${path}`, { headers });
    const got = [];
    const frames = [];
    const replays = [];
    let closed = null;
    ws.onmessage = (ev) => {
      const v = JSON.parse(String(ev.data));
      if (v.__type === "__replay") { replays.push(v); return; }
      frames.push(v);
      const { __seq, __own, ...edit } = v;
      got.push(edit);
    };
    ws.onclose = (ev) => { closed = { code: ev.code, reason: ev.reason }; };
    ws.onopen = () => resolve({ ws, got, frames, replays, closed: () => closed });
    ws.onerror = () => reject(new Error("refused"));
  });
}
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const sync = (key, val, op = "replace") => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val });

describe("C — the server half: the upgrade route on the program's own fetch (§38.8, §40.2)", () => {
  test("the server artifact mounts `/_scrml_ws/<name>` and lists it in its manifest; each cell's §57 table is the client's", async () => {
    const { client, server, bun } = await served(SYNC);
    try {
      expect(server.js).toContain(`channels: [{ path: "/_scrml_ws/chat" }]`);
      expect(server.js).toContain(`rt.channel(channel$0)`);
      expect(server.js).toContain(`{ key: "count", table: { defs: [], root: { k: "int" } }, ops: ["replace"], edges: null, init: 0 }`);
      expect(client.js).toContain(`rt.channel(program$.scope, { name: "chat", reconnect: 2000, limits: { maxFrame: 65536, rate: 50, burst: 100 }, cells: [{ key: "count", cell: program$.fields[`);
      expect(client.js).toContain(`table: { defs: [], root: { k: "int" } }, ops: ["replace"], edges: null }`);
    } finally { bun.stop(true); }
  });

  // S478 open-Qs ruling (user-voice), item 50 — §38.4.2: "relayed RE-ENCODED from the decoded payload
  // to EVERY subscriber of the channel, its sender included" with "`__own`: `true` on the copy sent
  // to the frame's sender". RED ON b04fdc27a: the sender got nothing back and no frame had `__seq`.
  test("§38.4.2: a client's __sync is relayed to EVERY subscriber, the sender included (`__own`), numbered, re-encoded", async () => {
    const { bun, base } = await served(SYNC);
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      const b = await connect(base, "/_scrml_ws/chat");
      await tick();
      a.ws.send(sync("count", 7));
      a.ws.send(sync("note", "hi"));
      await tick();
      expect(b.frames).toEqual([{ __type: "__sync", __seq: 1, __key: "count", __op: "replace", __val: 7, __own: false }, { __type: "__sync", __seq: 2, __key: "note", __op: "replace", __val: "hi", __own: false }]);
      expect(a.frames).toEqual([{ __type: "__sync", __seq: 1, __key: "count", __op: "replace", __val: 7, __own: true }, { __type: "__sync", __seq: 2, __key: "note", __op: "replace", __val: "hi", __own: true }]);
      // each connection's first message was the (empty) replay of the frame log
      expect(a.replays).toEqual([{ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] }]);
      expect(b.replays).toEqual([{ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] }]);
      a.ws.close();
      b.ws.close();
    } finally { bun.stop(true); }
  });

  // the negative probes: each malformed frame closes the SENDER's connection and reaches no one
  const BAD = [
    ["a frame that is not JSON", "{nope", 1007],
    ["a JSON array", "[1,2]", 1008],
    ["an unknown __type", JSON.stringify({ __type: "__rpc", __key: "count", __op: "replace", __val: 1 }), 1008],
    ["an extra key", JSON.stringify({ __type: "__sync", __key: "count", __op: "replace", __val: 1, x: 1 }), 1008],
    ["a missing __val", JSON.stringify({ __type: "__sync", __key: "count", __op: "replace" }), 1008],
    ["the pre-§38.4.2 whole-value frame (no __op)", JSON.stringify({ __type: "__sync", __key: "count", __val: 1 }), 1008],
    ["an op the cell does not sync (`append` of an int)", sync("count", 1, "append"), 1008],
    ["an unknown op", sync("count", 1, "splice"), 1008],
    ["a non-string op", JSON.stringify({ __type: "__sync", __key: "count", __op: 1, __val: 1 }), 1008],
    ["a key the channel does not declare", sync("secret", 1), 1008],
    ["`__proto__` as the key", JSON.stringify({ __type: "__sync", __key: "__proto__", __op: "replace", __val: 1 }), 1008],
    ["`constructor` as the key", sync("constructor", 1), 1008],
    ["a wrong type (a string for an int cell)", sync("count", "7"), 1007],
    ["a non-integer for an int cell", sync("count", 1.5), 1007],
    ["an object for a string cell", sync("note", { a: 1 }), 1007],
    // one byte over the bound: read and closed 1009 (S478 fix r1: a frame past the host's cap of
    // bound + 1 is dropped unread instead — 1006 — see channel-pacing-s478.test.js)
    ["a frame over the size bound", sync("note", "x".repeat(65537 - sync("note", "").length)), 1009],
  ];
  for (const [what, frame, code] of BAD) {
    test(`fail closed: ${what} → the connection is closed (${code}) and nothing is relayed`, async () => {
      const { bun, base, logs } = await served(SYNC);
      try {
        const a = await connect(base, "/_scrml_ws/chat");
        const b = await connect(base, "/_scrml_ws/chat");
        await tick();
        a.ws.send(frame);
        await tick(150);
        expect(b.got).toEqual([]);
        expect(a.closed()?.code).toBe(code);
        expect(logs.join("\n")).toContain("closed a connection");
        b.ws.close();
      } finally { bun.stop(true); }
    });
  }

  test("an unknown channel path is 404; a non-GET is 405; a GET without `Upgrade: websocket` is 426 — none upgrades", async () => {
    const { bun, base } = await served(SYNC);
    try {
      expect((await fetch(`http://${base}/_scrml_ws/other`)).status).toBe(404);
      expect((await fetch(`http://${base}/_scrml_ws/chat`, { method: "POST" })).status).toBe(405);
      expect((await fetch(`http://${base}/_scrml_ws/chat`)).status).toBe(426);
      await expect(connect(base, "/_scrml_ws/other")).rejects.toThrow();
    } finally { bun.stop(true); }
  });

  // s478 #1928 fix r1 (LOW-1): the Origin check is the first answer on the channel prefix —
  // 403 before 404 (unknown channel), 405 (non-GET) and 426 (no Upgrade)
  test("refusal order on `/_scrml_ws/`: 403 (cross Origin) before 404 / 405 / 426", async () => {
    const { srv, bun, base } = await served(SYNC);
    try {
      const st = async (path, method, origin) => (await srv.fetch(new Request(`http://${base}${path}`, { method, headers: { Origin: origin } }), null)).status;
      expect(await st("/_scrml_ws/chat", "POST", "https://evil.example")).toBe(403);
      expect(await st("/_scrml_ws/other", "GET", "https://evil.example")).toBe(403);
      expect(await st("/_scrml_ws/chat", "GET", "https://evil.example")).toBe(403);
      expect(await st("/_scrml_ws/other", "GET", `http://${base}`)).toBe(404);
      expect(await st("/_scrml_ws/chat", "POST", `http://${base}`)).toBe(405);
      expect(await st("/_scrml_ws/chat", "GET", `http://${base}`)).toBe(426);
    } finally { bun.stop(true); }
  });

  // s478 #1928 fix r1 (MED-1): `/_scrml_ws` is the compiler's channel mount (§38.1: "a
  // server-side upgrade route at `/_scrml_ws/<name>`") — an `<endpoint>` under it is refused at
  // compile time, and a program with no channel does not intercept the prefix at all.
  test("P-endpoint-under-ws-prefix: an `<endpoint>` under `/_scrml_ws` is refused at compile time", () => {
    const FSP = `type FspMethod:enum = {\n  FleetStatus\n  DeltaSince(seq: int)\n}`;
    for (const path of ["/_scrml_ws/hook", "/_scrml_ws", "/_scrml_ws/"]) {
      const src = prog(`${FSP}\n<endpoint path="${path}" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <DeltaSince(seq) : { since: seq }>\n</endpoint>`);
      const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
      const es = r.diags.filter((d) => d.severity === "Error");
      expect(es.length).toBe(1);
      expect(es[0].code).toBe("E-ENDPOINT-ROUTE-DUPLICATE");   // §61.7 reserved prefix (S478 open-Qs ruling item 34)
      expect(es[0].message).toContain("`/_scrml_ws/` is where the compiler mounts its channels");
    }
  });
  test("a program with no channel does not intercept `/_scrml_ws/` (no Origin / 405 answer there)", async () => {
    const FSP = `type FspMethod:enum = {\n  FleetStatus\n}`;
    const src = prog(`${FSP}\n<endpoint path="/hook" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n</endpoint>`);
    const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const { server } = artifacts(r.core);
    expect(server.js).not.toContain("A program with a §38 channel");   // LOW-7: the channel sentence only with a channel
    const mod = await loadServer(server.js, r.core);
    const srv = mod.createServer({ root: "/tmp", log: () => {} });
    const res = await srv.fetch(new Request("http://127.0.0.1:1/_scrml_ws/x", { method: "POST", headers: { Origin: "https://evil.example" } }), null);
    expect(res.status).toBe(404);
  });

  test("§40.2: a cross-origin handshake is refused 403 before the upgrade; `Origin: null` too; the server's own origin and no Origin are accepted", async () => {
    const { srv, bun, base } = await served(SYNC);
    try {
      const up = async (origin, extra = {}) => {
        const h = { Upgrade: "websocket", Connection: "Upgrade", ...extra };
        if (origin !== undefined) h.Origin = origin;
        let upgraded = false;
        const fake = { upgrade: () => { upgraded = true; return true; } };
        const res = await srv.fetch(new Request(`http://${base}/_scrml_ws/chat`, { headers: h }), fake);
        return { status: res === undefined ? 101 : res.status, upgraded };
      };
      expect(await up("https://evil.example")).toEqual({ status: 403, upgraded: false });
      expect(await up(`http://127.0.0.1:${bun.port + 1}`)).toEqual({ status: 403, upgraded: false });
      expect(await up("null")).toEqual({ status: 403, upgraded: false });
      expect(await up(`http://${base}`)).toEqual({ status: 101, upgraded: true });
      expect(await up(undefined)).toEqual({ status: 101, upgraded: true });
      // "an `https` origin SHALL be accepted on a request that arrived as plain `http`"
      expect(await up(`https://${base}`)).toEqual({ status: 101, upgraded: true });
      // the proxy's X-Forwarded-Host / -Proto name the origin compared against
      expect(await up("https://app.example", { "X-Forwarded-Host": "app.example", "X-Forwarded-Proto": "https" })).toEqual({ status: 101, upgraded: true });
      expect(await up("http://app.example", { "X-Forwarded-Host": "app.example", "X-Forwarded-Proto": "https" })).toEqual({ status: 403, upgraded: false });
      // "Default ports compare equal to their omitted form"
      expect(await up("https://app.example:443", { "X-Forwarded-Host": "app.example", "X-Forwarded-Proto": "https" })).toEqual({ status: 101, upgraded: true });
      // a real cross-origin handshake never opens
      await expect(connect(base, "/_scrml_ws/chat", { Origin: "https://evil.example" })).rejects.toThrow();
    } finally { bun.stop(true); }
  });

  test("two channels naming one topic= never exchange frames (each publishes on its own [name, topic] key)", async () => {
    const two = prog(`${chan(`name="a" topic="lobby"`, `  let <count:int=0/>`)}\n${chan(`name="b" topic="lobby"`, `  let <count2:int=0/>`)}\n<p>\${@count}\${@count2}</p>`);
    const { bun, base } = await served(two);
    try {
      const a1 = await connect(base, "/_scrml_ws/a");
      const a2 = await connect(base, "/_scrml_ws/a");
      const b1 = await connect(base, "/_scrml_ws/b");
      await tick();
      a1.ws.send(sync("count", 3));
      await tick();
      expect(a2.got).toEqual([{ __type: "__sync", __key: "count", __op: "replace", __val: 3 }]);
      expect(b1.got).toEqual([]);
      // channel b does not accept channel a's cell
      b1.ws.send(sync("count", 3));
      await tick(150);
      expect(b1.closed()?.code).toBe(1008);
      a1.ws.close();
      a2.ws.close();
    } finally { bun.stop(true); }
  });

  test("a program without a channel answers no `/_scrml_ws/` route (no server half is invented)", async () => {
    const r = frontEnd(mods(), [{ path: "app.scrml", src: prog(`let <n:int=0/>\n<p>\${@n}</p>`) }], "app.scrml");
    expect(artifacts(r.core).server.js).toBe("");
  });

  test("a `watches=` feed is refused by name at emit (its LISTEN bridge is not built)", () => {
    const src = prog(`<schema>\n  orders {\n    id: integer primary key\n  }\n</schema>\n<channel name="f" watches=orders>\n  <onchange>\n    <_ : print("x")>\n  </onchange>\n</channel>`, ` db="postgres://localhost/app"`);
    const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const { client, server } = artifacts(r.core);
    expect(client.refused.join("\n")).toContain("`watches=orders` change feed");
    expect(server.refused.join("\n")).toContain("`watches=orders` change feed");
  });
});

describe("D — the client half (runtime.js `channel`, the call the client artifact prints)", () => {
  // Two clients in one process: each its own scope and cell, as two browser tabs have; the
  // page location they connect through is the served one's.
  const INT = { defs: [], root: { k: "int" } };
  async function twoClients() {
    const s = await served(SYNC);
    const saved = globalThis.location;
    globalThis.location = { protocol: "http:", host: s.base };
    const mk = () => {
      const scope = rt.root.child();
      const cell = rt.cell(0);
      const hooks = { opens: 0, closes: 0 };
      rt.channel(scope, { name: "chat", reconnect: 0, cells: [{ key: "count", cell, table: INT, ops: ["replace"], edges: null }],
        open: () => { hooks.opens++; }, close: () => { hooks.closes++; }, error: null });
      return { scope, cell, hooks };
    };
    const a = mk();
    const b = mk();
    await tick(200);
    return { a, b, base: s.base, done: () => { a.scope.dispose(); b.scope.dispose(); globalThis.location = saved; s.bun.stop(true); } };
  }

  test("§38.4: a write to a channel cell reaches the other client's cell; onclient:open ran (§38.10)", async () => {
    const t = await twoClients();
    try {
      expect(t.a.hooks.opens).toBe(1);
      expect(t.b.hooks.opens).toBe(1);
      rt.batch(() => t.a.cell.set(5));
      await tick(200);
      expect(t.b.cell.peek()).toBe(5);
      rt.batch(() => t.b.cell.set(9));
      await tick(200);
      expect(t.a.cell.peek()).toBe(9);
    } finally { t.done(); }
  });

  // s478 #1928 fix r1 (HIGH-1): a `replace`-granted tape is still synced end to end — compiled
  // from source (the cell's table is the one the client artifact prints), two clients.
  test("a `replace`-granted tape cell syncs end to end (compiled from source)", async () => {
    const src = prog(`${chan(`name="tl"`, `  <xs:string[free, replace]=([])/>`)}\n<p>\${@xs.length}</p><button onclick={ @xs = ["a"]; }>a</button>`);
    const s = await served(src);
    expect(s.client.js).toContain(`{ key: "xs", cell: program$.fields[`);
    const table = { defs: [], root: { k: "seq", elem: { k: "str" }, bound: { k: "free" } } };
    expect(s.server.js).toContain(`{ key: "xs", table: { defs: [], root: { k: "seq", elem: { k: "str" }, bound: { k: "free" } } }, ops: ["replace"], edges: null, init: [] }`);
    const saved = globalThis.location;
    globalThis.location = { protocol: "http:", host: s.base };
    const mk = () => {
      const scope = rt.root.child();
      const cell = rt.cell([]);
      rt.channel(scope, { name: "tl", reconnect: 0, cells: [{ key: "xs", cell, table, ops: ["replace"], edges: null }], open: null, close: null, error: null });
      return { scope, cell };
    };
    const a = mk();
    const b = mk();
    try {
      await tick(200);
      rt.batch(() => a.cell.set(["one", "two"]));
      await tick(200);
      expect(b.cell.peek()).toEqual(["one", "two"]);
    } finally { a.scope.dispose(); b.scope.dispose(); globalThis.location = saved; s.bun.stop(true); }
  });

  test("a value just applied from the wire is not sent back (no echo storm)", async () => {
    const t = await twoClients();
    try {
      const raw = await connect(t.base, "/_scrml_ws/chat");
      await tick();
      rt.batch(() => t.a.cell.set(4));
      await tick(200);
      // the raw peer saw a's one write — b applied it and did not re-send it
      expect(raw.got).toEqual([{ __type: "__sync", __key: "count", __op: "replace", __val: 4 }]);
      raw.ws.close();
    } finally { t.done(); }
  });

  test("disposing the scope (teardown) closes the socket: no hook runs in the torn-down program, nothing more is synced", async () => {
    const t = await twoClients();
    try {
      t.a.scope.dispose();
      await tick(200);
      expect(t.a.hooks.closes).toBe(0);
      rt.batch(() => t.a.cell.set(77));
      await tick(200);
      expect(t.b.cell.peek()).toBe(0);
    } finally { t.done(); }
  });
});
