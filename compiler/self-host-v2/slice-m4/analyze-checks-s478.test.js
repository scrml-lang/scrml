// analyze-checks-s478.test.js — s478-boot-analyze-checks: named engine codes, the missing
// analyze checks and two cascades (S478 conformance triage clusters C11a, C11b, C13, C14).
//
//   C11a (F3) — the §51.0 engine codes §66.20 RETAINS (neither retired nor superseded by the
//     S451 table, which maps only the invalid-variant limbs to E-DECL-STATE-CHILD /
//     E-TYPE-VARIANT): E-ENGINE-STATE-CHILD-MISSING (§51.0.F, §66.13.2 "the graph's coverage
//     of the enum … checkable") and E-ENGINE-MOUNT-NOT-ENGINE (§51.0.D, §21.8 — ⚑ PA reading:
//     a self-closing tag naming an imported binding that is no declaration).
//   C11b — E-ENUM-VARIANT-CASE (§14.4), E-RESERVED-IDENTIFIER (§6.8.2),
//     W-STYLE-CONFLICT-POSSIBLE (§65.2.4 R3, Info; program-level rules only). (E-DG-002 was built
//     and WITHHELD — see docs/changes/s478-boot-analyze-checks/progress.md.)
//   C13 — one report per fault: no E-TYPE-031 after E-MATCH-012 / E-TYPE-020 on the same
//     `match`; no E-DEFER-LATER-SHADOW for a later declaration that is itself E-SCOPE-REDECLARE.
//   C14 — an `else` no `if` claims is E-STMT-UNEXPECTED-TOKEN (§17.1.1, §34), not
//     E-SCOPE-001 + E-STMT-MISSING-SEMICOLON (gap g-bootstrap-unclaimed-else-misdiagnosed-as-undeclared-s462).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const D = "$" + "{";
const run = (src, extra = []) => frontEnd(mods, [...extra, { path: "app.scrml", src }]);
const all = (r) => [...(r.parseDiags ?? []), ...r.diags];
const errs = (src, extra) => all(run(src, extra)).filter((d) => d.severity === "Error");
const errCodes = (src, extra) => [...new Set(errs(src, extra).map((d) => d.code))].sort();
const diagsOf = (src, code, extra) => all(run(src, extra)).filter((d) => d.code === code);
const count = (src, code, extra) => {
  // a diagnostic may reach both lists; count distinct reports (place + message)
  const seen = new Set(diagsOf(src, code, extra).map((d) => `${d.file}:${d.span.start}:${d.message}`));
  return seen.size;
};

// =============================================================================================
// C11a — E-ENGINE-STATE-CHILD-MISSING
// =============================================================================================
describe("E-ENGINE-STATE-CHILD-MISSING (§51.0.F, §66.13.2)", () => {
  const engine = (kids, variants = "Idle, Loading, Done") => `<program>
type Phase:enum = { ${variants} }
<phase:Phase=.Idle single>
${kids}
</>
</program>
`;
  test("a variant with no state-child is reported, once per variant, at the opener", () => {
    const src = engine(`  <Idle rule=.Done></>\n  <Done rule=.Idle></>`);
    expect(errCodes(src)).toEqual(["E-ENGINE-STATE-CHILD-MISSING"]);
    const ds = diagsOf(src, "E-ENGINE-STATE-CHILD-MISSING");
    expect(ds[0].message).toContain("`.Loading`");
    expect(src.slice(ds[0].span.start, ds[0].span.start + 6)).toBe("<phase");
    expect(count(engine(`  <Idle rule=.Idle></>`), "E-ENGINE-STATE-CHILD-MISSING")).toBe(2);
  });
  test("every variant covered (a terminal state-child with no `rule=` included) is clean", () => {
    expect(errCodes(engine(`  <Idle rule=.Loading></>\n  <Loading rule=.Done></>\n  <Done></>`))).toEqual([]);
  });
  test("a CHILD field's graph is judged the same way", () => {
    const src = `<program>
type Openness:enum = { Closed, Opened, Locked }
<dropdown label:string>
    let <open:Openness=.Closed>
        <Closed rule=.Opened/>
        <Opened rule=.Closed/>
    </>
</> renders <div>${D}@dropdown.label}</div>
<dropdown label="x"/>
</program>
`;
    const ds = diagsOf(src, "E-ENGINE-STATE-CHILD-MISSING");
    expect(ds.length).toBeGreaterThan(0);
    expect(ds[0].message).toContain("`.Locked`");
  });
  test("a value with no state-children is no graph — nothing to cover", () => {
    expect(diagsOf(`<program>\ntype P:enum = { A, B }\nlet <p:P=.A/>\n<p>${D}@p == .A}</p>\n</program>\n`, "E-ENGINE-STATE-CHILD-MISSING")).toEqual([]);
  });
});

// =============================================================================================
// C11a — E-ENGINE-MOUNT-NOT-ENGINE
// =============================================================================================
describe("E-ENGINE-MOUNT-NOT-ENGINE (§51.0.D, §21.8)", () => {
  const lib = { path: "lib.scrml", src: "${ export function helper() { return 1; } }\n" };
  test("a self-closing tag naming an imported function", () => {
    const src = `<program>\nimport { helper } from './lib.scrml';\n<helper/>\n<p>x</p>\n</program>\n`;
    expect(errCodes(src, [lib])).toEqual(["E-ENGINE-MOUNT-NOT-ENGINE"]);
    expect(diagsOf(src, "E-ENGINE-MOUNT-NOT-ENGINE", [lib])[0].message).toContain("a function");
  });
  test("an unknown tag that is not imported stays E-MARKUP-001", () => {
    expect(errCodes(`<program>\n<helper/>\n</program>\n`)).toEqual(["E-MARKUP-001"]);
  });
});

// =============================================================================================
// C11b — E-ENUM-VARIANT-CASE
// =============================================================================================
describe("E-ENUM-VARIANT-CASE (§14.4)", () => {
  const prog = (t) => `<program>\n${t}\n<p>x</p>\n</program>\n`;
  test("each lowercase variant name is reported, with the capitalized rename", () => {
    const src = prog("type Kind:enum = { rule, disp, Ok }");
    expect(errCodes(src)).toEqual(["E-ENUM-VARIANT-CASE"]);
    expect(count(src, "E-ENUM-VARIANT-CASE")).toBe(2);
    expect(diagsOf(src, "E-ENUM-VARIANT-CASE")[0].message).toContain("`Rule`");
  });
  test("a leading `_` is not an uppercase letter", () => {
    expect(errCodes(prog("type K:enum = { _hidden, Shown }"))).toEqual(["E-ENUM-VARIANT-CASE"]);
  });
  test("uppercase variants, and lowercase PAYLOAD field names, are clean", () => {
    expect(errCodes(prog("type Shape:enum = { Circle(radius: number), Square(side: number) }"))).toEqual([]);
  });
});

// =============================================================================================
// C11b — E-RESERVED-IDENTIFIER
// =============================================================================================
describe("E-RESERVED-IDENTIFIER (§6.8.2)", () => {
  const prog = (fn) => `<program>\nlet <count:number=0/>\n${fn}\n<p>${D}@count}</p>\n</program>\n`;
  test("`function reset()` and `fn reset()` are refused", () => {
    expect(errCodes(prog("function reset() { @count = 0; }"))).toEqual(["E-RESERVED-IDENTIFIER"]);
    expect(errCodes(prog("fn reset() -> int { return 0; }"))).toEqual(["E-RESERVED-IDENTIFIER"]);
  });
  test("a nested `function reset` is refused too", () => {
    expect(errCodes(prog("function go() {\n    function reset() { return 1; }\n    @count = reset();\n}\n<button onclick=go()>go</button>"))).toContain("E-RESERVED-IDENTIFIER");
  });
  test("`reset(@cell)` itself, and a function merely named like it, are clean", () => {
    expect(errCodes(prog("function resetAll() { reset(@count); }\n<button onclick=resetAll()>r</button>"))).toEqual([]);
  });
});

// =============================================================================================
// C11b — W-STYLE-CONFLICT-POSSIBLE (Info; program-level rules)
// =============================================================================================
describe("W-STYLE-CONFLICT-POSSIBLE (§65.2.4 R3 — Info)", () => {
  const prog = (css, markup = `<button class="btn">Go</button>`) => `<program>\n  #{\n${css}\n  }\n  ${markup}\n</program>\n`;
  const w = (src) => diagsOf(src, "W-STYLE-CONFLICT-POSSIBLE");
  test("`button` × `.btn` on a `<button class=\"btn\">` of the same file, one property", () => {
    const src = prog("      button { color: red; }\n      .btn    { color: blue; }");
    expect(w(src).length).toBe(1);
    expect(w(src)[0].severity).toBe("Info");
    expect(w(src)[0].message).toContain("`color`");
    expect(errCodes(src)).toEqual([]);
  });
  test("no shared property, or no element both match: silent", () => {
    expect(w(prog("      button { color: red; }\n      .btn { padding: 1px; }"))).toEqual([]);
    expect(w(prog("      button { color: red; }\n      .btn { color: blue; }", `<button>Go</button><p class="btn">x</p>`))).toEqual([]);
  });
  test("a conditional layer (`:hover`) and the R1 reset floor (`*`, `body`) are not conflicts", () => {
    expect(w(prog("      button { color: red; }\n      .btn:hover { color: blue; }"))).toEqual([]);
    expect(w(prog("      * { color: red; }\n      .btn { color: blue; }"))).toEqual([]);
  });
  test("an id × tag overlap is one", () => {
    expect(w(prog("      #go { color: red; }\n      button { color: blue; }", `<button id="go">Go</button>`)).length).toBe(1);
  });
});

// =============================================================================================
// C13 — cascades
// =============================================================================================
describe("C13 — one report per fault", () => {
  test("E-MATCH-012 is not followed by E-TYPE-031 on the same `match`", () => {
    const src = `<program>
type Role:enum = { Admin, Editor }
fn label(r: Role | not) -> string {
    return match r {
        .Admin  :> "admin",
        .Editor :> "editor"
    };
}
<p>${D}label(.Admin)}</p>
</program>
`;
    expect(errCodes(src)).toEqual(["E-MATCH-012"]);
  });
  test("E-TYPE-020 is not followed by E-TYPE-031 either", () => {
    const src = `<program>
type Role:enum = { Admin, Editor, Viewer }
fn label(r: Role) -> string {
    return match r {
        .Admin  :> "admin",
        .Editor :> "editor"
    };
}
<p>${D}label(.Admin)}</p>
</program>
`;
    expect(errCodes(src)).toEqual(["E-TYPE-020"]);
  });
  test("a W-MATCH-002 literal match without `else` is still widened by `not` (no cascade to suppress)", () => {
    const src = `<program>
fn label(s: string) -> string {
    return match s {
        "a" :> "A",
        "b" :> "B"
    };
}
<p>${D}label("a")}</p>
</program>
`;
    expect(errCodes(src)).toEqual(["E-TYPE-031"]);
  });
  test("a later `let` that redeclares a parameter is E-SCOPE-REDECLARE only, not also E-DEFER-LATER-SHADOW", () => {
    const src = `<program>
let <trace:string=""/>
function D(s: string) { @trace = @trace + s; }
function f(x: string) -> string {
    defer D("x=" + x);
    let x = "inner";
    return x;
}
<button onclick=f("a")>go</button>
<p>${D}@trace}</p>
</program>
`;
    expect(errCodes(src)).toEqual(["E-SCOPE-REDECLARE"]);
  });
  test("a legal later shadow (a nested block's binding) still draws E-DEFER-LATER-SHADOW", () => {
    const src = `<program>
let <trace:string=""/>
function D(s: string) { @trace = @trace + s; }
function f(x: string) -> string {
    const y = "outer";
    defer D(y);
    if (x == "a") {
        return x;
    }
    const z = y;
    return z;
}
<button onclick=f("a")>go</button>
<p>${D}@trace}</p>
</program>
`;
    // `z` is declared after the defer but the deferred statement does not read it
    expect(errCodes(src)).toEqual([]);
    const shadow = `<program>
let <trace:string=""/>
function D(s: string) { @trace = @trace + s; }
function f(x: string) -> string {
    defer D(y);
    const y = "later";
    return y;
}
<button onclick=f("a")>go</button>
<p>${D}@trace}</p>
</program>
`;
    expect(errCodes(shadow)).toContain("E-DEFER-LATER-SHADOW");
  });
});

// =============================================================================================
// C14 — an orphan `else`
// =============================================================================================
describe("C14 — an `else` no `if` claims is E-STMT-UNEXPECTED-TOKEN (§17.1.1)", () => {
  const prog = (body) => `<program>\nlet <r:string=""/>\nfunction go() {\n${body}\n}\n<button onclick=go()>go</button>\n<p>${D}@r}</p>\n</program>\n`;
  test("`@r = \"a\" else @r = \"b\"` — one report, at the `else`", () => {
    const src = prog(`    @r = "a" else @r = "b";`);
    expect(errCodes(src)).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
    const d = diagsOf(src, "E-STMT-UNEXPECTED-TOKEN")[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("else");
  });
  test("`if (…) { … }; else { … }` — the `;` ended the `if`", () => {
    expect(errCodes(prog(`    if (@r == "") { @r = "a"; };\n    else { @r = "b"; }`))).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
  });
  test("`; else if (…)` is the same fault", () => {
    expect(errCodes(prog(`    if (@r == "") { @r = "a"; };\n    else if (@r == "a") { @r = "b"; }`))).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
  });
  test("a claimed `else` is unchanged, and a braceless then-branch missing its `;` keeps E-STMT-MISSING-SEMICOLON", () => {
    expect(errCodes(prog(`    if (@r == "") { @r = "a"; } else { @r = "b"; }`))).toEqual([]);
    expect(errCodes(prog(`    if (@r == "") @r = "a" else @r = "b";`))).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });
});
