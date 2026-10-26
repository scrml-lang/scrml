/**
 * S470 s470-render-residue-host-promises (SECURITY) — three escapes where a pending Promise reached a
 * gate unrefused.
 *
 * 1. g-markup-in-const-initializer-unwalked-s470 — markup held as a value (`const m = <span if=${…}>`)
 *    lost every UNQUOTED attribute `${…}`: the markup-value reader pre-split only text-position
 *    interpolations, so `if=${isOk(@pw)}` was read as the bare ident `$`. The render-position check
 *    judged `$` (the server call compiled), and the sync twin `if=${@pw == "s"}` emitted
 *    `_scrml_ifrow_apply(…, ($))` — the condition lost.
 * 2. g-host-promise-global-in-render-not-refused-s470 — `fetch(…)` in a render position.
 * 3. g-host-promise-global-in-action-body-s470 — `fetch(…)` in a synchronous action body.
 *
 * SPEC: §13.7 item 4 ("A call to a Promise-returning standard-library function (§13.2) — `fetch`, …")
 * and §13.8 item 3 name `fetch` a waiting value. A render position is E-VALUE-SERVER-CALL; an action body
 * impl#1 lowers synchronously is E-IMPL1-ACTION-NOT-AWAITED (#1554). A name the file binds itself, or a
 * local that shadows it, is not the host global.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const RENDER = "E-VALUE-SERVER-CALL";
const ACTION = "E-IMPL1-ACTION-NOT-AWAITED";

function compile(src) {
  const dir = resolve(tmpdir(), `scrml-s470-host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "app.scrml");
  writeFileSync(file, src);
  try {
    const result = compileScrml({ inputFiles: [file], write: true, outputDir: resolve(dir, "out"), log: () => {} });
    const all = [...(result.errors ?? []), ...(result.warnings ?? [])];
    const hits = all.filter((e) => e.code === RENDER || e.code === ACTION);
    let client = "";
    try { client = require("fs").readFileSync(resolve(dir, "out", "app.client.js"), "utf8"); } catch { client = ""; }
    return { codes: hits.map((e) => e.code), messages: hits.map((e) => e.message), client };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const page = (view, extra = "") => `<pw> = ""
<msg> = "rejected"
<xs> = [1]
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p }
${extra}
}
<button onclick=login("wrong")>go</button>
${view}
`;

describe("gap 1 — markup held as a value keeps its attribute `${…}`", () => {
  test("q04: a server call in `if=` of markup in a `const` initializer is refused", () => {
    const r = compile(page(`\${ const m = <span if=\${isOk(@pw)}>IN</span> }\n<p>\${ m }</p>`));
    expect(r.codes).toContain(RENDER);
    expect(r.messages.join("\n")).toContain("server function `isOk`");
  });
  test("q04 inline: the same in a ternary markup value", () => {
    const r = compile(page(`<p>\${ @pw != "" ? <span if=\${isOk(@pw)}>IN</span> : "" }</p>`));
    expect(r.codes).toContain(RENDER);
  });
  test("q05: the sync twin keeps its condition (no bare `$`)", () => {
    const r = compile(page(`\${ const m = <span if=\${@pw == "s"}>IN</span> }\n<p>\${ m }</p>`));
    expect(r.codes).toEqual([]);
    expect(r.client).not.toContain("($))");
    expect(r.client).toMatch(/_scrml_ifrow_apply\([^\n]*_scrml_cs_reactive_get\("pw"\)/);
  });
  test("an attribute `${…}` value of markup held as a value reads the cell", () => {
    const r = compile(page(`\${ const t = <span title=\${@pw}>T</span> }\n<p>\${ t }</p>`));
    expect(r.codes).toEqual([]);
    expect(r.client).not.toContain("String($ ??");
    expect(r.client).toContain(`setAttribute("title", _scrml_g.String(_scrml_cs_reactive_get("pw")`);
  });
  test("an attribute `${…}` with a `>` inside does not close the tag", () => {
    const r = compile(page(`\${ const m = <span if=\${@xs.length > 0}>IN</span> }\n<p>\${ m }</p>`));
    expect(r.codes).toEqual([]);
    expect(r.client).toMatch(/_scrml_ifrow_apply\([^\n]*\.length > 0/);
  });
  test("a quoted attribute's template text is untouched", () => {
    const r = compile(page(`\${ const m = <span title="a \${@pw}">IN</span> }\n<p>\${ m }</p>`));
    expect(r.codes).toEqual([]);
    expect(r.client).not.toContain("String($ ??");
  });
});

const REFUSED_RENDER = {
  "interpolation": `<p>\${fetch("/a?p=" + @pw)}</p>`,
  "if=": `<p><span if=\${fetch("/a?p=" + @pw)}>IN</span></p>`,
  "if=, unbraced call": `<p><span if=fetch(@pw)>IN</span></p>`,
  "class=": `<p class=\${fetch("/a") ? "a" : "b"}>x</p>`,
  "derived cell": `\${ const <ok> = fetch("/a?p=" + @pw) }\n<p>\${@ok}</p>`,
  "lambda in an interpolation": `<p>\${@xs.map((x) => fetch("/a") ? "IN" : "no")}</p>`,
  "markup held in a const initializer": `\${ const m = <span if=\${fetch("/a")}>IN</span> }\n<p>\${ m }</p>`,
  "globalThis.fetch": `<p><span if=\${globalThis.fetch("/a")}>IN</span></p>`,
  "window.fetch": `<p><span if=\${window.fetch("/a")}>IN</span></p>`,
  "a helper that reaches fetch (§13.7 item 2)": [`<p><span if=\${probe(@pw)}>IN</span></p>`, `    function probe(q) { return fetch("/a?p=" + q) }`],
};

const REFUSED_ACTION = {
  "timer body tests fetch": `<timer interval=1>\${ if (fetch("/a?p=" + @pw)) { @msg = "LOGGED IN" } }</timer>\n<p>\${@msg}</p>`,
  "module-init if tests fetch": `\${ let ok = false\nif (fetch("/a")) { ok = true } }\n<p><span if=\${ok}>IN</span></p>`,
  "request body writes fetch to a cell": `<request id="r" deps=[@pw]>\${ @msg = fetch("/a?p=" + @pw) }</>\n<p>\${@msg}</p>`,
  "poll body tests fetch": `<poll interval=1000>\${ if (fetch("/a")) { @msg = "LOGGED IN" } }</poll>\n<p>\${@msg}</p>`,
  "runtime ^{} tests fetch": `^{ if (fetch("/a")) { @msg = "LOGGED IN" } }\n<p>\${@msg}</p>`,
};

const ACCEPTED = {
  "fetch in an event handler (an awaited action position)": `<button onclick=\${() => { const r = fetch("/a"); @msg = "sent" }}>s</button>\n<p>\${@msg}</p>`,
  "fetch in a function a handler calls": [`<button onclick=send()>s</button>\n<p>\${@msg}</p>`, `    function send() { const r = fetch("/a"); @msg = "sent" }`],
  "fetch in on mount": `\${ on mount { const r = fetch("/a") } }\n<p>\${@msg}</p>`,
  "a bare fetch statement in a timer (value discarded)": `<timer interval=1>\${ fetch("/ping") }</timer>\n<p>\${@msg}</p>`,
  "the author's own sync function named fetch": [`<p><span if=\${fetch(@pw)}>IN</span></p>`, `    function fetch(u) { return u == "secret" }`],
  "a lambda parameter named fetch": `<p>\${ [(u) => u == "x"].map((fetch) => fetch("x") ? "a" : "b") }</p>`,
  "a timer-body local named fetch": `<timer interval=1>\${ const fetch = (u) => u == "secret"\nif (fetch(@pw)) { @msg = "LOGGED IN" } }</timer>\n<p>\${@msg}</p>`,
  "a member call api.fetch on an author object": `\${ const api = { fetch: (u) => u == "x" } }\n<p>\${ api.fetch("x") ? "a" : "b" }</p>`,
  "a string naming fetch": `<p>\${ "fetch" }</p>`,
  // fix round 1 (F5 / F6) — a `when` body is an async host: it awaits the host `fetch` like its server twin.
  "when body tests fetch (awaited by that host)": `\${ when @pw changes { if (fetch("/a")) { @msg = "LOGGED IN" } } }\n<p>\${@msg}</p>`,
  "a helper whose parameter is named fetch": [`<p>\${ probe((u) => u == "x") ? "a" : "b" }</p>`, `    function probe(fetch) { return fetch("x") }`],
};

describe("gaps 2 + 3 — the host `fetch` (§13.7 item 4) is a waiting value", () => {
  for (const [name, spec] of Object.entries(REFUSED_RENDER)) {
    const [view, extra] = Array.isArray(spec) ? spec : [spec, ""];
    test(`render, refused E-VALUE-SERVER-CALL: ${name}`, () => {
      const r = compile(page(view, extra));
      expect(r.codes).toContain(RENDER);
      expect(r.messages.join("\n")).toMatch(/fetch|probe/);
    });
  }
  for (const [name, view] of Object.entries(REFUSED_ACTION)) {
    test(`action, refused E-IMPL1-ACTION-NOT-AWAITED: ${name}`, () => {
      const r = compile(page(view));
      expect(r.codes).toContain(ACTION);
      expect(r.messages.join("\n")).toContain("fetch");
    });
  }
  for (const [name, spec] of Object.entries(ACCEPTED)) {
    const [view, extra] = Array.isArray(spec) ? spec : [spec, ""];
    test(`accepted: ${name}`, () => {
      const r = compile(page(view, extra));
      expect(r.messages).toEqual([]);
    });
  }
  test("the message names the host global and §13.7", () => {
    const r = compile(page(`<p><span if=\${fetch("/a")}>IN</span></p>`));
    expect(r.messages.join("\n")).toContain("the host `fetch`, which returns a Promise (§13.7 item 4)");
  });
  test("a helper that reaches fetch is coloured async (fix round 1 F5) and refused in a render position", () => {
    const r = compile(page(`<p>\${probe(@pw)}</p>`, `    function probe(q) { fetch("/a?p=" + q)\n        return 1 }`));
    expect(r.messages.join("\n")).toContain("`probe`, which the compiler emits async");
  });
  test("F5 — fetch in a function body is awaited, and the function is emitted async", () => {
    const r = compile(page(`<button onclick=go()>g</button>\n<p>\${@msg}</p>`,
      `    function go() { const r = fetch("/a")\n        @msg = r.status == 200 ? "ok" : "no" }\n    function viaMember() { const r = globalThis.fetch("/a")\n        @msg = r.ok ? "ok" : "no" }`));
    expect(r.messages).toEqual([]);
    expect(r.client).toMatch(/async function _scrml_go_\d+\(/);
    expect(r.client).toContain('await fetch("/a")');
    expect(r.client).toContain('await globalThis.fetch("/a")');
  });
  test("F5 — a parameter named fetch is not awaited (the function stays sync)", () => {
    const r = compile(page(`<button onclick=go()>g</button>\n<p>\${@msg}</p>`,
      `    function chk(q, fetch) { return fetch(q) }\n    function go() { @msg = chk("x", (u) => u == "x") ? "a" : "b" }`));
    expect(r.messages).toEqual([]);
    expect(r.client).not.toMatch(/await fetch\(q\)/);
  });
});

// fix round 1 (review of 618bb573b) — F1–F4.
const VALUE = "E-ASYNC-FN-ESCAPES-AS-VALUE";
describe("fix round 1 — fetch through the global object, as a value, under a binding; callback values", () => {
  const refusedAny = (view, extra = "") => {
    const dir = compile(page(view, extra));
    return dir;
  };
  const CASES = {
    "F1 helper calling globalThis.fetch, rendered": [`<p><span if=\${probe(@pw)}>IN</span></p>`, `    function probe(q) { return globalThis.fetch("/a?p=" + q) }`],
    "F1 helper calling window[\"fetch\"], rendered": [`<p><span if=\${probe(@pw)}>IN</span></p>`, `    function probe(q) { return window["fetch"]("/a?p=" + q) }`],
    "F2 tape element [fetch][0]": [`<p><span if=\${[fetch][0]("/a")}>IN</span></p>`, ""],
    "F2 fetch passed as an argument": [`<p><span if=\${call(fetch, "/a")}>IN</span></p>`, `    function call(f, x) { return f(x) }`],
    "F2 document.defaultView.fetch": [`<p><span if=\${document.defaultView.fetch("/a")}>IN</span></p>`, ""],
    "F3 block-scoped const fetch does not turn the rule off": [`\${ if (true) { const fetch = 1 } }\n<p><span if=\${fetch("/a")}>IN</span></p>`, ""],
    "F4 a server helper passed to .some in a render position": [`<p><span if=\${@xs.some(isOkW)}>IN</span></p>`, `    function isOkW(x) { return isOk(@pw) }`],
    "F4 fetch passed to .map in a render position": [`<p><span if=\${@xs.map(fetch)[0]}>IN</span></p>`, ""],
  };
  for (const [name, [view, extra]] of Object.entries(CASES)) {
    test(`refused: ${name}`, () => {
      const r = refusedAny(view, extra);
      expect(r.codes.length).toBeGreaterThan(0);
    });
  }
  test("F2 / F3 — a binding of the host fetch is E-ASYNC-FN-ESCAPES-AS-VALUE (the server twin's code)", () => {
    for (const decl of ["    const f = fetch", "    const { fetch: g } = globalThis", "    const fetch = globalThis.fetch", "    const fetch = window.fetch.bind(window)", "    const probe = (q) => fetch(q)"]) {
      const dir = resolve(tmpdir(), `scrml-s470-hostv-${Math.random().toString(36).slice(2, 8)}`);
      mkdirSync(dir, { recursive: true });
      const file = resolve(dir, "app.scrml");
      writeFileSync(file, page(`<p>\${@msg}</p>`, decl));
      try {
        const result = compileScrml({ inputFiles: [file], write: false, outputDir: resolve(dir, "out"), log: () => {} });
        expect([decl, (result.errors ?? []).some((e) => e.code === VALUE)]).toEqual([decl, true]);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
  test("SPEC §13.2 exemptions: typeof fetch, and a scheduler argument", () => {
    expect(compile(page(`<p>\${ typeof fetch == "function" ? "a" : "b" }</p>`)).messages).toEqual([]);
    expect(compile(page(`<p>\${@msg}</p>\n\${ setTimeout(ping, 0) }`, `    function ping() { fetch("/ping") }`)).messages).toEqual([]);
  });
});

