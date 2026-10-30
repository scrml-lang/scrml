/**
 * transport-routing-s473.test.js — impl#1 transport routing (g-impl1-client-server-call-not-failable-s451,
 * narrowed).
 *
 * Ruling (user-voice-scrml.md S473 "impl#1 transport routing" item 3, verbatim): "only a `!{}` that
 * already covers the failure (a `_` or `.Transport` arm) gets a failed call to a NON-`!` server
 * function as a `Transport` error value. Declared-`!` callees, `?`, `match` and CPS-split callees are
 * out of scope (they stay with the bootstrap's U1b). Unhandled call sites are unchanged."
 *
 * SPEC §19.9.10: "For an `f` not declared `!`, the failure set is `Transport(t: ServerCallError)`
 * alone." `t` is `Unreachable` (no response), `Refused(status)` (a 4xx), `ServerFault(status)` (a
 * 5xx) or `Malformed(reason)`; "A request the client itself aborts … is not a failure".
 *
 * Before: a failed call to a plain server function REJECTED past the `!{}` (the stub throws
 * `HTTP <status>`), so the arm never ran. Every test below runs the emitted page in happy-dom;
 * success is answered by the REAL compiled route handlers, each failure mode by a fetch that fails
 * that way.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, readdirSync } from "fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { parse as acornParse } from "acorn";
import { compileScrml } from "../../src/api.js";

const DIRS = [];
// The pages are evaluated as classic scripts in the global scope (the runtime, the lib's client
// module, the page), so their `_scrml_*` declarations become globals. Remove the ones this file
// added: a later file in the same process must not see e.g. `_scrml_error_boundary_log` (the
// url-guard test reads its absence).
const GLOBALS_BEFORE = new Set(Object.getOwnPropertyNames(globalThis));
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  for (const d of DIRS) rmSync(d, { recursive: true, force: true });
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    if (/^_scrml/.test(k) && !GLOBALS_BEFORE.has(k)) { try { delete globalThis[k]; } catch { /* non-configurable */ } }
  }
});

function compileProject(files) {
  const dir = resolve(tmpdir(), `scrml-s473-transport-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  DIRS.push(dir);
  const outDir = resolve(dir, "out");
  mkdirSync(dir, { recursive: true });
  for (const [name, src] of Object.entries(files)) writeFileSync(resolve(dir, name), src);
  const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: outDir, log: () => {} });
  const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
  const read = (name) => {
    const p = resolve(outDir, name);
    return existsSync(p) ? readFileSync(p, "utf8") : "";
  };
  const outFiles = existsSync(outDir) ? readdirSync(outDir) : [];
  const runtimeName = outFiles.find((f) => /^scrml-runtime.*\.js$/.test(f));
  return {
    outDir,
    codes: errors.map((e) => e.code),
    messages: errors.map((e) => e.message),
    html: read("app.html"),
    clientJs: read("app.client.js"),
    libClientJs: Object.keys(files).filter((n) => n !== "app.scrml").map((n) => read(n.replace(/\.scrml$/, ".client.js"))),
    serverFiles: outFiles.filter((f) => f.endsWith(".server.js")),
    runtime: runtimeName ? read(runtimeName) : "",
  };
}

const LIB = `\${
    export type E:enum = { Bad }
    export server function plainS(id: string) {
        return 5
    }
    export server function srvF(id: string)! -> E {
        if (id == "bad") fail E::Bad
        return 5
    }
}
`;

/** The plain server callees: imported (`plainS`) and same-file (`plainL`). */
const PLAIN = ["plainS", "plainL"];

const FNS = {
  // covered by `_`
  u: (c) => `@x = ${c}(id) !{ _ :> { @seen = "any"; @x = -1; return } }`,
  // covered by `.Transport` — runs only when the value's variant IS "Transport" (#1658's static type)
  t: (c) => `@x = ${c}(id) !{ .Transport :> { @seen = "transport"; @x = -1; return } }`,
  // covered, value arm, let binding
  l: (c) => `let r = ${c}(id) !{ _ :> -2 }\n        @x = r`,
  // NOT covered: a named-only arm — stays as today
  n: (c) => `@x = ${c}(id) !{ .Bad :> { @seen = "bad"; @x = -1; return } }`,
  // unhandled — stays as today
  h: (c) => `@x = ${c}(id)`,
};

const APP = `<x> = 7
<seen> = "none"
\${
    import { plainS, srvF } from "./lib.scrml"
    server function plainL(id: string) {
        return 5
    }
${PLAIN.flatMap((c) => Object.entries(FNS).map(([k, f]) => `    function ${k}_${c}(id: string) {\n        ${f(c)}\n    }`)).join("\n")}
    function d_srvF(id: string) { @x = srvF(id) !{ _ :> { @seen = "any"; @x = -1; return } } }
}
${PLAIN.flatMap((c) => Object.keys(FNS).map((k) => `<button id="${k}-${c}" onclick=${k}_${c}("ok")>go</button>`)).join("\n")}
<button id="d-srvF" onclick=d_srvF("ok")>go</button>
<p id="x">\${@x}</p>
<p id="seen">\${@seen}</p>
`;

let BUILT = null;
const built = () => (BUILT ??= compileProject({ "lib.scrml": LIB, "app.scrml": APP }));

let MODE = "real";
const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function makeFetch(out) {
  const routes = [];
  for (const f of out.serverFiles) {
    const mod = await import(join(out.outDir, f));
    for (const r of mod.routes ?? []) routes.push(r);
  }
  return async (url, init = {}) => {
    switch (MODE) {
      case "unreachable": throw new TypeError("Failed to fetch");
      case "abort": { const e = new Error("The operation was aborted."); e.name = "AbortError"; throw e; }
      // #1664 fix round 1 — an abort with a custom reason rejects with the reason itself; a
      // timeout signal rejects with a TimeoutError. Neither is "no response": re-thrown.
      case "customAbort": throw new Error("superseded");
      case "timeout": { const e = new Error("The operation timed out."); e.name = "TimeoutError"; throw e; }
      // LOW-3 — status 0, a 3xx, a 2xx whose body read drops on the network.
      case "status0": return { ok: false, status: 0, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } };
      case "r304": return { ok: false, status: 304, json: async () => ({}) };
      case "bodyDrop": return { ok: true, status: 200, json: async () => { throw new TypeError("terminated"); } };
      // LOW-1 — a fetch shim whose json() returns a plain value (no Promise).
      case "syncJson": return { ok: true, status: 200, json: () => 5 };
      case "r404": return json({ error: "not found" }, 404);
      case "r500html": return new Response("<html>oops</html>", { status: 500, headers: { "Content-Type": "text/html" } });
      case "r500json": return json({ error: "boom" }, 500);
      case "malformed": return new Response("not json{", { status: 200, headers: { "Content-Type": "application/json" } });
      default: break;
    }
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const route = routes.find((r) => r.path === path);
    if (!route) return new Response("not found", { status: 404 });
    const hdr = { "content-type": "application/json", cookie: "scrml_csrf=t", "x-csrf-token": "t" };
    return route.handler({
      url: "http://localhost" + route.path,
      method: init.method ?? "POST",
      headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
      json: async () => (init.body ? JSON.parse(init.body) : {}),
    });
  };
}

async function boot(out) {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register();
  if (out.codes.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")} — ${out.messages.join(" | ")}`);
  const f = await makeFetch(out);
  globalThis.fetch = f;
  window.fetch = f;
  document.cookie = "scrml_csrf=t; Path=/";
  const logged = [];
  const origError = console.error;
  console.error = (...a) => { logged.push(a.map((x) => (x && x.message) || String(x)).join(" ")); };
  const bodyMatch = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : out.html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  // eslint-disable-next-line no-eval
  (0, eval)(out.runtime);
  // eslint-disable-next-line no-eval
  for (const js of out.libClientJs) if (js) (0, eval)(js);
  // eslint-disable-next-line no-eval
  (0, eval)(out.clientJs);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return {
    click: async (sel) => { document.querySelector(sel).click(); await settle(); },
    text: (sel) => document.querySelector(sel).textContent,
    logged,
    restore: () => { console.error = origError; },
  };
}

async function run(mode, sel) {
  MODE = mode;
  const page = await boot(built());
  try {
    await page.click(sel);
    return { x: page.text("#x"), seen: page.text("#seen"), logged: page.logged.join("\n") };
  } finally {
    page.restore();
    MODE = "real";
  }
}

const FAILURES = ["unreachable", "r404", "r500html", "r500json", "malformed"];

describe("a covered `!{}` on a plain server call: a failed call runs the arm (imported and local)", () => {
  for (const c of PLAIN) {
    for (const mode of FAILURES) {
      test(`${c}, \`_ :>\`, ${mode}: the arm runs, the cell kept 7 until it wrote`, async () => {
        const r = await run(mode, `#u-${c}`);
        expect(r.seen).toBe("any");
        expect(r.x).toBe("-1");
      });
      test(`${c}, \`.Transport :>\`, ${mode}: the variant is "Transport" at run time`, async () => {
        const r = await run(mode, `#t-${c}`);
        expect(r.seen).toBe("transport");
        expect(r.x).toBe("-1");
      });
      test(`${c}, value arm into a let, ${mode}: the arm's value`, async () => {
        const r = await run(mode, `#l-${c}`);
        expect(r.x).toBe("-2");
      });
    }
    test(`${c}: success writes the value; no arm runs`, async () => {
      for (const k of ["u", "t", "l", "n", "h"]) {
        const r = await run("real", `#${k}-${c}`);
        expect(r.x).toBe("5");
        expect(r.seen).toBe("none");
      }
    });
    test(`${c}: an aborted request is not a failure — no arm, the cell untouched`, async () => {
      for (const k of ["u", "t"]) {
        const r = await run("abort", `#${k}-${c}`);
        expect(r.seen).toBe("none");
        expect(r.x).toBe("7");
      }
    });
  }
});

describe("#1664 fix round 1 — only a TAGGED rejection is a Transport value; anything else re-throws", () => {
  for (const c of PLAIN) {
    for (const mode of ["customAbort", "timeout", "abort"]) {
      test(`${c}, \`_ :>\`, ${mode}: no arm, the cell untouched, the rejection reported`, async () => {
        const r = await run(mode, `#u-${c}`);
        expect(r.seen).toBe("none");
        expect(r.x).toBe("7");
        expect(r.logged).toMatch(/superseded|timed out|aborted/);
      });
    }
    // MED-1 — an error the stub raises ITSELF (its `JSON.stringify` of the arguments throws on a
    // BigInt or a cycle; scrml source cannot write either, so the throw is injected at that call)
    // is a client bug, not "no response": it re-throws past the `_` arm and is reported. (The real
    // BigInt / cycle arguments are run against the real stub in the runtime block below.)
    for (const [label, msg] of [["a BigInt argument", "Do not know how to serialize a BigInt"], ["a circular argument", "Converting circular structure to JSON"]]) {
      test(`${c}, \`_ :>\`, ${label}: the stub's own TypeError re-throws and is reported; no arm runs`, async () => {
        const page = await boot(built());
        const realStringify = JSON.stringify;
        try {
          JSON.stringify = () => { throw new TypeError(msg); };
          document.querySelector(`#u-${c}`).click();
          for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
        } finally {
          JSON.stringify = realStringify;
        }
        try {
          expect(page.text("#seen")).toBe("none");
          expect(page.text("#x")).toBe("7");
          expect(page.logged.join("\n")).toContain(msg);
        } finally {
          page.restore();
        }
      });
    }
    test(`${c}: a json() that returns a plain value (fetch shim) behaves as before, routed or not`, async () => {
      for (const k of ["u", "h"]) {
        const r = await run("syncJson", `#${k}-${c}`);
        expect(r.x).toBe("5");
        expect(r.seen).toBe("none");
      }
    });
  }
});

describe("out of the ruled scope — unchanged: the failure still rejects past the site", () => {
  for (const c of PLAIN) {
    test(`${c}: a named-only arm (\`.Bad :>\`) does not cover Transport — the rejection is reported, no arm`, async () => {
      const r = await run("r500json", `#n-${c}`);
      expect(r.seen).toBe("none");
      expect(r.x).toBe("7");
      expect(r.logged).toMatch(/HTTP 500/);
    });
    test(`${c}: an unhandled call — the rejection is reported, the cell untouched`, async () => {
      const r = await run("unreachable", `#h-${c}`);
      expect(r.x).toBe("7");
      expect(r.logged).toMatch(/Failed to fetch/);
    });
  }
  test("a declared-`!` callee (srvF) with `_ :>`: a transport failure still rejects, no arm", async () => {
    const r = await run("r500json", "#d-srvF");
    expect(r.seen).toBe("none");
    expect(r.x).toBe("7");
    expect(r.logged).toMatch(/HTTP 500/);
  });
});

describe("emitted", () => {
  test("only the covered plain-server sites are wrapped; the output parses (acorn)", () => {
    const js = built().clientJs;
    expect(() => acornParse(js, { ecmaVersion: "latest", sourceType: "script" })).not.toThrow();
    for (const k of ["u", "t", "l"]) {
      const body = js.slice(js.indexOf(`function _scrml_${k}_plainS_`), js.indexOf("\n}\n", js.indexOf(`function _scrml_${k}_plainS_`)));
      expect(body).toContain("await _scrml_server_attempt(plainS(id))");
      const bodyL = js.slice(js.indexOf(`function _scrml_${k}_plainL_`), js.indexOf("\n}\n", js.indexOf(`function _scrml_${k}_plainL_`)));
      expect(bodyL).toMatch(/await _scrml_server_attempt\(_scrml_fetch_plainL_\d+\(id\)\)/);
    }
    for (const k of ["n", "h"]) {
      const body = js.slice(js.indexOf(`function _scrml_${k}_plainS_`), js.indexOf("\n}\n", js.indexOf(`function _scrml_${k}_plainS_`)));
      expect(body).not.toContain("_scrml_server_attempt");
    }
    const d = js.slice(js.indexOf("function _scrml_d_srvF_"), js.indexOf("\n}\n", js.indexOf("function _scrml_d_srvF_")));
    expect(d).not.toContain("_scrml_server_attempt");
  });
  test("`?` on a plain server call is not routed", () => {
    const out = compileProject({
      "lib.scrml": LIB,
      "app.scrml": `<x> = 7\n\${\n    import { plainS, E } from "./lib.scrml"\n    function q(id: string)! -> E {\n        const v = plainS(id)?\n        return v\n    }\n    function go(id: string) { @x = q(id) !{ _ :> 0 } }\n}\n<button onclick=go("a")>go</button>\n<p>\${@x}</p>\n`,
    });
    expect(out.clientJs).not.toMatch(/_scrml_server_attempt\(plainS/);
  });
});

describe("the ServerCallError value (`t`), read off the runtime directly", () => {
  const cases = [
    ["unreachable", "Unreachable"],
    ["r404", { variant: "Refused", data: { status: 404 } }],
    ["r500html", { variant: "ServerFault", data: { status: 500 } }],
    ["r500json", { variant: "ServerFault", data: { status: 500 } }],
    ["malformed", { variant: "Malformed", data: { reason: "the response body is not JSON" } }],
    ["status0", "Unreachable"],
    ["r304", { variant: "Refused", data: { status: 304 } }],
    ["bodyDrop", "Unreachable"],
  ];
  for (const [mode, t] of cases) {
    test(mode, async () => {
      const page = await boot(built());
      MODE = mode;
      try {
        const v = await globalThis._scrml_server_attempt(globalThis._scrml_modules["lib.client.js"].plainS("ok"));
        expect(v).toEqual({ __scrml_error: true, type: "ServerCallError", variant: "Transport", data: { t } });
      } finally {
        MODE = "real";
        page.restore();
      }
    });
  }
  test("success passes through; an abort / custom-reason abort / timeout / the stub's own TypeError re-throw; a plain json() value is read", async () => {
    const page = await boot(built());
    try {
      expect(await globalThis._scrml_server_attempt(globalThis._scrml_modules["lib.client.js"].plainS("ok"))).toBe(5);
      for (const [mode, re] of [["abort", /aborted/], ["customAbort", /superseded/], ["timeout", /timed out/]]) {
        MODE = mode;
        await expect(globalThis._scrml_server_attempt(globalThis._scrml_modules["lib.client.js"].plainS("ok"))).rejects.toThrow(re);
      }
      MODE = "real";
      await expect(globalThis._scrml_server_attempt(globalThis._scrml_modules["lib.client.js"].plainS(10n))).rejects.toThrow(TypeError);
      const cyc = {}; cyc.self = cyc;
      await expect(globalThis._scrml_server_attempt(globalThis._scrml_modules["lib.client.js"].plainS(cyc))).rejects.toThrow(TypeError);
      MODE = "syncJson";
      expect(await globalThis._scrml_modules["lib.client.js"].plainS("ok")).toBe(5);
    } finally {
      MODE = "real";
      page.restore();
    }
  });
});
