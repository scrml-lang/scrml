// match-alternation-s482.test.js — lane s482-match-alternation: the bootstrap builds `|` arm-pattern
// alternation (gap g-boot-match-alternation-unbuilt-s482).
//
// SPEC §18.2: "An arm pattern MAY list several alternates separated by `|` (`.B | .C :> r`,
// `"a" | "b" :> r`, `1 | 2 :> r` — the §51.0.J `derived=match` form), at ANY arm position. An
// alternation containing a wildcard alternate (`_` / `else`) is the wildcard arm. The alternates of
// one arm SHALL NOT carry payload patterns — a binding (`.P(a: x) | .Q(a: x) :> x`), a NAMED field
// even when discarded (`.P(a: _) | .Q(a: _)`), or a nested / literal pattern — each SHALL produce
// **E-MATCH-ALT-BINDING** (§34). Only POSITIONAL `_` discards (`.P(_) | .Q(_) :> r`) are permitted."
// §19.4.5: a `!{}` arm's "alternation and E-MATCH-ALT-BINDING … SHALL apply to a `!{}` arm unchanged".
// §7.2.2 rule 4: a line break in an arm head is whitespace.
//
// Built as `APat.PAlt(alts)` (ast.scrml) — one arm, one body, its alternates the arm's cases:
// analyze judges each alternate as the arm with that one pattern would be (unknown variant,
// qualifier, §18.7 arity of `_` discards, literal kind), counts each for exhaustiveness (E-TYPE-020 /
// E-TYPE-080 over the union), and reports an alternate naming a case already taken (E-TYPE-023);
// lower makes ONE Core pattern (`Pattern.PAlt`), printed as the alternates' tests joined by `||`.
//
// Red on base ce6d500b0: every alternation head was E-PARSE-ARM "alternation `|` between patterns …
// is not yet supported in the bootstrap" (plus an E-TYPE-020 cascade), so nothing below compiled; the
// payload cases reported E-PARSE-ARM / the named-binding refusal, never E-MATCH-ALT-BINDING.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let mods;
let dir;
beforeAll(() => {
  ({ mods } = loadM2());
  dir = mkdtempSync(join(tmpdir(), "s482-match-alternation-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const allDiags = (src) => frontEnd(mods, [{ path: "s.scrml", src }]).diags;
const codes = (src) => allDiags(src).filter((d) => d.severity === "Error").map((d) => d.code);
const allCodes = (src) => allDiags(src).map((d) => d.code);
const errorsOf = (src) => allDiags(src).filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const clean = (src) => expect(errorsOf(src)).toEqual([]);

const prog = (decls) => `<program>\n\${\n${decls}\n}\n</program>\n`;

const TYPES = `    type K:enum = { A, B, C, D }
    type P:enum = { Q(a: int), R(a: int, b: int), S }
    type E:enum = { NotFound, Timeout(ms: int), Denied }
    fn risky(i: int)! E {
        if (i == 0) fail E.NotFound;
        if (i == 1) fail E.Timeout(5);
        if (i == 2) fail E.Denied;
        return i;
    }
`;

let n = 0;
async function run(src, ids) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const out = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(out.body.querySelector("#" + id)?.textContent ?? "<none>").trim());
}

describe("alternation runs — one test per alternate, every literal kind and position", () => {
  test("enum variants, `_` discards, strings, numbers, a wildcard alternate, `!{}`, `not`, statement form", async () => {
    const src = `<program>
\${
${TYPES}
    fn f(k: K) -> string {
        return match k {
            .A | .B :> "ab",
            .C |
            .D :> "cd",
        };
    }
    fn g(p: P) -> string {
        return match p {
            .S :> "s",
            .Q(_) | .R(_, _) :> "qr",
        };
    }
    fn h(s: string) -> int {
        return match s {
            "a" | "b" :> 1,
            "c" :> 2,
            else :> 0,
        };
    }
    fn nm(x: int) -> string {
        return match x {
            1 | 2 | -3 :> "small",
            else :> "other",
        };
    }
    fn w(k: K) -> string {
        return match k {
            .A :> "a",
            .B | _ :> "rest",
        };
    }
    fn hd(i: int) -> string {
        let out: string = "ok";
        risky(i) !{
            .NotFound | .Denied :> { out = "nd"; },
            .Timeout(_) :> { out = "t"; },
        };
        return out;
    }
    fn mo(k: K | not) -> string {
        return match k {
            .A | not :> "a-or-none",
            else :> "other",
        };
    }
    fn st(k: K) -> string {
        let r: string = "";
        match k {
            .A | .C :> { r = "ac"; },
            .B
            | .D :> { r = "bd"; },
        }
        return r;
    }
    fn q(k: K) -> int {
        return match k {
            K.A | K::B :> 1,
            .C | .D :> 2,
        };
    }
    fn bo(b: boolean) -> string {
        return match b {
            true | false :> "either",
        };
    }
    fn fm(i: int) -> string {
        return match risky(i) {
            .Ok(v) :> "ok",
            .NotFound | .Timeout(_) :> "nf-or-t",
            .Denied :> "d",
        };
    }
}
<p id="a">\${f(K.A)} \${f(K.B)} \${f(K.C)} \${f(K.D)}</p>
<p id="b">\${g(P.Q(1))} \${g(P.R(1, 2))} \${g(P.S)}</p>
<p id="c">\${h("a")} \${h("b")} \${h("c")} \${h("z")}</p>
<p id="d">\${nm(1)} \${nm(2)} \${nm(-3)} \${nm(3)}</p>
<p id="e">\${w(K.A)} \${w(K.B)} \${w(K.D)}</p>
<p id="f">\${hd(0)} \${hd(1)} \${hd(2)} \${hd(3)}</p>
<p id="g">\${mo(K.A)} \${mo(not)} \${mo(K.B)}</p>
<p id="h">\${st(K.A)} \${st(K.B)} \${st(K.C)} \${st(K.D)}</p>
<p id="i">\${q(K.A)} \${q(K.B)} \${q(K.C)} \${q(K.D)}</p>
<p id="j">\${bo(true)} \${bo(false)}</p>
<p id="k">\${fm(0)} \${fm(1)} \${fm(2)} \${fm(3)}</p>
</program>
`;
    expect(await run(src, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"])).toEqual([
      "ab ab cd cd",
      "qr qr s",
      "1 1 2 0",
      "small small small other",
      "a rest rest",
      "nd t nd ok",
      "a-or-none a-or-none other",
      "ac bd ac bd",
      "1 1 2 2",
      "either either",
      "nf-or-t nf-or-t d ok",
    ]);
  }, 120000);
});

describe("exhaustiveness is over the union of the alternates (§18.8.1, §19.7)", () => {
  test("the alternates cover the enum: clean, no wildcard needed", () => {
    clean(prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | .B :> 1,\n            .C | .D :> 2,\n        };\n    }`));
  });

  test("a variant no alternate names is E-TYPE-020, naming only it", () => {
    const ds = allDiags(prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | .B :> 1,\n            .C :> 2,\n        };\n    }`));
    const errs = ds.filter((d) => d.severity === "Error");
    expect(errs.map((d) => d.code)).toEqual(["E-TYPE-020"]);
    expect(errs[0].message).toContain("does not cover .D");
    expect(errs[0].message).not.toContain(".B");
  });

  test("a `!{}` whose alternates miss a variant is E-TYPE-080", () => {
    const src = prog(TYPES + `    fn f() {\n        risky(1) !{\n            .NotFound | .Denied :> { },\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-080"]);
  });

  test("a `!{}` whose alternates cover every variant is clean", () => {
    clean(prog(TYPES + `    fn f() {\n        risky(1) !{\n            .NotFound | .Denied | .Timeout(_) :> { },\n        };\n    }`));
  });

  test("bool: `true | false` is exhaustive; `true` alone is W-MATCH-002", () => {
    const both = prog(`    fn f(b: boolean) -> int {\n        return match b {\n            true | false :> 1,\n        };\n    }`);
    clean(both);
    expect(allCodes(both)).not.toContain("W-MATCH-002");
    expect(allCodes(prog(`    fn f(b: boolean) -> int | not {\n        return match b {\n            true :> 1,\n        };\n    }`))).toContain("W-MATCH-002");
  });
});

describe("E-MATCH-ALT-BINDING — an alternate carries no payload pattern (§18.2), one report per arm", () => {
  const bad = (head) => prog(TYPES + `    fn f(p: P) -> int {\n        return match p {\n            ${head} :> 1,\n            else :> 0,\n        };\n    }`);

  test("a binding in every alternate (`.Q(x) | .R(x, y)`) — no E-SCOPE-001 for the body's use of it", () => {
    const src = prog(TYPES + `    fn f(p: P) -> int {\n        return match p {\n            .Q(x) | .R(x, y) :> x,\n            .S :> 0,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("a binding in one alternate only (`.Q(x) | .S`)", () => {
    expect(codes(bad(".Q(x) | .S"))).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("a NAMED field even when discarded (`.Q(a: _) | .R(a: _, b: _)`) — not the named-binding refusal", () => {
    expect(codes(bad(".Q(a: _) | .R(a: _, b: _)"))).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("a literal / nested pattern in the payload (`.Q(1) | .S`)", () => {
    expect(codes(bad(".Q(1) | .S"))).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("a later alternate (`.S | .Q(x)`), at the offending alternate", () => {
    const src = bad(".S | .Q(x)");
    const errs = allDiags(src).filter((d) => d.severity === "Error");
    expect(errs.map((d) => d.code)).toEqual(["E-MATCH-ALT-BINDING"]);
    expect(src.slice(errs[0].span.start, errs[0].span.start + 2)).toBe(".Q");
  });

  test("the whole-error binder in a `!{}` alternation (`.NotFound | _ e`)", () => {
    const src = prog(TYPES + `    fn f() {\n        risky(1) !{\n            .Denied :> { },\n            .NotFound | _ e :> { },\n        };\n    }`);
    expect(codes(src)).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("the legacy paren-free binder in a `!{}` alternation (`| .Timeout ms | .Denied`)", () => {
    const src = prog(TYPES + `    fn f() {\n        risky(1) !{\n            | .Timeout ms | .Denied :> { },\n            | .NotFound :> { },\n        };\n    }`);
    expect(codes(src)).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("POSITIONAL `_` discards are permitted, held to §18.7's arity (E-TYPE-021)", () => {
    clean(bad(".Q(_) | .R(_, _)"));
    expect(codes(bad(".Q(_) | .R(_)"))).toEqual(["E-TYPE-021"]);
  });
});

describe("unreachable / misplaced alternates", () => {
  test("an alternate naming a variant an earlier arm takes is E-TYPE-023", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A :> 1,\n            .A | .B :> 2,\n            .C | .D :> 3,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-023"]);
  });

  test("a variant repeated inside one alternation is E-TYPE-023", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | .B | .A :> 1,\n            .C | .D :> 3,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-023"]);
  });

  test("a repeated literal alternate is E-TYPE-023", () => {
    const src = prog(`    fn f(s: string) -> int {\n        return match s {\n            "a" | "b" :> 1,\n            "b" | "c" :> 2,\n            else :> 0,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-023"]);
  });

  test("a `!{}` alternate repeating a handled variant is E-TYPE-023", () => {
    const src = prog(TYPES + `    fn f() {\n        risky(1) !{\n            .Denied :> { },\n            .NotFound | .Denied :> { },\n            .Timeout(_) :> { },\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-023"]);
  });

  test("an alternation holding a wildcard alternate IS the wildcard arm: not last is E-SYNTAX-010", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | _ :> 1,\n            .B :> 2,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-SYNTAX-010"]);
  });

  test("… and after full coverage a plain `else` is W-MATCH-001; a redundant alternate there is E-TYPE-023", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | .B :> 1,\n            .C | .D :> 2,\n            else :> 3,\n        };\n    }`);
    expect(codes(src)).toEqual([]);
    expect(allCodes(src)).toContain("W-MATCH-001");
    // s482-alt-followups (INFO-1): the `.A` alternate of a wildcard alternation names a case an
    // earlier arm takes — §18.14.2 E-TYPE-023, as for `.A | .C` (was: W-MATCH-001 only)
    const red = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | .B :> 1,\n            .C | .D :> 2,\n            .A | else :> 3,\n        };\n    }`);
    expect(codes(red)).toEqual(["E-TYPE-023"]);
  });

  test("on a failable result the wildcard alternation is the `else` (`.Ok` only): an error it would take is E-MATCH-ELSE-ABSORBS-ERROR", () => {
    const src = prog(TYPES + `    fn f(i: int) -> string {\n        return match risky(i) {\n            .Ok(v) :> "ok",\n            .NotFound | _ :> "x",\n        };\n    }`);
    expect(codes(src)).toEqual(["E-MATCH-ELSE-ABSORBS-ERROR"]);
  });

  test("`.Ok` as an alternate on a failable result is refused by name (INTERIM)", () => {
    const src = prog(TYPES + `    fn f(i: int) -> string {\n        return match risky(i) {\n            .Ok(_) | .NotFound :> "x",\n            .Timeout(_) | .Denied :> "y",\n        };\n    }`);
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

describe("each alternate is judged as its own arm would be", () => {
  test("an unknown variant alternate is E-TYPE-VARIANT (no E-TYPE-020 cascade for the alternates that resolved)", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | .Zed :> 1,\n            .B | .C | .D :> 2,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-VARIANT"]);
  });

  test("a qualified alternate naming another enum is E-TYPE-VARIANT", () => {
    const src = prog(TYPES + `    type Z:enum = { A, B }\n    fn f(k: K) -> int {\n        return match k {\n            Z.A | .B :> 1,\n            .C | .D :> 2,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-VARIANT"]);
  });

  test("a literal alternate over an enum is E-TYPE-028", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | "b" :> 1,\n            else :> 2,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-028"]);
  });

  test("`not` / a literal alternate on a failable result is E-TYPE-VARIANT", () => {
    const src = prog(TYPES + `    fn f() {\n        risky(1) !{\n            .NotFound | not :> { },\n            _ :> { },\n        };\n    }`);
    expect(codes(src)).toEqual(["E-TYPE-VARIANT"]);
  });
});

describe("the head: line breaks, guards, the legacy `!{}` lead", () => {
  test("a head over three lines, comments between them, CRLF — clean", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A | // the first\n                .B | /* then */\n                .C :> 1,\n            .D :> 2,\n        };\n    }`);
    clean(src);
    clean(src.replace(/\n/g, "\r\n"));
  });

  test("a `|` that begins the next line continues the head (§7.2.2 rule 4)", () => {
    clean(prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            .A\n            | .B :> 1,\n            .C | .D :> 2,\n        };\n    }`));
  });

  test("a `|` followed by a non-pattern after the alternation is still the §18.10 guard, E-SYNTAX-011", () => {
    const src = prog(`    type Role:enum = { Admin, Editor, Viewer }\n    type Post:struct = { role: Role, active: boolean }\n    fn label(p: Post) -> string {\n        return match p.role {\n            .Admin | .Editor | p.active :> "staff",\n            .Viewer :> "viewer",\n        };\n    }`);
    expect(codes(src)).toEqual(["E-SYNTAX-011"]);
  });

  test("a legacy `|`-led `!{}` arm with alternates is one arm (W-ARM-PIPE-LEGACY, no error)", () => {
    const src = prog(TYPES + `    fn f() {\n        risky(1) !{\n            | .NotFound | .Denied :> { },\n            | .Timeout(_) :> { },\n        };\n    }`);
    expect(codes(src)).toEqual([]);
    expect(allCodes(src)).toContain("W-ARM-PIPE-LEGACY");
  });

  test("a `match` arm still takes no leading `|` (E-PARSE-ARM), alternates or not", () => {
    const src = prog(TYPES + `    fn f(k: K) -> int {\n        return match k {\n            | .A | .B :> 1,\n            .C | .D :> 2,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-PARSE-ARM"]);
  });
});
