// channel-pacing-s478.test.js — s478-ruled-channel-hard fix r1 (review of PR #1942).
//
//   A. MED-3 (§38.4.3 "A conforming client paces its frames to the bound; an honest client SHALL
//      NOT be closed by it"): `channelPacer` (runtime.js) — a mirror token bucket that queues
//      rather than sends past the bound, supersedes a queued `replace` of a cell by a later one,
//      and sends every other op in order; the client desc carries the bounds; through the real
//      client runtime and a real relay, a 200-append burst loses nothing and a 60 / 120 Hz
//      `replace` stays connected.
//   B. MED-3a ("A relay close is reported"): a 1008 / 1009 close is reported, naming the code
//      and the reason.
//   C. LOW-4 (§38.4.3 "answered `503 Service Unavailable` before the upgrade"): racing upgrades
//      past the cap are answered 503, never admitted and then closed (the old 1013 path).
//   D. LOW-5: Bun's `maxPayloadLength` is the largest frame bound + 1, not 4×.
//
// RED ON BASE (92088f2f8): A (no pacer; the burst lost 100 of 200, 120 Hz closed at ~1.6 s),
// B (onclose ignored the code), C (an accepted upgrade was not counted until its `open`, so racers past the cap got 101), D (maxPayloadLength 262144).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mods, artifacts, loadServer } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import * as rt from "../slice-m1/runtime/runtime.js";

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
const CELLS = `  let <count:int=0/>\n  <xs:string[free, append]=[]/>`;
const src = (chAttrs = "", progAttrs = "") => prog(`<channel name="chat"${chAttrs}>\n${CELLS}\n</channel>\n<p>\${@count}</p>`, progAttrs);
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function build(s) {
  const r = frontEnd(mods(), [{ path: "app.scrml", src: s }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  return { r, ...artifacts(r.core) };
}

async function served(s) {
  const { r, server, client } = build(s);
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (x) => logs.push(x) });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, sv) => srv.fetch(req, sv), websocket: srv.websocket });
  return { srv, bun, base: `127.0.0.1:${bun.port}`, logs, client };
}

// The client artifact's `rt.channel(program$.scope, {…})` desc, rebuilt over test cells.
function descFactory(clientJs) {
  const line = clientJs.split("\n").find((l) => l.startsWith("rt.channel(program$.scope, "));
  const lit = line.slice("rt.channel(program$.scope, ".length, -2).replace(/program\$\.fields\[(\d+) \/\* (\w+) \*\/\]/g, (_, i, name) => `fields[${JSON.stringify(name)}]`);
  return (init) => {
    const fields = {};
    for (const [k, v] of Object.entries(init)) fields[k] = rt.cell(v);
    return { desc: new Function("rt", "fields", `return (${lit});`)(rt, fields), fields };
  };
}

// A client page: rt.channel over its own cells, against the served relay.
function live(mk) {
  const scope = rt.root.child();
  const { desc, fields } = mk({ count: 0, xs: [] });
  rt.channel(scope, desc);
  return { scope, fields };
}

async function until(pred, ms) {
  const t0 = performance.now();
  while (!pred() && performance.now() - t0 < ms) await tick(50);
  return pred();
}

// Captures the runtime's channel reports (console.error) for one test.
function captureReports() {
  const got = [];
  const prev = console.error;
  console.error = (m) => got.push(String(m));
  return { got, restore: () => { console.error = prev; } };
}

describe("A — §38.4.3 client pacing (MED-3)", () => {
  // A fake clock and timer queue: `advance(ms)` runs every timer due.
  function fakeIo() {
    let t = 0;
    let timers = [];
    const sent = [];
    const io = {
      now: () => t,
      later: (f, ms) => { const h = { f, at: t + ms }; timers.push(h); return h; },
      cancel: (h) => { timers = timers.filter((x) => x !== h); },
      send: (text) => sent.push(text),
    };
    const advance = (ms) => {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const h = timers[0];
        if (h === undefined || h.at > end) break;
        timers.shift();
        t = h.at;
        h.f();
      }
      t = end;
    };
    return { io, sent, advance, pending: () => timers.length };
  }

  test("a burst past the bucket is queued, not sent past it, and drains in order at (under) the rate", () => {
    const { io, sent, advance } = fakeIo();
    const p = rt.channelPacer({ rate: 50, burst: 100 }, io);
    p.open();
    for (let i = 0; i < 200; i++) expect(p.push("xs", "append", "a" + i)).toBe(true);
    // the margin: the client's bucket holds burst less 5% (95), so bunched frames still find a relay token
    expect(sent.length).toBe(95);
    expect(p.pending()).toBe(105);
    advance(1000);
    expect(sent.length).toBeLessThanOrEqual(95 + 48);           // refilled at 95% of 50/s
    expect(sent.length).toBeGreaterThanOrEqual(95 + 46);
    advance(5000);
    expect(sent).toEqual(Array.from({ length: 200 }, (_, i) => "a" + i));   // every op, in order
    expect(p.pending()).toBe(0);
  });

  test("the paced frames never overdraw a relay bucket of the same bounds (the server's takeToken model)", () => {
    const { io, advance } = fakeIo();
    let tokens = 20; let at = 0; let overdrawn = 0;
    const relay = () => {
      const t = io.now();
      tokens = Math.min(20, tokens + ((t - at) * 10) / 1000); at = t;
      if (tokens < 1) overdrawn++; else tokens -= 1;
    };
    const p = rt.channelPacer({ rate: 10, burst: 20 }, { ...io, send: relay });
    p.open();
    for (let i = 0; i < 300; i++) { p.push("count", "transition", "v" + i); if (i % 7 === 0) advance(13); }
    advance(60000);
    expect(overdrawn).toBe(0);
  });

  test("a queued `replace` of a cell is superseded by a later `replace` of it (last value wins); other ops are kept", () => {
    const { io, sent, advance } = fakeIo();
    const p = rt.channelPacer({ rate: 1, burst: 1 }, io);
    p.open();
    p.push("count", "replace", "c1");                          // sent: the one token
    p.push("count", "replace", "c2");
    p.push("xs", "append", "x1");
    p.push("count", "replace", "c3");                          // supersedes c2
    p.push("note", "replace", "n1");
    p.push("count", "replace", "c4");                          // supersedes c3
    p.push("xs", "append", "x2");
    expect(sent).toEqual(["c1"]);
    expect(p.pending()).toBe(4);
    advance(10000);
    expect(sent).toEqual(["c1", "x1", "n1", "c4", "x2"]);
  });

  test("a close drops (and counts) the queue; nothing is queued while closed; a new connection starts a full bucket", () => {
    const { io, sent, advance, pending } = fakeIo();
    const p = rt.channelPacer({ rate: 1, burst: 3 }, io);
    p.open();
    for (let i = 0; i < 6; i++) p.push("xs", "append", "a" + i);
    expect(sent.length).toBe(2);                                // burst 3 less 5% (rounded up) = 2
    expect(p.close()).toBe(4);
    expect(pending()).toBe(0);                                  // the drain timer is cancelled
    expect(p.push("xs", "append", "z")).toBe(false);
    advance(10000);
    expect(sent.length).toBe(2);
    p.open();
    p.push("xs", "append", "b0"); p.push("xs", "append", "b1");
    expect(sent.slice(2)).toEqual(["b0", "b1"]);
  });

  test("the client desc carries the channel's resolved bounds (defaults, and the overrides)", () => {
    expect(build(src()).client.js).toContain("limits: { maxFrame: 65536, rate: 50, burst: 100 }");
    expect(build(src(" frame-rate=7", " channel-max-frame=1024 channel-frame-burst=11")).client.js).toContain("limits: { maxFrame: 1024, rate: 7, burst: 11 }");
  });

  for (const N of [101, 150, 200]) {
    test(`an honest burst: ${N} appends in one handler reach every client, and the sender stays connected`, async () => {
      const { bun, base, client, logs } = await served(src());
      const prevLoc = globalThis.location;
      globalThis.location = { protocol: "http:", host: base };
      const cap = captureReports();
      try {
        const mk = descFactory(client.js);
        const A = live(mk), B = live(mk), C = live(mk);
        await tick(300);
        for (let i = 0; i < N; i++) rt.append(A.fields.xs, "m" + i);
        const ok = await until(() => B.fields.xs.peek().length === N && C.fields.xs.peek().length === N, 8000);
        expect(ok).toBe(true);
        expect(B.fields.xs.peek()).toEqual(A.fields.xs.peek());
        expect(logs.join("\n")).not.toContain("rate limit");
        expect(cap.got).toEqual([]);
        A.scope.dispose(); B.scope.dispose(); C.scope.dispose();
      } finally { cap.restore(); globalThis.location = prevLoc; bun.stop(true); }
    }, 60000);
  }

  for (const [hz, attrs, ms] of [[120, "", 3000], [60, " frame-rate=20 frame-burst=20", 2500]]) {
    test(`a continuous ${hz} Hz \`replace\` (a drag bound to a channel cell${attrs}) stays connected and converges`, async () => {
      const { bun, base, client, logs } = await served(src(attrs));
      const prevLoc = globalThis.location;
      globalThis.location = { protocol: "http:", host: base };
      const cap = captureReports();
      try {
        const mk = descFactory(client.js);
        const A = live(mk), B = live(mk);
        await tick(300);
        let v = 0;
        const t0 = performance.now();
        await new Promise((res) => {
          const iv = setInterval(() => {
            if (performance.now() - t0 > ms) { clearInterval(iv); res(); return; }
            A.fields.count.set(++v);
          }, 1000 / hz);
        });
        expect(await until(() => B.fields.count.peek() === v, 3000)).toBe(true);
        expect(logs.join("\n")).not.toContain("closed a connection");
        expect(cap.got).toEqual([]);
        A.scope.dispose(); B.scope.dispose();
      } finally { cap.restore(); globalThis.location = prevLoc; bun.stop(true); }
    }, 60000);
  }
});

describe("B — a relay close is reported (MED-3a)", () => {
  // A stand-in WebSocket the test drives.
  class FakeSocket {
    static last = null;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.last = this; }
    send(t) { this.sent.push(t); }
    close() { this.readyState = 3; }
  }
  for (const [code, reason, want] of [[1008, "frames faster than the channel's rate limit (50/s, burst 100)", "rate limit"], [1009, "a frame over 65536 bytes", "frame-size bound"]]) {
    test(`a ${code} close names the code and the reason; a dropped queue is counted`, () => {
      const prevWs = globalThis.WebSocket, prevLoc = globalThis.location;
      globalThis.WebSocket = FakeSocket;
      globalThis.location = { protocol: "http:", host: "x.test" };
      const cap = captureReports();
      try {
        const scope = rt.root.child();
        const fields = { count: rt.cell(0) };
        rt.channel(scope, { name: "chat", reconnect: 0, limits: { maxFrame: 65536, rate: 1, burst: 1 },
          cells: [{ key: "count", cell: fields.count, table: null, ops: ["replace"], edges: null }], open: null, close: null, error: null });
        const s = FakeSocket.last;
        s.readyState = 1; s.onopen();
        expect(cap.got).toEqual([]);
        s.readyState = 3; s.onclose({ code, reason, wasClean: true });
        expect(cap.got.length).toBe(1);
        expect(cap.got[0]).toContain(String(code));
        expect(cap.got[0]).toContain(reason);
        expect(cap.got[0]).toContain(want);
        scope.dispose();
      } finally { cap.restore(); globalThis.WebSocket = prevWs; globalThis.location = prevLoc; }
    });
  }

  test("a conforming client never sends a frame over the frame-size bound: the edit is reported, not sent, and the socket stays open", () => {
    const prevWs = globalThis.WebSocket, prevLoc = globalThis.location;
    globalThis.WebSocket = FakeSocket;
    globalThis.location = { protocol: "http:", host: "x.test" };
    const cap = captureReports();
    try {
      const scope = rt.root.child();
      const note = rt.cell("");
      rt.channel(scope, { name: "chat", reconnect: 0, limits: { maxFrame: 300, rate: 50, burst: 100 },
        cells: [{ key: "note", cell: note, table: { defs: [], root: { k: "str" } }, ops: ["replace"], edges: null }], open: null, close: null, error: null });
      const s = FakeSocket.last;
      s.readyState = 1; s.onopen();
      s.onmessage({ data: '{"__type":"__replay","__complete":true,"__seq":0,"__frames":[]}' });   // #1941: live after the replay
      rt.batch(() => note.set("x".repeat(100)));
      rt.batch(() => note.set("€".repeat(90)));             // under 300 characters, over 300 bytes
      expect(s.sent.length).toBe(1);
      expect(cap.got.length).toBe(1);
      expect(cap.got[0]).toContain("300-byte frame-size bound");
      scope.dispose();
    } finally { cap.restore(); globalThis.WebSocket = prevWs; globalThis.location = prevLoc; }
  });

  test("a normal close (1000 / 1006) is not reported as a relay close", () => {
    const prevWs = globalThis.WebSocket, prevLoc = globalThis.location;
    globalThis.WebSocket = FakeSocket;
    globalThis.location = { protocol: "http:", host: "x.test" };
    const cap = captureReports();
    try {
      const scope = rt.root.child();
      rt.channel(scope, { name: "chat", reconnect: 0, limits: null, cells: [], open: null, close: null, error: null });
      const s = FakeSocket.last;
      s.readyState = 1; s.onopen();
      s.readyState = 3; s.onclose({ code: 1006, reason: "", wasClean: false });
      expect(cap.got).toEqual([]);
      scope.dispose();
    } finally { cap.restore(); globalThis.WebSocket = prevWs; globalThis.location = prevLoc; }
  });
});

describe("C, D — the relay: the cap is reserved before the upgrade (LOW-4); the host cap is the bound + 1 (LOW-5)", () => {
  test("60 racing upgrades against max-subscribers=5: exactly 5 admitted, every other one answered 503 (none admitted then closed)", async () => {
    const { bun, base, logs } = await served(src(" max-subscribers=5"));
    try {
      const results = await Promise.all(Array.from({ length: 60 }, () => new Promise((res) => {
        const ws = new WebSocket(`ws://${base}/_scrml_ws/chat`);
        let opened = false;
        ws.onopen = () => { opened = true; setTimeout(() => res({ ws, opened, closed: null }), 300); };
        ws.onclose = (ev) => res({ ws, opened, closed: ev.code });
        ws.onerror = () => {};
      })));
      expect(results.filter((x) => x.opened && x.closed === null).length).toBe(5);
      expect(results.filter((x) => x.opened && x.closed !== null)).toEqual([]);   // no 101-then-1013
      expect(logs.join("\n")).not.toContain("subscriber cap");
      for (const x of results) if (x.opened) x.ws.close();
    } finally { bun.stop(true); }
  });

  test("the place is reserved AT the upgrade: an upgrade accepted before its `open` runs still counts (red on 92088f2f8: all three got 101)", async () => {
    const { srv, bun, base } = await served(src(" max-subscribers=2"));
    try {
      const req = () => new Request(`http://${base}/_scrml_ws/chat`, { headers: { Upgrade: "websocket", Connection: "Upgrade" } });
      const host = { upgrade: () => true };                    // a host that accepts, `open` not yet run
      expect(await srv.fetch(req(), host)).toBe(undefined);
      expect(await srv.fetch(req(), host)).toBe(undefined);
      expect((await srv.fetch(req(), host)).status).toBe(503);
    } finally { bun.stop(true); }
  });

  test("a failed upgrade frees its place", async () => {
    const { srv, bun, base } = await served(src(" max-subscribers=1"));
    try {
      const req = () => new Request(`http://${base}/_scrml_ws/chat`, { headers: { Upgrade: "websocket", Connection: "Upgrade" } });
      expect((await srv.fetch(req(), { upgrade: () => false })).status).toBe(400);
      expect((await srv.fetch(req(), { upgrade: () => { throw new Error("host"); } }).catch(() => ({ status: "threw" }))).status).not.toBe(undefined);
      const ws = new WebSocket(`ws://${base}/_scrml_ws/chat`);
      expect(await new Promise((res) => { ws.onopen = () => res(true); ws.onerror = () => res(false); })).toBe(true);
      ws.close();
    } finally { bun.stop(true); }
  });

  test("a frame far over the bound is dropped unread (the host's cap): the sender is closed and nothing is relayed", async () => {
    const { bun, base } = await served(src());
    try {
      const open = () => new Promise((res) => {
        const ws = new WebSocket(`ws://${base}/_scrml_ws/chat`);
        const got = []; let closed = null;
        ws.onmessage = (ev) => got.push(String(ev.data));
        ws.onclose = (ev) => { closed = ev.code; };
        ws.onopen = () => res({ ws, got, closed: () => closed });
      });
      const a = await open(), b = await open();
      a.ws.send(JSON.stringify({ __type: "__sync", __key: "count", __op: "replace", __val: "x".repeat(300000) }));
      await tick(300);
      expect([1006, 1009]).toContain(a.closed());
      expect(b.got.filter((t) => !t.startsWith('{"__type":"__replay"'))).toEqual([]);   // #1941: the replay is not a relayed frame
      b.ws.close();
    } finally { bun.stop(true); }
  });

  test("maxPayloadLength is the largest channel frame bound + 1", async () => {
    const a = await served(src());
    try { expect(a.srv.websocket.maxPayloadLength).toBe(65537); } finally { a.bun.stop(true); }
    const b = await served(src("", " channel-max-frame=100000"));
    try { expect(b.srv.websocket.maxPayloadLength).toBe(100001); } finally { b.bun.stop(true); }
  });
});
