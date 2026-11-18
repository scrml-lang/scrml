// channel-limits-s478.test.js — s478-ruled-channel-hard: the S478 open-Qs rulings (user-voice
// items 41–45, 48, 49) on the §38 channel relay and the development server.
//
//   A. §38.4.3 the bounds, front end: `<channel frame-rate= frame-burst= max-subscribers=>` and
//      `<program channel-max-frame= channel-frame-rate= channel-frame-burst= channel-max-subscribers=>`
//      — "a bare positive integer literal within its range"; anything else E-CHANNEL-LIMIT-INVALID;
//      the resolved values (channel, else program, else default) reach the server artifact.
//   B. §38.4.3 the bounds, served (a real Bun.serve, real sockets): the token bucket closes the
//      sender 1008 and relays nothing past it; the subscriber cap answers a further upgrade 503;
//      the frame-size bound counts UTF-8 BYTES (1009).
//   C. §40.2 the development server's Host allowlist (DNS rebinding): `devHostAllowed` and a
//      spawned `scrml-boot dev` refusing a foreign Host with 403 on every route, the channel
//      upgrade included, before the Origin check.
//
// RED ON BASE: A (the attributes were E-BOOTSTRAP-UNSUPPORTED / not read), B (no rate limit, no cap,
// a character count), C (no Host check; `devHostAllowed` did not exist).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { connect as tcpConnect } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mods, artifacts, loadServer } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

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
const CELLS = `  let <count:int=0/>\n  let <note:string=""/>`;
const src = (chAttrs = "", progAttrs = "") => prog(`${chan(`name="chat"${chAttrs}`, CELLS)}\n<p>\${@count} \${@note}</p>`, progAttrs);

const errorsOf = (s) => frontEnd(mods(), [{ path: "app.scrml", src: s }], "app.scrml").diags.filter((d) => d.severity === "Error");

describe("A — §38.4.3 bounds: the attributes (front end)", () => {
  const BAD = [
    ["frame-rate=0", ""],
    ["frame-rate=\"50\"", ""],
    ["frame-rate=-1", ""],
    ["frame-rate=1.5", ""],
    ["frame-burst=1000001", ""],
    ["max-subscribers=0", ""],
    ["max-subscribers=@n", ""],
    ["", " channel-max-frame=0"],
    ["", " channel-max-frame=1"],
    ["", " channel-max-frame=255"],          // S478 fix r1 (LOW-9): below the 256-byte minimum
    ["", " channel-max-frame=16777217"],
    ["", " channel-max-frame=\"64kb\""],
    ["", " channel-frame-rate=(50)"],
    ["", " channel-frame-burst=0"],
    ["", " channel-max-subscribers=x"],
  ];
  for (const [ca, pa] of BAD) {
    test(`fail closed: ${(ca + pa).trim()} → E-CHANNEL-LIMIT-INVALID (no silent default)`, () => {
      const es = errorsOf(src(ca === "" ? "" : " " + ca, pa));
      expect(es.map((d) => d.code)).toContain("E-CHANNEL-LIMIT-INVALID");
    });
  }

  test("the defaults reach the server artifact: 65 536 bytes, 50/s, burst 100, 1000 subscribers", async () => {
    const r = frontEnd(mods(), [{ path: "app.scrml", src: src() }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const { server } = artifacts(r.core);
    expect(server.js).toContain(`limits: { maxFrame: 65536, rate: 50, burst: 100, maxSubscribers: 1000 }`);
  });

  test("precedence (§38.3.1's): the `<channel>` value, else the `<program>` value, else the default", async () => {
    const s = src(" frame-rate=7 max-subscribers=3", " channel-max-frame=1024 channel-frame-rate=9 channel-frame-burst=11 channel-max-subscribers=5");
    const r = frontEnd(mods(), [{ path: "app.scrml", src: s }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    expect(r.diags.filter((d) => d.code === "W-ATTR-001")).toEqual([]);
    const { server } = artifacts(r.core);
    expect(server.js).toContain(`limits: { maxFrame: 1024, rate: 7, burst: 11, maxSubscribers: 3 }`);
  });
});

async function served(s) {
  const r = frontEnd(mods(), [{ path: "app.scrml", src: s }], "app.scrml");
  expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
  const { server } = artifacts(r.core);
  expect(server.refused).toEqual([]);
  const logs = [];
  const mod = await loadServer(server.js, r.core);
  const srv = mod.createServer({ root: "/tmp", log: (x) => logs.push(x) });
  const bun = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, sv) => srv.fetch(req, sv), websocket: srv.websocket });
  return { srv, bun, base: `127.0.0.1:${bun.port}`, logs };
}

function connect(base, path) {
  return new Promise((resolveP, reject) => {
    const ws = new WebSocket(`ws://${base}${path}`);
    const got = [];
    let closed = null;
    // #1941 × #1942 integration: the relay's first message is the §38.4.2 `__replay`, and every
    // relayed frame carries `__seq` / `__own`; these bounds tests read the relayed op frames only
    ws.onmessage = (ev) => {
      const f = JSON.parse(String(ev.data));
      if (f.__type === "__replay") return;
      const { __seq, __own, ...op } = f;
      got.push(op);
    };
    ws.onclose = (ev) => { closed = { code: ev.code, reason: ev.reason }; };
    ws.onopen = () => resolveP({ ws, got, closed: () => closed });
    ws.onerror = () => reject(new Error("refused"));
  });
}
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const sync = (key, val, op = "replace") => JSON.stringify({ __type: "__sync", __key: key, __op: op, __val: val });

describe("B — §38.4.3 bounds, served", () => {
  test("the token bucket: a burst past `frame-burst=` closes the sender 1008, and nothing past the bucket is relayed", async () => {
    const { bun, base, logs } = await served(src(" frame-rate=1 frame-burst=3"));
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      const b = await connect(base, "/_scrml_ws/chat");
      await tick();
      for (let i = 1; i <= 6; i++) a.ws.send(sync("count", i));
      await tick(200);
      expect(b.got.map((f) => f.__val)).toEqual([1, 2, 3]);
      expect(a.closed()?.code).toBe(1008);
      expect(logs.join("\n")).toContain("rate limit");
      expect(b.closed()).toBe(null);           // the limit is per connection: b is untouched
      b.ws.close();
    } finally { bun.stop(true); }
  });

  test("the token bucket refills at `frame-rate=`: frames sent within the rate are all relayed", async () => {
    const { bun, base } = await served(src(" frame-rate=20 frame-burst=1"));
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      const b = await connect(base, "/_scrml_ws/chat");
      await tick();
      for (let i = 1; i <= 4; i++) { a.ws.send(sync("count", i)); await tick(120); }
      expect(b.got.map((f) => f.__val)).toEqual([1, 2, 3, 4]);
      expect(a.closed()).toBe(null);
      a.ws.close(); b.ws.close();
    } finally { bun.stop(true); }
  });

  test("a malformed frame spends a token too (the bucket is checked before the decode)", async () => {
    const { bun, base } = await served(src(" frame-rate=1 frame-burst=1"));
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      await tick();
      a.ws.send(sync("count", 1));
      a.ws.send("{nope");
      await tick(150);
      expect(a.closed()?.code).toBe(1008);    // the rate limit, not 1007: the second frame found no token
    } finally { bun.stop(true); }
  });

  test("the subscriber cap: a further upgrade is answered 503 (after 403/404/405/426); a closed connection frees its place", async () => {
    const { srv, bun, base } = await served(src(" max-subscribers=2"));
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      const b = await connect(base, "/_scrml_ws/chat");
      await tick();
      await expect(connect(base, "/_scrml_ws/chat")).rejects.toThrow();
      const up = (headers) => srv.fetch(new Request(`http://${base}/_scrml_ws/chat`, { headers }), { upgrade: () => true });
      expect((await up({ Upgrade: "websocket", Connection: "Upgrade" })).status).toBe(503);
      // the Origin refusal still comes first
      expect((await up({ Upgrade: "websocket", Connection: "Upgrade", Origin: "https://evil.example" })).status).toBe(403);
      expect((await srv.fetch(new Request(`http://${base}/_scrml_ws/chat`), null)).status).toBe(426);
      a.ws.close();
      await tick(150);
      const c = await connect(base, "/_scrml_ws/chat");
      expect(c.closed()).toBe(null);
      b.ws.close(); c.ws.close();
    } finally { bun.stop(true); }
  });

  test("the frame-size bound counts UTF-8 bytes, not characters (1009), from `<program channel-max-frame=>`", async () => {
    const { bun, base } = await served(src("", " channel-max-frame=300"));
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      const b = await connect(base, "/_scrml_ws/chat");
      await tick();
      const ascii = sync("note", "x".repeat(200));        // ≈ 250 bytes: under the bound
      expect(new TextEncoder().encode(ascii).length).toBeLessThanOrEqual(300);
      a.ws.send(ascii);
      await tick();
      expect(b.got.length).toBe(1);
      const wide = sync("note", "€".repeat(90));           // under 300 characters, over 300 bytes
      expect(wide.length).toBeLessThanOrEqual(300);
      expect(new TextEncoder().encode(wide).length).toBeGreaterThan(300);
      a.ws.send(wide);
      await tick(150);
      expect(b.got.length).toBe(1);
      expect(a.closed()?.code).toBe(1009);
      b.ws.close();
    } finally { bun.stop(true); }
  });

  test("§38.4.3 topic scope: two channels naming one `topic=` never exchange frames", async () => {
    const s = prog(`${chan(`name="a" topic="t"`, `  let <x:int=0/>`)}\n${chan(`name="b" topic="t"`, `  let <x2:int=0/>`)}\n<p>\${@x} \${@x2}</p>`);
    const { bun, base } = await served(s);
    try {
      const a = await connect(base, "/_scrml_ws/a");
      const b = await connect(base, "/_scrml_ws/b");
      const a2 = await connect(base, "/_scrml_ws/a");
      await tick();
      a.ws.send(sync("x", 5));
      await tick();
      expect(a2.got).toEqual([{ __type: "__sync", __key: "x", __op: "replace", __val: 5 }]);
      expect(b.got).toEqual([]);
      a.ws.close(); b.ws.close(); a2.ws.close();
    } finally { bun.stop(true); }
  });

  test("§38.4 (ruling item 44): a cell with no write capability is not synced, and a frame naming it closes the sender (1008)", async () => {
    const s = prog(`${chan(`name="chat"`, `  let <count:int=0/>\n  <fixed:int=3/>`)}\n<p>\${@count} \${@fixed}</p>`);
    const r = frontEnd(mods(), [{ path: "app.scrml", src: s }], "app.scrml");
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const { server } = artifacts(r.core);
    expect(server.js).not.toContain(`key: "fixed"`);
    const { bun, base } = await served(s);
    try {
      const a = await connect(base, "/_scrml_ws/chat");
      const b = await connect(base, "/_scrml_ws/chat");
      await tick();
      a.ws.send(sync("fixed", 9));
      await tick(150);
      expect(b.got).toEqual([]);
      expect(a.closed()?.code).toBe(1008);
      b.ws.close();
    } finally { bun.stop(true); }
  });
});

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");

describe("C — §40.2 the development server checks Host (DNS rebinding)", () => {
  test("devHostAllowed: the loopback names on the dev port, configured names on any port; everything else refused", async () => {
    const { devHostAllowed, devAllowHostName } = await import(CLI);
    const extra = new Set(["myapp.test"]);
    const yes = ["127.0.0.1:3000", "localhost:3000", "LOCALHOST:3000", "[::1]:3000", "myapp.test", "myapp.test:8443", "MyApp.Test:3000"];
    const no = [null, "", "evil.example:3000", "evil.example", "127.0.0.1:3001", "localhost", "127.0.0.1", "[::1]", "localhost.:3000",
      "127.0.0.1:3000:1", "127.0.0.1:abc", "localhost:3000/x", "user@localhost:3000", "[::1", "[::1]x", "127.0.0.2:3000", "sub.myapp.test",
      "0.0.0.0:3000", "localhost :3000"];
    for (const h of yes) expect([h, devHostAllowed(h, 3000, extra)]).toEqual([h, true]);
    for (const h of no) expect([h, devHostAllowed(h, 3000, extra)]).toEqual([h, false]);
    // an omitted port is 80
    expect(devHostAllowed("localhost", 80)).toBe(true);
    // with no configured names, only loopback
    expect(devHostAllowed("myapp.test:3000", 3000)).toBe(false);
    expect(devAllowHostName("MyApp.Test")).toBe("myapp.test");
    for (const bad of ["", "*", "*.example", "a:80", "http://a", "a/b", "a b", ".a", "a..b"]) expect([bad, devAllowHostName(bad)]).toEqual([bad, null]);
  });

  test("a spawned `scrml-boot dev`: a foreign Host gets 403 on every route (page, server route, channel upgrade) before the Origin check", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "scrml-boot-host-"));
    const file = join(tmp, "app.scrml");
    await Bun.write(file, src());
    const p = Bun.spawn(["bun", CLI, "dev", file, "--port", "0", "--allow-host", "myapp.test"], {
      cwd: ROOT, env: { ...process.env, SCRML_BOOT_CACHE_DIR: join(tmp, "cache"), NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe",
    });
    const reader = p.stderr.getReader();
    let log = "";
    const until = async (re) => {
      const end = Date.now() + 120000;
      while (!re.test(log)) {
        if (Date.now() > end) throw new Error("dev server: timed out waiting for " + re + "\n" + log);
        const { value, done } = await reader.read();
        if (done) throw new Error("dev server exited:\n" + log);
        log += new TextDecoder().decode(value);
      }
      return re.exec(log);
    };
    // a raw HTTP/1.1 request, so the Host header is exactly what a rebound page's browser sends
    const raw = (port, path, host, extra = "") => new Promise((res, rej) => {
      const s = tcpConnect(Number(port), "127.0.0.1", () => {
        s.write(`GET ${path} HTTP/1.1\r\n${host === null ? "" : `Host: ${host}\r\n`}${extra}Connection: close\r\n\r\n`);
      });
      let out = "";
      s.on("data", (d) => { out += d.toString(); });
      s.on("end", () => res(Number(/^HTTP\/1\.1 (\d+)/.exec(out)?.[1] ?? 0)));
      s.on("error", rej);
    });
    try {
      const port = (await until(/http:\/\/127\.0\.0\.1:(\d+)\//))[1];
      const WS = "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n";
      // the rebinding shape: Host and Origin both the attacker's name (the Origin check alone passes it)
      const evil = `evil.example:${port}`;
      expect(await raw(port, "/", evil)).toBe(403);
      expect(await raw(port, "/program.client.js", evil)).toBe(403);
      expect(await raw(port, "/_scrml/anything", evil)).toBe(403);
      expect(await raw(port, "/__scrml-boot/events", evil)).toBe(403);
      expect(await raw(port, "/_scrml_ws/chat", evil, `Origin: http://${evil}\r\n${WS}`)).toBe(403);
      // HTTP/1.1 with no Host: refused (Bun's own HTTP layer answers 400 before fetch runs)
      expect([400, 403]).toContain(await raw(port, "/", null));
      // the server itself, and a configured name
      expect(await raw(port, "/", `127.0.0.1:${port}`)).toBe(200);
      expect(await raw(port, "/", `localhost:${port}`)).toBe(200);
      expect(await raw(port, "/", "myapp.test")).toBe(200);
      expect(await raw(port, "/_scrml_ws/chat", `127.0.0.1:${port}`, `Origin: http://127.0.0.1:${port}\r\n${WS}`)).toBe(101);
      // a loopback Host with a cross Origin is still the Origin check's 403 (Host passes, Origin does not)
      expect(await raw(port, "/_scrml_ws/chat", `127.0.0.1:${port}`, `Origin: http://evil.example\r\n${WS}`)).toBe(403);
    } finally {
      p.kill();
      await p.exited;
      rmSync(tmp, { recursive: true, force: true });
    }
  }, { timeout: 240000 });

  test("`--allow-host` refuses a name with a port, a scheme or a wildcard (usage error, exit 2)", () => {
    const r = Bun.spawnSync(["bun", CLI, "dev", "nope.scrml", "--allow-host", "*.example"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("--allow-host takes a host name");
  });
});

// D. S478 open-Qs ruling item 47 (g-boot-channel-s478 owner question 7): "desugar the arms into
//    client functions typed by the synthesized `RowChange`" — an arm's scope and type errors are
//    now reported (before: the arm bodies were read for syntax only).
describe("D — §38.13.3 `<onchange>` arms are client functions typed by RowChange", () => {
  const feed = (arms) => `<program db="postgres://localhost/app">\n<schema>\n  orders {\n    id: integer primary key\n    status: text not null\n    note: text\n  }\n</schema>\n<channel name="f" watches=orders>\n<onchange>\n${arms}\n</onchange>\n</channel>\n</program>\n`;
  const diags = (s) => frontEnd(mods(), [{ path: "app.scrml", src: s }], "app.scrml").diags;
  test("a clean arm set reports nothing: row is the table's struct, key its primary key", () => {
    const ds = diags(feed(`<Inserted(row) : print(row.status)>\n<Updated(row) : print(row.id)>\n<Deleted(key) : print(key + 1)>`));
    expect(ds.filter((d) => d.severity === "Error")).toEqual([]);
  });
  test("an unknown name in an arm is E-SCOPE-001 (red on base: not reported)", () => {
    const ds = diags(feed(`<Inserted(row) : print(nope)>\n<Updated(row) : print(row.id)>\n<Deleted(key) : print(key)>`));
    expect(ds.map((d) => d.code)).toContain("E-SCOPE-001");
  });
  test("the row is typed: a nullable column is `string | not` (E-PRINT-NON-PRIMITIVE), a missing field is refused", () => {
    const ds = diags(feed(`<Inserted(row) : print(row.note)>\n<Updated(row) : print(row.nosuch)>\n<Deleted(key) : print(key)>`));
    const es = ds.filter((d) => d.severity === "Error");
    expect(es.map((d) => d.code)).toContain("E-PRINT-NON-PRIMITIVE");
    expect(es.length).toBeGreaterThanOrEqual(2);
  });
});
