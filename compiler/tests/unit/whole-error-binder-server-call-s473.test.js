/**
 * whole-error-binder-server-call-s473.test.js — S473 (flogence S60 report, viewapp/view.scrml).
 *
 * A `!{}` on a CLIENT call to a server-placed function that is not declared `!` — a function
 * server-placed by its `?{}`, local or IMPORTED — gave `_ e :>` no type, so EVERY use of `e`
 * (`e.variant` included) was refused with E-TYPE-031 "the handled call's error enum cannot be
 * resolved here".
 *
 * SPEC:
 *  - §18.6.1 "The binder's type is the type of the failure being handled — … a client call to a
 *    server function (§19.9.10): the call's failure set — `Transport(t: ServerCallError)`, and for a
 *    server function declared `! E` the variants of `E` as well".
 *  - §19.9.10 "For an `f` not declared `!`, the failure set is `Transport(t: ServerCallError)` alone."
 *  - §18.17.1 "Every enum value has the member `.variant`" — so `e.variant` is legal;
 *    "Reading any member other than `.variant` off a value of a known enum type SHALL be a compile
 *    error (E-TYPE-004)" and §18.6.1 (S469) — so `e.message` is E-TYPE-004 (it was E-TYPE-031).
 *  - §19.9.10 "Not affected: A server→server call … Its failure set is the callee's own — none for a
 *    function not declared `!`." — so a server-side caller gets no failure set (still refused).
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { Database } from "bun:sqlite";
import { compileScrml } from "../../src/api.js";

function compileFiles(files, entry = "viewapp/view.scrml") {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s473-wb-${uniq}`);
  mkdirSync(resolve(dir, "viewapp"), { recursive: true });
  const db = new Database(resolve(dir, "g.db"));
  db.run("CREATE TABLE gnode (id TEXT, title TEXT, kind TEXT)");
  db.close();
  for (const [name, src] of Object.entries(files)) writeFileSync(resolve(dir, name), src);
  try {
    const result = compileScrml({ inputFiles: [resolve(dir, entry)], write: false, outputDir: resolve(dir, "out"), log: () => {} });
    const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    return { errors, codes: errors.map((e) => e.code) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// flogence graph-read.scrml's shape: a `<db>` library exporting a `?{}`-using function, not declared `!`.
const GRAPH_READ = `<db src="./g.db" tables="gnode">
\${
  export function listArcs() {
    return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
  }
}
</db>
`;

// flogence viewapp/view.scrml's shape: the imported call and a local `?{}` function, each in a `!{}`.
const view = (importArm, localArm, extra = "") => `<program db="../g.db">
  \${
    import { listArcs } from '../graph-read.scrml'
    <fromImport> = []
    <fromLocal> = []
    <status> = ""
    function fetchLocal() {
      return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
    }
    ${extra}
    function load() {
      @fromImport = listArcs() !{ ${importArm} }
      @fromLocal = fetchLocal() !{ ${localArm} }
    }
  }
  <main>
    <p>\${@status}</p>
    <button onclick=load()>load</button>
  </main>
</program>
`;
const codesOf = (importArm, localArm, extra) => compileFiles({ "graph-read.scrml": GRAPH_READ, "viewapp/view.scrml": view(importArm, localArm, extra) }).codes;
const OK = `_ :> { @status = "failed"; return }`;

describe("S473 — `_ e :>` on a client call to a server function not declared `!` is typed by its failure set (§18.6.1, §19.9.10)", () => {
  test("the control: arms that do not read `e` compile (flogence's current workaround)", () => {
    expect(codesOf(`_ e :> { @status = "import arm failed"; return }`, `_ e :> { @status = "local arm failed"; return }`)).toEqual([]);
  });

  test("`e.variant` on the IMPORTED call compiles (§18.17.1) — was E-TYPE-031", () => {
    expect(codesOf(`_ e :> { @status = "import arm failed: " + e.variant; return }`, OK)).toEqual([]);
  });

  test("`e.variant` on the LOCAL `?{}` function's call compiles — was E-TYPE-031", () => {
    expect(codesOf(OK, `_ e :> { @status = "local arm failed: " + e.variant; return }`)).toEqual([]);
  });

  test("`e is .Transport` compiles on both (the failure set's one variant)", () => {
    expect(codesOf(
      `_ e :> { @status = e is .Transport ? "offline" : "?"; return }`,
      `_ e :> { @status = e is .Transport ? "offline" : "?"; return }`,
    )).toEqual([]);
  });

  // (`match e { .Transport :> … }` is not pinned here: in a CLIENT function impl#1 reads a one-line
  // `!{ _ e :> match e { … } }` arm as the identifier `match` — E-SCOPE-001 — for ANY callee, a `!`
  // one included; filed `g-impl1-match-expr-in-bang-arm-client-fn-s473`.)

  test("`e.message` is E-TYPE-004 on both — a payload read off the whole error (§18.6.1 S469); was E-TYPE-031", () => {
    expect(codesOf(
      `_ e :> { @status = "import arm failed: " + e.message; return }`,
      `_ e :> { @status = "local arm failed: " + e.message; return }`,
    )).toEqual(["E-TYPE-004", "E-TYPE-004"]);
  });

  test("`e is .QueryFailed` is refused: not a variant of the failure set", () => {
    expect(codesOf(`_ e :> { @status = e is .QueryFailed ? "q" : "?"; return }`, OK)).toEqual(["E-TYPE-031"]);
  });

  test("`.Transport(t)` binding the ServerCallError payload stays refused (impl#1 cannot follow an enum-valued payload binder)", () => {
    expect(codesOf(`_ e :> match e { .Transport(t) :> [] }`, OK)).toContain("E-TYPE-031");
  });

  test("passing `e` whole to a function stays refused (no parameter type can name the failure set)", () => {
    expect(codesOf(`_ e :> { @status = describe(e); return }`, OK, `function describe(x) { return "x" }`)).toEqual(["E-TYPE-031"]);
  });

  test("comparing `e` with a primitive is E-EQ-001", () => {
    expect(codesOf(`_ e :> { @status = e == "Transport" ? "a" : "b"; return }`, OK)).toEqual(["E-EQ-001"]);
  });
});

describe("S473 — where there is no client→server failure set, the binder stays untyped (refused)", () => {
  test("a SERVER-side caller (server→server, §19.9.10 'Not affected'): `e.variant` is still E-TYPE-031", () => {
    const src = `<program db="./g.db">
  \${
    <status> = ""
    function fetchLocal() {
      return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
    }
    server function outer() {
      const rows = fetchLocal() !{ _ e :> { log(e.variant); return [] } }
      return rows
    }
    function load() { @status = outer() !{ _ :> "x" } }
  }
  <button onclick=load()>load</button>
</program>
`;
    expect(compileFiles({ "app.scrml": src }, "app.scrml").codes).toEqual(["E-TYPE-031"]);
  });

  test("a CLIENT callee that is not failable: `e.variant` is still E-TYPE-031", () => {
    const src = `<program>
  \${
    <status> = ""
    function plain() { return 1 }
    function load() { @status = plain() !{ _ e :> e.variant } }
  }
  <button onclick=load()>load</button>
</program>
`;
    expect(compileFiles({ "app.scrml": src }, "app.scrml").codes).toContain("E-TYPE-031");
  });
});
