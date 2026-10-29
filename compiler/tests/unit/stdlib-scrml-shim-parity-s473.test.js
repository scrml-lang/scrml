/**
 * stdlib-scrml-shim-parity-s473 — the stdlib's `.scrml` REFERENCE behaves exactly like the shipped
 * runtime shim (compiler/runtime/stdlib/<name>.js), `""` and `not` included.
 *
 * Why (review of #1648, MED-1): impl#1 ships the hand-written shim, so the shim is the canonical
 * behaviour; the bootstrap compiles the `.scrml` itself. s473-stdlib-bootstrap-clean annotated the
 * parameters of scrml:format / path / fs (§7.3.2 defaults) and ported scrml:random to
 * `import:host`; a default parameter fires only for an OMITTED argument, so a body that dropped a
 * shim `||` fallback would answer `""` / `not` differently. This file pins that it does not.
 *
 * HOW the `.scrml` runs here. format / path / fs do NOT compile on the bootstrap yet (host reach —
 * docs/changes/s473-stdlib-bootstrap-clean/after.md), and impl#1 does not compile them standalone
 * either (E-SCOPE-001 `Intl` / `require`). So each module's functions are lifted from the `.scrml`
 * SOURCE and run as JavaScript by a small, explicit translation (below): parameter types dropped,
 * defaults kept as JS defaults (`not` → `null` — what both compilers emit), `x is given` →
 * `x != null`, `x is not` → `x == null`, scrml `==` / `!=` → `===` / `!==` (S440: scalar equality),
 * `not` → `null`. Everything else in these bodies is already JavaScript. The translated functions
 * and the shim are then called side by side on normal, `""`, `not` (null) and omitted (undefined)
 * arguments, and must return the same value or throw the same error. When the bootstrap compiles a
 * module, its row here should move to a compiled-and-run comparison (slice-m4).
 *
 * scrml:random compiles on the bootstrap: its host file (stdlib/random/host.js — the `.scrml` is
 * nothing but typed wrappers of it, §21.3.1.1) is compared with the shim here under a stubbed
 * Math.random, and the compiled program is compared in slice-m4/stdlib-boot-clean-s473.test.js.
 *
 * NOT runnable from source (noted, checked structurally instead): fs `statSync` uses scrml:host
 * `safeCall` + a `!{}` arm — the source must map the throw to `not` as the shim maps it to `null`.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../..");
const req = createRequire(import.meta.url);

// ── the translation ────────────────────────────────────────────────────────────────────────────
function matchClose(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "/" && s[i + 1] === "/") { i = s.indexOf("\n", i); continue; }
    if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i) + 1; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) return i; }
  }
  throw new Error("unbalanced");
}
function splitTop(s) {
  const out = []; let depth = 0, cur = "", q = null;
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function jsParam(p) {
  const m = /^\s*(\.\.\.)?(\w+)\s*(?::[^=]*?)?\s*(?:=\s*([\s\S]+?))?\s*$/.exec(p);
  if (!m) throw new Error("param " + p);
  const def = m[3] === undefined ? "" : " = " + (m[3].trim() === "not" ? "null" : m[3].trim());
  return (m[1] ?? "") + m[2] + def;
}
function jsBody(b) {
  return b
    .replace(/([^=!<>])==(?!=)/g, "$1===")
    .replace(/!=(?!=)/g, "!==")
    .replace(/([\w.\]]+) is given\b/g, "($1 != null)")
    .replace(/([\w.\]]+) is not\b/g, "($1 == null)")
    .replace(/\bnot\b/g, "null");
}
/** Every `function NAME(…) { … }` (exported or not) in a `.scrml` file, as one JS module object. */
function fromScrml(rel, skip = []) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const fns = [];
  const names = [];
  for (const m of src.matchAll(/^\s*(?:export\s+)?function\s+(\w+)\s*\(/gm)) {
    const name = m[1];
    if (skip.includes(name)) continue;
    const pOpen = m.index + m[0].length - 1;
    const pClose = matchClose(src, pOpen);
    const params = splitTop(src.slice(pOpen + 1, pClose)).map(jsParam).join(", ");
    const bOpen = src.indexOf("{", pClose);
    const bClose = matchClose(src, bOpen);
    fns.push(`function ${name}(${params}) ${jsBody(src.slice(bOpen, bClose + 1))}`);
    names.push(name);
  }
  const code = fns.join("\n") + `\nreturn { ${names.join(", ")} };`;
  return { mod: new Function("require", code)(req), code };
}

// ── side by side ───────────────────────────────────────────────────────────────────────────────
function outcome(f, args) {
  try { const v = f(...args); return { v }; }
  catch (e) { return { threw: `${e?.constructor?.name}: ${e?.message}` }; }
}
function same(scrmlMod, shim, name, cases) {
  for (const args of cases) {
    const a = outcome(scrmlMod[name], args);
    const b = outcome(shim[name], args);
    expect({ fn: name, args, ...a }).toEqual({ fn: name, args, ...b });
  }
}

describe("scrml:format — the .scrml answers exactly as the shim, on normal, \"\", not and omitted arguments", () => {
  let S, shim;
  beforeAll(async () => {
    S = fromScrml("stdlib/format/index.scrml").mod;
    shim = await import("../../runtime/stdlib/format.js");
  });
  const CASES = {
    formatCurrency: [[1234.56], [1234.56, "EUR", "de-DE"], [1, "USD", ""], [1, ""], [1, null, null], [1, undefined, "de-DE"], [1, "", ""]],
    formatNumber: [[1234567.89], [1234567.89, 0], [0.4567, 2], [1, null, ""], [1, 2, null], [1, undefined, undefined]],
    pluralize: [[1, "item"], [3, "item"], [3, "child", "children"], [2, "x", ""], [2, "x", null]],
    truncate: [["Hello world this is long", 10], ["Hello world", 20], ["Hello world this is long", 10, " →"], ["", 5], [null, 5], ["abcdef", 4, ""], ["abcdef", 4, null]],
    slug: [["Hello World! This is a Test"], ["Héllo Wörld"], [""], [null]],
    capitalize: [["hello world"], [""], [null]],
    titleCase: [["hello world"], [""], [null]],
    toWords: [["helloWorld"], ["HTMLParser"], [""], [null]],
    padLeft: [["42", 5, "0"], [42, 5, "0"], ["x", 5, ""], ["x", 5, null], ["x", 5], [null, 6]],
    padRight: [["hi", 5, "-"], [7, 3, "0"], ["x", 5, ""], ["x", 5, null], ["x", 5]],
    formatBytes: [[0], [1024], [1536], [1536, 0], [1536, 2], [1536, null], [1073741824]],
    formatPercent: [[0.42], [0.4256, 1], [0.5, null], [0.5, 0]],
    compactNumber: [[1234], [1500000], [1234, ""], [1234, null], [1234, "de"]],
    formatList: [[["a", "b", "c"]], [["x", "y"], "disjunction"], [["a", "b"], ""], [["a", "b"], null, ""], [["a", "b"], "conjunction", "es"]],
    formatRange: [[1, 10], [100, 1000, "USD"], [1, 10, ""], [1, 10, null, ""], [1, 10, "EUR", "de-DE"]],
    formatNumberAdvanced: [[1234.5, { style: "decimal", minimumFractionDigits: 2 }], [1, null, ""], [123, { signDisplay: "always" }]],
  };
  test("the .scrml exports exactly the shim's functions", () => {
    expect(Object.keys(S).sort()).toEqual(Object.keys(shim).filter((k) => typeof shim[k] === "function").sort());
  });
  for (const [name, cases] of Object.entries(CASES)) {
    test(name, () => same(S, shim, name, cases));
  }
});

describe("scrml:path — the .scrml answers exactly as the shim, on normal, \"\", not and omitted arguments", () => {
  let S, shim;
  beforeAll(async () => {
    S = fromScrml("stdlib/path/index.scrml").mod;
    shim = await import("../../runtime/stdlib/path.js");
  });
  const CASES = {
    join: [["src", "components", "App.js"], ["a", "..", "b"], [], ["a", null, "b"], [null], ["", "x"]],
    resolve: [["/usr", "local", "bin"], ["/a", "/b", "c"], [null, "/x"], ["/a", ""]],
    dirname: [["/usr/local/bin/node"], ["src/index.js"], ["/"], [""], [null], []],
    basename: [["/usr/local/bin/node"], ["src/index.ts", ".ts"], ["archive.tar.gz", ".gz"], ["a.ts", null], ["a.ts", ""], [null], [""]],
    extname: [["index.js"], ["README"], [".gitignore"], [""], [null]],
    relative: [["/usr/local", "/usr/local/bin/node"], ["/a/b", "/a/b"], [null, null], ["", "/a"]],
    normalize: [["/usr/local/../bin"], ["a//b///c"], [""], [null]],
  };
  for (const [name, cases] of Object.entries(CASES)) {
    test(name, () => same(S, shim, name, cases));
  }
  test("cwd-relative resolve() with no segments", () => same(S, shim, "resolve", [[]]));
});

describe("scrml:fs — the .scrml answers exactly as the shim (statSync checked structurally)", () => {
  let S, shim, dir;
  beforeAll(async () => {
    S = fromScrml("stdlib/fs/index.scrml", ["statSync"]).mod;
    shim = await import("../../runtime/stdlib/fs.js");
    dir = mkdtempSync(join(tmpdir(), "s473-fs-parity-"));
  });
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
  test("write → read with the encoding omitted, \"\", not, and named (each side reads what the other wrote)", () => {
    for (const enc of [undefined, "", null, "utf-8", "base64"]) {
      const f1 = join(dir, `s-${String(enc)}.txt`), f2 = join(dir, `h-${String(enc)}.txt`);
      const body = enc === "base64" ? Buffer.from("héllo").toString("base64") : "héllo\n";
      S.writeFileSync(f1, body, enc);
      shim.writeFileSync(f2, body, enc);
      expect(readFileSync(f1)).toEqual(readFileSync(f2));
      expect(S.readFileSync(f2, enc)).toEqual(shim.readFileSync(f1, enc));
    }
  });
  test("existsSync / mkdirSync (options omitted and not) / readdirSync / rmSync (options omitted and not)", () => {
    same(S, shim, "existsSync", [[dir], [join(dir, "nope")]]);
    S.mkdirSync(join(dir, "a", "b"));
    shim.mkdirSync(join(dir, "c", "d"), null);
    expect([S.existsSync(join(dir, "a", "b")), shim.existsSync(join(dir, "c", "d"))]).toEqual([true, true]);
    same(S, shim, "readdirSync", [[dir], [join(dir, "missing")]]);
    S.writeFileSync(join(dir, "a", "b", "f"), "x");
    shim.writeFileSync(join(dir, "c", "d", "f"), "x");
    S.rmSync(join(dir, "a", "b", "f"), null);
    shim.rmSync(join(dir, "c", "d", "f"));
    expect([S.existsSync(join(dir, "a", "b", "f")), shim.existsSync(join(dir, "c", "d", "f"))]).toEqual([false, false]);
    same(S, shim, "rmSync", [[join(dir, "a", "b")], [join(dir, "c", "d"), null]]); // a directory without `recursive`: both throw EISDIR
    same(S, shim, "rmSync", [[join(dir, "missing")], [join(dir, "missing"), { force: true }]]);
  });
  test("statSync (NOT run from source — scrml:host safeCall + `!{}`): a throwing stat maps to `not` as the shim's catch maps it to null, and the fields are the shim's", () => {
    const src = readFileSync(join(ROOT, "stdlib/fs/index.scrml"), "utf8");
    const body = src.slice(src.indexOf("export function statSync("), src.indexOf("export function rmSync("));
    expect(body).toMatch(/safeCall\(\(\) => fs\.statSync\(path\)\) !\{\s*::Thrown\(message, name\) :> \{ return not \}/);
    for (const f of ["isFile: s.isFile()", "isDirectory: s.isDirectory()", "size: s.size", "mtime: s.mtime"]) expect(body).toContain(f);
    expect(shim.statSync(join(dir, "missing"))).toBe(null);
  });
});

describe("scrml:random — the host file the .scrml wraps answers exactly as the shim (Math.random stubbed)", () => {
  let host, shim;
  const real = Math.random;
  beforeAll(async () => {
    host = await import("../../../stdlib/random/host.js");
    shim = await import("../../runtime/stdlib/random.js");
  });
  afterAll(() => { Math.random = real; });
  test("the same draws give the same values, swapped / fractional / single-value / not bounds included", () => {
    const draws = [0, 0.1, 0.5, 0.999999, 0.25];
    for (const args of [[1, 6], [6, 1], [1.2, 5.8], [7, 7], [null, 5], [0, 100000], [-3, 3]]) {
      for (const r of draws) {
        Math.random = () => r;
        const a = host.randomInt(...args);
        const b = shim.randomInt(...args);
        expect({ args, r, v: a }).toEqual({ args, r, v: b });
        expect(host.random()).toBe(shim.random());
      }
    }
  });
});
