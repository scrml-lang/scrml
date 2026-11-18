// channel-s478.test.js — s478-boot-channel: SPEC §38 `<channel>` (WebSocket channels), built by
// the bootstrap.
//
//   A. the declaration's compile-time diagnostics (§38.1 / §38.3 / §38.4 / §38.6 / §38.6.1 /
//      §38.9 / §38.10 / §38.11 and the §38.13 `watches=` feed front end);
//   B. what the bootstrap refuses by name (fail closed where it builds nothing — g-boot-channel-s478).
//
// RED ON BASE: every test here. On base a `<channel>` was E-BOOTSTRAP-UNSUPPORTED "is a scrml
// structural element (§38), not an HTML element", `onclient:open=f(e)` parsed as a typed
// attribute `onclient:<open>` (E-TYPE-UNKNOWN, E-DECL-OPENER-EXPR-UNPARENTHESIZED), and none of
// the §38 codes had an emit site in the bootstrap.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, warmLoadProgram, takePageErrors } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => [...new Set(errs(src).map((d) => d.code))].sort();
const allCodes = (src) => [...new Set(fe(src).diags.map((d) => d.code))].sort();
const refusals = (src) => errs(src).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").map((d) => d.message);
const prog = (body, attrs = "") => `<program${attrs}>\n${body}\n</program>\n`;
const chan = (attrs, body = `  let <count:int=0/>`) => `<channel ${attrs}>\n${body}\n</channel>`;

const CLEAN = prog(`${chan(`name="chat"`, `  let <count:int=0/>\n  function bump() { @count = @count + 1; }`)}\n<p>\${@count}</p>\n<button onclick=bump()>+</button>`);

describe("A — §38 compile-time diagnostics", () => {
  test("a canonical channel compiles clean and reaches Core (§38.1, §38.4)", () => {
    const r = fe(CLEAN);
    expect(r.diags.map((d) => d.code)).toEqual([]);
    expect(r.core.channels.length).toBe(1);
    const ch = r.core.channels[0];
    expect(ch.name).toBe("chat");
    expect(ch.topic).toBe("chat");                                // §38.3: "Defaults to `name`"
    expect(ch.reconnect).toBe(2000);                              // §38.3.1: "When both attributes are absent, the compiler SHALL emit `2000` ms"
    expect(ch.cells.map((c) => c.hint)).toEqual(["count"]);      // §38.4: auto-sync by placement
  });

  test("§38.1 rule 4: a channel cell is read from the program body and from a `<page>` via `@`", () => {
    const r = fe(prog(`${chan(`name="feed"`)}\n<page>\n<p>\${@count}</p>\n</page>`));
    expect(r.diags.map((d) => d.code)).toEqual([]);
    expect(r.core.channels[0].cells.map((c) => c.hint)).toEqual(["count"]);
  });

  test("§38.3: topic= and reconnect= are read", () => {
    const r = fe(prog(`${chan(`name="chat" topic="lobby" reconnect=500`)}\n<p>\${@count}</p>`));
    expect(r.diags.map((d) => d.code)).toEqual([]);
    expect(r.core.channels[0].topic).toBe("lobby");
    expect(r.core.channels[0].reconnect).toBe(500);
    expect(fe(prog(`${chan(`name="chat" reconnect=0`)}\n<p>\${@count}</p>`)).core.channels[0].reconnect).toBe(0);   // "`0` = disabled"
  });

  test("§38.9 E-CHANNEL-001: no name=", () => {
    expect(codes(prog(`${chan(``)}\n<p>\${@count}</p>`))).toEqual(["E-CHANNEL-001"]);
  });

  test("§38.11 E-CHANNEL-007: a `${…}` in name= or topic= (one report — not also the §5.5.3 template refusal)", () => {
    expect(codes(prog(`let <room:string="a"/>\n${chan(`name="chat-\${@room}"`)}\n<p>\${@count} \${@room}</p>`))).toEqual(["E-CHANNEL-007"]);
    expect(codes(prog(`let <room:string="a"/>\n${chan(`name="chat" topic="t-\${@room}"`)}\n<p>\${@count} \${@room}</p>`))).toEqual(["E-CHANNEL-007"]);
  });

  test("§38.9 E-CHANNEL-003: two channels of one name in a file", () => {
    expect(codes(prog(`${chan(`name="c"`, `  let <a:int=0/>`)}\n${chan(`name="c"`, `  let <b:int=0/>`)}\n<p>\${@a}\${@b}</p>`))).toEqual(["E-CHANNEL-003"]);
  });

  test("§38.1 placement: E-CHANNEL-OUTSIDE-PROGRAM, E-CHANNEL-INSIDE-PAGE", () => {
    expect(codes(`<program><p>x</p></program>\n<channel name="c"></channel>\n`)).toEqual(["E-CHANNEL-OUTSIDE-PROGRAM"]);
    expect(codes(prog(`<page>\n${chan(`name="c"`)}\n</page>`))).toEqual(["E-CHANNEL-INSIDE-PAGE"]);
  });

  test("§38.4 E-CHANNEL-SHARED-MODIFIER: the removed `@shared` modifier", () => {
    expect(codes(prog(`<channel name="chat">\n  \${ @shared count = 0 }\n</channel>\n<p>x</p>`))).toEqual(["E-CHANNEL-SHARED-MODIFIER"]);
  });

  test("§38.10.2 / §38.6.1 E-CHANNEL-005: more than one argument in an onclient:* / onserver:message call", () => {
    const two = prog(`${chan(`name="chat" onclient:open=onOpen(e, 1)`, `  let <count:int=0/>\n  function onOpen() { @count = 1; }`)}\n<p>\${@count}</p>`);
    expect(codes(two)).toContain("E-CHANNEL-005");
    const srv = prog(`${chan(`name="chat" onserver:message=h(m, n)`)}\n<p>\${@count}</p>`);
    expect(codes(srv)).toContain("E-CHANNEL-005");
    // a comma inside a string literal is not an argument separator
    const str = prog(`${chan(`name="chat" onclient:open=onOpen('a,b')`, `  let <count:int=0/>\n  function onOpen() { @count = 1; }`)}\n<p>\${@count}</p>`);
    expect(codes(str)).not.toContain("E-CHANNEL-005");
  });

  test("§38.10.2 E-CHANNEL-HANDLER-SHADOW: a binding name naming a visible declaration (a cell, a function); a later const does not collide", () => {
    const cell = prog(`let <x:int=5/>\n${chan(`name="chat" onclient:open=onOpen(x)`, `  let <count:int=0/>\n  function onOpen() { @count = @x; }`)}\n<p>\${@count}</p>`);
    expect(codes(cell)).toContain("E-CHANNEL-HANDLER-SHADOW");
    const fnName = prog(`function helper() -> int { return 1; }\n${chan(`name="chat" onclient:open=onOpen(helper)`, `  let <count:int=0/>\n  function onOpen() { @count = helper(); }`)}\n<p>\${@count}</p>`);
    expect(codes(fnName)).toContain("E-CHANNEL-HANDLER-SHADOW");
    const later = prog(`${chan(`name="chat" onclient:open=onOpen(K)`, `  let <count:int=0/>\n  function onOpen() { @count = 1; }`)}\nconst K = 3;\n<p>\${@count} \${K}</p>`);
    expect(codes(later)).not.toContain("E-CHANNEL-HANDLER-SHADOW");
  });

  test("§38.10.3 E-CHANNEL-006: an onclient:* handler declared `server`, or placed on the server by broadcast() (Trigger 7)", () => {
    const decl = prog(`${chan(`name="chat" onclient:open=onOpen()`, `  let <count:int=0/>\n  server function onOpen() { return 1; }`)}\n<p>\${@count}</p>`);
    expect(codes(decl)).toEqual(["E-CHANNEL-006"]);
    const top = prog(`server fn onClose() { return 1; }\n${chan(`name="chat" onclient:close=onClose()`)}\n<p>\${@count}</p>`);
    expect(codes(top)).toEqual(["E-CHANNEL-006"]);
    const bc = prog(`${chan(`name="lobby" onclient:open=onOpen()`, `  let <joined:int=0/>\n  function onOpen() { broadcast({ joined: true }); }`)}\n<p>\${@joined}</p>`);
    expect(codes(bc)).toEqual(["E-CHANNEL-006"]);
    const nested = prog(`${chan(`name="lobby" onclient:open=onOpen()`, `  let <joined:int=0/>\n  function onOpen() {\n    function tell() { broadcast({ joined: true }); }\n    tell();\n  }`)}\n<p>\${@joined}</p>`);
    expect(codes(nested)).toEqual(["E-CHANNEL-006"]);
  });

  test("§38.10.3 clean: a cell-writing onclient:* handler stays on the client", () => {
    const ok = prog(`${chan(`name="lobby" onclient:open=onOpen() onclient:close=onClose() onclient:error=onErr()`, `  let <status:string="connecting"/>\n  function onOpen() { @status = "up"; }\n  function onClose() { @status = "down"; }\n  function onErr() { @status = "error"; }`)}\n<p>\${@status}</p>`);
    const r = fe(ok);
    expect(r.diags.map((d) => d.code)).toEqual([]);
    const ch = r.core.channels[0];
    expect([ch.open?.hint, ch.close?.hint, ch.error?.hint]).toEqual(["onOpen", "onClose", "onErr"]);
  });

  test("§38.6 E-CHANNEL-004: broadcast() outside a channel's lexical scope (no E-SCOPE-001 beside it)", () => {
    const src = prog(`function g(t: string) { broadcast({ body: t }); }\n${chan(`name="chat"`)}\n<p>\${@count}</p><button onclick=g("x")>x</button>`);
    expect(allCodes(src)).toEqual(["E-CHANNEL-004"]);
  });

  test("§38.4 / §38.6.1 E-CHANNEL-SERVER-CELL-READ: a broadcast()-placed function reads a channel cell", () => {
    const src = prog(`${chan(`name="chat"`, `  let <count:int=0/>\n  function tally() { broadcast({ total: @count }); }`)}\n<p>\${@count}</p><button onclick=tally()>t</button>`);
    expect(codes(src)).toEqual(["E-CHANNEL-SERVER-CELL-READ"]);
  });

  describe("§38.13 `watches=` (front end)", () => {
    const SCHEMA = `<schema>\n  orders {\n    id: integer primary key\n    status: text\n  }\n</schema>`;
    const ARMS = `  <onchange>\n    <Inserted(row) : print(row)>\n    <Updated(row) : print(row)>\n    <Deleted(key) : print(key)>\n  </onchange>`;
    const w = (attrs, body = ARMS, db = ` db="postgres://localhost/app"`, schema = SCHEMA) => prog(`${schema}\n<channel ${attrs}>\n${body}\n</channel>`, db);

    test("a canonical feed is clean", () => {
      expect(allCodes(w(`name="orders-feed" watches=orders`))).toEqual([]);
    });
    test("E-CHANNEL-WATCHES-DRIVER — sqlite, or no database", () => {
      expect(codes(w(`name="f" watches=orders`, ARMS, ` db="sqlite:app.db"`))).toEqual(["E-CHANNEL-WATCHES-DRIVER"]);
      expect(codes(w(`name="f" watches=orders`, ARMS, ``))).toContain("E-CHANNEL-WATCHES-DRIVER");
    });
    test("E-CHANNEL-WATCHES-UNKNOWN-TABLE", () => {
      expect(codes(w(`name="f" watches=widgets`))).toEqual(["E-CHANNEL-WATCHES-UNKNOWN-TABLE"]);
    });
    test("W-CHANNEL-WATCHES-NO-PK (a Warning); key= overrides it", () => {
      const noPk = `<schema>\n  events {\n    label: text\n  }\n</schema>`;
      const d = fe(w(`name="f" watches=events`, ARMS, ` db="postgres://localhost/app"`, noPk)).diags.filter((x) => x.code === "W-CHANNEL-WATCHES-NO-PK");
      expect(d.length).toBe(1);
      expect(d[0].severity).toBe("Warning");
      expect(allCodes(w(`name="f" watches=events key=label`, ARMS, ` db="postgres://localhost/app"`, noPk))).not.toContain("W-CHANNEL-WATCHES-NO-PK");
    });
    test("W-CHANNEL-WATCHES-NO-CONSUMER (a Warning)", () => {
      const d = fe(w(`name="f" watches=orders`, ``)).diags;
      expect(d.map((x) => [x.code, x.severity])).toEqual([["W-CHANNEL-WATCHES-NO-CONSUMER", "Warning"]]);
    });
    test("E-CHANNEL-WATCHES-CLIENT-WRITE — a cell declared in the feed's body", () => {
      expect(codes(w(`name="f" watches=orders`, `  let <n:int=0/>\n${ARMS}`))).toEqual(["E-CHANNEL-WATCHES-CLIENT-WRITE"]);
    });
    test("E-CHANNEL-WATCHES-BROADCAST — a bare broadcast() call; a member call `x.broadcast()` is not it", () => {
      expect(allCodes(w(`name="f" watches=orders`, `  function ping() { broadcast({ x: 1 }); }\n${ARMS}`))).toEqual(["E-CHANNEL-WATCHES-BROADCAST"]);
    });
    test("<onchange>: E-MATCH-NOT-EXHAUSTIVE; a wildcard covers; dead / duplicate arms", () => {
      expect(codes(w(`name="f" watches=orders`, `  <onchange>\n    <Inserted(row) : print(row)>\n    <Updated(row) : print(row)>\n  </onchange>`))).toEqual(["E-MATCH-NOT-EXHAUSTIVE"]);
      expect(codes(w(`name="f" watches=orders`, `  <onchange>\n    <Inserted(row) : print(row)>\n    <_ : print("other")>\n  </onchange>`))).toEqual([]);
      expect(codes(w(`name="f" watches=orders`, `${ARMS.replace("</onchange>", "  <Bogus(x) : print(x)>\n  </onchange>")}`))).toEqual(["E-MATCH-SUBSET-DEAD-ARM"]);
      expect(codes(w(`name="f" watches=orders`, `${ARMS.replace("</onchange>", "  <Deleted(k) : print(k)>\n  </onchange>")}`))).toEqual(["E-TYPE-023"]);
    });
    test("<onchange> legacy after-`>` placement parses with W-COLON-SHORTHAND-LEGACY-PLACEMENT (Info)", () => {
      const d = fe(w(`name="f" watches=orders`, `  <onchange>\n    <Inserted(row) : print(row)>\n    <_> : print("other")\n  </onchange>`)).diags;
      expect(d.filter((x) => x.severity === "Error")).toEqual([]);
    });
    test("<onchange> outside a watches= channel: E-STRUCTURAL-ELEMENT-MISPLACED", () => {
      expect(codes(prog(`<channel name="c">\n${ARMS}\n</channel>`, ` db="postgres://localhost/app"`))).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
      expect(codes(prog(`<div><onchange></onchange></div>`))).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
    });
  });
});

describe("B — refused by name (fail closed — g-boot-channel-s478)", () => {
  const one = (src, needle) => {
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(refusals(src).join("\n")).toContain(needle);
  };
  test("auth= (§38.5 / §52.13 — no session gate is built)", () => one(prog(`${chan(`name="c" auth="required"`)}\n<p>\${@count}</p>`), "`auth=` on `<channel>`"));
  test("a reactive topic= (§38.6.2 dynamic subscription)", () => one(prog(`let <r:string="a"/>\n${chan(`name="c" topic=@r`)}\n<p>\${@count}\${@r}</p>`), "reactive or `not` `topic=`"));
  test("onserver:* handlers (§38.6.1)", () => one(prog(`${chan(`name="c" onserver:open=h()`)}\n<p>\${@count}</p>`), "`onserver:open=` is not in the bootstrap"));
  test("an onclient:* call that binds the event object (§38.10.1)", () => one(prog(`${chan(`name="c" onclient:open=up(e)`, `  let <count:int=0/>\n  function up() { @count = 1; }`)}\n<p>\${@count}</p>`), "passes the WebSocket event object"));
  test("broadcast() itself (§38.6 fan-out not built)", () => one(prog(`${chan(`name="c"`, `  let <count:int=0/>\n  function tally(d: int) { broadcast({ total: d }); }`)}\n<p>\${@count}</p><button onclick=tally(1)>t</button>`), "`broadcast()` is not in the bootstrap"));
  test("markup in a channel body (§38.2 \"SHALL NOT contain markup that emits HTML\")", () => one(prog(`${chan(`name="c"`, `  let <count:int=0/>\n  <p>hi</p>`)}\n<p>\${@count}</p>`), "§38.2"));
  test("a derived value in a channel body (§38.4 names no sync for a value each client recomputes)", () => one(prog(`let <n:int=1/>\n${chan(`name="c"`, `  <twice:int=(@n * 2)/>`)}\n<p>\${@twice}</p>`), "the derived value `twice`"));
  test("(not refused) a channel cell with no write capability is not synced — it is never written", () => {
    const locked = fe(prog(`${chan(`name="c"`, `  <count:int=0/>`)}\n<p>\${@count}</p>`));
    expect(locked.diags.map((d) => d.code)).toEqual([]);
    expect(locked.core.channels[0].cells).toEqual([]);
  });
  test("a channel in another channel / a nested program / `export <channel>`", () => {
    one(prog(`<channel name="a">\n  <channel name="b"></channel>\n</channel>\n<p>x</p>`), "inside another `<channel>`");
    one(prog(`${chan(`name="c"`).replace("<channel", "export <channel")}\n<p>\${@count}</p>`), "`export <channel>`");
  });
  test("a name= the route cannot carry verbatim", () => one(prog(`${chan(`name="a b"`)}\n<p>\${@count}</p>`), "letters, digits"));
});

// s478 (s478-boot-channel-ops) — §38.4.2 (RULED S478 "op-based channel sync"): "A channel cell
// syncs the granted EDIT, not the whole value." Every receiver checks a frame's op against the
// cell's grants and current value, so the append-only / pop-only / bounded tapes and the `rule=`
// engine the #1928 fix r1 refused (INTERIM, g-boot-channel-capability-sync-s478) are synced, each
// with the op kinds its grants admit (CoreChannel.ops). What the bootstrap still cannot sync
// without letting a peer past the contract is refused by name (g-boot-channel-op-residue-s478).
// RED ON BASE (28fc2d031): the four synced shapes were E-BOOTSTRAP-UNSUPPORTED, and CoreChannel
// had no `ops`.
describe("B2 — §38.4.2 op sync: which channel cells sync, with which ops", () => {
  const synced = (body, extra = "") => {
    const r = fe(prog(`${extra}${chan(`name="c"`, body)}\n<p>x</p>`));
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const ch = r.core.channels[0];
    return Object.fromEntries(ch.cells.map((c, i) => [c.hint, ch.ops[i]]));
  };
  const refusedCell = (body, cell, needle, extra = "") => {
    const src = prog(`${extra}${chan(`name="c"`, body)}\n<p>x</p>`);
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const msg = refusals(src).join("\n");
    expect(msg).toContain("the channel cell `" + cell + "`");
    expect(msg).toContain(needle);
    expect(msg).toContain("g-boot-channel-op-residue-s478");
  };
  test("P-append-grant / P-client-append-truncation: an append-only tape syncs `append`", () =>
    expect(synced(`  <xs:string[free, append]=[]/>\n  function add(s: string) { @xs.append(s); }`)).toEqual({ xs: "append" }));
  test("P-bounded-tape: a bounded append-only tape syncs `append`", () =>
    expect(synced(`  <xs:int[1..=3, append]=([1])/>\n  function add() { @xs.append(2); }`)).toEqual({ xs: "append" }));
  test("GRANT-ONLY-POP: a pop-only tape syncs `pop`; a deque its four edits", () => {
    expect(synced(`  <xs:int[free, pop]=([1,2,3])/>\n  function drop() { @xs.pop(); }`)).toEqual({ xs: "pop" });
    expect(synced(`  <dq:int[free, append, prepend, pop, shift]=([])/>`)).toEqual({ dq: "append prepend pop shift" });
  });
  test("ENGINE: a `rule=` engine field syncs `transition` only", () =>
    expect(synced(`<phase:Phase=.Idle single>\n    <Idle rule=.Loading></>\n    <Loading rule=.Done></>\n    <Done></>\n</>`, `type Phase:enum = { Idle, Loading, Done }\n`)).toEqual({ phase: "transition" }));
  test("`let` scalars and structs, and `replace`-granted tapes, sync `replace` (+ their edits)", () => {
    expect(synced(`  let <n:int=0/>\n  let <pt:Pt=({ x: 1, y: 2 })/>\n  <xs:int[free, replace]=([])/>\n  <ys:int[0..=2, replace]=([])/>\n  <zs:int[free, replace, append]=([])/>`, `type Pt:struct = { x: int, y: int }\n`))
      .toEqual({ n: "replace", pt: "replace", xs: "replace", ys: "replace", zs: "replace append" });
  });
  // refused by name (residue)
  test("a struct whose tape field grants no `replace` (§66.12.6 rule 4)", () =>
    refusedCell(`  let <s:Box=({ xs: [] })/>`, "s", "tape whose type grants no `replace`", `type Box:struct = { xs: int[] }\n`));
  test("an `insert` / `remove` / `write` tape without `replace` (§38.4.2 `insert` / `remove` / `set` not built)", () => {
    refusedCell(`  <xs:int[free, insert]=([])/>`, "xs", "cannot send as its own op");
    refusedCell(`  <xs:int[free, remove]=([1])/>`, "xs", "cannot send as its own op");
    refusedCell(`  <xs:int[free, append, write]=([])/>`, "xs", "cannot send as its own op");
  });
  test("an engine field with an `<onIdle>` watchdog", () =>
    refusedCell(`<phase:Phase=.Active single>\n<Active rule=.Idle></>\n<Idle rule=.Active></>\n<onIdle after=5m to=.Idle/>\n</>`, "phase", "`<onIdle>` watchdog", `type Phase:enum = { Active, Idle }\n`));
  test("a lifecycle `(not to T)` cell", () =>
    refusedCell(`  let <u:(not to string)=(not)/>`, "u", "lifecycle"));
});

// The served halves are channel-served-s478.test.js (it needs Bun's own WebSocket, which the
// happy-dom page environment below replaces).
describe("D0 — the client artifact boots with its channel (happy-dom)", () => {
  test("the page renders and runs as before; the channel's connect does not break the page", async () => {

    const src = prog(`${chan(`name="chat" reconnect=0`, `  let <count:int=0/>`)}\n<button id="b" onclick={ @count = @count + 1; }>+</button>\n<p id="o">\${@count}</p>`);
    const r = fe(src);
    expect(r.diags).toEqual([]);
    // a socket stand-in: the page's connect is observed, not made (the served halves are tested
    // against a real server in channel-served-s478.test.js)
    const saved = globalThis.WebSocket;
    const made = [];
    globalThis.WebSocket = class { constructor(url) { made.push(url); this.readyState = 0; } send() {} close() {} };
    try {
      await loadProgram(r.core, "s478-channel-boot", []);
      expect(made).toEqual([`ws://${globalThis.location.host}/_scrml_ws/chat`]);
      expect(document.querySelector("#o").textContent).toBe("0");
      document.querySelector("#b").click();
      expect(document.querySelector("#o").textContent).toBe("1");
    } finally { globalThis.WebSocket = saved; }
    expect(takePageErrors()).toEqual([]);
  });
});
