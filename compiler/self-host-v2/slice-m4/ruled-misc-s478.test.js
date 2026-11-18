// ruled-misc-s478.test.js — s478-ruled-misc: the S478 open-Qs rulings (user-voice
// "⭐ RULED — open owner questions, PA recs adopted wholesale (S478, 2026-11-17)").
// Each describe block names its ruling item and quotes the SPEC sentence it builds.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const ENTRY = "app.scrml";
const run = (src) => frontEnd(mods, [{ path: ENTRY, src }], ENTRY);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => run(src).diags.map((d) => d.code);

// ---------------------------------------------------------------------------
// item 27 — §23.2.4a: "JavaScript comments … MAY stand between the header's tokens — after `in`,
// around the `:`, the braces, each name and each `,` … an implementation SHALL read the header the
// same with or without them." Red before: `in: { a /* c */, b }` was E-FOREIGN-007.
// ---------------------------------------------------------------------------
describe("item 27 — comments inside a foreign crossing header (§23.2.4a)", () => {
  const tool = (slice) => `<program kind="tool" lang="js">\n    function main(args: string[]) -> number {\n        const n = 1;\n        const v: int = ${slice};\n        return 0;\n    }\n</program>\n`;
  const f007 = (slice) => errs(tool(slice)).filter((d) => d.code === "E-FOREIGN-007");
  test("a comment between names, around `:` / `{` / `}`, and a line comment", () => {
    for (const s of [
      "_={ in: { n /* c */, args } n }=",
      "_={ in /* c */ : /* d */ { /* e */ n /* f */ } n }=",
      "_={ in: { n, // the count\n            args } n }=",
      "_={ in: { n, /* trailing */ } n }=",
    ]) expect(f007(s)).toEqual([]);
  });
  test("the header's names are still checked through a comment (a name crossed twice)", () => {
    const ds = f007("_={ in: { n /* c */, n } n }=");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("crosses `n` twice");
  });
  test("a header AFTER a comment stays E-FOREIGN-007 (the header is at the top of the block)", () => {
    expect(f007("_={ /* note */ in: { n } n + 1 }=").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// item 28 — §51.12.3: "A quoted duration is the same literal as the bare one" · "Units are
// lowercase only … SHALL be refused with `E-SYNTAX-DURATION`; the message SHALL name the lowercase unit".
// ---------------------------------------------------------------------------
describe("item 28 — DURATION: the quoted form and the unit case (§51.12.3)", () => {
  const P = (attrs) => `<program>\nlet <x:int=0 ${attrs}/>\nfunction f() { @x = 1; }\n<main><p>\${@x}</p><button onclick=f()>f</button></main>\n</program>\n`;
  const timing = (attrs) => {
    const r = run(P(attrs));
    expect(r.diags.filter((d) => d.code.startsWith("E-"))).toEqual([]);
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    return prog.fields.find((f) => f.sym.hint === "x").timing;
  };
  test("debounced=\"300ms\" is debounced=300ms", () => {
    expect(timing(`debounced="300ms"`)).toEqual(timing(`debounced=300ms`));
    expect(timing(`throttled="2s"`)).toEqual({ throttle: true, ms: 2000 });
  });
  for (const [v, want] of [["300MS", "300ms"], ["2S", "2s"], ["5M", "5m"], ["1H", "1h"], ["\"300Ms\"", "300ms"]]) {
    test(`debounced=${v} → E-SYNTAX-DURATION naming \`${want}\``, () => {
      const ds = errs(P(`debounced=${v}`)).filter((d) => d.code === "E-SYNTAX-DURATION");
      expect(ds.length).toBe(1);
      expect(ds[0].message).toContain("lowercase");
      expect(ds[0].message).toContain("`" + want + "`");
    });
  }
  test("a unit that is no unit in any case keeps the plain message", () => {
    const ds = errs(P(`debounced=300sec`)).filter((d) => d.code === "E-SYNTAX-DURATION");
    expect(ds.length).toBe(1);
    expect(ds[0].message).not.toContain("lowercase");
  });
});

// ---------------------------------------------------------------------------
// item 30 — §51.0.F: "A `rule=` value written QUOTED on a state-child … SHALL be
// `E-ENGINE-RULE-QUOTED` (Error)". Red before: E-BOOTSTRAP-UNSUPPORTED (by name).
// ---------------------------------------------------------------------------
describe("item 30 — a quoted rule= is E-ENGINE-RULE-QUOTED (§51.0.F)", () => {
  const prog = (rule) => `<program>
type Phase:enum = { Idle, Loading, Done }
<phase:Phase=.Idle single>
    <Idle ${rule}>
        <button onclick=\${@phase = .Loading}>a</>
    </>
    <Loading rule=.Done></>
    <Done></>
</>
<*phase/>
</program>
`;
  for (const r of [`rule=".Loading"`, `rule="(.Loading | .Done)"`, `rule="*"`, `rule="go -> Loading"`]) {
    test(r, () => {
      const d = run(prog(r)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-ENGINE-RULE-QUOTED"]);
      expect(d[0].severity).toBe("Error");
      expect(d[0].message).toContain("drop the quotes");
    });
  }
  test("the unquoted form compiles clean", () => {
    expect(errs(prog("rule=.Loading"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// item 61 — §55.12: "Validators whose literal bounds no value can satisfy together … SHALL be
// `E-VALIDATOR-CONTRADICTORY` (Error)". Red before: accepted (an empty intersection, silently).
// ---------------------------------------------------------------------------
describe("item 61 — contradictory validators (§55.12)", () => {
  const P = (decl, ctl = `<input bind:value=@v/>`) => `<program>\n${decl}\n<main><form>${ctl}</form></main>\n</program>\n`;
  const vc = (src) => run(src).diags.filter((d) => d.code === "E-VALIDATOR-CONTRADICTORY");
  for (const v of ["length(>5) length(<3)", "length(==4) length(>=5)", "length(<=2) length(==3)", "length(>2) length(<3)"]) {
    test(`<v:string="" ${v}> → E-VALIDATOR-CONTRADICTORY`, () => {
      const ds = vc(P(`let <v:string="" ${v}/>`));
      expect(ds.length).toBe(1);
      expect(ds[0].severity).toBe("Error");
    });
  }
  test("min(10) max(3) on a number → E-VALIDATOR-CONTRADICTORY naming both", () => {
    const ds = vc(P(`let <v:number=0 min(10) max(3)/>`, `<input type="number" bind:valueAsNumber=@v/>`));
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("min(10)");
    expect(ds[0].message).toContain("max(3)");
  });
  for (const v of ["length(>2) length(==4)", "length(>=3) length(<=3)", "length(>2) length(<9) length(==4)"]) {
    test(`satisfiable: ${v} → no report`, () => {
      expect(vc(P(`let <v:string="" ${v}/>`))).toEqual([]);
    });
  }
  test("satisfiable: min(3) max(3) → no report", () => {
    expect(vc(P(`let <v:number=0 min(3) max(3)/>`, `<input type="number" bind:valueAsNumber=@v/>`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// item 32 — §6.13.6: "A write to a `debounced=` / `throttled=` cell whose right-hand side reads
// the SAME cell … SHALL produce the lint `W-TIMED-READ-MODIFY-WRITE` (Warning) at the write."
// ---------------------------------------------------------------------------
describe("item 32 — W-TIMED-READ-MODIFY-WRITE (§6.13.6)", () => {
  const P = (attrs, body) => `<program>\nlet <x:int=0 ${attrs}/>\nlet <y:int=0/>\nfunction f() { ${body} }\n<main><p>\${@x}\${@y}</p><button onclick=f()>f</button></main>\n</program>\n`;
  const lint = (src) => run(src).diags.filter((d) => d.code === "W-TIMED-READ-MODIFY-WRITE");
  for (const [attrs, body] of [["debounced=300ms", "@x = @x + 1;"], ["throttled=1s", "@x = @x * 2;"]]) {
    test(`${attrs}: \`${body}\` → the lint (a Warning), nothing else`, () => {
      const r = run(P(attrs, body));
      const ls = lint(P(attrs, body));
      expect(ls.length).toBe(1);
      expect(ls[0].severity).toBe("Warning");
      expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    });
  }
  for (const [attrs, body] of [["debounced=300ms", "@x = @y + 1;"], ["", "@x = @x + 1;"], ["debounced=300ms", "@y = @x + 1;"]]) {
    test(`no lint: ${attrs || "(untimed)"} \`${body}\``, () => {
      expect(lint(P(attrs, body))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// item 26 (1) — §21.5: "When the entry file of a compile has no `<program>` and its top level holds
// only imports, types, functions, constants and declarations, it SHALL be compiled as a library".
// Red before: every such entry was E-PROGRAM-MISSING (no §34 row).
// ---------------------------------------------------------------------------
describe("item 26 — a library-file entry compiles as a library (§21.5)", () => {
  const LIB = "${\n    export type Pointer:enum = { Sha(hash: string), None }\n    export const LIMIT: int = 3;\n    export fn label(kind: string) -> string {\n        return kind;\n    }\n}\n";
  test("no E-PROGRAM-MISSING; its own checks run", () => {
    expect(codes(LIB)).toEqual([]);
    expect(codes(LIB.replace("return kind;", "return 1;"))).toContain("E-TYPE-031");
  });
  test("an entry with markup and no <program> stays E-PROGRAM-MISSING (now a §34 code)", () => {
    const d = run("<p>hello</p>\n").diags.filter((x) => x.code === "E-PROGRAM-MISSING");
    expect(d.length).toBe(1);
    expect(d[0].severity).toBe("Error");
  });
  test("the printer never prints a library as a page (refused by name, §21.5)", () => {
    const r = run(LIB);
    const out = mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");
    expect(out.html).toBe("");
    expect(out.refused.join("\n")).toContain("library file");
  });
});

// ---------------------------------------------------------------------------
// item 59 (a) — §7.6: "An initializer that reaches a server-only resource — a `?{}` query … SHALL be
// a compile error, `E-FILE-SCOPE-SERVER-REACH`". Red before: E-BOOTSTRAP-UNSUPPORTED (by name).
// ---------------------------------------------------------------------------
describe("item 59 — where a file-scope initializer runs (§7.6)", () => {
  const P = (logic) => `<program db="./app.db">\n\${\n${logic}\n}\n<p>hi</p>\n</program>\n`;
  test("a `?{}` in a file-scope const initializer → E-FILE-SCOPE-SERVER-REACH", () => {
    const d = run(P("    const ROWS = ?{`SELECT 1 AS a`}.all();")).diags;
    expect(d.map((x) => x.code)).toContain("E-FILE-SCOPE-SERVER-REACH");
    expect(d.map((x) => x.code)).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a non-constant, non-server initializer stays refused by name, citing the ruling (INTERIM)", () => {
    const d = run(P("    fn f() -> int { return 1; }\n    const A = f();")).diags.filter((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("g-boot-file-scope-init-eval-s478");
  });
  test("a file-scope `let` stays refused by name, naming E-FILE-SCOPE-LET-SERVER-WRITE's rule", () => {
    const d = run(P("    let counter = 0;")).diags.filter((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("E-FILE-SCOPE-LET-SERVER-WRITE");
  });
});
