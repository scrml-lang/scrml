/**
 * routemap-native-key-s473.test.js — g-windows-impl1-routemap-native-key-miss-s473, reproduced on POSIX.
 *
 * On Windows, route inference keys `routeMap.functions` by each file's NATIVE path
 * (`C:\…\lib.scrml::<start>`), while an imported callee's file reaches the type checker as the
 * module graph's canonical POSIX `depFilePath` (path-canonical.js). Three S473 readers in
 * type-system.ts did a raw `get` with the posix path, so on Windows they missed every IMPORTED
 * callee: #1664's transport routing never wrapped the call, and #1658's `_ e :>` typing refused
 * `e.variant` (E-TYPE-031). Main's windows job showed it; Linux could not, since native ≡ posix here.
 *
 * Forcing the Windows shape on Linux:
 *   1. `node:path`'s `sep` is mocked to `\`, so `toPosix` folds `\` → `/` as it does on Windows
 *      (path-canonical.js is sep-aware by design; every other `path` function stays the real one).
 *   2. The TS stage is handed a routeMap whose keys for the IMPORTED file are rewritten to
 *      backslash form, the native key a Windows route inference produces. Every other stage
 *      keeps the real keys, so only the type checker's lookup is under test.
 * The raw `get` misses (red before the fix); `routeEntryAt` (exact key, then a `toPosix` index)
 * hits. The mock is undone in afterAll, so later files in the process see the real `sep`.
 */
import { describe, test, expect, mock, afterAll } from "bun:test";
import * as realPathNs from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { Database } from "bun:sqlite";

const REAL_PATH = { ...realPathNs };
mock.module("node:path", () => ({ ...REAL_PATH, sep: "\\", default: { ...REAL_PATH, sep: "\\" } }));
afterAll(() => {
  mock.module("node:path", () => ({ ...REAL_PATH, default: REAL_PATH }));
});

const { resolve } = REAL_PATH;
const { compileScrml } = await import("../../src/api.js");
const { runTS } = await import("../../src/type-system.ts");
const { toPosix } = await import("../../src/path-canonical.js");

/** The TS stage, fed native (backslash) routeMap keys for every file whose path ends with `depSuffix`. */
function tsWithNativeKeysFor(depSuffix, seen) {
  return (input) => {
    const functions = new Map();
    for (const [k, v] of input.routeMap.functions) {
      const cut = k.lastIndexOf("::");
      const file = k.slice(0, cut);
      if (file.endsWith(depSuffix)) {
        const nk = `${file.replaceAll("/", "\\")}${k.slice(cut)}`;
        seen.push(nk);
        functions.set(nk, v);
      } else functions.set(k, v);
    }
    return runTS({ ...input, routeMap: { ...input.routeMap, functions } });
  };
}

function compile(files, entry, depSuffix, { write = false } = {}) {
  const dir = resolve(tmpdir(), `scrml-s473-rmkey-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(resolve(dir, "viewapp"), { recursive: true });
  const db = new Database(resolve(dir, "g.db"));
  db.run("CREATE TABLE gnode (id TEXT, title TEXT, kind TEXT)");
  db.close();
  for (const [name, src] of Object.entries(files)) writeFileSync(resolve(dir, name), src);
  const seen = [];
  try {
    const result = compileScrml({
      inputFiles: [resolve(dir, entry)], write, outputDir: resolve(dir, "out"), log: () => {},
      stageOverrides: { TS: tsWithNativeKeysFor(depSuffix, seen) },
    });
    const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    const clientPath = resolve(dir, "out", entry.replace(/\.scrml$/, ".client.js"));
    return { codes: errors.map((e) => e.code), seen, clientJs: write && existsSync(clientPath) ? readFileSync(clientPath, "utf8") : "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the harness reproduces the Windows key shape (else every case below is vacuous)", () => {
  test("toPosix folds `\\` (sep mocked) and the imported file's keys reach TS in backslash form", () => {
    expect(toPosix("C:\\a\\lib.scrml")).toBe("C:/a/lib.scrml");
    const r = compile({ "lib.scrml": LIB, "app.scrml": APP }, "app.scrml", "/lib.scrml");
    expect(r.seen.length).toBeGreaterThan(0);
    expect(r.seen.every((k) => k.includes("\\") && !k.includes("/"))).toBe(true);
  });
});

// #1664 — transport routing (transportRoutableCallee).
const LIB = `\${
    export server function plainS(id: string) {
        return 5
    }
}
`;
const APP = `<x> = 7
<seen> = "none"
\${
    import { plainS } from "./lib.scrml"
    function u(id: string) {
        @x = plainS(id) !{ _ :> { @seen = "any"; @x = -1; return } }
    }
}
<button onclick=u("ok")>go</button>
<p>\${@x}</p>
`;

describe("#1664 transport routing reads the imported callee's native-keyed route", () => {
  test("a covered `!{}` on an IMPORTED plain server call is routed through _scrml_server_attempt", () => {
    const r = compile({ "lib.scrml": LIB, "app.scrml": APP }, "app.scrml", "/lib.scrml", { write: true });
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toContain("await _scrml_server_attempt(plainS(id))");
  });
});

// #1658 — `_ e :>` typing (wholeBinderPlainServerCallee). The callee is `?{}`-placed, not
// `server`-marked, so only the route entry says it runs on the server (flogence's shape).
const GRAPH_READ = `<db src="./g.db" tables="gnode">
\${
  export function listArcs() {
    return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
  }
}
</db>
`;
const VIEW = (arm) => `<program db="../g.db">
  \${
    import { listArcs } from '../graph-read.scrml'
    <fromImport> = []
    <status> = ""
    function load() {
      @fromImport = listArcs() !{ ${arm} }
    }
  }
  <main>
    <p>\${@status}</p>
    <button onclick=load()>load</button>
  </main>
</program>
`;

describe("#1658 `_ e :>` typing reads the imported callee's native-keyed route", () => {
  test("`e.variant` on the IMPORTED call compiles (was E-TYPE-031 with the key missed)", () => {
    const r = compile({ "graph-read.scrml": GRAPH_READ, "viewapp/view.scrml": VIEW(`_ e :> { @status = "failed: " + e.variant; return }`) }, "viewapp/view.scrml", "/graph-read.scrml");
    expect(r.seen.length).toBeGreaterThan(0);
    expect(r.codes).toEqual([]);
  });
  test("`e.message` is E-TYPE-004 (a payload read off the whole error), not E-TYPE-031", () => {
    const r = compile({ "graph-read.scrml": GRAPH_READ, "viewapp/view.scrml": VIEW(`_ e :> { @status = e.message; return }`) }, "viewapp/view.scrml", "/graph-read.scrml");
    expect(r.codes).toEqual(["E-TYPE-004"]);
  });
});
