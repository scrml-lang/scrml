// invariant-r3-s483.test.js — lane s483-invariant-2, fix round r3 (#2128 r2 re-review). SPEC §66.13.5 (7a, 7b,
// rule 10, "When it is checked"), §7.6 (b), §19.17, §48.
//
// RULED:
// - ruling:user-voice-scrml.md-S482-write-only-secret — a cell client code only ever writes WHOLE stays a shell
//   (#2113: a whole write is not a read).
// - ruling:user-voice-scrml.md-S483-invariant-const-read — "a server-only const stays refused".
// - ruling:user-voice-scrml.md-S483-invariant-derived-split — "a field that tracks a cell or a live use-site value
//   stays refused, PERMANENT, E-CONTRACT-003".
// - ruling:user-voice-scrml.md-S483-unread-trapping-init-runs; ruling:user-voice-scrml.md-S482-trapping-construct-init
//   (an initializer inside a construct that can trap is refused, E-FILE-SCOPE-INIT-IN-CONSTRUCT).
//
// H6: a guarded WHOLE write of a write-only cell whose seed reaches a secret — the guard does not read the field it
// overwrites (runtime invariantGuard: no peek; print.scrml invGuardFields `whole`), and the "without invariants" run
// lowers every check as the plain write it replaces (invStripProgram / sivPrim). The cell stays a shell, the secret
// stays out of every client file, and the write is still checked (Chromium: invariant-write-chromium-s483 "r3").
// H7: a use-site call is admitted only when nothing it calls, at any depth, reads something live (invLiveFns).
// M8: a local's part write's check is a trap site (analyze invPartWriteTrapWhat).
// L9: a host function's return is checked where it is returned (lower hostReturnChecked).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-invariant-r3-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let k = 0;
async function result(src, extra = {}) {
  const d = join(dir, `p${k++}`);
  mkdirSync(d);
  const file = join(d, "main.scrml");
  writeFileSync(file, src);
  for (const [f, text] of Object.entries(extra)) writeFileSync(join(d, f), text);
  return await compileSource(file);
}
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error");
const codes = (r) => errs(r).map((d) => d.code);
const clientText = (r) => String(r.client?.html ?? "") + "\n" + String(r.client?.js ?? "");

// a page whose server function reads API_KEY (so API_KEY is server-only), a cell / field seeded from it that client
// code only WRITES whole (`wr`), with the invariant (`inv`) or without it
const secretPage = (secret, decls, cells, wr, inv) => `\${
    const API_KEY: string = "${secret}";
}
<program db="./app.db">
\${
    type Row:struct = { name: string }
    type Tok:struct = { v: string }${inv ? ' invariant (v != "") [nonEmpty]' : ""}
${decls}
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
${cells}
<main>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p>
<button id="b" onclick={ ${wr} }>w</button>
</main>
</program>
`;

const H6 = [
  // w1: a body cell of an invariant-bearing type, written whole
  { id: "w1 body cell", decls: "", cells: `let <tk:Tok=({ v: API_KEY })/>`, wr: "@tk = { v: @out };" },
  // w3: a component's cell, its declaration invariant (inv: `<widget>`'s own)
  { id: "w3 component cell", decls: "", cells: (inv) => `<widget:struct>\n    let <tk:string=(API_KEY)/>\n</> renders <i>w</i>\n${inv ? 'invariant (tk != "") [nonEmpty]' : ""}\n<widget/>`, wr: "@widget.tk = @out;" },
  // w4: a struct declaration's field
  { id: "w4 struct declaration field", decls: "", cells: (inv) => `<tok:struct>\n    let <v:string=(API_KEY)/>\n</>\n${inv ? 'invariant (v != "") [nonEmpty]' : ""}`, wr: "@tok.v = @out;" },
  // x2: a server function's return written whole
  { id: "x2 server return", decls: `    function mk(id: int) -> Tok {
        const q = ?{\`SELECT b AS v WHERE \${id} = 1\`}.get() !{ _ :> { const z: Tok = { v: "c" }; return z; } };
        return q;
    }`, cells: `let <tk:Tok=({ v: API_KEY })/>`, wr: "@tk = mk(1) !{ .Transport(_) :> return };" },
];

describe("H6 — a guarded whole write of a write-only cell keeps it a shell: no secret in the client, the write still checked", () => {
  for (const c of H6) {
    test(`${c.id}: clean, the secret in no client file, the guard printed, the seed a shell; the control too`, async () => {
      const secret = "zz-sk-r3-" + c.id.split(" ")[0];
      const cells = typeof c.cells === "function" ? c.cells(true) : c.cells;
      const r = await result(secretPage(secret, c.decls, cells, c.wr, true));
      expect(codes(r)).toEqual([]);
      expect(clientText(r)).not.toContain(secret);
      expect(r.client.js).toContain("rt.invariantGuard(");
      expect(r.client.js).toContain("rt.seeded(() => null)");
      const cells0 = typeof c.cells === "function" ? c.cells(false) : c.cells;
      const r2 = await result(secretPage(secret, c.decls, cells0, c.wr, false));
      expect(codes(r2)).toEqual([]);
      expect(clientText(r2)).not.toContain(secret);
    }, 120000);
  }

  test("w6: the cell declared before <main> — clean, no leak", async () => {
    const src = secretPage("zz-sk-r3-w6", "", "", "@tk = { v: @out };", true).replace("let <out:string=\"\"/>", "let <tk:Tok=({ v: API_KEY })/>\nlet <out:string=\"\"/>");
    const r = await result(src);
    expect(codes(r)).toEqual([]);
    expect(clientText(r)).not.toContain("zz-sk-r3-w6");
    expect(r.client.js).toContain("rt.invariantGuard(");
  }, 120000);

  test("a PART write still reads the field (its candidate is the old value with the part written) — as without the invariant", async () => {
    // w2: `@tk.v = @out` reads `tk` on base too (§66.10: a part write copies the old value), so the seed is held
    // with or without the invariant — the invariant adds nothing to the client
    const r = await result(secretPage("zz-sk-r3-w2", "", `let <tk:Tok=({ v: API_KEY })/>`, "@tk.v = @out;", true));
    const r2 = await result(secretPage("zz-sk-r3-w2", "", `let <tk:Tok=({ v: API_KEY })/>`, "@tk.v = @out;", false));
    expect(codes(r)).toEqual([]);
    expect(clientText(r).includes("zz-sk-r3-w2")).toBe(clientText(r2).includes("zz-sk-r3-w2"));
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// H7 — a use-site call is admitted only when nothing it calls reads something live
// ---------------------------------------------------------------------------------------------------------------
const W = `<w:struct>
    let <a:int=0/>
    <b:int=5/>
</> renders <i id="sp">\${a}/\${b}</i>
invariant (b - a <= 5) [ab]`;
const useProg = (decls, cells, handler) => `<program>
\${
${decls}
}
${cells}
${W}
<main><w b=(dbl(2))/>${handler}</main>
</program>
`;

describe("H7 — a use-site call that reads something live, at any depth, TRACKS it: E-CONTRACT-003 (PERMANENT)", () => {
  for (const [id, decls, cells, handler, what] of [
    ["a `fn` reading a cell (m3cell)", "    fn dbl(x: int) -> int { return x * @k; }", "let <k:int=2/>", `<button onclick={ @k = 9; }>k</button>`, "reads the cell `@k`"],
    ["through a second `fn`", "    fn k2() -> int { return @k; }\n    fn dbl(x: int) -> int { return x * k2(); }", "let <k:int=2/>", `<button onclick={ @k = 9; }>k</button>`, "(through `dbl` → `k2`)"],
    ["a `fn` reading a file-scope `let` a handler writes", "    let lim: int = 2;\n    fn dbl(x: int) -> int { return x * lim; }\n    function bump() { lim = 9; }", "", `<button onclick=bump()>k</button>`, "reads the mutable binding `lim`"],
    ["a `function` reading a cell", "    function dbl(x: int) -> int { return x * @k; }", "let <k:int=2/>", `<button onclick={ @k = 9; }>k</button>`, "reads the cell `@k`"],
  ]) {
    test(id, async () => {
      const r = await result(useProg(decls, cells, handler));
      expect(codes(r)).toEqual(["E-CONTRACT-003"]);
      const m = errs(r)[0].message;
      expect(m).toContain("a locked field this use gives a call of `dbl`");
      expect(m).toContain(what);
      expect(m).toContain("S483-invariant-derived-split");
    }, 120000);
  }

  test("a call of a `fn` or a `function` that reads only its arguments and compile-time constants is admitted, checked at construction", async () => {
    const r = await result(useProg("    const TWO = 2;\n    fn dbl(x: int) -> int { return x * TWO; }", "", ""));
    expect(codes(r)).toEqual([]);
    expect(r.client.js).toContain("rt.invariantGuard(");
    const r2 = await result(useProg("    function dbl(x: int) -> int { return x * 2; }", "", ""));
    expect(codes(r2)).toEqual([]);
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// M8 — every check site lower emits is a trap site (cross-lane #2129)
// ---------------------------------------------------------------------------------------------------------------
describe("M8 — a local's part write inside a function an initializer in `if=` content calls can trap: refused", () => {
  const src = (wrap) => `<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    fn f(k: int) -> int { let r: Range = { lo: 1, hi: 2 }; r.lo = k; return r.lo; }
}
let <k:int=9/>
<main>${wrap(`\${ const z: int = f(9); }<p id="z">\${z}</p>`)}<p id="k">\${@k}</p></main>
</program>
`;
  test("inside `if=` content: E-FILE-SCOPE-INIT-IN-CONSTRUCT naming the part write", async () => {
    const r = await result(src((x) => `<div if=(@k > 100)>${x}</div>`));
    expect(codes(r)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(errs(r)[0].message).toContain("writes a part of `r`, a value whose type has invariants");
  }, 120000);

  test("outside a construct: accepted, the part write checked when it runs", async () => {
    const r = await result(src((x) => x));
    expect(codes(r)).toEqual([]);
    expect(r.client.js).toContain("rt.invariantValue(");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// L9 — a host function's return is checked where it is returned
// ---------------------------------------------------------------------------------------------------------------
describe("L9 — a host function's return value is checked at its whole depth where it is returned", () => {
  test("held in a local, built into a construction, written: each call's value is checked", async () => {
    const r = await result(`<host src="./glue.js">
  mk2() -> Outer
</host>
<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    type Outer:struct = { r: Range, n: int }
    type Box:struct = { o: Outer }
}
let <out:int=0/>
<main><p id="s">\${@out}</p>
<button id="b" onclick={ const x: Outer = mk2(); @out = x.r.lo; }>b</button>
<button id="c" onclick={ const y: Box = { o: mk2() }; @out = y.o.r.lo; }>c</button></main>
</program>
`, { "glue.js": "export function mk2() { return { r: { lo: 9, hi: 3 }, n: 1 }; }\n" });
    expect(codes(r)).toEqual([]);
    const hits = r.client.js.split("\n").filter((l) => l.includes("rt.invariantValue(null, [], \"set\", mk2()"));
    expect(hits.length).toBe(2);
    for (const l of hits) expect(l).toContain("[\"r\"]");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// nit — a library type's invariant is named at its declaration (lib.scrml), the write site secondary
// ---------------------------------------------------------------------------------------------------------------
describe("nit — an invariant declared in another file is named where it is declared", () => {
  test("the refusal names `lib.scrml:N`, the write site after it; the run-time trap's owner too", async () => {
    const lib = `\${
    const K = "zz-secret-r3-lib";
    export fn key() -> string { return K; }
    export type Tok:struct = { v: string } invariant (v != K) [notKey]
}
`;
    const main = `<program db="./app.db">
\${
    import { key, Tok } from "./lib.scrml";
    function srv(id: int) -> string {
        const q = ?{\`SELECT 1 AS x WHERE \${id} = 1\`}.get() !{ _ :> { return key(); } };
        return key();
    }
}
let <t:Tok=({ v: "a" })/>
let <out:string=""/>
<main><p>\${@t.v}\${@out}</p><button onclick={ @out = srv(1) !{ .Transport(_) :> return }; }>b</button>
<button onclick={ @t.v = @out; }>w</button></main>
</program>
`;
    const r = await result(main, { "lib.scrml": lib });
    expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
    expect(errs(r)[0].message).toMatch(/the invariant \[notKey\] on type Tok \(lib\.scrml:4; written at main\.scrml:\d+\)/);
    expect(clientText(r)).not.toContain("zz-secret-r3-lib");
  }, 120000);
});
