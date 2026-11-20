// build-mode-s480.test.js — s480-build-mode: the bootstrap's build mode (ruling item 10) and the
// production withhold of driver text from EVERY value a route delivers (ruling item 16).
//
// Rulings (scrml-support/user-voice-scrml.md "⭐ RULED — the rest of S478 hand-off §3.B", S479):
//   item 10 (PERMANENT): "`scrml-boot dev` builds development, `scrml-boot compile` builds production
//     (`--dev` opts in); the deployed artifact fails safe (§20.6.8 `log()` emits zero bytes)."
//   item 16 (PERMANENT): "the production-build withhold applies to every value a route delivers,
//     returned as well as failed; build in the bootstrap (today `server-runtime.js` blanks only
//     failures)".
//
// SPEC §19.9.1 (S474): "Withheld, in a production build: a string of the delivered … payload is
// blanked (the empty string) when it contains a whole driver message the request's failed queries
// produced, or equals one of their non-column driver tokens" and "The author's text is the
// author's. Text the author derives from the driver text (`m.slice(16)`, `f.toUpperCase()`) or
// writes themselves is delivered as written". So: a returned string that IS (or embeds whole) the
// driver message is withheld; the author's own words and an ordinary return are not.
//
// What is pinned here:
//   A. the build mode is the ARTIFACT's: a production artifact withholds even when its host passes
//      the old `dev: true` flag; only a dev-printed artifact (rt.devBuild) delivers driver text.
//   B. a RETURNED value carrying driver text is withheld in production (string, embedded, struct
//      field, CHECK token); ordinary returns are untouched — even after a failed query.
//   C. the walk is type-directed: an enum variant NAME equal to a driver token is never blanked
//      (before s480 a failure payload's nested unit variant was blanked to "" and the client got a
//      value that does not decode).
//   D. an `<endpoint>` arm's answer (§61.5) is a delivered value too.
//   E. served end to end through scrml-boot: `compile` (production) — the response BODY holds no
//      driver text; `compile --dev` / the dev server's build — it does.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { mods, compile, artifacts, serve, post, pathOf, plainRequest, plainRespond } from "./server-artifact-harness.js";

const CLI = join(import.meta.dir, "..", "..", "..", "scripts", "scrml-boot.ts");
const SQ = "?" + "{";
const BADCOL = `${SQ}\`SELECT secret_col FROM users WHERE id = \${a}\`}`;
const CHK = `${SQ}\`INSERT INTO amounts (n) VALUES (\${n})\`}`;
const PROGRAM = `<program db="./app.db">
    type Kind:enum = { Positive, Other }
    type E:enum = { Bad(why: string), Tagged(kind: Kind, why: string), QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    type Rep:struct = { why: string, n: int, kind: Kind }
    function leakString(a: int)! E {
        let out: string = "";
        ${BADCOL}.run() !{ .QueryFailed(m) :> { out = m; }, _ :> { fail .Bad("other"); }, };
        return out;
    }
    function leakEmbedded(a: int)! E {
        let out: string = "";
        ${BADCOL}.run() !{ .QueryFailed(m) :> { out = "db said: " + m; }, _ :> { fail .Bad("other"); }, };
        return out;
    }
    function leakStruct(a: int)! E {
        let w: string = "";
        ${BADCOL}.run() !{ .QueryFailed(m) :> { w = m; }, _ :> { fail .Bad("other"); }, };
        const rep: Rep = { why: w, n: 7, kind: Kind.Positive };
        return rep;
    }
    function leakToken(n: int)! E {
        let w: string = "";
        ${CHK}.run() !{ .ConstraintViolation(f) :> { w = f; }, _ :> { fail .Bad("other"); }, };
        return w;
    }
    function ownWords(a: int)! E {
        let w: string = "";
        ${BADCOL}.run() !{ _ :> { w = "no such user"; }, };
        return w;
    }
    function transformed(a: int)! E {
        let w: string = "";
        ${BADCOL}.run() !{ .QueryFailed(m) :> { w = m.slice(16); }, _ :> { fail .Bad("other"); }, };
        return w;
    }
    server function plainReturn(a: int)! E {
        return "Positive";
    }
    function variantLikeToken(n: int)! E {
        ${CHK}.run() !{ .ConstraintViolation(f) :> { fail .Tagged(Kind.Positive, f); }, _ :> { fail .Bad("other"); }, };
        return 1;
    }
    let <r:int=0/>
    let <s:string=""/>
    let <q:Rep=({ why: "", n: 0, kind: Kind.Other })/>
    <main>
        <button onclick={ @s = leakString(1) !{ _ :> "", }; }>a</button>
        <button onclick={ @s = leakEmbedded(1) !{ _ :> "", }; }>b</button>
        <button onclick={ @q = leakStruct(1) !{ _ :> @q, }; }>c</button>
        <button onclick={ @s = leakToken(1) !{ _ :> "", }; }>d</button>
        <button onclick={ @s = ownWords(1) !{ _ :> "", }; }>e</button>
        <button onclick={ @s = transformed(1) !{ _ :> "", }; }>f</button>
        <button onclick={ @s = plainReturn(1) !{ _ :> "", }; }>g</button>
        <button onclick={ @r = variantLikeToken(1) !{ _ :> 0, }; }>h</button>
    </main>
</program>
`;

const DDL = (file) => {
  const setup = new Database(file);
  setup.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");
  setup.exec("CREATE TABLE amounts (n INTEGER, CONSTRAINT Positive CHECK (n > 0))");
  setup.close();
};

let dir, file, sql, core;
beforeAll(async () => {
  mods();
  dir = mkdtempSync(join(tmpdir(), "s480-build-"));
  file = join(dir, "app.db");
  DDL(file);
  sql = new SQL("sqlite://" + file);
  core = compile(PROGRAM).core;
}, 300000);
afterAll(async () => {
  await sql.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("A — the build mode is the artifact's (ruling item 10)", () => {
  test("a production artifact prints no dev marker; a dev artifact wraps its host in rt.devBuild", () => {
    expect(artifacts(core).server.js).not.toContain("devBuild");
    expect(artifacts(core, { dev: true }).server.js).toContain("rt.devBuild(host$)");
  });
  test("a PRODUCTION artifact withholds driver text even when its host passes `dev: true` (fails safe)", async () => {
    const logs = [];
    const { srv, routes } = await serve(core, sql, logs, { hostDev: true });
    const res = await post(srv, pathOf(routes, "leakString"), [1]);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("secret_col");
    expect(res.json).toBe("");
  });
});

for (const build of ["production", "dev"]) {
  const prod = build === "production";
  describe(`B/C — ${build} build: every value a route delivers (ruling item 16)`, () => {
    let srv, routes, logs;
    beforeAll(async () => {
      logs = [];
      ({ srv, routes } = await serve(core, sql, logs, { dev: !prod }));
    }, 300000);
    const call = (fn, args) => post(srv, pathOf(routes, fn), args);
    const blankedLogged = () => logs.some((l) => l.includes("blanked in the response"));

    test("a RETURNED driver message (`.QueryFailed(m) :> { out = m }; return out`): withheld in production, full in dev; logged either way", async () => {
      logs.length = 0;
      const res = await call("leakString", [1]);
      expect(res.status).toBe(200);
      if (prod) {
        expect(res.text).not.toContain("secret_col");
        expect(res.json).toBe("");
        expect(blankedLogged()).toBe(true);
      } else {
        expect(res.json).toBe("no such column: secret_col");
        expect(blankedLogged()).toBe(false);
      }
      expect(logs.some((l) => l.includes("no such column: secret_col"))).toBe(true);
    });
    test("a returned string EMBEDDING the whole driver message is withheld in production", async () => {
      const res = await call("leakEmbedded", [1]);
      expect(res.json).toBe(prod ? "" : "db said: no such column: secret_col");
    });
    test("a returned STRUCT: only its driver-text string field is blanked; the number and the enum field stay", async () => {
      const res = await call("leakStruct", [1]);
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ why: prod ? "" : "no such column: secret_col", n: 7, kind: "Positive" });
    });
    test("a returned CHECK constraint name (a non-column token) is withheld in production", async () => {
      const res = await call("leakToken", [-1]);
      expect(res.json).toBe(prod ? "" : "Positive");
    });
    test("the author's own words after a failed query are delivered in both builds", async () => {
      const res = await call("ownWords", [1]);
      expect(res.json).toBe("no such user");
    });
    test("NOT tracked (g-boot-wire-driver-text-transformed-not-tracked-s474): a transformed driver text is the author's", async () => {
      const res = await call("transformed", [1]);
      expect(res.json).toBe("secret_col");
    });
    test("an ordinary return with no failed query is never touched (even text equal to a token another request saw)", async () => {
      await call("leakToken", [-1]);
      const res = await call("plainReturn", [1]);
      expect(res.json).toBe("Positive");
    });
    test("C — a failure payload's nested enum VARIANT named like the CHECK token is kept (it decodes); its string field is withheld", async () => {
      const res = await call("variantLikeToken", [-1]);
      expect(res.json.variant).toBe("Tagged");
      expect(res.json.data).toEqual({ kind: "Positive", why: prod ? "" : "Positive" });
    });
  });
}

describe("D — an <endpoint> arm's answer (§61.5) is a delivered value", () => {
  const EP = `<program db="./app.db">
    type M:enum = {
      Look(id: int)
      Hello(id: int)
    }
    function leak(a: int) -> string {
        let out: string = "";
        ${BADCOL}.run() !{ .QueryFailed(m) :> { out = m; }, _ :> { out = "other"; }, };
        return out;
    }
    <endpoint path="/api/look" method="POST" accepts=M>
      <Look(id) : { why: leak(id) }>
      <Hello(id) : { why: "hello" }>
    </endpoint>
</program>
`;
  let ecore;
  beforeAll(() => { ecore = compile(EP).core; }, 300000);
  const send = async (srv, body) => {
    const res = await srv.fetch(plainRequest("/api/look", "POST", { "Content-Type": "application/json" }, body));
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, text, json };
  };
  for (const build of ["production", "dev"]) {
    const prod = build === "production";
    test(`${build}: the arm's driver text is ${prod ? "withheld" : "delivered"}; its own text is delivered`, async () => {
      const { srv } = await serve(ecore, sql, [], { dev: !prod });
      const a = await send(srv, JSON.stringify({ tag: "Look", id: 1 }));
      expect(a.status).toBe(200);
      expect(a.json).toEqual({ why: prod ? "" : "no such column: secret_col" });
      if (prod) expect(a.text).not.toContain("secret_col");
      const b = await send(srv, JSON.stringify({ tag: "Hello", id: 1 }));
      expect(b.json).toEqual({ why: "hello" });
    });
    test(`${build}: a body that is not JSON — the host parser's message only in dev`, async () => {
      const { srv } = await serve(ecore, sql, [], { dev: !prod });
      const r = await send(srv, "{nope");
      expect(r.status).toBe(400);
      expect(r.json.error.kind).toBe("Malformed");
      if (prod) expect(r.json.error.message).toBe("request body is not JSON");
      else expect(r.json.error.message.startsWith("request body is not JSON: ")).toBe(true);
    });
  }
});

describe("E — served through scrml-boot (compile = production, --dev / dev = development)", () => {
  let work;
  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "s480-served-"));
    DDL(join(work, "app.db"));
    writeFileSync(join(work, "app.scrml"), PROGRAM);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  async function servedBody(outName, dev) {
    const { compileFile } = await import(CLI);
    const out = join(work, outName);
    const r = await compileFile(join(work, "app.scrml"), { outDir: out, dev });
    expect(r.ok).toBe(true);
    const mod = await import(pathToFileURL(join(out, "program.server.js")).href);
    // the host flag of the pre-s480 dev server, passed to BOTH: it decides nothing now. Plain request /
    // response records (the harness's), not the globals another test file may have replaced (happy-dom).
    const srv = mod.createServer({ root: work, dev: true, respond: plainRespond });
    const route = mod.manifest.routes.find((x) => x.fn === "leakString").path;
    const req = plainRequest(route, "POST", { "Content-Type": "application/json", Cookie: "scrml_csrf=t1", "X-CSRF-Token": "t1" }, JSON.stringify([1]));
    const res = await srv.fetch(req);
    return { status: res.status, body: await res.text(), js: readFileSync(join(out, "program.server.js"), "utf8") };
  }

  test("`compile` (production): the response BODY carries no driver text", async () => {
    const r = await servedBody("prod", false);
    expect(r.status).toBe(200);
    expect(r.body).toBe('""');
    expect(r.body).not.toContain("secret_col");
    expect(r.body).not.toContain("no such column");
    expect(r.js).not.toContain("devBuild");
  }, 300000);
  test("`compile --dev` (development): the driver text is delivered", async () => {
    const r = await servedBody("dev", true);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toBe("no such column: secret_col");
    expect(r.js).toContain("rt.devBuild(host$)");
  }, 300000);
  test("the CLI: `compile --dev` is accepted and says it is a development build; plain compile does not", () => {
    const run = (args) => Bun.spawnSync(["bun", CLI, "compile", join(work, "app.scrml"), ...args], { stdout: "pipe", stderr: "pipe" });
    const d = run(["-o", join(work, "cli-dev"), "--dev"]);
    expect(d.exitCode).toBe(0);
    expect(d.stdout.toString()).toContain("DEVELOPMENT build");
    expect(d.stderr.toString()).toContain("do not deploy it");
    expect(readFileSync(join(work, "cli-dev", "program.server.js"), "utf8")).toContain("rt.devBuild(host$)");
    const p = run(["-o", join(work, "cli-prod")]);
    expect(p.exitCode).toBe(0);
    expect(p.stdout.toString()).not.toContain("DEVELOPMENT");
    expect(readFileSync(join(work, "cli-prod", "program.server.js"), "utf8")).not.toContain("devBuild");
  }, 300000);
});

// s480 r1 (review #2011): F1 — a DEVELOPMENT build defaults to its own folder (`dist/<name>.dev/`),
// never the production `dist/<name>/`, and says "do not deploy" when it starts; F2/F3 — with no
// AsyncLocalStorage the server refuses to start (no process-wide fallback record to flood or share).
describe("F — r1: the dev build never lands in the production folder; it warns; no ALS, no server", () => {
  let work;
  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "s480-r1-"));
    DDL(join(work, "app.db"));
    writeFileSync(join(work, "app.scrml"), PROGRAM);
  });
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const DEV_WARN = "DEVELOPMENT build — do not deploy";

  test("a dev artifact's createServer logs one loud do-not-deploy line; a production artifact logs nothing new", async () => {
    const devLogs = [];
    await serve(core, sql, devLogs, { dev: true });
    expect(devLogs.filter((l) => l.includes(DEV_WARN)).length).toBe(1);
    const prodLogs = [];
    await serve(core, sql, prodLogs, {});
    expect(prodLogs).toEqual([]);
  });

  test("`compile` then `scrml-boot dev` (no -o): dist/app/ is still the production build; the dev build is in dist/app.dev/ and warns", async () => {
    const c = Bun.spawnSync(["bun", CLI, "compile", join(work, "app.scrml")], { stdout: "pipe", stderr: "pipe" });
    expect(c.exitCode).toBe(0);
    const prodJs = join(work, "dist", "app", "program.server.js");
    expect(readFileSync(prodJs, "utf8")).not.toContain("devBuild");
    const p = Bun.spawn(["bun", CLI, "dev", join(work, "app.scrml"), "--port", "0"], {
      env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe",
    });
    const reader = p.stderr.getReader();
    let log = "";
    try {
      const end = Date.now() + 120000;
      while (!/✓ .*compiled/.test(log)) {
        if (Date.now() > end) throw new Error("dev server: timed out\n" + log);
        const { value, done } = await reader.read();
        if (done) throw new Error("dev server exited:\n" + log);
        log += new TextDecoder().decode(value);
      }
    } finally {
      p.kill();
      await p.exited;
    }
    expect(log).toContain(DEV_WARN);
    expect(readFileSync(prodJs, "utf8")).not.toContain("devBuild");
    expect(readFileSync(join(work, "dist", "app.dev", "program.server.js"), "utf8")).toContain("rt.devBuild(host$)");
  }, 300000);

  test("`compile --dev` with no -o also writes dist/app.dev/, not dist/app/", async () => {
    const { compileFile, defaultOutDir } = await import(CLI);
    expect(defaultOutDir(join(work, "app.scrml"), true)).toBe(join(work, "dist", "app.dev"));
    expect(defaultOutDir(join(work, "app.scrml"))).toBe(join(work, "dist", "app"));
    const r = await compileFile(join(work, "app.scrml"), { dev: true });
    expect(r.ok).toBe(true);
    expect(r.outDir).toBe(join(work, "dist", "app.dev"));
  }, 300000);

  test("no AsyncLocalStorage on the host: createServer throws (dev and production) — no unscoped fallback", async () => {
    const { compileFile } = await import(CLI);
    for (const dev of [false, true]) {
      const out = join(work, dev ? "noals-dev" : "noals-prod");
      expect((await compileFile(join(work, "app.scrml"), { outDir: out, dev })).ok).toBe(true);
      // a fresh process: the runtime caches its store once it has one
      const script = `process.getBuiltinModule = undefined;
        const m = await import(${JSON.stringify(pathToFileURL(join(out, "program.server.js")).href)});
        try { m.createServer({ root: ${JSON.stringify(work)}, log: () => {} }); console.log("SERVED"); }
        catch (e) { console.log("REFUSED " + e.message); }`;
      const r = Bun.spawnSync(["bun", "-e", script], { stdout: "pipe", stderr: "pipe" });
      const outText = r.stdout.toString();
      expect(outText).toContain("REFUSED scrml server: no AsyncLocalStorage");
      expect(outText).not.toContain("SERVED");
    }
  }, 300000);
});
