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
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "fs";
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
