// channel-follow-s479.test.js — s479-channel-follow: the channel follow-ups to PR #1967.
//
//   A. a `replace` and the tape's length (brief item 1). The relay and every client judge a `replace`
//      by ONE rule (runtime.js `channelJudge`, after the canonical decode): a bounded tape's bound
//      (§66.12.2 "every value of the type has a length in the bound") is refused by the relay (1007,
//      relayed to no one) and by a receiver; a `T[replace]` tape with no length grant takes a value of
//      ANY length — exactly as the local write `@fx = [2, 5]` does (the bootstrap compiles it with no
//      check, and §6's `let <results:Item[replace]=[]/>` example relies on it). Whether a FIXED length
//      binds a `replace` is an owner question (g-boot-fixed-tape-replace-length-unruled-s479); these
//      tests pin that relay, client and local write agree today.
//   B. `__seen` (§38.4.2 "The frame", "The relay's fold"): every client frame names the last sequence
//      number its sender had applied; the relay closes (1008) the sender of a refused frame that no
//      frame relayed after its `__seen` can explain — on a busy channel too — and never an honest
//      client that lost a race (concurrent honest writers, live clients).
//   C. over a rate bound (§38.4.3): a frame past a bucket is refused UNREAD (`{__type, __why}`), the
//      client retires its oldest sent pending edit and slows down; only a further burst past the
//      connection's bucket closes; an address's bucket never closes (honest clients behind one NAT).
//   D. reconnect backoff (§38.7, ruled §3.B item 5): `reconnect=` is the initial delay, doubling with
//      ±20% jitter up to the 30 s cap, reset on open, `0` disables (a fake clock: captured timers).
//   E. `<program trusted-proxies=N>` (§40.2, ruled §3.B item 6, default 0): E-MW-009; the client
//      address is the Nth-from-last X-Forwarded-For entry (spoofed headers at N = 0 / 1 / 2).
//
// On the base (9c1c15487) B–E cannot pass by construction (not executed there: this file imports
// `channel-seen-harness.js`, new here): B — a frame with `__seen` was a shape the relay closed, and a
// forger on a busy channel stayed open; C — an over-budget frame closed its sender 1008; D — a fixed
// delay, no `channelBackoff`; E — `trusted-proxies=` was E-BOOTSTRAP-UNSUPPORTED, X-Forwarded-For was
// never read and X-Forwarded-Host's FIRST entry was trusted with no proxy declared. A pins behaviour
// the base already had.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mods, artifacts, loadServer } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { withSeen } from "./channel-seen-harness.js";
import * as rt from "../slice-m1/runtime/runtime.js";
import * as srt from "../slice-m1/runtime/server-runtime.js";

let pageEnv = false;
beforeAll(async () => {
  if (GlobalRegistrator.isRegistered) {
    pageEnv = true;
    await GlobalRegistrator.unregister();
  }
  mods();
}, { timeout: 300000 });
afterAll(() => { if (pageEnv) GlobalRegistrator.register(); });

const ADDRESS_HOOK = Symbol.for("scrml.test.channelAddress");
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const frame = (key, op, val) => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val });
const seenFrame = (key, op, val, seen) => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val, __seen: seen });
async function until(pred, ms = 3000) {
  for (let t = 0; t < ms / 20; t++) { if (pred()) return true; await tick(20); }
  return pred();
}

const APP = `<program__PROG__>
type Phase:enum = { Idle, Loading, Done }
<channel name="c"__ATTRS__>
  <ys:int[1..=3, append, pop]=([1])/>
  <fx:int[replace]=([1, 2, 3])/>
  <bx:int[2..=2, replace]=([1, 2])/>
  let <n:int=0/>
  <phase:Phase=.Idle single>
    <Idle rule=(.Loading | .Done)></>
    <Loading rule=(.Done | .Idle)></>
    <Done rule=.Idle></>
  </>
</channel>
<p>\${@ys.length} \${@fx.length} \${@bx.length} \${@n}</p>
</program>
`;
const EDGES = { Idle: ["Loading", "Done"], Loading: ["Done", "Idle"], Done: ["Idle"] };
const PHASE_EDGES = rt.edges(EDGES);
const init = () => ({ ys: [1], fx: [1, 2, 3], bx: [1, 2], n: 0, phase: "Idle" });
const app = (attrs = "", progAttrs = "") => APP.replace("__ATTRS__", attrs).replace("__PROG__", progAttrs);

const compiled = new Map();
function compile(src) {
  if (compiled.has(src)) return compiled.get(src);
  const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  const { client, server } = artifacts(r.core);
  expect(client.refused).toEqual([]);
  expect(server.refused).toEqual([]);
  compiled.set(src, { r, client, server });
  return compiled.get(src);
}

function descOf(clientJs) {
  const line = clientJs.split("\n").find((l) => l.startsWith("rt.channel(program$.scope, "));
  const lit = line.slice("rt.channel(program$.scope, ".length, -2)
    .replace(/program\$\.fields\[(\d+) \/\* (\w+) \*\/\]/g, (_, i, name) => `fields[${JSON.stringify(name)}]`)
    .replace(/program_phase_edges/g, "edges");
  return (fields) => new Function("fields", "edges", `return (${lit});`)(fields, rt.edges(EDGES));
}

// A served relay; `live()` a real rt.channel client; `raw()` a hand-written socket (`withSeen` adds the
// `__seen` a conforming client would send, unless the frame names its own).
async function world(src, host = {}) {
  const { r, client, server } = compile(src);
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (s) => logs.push(s), ...host });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, s) => srv.fetch(req, s), websocket: srv.websocket });
  const base = `127.0.0.1:${bun.port}`;
  const savedLoc = globalThis.location, savedWs = globalThis.WebSocket, savedErr = console.error;
  const errs = [];
  console.error = (m) => errs.push(String(m));
  globalThis.location = { protocol: "http:", host: base };
  const mk = descOf(client.js);
  const clients = [];
  const live = () => {
    const scope = rt.root.child();
    const cells = {};
    for (const [k, v] of Object.entries(init())) cells[k] = rt.cell(v);
    const hooks = { opens: 0, errors: 0 };
    const desc = mk(cells);
    desc.reconnect = 0;
    desc.open = () => { hooks.opens++; };
    desc.error = () => { hooks.errors++; };
    rt.channel(scope, desc);
    const X = { scope, cells, hooks, val: (k) => cells[k].peek(), state: () => JSON.stringify(Object.fromEntries(Object.keys(cells).map((k) => [k, cells[k].peek()]))) };
    clients.push(X);
    return X;
  };
  const raws = [];
  const raw = (headers) => new Promise((resolve, reject) => {
    const ws = withSeen(new savedWs(`ws://${base}/_scrml_ws/c`, headers === undefined ? undefined : { headers }));
    const got = [], replays = [], refusals = [];
    let closed = null;
    ws.onmessage = (ev) => {
      const v = JSON.parse(String(ev.data));
      if (v.__type === "__replay") replays.push(v);
      else if (v.__type === "__refused") refusals.push(v);
      else got.push(v);
    };
    ws.onclose = (ev) => { closed = { code: ev.code, reason: ev.reason }; };
    ws.onopen = () => { const R = { ws, got, replays, refusals, closed: () => closed }; raws.push(R); resolve(R); };
    ws.onerror = () => reject(new Error("refused"));
  });
  return {
    base, logs, errs, live, raw, srv,
    done: () => {
      for (const X of clients) X.scope.dispose();
      for (const R of raws) { try { R.ws.close(); } catch { /* closed */ } }
      globalThis.location = savedLoc; globalThis.WebSocket = savedWs; console.error = savedErr;
      bun.stop(true);
    },
  };
}

describe("A — a `replace` and the tape's length: relay, receivers and the local write judge alike", () => {
  test("a `replace` of a bounded tape outside its bound: the relay closes the sender 1007 and relays nothing", async () => {
    const w = await world(app());
    try {
      const obs = await w.raw();
      const evil = await w.raw();
      evil.ws.send(frame("bx", "replace", [7]));
      expect(await until(() => evil.closed() !== null)).toBe(true);
      expect(evil.closed().code).toBe(1007);
      await tick(100);
      expect(obs.got).toEqual([]);
    } finally { w.done(); }
  });

  test("the shared judge: a bounded `replace` outside the bound is refused (by the decode a receiver makes first); a `T[replace]` tape takes any length, as its local write does", () => {
    const { client } = compile(app());
    const cells = {};
    for (const [k, v] of Object.entries(init())) cells[k] = rt.cell(v);
    const desc = descOf(client.js)(cells);
    const bx = desc.cells.find((c) => c.key === "bx");
    const fx = desc.cells.find((c) => c.key === "fx");
    expect(rt.decode(bx.table, [7], { canonicalOnly: true }).ok).toBe(false);
    expect(rt.channelJudge(bx, [1, 2], "replace", [5, 6])).toBe(null);
    // the reading pinned (owner question g-boot-fixed-tape-replace-length-unruled-s479): no length grant
    // binds `replace` — the relay's fold and every receiver accept what the local `@fx = [2, 5]` writes
    expect(rt.channelJudge(fx, [1, 2, 3], "replace", [2, 5])).toBe(null);
    expect(srt.CHANNEL_FOLD_TEST.judge(fx, new srt.CHANNEL_FOLD_TEST.FoldTape([1, 2, 3]), "replace", [2, 5])).toBe(null);
  });
});

describe("B — `__seen`: a refused frame is closed unless an edit after `__seen` explains it (§38.4.2)", () => {
  test("a live client frames every edit with the last sequence number it applied", async () => {
    const w = await world(app());
    try {
      const A = w.live();
      const obs = await w.raw();
      await until(() => A.hooks.opens === 1);
      const P = await w.raw();
      P.ws.send(frame("n", "replace", 1));
      P.ws.send(frame("n", "replace", 2));
      await until(() => A.val("n") === 2);
      // its frame names __seen 2 (it applied P's two frames): a __seen the relay checks (a frame without
      // one, or with one past 2, would be closed 1008 — part B's last tests)
      rt.batch(() => A.cells.n.set(9));
      await until(() => obs.got.length === 3);
      expect(obs.got[2].__val).toBe(9);
      expect(w.logs.join("\n")).not.toContain("closed a connection");
    } finally { w.done(); }
  });

  test("a forger on a BUSY channel (others' frames relayed since its replay) is closed 1008 when its `__seen` is current", async () => {
    const w = await world(app());
    try {
      const P = await w.raw();
      const evil = await w.raw();
      P.ws.send(frame("n", "replace", 1));
      P.ws.send(frame("phase", "transition", "Done"));
      expect(await until(() => evil.got.length === 2)).toBe(true);
      evil.ws.send(frame("phase", "transition", "Loading"));   // .Done → .Loading: no edge; __seen 2
      expect(await until(() => evil.closed() !== null)).toBe(true);
      expect(evil.closed().code).toBe(1008);
      expect(evil.closed().reason).toContain("unexplained since __seen");
      await tick(100);
      expect(P.got.length).toBe(2);                            // relayed to no one
    } finally { w.done(); }
  });

  test("a refusal a concurrent edit explains is `__refused`, not a close; one the sender could have known about is closed", async () => {
    const w = await world(app());
    try {
      const P = await w.raw();
      const Q = await w.raw();
      P.ws.send(frame("ys", "append", 2));
      P.ws.send(frame("ys", "append", 3));
      expect(await until(() => Q.got.length === 2)).toBe(true);
      Q.ws.send(seenFrame("ys", "append", 9, 0));              // made before it saw P's two appends
      expect(await until(() => Q.refusals.length === 1)).toBe(true);
      expect(Q.closed()).toBe(null);
      Q.ws.send(seenFrame("ys", "append", 8, 2));              // made before it could read that refusal
      expect(await until(() => Q.refusals.length === 2)).toBe(true);
      expect(Q.closed()).toBe(null);
      P.ws.send(frame("n", "replace", 5));                     // seq 3: Q has now read both refusals
      expect(await until(() => Q.got.length === 3)).toBe(true);
      Q.ws.send(seenFrame("ys", "append", 7, 3));              // nothing after 3 explains it
      expect(await until(() => Q.closed() !== null)).toBe(true);
      expect(Q.closed().code).toBe(1008);
    } finally { w.done(); }
  });

  test("`__seen` is checked: missing, past the channel's last frame, or lower than the connection's previous one → 1008", async () => {
    const w = await world(app());
    try {
      const a = await w.raw();
      a.ws.send(JSON.stringify({ __type: "__sync", __key: "n", __op: "replace", __val: 1, __seen: "0" }));
      expect(await until(() => a.closed() !== null)).toBe(true);
      expect(a.closed().reason).toContain("__seen is not an int");
      const b = await w.raw();
      b.ws.send(seenFrame("n", "replace", 1, 5));
      expect(await until(() => b.closed() !== null)).toBe(true);
      expect(b.closed().reason).toContain("outside 0..=0");
      const c = await w.raw();
      c.ws.send(seenFrame("n", "replace", 1, 0));
      expect(await until(() => c.got.length === 1)).toBe(true);
      c.ws.send(seenFrame("n", "replace", 2, 1));
      expect(await until(() => c.got.length === 2)).toBe(true);
      c.ws.send(seenFrame("n", "replace", 3, 0));              // went back: no honest client does
      expect(await until(() => c.closed() !== null)).toBe(true);
      expect(c.closed().reason).toContain("outside 1..=2");
    } finally { w.done(); }
  });

  test("concurrent HONEST writers racing for a bound and a `rule=` graph are never closed, and converge", async () => {
    const w = await world(app());
    try {
      const L = [w.live(), w.live(), w.live()];
      await until(() => L.every((X) => X.hooks.opens === 1));
      for (let round = 0; round < 12; round++) {
        for (const [i, X] of L.entries()) {
          rt.batch(() => {
            const ys = X.val("ys");
            if (ys.length < 3 && (round + i) % 2 === 0) rt.appendWithin(X.cells.ys, round * 10 + i, 1, 3, "t");
            else if (ys.length > 1) rt.removeEndWithin(X.cells.ys, 1, 1, 3, "t");
            const ph = X.val("phase");
            const to = EDGES[ph][(round + i) % EDGES[ph].length];
            rt.transition(X.cells.phase, PHASE_EDGES, to);
            X.cells.n.set(round * 10 + i);
          });
        }
        await tick(15);
      }
      expect(await until(() => L.every((X) => X.state() === L[0].state()), 5000)).toBe(true);
      await tick(200);
      const errs = w.errs.join("\n");
      expect(errs).not.toContain("the relay closed this client's connection");
      expect(errs).not.toContain("closed the connection");
      expect(w.logs.join("\n")).not.toContain("closed a connection");
      const J = w.live();
      await until(() => J.hooks.opens === 1);
      expect(J.state()).toBe(L[0].state());
    } finally { w.done(); }
  }, 30000);
});

describe("C — over a rate bound: refused unread, the client slows down (§38.4.3)", () => {
  function standIn(cellsDesc, limits) {
    const saved = globalThis.WebSocket;
    const socks = [];
    globalThis.WebSocket = class { constructor() { this.readyState = 1; this.sent = []; this.closed = 0; socks.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() { this.closed++; } };
    const savedLoc = globalThis.location;
    globalThis.location = { protocol: "http:", host: "127.0.0.1:1" };
    const errs = [];
    const savedErr = console.error;
    console.error = (m) => errs.push(String(m));
    const scope = rt.root.child();
    try {
      rt.channel(scope, { name: "k", reconnect: 0, limits, cells: cellsDesc, open: null, close: null, error: null });
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; }
    const s = socks[0];
    s.onopen();
    return { sock: s, errs, raw: (v) => s.onmessage({ data: typeof v === "string" ? v : JSON.stringify(v) }), done: () => { console.error = savedErr; scope.dispose(); } };
  }
  const INT = { defs: [], root: { k: "int" } };

  test("the client retires its oldest SENT pending edit (not shown, reported) and empties its pacer's bucket", () => {
    const n = rt.cell(0);
    const c = standIn([{ key: "n", cell: n, table: INT, ops: ["replace"], edges: null }], { maxFrame: 65536, rate: 50, burst: 100 });
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => n.set(4));
      expect(c.sock.sent).toEqual([{ __type: "__sync", __key: "n", __op: "replace", __val: 4, __seen: 0 }]);
      c.raw({ __type: "__refused", __why: "over the rate limit of this connection's address" });
      expect(n.peek()).toBe(0);                               // not shown
      expect(c.errs.join("\n")).toContain("unread by the relay (over a rate bound");
      expect(c.sock.closed).toBe(0);
      rt.batch(() => n.set(5));                               // the bucket is empty: queued, not sent yet
      expect(c.sock.sent.length).toBe(1);
      expect(n.peek()).toBe(5);
    } finally { c.done(); }
  });

  test("a rate `__refused` with no sent pending edit is a broken stream", () => {
    const n = rt.cell(0);
    const c = standIn([{ key: "n", cell: n, table: INT, ops: ["replace"], edges: null }], null);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      c.raw({ __type: "__refused", __why: "x" });
      expect(c.sock.closed).toBe(1);
      expect(c.errs.join("\n")).toContain("a rate __refused with no sent pending edit");
    } finally { c.done(); }
  });

  test("honest clients behind ONE address (a NAT) past the address's bucket slow down: none is closed, all converge", async () => {
    const w = await world(app(" frame-rate=5 frame-burst=4"), { [ADDRESS_HOOK]: () => "10.9.9.9" });
    try {
      const L = [w.live(), w.live(), w.live(), w.live(), w.live(), w.live()];
      await until(() => L.every((X) => X.hooks.opens === 1));
      for (let k = 0; k < 4; k++) {
        for (const [i, X] of L.entries()) rt.batch(() => X.cells.n.set(k * 10 + i));
        await tick(30);
      }
      expect(await until(() => L.every((X) => X.state() === L[0].state()), 8000)).toBe(true);
      await tick(300);
      expect(L.every((X) => X.state() === L[0].state())).toBe(true);
      const errs = w.errs.join("\n");
      expect(errs).toContain("unread by the relay (over a rate bound");   // the address's bucket was hit
      expect(errs).not.toContain("the relay closed this client's connection");
      expect(w.logs.join("\n")).not.toContain("closed a connection");
    } finally { w.done(); }
  }, 30000);
});

describe("D — reconnect backoff (§38.7, ruled §3.B item 5)", () => {
  test("channelBackoff: doubling from `reconnect=`, ±20% jitter, a 30 s cap (never below the author's own delay)", () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => rt.channelBackoff(1000, n, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(rt.channelBackoff(1000, 0, () => 0)).toBe(800);
    expect(rt.channelBackoff(1000, 0, () => 0.999999)).toBe(1200);
    expect(rt.channelBackoff(1000, 99, () => 0)).toBe(24000);
    expect(rt.channelBackoff(60000, 3, mid)).toBe(60000);
    expect(rt.CHANNEL_RECONNECT_CAP_MS).toBe(30000);
  });

  // a fake clock: every setTimeout is captured with its delay; `fire()` runs the last one
  function fakeWorld(reconnect, random) {
    const prev = { ws: globalThis.WebSocket, loc: globalThis.location, st: globalThis.setTimeout, ct: globalThis.clearTimeout, rnd: Math.random, err: console.error };
    const socks = [];
    const timers = [];
    globalThis.WebSocket = class { constructor() { this.readyState = 0; this.sent = []; socks.push(this); } send(t) { this.sent.push(t); } close() { this.readyState = 3; } };
    globalThis.location = { protocol: "http:", host: "x.test" };
    globalThis.setTimeout = (f, ms) => { timers.push({ f, ms }); return timers.length; };
    globalThis.clearTimeout = () => {};
    Math.random = random;
    console.error = () => {};
    const scope = rt.root.child();
    rt.channel(scope, { name: "k", reconnect, limits: null, cells: [], open: null, close: null, error: null });
    return {
      socks, timers,
      drop: () => { const s = socks[socks.length - 1]; s.readyState = 3; s.onclose({ code: 1006, reason: "" }); },
      open: () => { const s = socks[socks.length - 1]; s.readyState = 1; s.onopen(); },
      fire: () => timers[timers.length - 1].f(),
      done: () => { scope.dispose(); globalThis.WebSocket = prev.ws; globalThis.location = prev.loc; globalThis.setTimeout = prev.st; globalThis.clearTimeout = prev.ct; Math.random = prev.rnd; console.error = prev.err; },
    };
  }

  test("a client that cannot connect waits longer each time; an open resets it; jitter spreads clients apart", () => {
    const f = fakeWorld(500, () => 0.5);
    try {
      for (let i = 0; i < 9; i++) { f.drop(); f.fire(); }
      expect(f.timers.map((t) => t.ms)).toEqual([500, 1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
      f.open();                                               // reset on open
      f.drop();
      expect(f.timers[f.timers.length - 1].ms).toBe(500);
    } finally { f.done(); }
    for (const [r, ms] of [[() => 0, 1600], [() => 0.99, 2392]]) {
      const j = fakeWorld(2000, r);
      try {
        j.drop();
        expect(j.timers[0].ms).toBe(ms);
      } finally { j.done(); }
    }
  });

  test("`reconnect=0` disables reconnecting", () => {
    const f = fakeWorld(0, () => 0.5);
    try {
      f.drop();
      expect(f.timers).toEqual([]);
    } finally { f.done(); }
  });
});

describe("E — `<program trusted-proxies=N>` (§40.2, ruled §3.B item 6, default 0)", () => {
  const codes = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml").diags.map((d) => d.code);
  test("a value that is not a bare integer 0..=32 is E-MW-009; 0..=32 compile and are printed on the server desc", () => {
    for (const bad of [`"1"`, "33", "-1", "1.5", "(1)", ""]) {
      const v = bad === "" ? "" : `=${bad}`;
      expect(codes(app("", ` trusted-proxies${v}`))).toContain("E-MW-009");
    }
    for (const [attr, n] of [["", 0], [" trusted-proxies=0", 0], [" trusted-proxies=2", 2], [" trusted-proxies=32", 32]]) {
      const { server } = compile(app("", attr));
      expect(server.js).toContain(`trustedProxies: ${n} }`);
    }
  });

  test("forwardedEntry: the Nth-from-last entry; nothing at N = 0, with fewer than N entries, or no header", () => {
    const req = (v) => new Request("http://x.test/", { headers: v === undefined ? {} : { "X-Forwarded-For": v } });
    expect(srt.forwardedEntry(req("1.1.1.1, 2.2.2.2, 3.3.3.3"), "X-Forwarded-For", 0)).toBe("");
    expect(srt.forwardedEntry(req("1.1.1.1, 2.2.2.2, 3.3.3.3"), "X-Forwarded-For", 1)).toBe("3.3.3.3");
    expect(srt.forwardedEntry(req("1.1.1.1, 2.2.2.2, 3.3.3.3"), "X-Forwarded-For", 2)).toBe("2.2.2.2");
    expect(srt.forwardedEntry(req("2.2.2.2"), "X-Forwarded-For", 2)).toBe("");
    expect(srt.forwardedEntry(req(undefined), "X-Forwarded-For", 1)).toBe("");
  });

  // max-subscribers=10: one address holds ONE place (⌊10 / 10⌋), so a second socket from the same
  // client address is 429 and one from another is admitted. All sockets really come from 127.0.0.1.
  const opens = async (w, headers) => { try { await w.raw(headers); return true; } catch { return false; } };
  test("N = 0 (the default): spoofed X-Forwarded-For is ignored — every socket from 127.0.0.1 is one address", async () => {
    const w = await world(app(" max-subscribers=10"));
    try {
      expect(await opens(w, { "X-Forwarded-For": "6.6.6.1" })).toBe(true);
      expect(await opens(w, { "X-Forwarded-For": "6.6.6.2" })).toBe(false);
    } finally { w.done(); }
  });

  test("N = 1: the LAST entry (the one the proxy appended) is the address; the client's own entries are never read", async () => {
    const w = await world(app(" max-subscribers=10", " trusted-proxies=1"));
    try {
      expect(await opens(w, { "X-Forwarded-For": "9.9.9.9, 5.5.5.1" })).toBe(true);
      expect(await opens(w, { "X-Forwarded-For": "8.8.8.8, 5.5.5.1" })).toBe(false);   // spoofed first entry: still 5.5.5.1
      expect(await opens(w, { "X-Forwarded-For": "5.5.5.2" })).toBe(true);
      expect(await opens(w, {})).toBe(true);                                             // no header: 127.0.0.1
      expect(await opens(w, {})).toBe(false);
    } finally { w.done(); }
  });

  test("N = 2: the second-from-last entry; fewer than two entries falls back to the peer address (fail closed)", async () => {
    const w = await world(app(" max-subscribers=10", " trusted-proxies=2"));
    try {
      expect(await opens(w, { "X-Forwarded-For": "6.6.6.6, 5.5.5.1, 10.0.0.1" })).toBe(true);
      expect(await opens(w, { "X-Forwarded-For": "5.5.5.1, 10.0.0.1" })).toBe(false);
      expect(await opens(w, { "X-Forwarded-For": "5.5.5.2, 10.0.0.1" })).toBe(true);
      expect(await opens(w, { "X-Forwarded-For": "5.5.5.3" })).toBe(true);              // one entry: 127.0.0.1
      expect(await opens(w, { "X-Forwarded-For": "5.5.5.4" })).toBe(false);             // 127.0.0.1 again
    } finally { w.done(); }
  });
});
