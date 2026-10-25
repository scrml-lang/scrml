/**
 * when-changes-latest-wins-s470.test.js — g-when-changes-stale-response-s470 (security race).
 *
 * SPEC §6.7.4 "Re-trigger while suspended — newest run wins (S446 (b))": "If an effect is triggered
 * while an earlier run of the SAME `<effect>` instance is suspended at a server call, the earlier
 * run's continuation is cancelled and never resumes; the new run starts at once (not queued, not
 * dropped), and the settled value or failure of the call the cancelled run was suspended at is
 * discarded (its error context does not run). … Cancellation is not a rollback". `when … changes`
 * is the §63-window spelling of `<effect>` "with identical semantics".
 *
 * The bug: `@pw` set right then wrong, the right password's round trip slower — the page ended on
 * "LOGGED IN" with `@pw` == "wrong". `<request>` ended "false" on the same race (its per-instance
 * `_scrml_seq !== _scrml_request_<id>_seq` check). The fix reuses that sequence check:
 * `_scrml_when_changes` numbers each run and hands it a gate; the emitter wraps every own-level
 * `await X` of an async body as `await _scrml_live(X)`; a stale run's gate never settles.
 *
 * Every race below is DETERMINISTIC: `fetch` is stubbed with promises the test resolves by hand, in
 * the order the case names. The only waiting is draining already-queued tasks (no latency sleeps).
 *
 *   §1  wrapOwnAwaits — the emitter's await rewriter
 *   §2  emission — async body gated, sync body unchanged
 *   §3  runtime — _scrml_when_changes driven directly
 *   §4  executed pages — compiled scrml, controlled server responses
 */

import { describe, test, expect, afterAll, beforeEach } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { SCRML_RUNTIME } from "../../src/runtime-template.js";
import { wrapOwnAwaits } from "../../src/codegen/js-async-analysis.ts";
import { emitLogicNode } from "../../src/codegen/emit-logic.js";

const NativeResponse = globalThis.Response;

afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
});

/** Drain queued microtasks and zero-delay tasks (no latency is simulated by waiting). */
async function drain() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// §1 wrapOwnAwaits
// ---------------------------------------------------------------------------

describe("§1 wrapOwnAwaits wraps every own-level await operand", () => {
  test("an await in an expression", () => {
    expect(wrapOwnAwaits('set("m", await f(x) ? "A" : "B")', "G")).toBe('set("m", await G(f(x)) ? "A" : "B")');
  });
  test("several statements, several awaits", () => {
    expect(wrapOwnAwaits("const a = await f(1); const b = await g(a); h(b);", "G"))
      .toBe("const a = await G(f(1)); const b = await G(g(a)); h(b);");
  });
  test("a nested await inside an await operand: both gated", () => {
    expect(wrapOwnAwaits("await f(await g())", "G")).toBe("await G(f(await G(g())))");
  });
  test("an await inside a nested function is its own scope: left alone", () => {
    const src = "const k = async () => { await f(); }; await g();";
    expect(wrapOwnAwaits(src, "G")).toBe("const k = async () => { await f(); }; await G(g());");
  });
  test("no await: text unchanged", () => {
    expect(wrapOwnAwaits('set("m", 1);', "G")).toBe('set("m", 1);');
  });
  test("a `for await` has no operand to gate: null (the emitter refuses)", () => {
    expect(wrapOwnAwaits("for await (const x of s) { h(x); }", "G")).toBeNull();
  });
  test("unparseable text: null", () => {
    expect(wrapOwnAwaits("await (", "G")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2 emission
// ---------------------------------------------------------------------------

describe("§2 emission", () => {
  test("an async body takes the run's gate and gates each await", () => {
    const out = emitLogicNode(
      { kind: "when-effect", dependencies: ["n"], bodyRaw: "@a = srv(@n)\nconst r = srv(1)\n@b = r" },
      { fnNameMap: new Map(), whenServerFnNames: new Set(["srv"]) },
    );
    expect(out).toContain("async function(_scrml_live) {");
    expect(out).toContain('_scrml_reactive_set("a", await _scrml_live(srv(_scrml_reactive_get("n"))))');
    expect(out).toContain("const r = await _scrml_live(srv(1))");
    expect(out).not.toMatch(/await (?!_scrml_live\()/);
  });
  test("a synchronous body is unchanged: no parameter, no gate", () => {
    const out = emitLogicNode({ kind: "when-effect", dependencies: ["q"], bodyRaw: "@page = 1" }, { fnNameMap: new Map() });
    expect(out).toBe('_scrml_when_changes(function(_h) { return [_scrml_reactive_subscribe("q", _h)]; }, function() { _scrml_reactive_set("page", 1); });');
  });
});

// ---------------------------------------------------------------------------
// §3 runtime
// ---------------------------------------------------------------------------

function deferred() {
  let res, rej;
  const p = new Promise((a, b) => { res = a; rej = b; });
  return { p, res, rej };
}

/** A fresh runtime instance; returns its accessors. */
function loadRuntime() {
  const box = {};
  new Function("box", `${SCRML_RUNTIME}
box.when = _scrml_when_changes; box.set = _scrml_reactive_set; box.get = _scrml_reactive_get;
box.sub = _scrml_reactive_subscribe;`)(box);
  return box;
}

describe("§3 _scrml_when_changes — newest run wins", () => {
  let rt, errors, origError;
  beforeEach(() => {
    rt = loadRuntime();
    errors = [];
    origError = console.error;
  });
  const capture = () => { console.error = (...a) => { errors.push(a.map(String).join(" ")); }; };
  const restore = () => { console.error = origError; };

  test("a superseded run never resumes; the newest run's result lands (resolution out of order)", async () => {
    rt.set("pw", "");
    const calls = [];
    const seen = [];
    rt.when((h) => [rt.sub("pw", h)], async function (live) {
      const pw = rt.get("pw");
      seen.push("start " + pw);
      const d = deferred(); calls.push(d);
      const ok = await live(d.p);
      seen.push("end " + pw + " " + ok);
    });
    rt.set("pw", "secret");
    rt.set("pw", "wrong");
    expect(seen).toEqual(["start secret", "start wrong"]); // new run starts at once, not queued
    calls[1].res(false); await drain();
    calls[0].res(true); await drain();
    expect(seen).toEqual(["start secret", "start wrong", "end wrong false"]);
  });

  test("…and with the slow one resolving FIRST", async () => {
    rt.set("pw", "");
    const calls = [];
    const seen = [];
    rt.when((h) => [rt.sub("pw", h)], async function (live) {
      const pw = rt.get("pw");
      const d = deferred(); calls.push(d);
      seen.push(pw + " " + (await live(d.p)));
    });
    rt.set("pw", "secret");
    rt.set("pw", "wrong");
    calls[0].res(true); await drain();
    calls[1].res(false); await drain();
    expect(seen).toEqual(["wrong false"]);
  });

  test("a stale run's failure is discarded (no error context, nothing reported); a current one is reported", async () => {
    capture();
    try {
      rt.set("k", 0);
      const calls = [];
      const handled = [];
      rt.when((h) => [rt.sub("k", h)], async function (live) {
        const d = deferred(); calls.push(d);
        try { await live(d.p); } catch (e) { handled.push(String(e)); throw e; }
      });
      rt.set("k", 1);
      rt.set("k", 2);
      calls[0].rej(new Error("stale boom")); await drain();
      expect(handled).toEqual([]);
      expect(errors).toEqual([]);
      calls[1].rej(new Error("live boom")); await drain();
      expect(handled).toEqual(["Error: live boom"]);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("live boom");
    } finally { restore(); }
  });

  test("several awaits: cancelled at whichever await it is suspended on; earlier work stands (not a rollback)", async () => {
    rt.set("pw", "");
    const calls = [];
    const seen = [];
    rt.when((h) => [rt.sub("pw", h)], async function (live) {
      const pw = rt.get("pw");
      seen.push("a " + pw);
      const d1 = deferred(); calls.push(d1);
      await live(d1.p);
      seen.push("b " + pw);
      const d2 = deferred(); calls.push(d2);
      await live(d2.p);
      seen.push("c " + pw);
    });
    rt.set("pw", "secret");
    calls[0].res(1); await drain();             // run 1 passes its first await
    expect(seen).toEqual(["a secret", "b secret"]);
    rt.set("pw", "wrong");                      // re-trigger while run 1 sits on its SECOND await
    calls[1].res(2); await drain();             // run 1's second call settles: discarded
    expect(seen).toEqual(["a secret", "b secret", "a wrong"]);
    calls[2].res(3); await drain();
    calls[3].res(4); await drain();
    expect(seen).toEqual(["a secret", "b secret", "a wrong", "b wrong", "c wrong"]);
  });

  test("a disposed effect's suspended run does not resume (the <request> unmount precedent)", async () => {
    rt.set("k", 0);
    const d = deferred();
    const seen = [];
    const dispose = rt.when((h) => [rt.sub("k", h)], async function (live) { seen.push(await live(d.p)); });
    rt.set("k", 1);
    dispose();
    d.res("late"); await drain();
    expect(seen).toEqual([]);
  });

  test("a run that is never superseded resumes normally, with a non-promise operand too", async () => {
    rt.set("k", 0);
    const seen = [];
    rt.when((h) => [rt.sub("k", h)], async function (live) { seen.push(await live(7)); seen.push(await live(Promise.resolve(8))); });
    rt.set("k", 1); await drain();
    expect(seen).toEqual([7, 8]);
  });

  test("a synchronous body still runs synchronously, once per write", () => {
    rt.set("k", 0);
    const seen = [];
    rt.when((h) => [rt.sub("k", h)], function () { seen.push(rt.get("k")); });
    rt.set("k", 1);
    expect(seen).toEqual([1]);
    rt.set("k", 2);
    expect(seen).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// §4 executed pages
// ---------------------------------------------------------------------------

function compileSource(source) {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(tmpdir(), `scrml-s470lw-${uniq}`);
  const input = resolve(dir, "app.scrml");
  const outDir = resolve(dir, "out");
  mkdirSync(dir, { recursive: true });
  writeFileSync(input, source);
  try {
    const result = compileScrml({ inputFiles: [input], write: true, outputDir: outDir, log: () => {} });
    const read = (name) => {
      const p = resolve(outDir, name);
      return existsSync(p) ? readFileSync(p, "utf8") : "";
    };
    const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    return { codes: errors.map((e) => e.code), clientJs: read("app.client.js"), html: read("app.html") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Boot a compiled page under happy-dom with `fetch` stubbed: every server call is parked as a
 * pending entry `{ body, resolve(value) }` until the test resolves it.
 */
async function boot(source) {
  const out = compileSource(source);
  if (out.codes.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")}`);
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register();
  const pending = [];
  globalThis.fetch = (input, init = {}) => new Promise((res) => {
    pending.push({
      body: String(init.body ?? ""),
      resolve: (v) => res(new NativeResponse(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } })),
    });
  });
  const m = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (m ? m[1] : out.html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  // eslint-disable-next-line no-eval
  (0, eval)(`(function() {\n${SCRML_RUNTIME}\n${out.clientJs}\n})();`);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  await drain();
  return {
    clientJs: out.clientJs,
    pending,
    click: (sel) => document.querySelector(sel).click(),
    text: (sel) => document.querySelector(sel).textContent,
    /** The pending call whose request body mentions `needle`. */
    call: (needle) => {
      const c = pending.find((p) => p.body.includes(needle) && !p.done);
      if (!c) throw new Error(`no pending call for ${needle}; have ${pending.map((p) => p.body).join(" | ")}`);
      c.done = true;
      return c;
    },
  };
}

const LOGIN = (whenBody, extraFns = "", extraCells = "", deps = "@pw") => `<pw> = ""
<msg> = "rejected"
${extraCells}\${
    server function isOk(p) { return p == "secret" }
    function allowed(q) { return isOk(q) }
    function login(p) { @pw = p }
${extraFns}}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<p id="out">\${@msg}</p>
\${ when ${deps} changes { ${whenBody} } }
`;

describe("§4 executed: right then wrong, the right round trip slower", () => {
  const shapes = [
    ["a direct server call", '@msg = isOk(@pw) ? "LOGGED IN" : "rejected"'],
    ["an async-coloured client helper", '@msg = allowed(@pw) ? "LOGGED IN" : "rejected"'],
    ["a statement-position call then a write", 'const ok = isOk(@pw);\n @msg = ok ? "LOGGED IN" : "rejected";'],
    ["an if over the call", 'if (isOk(@pw)) { @msg = "LOGGED IN" } else { @msg = "rejected" }'],
  ];
  for (const [what, body] of shapes) {
    test(`${what}: ends "rejected" whichever response lands last`, async () => {
      for (const order of [["wrong", "secret"], ["secret", "wrong"]]) {
        const page = await boot(LOGIN(body));
        expect(page.clientJs).toContain("async function(_scrml_live)");
        page.click("#right");
        page.click("#wrong");
        await drain();
        for (const who of order) { page.call(who).resolve(who === "secret"); await drain(); }
        expect(page.text("#out")).toBe("rejected");
      }
    });
  }

  test("control: the right password alone logs in", async () => {
    const page = await boot(LOGIN('@msg = isOk(@pw) ? "LOGGED IN" : "rejected"'));
    page.click("#right");
    await drain();
    page.call("secret").resolve(true);
    await drain();
    expect(page.text("#out")).toBe("LOGGED IN");
  });

  test("control: wrong then right logs in (the newest run is the right one)", async () => {
    const page = await boot(LOGIN('@msg = isOk(@pw) ? "LOGGED IN" : "rejected"'));
    page.click("#wrong");
    page.click("#right");
    await drain();
    page.call("secret").resolve(true); await drain();
    page.call("wrong").resolve(false); await drain();
    expect(page.text("#out")).toBe("LOGGED IN");
  });
});

describe("§4 executed: several awaits, writes before and after", () => {
  const body = `@log = "start " + @pw;
  const a = audit(@pw);
  @log = a;
  const ok = isOk(@pw);
  @msg = ok ? "LOGGED IN" : "rejected";`;
  const fns = '    server function audit(p) { return "audited " + p }\n';
  const cells = '<log> = ""\n';
  const src = LOGIN(body, fns, cells).replace('<p id="out">', '<p id="log">${@log}</p>\n<p id="out">');

  test("superseded on its SECOND await: its write between the awaits stands, its last write is dropped", async () => {
    const page = await boot(src);
    page.click("#right");
    await drain();
    expect(page.text("#log")).toBe("start secret");         // write before the first await
    page.call('"secret"').resolve("audited secret"); await drain();
    expect(page.text("#log")).toBe("audited secret");       // write between the awaits
    page.click("#wrong");                                    // run 1 now sits on isOk("secret")
    await drain();
    expect(page.text("#log")).toBe("start wrong");          // run 2 starts at once
    page.call('"secret"').resolve(true); await drain();      // run 1's isOk lands: discarded
    expect(page.text("#out")).toBe("rejected");
    page.call('"wrong"').resolve("audited wrong"); await drain();
    page.call('"wrong"').resolve(false); await drain();
    expect(page.text("#log")).toBe("audited wrong");
    expect(page.text("#out")).toBe("rejected");
  });

  test("superseded on its FIRST await: none of its later writes land", async () => {
    const page = await boot(src);
    page.click("#right");
    page.click("#wrong");
    await drain();
    page.call('"secret"').resolve("audited secret"); await drain();
    expect(page.text("#log")).toBe("start wrong");
    expect(page.pending.filter((p) => p.body.includes('"secret"')).length).toBe(1); // run 1 never reached isOk
    page.call('"wrong"').resolve("audited wrong"); await drain();
    page.call('"wrong"').resolve(false); await drain();
    expect(page.text("#log")).toBe("audited wrong");
    expect(page.text("#out")).toBe("rejected");
  });
});

describe("§4 executed: a when over several cells", () => {
  test("a write to EITHER dep supersedes the run in flight", async () => {
    const src = LOGIN('@msg = isOk(@pw + @suffix) ? "LOGGED IN" : "rejected"', "    function suf(s) { @suffix = s }\n", '<suffix> = ""\n', "(@pw, @suffix)")
      .replace('<p id="out">', '<button id="suf" onclick=suf("x")>s</button>\n<p id="out">');
    const page = await boot(src);
    page.click("#right");            // isOk("secret")
    page.click("#suf");              // isOk("secretx") — a different dep re-triggers
    await drain();
    page.call('"secretx"').resolve(false); await drain();
    page.call('"secret"').resolve(true); await drain();
    expect(page.text("#out")).toBe("rejected");
  });
});
