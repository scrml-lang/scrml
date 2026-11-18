// channel-fold-s479.test.js — s479-channel-relay-fold: SPEC §38.4.2 "The relay's fold" and §38.4.3
// "Per-address bounds (INTERIM)". Ruling: user-voice-scrml.md S479 "⭐ RULED — S478 hand-off §3.A and
// §3.B, PA recs adopted (S479, 2026-11-18)", item 7 — "the relay fold — a relay-computed state used to
// judge and close senders of refused frames, and as a compaction base in the replay … Per-address
// INTERIM bounds keyed by `server.requestIP` → yes".
//
//   A. the judge (served, real WebSockets): a forged frame the fold refuses — a fixed-length tape pop,
//      an op the cell's grants do not admit, a bounded append past its bound, an illegal `rule=` move —
//      is relayed to no one, logged nowhere, numbered never, and its sender is closed 1008; an honest
//      edit that lost a race is told `__refused` and stays open; every client converges.
//   B. compaction: past the log bound a channel with a fold sends its fold as the replay's `__base`, a
//      fresh joiner converges with the clients that lived through it (the reset-on= write included).
//   C. per-address bounds: two sockets from one address vs the frame bucket and the cap share; the
//      upgrade bucket; the cap keyed by the real `server.requestIP`.
//   D. which channels have a fold (print.scrml chFoldWhy) — the reason is printed as `noFold`.
//   E. the client's half (stand-in socket): `__base` and `__refused` are checked; a bad one is a
//      broken stream.
//
// RED ON BASE (8341538ba): 22 of these 27 tests fail. The relay relayed A's value-judged forgeries
// (past a bound, an illegal move) and the forger stayed open; past the bound a joiner was told the log
// was incomplete (B); one address could open the whole cap and reconnect for a full bucket (C); the
// server desc had no `init` / `noFold` (D); the client knew no `__base` / `__refused` (E). The five
// that pass on base: A's two forgeries the relay's type/grant check already refused (#1928, #1937),
// A's reset-on= convergence check (receivers already made that write), and E's two `__refused`
// broken-stream cases (on base any unknown message broke the stream).

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

const LOG_HOOK = Symbol.for("scrml.test.channelLog");
const ADDRESS_HOOK = Symbol.for("scrml.test.channelAddress");
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const frame = (key, op, val) => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val });
async function until(pred, ms = 3000) {
  for (let t = 0; t < ms / 20; t++) { if (pred()) return true; await tick(20); }
  return pred();
}

const APP = `<program>
type Phase:enum = { Idle, Loading, Done }
<channel name="c"__ATTRS__>
  <xs:string[free, append]=[]/>
  <ys:int[1..=3, append]=([1])/>
  <fx:int[replace]=([1, 2, 3])/>
  <dq:int[free, append, prepend, pop, shift]=([1, 2, 3])/>
  let <n:int=0/>
  let <m:int=5 reset-on=[@n]/>
  <phase:Phase=.Idle single>
    <Idle rule=(.Loading | .Done)></>
    <Loading rule=.Done></>
    <Done></>
  </>
</channel>
<p>\${@xs.length} \${@ys.length} \${@fx.length} \${@dq.length} \${@n} \${@m}</p>
</program>
`;
const EDGES = { Idle: ["Loading", "Done"], Loading: ["Done"], Done: [] };
const init = () => ({ xs: [], ys: [1], fx: [1, 2, 3], dq: [1, 2, 3], n: 0, m: 5, phase: "Idle" });

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
const app = (attrs = "") => APP.replace("__ATTRS__", attrs);

function descOf(clientJs) {
  const line = clientJs.split("\n").find((l) => l.startsWith("rt.channel(program$.scope, "));
  const lit = line.slice("rt.channel(program$.scope, ".length, -2)
    .replace(/program\$\.fields\[(\d+) \/\* (\w+) \*\/\]/g, (_, i, name) => `fields[${JSON.stringify(name)}]`)
    .replace(/program_phase_edges/g, "edges");
  return (fields) => new Function("fields", "edges", `return (${lit});`)(fields, rt.edges(EDGES));
}

// A served relay and a client factory; `raw` opens a hand-written socket (a forger, or an observer).
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
  const made = [];
  globalThis.WebSocket = class extends savedWs { constructor(u) { super(u); made.push(this); } };
  const mk = descOf(client.js);
  const clients = [];
  const live = (opts = {}) => {
    const scope = rt.root.child();
    const cells = {};
    for (const [k, v] of Object.entries(init())) cells[k] = rt.cell(v);
    rt.resetOn(scope, [cells.n], () => { cells.m.set(5); }, 0);    // the program's reset-on=[@n] of @m
    const hooks = { opens: 0, errors: 0 };
    const desc = mk(cells);
    desc.reconnect = opts.reconnect ?? 0;
    desc.open = () => { hooks.opens++; };
    desc.error = () => { hooks.errors++; };
    rt.channel(scope, desc);
    const X = { scope, cells, hooks, val: (k) => cells[k].peek(), state: () => JSON.stringify(Object.fromEntries(Object.keys(cells).map((k) => [k, cells[k].peek()]))) };
    clients.push(X);
    return X;
  };
  const raws = [];
  const raw = () => new Promise((resolve, reject) => {
    const ws = new savedWs(`ws://${base}/_scrml_ws/c`);
    const got = [];
    const replays = [];
    const refusals = [];
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

describe("A — the relay's fold judges a frame by the receiver's check (3) (§38.4.2 \"The relay's fold\")", () => {
  const FORGED = [
    ["a pop of a FIXED-length tape (it syncs no length-changing op)", frame("fx", "pop", 1), "not an op @fx syncs"],
    ["an op the cell's grants do not admit (a `replace` of an append-only tape)", frame("xs", "replace", ["forged"]), "not an op @xs syncs"],
    ["an append past the bounded tape's bound (ys holds 1 of 1..=3; two fit, the third does not)", [frame("ys", "append", 2), frame("ys", "append", 3), frame("ys", "append", 4)], "past its length bound 1..=3"],
    ["an illegal `rule=` move (.Idle → .Done is legal, .Done → .Loading is not)", [frame("phase", "transition", "Done"), frame("phase", "transition", "Loading")], "rule= graph forbids"],
  ];
  for (const [what, frames, reason] of FORGED) {
    test(`a forged frame — ${what} — is relayed to no one, never logged, and its sender is closed 1008`, async () => {
      const w = await world(app());
      try {
        const A = w.live();
        const obs = await w.raw();
        await until(() => A.hooks.opens === 1);
        const evil = await w.raw();
        for (const f of [].concat(frames)) evil.ws.send(f);
        expect(await until(() => evil.closed() !== null)).toBe(true);
        expect(evil.closed().code).toBe(1008);
        expect(evil.closed().reason).toContain(reason);
        const legal = [].concat(frames).length - 1;          // the frames before the forged one were legal
        expect(await until(() => obs.got.length === legal)).toBe(true);
        await tick(150);
        expect(obs.got.length).toBe(legal);                    // the forged frame reached no one
        expect(obs.got.map((f) => f.__seq)).toEqual(Array.from({ length: legal }, (_, i) => i + 1));
        const J = await w.raw();
        await until(() => J.replays.length === 1);
        expect(J.replays[0].__seq).toBe(legal);                // never numbered, never logged
        expect(J.replays[0].__frames.length).toBe(legal);
        expect(w.errs.join("\n")).not.toContain("refused");    // no receiver saw anything to refuse
        if (legal === 2) expect(A.val("ys")).toEqual([1, 2, 3]);
        if (reason === "rule= graph forbids") expect(A.val("phase")).toBe("Done");
      } finally { w.done(); }
    });
  }

  test("an honest edit that lost a race is told `__refused` (not closed), drops out of its sender's pending edits, and every client converges", async () => {
    const w = await world(app());
    try {
      const P = await w.raw();
      const Q = await w.raw();
      await until(() => P.replays.length === 1 && Q.replays.length === 1);
      P.ws.send(frame("ys", "append", 2));
      P.ws.send(frame("ys", "append", 3));                     // ys is full: 1, 2, 3
      expect(await until(() => Q.got.length === 2)).toBe(true);
      // Q sends an append it made before it saw P's frames (a concurrent edit came first)
      Q.ws.send(frame("ys", "append", 9));
      expect(await until(() => Q.refusals.length === 1)).toBe(true);
      expect(Q.refusals[0]).toEqual({ __type: "__refused", __key: "ys", __op: "append", __val: 9, __why: "an `append` of @ys past its length bound 1..=3" });
      await tick(150);
      expect(Q.closed()).toBe(null);
      expect(P.got.length).toBe(2);                            // relayed to no one
      // once refused, a later refusal of the same connection is explained too: still not closed
      Q.ws.send(frame("ys", "append", 10));
      expect(await until(() => Q.refusals.length === 2)).toBe(true);
      expect(Q.closed()).toBe(null);
    } finally { w.done(); }
  });

  test("two live clients race for the last place of a bounded tape: one wins everywhere, the loser's own edit is retired by `__refused`, no stream breaks", async () => {
    const w = await world(app());
    try {
      const A = w.live();
      const B = w.live();
      await until(() => A.hooks.opens === 1 && B.hooks.opens === 1);
      rt.batch(() => rt.appendWithin(A.cells.ys, 2, 1, 3, "t"));
      await until(() => B.val("ys").length === 2);
      rt.batch(() => rt.appendWithin(A.cells.ys, 10, 1, 3, "t"));
      rt.batch(() => rt.appendWithin(B.cells.ys, 20, 1, 3, "t"));
      await until(() => A.state() === B.state() && [JSON.stringify([1, 2, 10]), JSON.stringify([1, 2, 20])].includes(JSON.stringify(A.val("ys"))));
      await tick(200);
      expect(A.state()).toBe(B.state());
      expect([JSON.stringify([1, 2, 10]), JSON.stringify([1, 2, 20])]).toContain(JSON.stringify(A.val("ys")));
      const errs = w.errs.join("\n");
      expect(errs).not.toContain("closed the connection");
      expect(errs).toContain("by the relay (a concurrent edit came first in relay order)");
      const J = w.live();
      await until(() => J.hooks.opens === 1);
      expect(J.state()).toBe(A.state());
    } finally { w.done(); }
  });

  test("the fold makes the reset-on= write a frame causes (@n resets @m): a frame judged after it sees the reset value", async () => {
    const w = await world(app());
    try {
      const A = w.live();
      await until(() => A.hooks.opens === 1);
      rt.batch(() => A.cells.m.set(9));
      rt.batch(() => A.cells.n.set(1));                         // resets @m to 5 on every client, and in the fold
      await tick(300);
      expect(A.val("m")).toBe(5);
      const J = w.live();
      await until(() => J.hooks.opens === 1);
      expect(J.state()).toBe(A.state());
    } finally { w.done(); }
  });
});

describe("B — compaction: past the log bound the fold is the replay's `__base` (§38.4.2 \"The log bound\")", () => {
  test("A3 shape: one peer floods past the frame bound; a fresh joiner gets `__base` + the tail and converges with the clients that lived through it", async () => {
    const w = await world(app(), { [LOG_HOOK]: { frames: 20 } });
    try {
      const A = w.live();
      const B = w.live();
      await until(() => A.hooks.opens === 1 && B.hooks.opens === 1);
      const P = await w.raw();
      for (let i = 1; i <= 45; i++) P.ws.send(frame(i % 3 === 0 ? "xs" : "n", i % 3 === 0 ? "append" : "replace", i % 3 === 0 ? "x" + i : i));
      P.ws.send(frame("dq", "pop", 2));
      P.ws.send(frame("phase", "transition", "Loading"));
      expect(await until(() => P.got.length === 47)).toBe(true);
      rt.batch(() => B.cells.m.set(77));                        // a write after the last @n write: survives
      expect(await until(() => P.got.length === 48)).toBe(true);
      await until(() => A.state() === B.state());
      expect(w.logs.join("\n")).not.toContain("truncated");
      const R = await w.raw();
      await until(() => R.replays.length === 1);
      const rep = R.replays[0];
      expect(rep.__complete).toBe(true);
      expect(rep.__base).not.toBe(null);
      expect(Object.keys(rep.__base.__cells).sort()).toEqual(["dq", "fx", "m", "n", "phase", "xs", "ys"]);
      expect(rep.__frames.length).toBe(rep.__seq - rep.__base.__seq);
      expect(rep.__frames.length).toBeLessThanOrEqual(20);
      const J = w.live();
      await until(() => J.hooks.opens === 1);
      await until(() => J.state() === A.state());
      expect(J.hooks.errors).toBe(0);
      expect(J.state()).toBe(A.state());
      expect(J.state()).toBe(B.state());
      expect(J.val("phase")).toBe("Loading");
      expect(J.val("m")).toBe(77);
      // live traffic after a compacted replay: everyone follows
      rt.batch(() => rt.append(J.cells.xs, "after"));
      expect(await until(() => A.val("xs").at(-1) === "after" && B.val("xs").at(-1) === "after")).toBe(true);
      expect(w.errs.join("\n")).not.toContain("closed the connection");
    } finally { w.done(); }
  });

  test("a base over half the byte bound is not kept: the log is truncated and the fold dropped (fail closed, as before S479)", async () => {
    const w = await world(app(), { [LOG_HOOK]: { bytes: 400 } });
    try {
      const A = w.live();
      await until(() => A.hooks.opens === 1);
      const P = await w.raw();
      for (let i = 0; i < 6; i++) P.ws.send(frame("xs", "append", "y".repeat(40) + i));
      expect(await until(() => P.got.length === 6)).toBe(true);
      expect(w.logs.join("\n")).toContain("over half the log's byte bound");
      const R = await w.raw();
      await until(() => R.replays.length === 1);
      expect(R.replays[0]).toEqual({ __type: "__replay", __complete: false, __seq: 6, __base: null, __frames: [] });
    } finally { w.done(); }
  });

  test("the relay's own fold, never a client's value, is the base: a forged frame refused before compaction is in no replay", async () => {
    const w = await world(app(), { [LOG_HOOK]: { frames: 3 } });
    try {
      const P = await w.raw();
      for (let i = 1; i <= 5; i++) P.ws.send(frame("n", "replace", i));
      expect(await until(() => P.got.length === 5)).toBe(true);
      const evil = await w.raw();
      evil.ws.send(frame("phase", "transition", "Idle"));      // a self-write: a no-op, legal
      evil.ws.send(frame("ys", "prepend", 7));                  // ys does not sync prepend
      expect(await until(() => evil.closed() !== null)).toBe(true);
      const R = await w.raw();
      await until(() => R.replays.length === 1);
      const rep = R.replays[0];
      // compacted at the 4th frame (the log holds 3): the base is the fold after frame 4
      expect(rep.__base.__seq).toBe(4);
      expect(rep.__base.__cells.n).toBe(4);
      expect(rep.__base.__cells.m).toBe(5);
      expect(rep.__base.__cells.ys).toEqual([1]);
      expect(rep.__seq).toBe(6);                                // 5 replaces + the legal self-move; the prepend never numbered
      expect(rep.__frames.map((f) => f.__seq)).toEqual([5, 6]);
    } finally { w.done(); }
  });
});

describe("C — per-address bounds (§38.4.3, INTERIM, keyed by `server.requestIP`)", () => {
  // An address's frame bucket is CHANNEL_ADDRESS_BUCKETS (4) connections' worth, shared by all its
  // connections: with frame-burst=10, one address sends at most 40 frames in a burst, however many
  // sockets it opens and however often it reconnects (red on base: 10 parallel / 10 reconnect cycles
  // relayed 1000 frames — review #1942 MED-1).
  test("parallel sockets and reconnects from one address share ONE address bucket; another address gets its own", async () => {
    let addr = "10.0.0.1";
    const w = await world(app(" frame-rate=1 frame-burst=10"), { [ADDRESS_HOOK]: () => addr });
    try {
      const S = [];
      for (let k = 0; k < 4; k++) S.push(await w.raw());       // four parallel sockets, 10 frames each: 40
      for (let k = 0; k < 4; k++) for (let i = 1; i <= 10; i++) S[k].ws.send(frame("n", "replace", k * 100 + i));
      expect(await until(() => S.every((x) => x.got.length === 40))).toBe(true);
      expect(S.every((x) => x.closed() === null)).toBe(true);
      const S5 = await w.raw();                                 // a fifth: its own bucket is full, the address's is not
      S5.ws.send(frame("n", "replace", 500));
      expect(await until(() => S5.closed() !== null)).toBe(true);
      expect(S5.closed().code).toBe(1008);
      expect(S5.closed().reason).toContain("rate limit for one address");
      S[0].ws.close();                                          // reconnect cycling buys nothing
      const S6 = await w.raw();
      S6.ws.send(frame("n", "replace", 600));
      expect(await until(() => S6.closed() !== null)).toBe(true);
      expect(S6.closed().reason).toContain("rate limit for one address");
      addr = "10.0.0.2";
      const T = await w.raw();
      for (let i = 21; i <= 30; i++) T.ws.send(frame("n", "replace", i));
      expect(await until(() => T.got.length >= 10)).toBe(true);
      expect(T.closed()).toBe(null);
    } finally { w.done(); }
  });

  test("parallel sockets from one address hold at most a tenth of the cap (429); other addresses still get in; the channel-wide cap is 503", async () => {
    let addr = "10.0.0.1";
    const w = await world(app(" max-subscribers=20"), { [ADDRESS_HOOK]: () => addr });
    try {
      const up = async () => (await w.srv.fetch(new Request(`http://${w.base}/_scrml_ws/c`, { headers: { Upgrade: "websocket" } }), { upgrade: () => true }));
      expect(await up()).toBe(undefined);
      expect(await up()).toBe(undefined);
      expect((await up()).status).toBe(429);                    // ⌊20 / 10⌋ = 2 places for one address
      for (let i = 2; i <= 10; i++) {
        addr = "10.0.0." + i;
        expect(await up()).toBe(undefined);
        expect(await up()).toBe(undefined);
      }
      addr = "10.0.0.99";
      expect((await up()).status).toBe(503);                    // 20 distinct-address places: the cap
    } finally { w.done(); }
  });

  test("the upgrade bucket: one address cycling upgrades is answered 429 past its bucket", async () => {
    const w = await world(app(" max-subscribers=30"), { [ADDRESS_HOOK]: () => "10.9.9.9" });
    try {
      const statuses = [];
      for (let i = 0; i < 5; i++) {
        let data = null;
        const res = await w.srv.fetch(new Request(`http://${w.base}/_scrml_ws/c`, { headers: { Upgrade: "websocket" } }), { upgrade: (_r, o) => { data = o.data; return false; } });
        statuses.push(res.status);                              // 400: the host refused — the place is freed, the token spent
      }
      expect(statuses).toEqual([400, 400, 400, 429, 429]);      // a bucket of ⌊30 / 10⌋ = 3
    } finally { w.done(); }
  });

  test("keyed by the real `server.requestIP`: two sockets from 127.0.0.1 fill its share of max-subscribers=20; a third is refused", async () => {
    const w = await world(app(" max-subscribers=20"));
    try {
      const a = await w.raw();
      const b = await w.raw();
      await expect(w.raw()).rejects.toThrow();
      expect(a.closed()).toBe(null);
      expect(b.closed()).toBe(null);
      a.ws.close();
      await tick(1100);                                         // the upgrade bucket (2, refilled at 1/s) has a token again
      const c = await w.raw();                                  // a closed connection frees its place
      expect(c.closed()).toBe(null);
    } finally { w.done(); }
  });
});

describe("D — which channels have a fold (print.scrml chFoldWhy): the server desc prints `init` or why not", () => {
  const server = (src) => {
    const r = frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    return artifacts(r.core).server.js;
  };
  test("literal initializers, reset-on= among the channel's own cells: a fold (`noFold: \"\"`), its resets printed", () => {
    const js = server(app());
    expect(js).toContain(`resets: [{ cell: "m", on: ["n"], rank: 0, value: 5 }], noFold: ""`);
    expect(js).toContain(`{ key: "n", table: { defs: [], root: { k: "int" } }, ops: ["replace"], edges: null, init: 0 }`);
  });
  const NOT = [
    ["an initializer that reads another cell", (s) => s.replace("<channel", "let <seed:int=0/>\n<channel").replace("let <n:int=0/>", "let <n:int=@seed/>"), "@n's initializer is not a literal value"],
    ["a reset-on= triggered from outside the channel", (s) => s.replace("<channel", "let <k:int=0/>\n<channel").replace("reset-on=[@n]", "reset-on=[@k]"), "@m's reset-on= has a trigger that is not a cell of this channel"],
    ["a body-top statement that writes a channel cell at mount", (s) => s.replace("</channel>", "</channel>\n${ @n = 3; }"), "a body-top statement (§40.8) writes a cell of the channel"],
  ];
  for (const [what, edit, why] of NOT) {
    test(`no fold: ${what} — the reason is printed, and no cell carries \`init\``, () => {
      const js = server(edit(app()));
      expect(js).toContain(`noFold: "${why}`);
      expect(js).not.toContain("init: ");
      expect(js).toContain("resets: []");
    });
  }
});

describe("E — the client's half: `__base` and `__refused` are checked (stand-in socket)", () => {
  function standIn(cellsDesc) {
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
      rt.channel(scope, { name: "k", reconnect: 0, cells: cellsDesc, open: null, close: null, error: null });
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; }
    return { sock: socks[0], errs, raw: (v) => socks[0].onmessage({ data: typeof v === "string" ? v : JSON.stringify(v) }), done: () => { console.error = savedErr; scope.dispose(); } };
  }
  const XS = { defs: [], root: { k: "seq", elem: { k: "str" }, bound: { k: "free" } } };
  const INT = { defs: [], root: { k: "int" } };
  const sf = (seq, key, op, val, own = false) => ({ __type: "__sync", __seq: seq, __key: key, __op: op, __val: val, __own: own });
  const cells = () => {
    const xs = rt.cell([]);
    const n = rt.cell(0);
    return { xs, n, desc: [{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }, { key: "n", cell: n, table: INT, ops: ["replace"], edges: null }] };
  };

  test("a replay with a base: the cells start from it, the frames after it apply, live frames continue from `__seq`", () => {
    const c0 = cells();
    const c = standIn(c0.desc);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 12, __base: { __seq: 10, __cells: { xs: ["a", "b"], n: 4 } }, __frames: [sf(11, "xs", "append", "c"), sf(12, "n", "replace", 7)] });
      expect(c0.xs.peek()).toEqual(["a", "b", "c"]);
      expect(c0.n.peek()).toBe(7);
      c.raw(sf(13, "xs", "append", "d"));
      expect(c0.xs.peek()).toEqual(["a", "b", "c", "d"]);
      expect(c.sock.closed).toBe(0);
    } finally { c.done(); }
  });

  const BROKEN = [
    ["a base missing a cell", { __type: "__replay", __complete: true, __seq: 1, __base: { __seq: 1, __cells: { xs: [] } }, __frames: [] }, "does not hold exactly the channel's cells"],
    ["a base with a value that does not decode", { __type: "__replay", __complete: true, __seq: 1, __base: { __seq: 1, __cells: { xs: [1], n: 0 } }, __frames: [] }, "__base value of @xs does not decode"],
    ["a base past the replay's __seq", { __type: "__replay", __complete: true, __seq: 1, __base: { __seq: 2, __cells: { xs: [], n: 0 } }, __frames: [] }, "__base is not {__seq, __cells}"],
    ["frames that do not follow the base", { __type: "__replay", __complete: true, __seq: 3, __base: { __seq: 1, __cells: { xs: [], n: 0 } }, __frames: [sf(1, "n", "replace", 1), sf(2, "n", "replace", 2)] }, "is not the relayed frame numbered 2"],
    ["a replay without __base (the S478 shape)", { __type: "__replay", __complete: true, __seq: 0, __frames: [] }, "first frame is not the relay's __replay"],
  ];
  for (const [what, msg, needle] of BROKEN) {
    test(`a broken stream — ${what} — applies nothing and closes the connection`, () => {
      const c0 = cells();
      const c = standIn(c0.desc);
      try {
        c.raw(msg);
        expect(c0.xs.peek()).toEqual([]);
        expect(c0.n.peek()).toBe(0);
        expect(c.sock.closed).toBe(1);
        expect(c.errs.join("\n")).toContain(needle);
      } finally { c.done(); }
    });
  }

  test("`__refused` retires the oldest pending edit: not shown, reported once, the next own echo matches the next pending edit", () => {
    const c0 = cells();
    const c = standIn(c0.desc);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
      rt.batch(() => rt.append(c0.xs, "lost"));
      rt.batch(() => rt.append(c0.xs, "kept"));
      expect(c0.xs.peek()).toEqual(["lost", "kept"]);
      c.raw({ __type: "__refused", __key: "xs", __op: "append", __val: "lost", __why: "a concurrent edit came first" });
      expect(c0.xs.peek()).toEqual(["kept"]);
      expect(c.errs.join("\n")).toContain("refused this client's own edit, by the relay");
      c.raw(sf(1, "xs", "append", "kept", true));
      expect(c0.xs.peek()).toEqual(["kept"]);
      expect(c.sock.closed).toBe(0);
    } finally { c.done(); }
  });

  for (const [what, msg] of [
    ["one that is not the oldest pending edit", { __type: "__refused", __key: "xs", __op: "append", __val: "other", __why: "x" }],
    ["one with an extra key", { __type: "__refused", __key: "xs", __op: "append", __val: "mine", __why: "x", __seq: 1 }],
  ]) {
    test(`a \`__refused\` — ${what} — is a broken stream`, () => {
      const c0 = cells();
      const c = standIn(c0.desc);
      try {
        c.raw({ __type: "__replay", __complete: true, __seq: 0, __base: null, __frames: [] });
        rt.batch(() => rt.append(c0.xs, "mine"));
        c.raw(msg);
        expect(c.sock.closed).toBe(1);
      } finally { c.done(); }
    });
  }
});
