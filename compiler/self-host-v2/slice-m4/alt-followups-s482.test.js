// alt-followups-s482.test.js — lane s482-alt-followups: the LOW / INFO findings of the #2072
// (`|` arm-pattern alternation, §18.2) review.
//
// LOW-1 — §18.2: "An alternation containing a wildcard alternate (`_` / `else`) is the wildcard
// arm." §19.7.3: "In a `match` on a failable result, a plain `_` / `else` arm SHALL cover `.Ok`
// only; the error variants SHALL be covered by arms that name them or by `_ e :>` (§18.6.1), and a
// `_` / `else` that would take one is E-MATCH-ELSE-ABSORBS-ERROR (PERMANENT — security)." So in
// `.Denied | else :> …` the `.Denied` alternate is an arm that names `.Denied` (it runs that body),
// and only an error variant NO arm names is refused. Red on base 4ec3e30c0: every such program was
// E-MATCH-ELSE-ABSORBS-ERROR naming the very variant the arm lists.
// LOW-2 — `.NotFound | _ e` reports E-MATCH-ALT-BINDING once; base added an
// E-MATCH-ELSE-ABSORBS-ERROR judged on the parser's recovery rewrite (`_ e` → `_`).
// LOW-3 — §18.10 (amended S478): "The compiler SHALL also emit E-SYNTAX-011 when a `|` after an arm
// pattern is followed by something that is not a pattern". `1 | 2 + 3 :>` is that; base gave six
// errors (E-PARSE-ARM ×2, E-PARSE-EXPR, E-MATCH-ARM-SEPARATOR, E-SYNTAX-010 ×2) and no E-SYNTAX-011.
// INFO-1 — §18.14.2: "The second … arm is unreachable. This SHALL be a compile error (E-TYPE-023:
// duplicate match arm)"; §18.2's status note: "an alternate naming a case an earlier arm or alternate
// takes is E-TYPE-023". Base skipped the check for a WILDCARD alternation (`.B :> …, .B | _ :> …`).

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
  dir = mkdtempSync(join(tmpdir(), "s482-alt-followups-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const allDiags = (src) => frontEnd(mods, [{ path: "s.scrml", src }]).diags;
const errs = (src) => allDiags(src).filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code);
const allCodes = (src) => allDiags(src).map((d) => d.code);

const TYPES = `    type K:enum = { A, B, C, D }
    type E:enum = { NotFound, Timeout(ms: int), Denied }
    fn risky(i: int)! E {
        if (i == 0) fail E.NotFound;
        if (i == 1) fail E.Timeout(5);
        if (i == 2) fail E.Denied;
        return i;
    }
`;
const prog = (decls, body = "") => `<program>\n\${\n${TYPES}${decls}\n}\n${body}</program>\n`;
const list = (arms) => arms.map((a) => "            " + a + ",").join("\n");
// a failable `match` in value position
const fm = (arms) => `    fn f(i: int) -> string {\n        return match risky(i) {\n${list(arms)}\n        };\n    }\n`;
// a failable `match` as a statement
const fms = (arms) => `    fn f(i: int) -> string {\n        let out: string = "?";\n        match risky(i) {\n${list(arms)}\n        }\n        return out;\n    }\n`;
// a `!{}` handler
const hd = (arms) => `    fn f(i: int) -> string {\n        let out: string = "ok";\n        risky(i) !{\n${list(arms)}\n        };\n        return out;\n    }\n`;
// a plain enum `match`
const pm = (arms) => `    fn f(x: K) -> string {\n        return match x {\n${list(arms)}\n        };\n    }\n`;
// a literal `match`
const lm = (ty, arms) => `    fn f(x: ${ty}) -> string {\n        return match x {\n${list(arms)}\n        };\n    }\n`;
// f(0) NotFound, f(1) Timeout, f(2) Denied, f(3) the success value
const B = `<p id="a">\${f(0)} \${f(1)} \${f(2)} \${f(3)}</p>\n`;

let n = 0;
async function run(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  const out = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return String(out.body.querySelector("#a")?.textContent ?? "<none>").trim();
}

describe("LOW-1 — a wildcard alternation on a failable `match` handles the error variants it names", () => {
  test("`.Denied | else` after `.Ok(v)`, `.NotFound`, `.Timeout(_)`: accepted, `.Denied` runs the arm", async () => {
    const src = prog(fm([`.Ok(_) :> "ok"`, `.NotFound :> "nf"`, `.Timeout(_) :> "t"`, `.Denied | else :> "x"`]), B);
    expect(codes(src)).toEqual([]);
    expect(await run(src)).toBe("nf t x ok");
  }, 120000);

  test("`.NotFound | _` with no `.Ok` arm: `.NotFound` AND the success value run the arm", async () => {
    const src = prog(fm([`.Timeout(_) :> "t"`, `.Denied :> "d"`, `.NotFound | _ :> "x"`]), B);
    expect(codes(src)).toEqual([]);
    expect(await run(src)).toBe("x t d x");
  }, 120000);

  test("statement form, two named error alternates and `else`; a block body with a local and a nested `match`", async () => {
    const s1 = prog(fms([`.Timeout(_) :> { out = "t"; }`, `.NotFound | .Denied | else :> { out = "x"; }`]), B);
    expect(codes(s1)).toEqual([]);
    expect(await run(s1)).toBe("x t x x");
    const s2 = prog(`    fn f(i: int) -> string {\n        let out: string = "?";\n        match risky(i) {\n            .NotFound :> { out = "nf"; },\n            .Timeout(_) :> { out = "t"; },\n            .Denied | else :> {\n                let s: string = "x";\n                const k: K = K.A;\n                out = s + match k { .A :> "a", else :> "z", };\n            },\n        }\n        return out;\n    }\n`, B);
    expect(codes(s2)).toEqual([]);
    expect(await run(s2)).toBe("nf t xa xa");
  }, 120000);

  test("value form with a `lift` block arm", async () => {
    const src = prog(`    fn f(i: int) -> string {\n        return match risky(i) {\n            .NotFound :> "nf",\n            .Timeout(_) :> "t",\n            .Denied | else :> {\n                let s: string = "x";\n                lift s;\n            },\n        };\n    }\n`, B);
    expect(codes(src)).toEqual([]);
    expect(await run(src)).toBe("nf t x x");
  }, 120000);

  test("SECURITY: an error variant no arm names is still refused — naming exactly the unnamed ones", () => {
    const one = errs(prog(fm([`.Ok(v) :> "ok"`, `.NotFound :> "nf"`, `.Denied | else :> "x"`])));
    expect(one.map((d) => d.code)).toEqual(["E-MATCH-ELSE-ABSORBS-ERROR"]);
    expect(one[0].message).toContain("error variant(s) Timeout of");
    const two = errs(prog(fm([`.Denied | _ :> "x"`])));
    expect(two.map((d) => d.code)).toEqual(["E-MATCH-ELSE-ABSORBS-ERROR"]);
    expect(two[0].message).toContain("error variant(s) NotFound, Timeout of");
    // a plain `else` after a non-total error set: unchanged (S474)
    const plain = errs(prog(fm([`.Ok(v) :> "ok"`, `.NotFound :> "nf"`, `else :> "x"`])));
    expect(plain.map((d) => d.code)).toEqual(["E-MATCH-ELSE-ABSORBS-ERROR"]);
    expect(plain[0].message).toContain("error variant(s) Timeout, Denied of");
  });

  test("a `!{}` wildcard alternation stays the catch-all", async () => {
    const src = prog(hd([`.Timeout(_) :> { out = "t"; }`, `.Denied | _ :> { out = "w"; }`]), B);
    expect(codes(src)).toEqual([]);
    expect(await run(src)).toBe("w t w ok");
  }, 120000);
});

describe("LOW-2 — `_ e` in a failable `match` alternation: one report", () => {
  test("`.NotFound | _ e` is E-MATCH-ALT-BINDING only (no E-MATCH-ELSE-ABSORBS-ERROR from the recovery)", () => {
    expect(codes(prog(fm([`.Ok(v) :> "ok"`, `.NotFound | _ e :> "x"`])))).toEqual(["E-MATCH-ALT-BINDING"]);
    // no `.Ok` arm either: still no E-TYPE-020 cascade
    expect(codes(prog(fm([`.NotFound | _ e :> "x"`])))).toEqual(["E-MATCH-ALT-BINDING"]);
    // as a statement
    expect(codes(prog(fms([`.Timeout(_) :> { out = "t"; }`, `.Denied | _ e :> { out = "x"; }`])))).toEqual(["E-MATCH-ALT-BINDING"]);
  });

  test("`!{}` unchanged: E-MATCH-ALT-BINDING only", () => {
    expect(codes(prog(hd([`.NotFound | _ e :> { out = "x"; }`])))).toEqual(["E-MATCH-ALT-BINDING"]);
  });
});

describe("LOW-3 — `|` followed by a literal-led expression is the §18.10 guard, E-SYNTAX-011", () => {
  test("`1 | 2 + 3`, `\"a\" | \"b\" + \"c\"`, `true | false && x`, `-1 | -2 * x`: exactly one E-SYNTAX-011", () => {
    expect(codes(prog(lm("int", [`1 | 2 + 3 :> "x"`, `else :> "o"`])))).toEqual(["E-SYNTAX-011"]);
    expect(codes(prog(lm("string", [`"a" | "b" + "c" :> "x"`, `else :> "o"`])))).toEqual(["E-SYNTAX-011"]);
    expect(codes(prog(lm("boolean", [`true | false && x :> "x"`, `else :> "o"`])))).toEqual(["E-SYNTAX-011"]);
    expect(codes(prog(lm("int", [`-1 | -2 * x :> "x"`, `else :> "o"`])))).toEqual(["E-SYNTAX-011"]);
    // after a full alternation, too
    expect(codes(prog(lm("int", [`1 | 2 | 3 + 4 :> "x"`, `else :> "o"`])))).toEqual(["E-SYNTAX-011"]);
  });

  test("literal alternations still parse — across a line break too", async () => {
    expect(codes(prog(lm("int", [`1 | 2 :> "x"`, `else :> "o"`])))).toEqual([]);
    expect(codes(prog(lm("int", [`-1 | 2 |\n                3 :> "x"`, `else :> "o"`])))).toEqual([]);
    const src = prog(lm("string", [`"a" | "b" :> "ab"`, `else :> "o"`]), `<p id="a">\${f("a")} \${f("b")} \${f("c")}</p>\n`);
    expect(codes(src)).toEqual([]);
    expect(await run(src)).toBe("ab ab o");
  }, 120000);
});

describe("INFO-1 — a redundant alternate in a wildcard alternation is E-TYPE-023", () => {
  test("plain enum `match`: `.B :> …, .B | _` and `.A | .A | _`", () => {
    expect(codes(prog(pm([`.B :> "b"`, `.B | _ :> "w"`])))).toEqual(["E-TYPE-023"]);
    expect(codes(prog(pm([`.B :> "b"`, `.A | .A | _ :> "w"`])))).toEqual(["E-TYPE-023"]);
    // literal subject
    expect(codes(prog(lm("int", [`1 :> "one"`, `1 | _ :> "w"`])))).toEqual(["E-TYPE-023"]);
  });

  test("`!{}` and failable `match`", () => {
    expect(codes(prog(hd([`.Denied :> { out = "d"; }`, `.Denied | _ :> { out = "w"; }`])))).toEqual(["E-TYPE-023"]);
    expect(codes(prog(fm([`.NotFound :> "n"`, `.Timeout(_) :> "t"`, `.Denied | .Denied | else :> "w"`])))).toEqual(["E-TYPE-023"]);
    // every case already taken before: the duplicate is the report (no W-MATCH-001 beside it)
    expect(allCodes(prog(fm([`.Ok(_) :> "ok"`, `.Denied :> "d"`, `.NotFound :> "n"`, `.Timeout(_) :> "t"`, `.Denied | else :> "w"`])))).toEqual(["E-TYPE-023"]);
  });

  test("a non-redundant wildcard alternation is clean and runs", async () => {
    const src = prog(pm([`.B :> "b"`, `.A | _ :> "w"`]), `<p id="a">\${f(K.A)} \${f(K.B)} \${f(K.C)} \${f(K.D)}</p>\n`);
    expect(codes(src)).toEqual([]);
    expect(await run(src)).toBe("w b w w");
  }, 120000);
});

// s482-wmatch-alt-fix (#2075 review LOW-1) — §18.2: "An alternation containing a wildcard alternate
// (`_` / `else`) is the wildcard arm." Its named alternates are a duplicate check (E-TYPE-023) only;
// they are not cases covered BEFORE the wildcard, so they never make it "unreachable" (§18.6
// W-MATCH-001). #2075 added them to the plain match's coverage set, and W-MATCH-001 then fired on a
// reachable arm (the failable path kept them out of `coveredBefore` and stayed silent).
describe("LOW-1 (wmatch-alt-fix) — a wildcard alternation is not judged unreachable by its own alternates", () => {
  test("`.A | .B | .C | .D | _` as the only arm: clean, and runs", async () => {
    const src = prog(pm([`.A | .B | .C | .D | _ :> "w"`]), `<p id="a">\${f(K.A)} \${f(K.D)}</p>\n`);
    expect(allCodes(src)).toEqual([]);
    expect(await run(src)).toBe("w w");
  }, 120000);

  test("`.A :> …, .B | .C | .D | else`, `.A | .B :> …, .C | .D | else`, `true | false | else`: no W-MATCH-001", () => {
    expect(allCodes(prog(pm([`.A :> "a"`, `.B | .C | .D | else :> "w"`])))).toEqual([]);
    expect(allCodes(prog(pm([`.A | .B :> "ab"`, `.C | .D | else :> "w"`])))).toEqual([]);
    expect(allCodes(prog(lm("boolean", [`true | false | else :> "w"`])))).toEqual([]);
    expect(allCodes(prog(lm("boolean", [`true :> "t"`, `false | else :> "w"`])))).toEqual([]);
  });

  test("a wildcard after every case already has an arm is still W-MATCH-001", () => {
    expect(allCodes(prog(pm([`.A :> "a"`, `.B | .C :> "bc"`, `.D :> "d"`, `_ :> "w"`])))).toEqual(["W-MATCH-001"]);
    expect(allCodes(prog(pm([`.A | .B | .C | .D :> "abcd"`, `else :> "w"`])))).toEqual(["W-MATCH-001"]);
    expect(allCodes(prog(lm("boolean", [`true | false :> "tf"`, `else :> "w"`])))).toEqual(["W-MATCH-001"]);
    // its named alternate repeats an earlier arm too: both reports
    const c = allCodes(prog(pm([`.A :> "a"`, `.B :> "b"`, `.C :> "c"`, `.D :> "d"`, `.A | _ :> "w"`])));
    expect(c.slice().sort()).toEqual(["E-TYPE-023", "W-MATCH-001"]);
  });

  test("the duplicate check inside a wildcard alternation still fires", () => {
    expect(codes(prog(pm([`.A | .A | _ :> "w"`])))).toEqual(["E-TYPE-023"]);
    expect(codes(prog(lm("boolean", [`true | true | else :> "w"`])))).toEqual(["E-TYPE-023"]);
    expect(codes(prog(pm([`.B :> "b"`, `.C | .B | else :> "w"`])))).toEqual(["E-TYPE-023"]);
  });
});
