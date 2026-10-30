/**
 * S473 — `navigate()` in a SERVER-escalated function (SPEC §20.1 / §20.2), executed.
 *
 * Gap g-impl1-server-navigate-referenceerror-after-commit-s473. Before the fix,
 * `navigate("/posts", .Hard)` inside a server function lowered to the CLIENT runtime's
 * `_scrml_navigate("/posts")`, which the server bundle does not define: the route handler
 * threw `ReferenceError` AFTER the `?{}` INSERT had committed, and the call was not returned
 * either, so there was no redirect. The client saw an error for a saved post and resubmitted.
 *
 * Every test here imports the EMITTED server module and calls its route handler with a real
 * `Request` against a real bun:sqlite database:
 *   - a direct HTTP request gets `302` + `Location` (§20.1);
 *   - a request from scrml's own fetch wrapper (`X-Scrml-Fetch: 1`) gets `204` +
 *     `X-Scrml-Navigate` — a browser fetch would follow a 302 by itself and hand the wrapper
 *     the target page's HTML (server-navigate.ts; the wrapper half is the browser test
 *     compiler/tests/browser/server-navigate-s473.browser.test.js);
 *   - navigate ENDS the function at every placement (statements after it never run);
 *   - the target cannot be steered off-site by data, nor split the Location header.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "path";
import { writeFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { Database } from "bun:sqlite";
import { compileScrml } from "../../src/api.js";
import { patchAndImport, closeOpenedDbHandles, safeRmSync } from "../helpers/self-host-server-import.js";
import {
  fixedOriginOfLiteral,
  navigateFixedOriginOfText,
} from "../../src/codegen/server-navigate.ts";
import { rewriteNavigateCalls } from "../../src/codegen/rewrite.ts";

const EXECUTED_DB_TIMEOUT_MS = 30_000;

const testDir = dirname(fileURLToPath(new URL(import.meta.url)));
const TMP_ROOT = resolve(testDir, "_tmp_server_navigate_s473");
let tmpCounter = 0;

beforeAll(() => {
  if (!existsSync(TMP_ROOT)) mkdirSync(TMP_ROOT, { recursive: true });
});

afterAll(async () => {
  await closeOpenedDbHandles();
  safeRmSync(TMP_ROOT);
});

function compileApp(src, tag) {
  const name = `${tag}-${++tmpCounter}`;
  const dir = resolve(TMP_ROOT, name);
  const out = resolve(dir, "dist");
  // A run killed before afterAll leaves its directories: never read a stale bundle.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const dbPath = resolve(dir, "app.db");
  const db = new Database(dbPath, { create: true });
  db.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT UNIQUE)");
  db.close();
  writeFileSync(resolve(dir, "app.scrml"), src);
  const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: out });
  const errors = (result.errors ?? []).filter((e) => (e.severity ?? "error") === "error");
  return {
    errors,
    dbPath,
    serverJsPath: join(out, "app.server.js"),
    serverJs: existsSync(join(out, "app.server.js")) ? readFileSync(join(out, "app.server.js"), "utf8") : "",
    clientJs: existsSync(join(out, "app.client.js")) ? readFileSync(join(out, "app.client.js"), "utf8") : "",
  };
}

function rows(dbPath) {
  const db = new Database(dbPath);
  const r = db.query("SELECT title FROM posts ORDER BY id").all().map((x) => x.title);
  db.close();
  return r;
}

/** Call a server function's route handler the way an HTTP client would. */
async function call(mod, fnName, body, { scrmlFetch = false } = {}) {
  const route = mod.routes.find((r) => r.path.includes(`__ri_route_${fnName}_`));
  if (!route) throw new Error(`no route for ${fnName}: ${mod.routes.map((r) => r.path).join(", ")}`);
  const tok = "t0k3n-s473";
  const headers = { "content-type": "application/json", cookie: `scrml_csrf=${tok}`, "x-csrf-token": tok };
  if (scrmlFetch) headers["x-scrml-fetch"] = "1";
  const req = new Request("http://localhost" + route.path, { method: route.method ?? "POST", headers, body: JSON.stringify(body) });
  let res;
  try {
    res = await route.handler(req);
  } catch (e) {
    return { threw: e };
  }
  return {
    status: res.status,
    location: res.headers.get("location"),
    nav: res.headers.get("x-scrml-navigate"),
    text: await res.text(),
  };
}

// The PA's execution-proven repro (S473), verbatim apart from the button label.
const REPRO = `<program db="./app.db">

<db src="./app.db" tables="posts">
\${
    function createPost(title: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${title})\`}.run() !{
            .ConstraintViolation(_) :> { return }
            _ :> { return }
        }
        navigate("/posts", .Hard)
    }
}
</>

<button onclick=createPost("hello")>Create post</>

</program>
`;

describe("S473 — the repro: navigate(\"/posts\", .Hard) after a committed INSERT", () => {
  let app;
  let mod;
  beforeAll(async () => {
    app = compileApp(REPRO, "repro");
    mod = await patchAndImport(app.serverJsPath, app.dbPath);
  });

  test("compiles; the server bundle never references the client-only _scrml_navigate", () => {
    expect(app.errors.map((e) => e.code)).toEqual([]);
    expect(app.serverJs).not.toMatch(/(?<![\w$])_scrml_navigate\(/);
    expect(app.serverJs).toContain('_scrml_server_navigate("/posts", null);');
    expect(app.serverJs).toContain("function _scrml_server_navigate(path, fixedOrigin)");
    expect(app.serverJs).toContain("})().catch((_scrml_e) => _scrml_nav_settle(_scrml_e, _scrml_req));");
  });

  test("a direct request gets a real 302 to /posts, and the INSERT happened exactly once", async () => {
    const r = await call(mod, "createPost", { title: "hello" });
    expect(r.threw).toBeUndefined();
    expect(r.status).toBe(302);
    expect(r.location).toBe("/posts");
    expect(r.text).toBe("");
    expect(rows(app.dbPath)).toEqual(["hello"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("scrml's fetch wrapper gets 204 + X-Scrml-Navigate (no 302 for fetch to follow)", async () => {
    const r = await call(mod, "createPost", { title: "second" }, { scrmlFetch: true });
    expect(r.threw).toBeUndefined();
    expect(r.status).toBe(204);
    expect(r.nav).toBe("/posts");
    expect(r.location).toBeNull();
    expect(rows(app.dbPath)).toEqual(["hello", "second"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("the !{} arm's early return still answers normally (no navigation, no new row)", async () => {
    const r = await call(mod, "createPost", { title: "hello" });
    expect(r.status).toBe(200);
    expect(r.location).toBeNull();
    expect(rows(app.dbPath)).toEqual(["hello", "second"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("the client stubs ask for and follow the navigation header", () => {
    expect(app.clientJs).toContain('"X-Scrml-Fetch": "1"');
    expect(app.clientJs).toContain('if (_scrml_resp.headers.get("X-Scrml-Navigate") !== null) return _scrml_follow_server_navigate(_scrml_resp);');
    expect(app.clientJs).toContain("function _scrml_follow_server_navigate(resp)");
    // The client bundle carries no server code.
    expect(app.clientJs).not.toContain("_scrml_server_navigate(");
    expect(app.clientJs).not.toContain("INSERT INTO");
  });
});

const PLACEMENTS = `<program db="./app.db">

<db src="./app.db" tables="posts">
\${
    type Kind:enum = { New, Old }

    function goHome(n: number) {
        ?{\`INSERT INTO posts (title) VALUES (\${"peer" + n})\`}.run()
        navigate("/home")
        ?{\`INSERT INTO posts (title) VALUES (\${"after-navigate-in-peer"})\`}.run()
    }

    function viaPeer(t: string) {
        goHome(1)
        ?{\`INSERT INTO posts (title) VALUES (\${"after-peer-call"})\`}.run()
        return 5
    }

    function inIf(t: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${t})\`}.run()
        if (t == "go") {
            navigate("/if")
        }
        return 7
    }

    function inMatch(k: Kind) {
        ?{\`INSERT INTO posts (title) VALUES (\${"match"})\`}.run()
        match k {
            .New :> { navigate("/new") }
            .Old :> { navigate("/old") }
        }
        ?{\`INSERT INTO posts (title) VALUES (\${"after-match"})\`}.run()
    }

    function valueArm(k: Kind) {
        ?{\`INSERT INTO posts (title) VALUES (\${"va"})\`}.run()
        const r = match k {
            .New :> navigate("/va-new")
            .Old :> 3
        }
        return r
    }

    function inHandlerArm(t: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${t})\`}.run() !{
            .ConstraintViolation(_) :> navigate("/dup")
            _ :> { return }
        }
        navigate("/ok")
    }

    function twoWrites(t: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${t + "-1"})\`}.run()
        ?{\`INSERT INTO posts (title) VALUES (\${t + "-2"})\`}.run()
        navigate("/two")
    }

    function softOnServer(t: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${t})\`}.run()
        navigate("/soft", .Soft)
    }

    server function inTxn(t: string)! -> SqlError {
        transaction {
            ?{\`INSERT INTO posts (title) VALUES (\${t})\`}.run()
            navigate("/txn")
        }
    }

    function toData(t: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${"data-" + t})\`}.run()
        navigate(t)
    }

    function oauth(s: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${"oauth-" + s})\`}.run()
        navigate(\`https://idp.example.com/authorize?state=\${s}\`)
    }

    function oauthOpen(s: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${"oauth-open-" + s})\`}.run()
        navigate(\`https://idp.example.com\${s}\`)
    }
}
</>

<button onclick=viaPeer("a")>A</>
<button onclick=inIf("go")>B</>
<button onclick=inMatch(Kind.New)>C</>
<button onclick=valueArm(Kind.New)>D</>
<button onclick=inHandlerArm("x")>E</>
<button onclick=twoWrites("w")>F</>
<button onclick=softOnServer("s")>G</>
<button onclick=toData("x")>H</>
<button onclick=oauth("x")>I</>
<button onclick=oauthOpen("x")>J</>

</program>
`;

describe("S473 — navigate() ends the server function at every placement", () => {
  let app;
  let mod;
  beforeAll(async () => {
    app = compileApp(PLACEMENTS, "placements");
    mod = await patchAndImport(app.serverJsPath, app.dbPath);
  });
  const fresh = () => {
    const db = new Database(app.dbPath);
    db.exec("DELETE FROM posts");
    db.close();
  };

  test("compiles clean", () => {
    expect(app.errors.map((e) => e.code)).toEqual([]);
    expect(app.serverJs).not.toMatch(/(?<![\w$])_scrml_navigate\(/);
    expect(app.serverJs).not.toContain(".Hard");
    expect(app.serverJs).not.toContain(".Soft");
  });

  test("inside an in-process peer another server function awaited: the whole request ends", async () => {
    fresh();
    const r = await call(mod, "viaPeer", { t: "a" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/home");
    expect(rows(app.dbPath)).toEqual(["peer1"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("inside an if; the untaken branch returns the function's value", async () => {
    fresh();
    const taken = await call(mod, "inIf", { t: "go" }, { scrmlFetch: true });
    expect(taken.status).toBe(204);
    expect(taken.nav).toBe("/if");
    const untaken = await call(mod, "inIf", { t: "stay" });
    expect(untaken.status).toBe(200);
    expect(untaken.text).toBe("7");
    expect(untaken.location).toBeNull();
    expect(rows(app.dbPath)).toEqual(["go", "stay"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("inside a statement match arm (lowered as a nested function)", async () => {
    fresh();
    const r = await call(mod, "inMatch", { k: "Old" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/old");
    expect(rows(app.dbPath)).toEqual(["match"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("inside a value match arm; the other arm's value is returned", async () => {
    fresh();
    const nav = await call(mod, "valueArm", { k: "New" });
    expect(nav.status).toBe(302);
    expect(nav.location).toBe("/va-new");
    fresh();
    const val = await call(mod, "valueArm", { k: "Old" });
    expect(val.status).toBe(200);
    expect(val.text).toBe("3");
  }, EXECUTED_DB_TIMEOUT_MS);

  test("inside a !{} handler arm, and after the handled query", async () => {
    fresh();
    const ok = await call(mod, "inHandlerArm", { t: "x" });
    expect(ok.status).toBe(302);
    expect(ok.location).toBe("/ok");
    const dup = await call(mod, "inHandlerArm", { t: "x" });
    expect(dup.status).toBe(302);
    expect(dup.location).toBe("/dup");
    expect(rows(app.dbPath)).toEqual(["x"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("the implicit handler transaction COMMITS on a navigate exit (both writes kept)", async () => {
    fresh();
    const r = await call(mod, "twoWrites", { t: "w" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/two");
    expect(rows(app.dbPath)).toEqual(["w-1", "w-2"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("an explicit .Soft on the server is the server (hard) navigation", async () => {
    fresh();
    const r = await call(mod, "softOnServer", { t: "s" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/soft");
    expect(rows(app.dbPath)).toEqual(["s"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("leaving a transaction {} block by navigate rolls it back, as a return does (§19.10.3)", async () => {
    fresh();
    const r = await call(mod, "inTxn", { t: "t" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/txn");
    expect(rows(app.dbPath)).toEqual([]);
  }, EXECUTED_DB_TIMEOUT_MS);
});

describe("S473 — path safety: no open redirect, no header injection", () => {
  let app;
  let mod;
  beforeAll(async () => {
    app = compileApp(PLACEMENTS, "safety");
    mod = await patchAndImport(app.serverJsPath, app.dbPath);
  });

  const refused = [
    "https://evil.example",
    "//evil.example/x",
    "/\\evil.example/x",
    "javascript:alert(1)",
    "posts",
    "?x=1",
    "/a\r\nSet-Cookie: pwn=1",
    "/a\nb",
    "/\t/evil.example",
  ];
  for (const target of refused) {
    test(`a data-supplied ${JSON.stringify(target)} is refused (no redirect is produced)`, async () => {
      const r = await call(mod, "toData", { t: target });
      expect(r.threw).toBeDefined();
      expect(String(r.threw.message)).toContain("navigate() refused the target");
      expect(r.location).toBeUndefined();
    }, EXECUTED_DB_TIMEOUT_MS);
  }

  test("a data-supplied same-site path is admitted; non-ASCII is percent-encoded", async () => {
    const plain = await call(mod, "toData", { t: "/posts/42?tab=all#c" });
    expect(plain.status).toBe(302);
    expect(plain.location).toBe("/posts/42?tab=all#c");
    const utf = await call(mod, "toData", { t: "/café ok" });
    expect(utf.status).toBe(302);
    expect(utf.location).toBe("/caf%C3%A9%20ok");
  }, EXECUTED_DB_TIMEOUT_MS);

  test("an absolute URL whose origin is literal at the call site is admitted (OAuth shape)", async () => {
    const r = await call(mod, "oauth", { s: "abc" });
    expect(r.status).toBe(302);
    expect(r.location).toBe("https://idp.example.com/authorize?state=abc");
    expect(app.serverJs).toContain('"https://idp.example.com")');
  }, EXECUTED_DB_TIMEOUT_MS);

  test("a literal prefix that does not close the authority fixes no origin: data cannot extend the host", async () => {
    const r = await call(mod, "oauthOpen", { s: ".evil.example/" });
    expect(r.threw).toBeDefined();
    expect(String(r.threw.message)).toContain("navigate() refused the target");
  }, EXECUTED_DB_TIMEOUT_MS);
});

describe("S473 — the literal-origin reader (compile time; the runtime re-checks)", () => {
  test("fixedOriginOfLiteral", () => {
    expect(fixedOriginOfLiteral("https://IdP.example.com/a", true)).toBe("https://idp.example.com");
    expect(fixedOriginOfLiteral("https://idp.example.com", true)).toBe("https://idp.example.com");
    expect(fixedOriginOfLiteral("https://idp.example.com/authorize?state=", false)).toBe("https://idp.example.com");
    expect(fixedOriginOfLiteral("https://idp.example.com", false)).toBeNull();
    expect(fixedOriginOfLiteral("/posts", true)).toBeNull();
    expect(fixedOriginOfLiteral("javascript:alert(1)", true)).toBeNull();
    expect(fixedOriginOfLiteral("ftp://x.example/", true)).toBeNull();
  });

  test("navigateFixedOriginOfText (the string-fallback lowering)", () => {
    expect(navigateFixedOriginOfText('"https://a.example/x"')).toBe("https://a.example");
    expect(navigateFixedOriginOfText("`https://a.example/x?s=${s}`")).toBe("https://a.example");
    expect(navigateFixedOriginOfText("`https://a.example${s}`")).toBeNull();
    expect(navigateFixedOriginOfText('"https://a.example/" + p')).toBe("https://a.example");
    expect(navigateFixedOriginOfText("target")).toBeNull();
  });

  test("the server string fallback strips the variant and lowers to _scrml_server_navigate", () => {
    expect(rewriteNavigateCalls('navigate("/x", .Hard)')).toBe('_scrml_server_navigate("/x", null)');
    expect(rewriteNavigateCalls('navigate(p, . Soft)')).toBe("_scrml_server_navigate(p, null)");
    expect(rewriteNavigateCalls('navigate("https://a.example/cb")')).toBe('_scrml_server_navigate("https://a.example/cb", "https://a.example")');
    // The client pipeline is unchanged.
    expect(rewriteNavigateCalls('navigate("/x")', true)).toBe('_scrml_navigate_soft("/x")');
  });
});

describe("S473 — an app with no server-side navigate() is byte-unchanged", () => {
  test("no catch, no helper, no request header", () => {
    const app = compileApp(`<program db="./app.db">
<db src="./app.db" tables="posts">
\${
    function save(t: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${t})\`}.run()
        return 1
    }
    function go() { navigate("/client-side") }
}
</>
<button onclick=save("a")>A</>
<button onclick=go()>B</>
</program>
`, "unchanged");
    expect(app.errors.map((e) => e.code)).toEqual([]);
    expect(app.serverJs).not.toContain("_scrml_nav_settle");
    expect(app.serverJs).not.toContain("_scrml_server_navigate");
    expect(app.serverJs).toContain("  })();\n");
    expect(app.clientJs).not.toContain("X-Scrml-Fetch");
    expect(app.clientJs).not.toContain("_scrml_follow_server_navigate");
    // The client-side navigate keeps the soft pipeline.
    expect(app.clientJs).toContain('_scrml_navigate_soft("/client-side")');
  });
});

/** The emitted server-navigate helper block of a bundle, evaluated on its own (review F4). */
function evalNavHelpers(serverJs) {
  const start = serverJs.indexOf("// --- §20.1 (S473): navigate() in a server function");
  const end = serverJs.indexOf("\n// --- ", start + 10);
  expect(start).toBeGreaterThan(-1);
  const src = serverJs.slice(start, end === -1 ? undefined : end);
  return new Function("_scrml_g", `${src}\nreturn { settle: _scrml_nav_settle, SYM: _SCRML_NAVIGATE };`)(globalThis);
}

describe("S473 review F4 — a navigation signal cannot be forged, and settle re-checks it", () => {
  let app;
  beforeAll(() => {
    app = compileApp(PLACEMENTS, "forge");
  });
  const req = { headers: { get: () => null } };

  test("the marker is a module-private symbol, not a global-registry key", () => {
    expect(app.serverJs).toContain('const _SCRML_NAVIGATE = _scrml_g.Symbol("scrml.navigate");');
    expect(app.serverJs).not.toContain('Symbol.for("scrml.navigate")');
  });

  test("an object carrying Symbol.for(\"scrml.navigate\") is rethrown unchanged, never answered", () => {
    const { settle } = evalNavHelpers(app.serverJs);
    const forged = { [Symbol.for("scrml.navigate")]: "javascript:alert(1)" };
    let thrown;
    try {
      settle(forged, req);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(forged);
  });

  test("even a signal carrying the module's own marker is re-checked before it is answered", () => {
    const { settle, SYM } = evalNavHelpers(app.serverJs);
    for (const bad of ["javascript:alert(1)", "https://evil.example/", "//evil.example", "/a\r\nX: 1"]) {
      let thrown;
      try {
        settle({ [SYM]: bad }, req);
      } catch (e) {
        thrown = e;
      }
      expect(String(thrown && thrown.message)).toContain("refused a navigation to");
    }
    // The module's literal origin and a same-site path are answered.
    expect(settle({ [SYM]: "https://idp.example.com/cb" }, req).headers.get("location")).toBe("https://idp.example.com/cb");
    expect(settle({ [SYM]: "/posts" }, req).status).toBe(302);
  });

  test("both bundles carry the file's literal-origin list", () => {
    expect(app.serverJs).toContain('const _SCRML_NAV_ORIGINS = _scrml_g.Object.freeze(["https://idp.example.com"]);');
    expect(app.clientJs).toContain('const _SCRML_NAV_ORIGINS = _scrml_g.Object.freeze(["https://idp.example.com"]);');
  });
});

describe("S473 review F7 — the server string lowering only rewrites real navigate() calls", () => {
  test("a member call, a longer name, and string / comment text are left alone", () => {
    expect(rewriteNavigateCalls('router.navigate("/x")')).toBe('router.navigate("/x")');
    expect(rewriteNavigateCalls('router . navigate("/x")')).toBe('router . navigate("/x")');
    expect(rewriteNavigateCalls('$navigate("/x")')).toBe('$navigate("/x")');
    expect(rewriteNavigateCalls('log("navigate(\\"/x\\")")')).toBe('log("navigate(\\"/x\\")")');
    expect(rewriteNavigateCalls("log('navigate(1)') /* navigate(2) */")).toBe("log('navigate(1)') /* navigate(2) */");
    expect(rewriteNavigateCalls("`text navigate(1) ${navigate(\"/a\")}`")).toBe('`text navigate(1) ${_scrml_server_navigate("/a", null)}`');
    // The client pipeline uses the same scanner.
    expect(rewriteNavigateCalls('router.navigate("/x")', true)).toBe('router.navigate("/x")');
    expect(rewriteNavigateCalls('"navigate(1)" + navigate("/b")', true)).toBe('"navigate(1)" + _scrml_navigate_soft("/b")');
  });

  test("an empty navigate() reaching the string lowering is E-NAV-NO-PATH, not a silent no-op", () => {
    const errors = [];
    rewriteNavigateCalls("navigate()", false, errors);
    rewriteNavigateCalls("navigate(.Hard)", false, errors);
    expect(errors.map((e) => e.code)).toEqual(["E-NAV-NO-PATH", "E-NAV-NO-PATH"]);
  });
});
