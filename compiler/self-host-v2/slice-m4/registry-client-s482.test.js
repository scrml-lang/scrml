// s482-registry-client — §22.4.2 strategy 2: the runtime type registry holds only the types the
// CLIENT side uses (ruling:user-voice-scrml.md-S482-registry-client-types, "yes, client-used types
// only"; gap g-boot-meta-reflect-registry-scope-s482, raised by the #2080 review MED-1).
//
// A computed `reflect(meta.get("k"))` in a runtime `^{}` block looks its name up in a registry the
// client artifact carries. Before this lane it held every type in scope, so a type only a
// `server fn` used shipped its name and field names in the client JS. Now the client printer keeps
// only the entries of the types the client half uses (print.scrml clientRegistryIds / regArgs —
// the client half as #2061's reach decides it), closed through struct fields and enum payloads.
//
// Pinned (red on base where marked):
//   1. bundle grep (scrml-boot compileSource): a server-only `Secret { passwordHash, apiKey }` —
//      neither field name nor "Secret" in the client JS (red on base); a dead client function's
//      type is not in it either; a client-used type's entry is.
//   2. the shipping path (happy-dom): computed reflect of "Secret" gives `not` (red on base); a
//      client-used type reflects fully; a type both halves use is present; a client type's field
//      of a server-only type keeps that type (fail-safe, documented in SPEC §22.4.2); the
//      signature types of a server function the client calls are present; a primitive always is.
//   3. Chromium (SCRML_BROWSER_TESTS=1; SCRML_CHROMIUM names the binary): the same pins in a real
//      browser, from printProgram's output.
//   4. r1 (#2093 review): HIGH-1 — decided by the type's IDENTITY, not its name (lower.scrml
//      reflectIds): a server-only `Config` in main does not ship because lib's `Config` is
//      client-used (probe L9, red before r1); two same-named types both client-used → present; a
//      client-used `Config` in main with a server-only one in lib → main's present, lib's fields
//      absent. LOW-1 — a client function's return type (probe F5) and a client local's written
//      annotation (probe F2a) are client use (red before r1).
//   5. r2 (#2093 r1 re-review): an imported type is the one ITS import names (analyze.scrml
//      typeScopes — the resolver stubNamed reads; meta.scrml envOf, lower.scrml entryTypeIds), one
//      Sym id per entry. HIGH-1 — A12 / A12b / A12c: a literal `reflect(Config)` of xb's client-used
//      Config no longer ships xa's server-only `Config { dbPasswordZZ, adminTokenZZ }` (red before
//      r2: the literal seeded every exporter's id). MED-1 — A9c: the entry is xd's (the import's),
//      not xc's (the first exporter in program order). LOW-1 — A1c: under `import { Config as C }`
//      the name in scope is `C`: a computed reflect of "C" finds it, of "Config" gives not. Chromium
//      (SCRML_BROWSER_TESTS=1) runs L9 and A12 from the shipping path's artifacts.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";

const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const TYPES = `    type User:struct = { name: string, age: number }\n    type Color:enum = { Red, Green }`;
const P = (pre, body) => `<program>\n${TYPES}\n${pre}\nlet <n:int=0/>\n${body}\n</program>\n`;
const SECRET = `    type Secret:struct = { passwordHash: string, apiKey: string }
    server fn check(u: string) -> boolean { const s: Secret = { passwordHash: "h", apiKey: "k" }; return s.passwordHash == u; }`;
const CALL = `<button onclick=\${() => { const ok = check("x") !{ .Transport(_) :> false }; }}>b</button>`;
// a runtime block that renders the computed lookup of the cell `k`: "Name:field=type;…", or "none"
const SHOW = (k) => `let <k:string="${k}"/>
<div id="o">^{ const j = reflect(meta.get("k")); if (j is given) { let s = j.name + ":"; for (const f of j.fields) { s = s + f.name + "=" + f.type + ";"; } meta.emit("<p>" + s + "</p>"); } else { meta.emit("<p>none</p>"); } }</div>`;

const CASES = {
  secret: P(SECRET, SHOW("Secret") + CALL),
  clientUser: P(SECRET + `\nlet <u:User=({ name: "a", age: 1 })/>`, SHOW("User") + `<p>\${@u.name}</p>` + CALL),
  unusedUser: P("", SHOW("User")),
  both: P(`    type Both:struct = { sharedField: string }
    server fn sv(b: Both) -> string { return b.sharedField; }
    fn cl() -> string { const b: Both = { sharedField: "q" }; return b.sharedField; }`, SHOW("Both") + `<p>\${cl()}</p>`),
  wrapped: P(SECRET + `\n    type Wrap:struct = { inner: Secret }
    fn mk() -> string { const w: Wrap = { inner: { passwordHash: "p", apiKey: "a" } }; return w.inner.apiKey; }`, SHOW("Secret") + `<p>\${mk()}</p>` + CALL),
  dead: P(`    type Dead:struct = { deadField: string }
    fn unused() -> string { const d: Dead = { deadField: "x" }; return d.deadField; }`, SHOW("Dead")),
  called: P(`    type Rec:struct = { recField: string }
    server fn getR() -> Rec { return { recField: "z" }; }`, SHOW("Rec") + `<button onclick=\${() => { const r = getR() !{ .Transport(_) :> { recField: "t" } }; }}>g</button>`),
  notCalled: P(`    type Arg2:struct = { arg2Field: string }
    server fn sv2(a: Arg2) -> string { return a.arg2Field; }
    server fn other() -> string { return sv2({ arg2Field: "z" }); }`, SHOW("Arg2") + `<button onclick=\${() => { const r = other() !{ .Transport(_) :> "t" }; }}>g</button>`),
  payload: P(`    type Inner:struct = { innerField: string }\n    type Sh:enum = { A(i: Inner), B }\n    let <s:Sh=.B/>`, SHOW("Inner") + `<p>\${@s == .B}</p>`),
  literal: P(SECRET, `<div id="o">^{ const i = reflect(Secret); meta.emit("<p>" + i.name + "</p>"); }</div>` + CALL),
  primitive: P("", SHOW("string")),
  // r1 LOW-1
  retOnly: P(`    type Pt:struct = { x: int, y: int }
    fn origin() -> Pt | not { return not; }`, SHOW("Pt") + `<p>\${origin() is not}</p>`),
  localAnnot: P(`    type Item:struct = { label: string }
    fn cnt() -> int { let xs: Item[] = []; return xs.length; }`, SHOW("Item") + `<p>\${cnt()}</p>`),
};

// r1 HIGH-1 — two files that each declare `type Config` (main imports lib's function, not its type)
const LIB_CLIENT = (n) => `\${\n    type Config:struct = { mode: string }\n    export fn libLabel${n}() -> string { const c: Config = { mode: "x" }; return c.mode; }\n}\n`;
const LIB_SERVER = (n) => `\${\n    type Config:struct = { libSecretZZ: string }\n    server fn libCheck${n}(u: string) -> boolean { const c: Config = { libSecretZZ: "s" }; return c.libSecretZZ == u; }\n    export fn libLabel${n}() -> string { return "y"; }\n}\n`;
const COLLIDE = {
  // L9: main's Config is server-only, lib's is client-used
  serverMain: (n) => P(`    import { libLabel${n} } from "./lib${n}.scrml";
    type Config:struct = { dbPasswordZZ: string, adminTokenZZ: string }
    server fn cfg(u: string) -> boolean { const c: Config = { dbPasswordZZ: "p", adminTokenZZ: "t" }; return c.dbPasswordZZ == u; }`,
    SHOW("Config") + `<p>\${libLabel${n}()}</p><button onclick=\${() => { const ok = cfg("x") !{ .Transport(_) :> false }; }}>b</button>`),
  // both client-used
  bothClient: (n) => P(`    import { libLabel${n} } from "./lib${n}.scrml";
    type Config:struct = { mainMode: string }
    let <cc:Config=({ mainMode: "m" })/>`, SHOW("Config") + `<p>\${libLabel${n}()}</p><p>\${@cc.mainMode}</p>`),
  // main's client-used, lib's server-only
  clientMain: (n) => P(`    import { libLabel${n} } from "./lib${n}.scrml";
    type Config:struct = { mainMode: string }
    let <cc:Config=({ mainMode: "m" })/>`, SHOW("Config") + `<p>\${libLabel${n}()}</p><p>\${@cc.mainMode}</p>`),
};

// r2 — files that each EXPORT a type named `Config` (the #2093 r1 re-review probes cases6 / cases4)
const XA = `\${\n    export type Config:struct = { dbPasswordZZ: string, adminTokenZZ: string }\n    export server fn libSrv(u: string) -> boolean { const c: Config = { dbPasswordZZ: u, adminTokenZZ: u }; return c.dbPasswordZZ == "a"; }\n}\n`;
const XB = `\${\n    export type Config:struct = { mode: string }\n}\n`;
const LIT2 = `<div id="o2">^{ const j = reflect(Config); let s = j.name + ":"; for (const f of j.fields) { s = s + f.name + "=" + f.type + ";"; } meta.emit("<p>" + s + "</p>"); }</div>`;
const SHOWK = (cell, k, id) => `let <${cell}:string="${k}"/>
<div id="${id}">^{ const j = reflect(meta.get("${cell}")); if (j is given) { let s = j.name + ":"; for (const f of j.fields) { s = s + f.name + "=" + f.type + ";"; } meta.emit("<p>" + s + "</p>"); } else { meta.emit("<p>none</p>"); } }</div>`;
const SRVBTN = (call) => `<button onclick=\${() => { const r = ${call} !{ .Transport(_) :> false }; }}>b</button>`;
const R2 = {
  // A12: a literal and a computed reflect of xb's client-used Config; xa's server-only Config imported nowhere as a type
  a12: { files: { "xa.scrml": XA, "xb.scrml": XB }, main: P(`    import { libSrv } from "./xa.scrml";
    import { Config } from "./xb.scrml";
    let <c:Config=({ mode: "m" })/>`, LIT2 + SHOW("Config") + `<p>\${@c.mode}</p>` + SRVBTN(`libSrv("x")`)) },
  // A12b: the literal alone
  a12b: { files: { "xa.scrml": XA, "xb.scrml": XB }, main: P(`    import { libSrv } from "./xa.scrml";
    import { Config } from "./xb.scrml";
    let <c:Config=({ mode: "m" })/>`, LIT2 + `<p>\${@c.mode}</p>` + SRVBTN(`libSrv("x")`)) },
  // A12c: xa reached only through mid.scrml
  a12c: { files: { "xa.scrml": XA, "xb.scrml": XB, "mid.scrml": `\${\n    import { libSrv } from "./xa.scrml";\n    export server fn mid(u: string) -> boolean { return libSrv(u); }\n}\n` }, main: P(`    import { mid } from "./mid.scrml";
    import { Config } from "./xb.scrml";
    let <c:Config=({ mode: "m" })/>`, LIT2 + SHOW("Config") + `<p>\${@c.mode}</p>` + SRVBTN(`mid("x")`)) },
  // A9c: two exporters, both client-used; main imports xd's
  a9c: { files: { "xc.scrml": `\${\n    export type Config:struct = { fromXcQQ: string }\n    export fn xcLabel() -> string { const c: Config = { fromXcQQ: "c" }; return c.fromXcQQ; }\n}\n`, "xd.scrml": `\${\n    export type Config:struct = { fromXdQQ: string }\n}\n` }, main: P(`    import { xcLabel } from "./xc.scrml";
    import { Config } from "./xd.scrml";
    let <c:Config=({ fromXdQQ: "d" })/>`, SHOW("Config") + `<p>\${@c.fromXdQQ}\${xcLabel()}</p>`) },
  // A1c: an aliased import, client-used
  a1c: { files: { "libb.scrml": XB }, main: P(`    import { Config as C } from "./libb.scrml";
    let <c:C=({ mode: "m" })/>`, SHOW("Config") + SHOWK("k2", "C", "o2") + `<p>\${@c.mode}</p>`) },
};

// ---------------------------------------------------------------------------
// 1 + 2. the shipping path: scrml-boot compileSource → the client bundle, then the conformance
// runner (happy-dom)
// ---------------------------------------------------------------------------
let shipDir;
let seq = 0;
beforeAll(() => { shipDir = mkdtempSync(join(tmpdir(), "s482-registry-client-")); });
afterAll(() => { if (shipDir) rmSync(shipDir, { recursive: true, force: true }); });

async function compile(src) {
  const { compileSource } = await import("../../../scripts/scrml-boot.ts");
  const file = join(shipDir, `app${seq++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}

// a main file plus one library file beside it (the library named lib<n>.scrml)
async function compileWith(main, lib) {
  const n = seq++;
  writeFileSync(join(shipDir, `lib${n}.scrml`), lib(n));
  return compile(main(n));
}

// a main file plus named files beside it, in a directory of its own (the files' names repeat)
async function compileFiles(c) {
  const { compileSource } = await import("../../../scripts/scrml-boot.ts");
  const dir = mkdtempSync(join(shipDir, "r2-"));
  for (const [n, src] of Object.entries(c.files)) writeFileSync(join(dir, n), src);
  const file = join(dir, "app.scrml");
  writeFileSync(file, c.main);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}

// the text of `<sel> p` for each selector, from the conformance runner (happy-dom)
async function shownAt(res, sels) {
  const { runBootstrapArtifact } = await import("../../../scripts/bootstrap-conformance.ts");
  const r = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return sels.map((sel) => String(r.body.querySelector(`${sel} p`)?.textContent ?? "<none>").trim());
}

async function shownRes(res) {
  const { runBootstrapArtifact } = await import("../../../scripts/bootstrap-conformance.ts");
  const r = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return String(r.body.querySelector("#o p")?.textContent ?? "<none>").trim();
}

async function shown(src) {
  const { runBootstrapArtifact } = await import("../../../scripts/bootstrap-conformance.ts");
  const res = await compile(src);
  const r = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return String(r.body.querySelector("#o p")?.textContent ?? "<none>").trim();
}

describe("s482-registry-client — the client bundle (grep)", () => {
  test("a server-only type: neither its name nor its field names are in the client JS", async () => {
    const res = await compile(CASES.secret);
    const client = res.client.js + res.client.html;
    expect(client).not.toContain("passwordHash");
    expect(client).not.toContain("apiKey");
    expect(client).not.toContain(`name: "Secret"`);      // (the cell `k` holds the text "Secret" itself)
    // the registry is still there, with the primitives
    expect(client).toContain(`meta$.types.reflect(`);
    expect(client).toContain(`{ kind: "primitive", name: "string", fields: [], variants: [] }`);
    // the server artifact still has its own type
    expect(String(res.serverJs ?? "")).toContain("passwordHash");
  }, 120000);

  test("a type only an unreached client function names is not in it (§12.2 Trigger 6: not client code)", async () => {
    const res = await compile(CASES.dead);
    expect(res.client.js).not.toContain("deadField");
  }, 120000);

  test("a server function's parameter type the client never sends is not in it", async () => {
    const res = await compile(CASES.notCalled);
    expect(res.client.js).not.toContain("arg2Field");
  }, 120000);

  test("a client-used type's entry is", async () => {
    const res = await compile(CASES.clientUser);
    expect(res.client.js).toContain(`{ kind: "struct", name: "User", fields: [{ name: "name", type: "string" }, { name: "age", type: "number" }], variants: [] }`);
  }, 120000);
});

describe("s482-registry-client — computed reflect at run time (happy-dom)", () => {
  test("a computed reflect of a server-only type's name gives not", async () => {
    expect(await shown(CASES.secret)).toBe("none");
  }, 120000);

  test("a computed reflect of a type no code uses gives not", async () => {
    expect(await shown(CASES.unusedUser)).toBe("none");
  }, 120000);

  test("a client-used type reflects fully", async () => {
    expect(await shown(CASES.clientUser)).toBe("User:name=string;age=number;");
  }, 120000);

  test("a type used by both halves is present", async () => {
    expect(await shown(CASES.both)).toBe("Both:sharedField=string;");
  }, 120000);

  test("fail-safe: a client type's field of a server-only type keeps that type (the client holds its values)", async () => {
    expect(await shown(CASES.wrapped)).toBe("Secret:passwordHash=string;apiKey=string;");
  }, 120000);

  test("the return type of a server function the client calls is present (the client holds the value)", async () => {
    expect(await shown(CASES.called)).toBe("Rec:recField=string;");
  }, 120000);

  test("an enum payload's type of a client-used enum is present (transitive)", async () => {
    expect(await shown(CASES.payload)).toBe("Inner:innerField=string;");
  }, 120000);

  test("a type-literal reflect(T) in a runtime block is client code naming T", async () => {
    expect(await shown(CASES.literal)).toBe("Secret");
  }, 120000);

  test("a primitive name is always in the registry", async () => {
    expect(await shown(CASES.primitive)).toBe("string:");
  }, 120000);
});

describe("s482-registry-client r1 — by type identity, not name (#2093 review HIGH-1)", () => {
  test("L9: main's server-only Config does not ship because lib's Config is client-used", async () => {
    const res = await compileWith(COLLIDE.serverMain, LIB_CLIENT);
    const client = res.client.js + res.client.html;
    expect(client).not.toContain("dbPasswordZZ");
    expect(client).not.toContain("adminTokenZZ");
    expect(await shownRes(res)).toBe("none");
    expect(String(res.serverJs ?? "")).toContain("dbPasswordZZ");
  }, 120000);

  test("positive twin: two same-named types, both client-used — the block's file's own is present", async () => {
    const res = await compileWith(COLLIDE.bothClient, LIB_CLIENT);
    expect(await shownRes(res)).toBe("Config:mainMode=string;");
  }, 120000);

  test("main's client-used Config is present although lib's same-named Config is server-only; lib's fields are not", async () => {
    const res = await compileWith(COLLIDE.clientMain, LIB_SERVER);
    expect(res.client.js).not.toContain("libSecretZZ");
    expect(await shownRes(res)).toBe("Config:mainMode=string;");
  }, 120000);
});

describe("s482-registry-client r2 — an imported type is the one its import names (#2093 r1 re-review)", () => {
  const SECRET_FIELDS = ["dbPasswordZZ", "adminTokenZZ"];
  const noSecret = (res) => {
    const client = res.client.js + res.client.html;
    for (const f of SECRET_FIELDS) expect(client).not.toContain(f);
  };

  test("A12: literal + computed reflect(Config) of xb's client-used import — xa's server-only Config does not ship", async () => {
    const res = await compileFiles(R2.a12);
    noSecret(res);
    expect(await shownAt(res, ["#o2", "#o"])).toEqual(["Config:mode=string;", "Config:mode=string;"]);
  }, 120000);

  test("A12b: the literal reflect alone", async () => {
    const res = await compileFiles(R2.a12b);
    noSecret(res);
    expect(await shownAt(res, ["#o2"])).toEqual(["Config:mode=string;"]);
  }, 120000);

  test("A12c: xa reached only through another library", async () => {
    const res = await compileFiles(R2.a12c);
    noSecret(res);
    expect(await shownAt(res, ["#o2", "#o"])).toEqual(["Config:mode=string;", "Config:mode=string;"]);
  }, 120000);

  test("A9c (MED-1): two client-used exporters — the entry is the imported file's (xd), not the first exporter's (xc)", async () => {
    const res = await compileFiles(R2.a9c);
    expect(await shownAt(res, ["#o"])).toEqual(["Config:fromXdQQ=string;"]);
  }, 120000);

  test("A1c (LOW-1): import { Config as C } — the name in scope is C; a lookup of \"Config\" gives not", async () => {
    const res = await compileFiles(R2.a1c);
    expect(await shownAt(res, ["#o", "#o2"])).toEqual(["none", "C:mode=string;"]);
  }, 120000);
});

describe("s482-registry-client r1 — written types count (#2093 review LOW-1)", () => {
  test("F5: a client function's declared return type is client use", async () => {
    expect(await shown(CASES.retOnly)).toBe("Pt:x=int;y=int;");
  }, 120000);

  test("F2a: a client local's written annotation is client use", async () => {
    expect(await shown(CASES.localAnnot)).toBe("Item:label=string;");
  }, 120000);
});

// ---------------------------------------------------------------------------
// 3. Chromium (SCRML_BROWSER_TESTS=1; SCRML_CHROMIUM names the binary)
// ---------------------------------------------------------------------------
const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const suite = ON ? describe : describe.skip;
let browser, server, cdir, port;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  cdir = mkdtempSync(join(tmpdir(), "s482-registry-client-chromium-"));
  copyFileSync(RUNTIME, join(cdir, "scrml-runtime.js"));
  // node:http, not Bun.serve (another file in the same process may have replaced Response)
  server = createServer((req, res) => {
    const p = new URL(req.url, "http://localhost").pathname;
    if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    const f = join(cdir, p.slice(1));
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  const { default: puppeteer } = await import("puppeteer");
  browser = await puppeteer.launch({ executablePath: BIN, headless: true, args: ["--no-sandbox"] });
}, { timeout: 180000 });
afterAll(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  if (cdir) rmSync(cdir, { recursive: true, force: true });
});

let cseq = 0;
async function chromiumShown(src) {
  const r = frontEnd(mods, [{ path: "app.scrml", src }]);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  const name = `p${cseq++}`;
  const out = mods.print.printProgram(r.core, `${name}.client.js`, "scrml-runtime.js");
  expect(out.refused).toEqual([]);
  writeFileSync(join(cdir, `${name}.html`), out.html);
  writeFileSync(join(cdir, `${name}.client.js`), out.js);
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/${name}.html`);
  await page.waitForFunction(() => !!document.querySelector("#o p"), { timeout: 10000 }).catch(() => {});
  const text = await page.evaluate(() => document.querySelector("#o p")?.textContent ?? "<none>");
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  await page.close();
  return { text, js: out.js, html, errors };
}

// r2: a shipping-path build (scrml-boot compileSource — multi-file) in Chromium; the text of
// `<sel> p` for each selector
async function chromiumAt(res, sels) {
  const name = `p${cseq++}`;
  writeFileSync(join(cdir, `${name}.html`), res.client.html.replace("program.client.js", `${name}.client.js`));
  writeFileSync(join(cdir, `${name}.client.js`), res.client.js);
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/${name}.html`);
  await page.waitForFunction((s) => !!document.querySelector(s + " p"), { timeout: 10000 }, sels[0]).catch(() => {});
  const texts = [];
  for (const sel of sels) texts.push(await page.evaluate((s) => document.querySelector(s + " p")?.textContent ?? "<none>", sel));
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  await page.close();
  return { texts, html, errors };
}

suite("s482-registry-client — Chromium", () => {
  test("L9 (r1 HIGH-1): main's server-only Config does not ship because lib's Config is client-used", async () => {
    const res = await compileWith(COLLIDE.serverMain, LIB_CLIENT);
    expect(res.client.html).toContain("program.client.js");
    const r = await chromiumAt(res, ["#o"]);
    expect(r.texts).toEqual(["none"]);
    expect(r.html).not.toContain("dbPasswordZZ");
    expect(res.client.js).not.toContain("dbPasswordZZ");
    expect(r.errors).toEqual([]);
  }, 120000);

  test("A12 (r2 HIGH-1): literal + computed reflect(Config) describe xb's Config; xa's server-only fields are not in the page", async () => {
    const res = await compileFiles(R2.a12);
    const r = await chromiumAt(res, ["#o2", "#o"]);
    expect(r.texts).toEqual(["Config:mode=string;", "Config:mode=string;"]);
    expect(r.html).not.toContain("dbPasswordZZ");
    expect(r.html).not.toContain("adminTokenZZ");
    expect(res.client.js).not.toContain("dbPasswordZZ");
    expect(r.errors).toEqual([]);
  }, 120000);


  test("server-only Secret: the client JS holds neither field name, and a computed reflect of it is not", async () => {
    const r = await chromiumShown(CASES.secret);
    expect(r.js).not.toContain("passwordHash");
    expect(r.js).not.toContain("apiKey");
    expect(r.html).not.toContain("passwordHash");
    expect(r.text).toBe("none");
    expect(r.errors).toEqual([]);
  }, 60000);

  test("a client-used type still reflects fully; a type both halves use is present", async () => {
    const a = await chromiumShown(CASES.clientUser);
    expect(a.text).toBe("User:name=string;age=number;");
    expect(a.errors).toEqual([]);
    const b = await chromiumShown(CASES.both);
    expect(b.text).toBe("Both:sharedField=string;");
    expect(b.errors).toEqual([]);
  }, 60000);

  test("fail-safe: a client type's field of a server-only type keeps it", async () => {
    const r = await chromiumShown(CASES.wrapped);
    expect(r.text).toBe("Secret:passwordHash=string;apiKey=string;");
    expect(r.errors).toEqual([]);
  }, 60000);
});
