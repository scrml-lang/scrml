// engine.test.js — SPEC §66.19.6 "An engine re-expressed as a `single`
// declaration" (the After program), compiled from its verbatim source by the
// bootstrap front end (parse → analyze → lower → print) and RUN in happy-dom
// against the slice runtime. Asserts what the program's comments promise:
//   - `<phase:Phase=.Idle single>` — the name IS the variable; `<*phase/>`
//     renders the state-child body of the variant it holds (O5 RULED (1i));
//   - `load()` moves along an edge; `finish()` is legal from .Loading, a
//     no-op from .Done (§51.0.F.1), E-ENGINE-INVALID-TRANSITION otherwise;
//   - each `<card>` has its own `status` (a per-instance transition graph);
//   - its negative lines: `single` on `status` → E-COMPONENT-ENGINE-SCOPE;
//     `<phase/>` → E-DECL-SINGLE-INSTANTIATED (O55 RULED S442).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd, programFiles, compileClean, codesOf, replaceLine, negativeLines, readM4 } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, instancesOf, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const SRC = () => readM4("src/engine/after.scrml");
const compile = () => compileClean(mods, programFiles("engine"), "§66.19.6");

const stateText = () => document.querySelector("main > p").textContent;
const loadButton = () => document.querySelector("main > button");
const cards = () => [...document.querySelectorAll("main > article")];

describe("§66.19.6 — the front end", () => {
  test("the verbatim source compiles with no diagnostic, and its Core is well-formed", () => {
    const r = compile();
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });

  test("`phase` is the program's cell (the name IS the variable, §66.13.3) carrying the `rule=` graph", () => {
    const core = compile().core;
    const prog = core.decls.find((d) => d.sym.id === core.program.id);
    const phase = prog.fields.find((f) => f.sym.hint === "phase");
    expect(phase.graph).not.toBeNull();
    // Idle→Loading, Loading→Done|Failed, Done→Idle, Failed→Loading|Idle (variant indices of Phase)
    expect(phase.graph.edges.map((e) => [e.origin, e.targets])).toEqual([[0, [1]], [1, [2, 3]], [2, [0]], [3, [1, 0]]]);
    expect(phase.wcap).not.toBeNull();
    expect(phase.grants.replace).toBe(false);
  });

  test("`<card>` is a user declaration whose child `status` carries its own graph", () => {
    const core = compile().core;
    const card = core.decls.find((d) => d.sym.hint === "card");
    expect(card.fields.map((f) => f.sym.hint)).toEqual(["title", "status"]);
    expect(card.fields[1].graph.edges.map((e) => [e.origin, e.targets])).toEqual([[0, [1]], [1, [2, 3]], [2, [0]], [3, [0]]]);
  });
});

describe("§66.19.6 — behaviour", () => {
  let rt, program;
  beforeAll(async () => { ({ rt, program } = await loadProgram(compile().core, "engine", ["load", "finish"])); }, { timeout: 60000 }); // each loadProgram compiles via the bootstrap (~4s idle)

  test("renders the initial state: `<*phase/>` shows .Idle's body; two cards", () => {
    expect(stateText()).toBe("Ready");
    expect(loadButton().textContent).toBe("Load");
    expect(cards().map((c) => [c.querySelector("h3").textContent, c.querySelector("p").textContent])).toEqual([["One", "Idle"], ["Two", "Idle"]]);
  });

  test("finish() from .Idle is off the graph — E-ENGINE-INVALID-TRANSITION, and nothing changes", () => {
    expect(() => program.finish()).toThrow(/E-ENGINE-INVALID-TRANSITION/);
    expect(stateText()).toBe("Ready");
  });

  test("Load moves along the edge .Idle → .Loading; the body follows the variant", () => {
    click(loadButton());
    expect(stateText()).toBe("Loading…");
  });

  test("finish() is legal from .Loading → .Done", () => {
    program.finish();
    expect(stateText()).toBe("Done");
  });

  test("finish() from .Done is a no-op (a self-write, §51.0.F.1) — no error, no change", () => {
    expect(() => program.finish()).not.toThrow();
    expect(stateText()).toBe("Done");
  });

  test("load() from .Done is off the graph (.Done only moves to .Idle)", () => {
    expect(() => program.load()).toThrow(/E-ENGINE-INVALID-TRANSITION/);
    expect(stateText()).toBe("Done");
  });

  test("each card has its own `status` — two instances, two cells; writing one leaves the other", () => {
    const cs = instancesOf(rt, "card");
    expect(cs.length).toBe(2);
    const statusIdx = cs[0].decl.fields.indexOf("status");
    expect(cs[0].fields[statusIdx]).not.toBe(cs[1].fields[statusIdx]);
    cs[0].fields[statusIdx].set("Loading");
    expect(cards().map((c) => c.querySelector("p").textContent)).toEqual(["Loading", "Idle"]);
  });

  test("the program's phase is not a card's status (the `single` is the program's one cell)", () => {
    expect(cards()[1].querySelector("p").textContent).toBe("Idle");
    expect(stateText()).toBe("Done");
  });
});

// ---------------------------------------------------------------------------
// The program's negative lines. Every `→ E-…` line of the source is in this
// table; each is uncommented and must produce exactly its code.
// ---------------------------------------------------------------------------
const NEGATIVE = [
  { code: "E-COMPONENT-ENGINE-SCOPE", marker: "writing `single` on `status` here",
    edit: (src) => src.replace("<status:Phase=.Idle>", "<status:Phase=.Idle single>") },
  { code: "E-DECL-SINGLE-INSTANTIATED", marker: "<phase/> → E-DECL-SINGLE-INSTANTIATED",
    edit: (src) => replaceLine(src, "<phase/> → E-DECL-SINGLE-INSTANTIATED", "<phase/>") },
];

describe("§66.19.6 — negative lines", () => {
  test("the table covers every `→ E-…` line of the source", () => {
    const lines = negativeLines(SRC());
    expect(lines.length).toBe(NEGATIVE.length);
    for (const n of NEGATIVE) expect(lines.find((l) => l.includes(n.marker))).toContain(n.code);
  });

  test("`single` on `status` inside the multi-instance `<card>` → E-COMPONENT-ENGINE-SCOPE (§66.13.4)", () => {
    const n = NEGATIVE[0];
    const r = codesOf(mods, [{ path: "after.scrml", src: n.edit(SRC()) }]);
    expect(r).toEqual([n.code]);
  });

  test("E-COMPONENT-ENGINE-SCOPE's message names the per-instance form", () => {
    const d = compileDiags(NEGATIVE[0].edit(SRC()));
    expect(d[0].message).toContain("Drop `single`");
    expect(d[0].message).toContain("its own `status`");
  });

  test("`<phase/>` → E-DECL-SINGLE-INSTANTIATED (O55 RULED S442: a plain use of a `single` declaration is an error)", () => {
    const d = compileDiags(NEGATIVE[1].edit(SRC()));
    expect(d.map((x) => x.code)).toEqual(["E-DECL-SINGLE-INSTANTIATED"]);
    expect(d[0].message).toContain("<*phase/>");
  });

  test("O55 on a USER declaration: `<card … single>` used twice → E-DECL-SINGLE-INSTANTIATED at each use; `<*card/>` renders the one instance", async () => {
    const decl = `<program>\n    <card title:string="x" single>\n        <n:int=0/>\n    </>\n    renders <article>\${title}</article>\n    <main>\n@@\n    </main>\n</program>\n`;
    expect(compileDiags(decl.replace("@@", `        <card title="One"/>\n        <card title="Two"/>`)).map((x) => x.code))
      .toEqual(["E-DECL-SINGLE-INSTANTIATED", "E-DECL-SINGLE-INSTANTIATED"]);
    const ok = frontEnd(mods, [{ path: "c.scrml", src: decl.replace("@@", "        <*card/>\n        <*card/>") }]);
    expect(ok.diags).toEqual([]);
    const { rt } = await loadProgram(ok.core, "single-user");
    expect([...document.querySelectorAll("main > article")].map((a) => a.textContent)).toEqual(["x", "x"]);
    expect(instancesOf(rt, "card").length).toBe(1);
  });
});

function compileDiags(src) {
  return frontEnd(mods, [{ path: "after.scrml", src }]).diags;
}

// s478 (boot-missing-checks) — §51.0.F: "Inside a state-child body, the compiler knows
// `@marioState == .ThisVariant` … the rule= contract gives the legal targets; any other target
// is rejected statically." §51.0.F.1: a self-write to the current variant is a no-op, NOT a
// rule= violation, and the Info lint W-ENGINE-SELF-WRITE-DETECTED surfaces it (STRICT inside).
describe("§51.0.F / §51.0.F.1 — a literal write inside a state-child body", () => {
  const prog = (idle, loading = "", done = "") => `<program>
type Phase:enum = { Idle, Loading, Done }
<phase:Phase=.Idle single>
    <Idle rule=.Loading>
        <button onclick=\${${idle}}>a</>
    </>
    <Loading rule=.Done>${loading}</>
    <Done>${done}</>
</>
<*phase/>
</program>
`;
  const diags = (src) => compileDiags(src).map((d) => [d.code, d.severity]);

  test("a target in the state's rule= is legal — no diagnostic", () => {
    expect(diags(prog("@phase = .Loading"))).toEqual([]);
  });

  test("a target NOT in the state's rule= → E-ENGINE-INVALID-TRANSITION (Error), naming the state and its contract", () => {
    const d = compileDiags(prog("@phase = .Done"));
    expect(d.map((x) => [x.code, x.severity])).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
    expect(d[0].message).toContain("<Idle>");
    expect(d[0].message).toContain("`rule=.Loading`");
  });

  test("a state-child with no rule= has no legal target", () => {
    const src = prog("@phase = .Loading", "", `<button onclick=\${@phase = .Idle}>b</>`);
    expect(diags(src)).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });

  test("a self-write is W-ENGINE-SELF-WRITE-DETECTED (Info), never E-ENGINE-INVALID-TRANSITION — even though .Idle is not in Idle's rule=", () => {
    expect(diags(prog("@phase = .Idle"))).toEqual([["W-ENGINE-SELF-WRITE-DETECTED", "Info"]]);
  });

  test("a non-literal target is left to the runtime edge check", () => {
    expect(diags(prog("@phase = @phase"))).toEqual([]);
  });
});

// s478 fix r1 (#1894 H1) — §51.0.F: "Compile-time validation when from-state is statically
// known" … "When the from-state is dynamic (write outside any state-child body, or after a chain
// of conditionals), the rule= is enforced at runtime". The body fixes the from-state only up to
// the first statement that could move the field: an earlier write of it, or any call.
describe("§51.0.F — the from-state is known only until something could move the field", () => {
  const prog = (idle, extra = "", idleRule = "rule=.Loading") => `<program>
type Phase:enum = { Idle, Loading, Done }
<phase:Phase=.Idle single>
    <Idle ${idleRule}>
        <button onclick=\${${idle}}>a</>
    </>
    <Loading rule=.Done></>
    <Done></>
</>
<*phase/>
${extra}
</program>
`;
  const codes = (src) => compileDiags(src).map((d) => [d.code, d.severity]);
  const LOAD = "${ function load() { @phase = .Loading; } }";

  // red on #1894 head c7e31c9cb (each was E-ENGINE-INVALID-TRANSITION; base compiled them clean)
  test("a legal chain Idle → Loading → Done in one handler compiles clean", () => {
    expect(codes(prog("@phase = .Loading; @phase = .Done;"))).toEqual([]);
  });
  test("a call before the write makes the from-state dynamic (the call may move it)", () => {
    expect(codes(prog("load(); @phase = .Done;", LOAD))).toEqual([]);
  });
  test("a server call between the writes: no engine report (the failable is its own report)", () => {
    const src = prog("@phase = .Loading; const r: int = fetchIt(); @phase = .Done;", "${ server function fetchIt() -> int { return 1; } }");
    expect(codes(src).map((c) => c[0])).not.toContain("E-ENGINE-INVALID-TRANSITION");
  });
  test("a write of the variant after an earlier write is not a self-write: no W-ENGINE-SELF-WRITE-DETECTED", () => {
    expect(codes(prog("@phase = .Loading; @phase = .Idle;"))).toEqual([]);
  });
  // conservative extensions of the same rule (not probed on c7e31c9cb)
  test("an earlier `if` that writes the field in a branch makes the from-state dynamic", () => {
    expect(codes(prog("if (true) { @phase = .Loading; } @phase = .Done;"))).toEqual([]);
  });
  test("a call in the enclosing `if` condition makes the from-state dynamic", () => {
    const src = prog("if (ok()) { @phase = .Done; }", "${ function ok() -> boolean { return true; } }");
    expect(codes(src)).toEqual([]);
  });

  // guards: what the static check must still catch
  test("the FIRST write is still checked, whatever follows it", () => {
    expect(codes(prog("@phase = .Done; @phase = .Loading;"))).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });
  test("an earlier statement that cannot move the field keeps the from-state known", () => {
    expect(codes(prog("const k: int = 1; @phase = .Done;"))).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });
  test("a write inside a nested `if` arm (no call, no earlier write) is still checked", () => {
    expect(codes(prog("if (true) { @phase = .Done; }"))).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });
  test("a first-statement self-write is still W-ENGINE-SELF-WRITE-DETECTED (Info)", () => {
    expect(codes(prog("@phase = .Idle; @phase = .Loading;"))).toEqual([["W-ENGINE-SELF-WRITE-DETECTED", "Info"]]);
  });
  test("a multi-target rule= is still checked", () => {
    expect(codes(prog("@phase = .Idle; @phase = .Done;", "", "rule=(.Loading | .Done)"))).toEqual([["W-ENGINE-SELF-WRITE-DETECTED", "Info"]]);
    expect(codes(prog("@phase = .Done;", "", "rule=(.Loading | .Done)"))).toEqual([]);
  });
  test("a `:`-shorthand body's write is still checked", () => {
    const src = `<program>
type Phase:enum = { Idle, Loading, Done }
<phase:Phase=.Idle single>
    <Idle rule=.Loading : <button onclick=\${@phase = .Done}>a</>>
    <Loading rule=.Done : "l">
    <Done : "d">
</>
<*phase/>
</program>
`;
    expect(codes(src)).toEqual([["E-ENGINE-INVALID-TRANSITION", "Error"]]);
  });
});

// s478 fix r1 (#1894 L1) — §51.0.F: "Three accepted forms" (`rule=.NextVariant`,
// `rule=(.A | .B | .C)`, `rule=*`). A quoted spelling is none of them; before it was read as no
// rule at all (base: silently accepted; #1894 head: a misleading "no rule=" transition error).
describe("§51.0.F — a `rule=` spelling that is not one of the three forms is refused by name", () => {
  const prog = (rule) => `<program>
type Phase:enum = { Idle, Loading, Done }
<phase:Phase=.Idle single>
    <Idle ${rule}>
        <button onclick=\${@phase = .Done}>a</>
    </>
    <Loading rule=.Done></>
    <Done></>
</>
<*phase/>
</program>
`;
  const ds = (src) => compileDiags(src);
  test.each([['rule=".Loading"', '`rule=".Loading"`'], ['rule="*"', '`rule="*"`']])("%s → one E-BOOTSTRAP-UNSUPPORTED naming the spelling, nothing cascading", (rule, shown) => {
    const d = ds(prog(rule));
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain(shown);
    expect(d[0].message).toContain("§51.0.F");
  });
  test("an unquoted rule= naming no variant (`rule=Loading`) → one E-BOOTSTRAP-UNSUPPORTED", () => {
    expect(ds(prog("rule=Loading")).map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
