// invariant-r2-s483.test.js — lane s483-invariant-2, fix round r2 (#2128 r1 re-review). SPEC §66.13.5 (7a, 7b),
// §6.14.2, §7.6 (b).
//
// RULED:
// - ruling:user-voice-scrml.md-S483-invariant-const-read — "admit a file-scope const whose initializer is a
//   compile-time constant (literals, enum variants, other such consts) and that is not server-only, directly and
//   through a fn chain. A `let`, a host-derived const, or a server-only const stays refused."
// - ruling:user-voice-scrml.md-S483-invariant-const-fold — "any initializer the compiler folds to a value at compile
//   time (+ - * … over literals and other such consts) is a compile-time constant".
// - ruling:user-voice-scrml.md-S483-invariant-derived-split — "a field that tracks a cell or a live use-site value
//   stays refused, PERMANENT, E-CONTRACT-003".
// - ruling:user-voice-scrml.md-S483-component-attr-server-only — "an attribute no client code reads gets an empty
//   client stand-in; its default never runs and its use-site value is never evaluated in the client".
// - prov=pa-ruled:S483-invariant-attr-server-only — an invariant reading a field whose value reaches server-only
//   code is refused by name (governing: S483-invariant-const-read + S483-component-attr-server-only).
//
// H2a–H2d: the printer's §7.6 (b) classification is run without the invariant checks and with them (print.scrml
// invLeakRefusal); what is server-only in the first and client-held in the second is refused — so every refused
// program below has the secret in no client file, and each one's no-invariant control compiles clean with the
// secret in no client file either.
//
// Shipping path (scripts/scrml-boot.ts compileSource → print.scrml); the run-time halves of H4 / H5 run in Chromium
// (compiler/tests/browser/invariant-write-chromium-s483.browser.test.js, "Chromium r2").

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-invariant-r2-")); });
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
// every client-side text of a compile result (the page and the client module)
const clientText = (r) => String(r.client?.html ?? "") + "\n" + String(r.client?.js ?? "");

const SRV = (ret) => `    function srv(id: int) -> string {
        const t = ?{\`SELECT 1 AS x WHERE \${id} = 1\`}.get() !{ _ :> { return ${ret}; } };
        return ${ret};
    }`;
const page = (decls, fields, inv) => `<program db="./app.db">
\${
${decls}
}
<tok:struct>
${fields}
</>
${inv}
let <out:string=""/>
<main><p>\${@tok.v}\${@out}</p><button onclick={ @out = srv(1) !{ .Transport(_) :> return }; }>b</button></main>
</program>
`;
const STR = `    let <v:string="a"/>`;
const INT = `    let <v:int=0/>`;

// each: the program with the invariant (refused), and its no-invariant control (clean); `secret` in no client file
const leaks = [
  // H2b n01: an unread constant whose initializer reaches server-only code (siRoots) reads K
  { id: "n01", secret: "zz-secret-n01", names: ["`K`"],
    src: (inv) => page(`    const K = "zz-secret-n01";\n    fn wrap(s: string) -> string { return s + "!"; }\n${SRV('wrap("a")')}\n    const J = wrap(K);`, STR, inv),
    inv: "invariant (v != K) [notKey]" },
  // H2a n02: a constant chain on the invariant side
  { id: "n02", secret: "zz-secret-n02", names: ["`L`", "`K` through `L` → `K`"],
    src: (inv) => page(`    const K = "zz-secret-n02";\n    const L = K;\n${SRV("K")}`, STR, inv),
    inv: "invariant (v != L) [notKey]" },
  // H2a n02b: the same through a `fn`
  { id: "n02b", secret: "zz-secret-n02b", names: ["`K` through `lim()` → `L` → `K`"],
    src: (inv) => page(`    const K = "zz-secret-n02b";\n    const L = K;\n    fn lim() -> string { return L; }\n${SRV("K")}`, STR, inv),
    inv: "invariant (v != lim()) [notKey]" },
  // H2a n51: a folded ternary over a server-only constant
  { id: "n51", secret: "zz-secret-n51", names: ["`L`", "`K` through `L` → `K`"],
    src: (inv) => page(`    const K = "zz-secret-n51";\n    const L = K == "q" ? 1 : 2;\n${SRV("K")}`, INT, inv),
    inv: "invariant (v != L) [notKey]" },
  // H2c n60: a sibling-derived field (rule 7b) reading a server-only constant
  { id: "n60", secret: "zz-secret-n60", names: ["`K`"],
    src: (inv) => page(`    const K = "zz-secret-n60";\n${SRV("K")}`, `${STR}\n    <tag:bool=(v != K)/>`, inv),
    inv: "invariant (tag) [notKey]" },
];

describe("H2a–H2c — an invariant never moves a server-only binding into the client (the printer's two runs)", () => {
  for (const c of leaks) {
    test(`${c.id}: refused by name, the secret in no client file; the no-invariant control is clean`, async () => {
      const r = await result(c.src(c.inv));
      expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
      const m = errs(r)[0].message;
      expect(m).toContain("the invariant [notKey] on <tok>");
      expect(m).toContain("reaches what §7.6 (b) keeps out of the client artifact");
      for (const nm of c.names) expect(m).toContain(nm);
      expect(clientText(r)).not.toContain(c.secret);
      const r2 = await result(c.src(""));
      expect(codes(r2)).toEqual([]);
      expect(clientText(r2)).not.toContain(c.secret);
      expect(JSON.stringify(r2.server ?? r2)).toContain(c.secret);
    }, 120000);
  }

  test("M1 (g-boot-invariant-const-client-read-s483, closed): a constant the client reads itself is admitted", async () => {
    // K is read by client code (the page) AND by server code AND by the invariant: the client holds it with or
    // without the invariant, so the invariant moves nothing (§7.6 (b): a binding the client reads is not server-only)
    const src = `<program db="./app.db">
\${
    const K = "zz-plain-m1";
${SRV("K")}
}
<tok:struct>
${STR}
</>
invariant (v != K) [notKey]
let <out:string=""/>
<main><p>\${@tok.v}\${@out}\${K}</p><button onclick={ @out = srv(1) !{ .Transport(_) :> return }; }>b</button></main>
</program>
`;
    const r = await result(src);
    expect(codes(r)).toEqual([]);
    expect(r.client.js).toContain("invariantGuard");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// H2d — a component attribute whose use-site value or default reaches server-only code (#2130 makes it a shell)
// ---------------------------------------------------------------------------------------------------------------
const attrProg = (secret, card, use, inv) => `\${
    const API_KEY: string = "${secret}";
}
<program db="./app.db">
\${
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${@out}</p>
${card}
${inv}
${use}
</program>
`;

describe("H2d — an invariant on a component attribute whose value reaches server-only code is refused", () => {
  for (const [id, card, use] of [
    ["m01 (use-site value)", `<card t:string="x"/> renders <b>x</b>`, `<card t=(API_KEY)/>`],
    ["m02 (default)", `<card t:string=(API_KEY)/> renders <b>x</b>`, `<card/>`],
  ]) {
    test(`${id}: refused naming the attribute and the secret; the control is clean, the secret in no client file`, async () => {
      const secret = "zz-sk-" + id.slice(0, 3);
      const r = await result(attrProg(secret, card, use, `invariant (t != "") [nonEmpty]`));
      expect(codes(r)).toEqual(["E-DECL-INVARIANT-IMPURE"]);
      const m = errs(r)[0].message;
      expect(m).toContain("the attribute `t` of `<card>`");
      expect(m).toContain("`API_KEY`");
      expect(m).toContain("Keep the secret off the field");
      expect(m).toContain("prov=pa-ruled:S483-invariant-attr-server-only");
      expect(clientText(r)).not.toContain(secret);
      const r2 = await result(attrProg(secret, card, use, ""));
      expect(codes(r2)).toEqual([]);
      expect(clientText(r2)).not.toContain(secret);
    }, 120000);
  }

  test("an invariant over ANOTHER field of the component does not move the server-only attribute (no over-refusal)", async () => {
    // the construction check reads `n` only (runtime invariantGuard builds its candidate from the fields it names),
    // so `t` stays a shell and API_KEY stays out of the client
    const r = await result(attrProg("zz-sk-p01", `<card t:string="x" n:int=1/> renders <b>\${n}</b>`, `<card t=(API_KEY) n=(2)/>`, `invariant (n >= 0) [nonNeg]`));
    expect(codes(r)).toEqual([]);
    expect(clientText(r)).not.toContain("zz-sk-p01");
    expect(r.client.js).toContain("invariantGuard");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// H4 / H5 — the whole depth (compile side; Chromium runs them)
// ---------------------------------------------------------------------------------------------------------------
describe("H4 / H5 — an enum payload, a tape, a struct field: checked at the whole depth", () => {
  test("H4: a persisted enum's payload carries its invariant check (`#V.n.name`)", async () => {
    const r = await result(`<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    type Slot:enum = { Empty, Held(r: Range) }
}
let <s:Slot=(.Empty) persist="local" key="app.s"/>
<main><p id="v">\${match @s { .Empty :> -1, .Held(r) :> r.lo }}</p></main>
</program>
`);
    expect(codes(r)).toEqual([]);
    const line = r.client.js.split("\n").find((l) => l.includes("rt.persisted("));
    expect(line).toContain(`[["#Held.0.r"], (lo, hi) => lo <= hi`);
  }, 120000);

  test("H5: a whole-value write of a tape of Range / a struct holding a Range judges the elements / the field", async () => {
    const r = await result(`<host src="./glue.js">
  mk() -> Range[replace]
  mk2() -> Outer
</host>
<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    type Outer:struct = { r: Range, n: int }
}
<rs:Range[replace]=([])/>
let <o:Outer=({ r: { lo: 1, hi: 2 }, n: 0 })/>
<main><p id="s">\${@rs.length}</p><button id="b" onclick={ @rs = mk(); }>b</button><button id="c" onclick={ @o = mk2(); }>c</button></main>
</program>
`, { "glue.js": "export function mk() { return []; }\nexport function mk2() { return { r: { lo: 1, hi: 2 }, n: 1 }; }\n" });
    expect(codes(r)).toEqual([]);
    expect(r.client.js).toContain(`[[["rs", "*"], (lo, hi) => lo <= hi`);
    expect(r.client.js).toContain(`[[["o", "r"], (lo, hi) => lo <= hi`);
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// M3 / L4 / L5
// ---------------------------------------------------------------------------------------------------------------
const W = (body, use) => `<program>
\${
${body}
}
<w:struct>
    let <a:int=0/>
    <b:int=5/>
</> renders <i class="sp">\${a}/\${b}</i>
invariant (b - a <= 5) [ab]
<main>${use}</main>
</program>
`;

describe("M3 — a use-site call is not a tracking value", () => {
  test("a call of a pure `fn` of compile-time constants is admitted (it never changes)", async () => {
    const r = await result(W("    fn dbl(x: int) -> int { return x * 2; }", "<w b=(dbl(2))/>"));
    expect(codes(r)).toEqual([]);
    expect(r.client.js).toContain("dbl(2)");
  }, 120000);

  test("a call of a `function`: refused INTERIM (E-BOOTSTRAP-UNSUPPORTED, the gap named), not PERMANENT", async () => {
    const r = await result(W("    function seed(x: int) -> int { return x * 2; }", "<w b=(seed(2))/>"));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const m = errs(r)[0].message;
    expect(m).toContain("INTERIM, g-boot-invariant-derived-field-s483");
    expect(m).not.toContain("PERMANENT");
  }, 120000);
});

describe("L4 — string `+` folds (ruling S483-invariant-const-fold)", () => {
  const S = (write) => `<program>
\${
    const P = "ab" + "c";
    const Q = P + "-x";
}
<tok:struct>
    let <v:string="a"/>
</>
invariant (v != Q) [x]
<main><p id="v">\${@tok.v}</p><button id="b" onclick={ @tok.v = "${write}"; }>b</button></main>
</program>
`;
  test("a constant built by string `+` is a compile-time constant an invariant may read", async () => {
    const r = await result(S("zz"));
    expect(codes(r)).toEqual([]);
  }, 120000);
  test("and a literal write it decides is E-WRITE-INVARIANT", async () => {
    const r = await result(S("abc-x"));
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
  }, 120000);
});

describe("L5 — a literal use that provably breaks an invariant over a derived field", () => {
  test("is E-WRITE-INVARIANT at compile time (the derived field recomputed from the folded values)", async () => {
    const r = await result(`<program>
<w:struct>
    let <a:int=0/>
    let <b:int=5/>
    <span:int=(b - a)/>
</> renders <i class="sp">\${a}/\${b}/\${span}</i>
invariant (span <= 5) [ab]
<main><w b=(9)/><w a=(1) b=(3)/></main>
</program>
`);
    expect(codes(r)).toEqual(["E-WRITE-INVARIANT"]);
    expect(errs(r)[0].message).toContain("span = 9");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------------------
// item 8 (cross-lane with #2129, ruling:user-voice-scrml.md-S482-trapping-construct-init — INTERIM refusal of an
// initializer inside a construct that can trap): a construction of an invariant-bearing value the compiler does not
// decide can trap (E-WRITE-INVARIANT-RT), so such an initializer inside a construct is E-FILE-SCOPE-INIT-IN-CONSTRUCT;
// a decided one (an all-literal value its invariant folds to true) is accepted.
// ---------------------------------------------------------------------------------------------------------------
describe("item 8 — a construction that can trap, in an initializer inside a construct", () => {
  const T = (init) => `<program>
\${
    type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]
    const items: int[] = [];
}
<p id="a" if=(items.length > 0)>\${ ${init} }\${r.lo}</p>
<p id="z">end</p>
</program>
`;
  test("an undecided construction is refused (E-FILE-SCOPE-INIT-IN-CONSTRUCT, naming the invariant trap)", async () => {
    const r = await result(T("const r: Range = { lo: items.length, hi: 0 };"));
    expect(codes(r)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(errs(r)[0].message).toContain("constructs a value of `Range`");
  }, 120000);
  test("a decided construction (all literals, the invariant folds to true) is accepted", async () => {
    const r = await result(T("const r: Range = { lo: 1, hi: 2 };"));
    expect(codes(r)).toEqual([]);
  }, 120000);
});
