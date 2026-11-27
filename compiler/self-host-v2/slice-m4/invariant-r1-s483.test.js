// invariant-r1-s483.test.js — lane s483-invariant-2, fix round r1 (#2128 review). SPEC §66.13.5, §6.14.2, §7.6.
//
// RULED:
// - ruling:user-voice-scrml.md-S483-invariant-const-read — "admit a file-scope const whose initializer is a
//   compile-time constant (literals, enum variants, other such consts) and that is not server-only, directly and
//   through a fn chain. A `let`, a host-derived const, or a server-only const stays refused."
// - ruling:user-voice-scrml.md-S483-invariant-const-fold — "Admit foldable arithmetic (Recommended)": any
//   initializer the compiler folds to a value at compile time (+ - * … over literals and other such consts) is a
//   compile-time constant.
// - ruling:user-voice-scrml.md-S483-invariant-derived-split — "Split (Recommended)": check-at-source for a field
//   derived only from the value's own sibling fields (a sibling write re-checks the candidate); a field that tracks
//   a cell or a live use-site value stays refused, PERMANENT, E-CONTRACT-003.
//
// Shipping path (scripts/scrml-boot.ts compileSource → print.scrml), run in happy-dom (bootstrap-conformance
// runBootstrapArtifact); the run-time traps again in Chromium (invariant-write-chromium-s483.browser.test.js).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-invariant-r1-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let k = 0;
async function result(src) {
  const d = join(dir, `p${k++}`);
  mkdirSync(d);
  const file = join(d, "main.scrml");
  writeFileSync(file, src);
  return await compileSource(file);
}
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error");
const codes = (r) => errs(r).map((d) => d.code);

// every client-side text of a compile result (the page and the client module)
const clientText = (r) => String(r.client?.html ?? "") + "\n" + String(r.client?.js ?? "");

// ---------------------------------------------------------------------------------------------------------------
// H2 (security) — a constant server code reaches THROUGH A CALL is server-read, so an invariant reading it is refused
// exactly as a direct read is (§66.13.5 rule 7: "The set refused through a call is exactly the set refused
// directly"); and without the invariant the constant stays out of every client file.
// ---------------------------------------------------------------------------------------------------------------
const SECRET = "zz-secret-r1";
const srvProg = (fns, inv, uses) => `<program db="./app.db">
\${
    const K = "${SECRET}";
${fns}
}
<tok:struct>
    let <v:string="a"/>
</>
${inv}
let <out:string=""/>
<main><p>\${@tok.v}\${@out}</p><button onclick={ @out = ${uses} !{ .Transport(_) :> return }; }>b</button></main>
</program>
`;
const SRV = (body) => `    function srv(id: int) -> string {
        const t = ?{\`SELECT 1 AS x WHERE \${id} = 1\`}.get() !{ _ :> { return ""; } };
        return ${body};
    }`;

const variants = [
  // g03: the server function reads K through `key`; the invariant reaches K through `ok` → `key`
  { name: "g03 two-hop on both sides", fns: `    fn key() -> string { return K; }\n    fn ok(v: string) -> bool { return v != key(); }\n${SRV("key()")}`, inv: "invariant (ok(v)) [notKey]" },
  // a deeper server chain: srv → wrap → key → K
  { name: "three-hop server chain", fns: `    fn key() -> string { return K; }\n    fn wrap() -> string { return key() + ""; }\n    fn ok(v: string) -> bool { return v != wrap(); }\n${SRV("wrap()")}`, inv: "invariant (ok(v))" },
  // the server reaches K through a shared fn; the invariant reads K directly
  { name: "server via fn, invariant direct", fns: `    fn key() -> string { return K; }\n${SRV("key()")}`, inv: "invariant (v != K)" },
  // a server-read constant's initializer reads K, reached through a call
  { name: "through a constant's initializer", fns: `    const K2 = K;\n    fn key() -> string { return K2; }\n    fn ok(v: string) -> bool { return v != K; }\n${SRV("key()")}`, inv: "invariant (ok(v))" },
];

describe("H2 — a server function's calls are followed: the constant it reaches is refused in an invariant", () => {
  for (const v of variants) {
    test(`${v.name}: refused; without the invariant the constant is in no client file`, async () => {
      const r = await result(srvProg(v.fns, v.inv, "srv(1)"));
      expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
      expect(errs(r)[0].message).toContain("which server code reads (");
      const r2 = await result(srvProg(v.fns, "", "srv(1)"));
      expect(codes(r2)).toEqual([]);
      expect(clientText(r2)).not.toContain(SECRET);
      expect(JSON.stringify(r2.server ?? r2)).toContain(SECRET);
    }, 120000);
  }

  test("the same invariant on a `type X:struct` is refused through the chain too", async () => {
    const src = `<program db="./app.db">
\${
    const K = "${SECRET}";
    fn key() -> string { return K; }
    fn ok(v: string) -> bool { return v != key(); }
${SRV("key()")}
}
type Tok:struct = { v: string } invariant (ok(v))
<tok:struct>
    let <t:Tok=({ v: "a" })/>
</>
let <out:string=""/>
<main><p>\${@tok.t.v}\${@out}</p><button onclick={ @out = srv(1) !{ .Transport(_) :> return }; }>b</button></main>
</program>
`;
    const r = await result(src);
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toContain("through `key`");
  }, 120000);

  test("the message names the call chain the server code reaches the constant through", async () => {
    const r0 = await result(srvProg(variants[0].fns, variants[0].inv, "srv(1)"));
    expect(errs(r0)[0].message).toContain("which server code reads (the server function `srv`, through `key`)");
    const r = await result(srvProg(variants[1].fns, variants[1].inv, "srv(1)"));
    expect(errs(r)[0].message).toContain("the server function `srv`, through `wrap` → `key`");
  }, 120000);
});
