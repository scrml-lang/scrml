// ownership-hardening-s478.test.js — s478-boot-ownership-hardening: the in-place proof for a
// LOCAL tape (print.scrml `ownedLocals`, s476) fails closed in two places it used to trust.
//
//   A. `ownSeq` — the receiver of a sequence function (`xs.filter(…)` …) is exempt from the
//      scan only when the op is on an explicit ALLOWLIST of ops proven to keep no reference
//      to it (`receiverSafeSeqs`). Every op today is on it (so emit is unchanged); an op that
//      is not makes its receiver an ordinary read — the local copies on every write.
//      (gap g-boot-ownseq-op-allowlist-s477)
//   B. the Sym positions walk.scrml `kids` does not reach — `Suspend.bind`, `Attempt.result`
//      and an FSettled call's `outcome` (with an Attempt's success / whole-error binders) —
//      disqualify the local they name. (gap g-boot-ownedlocals-kids-blind-spots-s477)
//
// SPEC §66.10 items 1-2: a value taken from a binding is a snapshot; no later write to the
// source is observable through it. In-place editing is only sound when nothing else holds
// the value — so an unproven position must copy.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods, C;
beforeAll(() => { ({ mods } = loadM2()); C = mods.core; }, { timeout: 120000 });

const clean = (src) => {
  const r = frontEnd(mods, [{ path: "t.scrml", src }]);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r.core;
};
const prog = (body) =>
  `<program>\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n        <p id="o">\${@shown}</p>\n    </main>\n</program>\n`;
const goOf = (core) => core.fns.find((f) => f.sym.hint === "go");
const fnText = (js, name) => {
  const at = js.indexOf(`function ${name}(`);
  expect(at).toBeGreaterThanOrEqual(0);
  const next = js.indexOf("\nfunction ", at + 1);
  return js.slice(at, next < 0 ? js.length : next);
};
const goJs = (core) => fnText(mods.print.printProgram(core, "t.client.js", "scrml-runtime.js").js, "go");
// the owned locals of `go`, by name
const owned = (core) => {
  const go = goOf(core);
  const names = new Map();
  const visit = (x) => {
    if (x === null || typeof x !== "object") return;
    if (typeof x.id === "number" && typeof x.hint === "string") names.set(x.id, x.hint);
    for (const v of Object.values(x)) visit(v);
  };
  visit(go.body);
  return mods.print.ownedLocals(go.body).map((o) => names.get(o.id)).sort();
};
// the `a` Sym and the `Let a` statement of `go`
const letA = (core) => goOf(core).body.stmts.find((s) => s.variant === "Let" && s.data.sym.hint === "a");
// every SeqCall node below `x`
const seqCalls = (x, out = []) => {
  if (x === null || typeof x !== "object") return out;
  if (x.variant === "SeqCall") out.push(x);
  for (const v of Object.values(x)) seqCalls(v, out);
  return out;
};
const withStmt = (core, s) => {
  const go = goOf(core);
  go.body = C.block([go.body.stmts[0], s, ...go.body.stmts.slice(1)]);
  return core;
};

// one program per sequence function: the receiver `a` is read by the op, then appended to
const OPS = {
  Filter: "const n: int = a.filter(x => x > 1).length;",
  Map: "const n: int = a.map(x => x + 1).length;",
  Some: "const n: bool = a.some(x => x > 1);",
  Every: "const n: bool = a.every(x => x > 1);",
  SortBy: "const n: int = a.sort((x, y) => x - y).length;",
};
const opProg = (op) => prog(`        let a: int[free, append] = [3, 1];\n        ${OPS[op]}\n        a.append(2);\n        @shown = a.map(v => \`\${v}\`).join(",");`);

// ---------------------------------------------------------------------------
describe("A — `ownSeq` exempts a receiver only for an allowlisted op", () => {
  test("every SeqFn variant is classified here (a new op must be added to this table and proven)", () => {
    const seen = new Set();
    for (const op of Object.keys(OPS)) {
      const calls = seqCalls(goOf(clean(opProg(op))).body);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) seen.add(c.data.op);
    }
    // the five ops of core.scrml `SeqFn` — all on the allowlist (see print.scrml receiverSafeSeqs)
    expect([...seen].sort()).toEqual(["Every", "Filter", "Map", "Some", "SortBy"].sort());
  });

  for (const op of Object.keys(OPS)) {
    test(`${op} (allowlisted): the receiver stays owned — the append is in place`, () => {
      const core = clean(opProg(op));
      expect(owned(core)).toEqual(["a"]);
      expect(goJs(core)).toContain("tapeAppendOwned(");
    });
  }

  test("an op NOT on the allowlist: the receiver escapes — `a` is not owned (every write copies)", () => {
    const core = clean(opProg("Filter"));
    expect(owned(core)).toEqual(["a"]);
    // a hypothetical sequence function the allowlist does not name
    for (const c of seqCalls(goOf(core).body)) c.data.op = "Retains";
    expect(owned(core)).toEqual([]);
  });

  test("a receiver that is not a bare local, or a non-lambda function, is an ordinary read (unchanged)", () => {
    const core = clean(prog(`        let a: int[free, append] = [3, 1];\n        const b: int[] = a;\n        const n: int = b.filter(x => x > 1).length;\n        a.append(2);\n        @shown = a.map(v => \`\${v}\`).join(",");`));
    expect(owned(core)).toEqual([]);
    expect(goJs(core)).toContain("rt.tapeAppend(");
  });
});

// ---------------------------------------------------------------------------
describe("B — a local named by a Sym walk.kids does not reach is disqualified", () => {
  const base = () => clean(prog(`        let a: int[free, append] = [1];\n        a.append(2);\n        @shown = a.map(v => \`\${v}\`).join(",");`));
  const lit = () => C.Expr.Lit(C.Literal.Int(0));
  const fresh = (id, hint) => C.mkSym(id, hint);
  const okArm = (bind) => ({ bind, body: C.block([]), value: lit() });
  const errSym = () => fresh(978001, "E");

  test("control: the program's `a` is owned, and a statement naming only fresh Syms keeps it owned", () => {
    expect(owned(base())).toEqual(["a"]);
    const s = C.Stmt.Suspend(fresh(978010, "o"), lit(), C.block([]));
    expect(owned(withStmt(base(), s))).toEqual(["a"]);
    const t = C.Stmt.Attempt(fresh(978011, "r"), C.Failable.FSettled(fresh(978012, "o")), errSym(), okArm(fresh(978013, "v")), []);
    expect(owned(withStmt(base(), t))).toEqual(["a"]);
  });

  test("Suspend.bind naming `a`: not owned", () => {
    const core = base();
    const a = letA(core).data.sym;
    expect(owned(withStmt(core, C.Stmt.Suspend(a, lit(), C.block([]))))).toEqual([]);
  });

  test("Attempt.result naming `a`: not owned", () => {
    const core = base();
    const a = letA(core).data.sym;
    const t = C.Stmt.Attempt(a, C.Failable.FSettled(fresh(978020, "o")), errSym(), okArm(fresh(978021, "v")), []);
    expect(owned(withStmt(core, t))).toEqual([]);
  });

  test("FSettled outcome reading `a`: not owned", () => {
    const core = base();
    const a = letA(core).data.sym;
    const t = C.Stmt.Attempt(not(), C.Failable.FSettled(a), errSym(), okArm(fresh(978031, "v")), []);
    expect(owned(withStmt(core, t))).toEqual([]);
  });

  test("an Attempt's success binder or whole-error binder naming `a`: not owned", () => {
    const core1 = base();
    const t1 = C.Stmt.Attempt(not(), C.Failable.FSettled(fresh(978040, "o")), errSym(), okArm(letA(core1).data.sym), []);
    expect(owned(withStmt(core1, t1))).toEqual([]);
    const core2 = base();
    const arm = { pat: C.Pattern.PWild, body: C.block([]), value: lit(), whole: letA(core2).data.sym };
    const t2 = C.Stmt.Attempt(not(), C.Failable.FSettled(fresh(978041, "o")), errSym(), okArm(fresh(978042, "v")), [arm]);
    expect(owned(withStmt(core2, t2))).toEqual([]);
  });
});

// `not` as the compiled bootstrap represents it (an absent optional field)
function not() { return null; }
