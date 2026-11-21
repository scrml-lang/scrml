// keyword-member-from-alt-head-s482.test.js — lane s482-boot-parse-gaps: three bootstrap parse gaps
// that stopped the self-host compiling itself.
//
// 1. g-boot-keyword-named-member-s481 — a reserved word after `.` / `?.` is a MEMBER NAME whatever its
//    spelling (SPEC §7.2: "All JavaScript that is valid in a Bun execution context is valid inside
//    `${ }`, except the constructs §7.2.1 excludes"; §7.2.1: "`class` SHALL remain valid … as a member
//    name (`x.class`, `x?.class`) … A diagnostic on any of these is a compiler defect"; §18: `match`
//    "used as a member (`obj.match`) … is the identifier, never the keyword"). Before: after the word,
//    `.next` lexed as a bare variant, so `t.server.plan` ended the statement (E-STMT-MISSING-SEMICOLON).
//    Also the bare name `server` (`server = server.concat([sf]);`): a function modifier only before
//    `function` / `fn` (§52.10); no SPEC sentence reserves it.
// 2. g-boot-from-identifier-s481 — `from` is contextual (§54.3: "`from` SHALL NOT be a reserved word
//    outside this position. Existing code that uses `from` as a parameter name, local binding, or
//    field name … SHALL continue to compile without change").
// 3. g-boot-multiline-alternation-arm-head-s481 — a line ending in `|` continues the arm head (§7.2.2
//    rule 4: "a line break SHALL NOT end, continue or separate a statement or an arm"; §18.2: "An arm
//    pattern MAY list several alternates separated by `|`"). The bootstrap does not build alternation
//    yet (one E-PARSE-ARM per head, g-boot-match-alternation-unbuilt-s482); the multi-line head is now
//    ONE head refused once, like the one-line head — before, one E-MATCH-ARM-SEPARATOR per line.
//
// Red on base eca9c5af5: every "compiles clean" case below reported E-STMT-MISSING-SEMICOLON /
// E-PARSE-LOCAL / E-STMT-BINDING-NAME (plus E-TYPE-VARIANT follow-ons), and the alternation cases
// reported E-MATCH-ARM-SEPARATOR per continued line.

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
  dir = mkdtempSync(join(tmpdir(), "s482-boot-parse-gaps-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

// (`diags` carries the parse diagnostics too — slice-m2/lowered.js frontEnd)
const allDiags = (files) => frontEnd(mods, files).diags;
const errorsOf = (files) => allDiags(files).filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const codes = (src) => allDiags([{ path: "s.scrml", src }]).filter((d) => d.severity === "Error").map((d) => d.code);
const clean = (src) => expect(errorsOf([{ path: "s.scrml", src }])).toEqual([]);

// A program whose `${ }` holds `decls`.
const prog = (decls) => `<program>\n\${\n${decls}\n}\n</program>\n`;

const TYPES = `    type In:struct = { id: int, ok: boolean }
    type T:struct = { server: In, fn: In, from: string, if: int, for: int, match: string, lift: int, of: int, type: int, renders: int, else: int }
    type K:enum = { A, B, C, D }
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

describe("g-boot-keyword-named-member-s481 — a reserved word after `.` / `?.` is a member name", () => {
  test("a member chain through every keyword class compiles clean", () => {
    clean(prog(TYPES + `
    fn a1(t: T) -> boolean { return t.server.ok; }
    fn a2(t: T) -> int { return t.fn.id; }
    fn a3(t: T) -> int { return t.if + t.for + t.lift + t.of + t.type + t.renders + t.else; }
    fn a4(t: T) -> boolean { return t.match.startsWith("m") || t.from.endsWith(".js"); }
    fn a5(t: T) -> int { return t.server.id + t.fn.id; }`));
  });

  test("optional chaining through a keyword-named member (`t?.server.id`)", () => {
    clean(prog(TYPES + `    fn b1(t: T | not) -> int | not { return t?.server.id; }`));
  });

  test("a keyword-named member at a line end, the chain continued on the next line (§7.2.2 rule 4)", () => {
    clean(prog(TYPES + `    fn c1(t: T) -> int {\n        return t.server\n            .id;\n    }`));
  });

  test("a `/` after a keyword-named member divides (never opens a regular expression)", () => {
    clean(prog(`    type N:struct = { server: number, if: number }\n    fn d1(o: N) -> number { return o.server / 2 + o.if / 4; }`));
  });

  test("the bare name `server`: a parameter, a `let`, an assignment, a member receiver", () => {
    clean(prog(`    fn e1(server: int[], x: int) -> int[] { return server.concat([x]); }
    fn e2(x: int) -> int {
        let server: int = x;
        server = server + 1;
        return server;
    }`));
  });

  test("`server function` and `export server fn` still read as the deprecated modifier", () => {
    const ds = allDiags([{ path: "s.scrml", src: prog(`    server function f(n: int) -> int { return n + 1; }`) }]);
    expect(ds.filter((d) => d.severity === "Error").map((d) => d.code)).toEqual([]);
    expect(ds.map((d) => d.code)).toContain("W-DEPRECATED-SERVER-MODIFIER");
  });

  test("a bare variant after a non-name keyword is still a variant (`return .A`, `is .B`)", () => {
    clean(prog(TYPES + `    fn f1() -> K { return .A; }\n    fn f2(k: K) -> boolean { return k is .B; }`));
  });

  test("the values run: keyword-named members read the fields they name", async () => {
    const src = `<program>
\${
    type In:struct = { id: int, ok: boolean }
    type T:struct = { server: In, fn: In, if: int }
    const i: In = { id: 7, ok: true };
    const j: In = { id: 5, ok: false };
    const t: T = { server: i, fn: j, if: 3 };
    fn sum(x: T) -> int { return x.server.id + x.fn.id + x.if; }
}
<p id="a">\${sum(t)}</p>
<p id="b">\${t.server.ok}</p>
</program>
`;
    expect(await run(src, ["a", "b"])).toEqual(["15", "true"]);
  }, 60000);
});

describe("g-boot-from-identifier-s481 — `from` is a name outside its keyword positions", () => {
  test("`from` as a receiver, a parameter, a `let`, a destructuring name and an object shorthand", () => {
    clean(prog(`    type S:struct = { from: string, server: string }
    fn g1(from: string) -> boolean { return from.startsWith("scrml:") || from.startsWith("vendor:") || from.endsWith(".js"); }
    fn g2(x: int) -> int {
        let from: int = x;
        from = from + 1;
        return from;
    }
    fn g3(s: S) -> string {
        const { from, server } = s;
        return from + server;
    }
    fn g4(s: S) -> string {
        const { from: f } = s;
        return f;
    }
    fn g5(from: string, server: string) -> S { return { from, server }; }`));
  });

  test("`import { … } from \"…\"` still reads as an import", () => {
    const lib = `\${\n    export fn twice(n: int) -> int { return n * 2; }\n}\n`;
    const app = prog(`    import { twice } from "./lib.scrml";\n    fn h1(from: int) -> int { return twice(from); }`);
    expect(errorsOf([{ path: "lib.scrml", src: lib }, { path: "app.scrml", src: app }])).toEqual([]);
  });

  test("the values run: `from` read as a name", async () => {
    const src = `<program>
\${
    fn isMod(from: string) -> boolean { return from.startsWith("scrml:") || from.endsWith(".js"); }
}
<p id="a">\${isMod("scrml:data")}</p>
<p id="b">\${isMod("x.css")}</p>
</program>
`;
    expect(await run(src, ["a", "b"])).toEqual(["true", "false"]);
  }, 60000);
});

describe("g-boot-multiline-alternation-arm-head-s481 — a line ending in `|` continues the arm head", () => {
  const ONE = prog(TYPES + `    fn k1(k: K) -> int {\n        return match k {\n            .A | .B | .C :> 1,\n            .D :> 2,\n        };\n    }`);
  const MULTI = prog(TYPES + `    fn k1(k: K) -> int {\n        return match k {\n            .A | .B |\n                .C :> 1,\n            .D :> 2,\n        };\n    }`);

  test("the multi-line head reports what the one-line head reports — no E-MATCH-ARM-SEPARATOR", () => {
    expect(codes(MULTI)).not.toContain("E-MATCH-ARM-SEPARATOR");
    expect(codes(MULTI)).toEqual(codes(ONE));
    expect(codes(MULTI).filter((c) => c === "E-PARSE-ARM")).toEqual(["E-PARSE-ARM"]);
  });

  test("a head over three lines, comments between them", () => {
    const src = prog(TYPES + `    fn k2(k: K) -> int {\n        return match k {\n            .A | // the first\n                .B | /* then */\n                .C :> 1,\n            .D :> 2,\n        };\n    }`);
    expect(codes(src)).not.toContain("E-MATCH-ARM-SEPARATOR");
    expect(codes(src).filter((c) => c === "E-PARSE-ARM")).toEqual(["E-PARSE-ARM"]);
  });

  test("CRLF line ends", () => {
    expect(codes(MULTI.replace(/\n/g, "\r\n"))).toEqual(codes(ONE));
  });

  test("a line NOT ending in `|` still ends the arm: a missing `,` is still E-MATCH-ARM-SEPARATOR", () => {
    const src = prog(TYPES + `    fn k3(k: K) -> int {\n        return match k {\n            .A :> 1\n            .B :> 2,\n            else :> 3,\n        };\n    }`);
    expect(codes(src)).toEqual(["E-MATCH-ARM-SEPARATOR"]);
  });
});
