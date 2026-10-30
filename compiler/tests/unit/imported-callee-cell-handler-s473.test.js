/**
 * imported-callee-cell-handler-s473.test.js — `@cell = f() !{ … }` with an IMPORTED `f`
 * (g-impl1-imported-callee-cell-write-handler-skipped-s473).
 *
 * SPEC §19.4.3: the `!{}` arms run when the handled call fails, and the cell takes the guarded
 * value — the call's success value, or the arm's value — AFTER the arms (S473, #1645: the cell
 * keeps its old value while the arms run). §19.9.10: "A call to a function imported from another
 * file is judged by the callee's placement, exactly as a same-file call."
 *
 * Before: an imported ASYNC callee (an exported server function) lowered to
 *     let R = await _scrml_reactive_set("x", await f(id));  if (R && R.__scrml_error) { … }
 * `_scrml_reactive_set` returns undefined, so the arms never ran and the error ENVELOPE sat in the
 * cell as data. The s441 rewrite that defers the write owns only the file's own server stubs and
 * async-coloured client functions; the S473 sync twin (`deferSyncGuardedCellWrites`) did not read
 * the `await` the auto-await classifier puts before the set. Every test below runs the emitted
 * page (happy-dom), with the server functions answered by their REAL compiled route handlers.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, readdirSync } from "fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { parse as acornParse } from "acorn";

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

/** Compile a project (`files`: name -> source; the entry is `app.scrml`). The out dir is kept until afterAll. */
function compileProject(files) {
  const dir = resolve(tmpdir(), `scrml-s473-imp-cell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
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
    export function syncF(id: string)! -> E {
        if (id == "bad") fail E::Bad
        return 5
    }
    export server function srvF(id: string)! -> E {
        if (id == "bad") fail E::Bad
        return 5
    }
    export server function plainS(id: string) {
        return id
    }
}
`;

const CALLEES = ["syncF", "srvF", "syncL", "srvL"];

/**
 * #1661 review INFO-3 / MED-1 — guarded VALUES that are not a bare call. The s441 rewrite owns only a
 * value that IS `[await] stub(args)`; every other async value (a ternary, `||`, `??`, a sync failable
 * callee over an async argument), imported or local, is deferred by `deferSyncGuardedCellWrites`.
 * `pow*`: the added `await` must wrap the WHOLE value — a bare `await 2 ** 2 > 3 ? …` is a V8
 * SyntaxError (JSC accepts it, so a bun-only run would miss it; the emitted JS is parsed with acorn).
 * Each: "bad" fails (arm runs, sees the old 7), "ok" succeeds with `ok`.
 */
const VALUE_SHAPES = [
  ["ternImp", `id != "zz" ? srvF(id) : 9`, "5"],
  ["ternLoc", `id != "zz" ? srvL(id) : 9`, "5"],
  ["orImp", `srvF(id) || 3`, "5"],
  ["nullishImp", `srvF(id) ?? 4`, "5"],
  ["orLoc", `srvL(id) || 3`, "5"],
  ["powImp", `2 ** 2 > 3 ? srvF(id) : 0`, "5"],
  ["powLoc", `2 ** 2 > 3 ? srvL(id) : 0`, "5"],
  ["syncOverAsync", `syncF(plainS(id))`, "5"],
];

/**
 * Per callee `c`: `a_c(id)` — a statement arm that records the cell as the arm sees it, then writes
 * and leaves; `b_c(id)` — a value arm that keeps the cell (`{ lift @x }`, flogence's app.scrml shape).
 */
// The local twins declare their own enum: importing `E` into a page that has its own server
// function makes app.server.js import `E` from lib.server.js, which does not export it (a link
// error at server load — g-impl1-server-imports-unexported-enum-s473, filed by this lane).
const APP = `<x> = 7
<seen> = "none"
\${
    import { syncF, srvF, plainS } from "./lib.scrml"
    type L:enum = { Bad }
    function syncL(id: string)! -> L {
        if (id == "bad") fail L::Bad
        return 5
    }
    server function srvL(id: string)! -> L {
        if (id == "bad") fail L::Bad
        return 5
    }
${CALLEES.map((c) => `    function a_${c}(id: string) { @x = ${c}(id) !{ _ :> { @seen = @x; @x = -1; return } } }
    function b_${c}(id: string) { @x = ${c}(id) !{ _ :> { lift @x } } }`).join("\n")}
${VALUE_SHAPES.map(([k, v]) => `    function v_${k}(id: string) { @x = ${v} !{ _ :> { @seen = @x; @x = -1; return } } }`).join("\n")}
}
${CALLEES.map((c) => `<button id="a-${c}-bad" onclick=a_${c}("bad")>a</button>
<button id="a-${c}-ok" onclick=a_${c}("ok")>a</button>
<button id="b-${c}-bad" onclick=b_${c}("bad")>b</button>
<button id="b-${c}-ok" onclick=b_${c}("ok")>b</button>`).join("\n")}
${VALUE_SHAPES.map(([k]) => `<button id="v-${k}-bad" onclick=v_${k}("bad")>v</button>
<button id="v-${k}-ok" onclick=v_${k}("ok")>v</button>`).join("\n")}
<p id="x">\${@x}</p>
<p id="seen">\${@seen}</p>
`;

let BUILT = null;
const built = () => (BUILT ??= compileProject({ "lib.scrml": LIB, "app.scrml": APP }));

/** A fetch that answers each `/_scrml/…` request with the project's REAL compiled route handler. */
async function realServerFetch(out) {
  const routes = [];
  for (const f of out.serverFiles) {
    const mod = await import(join(out.outDir, f));
    for (const r of mod.routes ?? []) routes.push(r);
  }
  return async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const route = routes.find((r) => r.path === path);
    if (!route) return new Response("not found", { status: 404 });
    const hdr = { "content-type": "application/json", cookie: "scrml_csrf=t", "x-csrf-token": "t" };
    const body = init.body;
    return route.handler({
      url: "http://localhost" + route.path,
      method: init.method ?? "POST",
      headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
      json: async () => (body ? JSON.parse(body) : {}),
    });
  };
}

async function boot(out) {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register();
  if (out.codes.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")} — ${out.messages.join(" | ")}`);
  const f = await realServerFetch(out);
  globalThis.fetch = f;
  window.fetch = f;
  document.cookie = "scrml_csrf=t; Path=/";
  const bodyMatch = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : out.html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  // eslint-disable-next-line no-eval
  (0, eval)(out.runtime);
  // eslint-disable-next-line no-eval
  for (const js of out.libClientJs) if (js) (0, eval)(js);
  // eslint-disable-next-line no-eval
  (0, eval)(out.clientJs);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return {
    click: async (sel) => { document.querySelector(sel).click(); await settle(); },
    text: (sel) => document.querySelector(sel).textContent,
  };
}

describe("executed: `@x = f(id) !{ … }` — imported and local callees behave the same", () => {
  for (const c of CALLEES) {
    const where = /F$/.test(c) ? "imported" : "local";
    const kind = /^srv/.test(c) ? "server `!` function" : "`!` function";
    test(`${where} ${kind} (${c}): failure runs the arm; the arm sees the OLD cell value; it leaves`, async () => {
      const page = await boot(built());
      expect(page.text("#x")).toBe("7");
      await page.click(`#a-${c}-bad`);
      expect(page.text("#seen")).toBe("7");
      expect(page.text("#x")).toBe("-1");
    });
    test(`${where} ${kind} (${c}): success writes the value, the arm does not run`, async () => {
      const page = await boot(built());
      await page.click(`#a-${c}-ok`);
      expect(page.text("#x")).toBe("5");
      expect(page.text("#seen")).toBe("none");
    });
    test(`${where} ${kind} (${c}): \`{ lift @x }\` keeps the cell on failure; success writes`, async () => {
      const page = await boot(built());
      await page.click(`#b-${c}-bad`);
      expect(page.text("#x")).toBe("7");
      await page.click(`#b-${c}-ok`);
      expect(page.text("#x")).toBe("5");
    });
  }
});

describe("executed: guarded values that are not a bare call (imported and local)", () => {
  for (const [k, v, okText] of VALUE_SHAPES) {
    test(`\`@x = ${v} !{…}\`: failure runs the arm with the old value; success writes`, async () => {
      const page = await boot(built());
      await page.click(`#v-${k}-bad`);
      expect(page.text("#seen")).toBe("7");
      expect(page.text("#x")).toBe("-1");
      await page.click(`#v-${k}-ok`);
      expect(page.text("#x")).toBe(okText);
    });
  }
  test("the emitted client JS parses under a spec parser (acorn), not only JSC", () => {
    const js = built().clientJs;
    expect(() => acornParse(js, { ecmaVersion: "latest", sourceType: "script" })).not.toThrow();
    expect(js).not.toMatch(/await\s+2\s*\*\*/);
    expect(js).toMatch(/await \(2 \*\* 2 > 3 \?/);
  });
});

describe("emitted: the imported server call is not written into the cell before the guard", () => {
  test("no `_reactive_set(\"x\", await srvF(…))`; the guarded binding is the call itself", () => {
    const js = built().clientJs;
    expect(js).not.toMatch(/_reactive_set\(\s*"x"\s*,\s*await\s+srvF\(/);
    expect(js).not.toMatch(/await\s+_scrml(?:_cs)?_reactive_set\(/);
    expect(js).toMatch(/let (\w+) = await srvF\(id\);\s*\n\s*if \(\1 && \1\.__scrml_error\)/);
  });
});

/** Every guarded position: the imported callee's lowering equals the local twin's, up to the callee's name. */
describe("emitted: every guarded position lowers the imported callee exactly as the local one", () => {
  const POSITIONS = {
    "cell write, statement arm": (f) => [`@x = ${f}(id) !{ _ :> { @x = 0; return } }`, ""],
    "cell write, value arm": (f) => [`@x = ${f}(id) !{ _ :> 0 }`, ""],
    "let binding": (f) => [`let r = ${f}(id) !{ _ :> 0 }\n        @x = r`, ""],
    "const binding": (f) => [`const r = ${f}(id) !{ _ :> 0 }\n        @x = r`, ""],
    "reassignment": (f) => [`let r = 1\n        r = ${f}(id) !{ _ :> 0 }\n        @x = r`, ""],
    "statement": (f) => [`${f}(id) !{ _ :> { @x = 0 } }`, ""],
    "return": (f) => [`@x = h(id)`, `function h(id: string) { return ${f}(id) !{ _ :> 3 } }`],
    "`?` propagation": (f) => [`@x = q(id) !{ _ :> 0 }`, `function q(id: string)! -> E {\n        const v = ${f}(id)?\n        return v\n    }`],
  };
  const page = (body, top) => `<x> = 7
\${
    import { srvF, E } from "./lib.scrml"
    type L:enum = { Bad }
    server function srvL(id: string)! -> L {
        if (id == "bad") fail L::Bad
        return 5
    }
    ${top}
    function go(id: string) {
        ${body}
    }
}
<button onclick=go("bad")>go</button>
<p>\${@x}</p>
`;
  /** The bodies of the page's own functions (go / h / q), with the callee and every gensym normalised. */
  const fnBodies = (js) => {
    const out = [];
    let on = false;
    for (const l of js.split("\n")) {
      if (on && (/^(async )?function /.test(l) || /^_scrml_cs_/.test(l))) on = false;
      if (/^(async )?function _scrml_(go|h|q)_/.test(l)) on = true;
      if (on) out.push(l.trim());
    }
    return out.filter((l) => l.length > 0).join("\n")
      .replace(/_scrml_fetch_srvL_\d+/g, "CALLEE").replace(/\bsrvF\b/g, "CALLEE")
      .replace(/_\d+\b/g, "_N");
  };
  for (const [label, mk] of Object.entries(POSITIONS)) {
    test(label, () => {
      const imp = compileProject({ "lib.scrml": LIB, "app.scrml": page(...mk("srvF")) });
      const loc = compileProject({ "lib.scrml": LIB, "app.scrml": page(...mk("srvL")) });
      expect(imp.codes).toEqual([]);
      expect(loc.codes).toEqual([]);
      const a = fnBodies(imp.clientJs);
      expect(a.length).toBeGreaterThan(0);
      expect(a).toBe(fnBodies(loc.clientJs));
    });
  }
});
