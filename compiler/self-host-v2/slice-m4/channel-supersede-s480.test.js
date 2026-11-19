// channel-supersede-s480.test.js — s480-channel-supersede: a `replace` supersede never strands a
// same-cell edit, so an honest client is not closed (#1987 r2 review M-pre, L1).
//
// §38.4.3: "A conforming client paces its frames to the bound; an honest client SHALL NOT be closed by
// it." The client's pacer (runtime.js `channelPacer`) drops a frame of a cell that a later `replace` of
// the cell supersedes — queued (`push`), or refused for rate and awaiting a re-send (`release`). On the
// base (2ec9f76d7) it did so even with another frame of the cell BETWEEN the two: the queue
// `set([1])`, `append(40)`, `set([5])` lost `set([1])`, so `append 40` — made and checked on `[1]` — was
// judged by the relay on the value before (`[1, 2, 3, 4]`, a bounded tape at its bound): the fold
// refused it, unexplained since `__seen`, and closed the honest client `1008` (M-pre). The re-send path
// did the same to a rate-refused `replace` with a queued `append` and `replace` of its cell after it
// (L1: the `append` was re-sent without the `replace` it was made on). The rule now:
// a frame is superseded only by the NEXT frame of its cell after it, when that one is a `replace`.
//
//   A. the pacer, on a fake clock: the supersede rule for the queue and for the re-send.
//   B. served (the real relay): M-pre and L1 — RED on 2ec9f76d7 (closed 1008).
//   C. served fuzz: real clients through a bunching "network", mixed replace / append / prepend / pop /
//      shift on a bounded and a free tape and two `reset-on=`-coupled ints, at a tight rate bound with
//      stalls; after the pacing backlog drains, no client is closed and every one equals a fresh
//      joiner's replay.

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

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
async function until(pred, ms = 3000) {
  for (let t = 0; t < ms / 20; t++) { if (pred()) return true; await tick(20); }
  return pred();
}

const XS = { defs: [], root: { k: "seq", elem: { k: "int" }, bound: { k: "bounded", min: 0, max: 4 } } };
const YS = { defs: [], root: { k: "seq", elem: { k: "int" }, bound: { k: "free" } } };
const INT = { defs: [], root: { k: "int" } };

const compiled = new Map();
function compile(src) {
  if (compiled.has(src)) return compiled.get(src);
  const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  const { server } = artifacts(r.core);
  expect(server.refused).toEqual([]);
  compiled.set(src, { r, server });
  return compiled.get(src);
}

async function relay(src, host = {}) {
  const { r, server } = compile(src);
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (s) => logs.push(s), ...host });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, s) => srv.fetch(req, s), websocket: srv.websocket });
  return { base: `127.0.0.1:${bun.port}`, logs, stop: () => bun.stop(true) };
}

// A real rt.channel client over a real socket to the relay, through a "network" the test drives:
// frames out (`flushOut`) and in (`flushIn`) cross only when flushed (unless `auto`), and `holdUntil`
// holds the outbound ones (a stall: they then arrive bunched).
async function client(w, cellsSpec, limits, { auto = false } = {}) {
  const real = new WebSocket(`ws://${w.base}/_scrml_ws/c`);
  await new Promise((res, rej) => { real.onopen = res; real.onerror = rej; });
  const C = { out: [], inb: [], holdUntil: 0, wire: 0, closes: [], errs: [], cells: {} };
  const quiet = (fn) => {
    const e = console.error, wn = console.warn;
    console.error = (m) => C.errs.push(String(m)); console.warn = (m) => C.errs.push(String(m));
    try { return fn(); } finally { console.error = e; console.warn = wn; }
  };
  const fake = {
    readyState: 1,
    send(t) { C.wire++; if (auto) real.send(t); else C.out.push(t); },
    close() { fake.readyState = 3; try { real.close(); } catch { /* closed */ } },
  };
  C.flushOut = (max = Infinity) => {
    if (Date.now() < C.holdUntil) return 0;
    let k = 0;
    while (C.out.length && k < max) { const t = C.out.shift(); try { real.send(t); k++; } catch { /* closed */ } }
    return k;
  };
  C.flushIn = (max = Infinity) => {
    let k = 0;
    while (C.inb.length && k < max) {
      const m = C.inb.shift(); k++;
      quiet(() => { if (typeof m === "string") fake.onmessage({ data: m }); else { fake.readyState = 3; fake.onclose(m.close); } });
    }
    return k;
  };
  real.onmessage = (ev) => { C.inb.push(String(ev.data)); if (auto) C.flushIn(); };
  real.onclose = (ev) => { C.closes.push({ code: ev.code, reason: ev.reason }); C.inb.push({ close: ev }); if (auto) C.flushIn(); };
  const savedWs = globalThis.WebSocket, savedLoc = globalThis.location;
  globalThis.WebSocket = class { constructor() { return fake; } };
  globalThis.location = { protocol: "http:", host: w.base };
  C.scope = rt.root.child();
  for (const s of cellsSpec) C.cells[s.key] = rt.cell(s.init);
  for (const s of cellsSpec) if (s.resetOn) rt.resetOn(C.scope, [C.cells[s.resetOn]], () => { C.cells[s.key].set(s.init); }, 0);
  try {
    quiet(() => rt.channel(C.scope, {
      name: "c", reconnect: 0, limits,
      cells: cellsSpec.map((s) => ({ key: s.key, cell: C.cells[s.key], table: s.table, ops: s.ops, edges: null })),
      open: null, close: null, error: null,
    }));
  } finally { globalThis.WebSocket = savedWs; globalThis.location = savedLoc; }
  C.real = real;
  C.quiet = quiet;
  fake.onopen();
  C.state = () => JSON.stringify(Object.fromEntries(Object.keys(C.cells).map((k) => [k, C.cells[k].peek()])));
  C.done = () => { try { real.close(); } catch { /* closed */ } C.scope.dispose(); };
  return C;
}

describe("A — the pacer: a frame is superseded only by the next frame of its cell, a `replace`", () => {
  // A fake clock and wire (`rate: 50, burst: 4` → a client bucket of 3, refilled at 47.5/s).
  function fakePacer() {
    let T = 0;
    const timers = [], sent = [], superseded = [], dropped = [];
    const p = rt.channelPacer({ rate: 50, burst: 4 }, {
      now: () => T,
      later: (f, ms) => { const h = { due: T + ms, f }; timers.push(h); return h; },
      cancel: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
      send: (text, ref) => { sent.push(ref); },
      superseded: (ref) => { superseded.push(ref); },
      dropped: (ref) => { dropped.push(ref); },
      coupled: () => false,
    });
    const run = (ms) => { const end = T + ms; while (T < end) { T += 1; for (const h of timers.filter((x) => x.due <= T)) { timers.splice(timers.indexOf(h), 1); h.f(); } } };
    p.open();
    const push = (key, op, tag) => p.push(key, op, tag, `${key}:${tag}`);
    return { p, push, run, sent, superseded, dropped };
  }

  test("queued: `replace`, `replace` → the first is superseded; `replace`, `append`, `replace` → all three are sent (M-pre)", () => {
    const F = fakePacer();
    F.push("z", "replace", "0"); F.push("z", "replace", "1"); F.push("z", "replace", "2");   // the bucket (3)
    F.push("x", "replace", "1"); F.push("y", "append", "1"); F.push("x", "replace", "2");    // another cell between: x:1 superseded
    expect(F.superseded).toEqual(["x:1"]);
    F.push("a", "replace", "1"); F.push("a", "append", "2"); F.push("a", "replace", "3");    // a:2 was made on a:1's value
    expect(F.superseded).toEqual(["x:1"]);
    F.push("a", "replace", "4");                                                             // a:3 is now the last of its cell
    expect(F.superseded).toEqual(["x:1", "a:3"]);
    F.run(300);
    expect(F.sent).toEqual(["z:0", "z:1", "z:2", "y:1", "x:2", "a:1", "a:2", "a:4"]);
    expect(F.dropped).toEqual([]);
  });

  test("re-send: a refused `replace` with a queued `append` and `replace` of its cell after it → it is re-sent (L1)", () => {
    const F = fakePacer();
    F.push("z", "replace", "0"); F.push("z", "replace", "1"); F.push("a", "replace", "1");   // the bucket (3)
    F.push("a", "append", "2"); F.push("a", "replace", "3");             // queued: a:2 was made on a:1's value
    expect(F.p.answered(true)).toBe("z:0");
    expect(F.p.answered(true)).toBe("z:1");
    expect(F.p.refused()).toBe("a:1");                                 // the queue's head now: a:1, a:2, a:3
    F.run(300);
    expect(F.superseded).toEqual([]);                                  // base: a:1 superseded by a:3, a:2 sent on the value before a:1
    expect(F.sent).toEqual(["z:0", "z:1", "a:1", "a:1", "a:2", "a:3"]);
    expect(F.dropped).toEqual([]);
    // both refused, [`replace`, `append`], and a queued `replace`: the `replace` is re-sent, the `append`
    // (whose next frame of its cell is the queued `replace`) superseded
    const H = fakePacer();
    H.push("a", "replace", "1"); H.push("a", "append", "2"); H.push("b", "replace", "1");
    H.push("a", "replace", "3");
    expect(H.p.refused()).toBe("a:1");
    expect(H.p.refused()).toBe("a:2");
    expect(H.p.answered(true)).toBe("b:1");                            // another cell: both refused are kept
    H.run(300);
    expect(H.superseded).toEqual(["a:2"]);
    expect(H.sent).toEqual(["a:1", "a:2", "b:1", "a:1", "a:3"]);
    const G = fakePacer();
    G.push("a", "replace", "1"); G.push("a", "replace", "2"); G.push("a", "append", "3");
    G.push("a", "replace", "4");
    expect(G.p.refused()).toBe("a:1"); expect(G.p.refused()).toBe("a:2"); expect(G.p.refused()).toBe("a:3");
    G.run(300);
    expect(G.superseded).toEqual(["a:1", "a:3"]);                      // a:1 by a:2 (nothing between); a:3 by a:4
    expect(G.sent).toEqual(["a:1", "a:2", "a:3", "a:2", "a:4"]);
  });
});

describe("B — served: an honest client is not closed by a supersede (§38.4.3)", () => {
  const SRC = (attrs) => `<program>
<channel name="c"${attrs}>
  <xs:int[0..=4, append, pop, replace]=([1])/>
  let <n:int=0/>
</channel>
<p>\${@xs.length} \${@n}</p>
</program>
`;
  const CELLS = [
    { key: "xs", init: [1], table: XS, ops: ["replace", "append", "pop"] },
    { key: "n", init: 0, table: INT, ops: ["replace"] },
  ];

  test("M-pre: queued `set([1])`, `append(40)`, `set([5])` on a bounded tape at its bound — not closed, nothing refused, peers agree", async () => {
    const w = await relay(SRC(" frame-rate=5 frame-burst=2"));
    try {
      const limits = { maxFrame: 65536, rate: 5, burst: 2 };     // a client bucket of 1
      const A = await client(w, CELLS, limits, { auto: true });
      await tick(200);
      A.quiet(() => {
        rt.batch(() => A.cells.xs.set([1, 2, 3, 4]));           // sent at once
        rt.batch(() => A.cells.xs.set([1]));                    // queued
        rt.batch(() => rt.append(A.cells.xs, 40));              // queued, made on [1] → [1, 40]
        rt.batch(() => A.cells.xs.set([5]));                    // queued; base: superseded [1]
      });
      await tick(1500);
      expect(A.closes).toEqual([]);
      expect(A.errs).toEqual([]);
      expect(A.wire).toBe(4);
      const J = await client(w, CELLS, limits, { auto: true });
      await tick(200);
      expect(J.state()).toBe(A.state());
      expect(A.cells.xs.peek()).toEqual([5]);
      expect(w.logs.join("\n")).not.toContain("clos");
      A.done(); J.done();
    } finally { w.stop(); }
  }, 30000);

  test("L1: `set([1])` refused for rate, `append(40)` and `set([5])` queued — `set([1])` is re-sent, so the `append` is judged on the value it was made on", async () => {
    let T = 1000;                                                // the relay's clock: frozen, so its bucket stays dry
    const w = await relay(SRC(" frame-rate=5 frame-burst=3"), { now: () => T });
    try {
      const limits = { maxFrame: 65536, rate: 5, burst: 3 };     // a client bucket of 2, refilled at 4.75/s (real time)
      const A = await client(w, CELLS, limits, { auto: true });
      await tick(200);
      A.quiet(() => rt.batch(() => A.cells.xs.set([1, 2, 3, 4])));   // the relay's bucket: 3 → 2
      await tick(300);
      A.quiet(() => rt.batch(() => A.cells.n.set(1)));                // 2 → 1
      await tick(300);
      A.quiet(() => {
        rt.batch(() => A.cells.n.set(2));                       // relayed: the relay's bucket 1 → 0 (the client's 2 → 1)
        rt.batch(() => A.cells.xs.set([1]));                    // sent: refused unread (the relay's bucket is dry)
        rt.batch(() => rt.append(A.cells.xs, 40));              // queued (the client's bucket is spent), made on [1]
        rt.batch(() => A.cells.xs.set([5]));                    // queued
      });
      expect(A.wire).toBe(4);
      // refused unread (reported, to be re-sent): the re-send waits behind the emptied bucket (~210 ms)
      expect(await until(() => A.errs.filter((e) => e.includes("re-sent, paced")).length === 1, 2000)).toBe(true);
      T += 10000;                                               // the relay's bucket refills
      await tick(1200);
      expect(A.closes).toEqual([]);
      expect(A.errs.filter((e) => /by the relay \(a concurrent|closed/.test(e))).toEqual([]);
      const J = await client(w, CELLS, limits, { auto: true });
      await tick(200);
      expect(J.state()).toBe(A.state());
      expect(A.cells.xs.peek()).toEqual([5]);
      expect(w.logs.join("\n")).not.toContain("clos");
      A.done(); J.done();
    } finally { w.stop(); }
  }, 30000);
});

describe("C — served fuzz: honest clients under a tight rate bound with stalls are never closed and converge", () => {
  const RATE = 5, BURST = 2;
  const SRC = `<program>
<channel name="c" frame-rate=${RATE} frame-burst=${BURST}>
  <xs:int[0..=4, append, prepend, pop, shift, replace]=([1])/>
  <ys:int[free, append, pop, replace]=([])/>
  let <n:int=0/>
  let <m:int=5 reset-on=[@n]/>
</channel>
<p>\${@xs.length} \${@ys.length} \${@n} \${@m}</p>
</program>
`;
  const CELLS = [
    { key: "xs", init: [1], table: XS, ops: ["replace", "append", "prepend", "pop", "shift"] },
    { key: "ys", init: [], table: YS, ops: ["replace", "append", "pop"] },
    { key: "n", init: 0, table: INT, ops: ["replace"] },
    { key: "m", init: 5, table: INT, ops: ["replace"], resetOn: "n" },
  ];
  const LIMITS = { maxFrame: 65536, rate: RATE, burst: BURST };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function op(C, R, v, xsReplace) {
    const c = C.cells, x = R();
    C.quiet(() => {
      try {
        rt.batch(() => {
          if (x < 0.15) c.n.set(v);
          else if (x < 0.25) c.m.set(v);
          else if (x < 0.40) { if (c.xs.peek().length < 4) rt.append(c.xs, v); }
          else if (x < 0.48) { if (c.xs.peek().length < 4) rt.prepend(c.xs, v); }
          else if (x < 0.56) { if (c.xs.peek().length > 0) rt.removeEnd(c.xs, 1); }
          else if (x < 0.62) { if (c.xs.peek().length > 0) rt.removeFront(c.xs, 1); }
          else if (x < 0.70) { if (xsReplace) c.xs.set([v % 7, v % 5].slice(0, 1 + (v % 2))); }
          else if (x < 0.88) rt.append(c.ys, v);
          else if (x < 0.95) { if (c.ys.peek().length > 0) rt.removeEnd(c.ys, 1); }
          else c.ys.set([v]);
        });
      } catch (e) { C.errs.push("LOCAL THROW " + e); }
    });
  }
  async function run(seed, xsReplace, { steps = 120, nClients = 3, pOp = 0.35, pHold = 0.03, holdMs = [100, 1200] } = {}) {
    const R = rng(seed);
    const w = await relay(SRC);
    const cs = [];
    try {
      for (let i = 0; i < nClients; i++) cs.push(await client(w, CELLS, LIMITS));
      await tick(50);
      for (const C of cs) C.flushIn();
      let v = 1;
      for (let s = 0; s < steps; s++) {
        for (const C of cs) {
          if (R() < pOp) op(C, R, v++, xsReplace);
          if (R() < pHold) C.holdUntil = Date.now() + holdMs[0] + R() * (holdMs[1] - holdMs[0]);
          C.flushOut(R() < 0.6 ? 1 : Infinity);                 // drip: frames bunch and spread
          C.flushIn(R() < 0.7 ? Infinity : 1);
        }
        await tick(5 + Math.floor(R() * 15));
      }
      // drain the pacing backlog: no traffic for 40 rounds of 25 ms (a token's refill at 4.75/s is ~210 ms)
      for (const C of cs) C.holdUntil = 0;
      let quietFor = 0;
      for (let i = 0; i < 1200 && quietFor < 40; i++) {
        let k = 0;
        for (const C of cs) { k += C.flushOut(); k += C.flushIn(); }
        quietFor = k === 0 ? quietFor + 1 : 0;
        await tick(25);
      }
      const J = await client(w, CELLS, LIMITS, { auto: true });
      await tick(250);
      const res = {
        joiner: J.state(),
        states: cs.map((C) => C.state()),
        closes: cs.map((C) => C.closes),
        broken: cs.flatMap((C) => C.errs.filter((e) => /closed the connection|LOCAL THROW|relay closed|broken/.test(e))),
        wire: cs.map((C) => C.wire),
        reSent: cs.map((C) => C.errs.filter((e) => e.includes("re-sent, paced")).length),
        relayLogs: w.logs.filter((l) => /clos/.test(l)),
      };
      for (const C of [...cs, J]) C.done();
      return res;
    } finally { w.stop(); }
  }
  for (const xsReplace of [true, false]) {
    for (const seed of [1, 2, 3, 4]) {
      test(`seed ${seed}${xsReplace ? "" : ", no bounded-tape replace"}: none closed, every client equals a fresh joiner`, async () => {
        const r = await run(seed, xsReplace);
        expect(r.closes).toEqual([[], [], []]);
        expect(r.broken).toEqual([]);
        expect(r.relayLogs).toEqual([]);
        for (const s of r.states) expect(s).toBe(r.joiner);
        expect(r.wire.every((n) => n > 20)).toBe(true);          // the fuzz did edit
      }, 120000);
    }
  }
});
