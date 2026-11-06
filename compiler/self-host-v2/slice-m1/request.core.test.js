// request.core.test.js — s475: Core View.Request (the request machine, SPEC
// §6.7.7 / §13.9.2) through check.scrml (C-R1) and the printer, run in happy-dom
// against the slice runtime. No source form lowers to View.Request yet, so the
// node is grafted by hand onto the counter program — the hand-built Core, or,
// with SLICE_CORE=lowered, the Core the M2 front end lowers from the same source.
//
//   counter + let <res:int=0/>, let <loading:bool=false/>, let <stale:bool=false/>,
//             let <data:int?=not/>, let <error:?=not/>
//   renders += Request(target @res, deps [@count],
//                      body: Suspend(v, @count + 100, { @res = v }),
//                      mount: true, state: { loading, data, error, stale }, handle: not)
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
  const fData = mkField(910007, "data", C.Type.Int, C.litInt(0));
  const fError = mkField(910009, "error", C.Type.Int, C.litInt(0));
  const fOther = mkField(910011, "other", C.Type.Int, C.litInt(0));
  prog.fields = [...prog.fields, fRes, fLoading, fStale, fData, fError, fOther];
  const RES = idxOf("res"), LOADING = idxOf("loading"), STALE = idxOf("stale"), DATA = idxOf("data"), ERROR = idxOf("error"), OTHER = idxOf("other");
  const dep = (idx) => ({ decl: P, inst: here, idx });
  const v = C.mkSym(910010, "v");
  const parts = {
    pre: [],
    on: C.prim2(C.PrimOp.Add, C.readField(P, here, count), C.litInt(100)),
    then: [C.Stmt.Write(fRes.wcap, here, C.EditKind.Replace, C.Expr.Local(v), C.Check.Static)],
    wcaps: { res: fRes.wcap, count: template.wcap, other: fOther.wcap },
    target: dep(RES),
    deps: [dep(count)],
    mount: true,
    state: { loading: dep(LOADING), data: dep(DATA), error: dep(ERROR), stale: dep(STALE) },
    handle: null,
    cls: C.ReqClass.ReqWrite,
  };
  const bump = core.fns.find((f) => f.sym.hint === "bump");   // the counter's writing function (it writes @count)
  if (edit) edit(parts, { here, dep, bump, idx: { RES, LOADING, STALE, DATA, ERROR, OTHER, count } });
  const body = C.block([...parts.pre, C.Stmt.Suspend(v, parts.on, C.block(parts.then))]);
  const req = C.View.Request(parts.target, parts.deps, body, parts.mount, parts.state, parts.handle, parts.cls);
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

// s475 r1 — the adversarial review of #1771 (repros H1–H4, H7 from
// ~/.cache/scrml/review/s475-1771/adv.check.test.js): each checked CLEAN on
// dfeeb6fc5, and each is a request that re-triggers itself forever (F1) or
// writes before its load (F2).
describe("C-R1 r1 — no self-trigger, no write besides the target's (F1 / F2)", () => {
  const msgs = (edit) => mods.check.checkCore(requestCore(edit)).join("\n");
  const call = (f) => C.Expr.Call(f.sym, []);

  test("H1: the continuation calls a function that writes a dependency (bump writes @count) — refused", () => {
    expect(msgs((p, x) => { p.then = [C.Stmt.Eval(call(x.bump)), ...p.then]; }))
      .toMatch(/C-R1: a Request body writes reactive state besides its one Write of the target — through `bump\(\)`: a Write of <program>\.count/);
  });

  test("H2 / H7: a Let initializer calls a writing function (a write before the load) — refused", () => {
    expect(msgs((p, x) => { p.pre = [C.Stmt.Let(C.mkSym(910030, "z"), call(x.bump))]; }))
      .toMatch(/C-R1: a Request body writes reactive state besides its one Write of the target — through `bump\(\)`/);
  });

  test("H7: a Let that calls a function writing the TARGET before the load — refused", () => {
    // the target is @count; bump writes @count before the load settles (keep-stale broken)
    expect(msgs((p, x) => {
      p.target = x.dep(x.idx.count); p.deps = [x.dep(x.idx.OTHER)];
      p.then = [C.Stmt.Write(p.wcaps.count, x.here, C.EditKind.Replace, C.litInt(7), C.Check.Static)];
      p.pre = [C.Stmt.Let(C.mkSym(910031, "z"), call(x.bump))];
    })).toMatch(/C-R1: a Request body writes reactive state besides its one Write of the target — through `bump\(\)`: a Write of <program>\.count/);
  });

  test("the one Write's value calling a writing function — refused", () => {
    expect(msgs((p, x) => { p.then = [C.Stmt.Write(p.wcaps.res, x.here, C.EditKind.Replace, call(x.bump), C.Check.Static)]; }))
      .toMatch(/through `bump\(\)`/);
  });

  test("H3: the target is one of its dependencies — refused", () => {
    expect(msgs((p, x) => { p.deps = [x.dep(x.idx.RES)]; })).toMatch(/C-R1: a Request's target is one of its dependencies/);
  });

  test("H4: a signal among the deps, a signal equal to the target, two signals on one cell — refused", () => {
    const m = msgs((p, x) => {
      p.deps = [x.dep(x.idx.LOADING)];
      p.state = { ...p.state, data: x.dep(x.idx.RES), stale: x.dep(x.idx.LOADING) };
    });
    expect(m).toMatch(/C-R1: a Request's `loading` signal is one of its dependencies/);
    expect(m).toMatch(/C-R1: a Request's `data` signal is its target/);
    expect(m).toMatch(/C-R1: a Request's `stale` signal shares its cell with another signal/);
  });

  test("`mount: false` with no dependencies can never run — refused", () => {
    expect(msgs((p) => { p.mount = false; p.deps = []; })).toMatch(/C-R1: a Request with `mount: false` and no dependencies can never run/);
  });

  test("`mount: false` with a dependency, and `deps=[]` with `mount: true`, check clean", () => {
    expect(msgs((p) => { p.mount = false; })).toBe("");
    expect(msgs((p) => { p.deps = []; })).toBe("");
  });
});

// s475 (S5a) — C-R2: a READ Request's load is ONE server call whose server work is SELECTs
// (§6.7.7.1 rule 1). A WRITE Request is never checked (discard is never wrong).
describe("C-R2 — a READ Request is one server call (§6.7.7.1 rule 1)", () => {
  const msgs = (edit) => mods.check.checkCore(requestCore(edit)).join("\n");
  test("the counter's load (a local value, no server call) is clean as WRITE, refused as READ", () => {
    expect(msgs(() => {})).toBe("");
    expect(msgs((p) => { p.cls = C.ReqClass.ReqRead; }))
      .toMatch(/C-R2: a READ Request's load is not one server call/);
  });
  test("a READ Request calling something that is not a server function is refused", () => {
    expect(msgs((p) => { p.cls = C.ReqClass.ReqRead; p.on = C.Expr.ServerCall(C.mkSym(919999, "ghost"), []); }))
      .toMatch(/C-R2: a READ Request calls `ghost`, which is not a server function/);
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

describe("r1 F3 — the request's handle and its full state", () => {
  test("a handle names a program-level slot (s475 S3b: `const <h> = rt.requestSlot()`) the request fills while mounted", async () => {
    const h = C.mkSym(910040, "req");
    const core = requestCore((p) => { p.handle = h; });
    expect(mods.check.checkCore(core)).toEqual([]);
    const { out } = await loadProgram(core, "request-handle");
    expect(out.js).toMatch(/^const req\w* = rt\.requestSlot\(\);$/m);
    expect(out.js).toMatch(/^\s*rt\.requestOn\(scope\$, /m);
    expect(out.js).toMatch(/slot: req\w* \}\);/);
    expect(out.js).toContain("state: {");
  });

  test("without a handle the call is a statement; without state no `state:` is printed", async () => {
    const core = requestCore((p) => { p.state = null; });
    expect(mods.check.checkCore(core)).toEqual([]);
    const { out } = await loadProgram(core, "request-nostate");
    expect(out.js).toMatch(/^\s*rt\.requestOn\(scope\$, /m);
    expect(out.js).not.toContain("state: {");
  });
});

describe("r1 — a request inside a Cond arm (the review's print repro)", () => {
  test("an arm switch tears the arm's request down and the other arm's starts; requests never accumulate", async () => {
    const core = clone(cores.counter());
    const prog = core.decls.find((d) => d.sym.id === core.program.id);
    const P = prog.sym, here = C.InstRef.Lexical(0);
    const idxOf = (h) => prog.fields.findIndex((f) => f.sym.hint === h);
    const count = idxOf("count"), template = prog.fields[count];
    const mk = (id, hint, ty, init) => ({ ...clone(template), sym: C.mkSym(id, hint), ty, init, wcap: C.mkSym(id + 1, hint) });
    const fA = mk(920001, "a", C.Type.Int, C.litInt(0)), fB = mk(920003, "b", C.Type.Int, C.litInt(0));
    const sig = [mk(920005, "lo", C.Type.Bool, C.Expr.Lit(C.Literal.Bool(false))), mk(920007, "da", C.Type.Int, C.litInt(0)),
                 mk(920009, "er", C.Type.Int, C.litInt(0)), mk(920011, "st", C.Type.Bool, C.Expr.Lit(C.Literal.Bool(false)))];
    prog.fields = [...prog.fields, fA, fB, ...sig];
    const dep = (idx) => ({ decl: P, inst: here, idx });
    const state = { loading: dep(idxOf("lo")), data: dep(idxOf("da")), error: dep(idxOf("er")), stale: dep(idxOf("st")) };
    const mkReq = (vid, f, add, st, handle) => {
      const v = C.mkSym(vid, "v");
      const body = C.block([C.Stmt.Suspend(v, C.prim2(C.PrimOp.Add, C.readField(P, here, count), C.litInt(add)),
        C.block([C.Stmt.Write(f.wcap, here, C.EditKind.Replace, C.Expr.Local(v), C.Check.Static)]))]);
      return C.View.Request(dep(idxOf(f.sym.hint)), [dep(count)], body, true, st, handle, C.ReqClass.ReqWrite);
    };
    const even = C.prim2(C.PrimOp.EqPrim, C.prim2(C.PrimOp.Mod, C.readField(P, here, count), C.litInt(2)), C.litInt(0));
    prog.renders = [...prog.renders,
      C.View.Cond([{ test: even, body: [mkReq(920020, fA, 100, state, C.mkSym(920030, "ra")), C.el("span", [], [])] },
                   { test: C.Expr.Lit(C.Literal.Bool(true)), body: [mkReq(920021, fB, 200, null, null)] }]),
      C.el("p", [C.Attr.Static("id", "ab")], [C.dyn(C.readField(P, here, idxOf("a"))), C.textView(","), C.dyn(C.readField(P, here, idxOf("b")))])];
    expect(mods.check.checkCore(core)).toEqual([]);
    const { rt } = await loadProgram(core, "request-cond");
    const ab = () => document.querySelector("#ab").textContent;
    await tick();
    expect([ab(), rt.stats.requests]).toEqual(["100,0", 1]);
    click(incButton()); await tick();                     // odd: arm 2 mounts, arm 1's request is torn down
    expect([ab(), rt.stats.requests]).toEqual(["100,201", 1]);
    click(incButton()); await tick();
    expect([ab(), rt.stats.requests]).toEqual(["102,201", 1]);
  });
});
