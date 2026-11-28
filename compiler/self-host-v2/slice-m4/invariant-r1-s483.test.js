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
<main><p>\${@tok.v}\${@out}</p><button onclick={ @out = ${uses} !{ .Transport(_) :> return }; }>b</button><button onclick={ @tok.v = @tok.v + @out; }>w</button></main>
</program>
`;
// r3 (#2128 r2 re-review H6): the page WRITES `v` (a check that runs in the client); with no write, a construction
// the compiler decides (§66.13.5 rule 10 — `v` seeded "a", K a constant) runs nowhere and moves nothing (rule 7a)
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
      // r2 (#2128 r1 re-review H2): the printer's classification run without and with the invariant (print.scrml
      // invLeakRefusal) — one refusal per invariant, naming what it reaches
      expect(errs(r)[0].message).toContain("reaches what §7.6 (b) keeps out of the client artifact");
      expect(errs(r)[0].message).toContain("`K`");
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
    expect(errs(r)[0].message).toContain("`ok()` → `key()`");
  }, 120000);

  test("the message names the chain the invariant reaches the server-only code through", async () => {
    const r0 = await result(srvProg(variants[0].fns, variants[0].inv, "srv(1)"));
    expect(errs(r0)[0].message).toContain("`key()` through `ok()` → `key()` (only server code reaches it");
    expect(errs(r0)[0].message).toContain("`K` through `ok()` → `key()` → `K`");
    const r = await result(srvProg(variants[1].fns, variants[1].inv, "srv(1)"));
    expect(errs(r)[0].message).toContain("`ok()` → `wrap()` → `key()` → `K`");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// L1 — ruling:user-voice-scrml.md-S483-invariant-const-fold: "any initializer the compiler folds to a value at compile
// time (+ - * … over literals and other such consts) is a compile-time constant".
// ---------------------------------------------------------------------------------------------------------------
const RANGE = `    <dateRange:struct>
        let <start:int=0/>
        let <end:int=10/>
    </>`;
const prog = (body) => `<program>\n${body}\n</program>\n`;

describe("L1 — foldable arithmetic over constants is a compile-time constant", () => {
  for (const [name, consts] of [
    ["`10 + 2`", "const LIM = 10 + 2;"],
    ["arithmetic over another constant", "const BASE = 10; const LIM = BASE * 2 - 1;"],
    ["a negated constant", "const NEG = -20; const LIM = -NEG;"],
    ["a ternary over constants", "const BIG = true; const LIM = BIG ? 30 : 3;"],
  ]) {
    test(`${name}: admitted`, async () => {
      const r = await result(prog(`    \${ ${consts} }\n${RANGE}\n    invariant (end - start <= LIM)\n    <main><p>\${@dateRange.start}</p></main>`));
      expect(codes(r)).toEqual([]);
    }, 120000);
  }

  test("a folded constant decides a lone literal write at compile time (E-WRITE-INVARIANT)", async () => {
    const r = await result(prog(`    \${ const BASE = 10; const LIM = BASE * 2 - 1; }\n${RANGE}\n    invariant (end <= LIM) [maxLen]\n    function f() { @dateRange.end = 30; }\n    <main><button onclick=f()>\${@dateRange.start}</button></main>`));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    expect(errs(r)[0].message).toContain("[maxLen]");
  }, 120000);

  test("a call is still not a constant: refused (E-DECL-INVARIANT-IMPURE)", async () => {
    const r = await result(prog(`    \${ fn three() -> int { return 3; } const LIM: int = three() + 1; }\n${RANGE}\n    invariant (end - start <= LIM)\n    <main><p>\${@dateRange.start}</p></main>`));
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toContain("not a compile-time constant");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// H3 — ruling:user-voice-scrml.md-S483-invariant-derived-split ("Split"): a field derived only from its sibling fields
// is checked at the source write (built); a field that tracks a cell or a live use-site value is E-CONTRACT-003,
// PERMANENT. The run-time traps: invariant-write-chromium-s483.browser.test.js (i08, i10).
// ---------------------------------------------------------------------------------------------------------------
describe("H3 — derived fields: built from siblings, refused when they track", () => {
  test("i08: a sibling-derived field — a write to a sibling carries the check, recomputing the field", async () => {
    const r = await result(prog(`    <w:struct>\n        let <a:int=0/>\n        let <b:int=5/>\n        <span:int=(b - a)/>\n    </>\n    invariant (span <= 10) [ab]\n    function setB(n: int) { @w.b = n; }\n    <main><p>\${@w.span}</p><button onclick=setB(20)>b</button></main>`));
    expect(codes(r)).toEqual([]);
    // the write to `b` is guarded; the check recomputes `span` from `a` and `b` on the candidate
    expect(r.client.js).toMatch(/\.fields\[1 \/\* b \*\/\]\.set\(rt\.invariantGuard\(w\$, \[\[1, \[\], "set", n\w*\]\], \[\[\[\], span\w* => span\w* <= 10, \["span"\], "<w>", "\[ab\]", \[\["span", \(b\w*, a\w*\) => b\w* - a\w*, \["b", "a"\]\]\]\]\]/);
  }, 120000);

  test("a chain of derived fields recomputes dependencies first", async () => {
    const r = await result(prog(`    <w:struct>\n        let <a:int=0/>\n        let <b:int=5/>\n        <span:int=(b - a)/>\n        <twice:int=(span * 2)/>\n    </>\n    invariant (twice <= 20)\n    function setA(n: int) { @w.a = n; }\n    <main><p>\${@w.twice}</p><button onclick=setA(-20)>a</button></main>`));
    expect(codes(r)).toEqual([]);
    expect(r.client.js).toMatch(/\[\["span", [^\]]*\["b", "a"\]\], \["twice", [^\]]*\["span"\]\]\]/);
  }, 120000);

  for (const [name, pre, field, code, msg] of [
    ["i02: a field derived from a cell", "    let <k:int=0/>\n", "<b:int=(@k)/>", "E-CONTRACT-003", "reads the cell `@k`"],
    ["a field derived from siblings and a cell", "    let <k:int=0/>\n", "<b:int=(a + @k)/>", "E-CONTRACT-003", "TRACKS"],
    ["a field derived through a `fn` that reads a cell", "    let <k:int=0/>\n    ${ fn lim(x: int) -> int { return x + @k; } }\n", "<b:int=(lim(a))/>", "E-CONTRACT-003", "calls `lim`"],
    ["a field derived through a host global", "", "<b:int=(Date.now())/>", "E-DECL-INVARIANT-IMPURE", "not a pure `fn`"],
  ]) {
    test(`${name}: ${code}`, async () => {
      const r = await result(prog(`${pre}    <w:struct>\n        let <a:int=0/>\n        ${field}\n    </>\n    invariant (a <= b) [ab]\n    <main><p>\${@w.a}</p></main>`));
      expect(codes(r)).toContain(code);
      const d = errs(r).find((x) => x.code === code);
      expect(d.message).toContain(msg);
      if (code === "E-CONTRACT-003") expect(d.message).toContain("PERMANENT");
    }, 120000);
  }

  test("a field derived from siblings and a compile-time constant: admitted", async () => {
    const r = await result(prog(`    \${ const PAD = 2; }\n    <w:struct>\n        let <a:int=0/>\n        let <b:int=5/>\n        <span:int=(b - a + PAD)/>\n    </>\n    invariant (span <= 10)\n    <main><p>\${@w.span}</p></main>`));
    expect(codes(r)).toEqual([]);
  }, 120000);

  const SLIDER = `    <slider min:int=0 max:int=100>\n        let <value:int=50/>\n    </> renders <b>\${value}</b>\n    invariant (min <= value && value <= max) [inRange]\n`;
  for (const [name, pre, use] of [
    ["i01: a locked attribute given a cell", "    let <k:int=0/>\n", "<slider min=(@k)/>"],
    ["i09: a locked attribute given a row binder", "    <xs:int[replace]=([10])/>\n", "<each in=(@xs) as=x><slider min=(x)/></each>"],
  ]) {
    test(`${name}: E-CONTRACT-003 at the use site (PERMANENT)`, async () => {
      const r = await result(prog(`${pre}${SLIDER}    <main>${use}</main>`));
      expect(codes(r)).toEqual(["E-CONTRACT-003"]);
      expect(errs(r)[0].message).toContain("TRACKS");
      expect(errs(r)[0].message).toContain("PERMANENT");
    }, 120000);
  }

  test("a locked attribute given a compile-time constant at a use site: admitted (the construction check holds it)", async () => {
    const r = await result(prog(`    \${ const LO = 10; }\n${SLIDER}    <main><slider min=(LO + 5)/></main>`));
    expect(codes(r)).toEqual([]);
  }, 120000);

  test("a use-site value given to a field the check recomputes: refused by name (INTERIM)", async () => {
    const r = await result(prog(`    <w:struct>\n        let <a:int=0/>\n        let <b:int=5/>\n        <span:int=(b - a)/>\n    </> renders <i>\${span}</i>\n    invariant (span <= 10)\n    <main><w span=3/></main>`));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("g-boot-invariant-derived-field-s483");
  }, 120000);
});
