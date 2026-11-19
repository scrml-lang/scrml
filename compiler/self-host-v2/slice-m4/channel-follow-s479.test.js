// channel-follow-s479.test.js — s479-channel-follow: the channel follow-ups to PR #1967.
//
//   A. a `replace` and the tape's length (brief item 1). The relay and every client judge a `replace`
//      by ONE rule (runtime.js `channelJudge`, after the canonical decode): a bounded tape's bound
//      (§66.12.2 "every value of the type has a length in the bound") is refused by the relay (1007,
//      relayed to no one) and by a receiver; a `T[replace]` tape with no length grant takes a value of
//      ANY length — exactly as the local write `@fx = [2, 5]` does (the bootstrap compiles it with no
//      check, and §6's `let <results:Item[replace]=[]/>` example relies on it). A FIXED length does not
//      bind a `replace` — ruled S480 (user-voice-scrml.md "replace is not bound by a FIXED length";
//      §38.4.2, §66.11.2; g-boot-fixed-tape-replace-length-unruled-s479 resolved); these tests pin that
//      relay, client and local write agree.
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
    // ruled S480 (§38.4.2, g-boot-fixed-tape-replace-length-unruled-s479 resolved): no length grant
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

  // S480 r2 (#1987 review NEW-2): a rate refusal no longer retires the edit — it was applied nowhere, so
  // the client re-sends it, paced, and it stays shown (RED on aa0920cda: retired, the value reverted)
  test("the client keeps its oldest SENT pending edit shown, empties its pacer's bucket, and re-sends it paced", async () => {
    const n = rt.cell(0);
    const c = standIn([{ key: "n", cell: n, table: INT, ops: ["replace"], edges: null }], { maxFrame: 65536, rate: 50, burst: 100 });
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => n.set(4));
      expect(c.sock.sent).toEqual([{ __type: "__sync", __key: "n", __op: "replace", __val: 4, __seen: 0 }]);
      c.raw({ __type: "__refused", __why: "over the rate limit of this connection's address" });
      expect(n.peek()).toBe(4);                               // still shown: it will be re-sent
      expect(c.errs.join("\n")).toContain("unread by the relay (over a rate bound, §38.4.3) — re-sent, paced");
      expect(c.sock.closed).toBe(0);
      expect(c.sock.sent.length).toBe(1);                     // the bucket is empty: not re-sent at once
      await tick(80);                                         // a token's refill (1 / 47.5 s)
      expect(c.sock.sent).toEqual([
        { __type: "__sync", __key: "n", __op: "replace", __val: 4, __seen: 0 },
        { __type: "__sync", __key: "n", __op: "replace", __val: 4, __seen: 0 },
      ]);
      c.raw({ __type: "__sync", __seq: 1, __key: "n", __op: "replace", __val: 4, __own: true });   // its echo
      expect(n.peek()).toBe(4);
      expect(c.sock.closed).toBe(0);
    } finally { c.done(); }
  });

  test("a refused edit a later `replace` of its cell supersedes is not re-sent: the newest value wins", async () => {
    const n = rt.cell(0);
    const c = standIn([{ key: "n", cell: n, table: INT, ops: ["replace"], edges: null }], { maxFrame: 65536, rate: 50, burst: 100 });
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => n.set(4));
      c.raw({ __type: "__refused", __why: "over this connection's rate limit" });
      rt.batch(() => n.set(5));                               // queued (the bucket is empty), supersedes 4
      expect(n.peek()).toBe(5);
      await tick(80);
      expect(c.sock.sent.map((f) => f.__val)).toEqual([4, 5]);
      c.raw({ __type: "__sync", __seq: 1, __key: "n", __op: "replace", __val: 5, __own: true });
      expect(n.peek()).toBe(5);
      expect(c.sock.closed).toBe(0);
    } finally { c.done(); }
  });

  test("a refused edit of a `reset-on=` trigger is not re-sent past a later relayed edit (their order cannot be kept): dropped, reported", async () => {
    const n = rt.cell(0), m = rt.cell(0), z = rt.cell(7);
    const c = standIn([
      { key: "n", cell: n, table: INT, ops: ["replace"], edges: null },
      { key: "m", cell: m, table: INT, ops: ["replace"], edges: null },
    ], { maxFrame: 65536, rate: 50, burst: 100 });
    const s2 = rt.root.child();
    rt.resetOn(s2, [n], () => { z.set(7); }, 0);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => n.set(4));
      rt.batch(() => m.set(5));
      c.raw({ __type: "__refused", __why: "over this connection's rate limit" });
      expect(n.peek()).toBe(4);                               // held, still shown
      c.raw({ __type: "__sync", __seq: 1, __key: "m", __op: "replace", __val: 5, __own: true });
      expect(n.peek()).toBe(0);                               // dropped: not shown
      expect(m.peek()).toBe(5);
      expect(c.errs.join("\n")).toContain("not re-sent: a later edit it does not commute with was relayed first");
      await tick(80);
      expect(c.sock.sent.map((f) => f.__key)).toEqual(["n", "m"]);
      expect(c.sock.closed).toBe(0);
    } finally { s2.dispose(); c.done(); }
  });

  test("a refused edit of an uncoupled cell is re-sent after a later relayed edit of another cell, its `__seen` renewed", async () => {
    const n = rt.cell(0), m = rt.cell(0);
    const c = standIn([
      { key: "n", cell: n, table: INT, ops: ["replace"], edges: null },
      { key: "m", cell: m, table: INT, ops: ["replace"], edges: null },
    ], { maxFrame: 65536, rate: 50, burst: 100 });
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => n.set(4));
      c.raw({ __type: "__sync", __seq: 1, __key: "m", __op: "replace", __val: 9, __own: false });   // a peer's
      rt.batch(() => m.set(5));                               // made at __seen 1
      c.raw({ __type: "__refused", __why: "over this connection's rate limit" });
      c.raw({ __type: "__sync", __seq: 2, __key: "m", __op: "replace", __val: 5, __own: true });
      expect(n.peek()).toBe(4);
      await tick(80);
      // re-sent with __seen 1 (the relay's floor: the __seen of m's frame, which it read), not 0
      expect(c.sock.sent).toEqual([
        { __type: "__sync", __key: "n", __op: "replace", __val: 4, __seen: 0 },
        { __type: "__sync", __key: "m", __op: "replace", __val: 5, __seen: 1 },
        { __type: "__sync", __key: "n", __op: "replace", __val: 4, __seen: 1 },
      ]);
      c.raw({ __type: "__sync", __seq: 3, __key: "n", __op: "replace", __val: 4, __own: true });
      expect([n.peek(), m.peek()]).toEqual([4, 5]);
      expect(c.sock.closed).toBe(0);
    } finally { c.done(); }
  });

  test("a fold `__refused` (it names its edit) is not re-sent: the edit stays dropped", async () => {
    const n = rt.cell(0);
    const c = standIn([{ key: "n", cell: n, table: INT, ops: ["replace"], edges: null }], { maxFrame: 65536, rate: 50, burst: 100 });
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => n.set(4));
      c.raw({ __type: "__refused", __key: "n", __op: "replace", __val: 4, __why: "x" });
      expect(n.peek()).toBe(0);
      await tick(80);
      expect(c.sock.sent.length).toBe(1);
      expect(c.sock.closed).toBe(0);
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

// S480 #1987 review fix r1 (MED-1), §38.4.3 "Over a rate bound": a refused frame spends no token (no
// debt), and the close is a separate close bucket of `burst` + 30 × `rate` that every frame spends. A
// shared fake clock (`host.now`) drives the relay, so time is the test's. RED on b024ff914: the relay
// put a refused frame's token into debt, so after a network-bunched burst a pacing client's frames were
// refused in a streak (the last edit too, at a 600 ms stall) and a 2.4 s stall closed it `1008`; and a
// frame sent a second after three refusals at `frame-rate=1` was refused (the debt), not relayed.
describe("C2 — over a rate bound after a network stall: an honest pacer is not refused past the bunch, nor closed (§38.4.3)", () => {
  // The real client pacer (`channelPacer`, defaults: rate 50, burst 100) and the real relay on one fake
  // clock. At T = 3000 the client sends a full burst and then edits every 16 ms (faster than the pace,
  // so its queue is never empty); every frame it sends during [3000, holdTo) is held by the "network"
  // and delivered at holdTo. Each delivered frame is answered (its own echo, or `__refused`) before
  // the clock moves on. Returns the refused frames' delivery times, how many were delivered, and the close.
  async function stall(holdTo, editEnd, simEnd) {
    let T = 0;
    const w = await world(app(), { now: () => T });
    try {
      const R = await w.raw();
      const timers = [], outbox = [];
      const pacer = rt.channelPacer({ rate: 50, burst: 100 }, {
        now: () => T,
        later: (f, ms) => { const h = { due: T + ms, f }; timers.push(h); return h; },
        cancel: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
        send: (text) => { outbox.push({ text, at: T >= 3000 && T < holdTo ? holdTo : T }); },
      });
      pacer.open();
      let delivered = 0, answered = 0;
      const refusedAt = [];
      const deliveredAt = [];
      R.ws.addEventListener("message", (ev) => {
        const v = JSON.parse(String(ev.data));
        if (v.__type === "__refused") { pacer.starve(); refusedAt.push(deliveredAt[answered]); answered++; } else if (v.__own === true) answered++;
      });
      T = 3000;
      for (let i = 0; i < 100; i++) pacer.push("k" + i, "replace", frame("n", "replace", i), null);
      for (; T < simEnd && R.closed() === null; T += 4) {
        if (T % 16 === 0 && T < editEnd) pacer.push("n", "replace", frame("n", "replace", T), null);
        for (const h of timers.filter((x) => x.due <= T)) { timers.splice(timers.indexOf(h), 1); h.f(); }
        const due = outbox.filter((o) => o.at <= T);
        for (const o of due) { outbox.splice(outbox.indexOf(o), 1); R.ws.send(o.text); delivered++; deliveredAt.push(T); }
        if (due.length) await until(() => answered === delivered || R.closed() !== null, 3000);
      }
      await tick(50);
      return { refusedAt, delivered, answered, lastAt: deliveredAt[delivered - 1], closed: R.closed() };
    } finally { w.done(); }
  }

  for (const [label, holdTo, editEnd, simEnd] of [["150 ms", 3150, 5000, 6000], ["600 ms", 3600, 5000, 6000], ["2.4 s, editing on after it", 5400, 6500, 7000]]) {
    test(`a ${label} stall: only frames of the bunch are refused, the last edit is relayed, never closed`, async () => {
      const r = await stall(holdTo, editEnd, simEnd);
      expect(r.closed).toBe(null);
      expect(r.answered).toBe(r.delivered);
      expect(r.refusedAt.length).toBeGreaterThan(0);              // the bunch is over the relay's bucket
      // all at the one step that delivers the bunch (the clock moves in 4 ms steps): nothing after it
      expect(r.refusedAt.every((t) => t >= holdTo && t < holdTo + 4)).toBe(true);
      expect(r.lastAt).toBeGreaterThan(holdTo);                    // so the user's last edit, after it, is relayed
    }, 60000);
  }

  test("a refused frame spends no token: a frame one token-refill after three refusals is relayed", async () => {
    let T = 1000;
    const w = await world(app(" frame-rate=1 frame-burst=3"), { now: () => T });
    try {
      const A = await w.raw();
      const B = await w.raw();
      for (let i = 1; i <= 6; i++) A.ws.send(frame("n", "replace", i));
      expect(await until(() => A.refusals.length === 3 && B.got.length === 3)).toBe(true);
      T += 1000;                                                   // one token at frame-rate=1
      A.ws.send(frame("n", "replace", 7));
      expect(await until(() => B.got.length === 4)).toBe(true);
      expect(B.got.map((f) => f.__val)).toEqual([1, 2, 3, 7]);
      expect(A.refusals.length).toBe(3);
      expect(A.closed()).toBe(null);
    } finally { w.done(); }
  });

  test("a sender that keeps sending past the rate while it reads its refusals is refused, then closed 1008 at its close bucket", async () => {
    let T = 1000;
    // frame-rate=5 frame-burst=3: the close bucket holds 3 + 5 × 30 = 153 tokens
    const w = await world(app(" frame-rate=5 frame-burst=3"), { now: () => T });
    try {
      const A = await w.raw();
      const B = await w.raw();
      let sent = 0;
      // 20 frames each 100 ms of the fake clock (200/s, forty times the rate), waiting each round until
      // the relay has answered (relayed or refused) every frame — so the sender has read its refusals
      while (A.closed() === null && sent < 1000) {
        for (let i = 0; i < 20; i++) A.ws.send(frame("n", "replace", ++sent));
        await until(() => A.closed() !== null || B.got.length + A.refusals.length === sent);
        T += 100;
      }
      expect(A.closed()?.code).toBe(1008);
      expect(A.closed()?.reason).toContain("close bound");
      expect(A.refusals.length).toBeGreaterThan(100);
      // relayed: the burst and the rate, never more; closed after the close bucket (153 + 5/s refill)
      const secs = (T - 1000) / 1000;
      expect(B.got.length).toBeLessThanOrEqual(3 + Math.ceil(5 * secs) + 1);
      expect(sent).toBeLessThanOrEqual(153 + Math.ceil(5 * secs) + 20);
      expect(B.closed()).toBe(null);
      expect(w.logs.join("\n")).toContain("past its close bound");
    } finally { w.done(); }
  }, 30000);
});

// S480 #1987 review fix r2. NEW-1 (§38.4.3): a frame refused by its ADDRESS's bucket spends its
// connection's close bucket too, and closes `1008` when it is empty — RED on aa0920cda: the address
// branch refunded the connection token and never closed, so once an address's bucket was dry a socket
// flooded forever, one `__refused` per frame. NEW-2: a frame refused unread over a rate bound is
// re-sent, paced, in order — RED on aa0920cda: after a network stall an honest client's final value
// was refused, retired and silently reverted (peers kept an older value).
describe("F — r2: an address refusal is bounded by the close bucket; a rate-refused edit is re-sent (§38.4.3)", () => {
  // The pacer's re-send, on a fake clock and a fake wire (`sent` the frames in send order; `rate: 50,
  // burst: 4` → a client bucket of 3, refilled at 47.5/s). `coupled` names the keys whose write resets
  // another cell (`reset-on=`).
  function fakePacer(coupledKeys = []) {
    let T = 0;
    const timers = [], sent = [], superseded = [], dropped = [];
    const p = rt.channelPacer({ rate: 50, burst: 4 }, {
      now: () => T,
      later: (f, ms) => { const h = { due: T + ms, f }; timers.push(h); return h; },
      cancel: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
      send: (text, ref) => { sent.push(ref); },
      superseded: (ref) => { superseded.push(ref); },
      dropped: (ref) => { dropped.push(ref); },
      coupled: (ref) => coupledKeys.includes(ref.split(":")[0]),
    });
    const run = (ms) => { const end = T + ms; while (T < end) { T += 1; for (const h of timers.filter((x) => x.due <= T)) { timers.splice(timers.indexOf(h), 1); h.f(); } } };
    p.open();
    const push = (key, op, tag) => p.push(key, op, tag, `${key}:${tag}`);
    return { p, push, run, sent, superseded, dropped, timers };
  }

  test("pacer: a rate-refused frame is re-sent in its original order, before the frames queued after it, never at once", () => {
    const F = fakePacer();
    F.push("a", "append", "1"); F.push("a", "append", "2"); F.push("a", "append", "3");   // the bucket (3)
    F.push("a", "append", "4");                                                     // queued
    expect(F.sent).toEqual(["a:1", "a:2", "a:3"]);
    expect(F.p.refused()).toBe("a:1");               // held: a:2 and a:3 are unanswered
    F.run(200);
    expect(F.sent).toEqual(["a:1", "a:2", "a:3"]);   // nothing sent while a later frame is unanswered
    expect(F.p.refused()).toBe("a:2");
    expect(F.p.refused()).toBe("a:3");               // all answered: a:1, a:2, a:3 back at the head, before a:4
    expect(F.sent.length).toBe(3);                   // the bucket was emptied: not re-sent at once (no hot loop)
    F.run(25);
    expect(F.sent.length).toBe(4);                   // one token's refill (1 / 47.5 s ≈ 21 ms) — one frame
    F.run(200);
    expect(F.sent).toEqual(["a:1", "a:2", "a:3", "a:1", "a:2", "a:3", "a:4"]);
    expect(F.dropped).toEqual([]);
  });

  test("pacer: a refused frame and a later relayed one — superseded (a later replace), dropped (they do not commute), or kept", () => {
    const F = fakePacer(["t"]);
    F.push("n", "replace", "1"); F.push("x", "append", "1"); F.push("y", "append", "1");
    expect(F.p.refused()).toBe("n:1");
    expect(F.p.refused()).toBe("x:1");
    F.push("n", "replace", "2");                     // queued, held
    expect(F.p.answered(true)).toBe("y:1");          // other cells, uncoupled: both commute — kept
    F.run(200);
    // n:1 superseded by the queued n:2 (the newest value wins); x:1 re-sent before n:2
    expect(F.superseded).toEqual(["n:1"]);
    expect(F.sent).toEqual(["n:1", "x:1", "y:1", "x:1", "n:2"]);
    const G = fakePacer(["t"]);
    G.push("a", "append", "1"); G.push("a", "append", "2"); G.push("t", "replace", "1");
    expect(G.p.refused()).toBe("a:1");
    expect(G.p.answered(true)).toBe("a:2");          // the same cell, not a replace: re-sending a:1 would reorder
    expect(G.dropped).toEqual(["a:1"]);
    G.push("u", "replace", "1");
    expect(G.p.refused()).toBe("t:1");
    G.run(100);                                      // re-sent: nothing after it was relayed
    expect(G.sent).toEqual(["a:1", "a:2", "t:1", "t:1", "u:1"]);
    const H = fakePacer(["t"]);
    H.push("u", "replace", "1"); H.push("t", "replace", "1");
    expect(H.p.refused()).toBe("u:1");
    expect(H.p.answered(true)).toBe("t:1");          // t's write resets another cell: they do not commute
    expect(H.dropped).toEqual(["u:1"]);
  });

  test("pacer: a fold refusal is not re-sent, and a close drops the queue and the frames awaiting a re-send", () => {
    const F = fakePacer();
    F.push("a", "append", "1"); F.push("a", "append", "2"); F.push("a", "append", "3"); F.push("a", "append", "4");
    expect(F.p.answered(false)).toBe("a:1");         // the relay's fold refused it: dropped, as before
    expect(F.p.refused()).toBe("a:2");
    expect(F.p.close()).toBe(2);                     // a:4 queued, a:2 awaiting its re-send
    F.run(200);
    expect(F.sent).toEqual(["a:1", "a:2", "a:3"]);
    expect(F.p.refused()).toBe(undefined);           // nothing unanswered after a close
    F.p.open();
    expect(F.p.pending()).toBe(0);
  });

  test("a socket flooding while its address's bucket is kept dry is closed 1008 at its close bucket (fixed clock)", async () => {
    const T = 1000;
    // frame-rate=5 frame-burst=3: the address bucket 12 (20/s); the close bucket 3 + 5 × 30 = 153
    const w = await world(app(" frame-rate=5 frame-burst=3"), { now: () => T });
    try {
      const H = [];
      for (let i = 0; i < 4; i++) H.push(await w.raw());
      const E = await w.raw();
      const O = await w.raw();
      for (const h of H) for (let i = 0; i < 3; i++) h.ws.send(frame("n", "replace", i));
      expect(await until(() => O.got.length >= 12)).toBe(true);   // the address's bucket is dry
      let sent = 0;
      for (let r = 0; r < 25 && E.closed() === null; r++) {
        for (let i = 0; i < 200; i++) E.ws.send(frame("n", "replace", 1000 + ++sent));
        await until(() => E.closed() !== null || E.refusals.length >= sent);
      }
      expect(await until(() => E.closed() !== null)).toBe(true);
      expect(E.closed().code).toBe(1008);
      expect(E.closed().reason).toContain("close bound");
      expect(E.refusals.length).toBeLessThanOrEqual(153);
      expect(O.got.length).toBe(12);                             // none of E's frames was relayed
      expect(H.every((h) => h.closed() === null)).toBe(true);
    } finally { w.done(); }
  }, 30000);

  test("a socket flooding at 400× the rate past a saturated address is closed 1008 (moving clock)", async () => {
    let T = 1000;
    const w = await world(app(" frame-rate=5 frame-burst=3"), { now: () => T });
    try {
      const H = [];
      for (let i = 0; i < 10; i++) H.push(await w.raw());
      const E = await w.raw();
      const O = await w.raw();
      for (const h of H) for (let i = 0; i < 3; i++) h.ws.send(frame("n", "replace", i));
      let sent = 0;
      for (let step = 0; step < 300 && E.closed() === null; step++) {
        H.forEach((h, i) => { if (i % 2 === step % 2) h.ws.send(frame("n", "replace", step)); });   // each helper at the rate
        for (let i = 0; i < 200; i++) E.ws.send(frame("n", "replace", 100000 + ++sent));
        await until(() => E.closed() !== null || E.refusals.length + O.got.filter((f) => f.__val >= 100000).length >= sent);
        T += 100;
      }
      expect(E.closed()?.code).toBe(1008);
      expect((T - 1000) / 1000).toBeLessThan(2);                 // within its close bucket, not "forever"
      expect(H.every((h) => h.closed() === null)).toBe(true);    // the helpers send at the rate: never closed
    } finally { w.done(); }
  }, 30000);

  // Honest pacing clients behind ONE address, each at 95% of the rate (the real `channelPacer`, wired as
  // the client wires it: a rate `__refused` → `refused()`, its own echo → `answered(true)`), together
  // far past the address's bucket (6 × 4.75/s > 20/s), on one fake clock for 40 s — longer than the
  // close window. Every one of them is refused often and re-sends, paced; none is ever closed, none
  // puts more on the wire than its own pace, and each one's last value reaches the peers.
  test("honest pacers sharing a saturated address are refused and re-send, paced, for 40 s: none is closed", async () => {
    let T = 1000;
    const w = await world(app(" frame-rate=5 frame-burst=3"), { now: () => T });
    try {
      const O = await w.raw();
      const P = [];
      for (let i = 0; i < 6; i++) {
        const R = await w.raw();
        const timers = [];
        const X = { R, timers, wire: 0, refused: 0, answered: 0, last: null };
        X.pacer = rt.channelPacer({ rate: 5, burst: 3 }, {
          now: () => T,
          later: (f, ms) => { const h = { due: T + ms, f }; timers.push(h); return h; },
          cancel: (h) => { const j = timers.indexOf(h); if (j >= 0) timers.splice(j, 1); },
          send: (text) => { X.wire++; R.ws.send(text); },
        });
        R.ws.addEventListener("message", (ev) => {
          const v = JSON.parse(String(ev.data));
          if (v.__type === "__refused") { X.refused++; X.answered++; X.pacer.refused(); } else if (v.__own === true) { X.answered++; X.pacer.answered(true); }
        });
        X.pacer.open();
        P.push(X);
      }
      const END = 41000;
      for (; T < END + 5000; T += 100) {
        if (T < END) P.forEach((X, i) => { X.last = i * 1e6 + T; X.pacer.push("n", "replace", frame("n", "replace", X.last), null); });
        for (const X of P) for (const h of X.timers.filter((x) => x.due <= T)) { X.timers.splice(X.timers.indexOf(h), 1); h.f(); }
        await until(() => P.every((X) => X.answered === X.wire || X.R.closed() !== null), 3000);
      }
      expect(P.every((X) => X.R.closed() === null)).toBe(true);
      expect(P.filter((X) => X.refused > 0).length).toBeGreaterThan(1);   // the address's bucket was hit
      const secs = (END + 5000 - 1000) / 1000;
      for (const X of P) expect(X.wire).toBeLessThanOrEqual(2 + Math.ceil(4.75 * secs) + 1);   // its own pace, re-sends included
      const vals = new Set(O.got.map((f) => f.__val));
      expect(P.every((X) => vals.has(X.last))).toBe(true);         // each one's last value was relayed
      expect(w.logs.join("\n")).not.toContain("closed a connection");
    } finally { w.done(); }
  }, 120000);

  // A network stall: the real pacer (defaults rate 50, burst 100), wired as the client wires it, and the
  // real relay on one fake clock; every frame sent in [holdFrom, holdTo) is delivered at holdTo. A peer
  // socket watches what is relayed. Returns the user's last value, the peers' last, refusals and close.
  const BURST_APP = APP.replace("__ATTRS__", "").replace("__PROG__", "").replace("  let <n:int=0/>", "  let <n:int=0/>\n" + Array.from({ length: 10 }, (_, i) => `  let <b${i}:int=0/>`).join("\n"));
  async function stall(holdFrom, holdTo, editEnd, simEnd, burst) {
    let T = 0;
    const w = await world(BURST_APP, { now: () => T });
    try {
      const R = await w.raw();
      const O = await w.raw();
      const timers = [], outbox = [];
      const pacer = rt.channelPacer({ rate: 50, burst: 100 }, {
        now: () => T,
        later: (f, ms) => { const h = { due: T + ms, f }; timers.push(h); return h; },
        cancel: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
        send: (text) => { outbox.push({ text, at: T >= holdFrom && T < holdTo ? holdTo : T }); },
      });
      let delivered = 0, answered = 0, refused = 0, last = null;
      R.ws.addEventListener("message", (ev) => {
        const v = JSON.parse(String(ev.data));
        if (v.__type === "__refused") { refused++; answered++; pacer.refused(); } else if (v.__own === true) { answered++; pacer.answered(true); }
      });
      pacer.open();
      T = 1000;
      // the burst is of ten other cells (b0..b9): the pacer sends 95 at once and queues one of each of
      // the last five, so these commute with the `n` edits and are re-sent, if refused, after them
      const lastB = new Map();
      if (burst) { T = 3000; for (let i = 0; i < 100; i++) { lastB.set("b" + (i % 10), i); pacer.push("b" + (i % 10), "replace", frame("b" + (i % 10), "replace", i), null); } }
      for (; T < simEnd && R.closed() === null; T += 4) {
        if (T % 16 === 0 && T < editEnd) { last = T; pacer.push("n", "replace", frame("n", "replace", T), null); }
        for (const h of timers.filter((x) => x.due <= T)) { timers.splice(timers.indexOf(h), 1); h.f(); }
        const due = outbox.filter((o) => o.at <= T);
        for (const o of due) { outbox.splice(outbox.indexOf(o), 1); R.ws.send(o.text); delivered++; }
        if (due.length) await until(() => answered === delivered || R.closed() !== null, 3000);
      }
      await tick(50);
      const peerOf = (k) => { const g = O.got.filter((f) => f.__key === k); return g.length ? g[g.length - 1].__val : null; };
      const cellsOk = [...lastB].every(([k, v]) => peerOf(k) === v);
      return { last, peers: peerOf("n"), cellsOk, refused, closed: R.closed() };
    } finally { w.done(); }
  }
  for (const [label, from, to, editEnd, simEnd, burst] of [
    ["a 600 ms stall after a burst, editing ending inside it (its last frame refused)", 3000, 3600, 3300, 6000, true],
    ["a 150 ms stall after a burst, editing ending inside it (its one refusal the last frame)", 3000, 3150, 3100, 6000, true],
    ["a steady drag at 60/s, a 3 s stall, editing ending inside it", 3000, 6000, 5900, 8000, false],
  ]) {
    test(`${label}: the peers end at the user's last value, never closed`, async () => {
      const r = await stall(from, to, editEnd, simEnd, burst);
      expect(r.closed).toBe(null);
      expect(r.refused).toBeGreaterThan(0);
      expect(r.peers).toBe(r.last);
      expect(r.cellsOk).toBe(true);                               // and every burst cell's last value
    }, 60000);
  }
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
    // S480 #1987 fix r1 (NIT-2): "a bare integer literal" — `0` or a decimal with no leading zero
    for (const bad of [`"1"`, "33", "-1", "1.5", "(1)", "", "00", "07", "032"]) {
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
    // S480 #1987 fix r1 (NIT-1): a count that is not a safe integer trusts nothing (fail closed)
    for (const n of [1.5, NaN, Infinity, 2 ** 53]) expect(srt.forwardedEntry(req("1.1.1.1, 2.2.2.2"), "X-Forwarded-For", n)).toBe("");
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
