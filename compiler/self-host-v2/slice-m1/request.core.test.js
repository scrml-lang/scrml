// request.core.test.js — s475: Core View.Request (the request machine, SPEC
// §6.7.7 / §13.9.2) through check.scrml (C-R1) and the printer, run in happy-dom
// against the slice runtime. No source form lowers to View.Request yet, so the
// node is grafted by hand onto the counter program — the hand-built Core, or,
// with SLICE_CORE=lowered, the Core the M2 front end lowers from the same source.
//
//   counter + let <res:int=0/>, let <loading:bool=false/>, let <stale:bool=false/>
//   renders += Request(target @res, deps [@count],
//                      body: Suspend(v, @count + 100, { @res = v }),
//                      mount: true, state: { loading, stale })
//              <p id="res">${@res}</p>

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadSuite } from "./cores.js";
import { loadProgram, expectNoPageErrors, click, instancesOf } from "./load-program.js";

let mods, cores, C;
afterEach(() => expectNoPageErrors());
beforeAll(() => { ({ mods, cores } = loadSuite()); C = mods.core; }, { timeout: 120000 });

const tick = () => new Promise((r) => setTimeout(r, 0));
const clone = (x) => JSON.parse(JSON.stringify(x));

/** The counter Core with the request grafted on; `edit(parts)` may change the body before it is built. */
function requestCore(edit) {
  const core = clone(cores.counter());
  const prog = core.decls.find((d) => d.sym.id === core.program.id);
  const P = prog.sym;
  const here = C.InstRef.Lexical(0);
  const idxOf = (hint) => prog.fields.findIndex((f) => f.sym.hint === hint);
  const count = idxOf("count");
  const template = prog.fields[count];
  const mkField = (id, hint, ty, init) => ({ ...clone(template), sym: C.mkSym(id, hint), ty, init, wcap: C.mkSym(id + 1, hint) });
  const fRes = mkField(910001, "res", C.Type.Int, C.litInt(0));
  const fLoading = mkField(910003, "loading", C.Type.Bool, C.Expr.Lit(C.Literal.Bool(false)));
  const fStale = mkField(910005, "stale", C.Type.Bool, C.Expr.Lit(C.Literal.Bool(false)));
  prog.fields = [...prog.fields, fRes, fLoading, fStale];
  const RES = idxOf("res"), LOADING = idxOf("loading"), STALE = idxOf("stale");
  const dep = (idx) => ({ decl: P, inst: here, idx });
  const v = C.mkSym(910010, "v");
  const parts = {
    pre: [],
    on: C.prim2(C.PrimOp.Add, C.readField(P, here, count), C.litInt(100)),
    then: [C.Stmt.Write(fRes.wcap, here, C.EditKind.Replace, C.Expr.Local(v), C.Check.Static)],
    wcaps: { res: fRes.wcap, count: template.wcap },
  };
  if (edit) edit(parts, { here });
  const body = C.block([...parts.pre, C.Stmt.Suspend(v, parts.on, C.block(parts.then))]);
  const req = C.View.Request(dep(RES), [dep(count)], body, true, { loading: dep(LOADING), data: null, error: null, stale: dep(STALE) });
  const shown = C.el("p", [C.Attr.Static("id", "res")], [C.dyn(C.readField(P, here, RES))]);
  prog.renders = [...prog.renders, req, shown];
  return core;
}

const res = () => document.querySelector("#res").textContent;
const incButton = () => [...document.querySelectorAll("main > button")][0];

describe("C-R1 — a Request's body is its load (check.scrml)", () => {
  test("the well-formed Request checks clean", () => {
    expect(mods.check.checkCore(requestCore())).toEqual([]);
  });

  test("a body that writes the target twice is refused (§6.7.7 exactly one assignment)", () => {
    const core = requestCore((p) => { p.then = [...p.then, ...p.then]; });
    expect(mods.check.checkCore(core).join("\n")).toMatch(/C-R1: a Request body holds 2 Writes/);
  });

  test("a body that writes another cell is refused", () => {
    const core = requestCore((p, { here }) => {
      p.then = [C.Stmt.Write(p.wcaps.count, here, C.EditKind.Replace, C.litInt(1), C.Check.Static)];
    });
    const msgs = mods.check.checkCore(core).join("\n");
    expect(msgs).toMatch(/C-R1: a Request body writes <program>\.count, not its target/);
  });

  test("a body whose load is not its last statement (a Write before the Suspend) is refused", () => {
    const core = requestCore((p, { here }) => {
      p.pre = [C.Stmt.Write(p.wcaps.res, here, C.EditKind.Replace, C.litInt(1), C.Check.Static)];
    });
    expect(mods.check.checkCore(core).join("\n")).toMatch(/C-R1: a Request body's statement 0 is not a Let/);
  });

  test("a continuation that suspends again is refused (one suspension)", () => {
    const core = requestCore((p) => {
      p.then = [C.Stmt.Suspend(C.mkSym(910020, "w"), C.litInt(1), C.block(p.then))];
    });
    expect(mods.check.checkCore(core).join("\n")).toMatch(/C-R1: a Request's continuation suspends again/);
  });
});

describe("the request machine through the printer", () => {
  test("mount runs the load; the target lands on settle; a dependency change reloads with keep-stale", async () => {
    const { out, rt } = await loadProgram(requestCore(), "request");
    expect(out.js).toContain("rt.requestOn(scope$, ");
    expect(out.js).toContain("mount: true");
    const prog = instancesOf(rt, "program")[0];
    const field = (hint) => prog.fields[prog.decl.fields.indexOf(hint)];
    // the mount load (a value that is already there) has settled by the time the module import resolves
    await tick();
    expect(res()).toBe("100");
    expect([field("loading").peek(), field("stale").peek()]).toEqual([false, false]);
    click(incButton());                                    // @count = 1 → reload
    expect(res()).toBe("100");                             // keep-stale (§13.9.4)
    expect([field("loading").peek(), field("stale").peek()]).toEqual([true, true]);
    await tick();
    expect(res()).toBe("101");
    expect([field("loading").peek(), field("stale").peek()]).toEqual([false, false]);
  });
  // supersede (EC-2) and teardown (EC-3) need loads the test settles out of order:
  // request.runtime.test.js drives them through rt.requestOn directly.
});
