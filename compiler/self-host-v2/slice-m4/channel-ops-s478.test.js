// channel-ops-s478.test.js — s478-boot-channel-ops: SPEC §38.4.2 op-based channel sync (RULED S478
// "⭐ RULED — §38.4 op-based channel sync": "A channel cell syncs the granted EDIT, not the whole
// value … each receiving client checks the operation against the cell's declared grants (and a
// `rule=` graph / lifecycle against its CURRENT value) before applying it, and refuses a frame that
// fails … ends the concurrent-append last-writer-wins loss").
//
//   E. compiled from source, served by the program's own server artifact (Bun.serve + real
//      WebSockets), two `rt.channel` clients built from the desc the client artifact prints: an
//      honest append / pop / transition syncs; two concurrent appends both survive on every client;
//      the relay refuses a frame whose op the cell does not sync (the #1928 review's HIGH-1 attacks).
//   F. the RECEIVER's own checks (a compromised or buggy relay): frames injected straight into a
//      client's socket — a truncating `replace`, a growing op on a pop-only tape, an append past a
//      length bound, an illegal `rule=` move, a bad count, a wrong-typed element — are each refused
//      (not applied, reported) and the connection stays open.
//
// RED ON BASE (28fc2d031): every program here was E-BOOTSTRAP-UNSUPPORTED ("the bootstrap syncs a
// channel cell as its whole value"), the frame had no `__op`, and the receiver applied any decoded
// value by a whole-value write.

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

const APP = `<program>
type Phase:enum = { Idle, Loading, Done }
<channel name="c">
  <xs:string[free, append]=[]/>
  <ys:int[1..=3, append]=([1])/>
  <ps:int[free, pop]=([1, 2, 3])/>
  let <n:int=0/>
  <phase:Phase=.Idle single>
    <Idle rule=.Loading></>
    <Loading rule=.Done></>
    <Done></>
  </>
  function add(s: string) { @xs.append(s); }
</channel>
<p>\${@xs.length} \${@ys.length} \${@ps.length} \${@n}</p>
<button onclick=add("a")>a</button>
<button onclick={ @phase = .Loading; }>go</button>
</program>
`;

let compiled;
function compile() {
  if (compiled) return compiled;
  const r = frontEnd(mods(), [{ path: "app.scrml", src: APP }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  const { client, server } = artifacts(r.core);
  expect(client.refused).toEqual([]);
  expect(server.refused).toEqual([]);
  compiled = { r, client, server };
  return compiled;
}

// The `rt.channel(…)` desc the client artifact prints, evaluated against fresh cells (one client).
function printedDesc(clientJs) {
  const line = clientJs.split("\n").find((l) => l.startsWith("rt.channel(program$.scope, "));
  expect(line).toBeDefined();
  const fields = {};
  const lit = line.slice("rt.channel(program$.scope, ".length, -2)
    .replace(/program\$\.fields\[(\d+) \/\* (\w+) \*\/\]/g, (_, i, name) => `fields[${JSON.stringify(name)}]`)
    .replace(/program_phase_edges/g, "edges");
  return (cells) => {
    for (const k of Object.keys(cells)) fields[k] = cells[k];
    const edges = rt.edges({ Idle: ["Loading"], Loading: ["Done"], Done: [] });
    return new Function("fields", "edges", `return (${lit});`)(fields, edges);
  };
}

const fresh = () => ({ xs: rt.cell([]), ys: rt.cell([1]), ps: rt.cell([1, 2, 3]), n: rt.cell(0), phase: rt.cell("Idle") });

async function served() {
  const { r, client, server } = compile();
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (s) => logs.push(s) });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, s) => srv.fetch(req, s), websocket: srv.websocket });
  return { client, bun, base: `127.0.0.1:${bun.port}`, logs };
}

// S478 open-Qs items 50–51 (§38.4.2): the relay's first message is the `__replay` of its frame log
// (`replays`); every relayed frame carries `__seq` and `__own` — `frames` keeps them whole, `got`
// keeps the relayed edit without them.
function connect(base, path) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}${path}`);
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
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const frame = (key, op, val) => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val });
// A socket stand-in's delivery as the relay makes it (§38.4.2): the replay first, then each frame
// numbered in turn (`__seq`), as a peer's (`__own: false`) unless `own`.
const EMPTY_REPLAY = JSON.stringify({ __type: "__replay", __complete: true, __seq: 0, __frames: [] });
function relayer(sock) {
  let seq = 0;
  sock.onmessage({ data: EMPTY_REPLAY });
  return (text, own = false) => {
    let v = null;
    try { v = JSON.parse(text); } catch { /* delivered as is */ }
    if (v !== null && typeof v === "object" && !Array.isArray(v)) { seq += 1; text = JSON.stringify({ ...v, __seq: seq, __own: own }); }
    sock.onmessage({ data: text });
  };
}

describe("E — §38.4.2 op sync end to end (compiled from source, served)", () => {
  test("the printed client desc names each cell's ops (and the engine's edge table); the server's too", () => {
    const { client, server } = compile();
    expect(client.js).toContain(`{ key: "xs", cell: program$.fields[0 /* xs */], table: { defs: [], root: { k: "seq", elem: { k: "str" }, bound: { k: "free" } } }, ops: ["append"], edges: null }`);
    expect(client.js).toContain(`ops: ["transition"], edges: program_phase_edges }`);
    expect(server.js).toContain(`{ key: "ps", table: { defs: [], root: { k: "seq", elem: { k: "int" }, bound: { k: "free" } } }, ops: ["pop"] }`);
    expect(server.js).toContain(`{ key: "ys", table: { defs: [], root: { k: "seq", elem: { k: "int" }, bound: { k: "bounded", min: 1, max: 3 } } }, ops: ["append"] }`);
  });

  async function twoClients() {
    const s = await served();
    const saved = globalThis.location;
    globalThis.location = { protocol: "http:", host: s.base };
    const mkDesc = printedDesc(s.client.js);
    const mk = () => {
      const scope = rt.root.child();
      const cells = fresh();
      rt.channel(scope, mkDesc(cells));
      return { scope, cells };
    };
    const a = mk();
    const b = mk();
    const raw = await connect(s.base, "/_scrml_ws/c");
    await tick(250);
    return { a, b, raw, s, done: () => { a.scope.dispose(); b.scope.dispose(); raw.ws.close(); globalThis.location = saved; s.bun.stop(true); } };
  }

  test("an honest append syncs as `append` — the receiver extends ITS value; a peer sees one frame per write", async () => {
    const t = await twoClients();
    try {
      rt.batch(() => rt.append(t.a.cells.xs, "one"));
      await tick();
      expect(t.b.cells.xs.peek()).toEqual(["one"]);
      expect(t.raw.got).toEqual([{ __type: "__sync", __key: "xs", __op: "append", __val: "one" }]);
      // two writes in one batch are two frames, in write order (§38.4.2: "not merged")
      rt.batch(() => { rt.append(t.a.cells.xs, "two"); rt.append(t.a.cells.xs, "three"); });
      await tick();
      expect(t.b.cells.xs.peek()).toEqual(["one", "two", "three"]);
      expect(t.raw.got.slice(1).map((f) => f.__val)).toEqual(["two", "three"]);
      // b applied them and sent nothing back (the relay would have shown it to the raw peer)
      expect(t.raw.got.length).toBe(3);
    } finally { t.done(); }
  });

  test("two concurrent appends BOTH survive on every client (no last-writer-wins loss)", async () => {
    const t = await twoClients();
    try {
      rt.batch(() => rt.append(t.a.cells.xs, "from-a"));
      rt.batch(() => rt.append(t.b.cells.xs, "from-b"));
      await tick(250);
      expect([...t.a.cells.xs.peek()].sort()).toEqual(["from-a", "from-b"]);
      expect([...t.b.cells.xs.peek()].sort()).toEqual(["from-a", "from-b"]);
      // the order of two concurrent elements may differ between clients (§38.4.2 "Ordering", open)
    } finally { t.done(); }
  });

  test("an honest pop, a bounded append and a legal `rule=` move sync; `let` syncs `replace`", async () => {
    const t = await twoClients();
    try {
      rt.batch(() => rt.removeEnd(t.a.cells.ps, 1));
      rt.batch(() => rt.appendWithin(t.a.cells.ys, 2, 1, 3, "app.scrml:1:1"));
      rt.batch(() => rt.transition(t.a.cells.phase, rt.edges({ Idle: ["Loading"], Loading: ["Done"], Done: [] }), "Loading"));
      rt.batch(() => t.a.cells.n.set(7));
      await tick(200);
      expect(t.b.cells.ps.peek()).toEqual([1, 2]);
      expect(t.b.cells.ys.peek()).toEqual([1, 2]);
      expect(t.b.cells.phase.peek()).toBe("Loading");
      expect(t.b.cells.n.peek()).toBe(7);
      expect(t.raw.got.map((f) => [f.__key, f.__op, f.__val])).toEqual([["ps", "pop", 1], ["ys", "append", 2], ["phase", "transition", "Loading"], ["n", "replace", 7]]);
    } finally { t.done(); }
  });

  // the #1928 review's HIGH-1 attacks, through the served relay
  const RELAY_REFUSES = [
    ["P-client-append-truncation: a `replace` of an append-only tape", frame("xs", "replace", ["forged"])],
    ["GRANT-ONLY-POP: an `append` that grows a pop-only tape", frame("ps", "append", 9)],
    ["P-bounded-tape: a `replace` of a bounded append-only tape", frame("ys", "replace", [9])],
    ["ENGINE: a `replace` of a `rule=` field (only `transition` is synced)", frame("phase", "replace", "Done")],
    ["a pop count of 0", frame("ps", "pop", 0)],
    ["a wrong-typed element", frame("xs", "append", 1)],
  ];
  for (const [what, f] of RELAY_REFUSES) {
    test(`the relay refuses ${what} — the sender is closed (1007/1008) and no client changes`, async () => {
      const t = await twoClients();
      try {
        const evil = await connect(t.s.base, "/_scrml_ws/c");
        await tick();
        evil.ws.send(f);
        await tick(200);
        expect([1007, 1008]).toContain(evil.closed()?.code);
        expect(t.raw.got).toEqual([]);
        expect(t.a.cells.xs.peek()).toEqual([]);
        expect(t.a.cells.ps.peek()).toEqual([1, 2, 3]);
        expect(t.a.cells.ys.peek()).toEqual([1]);
        expect(t.a.cells.phase.peek()).toBe("Idle");
      } finally { t.done(); }
    });
  }

  test("a frame the relay must pass (its op is granted) but the receiver's CURRENT value forbids — an illegal move — is refused by every receiver", async () => {
    const t = await twoClients();
    const errs = [];
    const saved = console.error;
    console.error = (m) => errs.push(String(m));
    try {
      const evil = await connect(t.s.base, "/_scrml_ws/c");
      await tick();
      evil.ws.send(frame("phase", "transition", "Done"));   // .Idle → .Done is not an edge
      await tick(200);
      expect(evil.closed()).toBe(null);                      // the server cannot judge it (stateless)
      expect(t.raw.got).toEqual([{ __type: "__sync", __key: "phase", __op: "transition", __val: "Done" }]);
      expect(t.a.cells.phase.peek()).toBe("Idle");
      expect(t.b.cells.phase.peek()).toBe("Idle");
      expect(errs.filter((e) => e.includes("refused a `transition` of @phase")).length).toBe(2);
      evil.ws.close();
    } finally { console.error = saved; t.done(); }
  });
});

describe("F — the receiver's checks (§38.4.2), frames injected past the relay", () => {
  // a socket stand-in: open at once; the test injects frames as the relay would deliver them
  function client() {
    const saved = globalThis.WebSocket;
    const socks = [];
    globalThis.WebSocket = class { constructor(url) { this.url = url; this.readyState = 1; this.sent = []; socks.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() {} };
    const savedLoc = globalThis.location;
    globalThis.location = { protocol: "http:", host: "127.0.0.1:1" };
    const errs = [];
    const savedErr = console.error;
    console.error = (m) => errs.push(String(m));
    const scope = rt.root.child();
    const cells = fresh();
    try {
      rt.channel(scope, printedDesc(compile().client.js)(cells));
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; }
    const sock = socks[0];
    const deliver = relayer(sock);
    return {
      cells, sock, errs,
      deliver,
      done: () => { console.error = savedErr; scope.dispose(); },
    };
  }

  const REFUSED = [
    ["a truncating `replace` of an append-only tape (P-client-append-truncation)", "xs", frame("xs", "replace", ["forged"]), "whose grants do not admit it"],
    ["a growing `append` of a pop-only tape (GRANT-ONLY-POP)", "ps", frame("ps", "append", 9), "whose grants do not admit it"],
    ["a growing `replace` of a pop-only tape", "ps", frame("ps", "replace", [1, 2, 3, 4]), "whose grants do not admit it"],
    ["an append past the bound 1..=3 from the CURRENT length (P-bounded-tape)", "ys", null, "past its length bound"],
    ["an illegal `rule=` move .Idle → .Done (ENGINE)", "phase", frame("phase", "transition", "Done"), "its rule= graph forbids"],
    ["a move to a variant the enum has not", "phase", frame("phase", "transition", "Gone"), "does not decode"],
    ["a pop count that is not an int ≥ 1", "ps", frame("ps", "pop", 0), "not an int ≥ 1"],
    ["a wrong-typed element", "xs", frame("xs", "append", 5), "does not decode"],
    ["the pre-§38.4.2 whole-value frame (no __op) — a broken stream: the connection is closed", "n", JSON.stringify({ __type: "__sync", __key: "n", __val: 3 }), "closed the connection: a frame that is not exactly {__type, __seq, __key, __op, __val, __own}"],
    ["an op the bootstrap does not apply, on a cell that syncs `replace`", "n", frame("n", "set", 3), "whose grants do not admit it"],
  ];
  for (const [what, key, f, needle] of REFUSED) {
    test(`refused, not applied, reported: ${what}`, () => {
      const c = client();
      try {
        let text = f;
        if (text === null) {
          // fill ys to its bound first (two legal appends from 1 → 3), then one more
          c.deliver(frame("ys", "append", 2));
          c.deliver(frame("ys", "append", 3));
          expect(c.cells.ys.peek()).toEqual([1, 2, 3]);
          text = frame("ys", "append", 4);
        }
        const before = JSON.stringify(c.cells[key].peek());
        c.deliver(text);
        expect(JSON.stringify(c.cells[key].peek())).toBe(before);
        expect(c.errs.join("\n")).toContain(needle);
        expect(c.sock.sent).toEqual([]);            // nothing applied, so nothing sent on
      } finally { c.done(); }
    });
  }

  test("accepted frames apply the edit to the CURRENT value, exactly as the local write would, and are not sent on", () => {
    const c = client();
    try {
      c.deliver(frame("xs", "append", "a"));
      c.deliver(frame("ps", "pop", 2));
      c.deliver(frame("phase", "transition", "Loading"));
      c.deliver(frame("phase", "transition", "Loading"));     // a self-write is a no-op (§51.0.F.1)
      c.deliver(frame("n", "replace", 4));
      expect(c.cells.xs.peek()).toEqual(["a"]);
      expect(c.cells.ps.peek()).toEqual([1]);
      expect(c.cells.phase.peek()).toBe("Loading");
      expect(c.cells.n.peek()).toBe(4);
      expect(c.errs).toEqual([]);
      expect(c.sock.sent).toEqual([]);
      // a pop past the start leaves the tape empty, as a local pop does
      c.deliver(frame("ps", "pop", 5));
      expect(c.cells.ps.peek()).toEqual([]);
      // and a LOCAL write after them is sent as its op
      rt.batch(() => rt.append(c.cells.xs, "b"));
      expect(c.sock.sent).toEqual([{ __type: "__sync", __key: "xs", __op: "append", __val: "b" }]);
    } finally { c.done(); }
  });

  test("a part write of a `replace` cell is sent as `replace` (INTERIM — §38.4.2 `set` not built)", () => {
    const saved = globalThis.WebSocket;
    const socks = [];
    globalThis.WebSocket = class { constructor() { this.readyState = 1; this.sent = []; socks.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() {} };
    const savedLoc = globalThis.location;
    globalThis.location = { protocol: "http:", host: "127.0.0.1:1" };
    const scope = rt.root.child();
    const pt = rt.cell({ x: 1, y: 2 });
    const PT = { defs: [{ k: "struct", name: "Pt", fields: [{ name: "x", ty: { k: "int" } }, { name: "y", ty: { k: "int" } }] }], root: { k: "ref", def: 0 } };
    try {
      rt.channel(scope, { name: "p", reconnect: 0, cells: [{ key: "pt", cell: pt, table: PT, ops: ["replace"], edges: null }], open: null, close: null, error: null });
      relayer(socks[0]);
      rt.batch(() => rt.setIn(pt, ["x"], 5));
      expect(socks[0].sent).toEqual([{ __type: "__sync", __key: "pt", __op: "replace", __val: { x: 5, y: 2 } }]);
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; scope.dispose(); }
  });
});

// #1937 fix r1 — the S239 review's HIGH-1 (`fixedpop`) and MED-1, defence in depth past the compiler.
//   HIGH-1: §66.12.1 "a sequence with no grants is fully constrained — immutable"; §66.12.2 length
//   "fixed · bounded · free". A FIXED-length tape's length no local write may change
//   (E-WRITE-INVARIANT), so §38.4.2 receiver check (3) ("keeps every invariant a local write of
//   the same edit is checked against") refuses a length-changing op, and the relay refuses it from
//   the table it holds. The compiler syncs no such op (channel-s478 B2); these tests hand the
//   relay and the receiver a desc that lists them anyway (a compromised compiler / relay).
//   MED-1: §66.13.2 "A write to such a field is valid iff it follows an edge of the graph from the
//   current state" — the sink sends `transition` only for a write that IS a move.
// RED ON c16e69503: the relay passed the forged pop / shift and every receiver applied it
// (lengthBound read `fixed` as unbounded); the sink sent any write of a `rule=` field as `transition`.
describe("G — #1937 fix r1: fixed-length tapes and `rule=` writes", () => {
  const FIXED = `<program>
<channel name="c">
  <fx:int[replace]=([1, 2, 3])/>
</channel>
<p>\${@fx.length}</p>
</program>
`;
  test("the relay refuses a length-changing op of a FIXED-length tape (1008, relayed to no one) even when its table lists the op", async () => {
    const r = frontEnd(mods(), [{ path: "app.scrml", src: FIXED }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const { server } = artifacts(r.core);
    const fixedRoot = `{ key: "fx", table: { defs: [], root: { k: "seq", elem: { k: "int" }, bound: { k: "fixed" } } }, ops: ["replace"] }`;
    expect(server.js).toContain(fixedRoot);
    const forgedJs = server.js.replace(fixedRoot, fixedRoot.replace(`ops: ["replace"]`, `ops: ["replace", "append", "prepend", "pop", "shift"]`));
    const mod = await loadServer(forgedJs, r.core);
    const srv = mod.createServer({ root: "/tmp", log: () => {} });
    const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, s) => srv.fetch(req, s), websocket: srv.websocket });
    const base = `127.0.0.1:${bun.port}`;
    try {
      for (const [op, val] of [["pop", 2], ["shift", 1], ["append", 9], ["prepend", 0]]) {
        const peer = await connect(base, "/_scrml_ws/c");
        const evil = await connect(base, "/_scrml_ws/c");
        await tick();
        evil.ws.send(frame("fx", op, val));
        await tick(200);
        expect(evil.closed()?.code).toBe(1008);
        expect(evil.closed()?.reason).toContain("fixed-length");
        expect(peer.got).toEqual([]);
        peer.ws.close();
      }
      // a `replace` of it still relays
      const peer = await connect(base, "/_scrml_ws/c");
      const ok = await connect(base, "/_scrml_ws/c");
      await tick();
      ok.ws.send(frame("fx", "replace", [7, 8, 9]));
      await tick(200);
      expect(ok.closed()).toBe(null);
      expect(peer.got).toEqual([{ __type: "__sync", __key: "fx", __op: "replace", __val: [7, 8, 9] }]);
      peer.ws.close(); ok.ws.close();
    } finally { bun.stop(true); }
  });

  // a hand-built client desc (the socket stand-in of F)
  function handClient(cells) {
    const saved = globalThis.WebSocket;
    const socks = [];
    globalThis.WebSocket = class { constructor() { this.readyState = 1; this.sent = []; socks.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() {} };
    const savedLoc = globalThis.location;
    globalThis.location = { protocol: "http:", host: "127.0.0.1:1" };
    const errs = [];
    const savedErr = console.error;
    console.error = (m) => errs.push(String(m));
    const scope = rt.root.child();
    try {
      rt.channel(scope, { name: "c", reconnect: 0, cells, open: null, close: null, error: null });
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; }
    const sock = socks[0];
    return { sock, errs, deliver: relayer(sock), done: () => { console.error = savedErr; scope.dispose(); } };
  }

  test("the receiver refuses a length-changing op of a FIXED-length tape (the review's fixedpop frames), even when its desc lists the op", () => {
    const fx = rt.cell([1, 2, 3]);
    const FX = { defs: [], root: { k: "seq", elem: { k: "int" }, bound: { k: "fixed" } } };
    const c = handClient([{ key: "fx", cell: fx, table: FX, ops: ["replace", "append", "prepend", "pop", "shift"], edges: null }]);
    try {
      c.deliver(frame("fx", "pop", 2));
      c.deliver(frame("fx", "shift", 1));
      c.deliver(frame("fx", "append", 4));
      c.deliver(frame("fx", "prepend", 0));
      expect(fx.peek()).toEqual([1, 2, 3]);
      expect(c.errs.filter((e) => e.includes("a fixed-length tape")).length).toBe(4);
      c.deliver(frame("fx", "replace", [5, 6, 7]));
      expect(fx.peek()).toEqual([5, 6, 7]);
      expect(c.sock.sent).toEqual([]);
    } finally { c.done(); }
  });

  test("a `rule=` field's write is sent as `transition` only when it is a move; a non-move write is reported, not sent", () => {
    const ph = rt.cell("Idle");
    const E = rt.edges({ Idle: ["Loading"], Loading: ["Done"], Done: [] });
    const c = handClient([{ key: "ph", cell: ph, table: phaseTable(), ops: ["transition"], edges: E }]);
    try {
      rt.batch(() => rt.transition(ph, E, "Loading"));          // a runtime-checked move (tagged)
      rt.batch(() => ph.set("Done"));                           // a statically checked move (plain set along an edge)
      rt.batch(() => ph.set("Idle"));                           // NOT a move (.Done → .Idle): what a `let` reset() wrote
      expect(c.sock.sent.map((f) => [f.__op, f.__val])).toEqual([["transition", "Loading"], ["transition", "Done"]]);
      expect(c.errs.join("\n")).toContain("not a move along its rule= graph");
    } finally { c.done(); }
  });

  // the engine table the APP's client desc prints for @phase (so the test encodes as the compiler does)
  function phaseTable() {
    const line = compile().client.js.split("\n").find((l) => l.startsWith("rt.channel(program$.scope, "));
    const m = line.match(/\{ key: "phase", cell: [^,]+, table: (\{.*?\}), ops: \["transition"\]/);
    expect(m).not.toBe(null);
    return new Function(`return (${m[1]});`)();
  }
});

// ---------------------------------------------------------------------------------------------
// S478 open-Qs ruling (user-voice), items 50–53 (s478-ruled-channel-sync2) — §38.4.2 "Ordering —
// relay order", "What converges", "The frame log", "The log bound", the derived-write sentence and
// the rate-limited report. Every client below is `rt.channel` built from the desc the client
// artifact prints, over a real Bun.serve relay with real WebSockets.
//   item 50: "the relay echoes every frame to ALL subscribers, the sender included, with a
//   per-channel sequence number. Each client keeps its own pending edits and rebases them onto the
//   relayed order, so every client converges on relay order."
//   item 51: "the relay keeps a bounded per-channel log of the relayed (already validated) frames
//   and replays it to a new subscriber on open. Each frame is re-checked by the joiner's receiver"
//   item 53: "it stays local and is not sent, because every receiver derives it itself from the
//   same received edit … `applying` would cover the whole received batch"
// RED ON b04fdc27a: two concurrent edits left the clients with different values (H), a joiner or a
// reconnecting client started from the initializers and never caught up (I), and in the reset-on
// cascade every receiver re-sent its own reset, so A's later write lost (J).
// ---------------------------------------------------------------------------------------------
const CONV = `<program>
type Phase:enum = { Idle, Loading, Done }
<channel name="c">
  <xs:string[free, append]=[]/>
  <ys:int[1..=3, append]=([1])/>
  <dq:int[free, append, prepend, pop, shift]=([1, 2, 3])/>
  let <n:int=0/>
  let <m:int=5 reset-on=[@n]/>
  <phase:Phase=.Idle single>
    <Idle rule=(.Loading | .Done)></>
    <Loading rule=.Done></>
    <Done></>
  </>
</channel>
<p>\${@xs.length} \${@ys.length} \${@dq.length} \${@n} \${@m}</p>
</program>
`;
const CONV_EDGES = { Idle: ["Loading", "Done"], Loading: ["Done"], Done: [] };
const convInit = () => ({ xs: [], ys: [1], dq: [1, 2, 3], n: 0, m: 5, phase: "Idle" });
let convCompiled;
function compileConv() {
  if (convCompiled) return convCompiled;
  const r = frontEnd(mods(), [{ path: "app.scrml", src: CONV }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  const { client, server } = artifacts(r.core);
  expect(client.refused).toEqual([]);
  expect(server.refused).toEqual([]);
  expect(client.js).toContain(`const program_phase_edges = rt.edges({ Idle: ["Loading", "Done"], Loading: ["Done"], Done: [] });`);
  expect(client.js).toContain(`ops: ["append", "prepend", "pop", "shift"]`);
  convCompiled = { r, client, server };
  return convCompiled;
}
function convDesc(clientJs) {
  const line = clientJs.split("\n").find((l) => l.startsWith("rt.channel(program$.scope, "));
  const lit = line.slice("rt.channel(program$.scope, ".length, -2)
    .replace(/program\$\.fields\[(\d+) \/\* (\w+) \*\/\]/g, (_, i, name) => `fields[${JSON.stringify(name)}]`)
    .replace(/program_phase_edges/g, "edges");
  return (fields) => new Function("fields", "edges", `return (${lit});`)(fields, rt.edges(CONV_EDGES));
}

// A served relay and a client factory. Every socket a client opens is recorded (`made`) so a test
// can drop one; the `reset-on=[@n]` rule of @m is wired by hand, as the program body would.
async function convWorld(host = {}) {
  const { r, client, server } = compileConv();
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (s) => logs.push(s), ...host });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, s) => srv.fetch(req, s), websocket: srv.websocket });
  const base = `127.0.0.1:${bun.port}`;
  const savedLoc = globalThis.location;
  const savedWs = globalThis.WebSocket;
  const savedErr = console.error;
  const errs = [];
  console.error = (m) => errs.push(String(m));
  globalThis.location = { protocol: "http:", host: base };
  const made = [];
  globalThis.WebSocket = class extends savedWs { constructor(u) { super(u); made.push(this); } };
  const mk = convDesc(client.js);
  const clients = [];
  const live = (opts = {}) => {
    const scope = rt.root.child();
    const cells = {};
    for (const [k, v] of Object.entries(convInit())) cells[k] = rt.cell(v);
    rt.resetOn(scope, [cells.n], () => { cells.m.set(5); }, 0);
    if (opts.wire) opts.wire(scope, cells);
    const hooks = { opens: 0, closes: 0, errors: 0 };
    const desc = mk(cells);
    desc.reconnect = opts.reconnect ?? 0;
    desc.open = () => { hooks.opens++; if (opts.open) opts.open(cells); };
    desc.close = () => { hooks.closes++; };
    desc.error = () => { hooks.errors++; };
    const first = made.length;
    rt.channel(scope, desc);
    const X = { scope, cells, hooks, socket: () => made[first], val: (k) => cells[k].peek(), state: () => Object.fromEntries(Object.keys(cells).map((k) => [k, cells[k].peek()])) };
    clients.push(X);
    return X;
  };
  return {
    base, logs, errs, made, live,
    done: () => {
      for (const X of clients) X.scope.dispose();
      globalThis.location = savedLoc;
      globalThis.WebSocket = savedWs;
      console.error = savedErr;
      bun.stop(true);
    },
  };
}
const E = rt.edges(CONV_EDGES);
const LOG_HOOK = Symbol.for("scrml.test.channelLog");

describe("H — §38.4.2 relay order: two concurrent edits of every kind converge on every client", () => {
  const CASES = [
    ["two end-appends to a free tape", (A, B) => { rt.batch(() => rt.append(A.cells.xs, "a")); rt.batch(() => rt.append(B.cells.xs, "b")); },
      "xs", (v) => [JSON.stringify(["a", "b"]), JSON.stringify(["b", "a"])].includes(JSON.stringify(v))],
    ["two appends to a bounded tape one short of its bound (one wins, everywhere)", (A, B) => { rt.batch(() => rt.appendWithin(A.cells.ys, 10, 1, 3, "t")); rt.batch(() => rt.appendWithin(B.cells.ys, 20, 1, 3, "t")); },
      "ys", (v) => [JSON.stringify([1, 2, 10]), JSON.stringify([1, 2, 20])].includes(JSON.stringify(v)), (A) => rt.batch(() => rt.append(A.cells.ys, 2))],
    ["a `pop` against an `append` on a deque", (A, B) => { rt.batch(() => rt.removeEnd(A.cells.dq, 1)); rt.batch(() => rt.append(B.cells.dq, 4)); },
      "dq", (v) => [JSON.stringify([1, 2, 4]), JSON.stringify([1, 2, 3])].includes(JSON.stringify(v))],
    ["a `shift` against a `prepend` on a deque", (A, B) => { rt.batch(() => rt.removeFront(A.cells.dq, 1)); rt.batch(() => rt.prepend(B.cells.dq, 0)); },
      "dq", (v) => [JSON.stringify([0, 2, 3]), JSON.stringify([1, 2, 3])].includes(JSON.stringify(v))],
    ["two pops", (A, B) => { rt.batch(() => rt.removeEnd(A.cells.dq, 1)); rt.batch(() => rt.removeEnd(B.cells.dq, 1)); },
      "dq", (v) => JSON.stringify(v) === JSON.stringify([1])],
    ["two `rule=` moves from one variant (.Idle → .Loading against .Idle → .Done)", (A, B) => { rt.batch(() => rt.transition(A.cells.phase, E, "Loading")); rt.batch(() => rt.transition(B.cells.phase, E, "Done")); },
      "phase", (v) => v === "Done"],
    ["two `replace`s", (A, B) => { rt.batch(() => A.cells.n.set(1)); rt.batch(() => B.cells.n.set(2)); },
      "n", (v) => v === 1 || v === 2],
  ];
  for (const [what, edits, key, ok, setup] of CASES) {
    test(`${what}: every client (both writers and a bystander) ends on the same value`, async () => {
      const w = await convWorld();
      try {
        const A = w.live();
        const B = w.live();
        const C = w.live();
        await tick(250);
        if (setup) { setup(A); await tick(200); }
        edits(A, B);                     // both sent before either comes back: they cross
        await tick(300);
        const vals = [A, B, C].map((X) => JSON.stringify(X.val(key)));
        expect(new Set(vals).size).toBe(1);
        expect(ok(A.val(key))).toBe(true);
        // and every other cell too
        expect(JSON.stringify(B.state())).toBe(JSON.stringify(A.state()));
        expect(JSON.stringify(C.state())).toBe(JSON.stringify(A.state()));
      } finally { w.done(); }
    });
  }

  test("a burst of interleaved edits from three clients converges (seeded)", async () => {
    const w = await convWorld();
    try {
      const cl = [w.live(), w.live(), w.live()];
      await tick(250);
      let seed = 7;
      const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
      const OPS = [
        (X, i) => rt.append(X.cells.xs, `x${i}`),
        (X, i) => rt.appendWithin(X.cells.ys, i, 1, 3, "t"),
        (X) => rt.removeEnd(X.cells.dq, 1),
        (X, i) => rt.prepend(X.cells.dq, i),
        (X) => rt.removeFront(X.cells.dq, 1),
        (X, i) => X.cells.n.set(i),
        (X, i) => X.cells.m.set(100 + i),
      ];
      for (let i = 0; i < 60; i++) {
        const X = cl[rnd(3)];
        try { rt.batch(() => OPS[rnd(OPS.length)](X, i)); } catch { /* a local bound trap: nothing written */ }
        if (rnd(4) === 0) await tick(5);
      }
      await tick(500);
      const s0 = JSON.stringify(cl[0].state());
      for (const X of cl) expect(JSON.stringify(X.state())).toBe(s0);
    } finally { w.done(); }
  });
});

describe("I — §38.4.2 the frame log: a late joiner and a reconnecting client reach the same state", () => {
  async function busy(w) {
    const A = w.live();
    const B = w.live();
    await tick(250);
    rt.batch(() => rt.append(A.cells.xs, "a1"));
    rt.batch(() => rt.append(B.cells.xs, "b1"));
    rt.batch(() => rt.removeEnd(B.cells.dq, 1));
    rt.batch(() => rt.prepend(A.cells.dq, 0));
    rt.batch(() => rt.transition(A.cells.phase, E, "Loading"));
    rt.batch(() => A.cells.n.set(3));
    rt.batch(() => B.cells.m.set(9));
    await tick(300);
    return { A, B };
  }

  test("a client that connects late replays the log and shows the same state as the clients that saw every edit", async () => {
    const w = await convWorld();
    try {
      const { A, B } = await busy(w);
      expect(JSON.stringify(B.state())).toBe(JSON.stringify(A.state()));
      expect(A.val("xs").length).toBe(2);
      const C = w.live();
      await tick(300);
      expect(JSON.stringify(C.state())).toBe(JSON.stringify(A.state()));
      // and it is live from there: its own edit reaches the others, theirs reach it
      rt.batch(() => rt.append(C.cells.xs, "c1"));
      rt.batch(() => rt.append(A.cells.xs, "a2"));
      await tick(300);
      expect(JSON.stringify(C.state())).toBe(JSON.stringify(A.state()));
      expect(JSON.stringify(B.state())).toBe(JSON.stringify(A.state()));
      // a raw subscriber's first message is the log: every frame relayed so far, numbered 1.., as peers'
      const raw = await connect(w.base, "/_scrml_ws/c");
      await tick();
      expect(raw.replays.length).toBe(1);
      const rep = raw.replays[0];
      expect(rep.__complete).toBe(true);
      expect(rep.__seq).toBe(rep.__frames.length);
      expect(rep.__frames.map((f) => f.__seq)).toEqual(rep.__frames.map((_, i) => i + 1));
      expect(rep.__frames.every((f) => f.__own === false)).toBe(true);
      raw.ws.close();
    } finally { w.done(); }
  });

  test("a client whose connection drops reconnects, rebuilds from the log, and drops the write it made while closed", async () => {
    const w = await convWorld();
    try {
      const { A } = await busy(w);
      const R = w.live({ reconnect: 60 });
      await tick(300);
      expect(JSON.stringify(R.state())).toBe(JSON.stringify(A.state()));
      R.socket().close();                                     // the drop
      await tick(20);
      rt.batch(() => rt.append(A.cells.xs, "while-down"));   // an edit R misses live
      rt.batch(() => rt.append(R.cells.xs, "local-only"));   // R's write while closed: never sent (§38.10.4)
      await tick(500);
      expect(R.hooks.opens).toBe(2);
      expect(R.hooks.closes).toBe(1);
      expect(JSON.stringify(R.state())).toBe(JSON.stringify(A.state()));
      expect(R.val("xs")).toContain("while-down");
      expect(R.val("xs")).not.toContain("local-only");
      // live again after the reconnect
      rt.batch(() => rt.append(R.cells.xs, "after"));
      await tick(300);
      expect(JSON.stringify(A.state())).toBe(JSON.stringify(R.state()));
    } finally { w.done(); }
  });

  test("forged frames in the log (relayed — the relay holds no value to judge them) are refused again by a joiner's receiver", async () => {
    const w = await convWorld();
    try {
      const A = w.live();
      await tick(250);
      const evil = await connect(w.base, "/_scrml_ws/c");
      await tick();
      // each passes the relay (granted op, decodes) but is refused at its point of relay order
      evil.ws.send(frame("ys", "append", 2));
      evil.ws.send(frame("ys", "append", 3));
      evil.ws.send(frame("ys", "append", 4));                  // past the bound 1..=3
      evil.ws.send(frame("phase", "transition", "Done"));       // legal from .Idle
      evil.ws.send(frame("phase", "transition", "Loading"));    // .Done → .Loading: no such edge
      evil.ws.send(frame("dq", "pop", 9));                      // clamped: empties the deque (legal, §38.4.2)
      evil.ws.send(frame("dq", "prepend", 7));
      await tick(300);
      expect(evil.closed()).toBe(null);
      expect(A.val("ys")).toEqual([1, 2, 3]);
      expect(A.val("phase")).toBe("Done");
      expect(A.val("dq")).toEqual([7]);
      const before = w.errs.length;
      const C = w.live();
      await tick(300);
      expect(JSON.stringify(C.state())).toBe(JSON.stringify(A.state()));
      const cErrs = w.errs.slice(before).join("\n");
      expect(cErrs).toContain("refused an `append` of @ys past its length bound 1..=3");
      expect(cErrs).toContain("refused a `transition` of @phase its rule= graph forbids");
      evil.ws.close();
    } finally { w.done(); }
  });

  // §38.4.2 "The log bound": "A frame that would take the log past either bound is still relayed
  // live, but the log is TRUNCATED … A client given an incomplete replay SHALL NOT show the channel
  // as in sync". The test lowers the bound through the server's test-only symbol seam (it can only
  // lower; #1941 fix r1 LOW-2: a string-keyed `channelLog` option is not read).
  for (const [what, host] of [["frame-count", { [LOG_HOOK]: { frames: 3 } }], ["byte", { [LOG_HOOK]: { bytes: 200 } }]]) {
    test(`past the ${what} bound the log is truncated: live clients carry on, a joiner is told it is incomplete and stops (fail closed)`, async () => {
      const w = await convWorld(host);
      try {
        const A = w.live();
        const B = w.live();
        await tick(250);
        for (const s of ["one", "two", "three", "four-is-past-the-bound"]) rt.batch(() => rt.append(A.cells.xs, s));
        await tick(300);
        expect(B.val("xs")).toEqual(["one", "two", "three", "four-is-past-the-bound"]);   // still relayed live
        expect(w.logs.join("\n")).toContain("the frame log passed its bound");
        const raw = await connect(w.base, "/_scrml_ws/c");
        await tick();
        expect(raw.replays).toEqual([{ __type: "__replay", __complete: false, __seq: 4, __frames: [] }]);
        raw.ws.close();
        const C = w.live({ reconnect: 50 });
        await tick(300);
        expect(C.val("xs")).toEqual([]);                      // nothing from an incomplete log is applied
        expect(C.hooks.errors).toBe(1);                        // onclient:error ran
        expect(w.errs.join("\n")).toContain("frame log for this channel was truncated");
        // sync stopped: no reconnect, its writes are not sent, live frames are not applied
        const made = w.made.length;
        rt.batch(() => rt.append(C.cells.xs, "from-c"));
        rt.batch(() => rt.append(A.cells.xs, "five"));
        await tick(300);
        expect(w.made.length).toBe(made);
        expect(A.val("xs")).not.toContain("from-c");
        expect(C.val("xs")).toEqual(["from-c"]);
      } finally { w.done(); }
    });
  }
});

describe("J — §38.4.2 derived writes stay local (item 53): the 4-client `reset-on=` cascade", () => {
  test("A sets n then at once m: three frames on the wire (no receiver re-sends its reset) and A's m wins on every client", async () => {
    const w = await convWorld();
    try {
      const cl = [w.live(), w.live(), w.live(), w.live()];
      for (const X of cl) rt.batch(() => X.cells.m.set(9));   // start every client away from the reset value (local, before any frame)
      await tick(300);
      const obs = await connect(w.base, "/_scrml_ws/c");
      await tick();
      // the m = 9 writes were made before each client's replay: HELD, re-applied on the rebuilt value
      // and sent after it (#1941 fix r1 MED-1, §38.4.2 "held"), so they survive on every client
      expect(cl.map((X) => X.val("m"))).toEqual([9, 9, 9, 9]);
      rt.batch(() => cl[0].cells.m.set(9));
      await tick(200);
      expect(cl.map((X) => X.val("m"))).toEqual([9, 9, 9, 9]);
      obs.got.length = 0;
      rt.batch(() => cl[0].cells.n.set(1));                   // resets A's m to 5 (A's own write's reset: sent)
      rt.batch(() => cl[0].cells.m.set(7));
      await tick(400);
      expect(obs.got.map((f) => `${f.__key}=${f.__val}`)).toEqual(["n=1", "m=5", "m=7"]);
      expect(cl.map((X) => X.val("m"))).toEqual([7, 7, 7, 7]);
      expect(cl.map((X) => X.val("n"))).toEqual([1, 1, 1, 1]);
      obs.ws.close();
    } finally { w.done(); }
  });

  test("a received frame's reset, and every write in the flush it starts, is not sent (stand-in socket)", () => {
    const saved = globalThis.WebSocket;
    const socks = [];
    globalThis.WebSocket = class { constructor() { this.readyState = 1; this.sent = []; socks.push(this); } send(t) { this.sent.push(JSON.parse(t)); } close() {} };
    const savedLoc = globalThis.location;
    globalThis.location = { protocol: "http:", host: "127.0.0.1:1" };
    const scope = rt.root.child();
    const n = rt.cell(0);
    const m = rt.cell(9);
    const INT = { defs: [], root: { k: "int" } };
    try {
      rt.resetOn(scope, [n], () => { m.set(5); }, 0);
      rt.channel(scope, { name: "r", reconnect: 0, cells: [{ key: "n", cell: n, table: INT, ops: ["replace"], edges: null }, { key: "m", cell: m, table: INT, ops: ["replace"], edges: null }], open: null, close: null, error: null });
      const deliver = relayer(socks[0]);
      deliver(frame("n", "replace", 4));
      expect(n.peek()).toBe(4);
      expect(m.peek()).toBe(5);                                // derived locally …
      expect(socks[0].sent).toEqual([]);                       // … and not sent
      // a LOCAL write's reset is an ordinary local write: sent
      rt.batch(() => m.set(8));
      rt.batch(() => n.set(6));
      expect(socks[0].sent.map((f) => `${f.__key}=${f.__val}`)).toEqual(["m=8", "n=6", "m=5"]);
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; scope.dispose(); }
  });
});

describe("K — §38.4.2 the client's stream checks and the rate-limited report (stand-in socket)", () => {
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
    const hooks = { errors: 0 };
    try {
      rt.channel(scope, { name: "k", reconnect: 0, cells: cellsDesc, open: null, close: null, error: () => { hooks.errors++; } });
    } finally { globalThis.WebSocket = saved; globalThis.location = savedLoc; }
    return { sock: socks[0], errs, hooks, raw: (v) => socks[0].onmessage({ data: typeof v === "string" ? v : JSON.stringify(v) }), done: () => { console.error = savedErr; scope.dispose(); } };
  }
  const XS = { defs: [], root: { k: "seq", elem: { k: "str" }, bound: { k: "free" } } };
  const sf = (seq, key, op, val, own = false) => ({ __type: "__sync", __seq: seq, __key: key, __op: op, __val: val, __own: own });

  test("a forged replay (a compromised relay): each frame is re-checked — the refused ones are not applied, the rest are", () => {
    const xs = rt.cell([]);
    const c = standIn([{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }]);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 4, __frames: [sf(1, "xs", "append", "a"), sf(2, "xs", "replace", ["forged"]), sf(3, "xs", "append", 5), sf(4, "xs", "append", "b")] });
      expect(xs.peek()).toEqual(["a", "b"]);
      expect(c.errs.join("\n")).toContain("refused a `replace` of @xs, whose grants do not admit it");
      expect(c.errs.join("\n")).toContain("whose element does not decode");
      expect(c.sock.closed).toBe(0);
    } finally { c.done(); }
  });

  const BROKEN = [
    ["a first frame that is not the replay", [sf(1, "xs", "append", "a")], "first frame is not the relay's __replay"],
    ["a replay that skips a number", [{ __type: "__replay", __complete: true, __seq: 2, __frames: [sf(1, "xs", "append", "a"), sf(3, "xs", "append", "b")] }], "is not the relayed frame numbered 2"],
    ["a replay whose count disagrees with its __seq", [{ __type: "__replay", __complete: true, __seq: 5, __frames: [sf(1, "xs", "append", "a")] }], "says it ends at 5"],
    ["a live frame out of sequence", [{ __type: "__replay", __complete: true, __seq: 0, __frames: [] }, sf(2, "xs", "append", "a")], "a frame numbered 2 after 0"],
    ["an own frame with no pending edit", [{ __type: "__replay", __complete: true, __seq: 0, __frames: [] }, sf(1, "xs", "append", "a", true)], "not this client's oldest pending edit"],
    ["a frame with an extra key", [{ __type: "__replay", __complete: true, __seq: 0, __frames: [] }, { ...sf(1, "xs", "append", "a"), x: 1 }], "not exactly {__type, __seq, __key, __op, __val, __own}"],
  ];
  for (const [what, msgs, needle] of BROKEN) {
    test(`a broken stream — ${what} — applies nothing and closes the connection`, () => {
      const xs = rt.cell([]);
      const c = standIn([{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }]);
      try {
        for (const m of msgs) c.raw(m);
        expect(xs.peek()).toEqual([]);
        expect(c.sock.closed).toBe(1);
        expect(c.errs.join("\n")).toContain(needle);
        c.raw({ __type: "__replay", __complete: true, __seq: 1, __frames: [sf(1, "xs", "append", "late")] });   // nothing more from that connection
        expect(xs.peek()).toEqual([]);
      } finally { c.done(); }
    });
  }

  test("an own frame whose payload is not the pending edit's is a broken stream", () => {
    const xs = rt.cell([]);
    const c = standIn([{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }]);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __frames: [] });
      rt.batch(() => rt.append(xs, "mine"));
      expect(c.sock.sent).toEqual([{ __type: "__sync", __key: "xs", __op: "append", __val: "mine" }]);
      c.raw(sf(1, "xs", "append", "not-mine", true));
      expect(c.sock.closed).toBe(1);
      expect(c.errs.join("\n")).toContain("not this client's oldest pending edit");
    } finally { c.done(); }
  });

  test("a pending edit is shown on top of the confirmed value, rebased under a peer's frame, and retired by its own echo", () => {
    const xs = rt.cell([]);
    const c = standIn([{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }]);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __frames: [] });
      rt.batch(() => rt.append(xs, "mine"));
      expect(xs.peek()).toEqual(["mine"]);                       // optimistic local apply
      c.raw(sf(1, "xs", "append", "peer"));                       // the relay put the peer's first
      expect(xs.peek()).toEqual(["peer", "mine"]);               // rebased onto relay order
      c.raw(sf(2, "xs", "append", "mine", true));
      expect(xs.peek()).toEqual(["peer", "mine"]);
      c.raw(sf(3, "xs", "append", "later"));
      expect(xs.peek()).toEqual(["peer", "mine", "later"]);
      expect(c.sock.sent.length).toBe(1);
      expect(c.errs).toEqual([]);
    } finally { c.done(); }
  });

  test("an incomplete replay: nothing applied, onclient:error, no later frame applied or sent", () => {
    const xs = rt.cell(["kept"]);
    const c = standIn([{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }]);
    try {
      c.raw({ __type: "__replay", __complete: false, __seq: 12000, __frames: [] });
      expect(xs.peek()).toEqual(["kept"]);
      expect(c.hooks.errors).toBe(1);
      expect(c.sock.closed).toBe(1);
      rt.batch(() => rt.append(xs, "local"));
      expect(c.sock.sent).toEqual([]);
    } finally { c.done(); }
  });

  test("item 52: refused frames are reported at most 5 times per 10 s per channel, then one line", () => {
    const xs = rt.cell([]);
    const c = standIn([{ key: "xs", cell: xs, table: XS, ops: ["append"], edges: null }]);
    try {
      c.raw({ __type: "__replay", __complete: true, __seq: 0, __frames: [] });
      for (let i = 1; i <= 40; i++) c.raw(sf(i, "xs", "replace", ["forged"]));
      expect(xs.peek()).toEqual([]);
      expect(c.errs.filter((e) => e.includes("refused a `replace`")).length).toBe(5);
      expect(c.errs.filter((e) => e.includes("further refused frames are not reported")).length).toBe(1);
      expect(c.errs.length).toBe(6);
      expect(c.sock.closed).toBe(0);                              // a refusal is not a broken stream
    } finally { c.done(); }
  });
});

// #1941 fix round 1 (review ~/.cache/scrml/review/s478-1941/review.md).
describe("L — #1941 fix r1: epoch reset, held edits, onclient:open after the replay, non-channel resets, byte bound, test-only seam", () => {
  // HIGH-1 — §38.4.2 "When the last subscriber of a channel whose log was truncated leaves, the
  // relay SHALL start the channel again: a new, empty, complete log at sequence `0`".
  test("HIGH-1 (attack A3 shape): one peer floods past the frame bound; while anyone is subscribed a joiner fails closed; once all leave, a new joiner syncs again", async () => {
    const w = await convWorld({ [LOG_HOOK]: { frames: 50 } });
    try {
      const A = w.live();
      await tick(200);
      const P = await connect(w.base, "/_scrml_ws/c");
      for (let i = 0; i < 51; i++) P.ws.send(frame("n", "replace", i % 2));
      for (let k = 0; k < 100 && P.got.length < 51; k++) await tick(20);
      P.ws.close();
      await tick(100);
      // A is still subscribed: a joiner is told the log is incomplete and stops (the INTERIM fail-closed)
      const J = w.live({ reconnect: 50 });
      await tick(300);
      expect(J.hooks.errors).toBe(1);
      expect(J.hooks.opens).toBe(0);
      A.scope.dispose();
      J.scope.dispose();
      await tick(200);
      expect(w.logs.join("\n")).toContain("starts again with an empty log at sequence 0");
      const raw = await connect(w.base, "/_scrml_ws/c");
      await tick();
      expect(raw.replays).toEqual([{ __type: "__replay", __complete: true, __seq: 0, __frames: [] }]);
      const K = w.live();
      const L = w.live();
      await tick(300);
      expect(K.hooks.errors).toBe(0);
      expect(K.hooks.opens).toBe(1);
      rt.batch(() => rt.append(K.cells.xs, "back"));
      await tick(300);
      expect(L.val("xs")).toEqual(["back"]);
      expect(K.val("xs")).toEqual(["back"]);
      raw.ws.close();
    } finally { w.done(); }
  });

  test("HIGH-1 (attack A3b shape): past the byte bound the same — fail closed while subscribed, a new epoch once the channel is empty", async () => {
    const w = await convWorld({ [LOG_HOOK]: { bytes: 4000 } });
    try {
      const P = await connect(w.base, "/_scrml_ws/c");
      const big = "x".repeat(1000);
      for (let i = 0; i < 5; i++) P.ws.send(frame("xs", "append", big));
      for (let k = 0; k < 100 && P.got.length < 5; k++) await tick(20);
      expect(w.logs.join("\n")).toContain("the frame log passed its bound");
      const J = w.live();
      await tick(300);
      expect(J.hooks.errors).toBe(1);
      P.ws.close();
      await tick(200);
      const K = w.live();
      await tick(300);
      expect(K.hooks.errors).toBe(0);
      expect(K.val("xs")).toEqual([]);
    } finally { w.done(); }
  });

  test("HIGH-1: an untruncated channel keeps its log when every subscriber leaves (a later joiner still gets the history)", async () => {
    const w = await convWorld();
    try {
      const A = w.live();
      await tick(200);
      rt.batch(() => rt.append(A.cells.xs, "kept"));
      await tick(200);
      A.scope.dispose();
      await tick(150);
      const B = w.live();
      await tick(300);
      expect(B.val("xs")).toEqual(["kept"]);
    } finally { w.done(); }
  });

  // LOW-1 — §38.4.2 "at most 8,388,608 bytes of relayed frame text (… UTF-8 encoded, summed)"
  test("LOW-1: the log bound counts UTF-8 bytes — a CJK frame under the bound in UTF-16 units but over it in bytes truncates", async () => {
    const w = await convWorld({ [LOG_HOOK]: { bytes: 300 } });
    try {
      const P = await connect(w.base, "/_scrml_ws/c");
      const cjk = "漢".repeat(90);                          // ~180 UTF-16 units of frame text, ~350 bytes
      P.ws.send(frame("xs", "append", cjk));
      for (let k = 0; k < 50 && P.got.length < 1; k++) await tick(20);
      expect(w.logs.join("\n")).toContain("the frame log passed its bound");
      const raw = await connect(w.base, "/_scrml_ws/c");
      await tick();
      expect(raw.replays[0].__complete).toBe(false);
      raw.ws.close();
      P.ws.close();
    } finally { w.done(); }
  });

  // LOW-2 — the bound seam is a registered symbol, never a string option a deployment config could set
  test("LOW-2: a string-keyed `channelLog` option in createServer's options is not read", async () => {
    const w = await convWorld({ channelLog: { frames: 0, bytes: 0 } });
    try {
      const A = w.live();
      await tick(200);
      rt.batch(() => rt.append(A.cells.xs, "one"));
      await tick(200);
      expect(w.logs.join("\n")).not.toContain("the frame log passed its bound");
      const B = w.live();
      await tick(300);
      expect(B.hooks.errors).toBe(0);
      expect(B.val("xs")).toEqual(["one"]);
    } finally { w.done(); }
  });

  // MED-3 — the replay text is built once per log change (cached), and a new frame invalidates it
  test("MED-3: every open is sent the same replay text, and a frame relayed after it is in the next one", async () => {
    const w = await convWorld();
    try {
      const A = w.live();
      await tick(200);
      rt.batch(() => rt.append(A.cells.xs, "a"));
      await tick(150);
      const r1 = await connect(w.base, "/_scrml_ws/c");
      const r2 = await connect(w.base, "/_scrml_ws/c");
      await tick();
      expect(JSON.stringify(r1.replays)).toBe(JSON.stringify(r2.replays));
      expect(r1.replays[0].__seq).toBe(1);
      rt.batch(() => rt.append(A.cells.xs, "b"));
      await tick(150);
      const r3 = await connect(w.base, "/_scrml_ws/c");
      await tick();
      expect(r3.replays[0].__seq).toBe(2);
      expect(r3.replays[0].__frames.map((f) => f.__val)).toEqual(["a", "b"]);
      for (const r of [r1, r2, r3]) r.ws.close();
    } finally { w.done(); }
  });

  // MED-1 — §38.10 `onclient:open` runs after the replay; §38.4.2 a write before the replay is held
  test("MED-1: a channel write in `onclient:open` (presence announce) is sent and kept on every client", async () => {
    const w = await convWorld();
    try {
      const A = w.live();
      await tick(200);
      const B = w.live({ open: (cells) => { rt.batch(() => rt.append(cells.xs, "B-joined")); } });
      await tick(400);
      expect(A.val("xs")).toEqual(["B-joined"]);
      expect(B.val("xs")).toEqual(["B-joined"]);
    } finally { w.done(); }
  });

  test("MED-1 (onopen probe shape): a write between the socket's open and the replay is held and sent after it, on top of the history", async () => {
    const w = await convWorld();
    try {
      const A = w.live();
      await tick(200);
      rt.batch(() => rt.append(A.cells.xs, "history"));
      await tick(150);
      const B = w.live();
      rt.batch(() => rt.append(B.cells.xs, "connecting"));        // the socket is still CONNECTING
      B.socket().addEventListener("open", () => { rt.batch(() => rt.append(B.cells.xs, "B-joined")); });
      await tick(400);
      expect(A.val("xs")).toEqual(["history", "connecting", "B-joined"]);
      expect(B.val("xs")).toEqual(["history", "connecting", "B-joined"]);
    } finally { w.done(); }
  });

  test("MED-1: a held edit that no longer applies on top of the history is not shown, not sent, and reported", async () => {
    const w = await convWorld();
    try {
      const A = w.live();
      await tick(200);
      rt.batch(() => rt.append(A.cells.ys, 2));
      rt.batch(() => rt.append(A.cells.ys, 3));                  // ys at its bound 1..=3
      await tick(200);
      const B = w.live();
      rt.batch(() => rt.append(B.cells.ys, 9));                  // held: fine on [1], past the bound on [1,2,3]
      await tick(400);
      expect(B.val("ys")).toEqual([1, 2, 3]);
      expect(A.val("ys")).toEqual([1, 2, 3]);
      expect(w.errs.join("\n")).toContain("no longer applies to it — not sent");
    } finally { w.done(); }
  });

  // MED-2 — §38.4.2: a NON-channel `reset-on=` reset is made only when the trigger's SHOWN value changes
  test("MED-2 (attack A5 shape): the writer's own echo does not re-make a non-channel reset; a peer's change of the trigger does", async () => {
    const wire = (scope, cells) => { cells.d = rt.cell(0); rt.resetOn(scope, [cells.n], () => { cells.d.set(0); }, 0); };
    const w = await convWorld();
    try {
      const A = w.live({ wire });
      const B = w.live({ wire });
      await tick(250);
      rt.batch(() => A.cells.n.set(1));                          // local: resets d (already 0)
      rt.batch(() => A.cells.d.set(42));                         // typed before the echo returns
      await tick(250);
      expect(A.val("n")).toBe(1);
      expect(A.val("d")).toBe(42);                               // the echo did not wipe it
      expect(A.val("m")).toBe(5);                                // the channel cell's reset still holds
      rt.batch(() => A.cells.d.set(43));
      rt.batch(() => rt.append(B.cells.xs, "z"));                // a peer edit that does not touch n
      await tick(250);
      expect(A.val("d")).toBe(43);
      rt.batch(() => B.cells.n.set(2));                          // a peer changes the trigger: A shows n 1 -> 2
      await tick(250);
      expect(A.val("n")).toBe(2);
      expect(A.val("d")).toBe(0);                                // reset, as a local change of n would
    } finally { w.done(); }
  });
});
