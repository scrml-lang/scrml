/**
 * stdlib-failable-errors-s469.test.js — the STDLIB_FAILABLE_ERRORS table (compiler/src/
 * stdlib-failable-errors.ts) equals what stdlib/ declares: every `export type <X>:enum` an exported
 * failable function names as its error type, every `export function f(…) ! -> <X>`, and every
 * re-export of one from a module's index. A `!{}` arm on a stdlib call binds by this table's field
 * order (S469 r2, g-server-return-match-failable-subject-unawaited-s469), so drift here would bind
 * the wrong field.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { compileScrml } from "../../src/api.js";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { STDLIB_FAILABLE_ERRORS } from "../../src/stdlib-failable-errors.ts";

const STDLIB = join(dirname(fileURLToPath(import.meta.url)), "../../../stdlib");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".scrml")) out.push(p);
  }
  return out;
}

const files = walk(STDLIB);
/** enum name → { variant: fields[] } over every stdlib `export type X:enum = { … }`. */
const enums = new Map();
/** "scrml:<module path>" → { fnName: enumName } for every `export function f(…) ! -> X`. */
const failable = new Map();
const specOf = (f) => {
  const rel = relative(STDLIB, f).replace(/\\/g, "/").replace(/\.scrml$/, "");
  return "scrml:" + rel.replace(/\/index$/, "");
};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/export type (\w+):enum = \{([\s\S]*?)\n\s*\}/g)) {
    const body = {};
    for (const v of m[2].split(/,?\n/).map((l) => l.trim()).filter((l) => /^[A-Z]/.test(l))) {
      const vm = /^(\w+)(?:\((.*)\))?,?$/.exec(v);
      if (!vm) continue;
      body[vm[1]] = vm[2] ? vm[2].split(",").map((p) => p.split(":")[0].trim()).filter(Boolean) : [];
    }
    enums.set(m[1], body);
  }
  for (const m of src.matchAll(/export (?:server )?(?:async )?function (\w+)\([^)]*\)\s*!\s*->\s*(\w+)/g)) {
    const spec = specOf(f);
    if (!failable.has(spec)) failable.set(spec, {});
    failable.get(spec)[m[1]] = m[2];
  }
}
// Index re-exports: `export { a, b as c } from './x.scrml'`.
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/export \{([^}]*)\}\s*from\s*["']\.\/([\w/-]+)\.scrml["']/g)) {
    const target = specOf(join(dirname(f), m[2] + ".scrml"));
    const fns = failable.get(target);
    if (!fns) continue;
    for (const part of m[1].split(",").map((p) => p.trim()).filter(Boolean)) {
      const [imported, local] = part.split(/\s+as\s+/).map((x) => x.trim());
      if (!fns[imported]) continue;
      const spec = specOf(f);
      if (!failable.has(spec)) failable.set(spec, {});
      failable.get(spec)[local ?? imported] = fns[imported];
    }
  }
}

describe("STDLIB_FAILABLE_ERRORS matches stdlib/", () => {
  test("every failable stdlib export (and re-export) is in the table with its enum's fields", () => {
    const expected = {};
    for (const [spec, fns] of failable) {
      expected[spec] = {};
      for (const [fn, enumName] of Object.entries(fns)) expected[spec][fn] = enums.get(enumName);
    }
    const actual = JSON.parse(JSON.stringify(STDLIB_FAILABLE_ERRORS));
    expect(actual).toEqual(expected);
  });

  test("the scan saw the known failable exports (instrument check)", () => {
    expect(failable.get("scrml:store/kv")?.get).toBe("KvError");
    expect(failable.get("scrml:host")?.safeCallAsync).toBe("HostError");
    expect(enums.get("HostError")).toEqual({ Thrown: ["message", "name"] });
  });
});

describe("a `!{}` arm on a stdlib failable call binds by the declared field", () => {
  test("`kvGet(store, k) !{ .ParseFailed(m) :> m }` binds `.data.message` (scrml:store KvError)", () => {
    const dir = join(process.env.TMPDIR || tmpdir(), `scrml-s469-stdlib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "app.scrml"), `<msg> = "init"
\${
    import { get as kvGet } from 'scrml:store'
    function load(store) {
        const v = kvGet(store, "k") !{ .ParseFailed(m) :> m }
        return v
    }
    function go() { @msg = load(not) }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`);
    try {
      const res = compileScrml({ inputFiles: [join(dir, "app.scrml")], write: true, outputDir: join(dir, "out"), log: () => {} });
      const codes = (res.errors ?? []).filter((e) => !/^[WI]-/.test(e.code ?? "")).map((e) => e.code);
      expect(codes).toEqual([]);
      // `scrml:store` is server-only, so `load` is placed on the server.
      const js = ["out/app.client.js", "out/app.server.js"].map((f) => existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "").join("\n");
      expect(js).toMatch(/const m = _scrml_\w+\.data\.message;/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
