/**
 * S470 s470-host-fetch-followups — the host `fetch` (SPEC §13.7 item 4 / §13.8 item 3; §13.2: a
 * Promise-returning standard-library function is awaited) in the positions the re-review of
 * fcaa8b84b found un-awaited:
 *   R1 — tool mode (`<program kind="tool">`) never awaited `fetch`;
 *   R2 — library mode awaited a bare `fetch` but not `globalThis.fetch(…)`;
 *   R3 — `const w = window; w.fetch(u)` — a binding of the host global object is that object;
 *   R5 — `window.frames[0].fetch(…)` — a numerically indexed host window.
 */
import { describe, test, expect } from "bun:test";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

function compile(src, opts = {}) {
  const dir = resolve(tmpdir(), `scrml-s470-hff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "app.scrml");
  writeFileSync(file, src);
  try {
    const out = resolve(dir, "out");
    const result = compileScrml({ inputFiles: [file], write: true, outputDir: out, log: () => {}, ...opts });
    const errs = (result.errors ?? []).filter((e) => e.severity !== "warning" && !/^[WI]-/.test(e.code ?? ""));
    let js = "";
    try { for (const f of readdirSync(out)) if (f.endsWith(".js")) js += readFileSync(join(out, f), "utf8"); } catch { js = ""; }
    return { codes: errs.map((e) => e.code), js };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const lib = (body) => `\${\n    export function login(p) {\n        ${body}\n    }\n}\n`;
const tool = (body, fns = "") => `<program kind="tool">\n\${\n${fns}\n    function login(p) {\n        ${body}\n    }\n    function main(args) {\n        log(login(args[0]))\n    }\n}\n</program>\n`;
const page = (loginBody, view = `<p>\${@msg}</p>`, fns = "") => `<pw> = ""\n<msg> = "rejected"\n\${\n    function login(p) { ${loginBody} }\n${fns}\n}\n<button onclick=login("x")>go</button>\n${view}\n`;

describe("R2 — library mode awaits the host fetch through the global object", () => {
  test("globalThis.fetch(…) in an exported library function is awaited", () => {
    const r = compile(lib(`const r = globalThis.fetch("/c?p=" + p)\n        return r.status`), { mode: "library" });
    expect(r.codes).toEqual([]);
    expect(r.js).toContain('await globalThis.fetch("/c?p=" + p)');
    expect(r.js).toMatch(/export async function login\(/);
  });
  test("a parameter named fetch is not awaited", () => {
    const r = compile(`\${\n    export function chk(q, fetch) { return fetch(q) }\n}\n`, { mode: "library" });
    expect(r.codes).toEqual([]);
    expect(r.js).not.toContain("await fetch(q)");
  });
});

describe("R1 — tool mode awaits the host fetch", () => {
  for (const [name, body, fns] of [
    ["bare fetch", `const r = fetch("data:,x")\n        return r.status`, ""],
    ["globalThis.fetch", `const r = globalThis.fetch("data:,x")\n        return r.status`, ""],
    ["a helper over fetch", `const r = probe("data:,x")\n        return r.status`, `    function probe(u) { return fetch(u) }`],
  ]) {
    test(name, () => {
      const r = compile(tool(body, fns));
      expect(r.codes).toEqual([]);
      expect(r.js).toMatch(/await (globalThis\.)?(fetch|_scrml_probe_\d+|probe)\(/);
    });
  }
});

describe("R3 — a binding of the host global object is that object", () => {
  test("handler: const w = window; w.fetch(u) is awaited", () => {
    const r = compile(page(`const w = window\n        const r = w.fetch("/a")\n        @msg = "S" + r.status`));
    expect(r.codes).toEqual([]);
    expect(r.js).toContain('await w.fetch("/a")');
  });
  test("handler: an alias chain and a later assignment", () => {
    const r = compile(page(`const a = globalThis\n        const b = a\n        let c = not\n        c = b\n        const r = c.fetch("/a")\n        @msg = "S" + r.status`));
    expect(r.codes).toEqual([]);
    expect(r.js).toContain('await c.fetch("/a")');
  });
  test("render: a module alias of window, then w.fetch in an if=, is refused", () => {
    const r = compile(page(`@pw = p`, `<p><span if=\${w.fetch("/a")}>IN</span></p>`, `    const w = window`));
    expect(r.codes).toContain("E-VALUE-SERVER-CALL");
  });
  test("render: an alias of document.defaultView is refused", () => {
    const r = compile(page(`@pw = p`, `<p><span if=\${v.fetch("/a")}>IN</span></p>`, `    const v = document.defaultView`));
    expect(r.codes).toContain("E-VALUE-SERVER-CALL");
  });
  test("an author object's fetch member is not the host", () => {
    const r = compile(page(`@pw = p`, `<p><span if=\${api.go(@pw)}>IN</span></p>`, `    const api = { go: 1 }`));
    expect(r.codes).not.toContain("E-VALUE-SERVER-CALL");
  });
});

describe("R5 — a numerically indexed host window", () => {
  test("handler: window.frames[0].fetch(u) is awaited", () => {
    const r = compile(page(`const r = window.frames[0].fetch("/a")\n        @msg = "S" + r.status`));
    expect(r.codes).toEqual([]);
    expect(r.js).toContain('await window.frames[0].fetch("/a")');
  });
  test("render: window[0].fetch(u) is refused", () => {
    const r = compile(page(`@pw = p`, `<p><span if=\${window[0].fetch("/a")}>IN</span></p>`));
    expect(r.codes).toContain("E-VALUE-SERVER-CALL");
  });
});
