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

function connect(base, path) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}${path}`);
    const got = [];
    let closed = null;
    ws.onmessage = (ev) => got.push(JSON.parse(String(ev.data)));
    ws.onclose = (ev) => { closed = { code: ev.code, reason: ev.reason }; };
    ws.onopen = () => resolve({ ws, got, closed: () => closed });
    ws.onerror = () => reject(new Error("refused"));
  });
}
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const frame = (key, op, val) => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val });

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
    return {
      cells, sock, errs,
      deliver: (text) => sock.onmessage({ data: text }),
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
    ["the pre-§38.4.2 whole-value frame (no __op)", "n", JSON.stringify({ __type: "__sync", __key: "n", __val: 3 }), "not exactly {__type, __key, __op, __val}"],
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
    return { sock, errs, deliver: (t) => sock.onmessage({ data: t }), done: () => { console.error = savedErr; scope.dispose(); } };
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
