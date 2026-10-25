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
  "when body tests fetch (not awaited by that host)": `\${ when @pw changes { if (fetch("/a")) { @msg = "LOGGED IN" } } }\n<p>\${@msg}</p>`,
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
  test("a helper that reaches fetch is named as such (impl#1 does not emit it async)", () => {
    const r = compile(page(`<p>\${probe(@pw)}</p>`, `    function probe(q) { fetch("/a?p=" + q)\n        return 1 }`));
    expect(r.messages.join("\n")).toContain("`probe`, which calls the host `fetch` (a Promise-returning function: §13.7 item 2)");
  });
});
