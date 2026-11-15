// refinement-s478.test.js — s478-boot-refinement: refinement types `base(pred)` (§53) and
// validator words on struct fields (§53.6.1 / §55.1) in the bootstrap's type positions
// (docs/changes/s478-boot-refinement/progress.md).
//
// The bootstrap READS a refinement in every type position and JUDGES it where it is declared
// (§53.11: "Both forms of E-CONTRACT-002 SHALL be emitted where the refinement is declared,
// whatever zone its value is in"). A fixed declaration whose value is a literal is the static zone
// (§53.4.2) and is judged now (E-CONTRACT-001). Every other position is the boundary zone, whose
// runtime check (§53.11) the bootstrap does not build yet — refused by name (INTERIM,
// g-boot-refinement-runtime-checks-s478), never read as an unchecked annotation.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "./harness.js";
import { frontEnd } from "./lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => {
  const r = frontEnd(mods, [{ path: "app.scrml", src }]);
  return [...r.parseDiags, ...r.diags];
};
const errs = (src) => [...new Set(run(src).filter((d) => d.code.startsWith("E-")).map((d) => d.code))].sort();
const cell = (decl) => `<program>\n${decl}\n<p>\${@x}</p>\n</program>\n`;
const fnBody = (body) => `\${\n    fn f(v: number) -> number {\n${body}\n        return 1;\n    }\n}\n<program><p>\${f(1)}</p></program>\n`;

describe("the static zone: a fixed cell whose own value is a literal (§53.4.2)", () => {
  test("a literal that satisfies the predicate compiles clean", () => {
    expect(errs(cell("<x:number(>0 && <10000)=5/>"))).toEqual([]);
    expect(errs(cell("<x:int(>=0)=0/>"))).toEqual([]);
    expect(errs(cell('<x:string(email)="a@b.co"/>'))).toEqual([]);
    expect(errs(cell('<x:string(.length > 2)="abc"/>'))).toEqual([]);
    expect(errs(cell("<x:number(0 < value < 10)=3/>"))).toEqual([]);
  });
  test("a literal that fails is E-CONTRACT-001, and nothing else", () => {
    expect(errs(cell("<x:number(>0 && <10000)=(-50)/>"))).toEqual(["E-CONTRACT-001"]);
    expect(errs(cell('<x:string(email)="not-an-email"/>'))).toEqual(["E-CONTRACT-001"]);
    expect(errs(cell("<x:number(!(>5))=7/>"))).toEqual(["E-CONTRACT-001"]);
    expect(errs(cell('<x:string(date)="2026-1-01"/>'))).toEqual(["E-CONTRACT-001"]);
  });
  test("S458: the base type is tested — 1.5 does not inhabit integer(>0) (§53.3.4), one report", () => {
    expect(errs(cell("<x:integer(>0)=1.5/>"))).toEqual(["E-CONTRACT-001"]);
  });
  test("a const local with a literal value is judged the same way", () => {
    expect(errs(fnBody("        const q: number(>0) = 5;"))).toEqual([]);
    expect(errs(fnBody("        const q: number(>0) = -5;"))).toEqual(["E-CONTRACT-001"]);
  });
});

describe("judged where declared, any zone (§53.11)", () => {
  test("an unknown named shape is E-CONTRACT-002", () => {
    expect(errs(cell('<x:string(ssn)="x"/>'))).toEqual(["E-CONTRACT-002"]);
    expect(errs(fnBody("        let s: string(ssn) = \"\";"))).toEqual(["E-CONTRACT-002"]);
  });
  test("a malformed predicate, or a tail after its `)`, is E-CONTRACT-002 — never an unrefined annotation", () => {
    expect(errs(fnBody("        let q: number(>0) foo = v;"))).toEqual(["E-CONTRACT-002"]);
    expect(errs(cell("<x:number(>0 foo)=1/>"))).toEqual(["E-CONTRACT-002"]);
    expect(errs(cell("<x:number(>)=1/>"))).toEqual(["E-CONTRACT-002"]);
    // an unclosed `(` in an opener: the predicate runs to the end of the source (the tag after it is lost)
    expect(errs(cell("<x:number((>0)=1/>"))).toContain("E-CONTRACT-002");
    expect(errs(fnBody("        const q: number((>0) = 1;"))).toContain("E-CONTRACT-002");
  });
  test("a reference outside the incoming value is E-CONTRACT-003 (§53.3.1)", () => {
    expect(errs(cell("<m:number=100/>\n<x:number(>=0 && <=@m)=1/>"))).toEqual(["E-CONTRACT-003"]);
  });
  test("a union with a refined member and a map of refined entries is E-CONTRACT-002 (no runtime test)", () => {
    expect(errs(cell("<x:number(>0) | [string: number(>0)]=1/>"))).toEqual(["E-CONTRACT-002"]);
  });
});

describe("the boundary zone is refused by name (INTERIM) — no unchecked refinement", () => {
  const refused = (src) => expect(errs(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  test("a cell whose value is not a literal, a `let` cell, a field of a declaration", () => {
    refused(cell("<n:number=0/>\n<x:number(>=0)=(@n * 2)/>"));
    refused(cell("let <x:number(>0)=1/>"));
    refused(cell("<x:number(>0)/>"));
  });
  test("a parameter, a struct field, a `let` local, a non-literal const, a tape element", () => {
    refused("${\n    fn f(v: number(>0)) -> number {\n        return v;\n    }\n}\n<program><p>${f(1)}</p></program>\n");
    refused("${\n    type L:struct = { href: string(url) }\n}\n<program><p>x</p></program>\n");
    refused(fnBody("        let q: number(>0) = 5;"));
    refused(fnBody("        const q: number(>0) = v;"));
    refused(fnBody("        const q: number(>0)[] = [];"));
  });
  test("a `url` literal is not decided by the bootstrap (no WHATWG URL parser)", () => {
    refused(cell('<x:string(url)="https://scrml.dev/"/>'));
  });
});

describe("validator words after a struct field's type (§53.6.1, §55.1)", () => {
  const prog = (fields) => `\${\n    type Role:enum = { Admin, Editor }\n    type P:struct = { ${fields} }\n}\n<program><p>x</p></program>\n`;
  test("`req` on an enum / int / bool field holds for every value — read, no check", () => {
    expect(errs(prog("role: Role req, n: int req, b: bool req"))).toEqual([]);
  });
  test("`req` on a string field, and an enum subset, need a construction check — refused (INTERIM)", () => {
    expect(errs(prog("name: string req"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(prog("role: Role oneOf([.Admin]) req"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
