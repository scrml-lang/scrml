// g-impl1-dbvar-tag-mutates-shared-type-s479 — codegen's §8.1.1 `_dbVar` tagging walk must
// not write onto process-lifetime (shared) type objects.
//
// codegen/index.ts tags every node under a database scope with `_dbVar = <handle>`. The walk
// reached an `<endpoint>` arm's `payloadBindingTypes` — which hold the type system's built-in
// `string` type BY IDENTITY (one object per process) — and tagged it, so every later compile in
// the same process (and every `resolveTypeExpr("string")`) saw `_dbVar: "_scrml_sql"`.
// Running endpoint-415-strict-keys-served + endpoint-malformed-body-400 + union-not-normalization
// in one process failed 3 tests; snippet-slot failed order-dependently.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "node:url";
import { compileScrml } from "../../src/api.js";
import * as TS from "../../src/type-system.js";
const { resolveTypeExpr } = TS;

const testDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const TMP_ROOT = resolve(testDir, "_tmp_dbvar_shared_types");
let n = 0;

beforeAll(() => { if (!existsSync(TMP_ROOT)) mkdirSync(TMP_ROOT, { recursive: true }); });
afterAll(() => { if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true }); });

function compile(src, tagBase) {
  const tag = `${tagBase}-${++n}`;
  const dir = resolve(TMP_ROOT, tag);
  const outDir = resolve(dir, "dist");
  mkdirSync(outDir, { recursive: true });
  const input = resolve(dir, `${tagBase}.scrml`);
  writeFileSync(input, src);
  const result = compileScrml({ inputFiles: [input], write: true, outputDir: outDir, log: () => {} });
  const read = (ext) => {
    const p = join(outDir, `${tagBase}${ext}`);
    return existsSync(p) ? readFileSync(p, "utf-8") : null;
  };
  return {
    errors: (result.errors ?? []).filter((e) => !/^[WI]-/.test(e.code ?? "")),
    serverJs: read(".server.js"),
    clientJs: read(".client.js"),
  };
}

// A database-scoped program whose endpoint arm binds a `string` payload field — the
// arm's payloadBindingTypes hold the built-in `string` type object.
const DB_APP = (db) => `<program db="${db}">
\${
  type Op:enum = {
    Ping
    Hit(who: string)
  }
  server function hit(who) {
    ?{\`INSERT INTO hits (who) VALUES (\${who})\`}.run()
    return { recorded: who }
  }
}
<endpoint path="/op" method="POST" accepts=Op>
  <Ping : { pong: true }>
  <Hit(who) : hit(who)>
</endpoint>
<p>x</>
</program>
`;

// No database anywhere — but the same `string` payload binding.
const NO_DB_APP = `type M:enum = { Ping, Dispatch(prompt: string, project: string) }
fn handleDispatch(p: string, q: string) -> string { p }
<endpoint path="/x" method="POST" accepts=M>
  <Ping : { ok: true }>
  <Dispatch(prompt, project) : { echo: handleDispatch(prompt, project) }>
</endpoint>
`;

const PRIMITIVES = ["string", "number", "boolean", "integer", "date", "timestamp", "asIs", "not"];

describe("g-impl1-dbvar-tag-mutates-shared-type-s479 — _dbVar tagging leaves shared types alone", () => {
  test("the built-in type objects are registered as shared", () => {
    for (const name of PRIMITIVES) {
      expect(TS.isSharedTypeObject(resolveTypeExpr(name, new Map()))).toBe(true);
    }
    // A per-compile object is not.
    expect(TS.isSharedTypeObject({ kind: "primitive", name: "string" })).toBe(false);
  });

  test("a db-less compile's output is the same before and after a db-bearing compile", () => {
    const before = compile(NO_DB_APP, "nodb");
    expect(before.errors).toEqual([]);

    const withDb = compile(DB_APP(resolve(TMP_ROOT, "hits.db")), "withdb");
    expect(withDb.errors).toEqual([]);
    // The db program really is db-scoped (the tag walk ran with a handle).
    expect(withDb.serverJs).toContain("_scrml_sql");

    // No primitive singleton carries the db program's handle.
    for (const name of PRIMITIVES) {
      const t = resolveTypeExpr(name, new Map());
      expect(Object.prototype.hasOwnProperty.call(t, "_dbVar")).toBe(false);
    }
    expect(resolveTypeExpr("string", new Map())).toEqual({ kind: "primitive", name: "string" });

    const after = compile(NO_DB_APP, "nodb");
    expect(after.errors).toEqual([]);
    expect(after.serverJs).toBe(before.serverJs);
    expect(after.clientJs).toBe(before.clientJs);
    expect(after.serverJs ?? "").not.toContain("_scrml_sql");
  });
});

// ---------------------------------------------------------------------------
// The CLASS, not one instance (PR #1970 review F1): any process-lifetime object an annotating
// walk can reach — a built-in type, or a value a process-lifetime memo stores against one (the
// refinement judge `_shapeMemo` held for the built-in `string`) — lets a db-scoped compile
// change a LATER db-less compile. Each db-less program below is compiled ALONE in a fresh
// process (the reference), then in this process after every db-scoped program; the outputs
// must be byte-identical. The shapes are the ones that leaked (refinement unions, enum
// payloads, endpoint payloads) plus a struct with a refined field and schema-typed rows.
// ---------------------------------------------------------------------------

const API_PATH = resolve(testDir, "../../src/api.js");

const CLASS_DB = {
  "refined-union": `<program db="sqlite:./a.db">
\${
    type Box:enum = {
        Empty
        Has(v: number(>0) | string)
    }
    <neg>: number = -4
    <shown>: string = "none"
    function show(v: number(>0) | string) {
        @shown = "ok"
    }
    function put(b: Box) { @shown = "b" }
}
<button id="neg" onclick=\${show(@neg)}>Neg</button>
<p id="out">\${@shown}</p>
</program>
`,
  "endpoint-payload": DB_APP("./hits.db"),
  "struct-refined": `<program db="sqlite:./s.db">
\${
    type P:struct = { name: string, n: number(>0) | string }
    <shown>: string = "none"
    function take(p: P) { @shown = p.name }
    server function save(name) {
        ?{\`INSERT INTO ps (name) VALUES (\${name})\`}.run()
        return name
    }
}
<button onclick=\${take({ name: "a", n: 1 })}>Go</button>
<p>\${@shown}</p>
</program>
`,
  "schema-rows": `\${
    import { schemaFor } from 'scrml:data'
    type Status:enum = { Pending, Active, Archived }
    type Task:struct = {
        title:  string req length(<=120)
        notes:  string
        status: Status req
    }
}
<program db="./tasks.sqlite">
    <schema>
        \${ schemaFor(Task) }
    </>
    \${
        <shown>: string = "none"
        server function titles() {
            const rows: Task[] = ?{\`SELECT title, notes, status FROM tasks\`}.all()
            return rows
        }
        function keep(t: Task) { @shown = t.title }
        function pick(v: number(>0) | string) { @shown = "p" }
    }
    <p>\${@shown}</p>
</program>
`,
};

const CLASS_NO_DB = {
  "refined-union-enum": `\${
    type Box:enum = {
        Empty
        Has(v: number(>0) | string)
    }
    <neg>: number = -4
    <shown>: string = "none"
    function show(v: number(>0) | string) {
        @shown = "ok"
    }
    function put(b: Box) { @shown = "b" }
}
<program>
<button id="neg" onclick=\${show(@neg)}>Neg</button>
<p id="out">\${@shown}</p>
</program>
`,
  "endpoint-payload": NO_DB_APP,
  "struct-refined": `<program>
\${
    type P:struct = { name: string, n: number(>0) | string }
    <shown>: string = "none"
    function take(p: P) { @shown = p.name }
}
<button onclick=\${take({ name: "a", n: 1 })}>Go</button>
<p>\${@shown}</p>
</program>
`,
  "schema-rows": `\${
    type Status:enum = { Pending, Active, Archived }
    type Task:struct = {
        title:  string req length(<=120)
        notes:  string
        status: Status req
    }
}
<program>
    \${
        <shown>: string = "none"
        function keep(t: Task) { @shown = t.title }
        function pick(v: number(>0) | string) { @shown = "p" }
        function many(ts: Task[]) { @shown = "n" }
    }
    <p>\${@shown}</p>
</program>
`,
};

// Compiles argv[3] into argv[4] with the compiler at argv[2], in a FRESH process.
const ALONE_SCRIPT = `const { compileScrml } = await import(process.argv[2]);
const r = compileScrml({ inputFiles: [process.argv[3]], write: true, outputDir: process.argv[4], log: () => {} });
process.stdout.write(JSON.stringify((r.errors ?? []).filter((e) => !/^[WI]-/.test(e.code ?? "")).map((e) => e.code)));
`;

/** Every emitted file under `dir`, name -> contents. */
function readOutputs(dir) {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isFile()) out[name] = readFileSync(p, "utf-8");
  }
  return out;
}

describe("g-impl1-dbvar-tag-mutates-shared-type-s479 — the class: a db-scoped compile never changes a later db-less compile", () => {
  test("each db-less program compiles byte-identically alone and after every db-scoped program", () => {
    const root = resolve(TMP_ROOT, "class");
    mkdirSync(root, { recursive: true });
    const script = join(root, "alone.mjs");
    writeFileSync(script, ALONE_SCRIPT);

    // Reference: each db-less program alone, in its own process.
    const inputs = {};
    const alone = {};
    for (const [name, src] of Object.entries(CLASS_NO_DB)) {
      const dir = join(root, `nodb-${name}`);
      mkdirSync(dir, { recursive: true });
      inputs[name] = join(dir, `${name}.scrml`);
      writeFileSync(inputs[name], src);
      const outDir = join(dir, "alone");
      mkdirSync(outDir, { recursive: true });
      const r = Bun.spawnSync([process.execPath, script, API_PATH, inputs[name], outDir], { stdout: "pipe", stderr: "pipe" });
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout.toString())).toEqual([]);
      alone[name] = readOutputs(outDir);
      expect(Object.keys(alone[name])).toContain(`${name}.client.js`);
    }

    // This process: every db-scoped program first …
    for (const [name, src] of Object.entries(CLASS_DB)) {
      const r = compile(src, `db-${name}`);
      expect({ name, errors: r.errors }).toEqual({ name, errors: [] });
      // A program with SQL really reaches its handle (the refined-union one is the reviewer's
      // repro verbatim: db-scoped, no SQL — its tag walk still ran under the scope).
      if (src.includes("?{")) expect(r.serverJs ?? "").toContain("_scrml_sql");
    }

    // … then each db-less program, from the same input path, must match its reference.
    for (const name of Object.keys(CLASS_NO_DB)) {
      const outDir = join(root, `nodb-${name}`, "after-db");
      mkdirSync(outDir, { recursive: true });
      const result = compileScrml({ inputFiles: [inputs[name]], write: true, outputDir: outDir, log: () => {} });
      expect((result.errors ?? []).filter((e) => !/^[WI]-/.test(e.code ?? ""))).toEqual([]);
      const after = readOutputs(outDir);
      expect(Object.keys(after)).toEqual(Object.keys(alone[name]));
      for (const file of Object.keys(alone[name])) {
        expect({ file, text: after[file] }).toEqual({ file, text: alone[name][file] });
      }
    }
  }, 120000);
});
