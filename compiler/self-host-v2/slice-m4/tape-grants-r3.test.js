// tape-grants-r3.test.js — s469-boot-tape-grants-2: the final-review
// follow-ups of #1528 (SPEC §66.12.6 "No position escapes the grants").
//
//   F1  RULED S469 "Not a tape position": an ENUM PAYLOAD is a value — grants
//       do not apply inside it, so every whole enum write (a write, a
//       transition, `reset`, `reset-on=`, `persist="local"`'s cross-tab value)
//       is accepted over a `replace`-less payload tape, while a struct cell's
//       tape field stays judged (#1528).
//   F3  `@o = { ...@o, inner: { ys: @o.inner.ys } }` (and the instance form) is
//       accepted by the analyzer AND by Core: Core reads a read through the
//       spread's snapshot Local as the place it snapshots.
//   F4  identity overrides (`xs: @b.xs`, `inner: @o.inner`) are keeps, not
//       `replace`s.
// (F2, the structural scan, is in tape-write-forms.test.js.)

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src, files) => frontEnd(mods, files ?? [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const P = (decls, fn = "", main = `        <p>x</p>\n`) => `<program>\n${decls}${fn ? `    function go() {\n        ${fn}\n    }\n` : ""}    <main>\n${fn ? "        <button onclick=go()>go</button>\n" : ""}${main}    </main>\n</program>\n`;
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};
const clean = (src, files) => {
  const r = run(src, files);
  expect(r.diags.map((d) => d.code + ": " + d.message)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return structuredClone(r.core);
};
// a payload / field tape TYPE's SeqGrants in Core, by field name
const tapeTypeGrants = (core, name) => find(core.types, (n) => n.sym && n.sym.hint === name && n.ty && n.ty.data && n.ty.data.grants)[0].ty.data.grants;

const ENUM = (t, extra = "") => `    type E:enum = { Dot, A(xs: ${t}) }\n    let <e:E=.Dot${extra}/>\n    function mk()! E {\n        fail .A([1, 2, 3]);\n    }\n`;
const TRANS = (t) => `    type E:enum = { Dot, A(xs: ${t}) }\n    <e:E=.Dot>\n        <Dot rule=.A/>\n        <A rule=.Dot/>\n    </>\n    function mk()! E {\n        fail .A([1]);\n    }\n`;
const ENUM_IN_STRUCT =(t) => `    type Box:struct = { xs: ${t} }\n    type E:enum = { Dot, A(b: Box) }\n    let <e:E=.Dot/>\n`;

// RULED S469 (bryan, on Q8 of this lane): "Not a tape position". An enum payload
// is a VALUE: grants do not apply inside it, and a whole write of such an enum
// (a cross-tab sync included) is not judged against a payload tape's grants. A
// struct INSIDE a payload is a payload value too. A struct-typed CELL or struct
// field whose tape field lacks `replace` stays judged (#1528) — the regression
// guards below.
describe("RULED S469 — an enum payload is a value, not a tape position (§66.12.6)", () => {
  const UNGRANTED = "int[free, append]";
  // [form, decls, body]
  const FORMS = [
    ["a `fail` payload written whole (`!{ _ x :> @e = x }`)", ENUM(UNGRANTED), "mk() !{ _ x :> @e = x };"],
    ["a variant switch to a payload-free variant (`@e = .Dot`)", ENUM(UNGRANTED), "@e = .Dot;"],
    ["`reset(@e)`", ENUM(UNGRANTED), "reset(@e);"],
    ["a `rule=` transition", TRANS(UNGRANTED), "@e = .Dot;"],
    ["a `rule=` transition to the payload variant", TRANS(UNGRANTED), "mk() !{ _ x :> @e = x };"],
    ["a payload STRUCT's tape (`@e = .Dot`)", ENUM_IN_STRUCT(UNGRANTED), "@e = .Dot;"],
    ["a struct field holding the enum, written whole", `    type E:enum = { Dot, A(xs: ${UNGRANTED}) }\n    type W:struct = { title: string, let e: E }\n    let <w:W=({ title: "t", e: .Dot })/>\n`, "@w.e = .Dot;"],
    ["a genuine replace of a struct whose enum field is rewritten", `    type E:enum = { Dot, A(xs: ${UNGRANTED}) }\n    type W:struct = { title: string, e: E }\n    let <w:W=({ title: "t", e: .Dot })/>\n`, "@w = { title: \"u\", e: .Dot };"],
  ];
  for (const [form, decls, body] of FORMS) {
    test(`${form} — an ungranted payload tape: clean (analyzer and Core)`, () => {
      clean(P(decls, body));
    });
  }
  test("`persist=\"local\"` (a cross-tab value is a whole enum write): clean, payload tape or payload struct", () => {
    clean(P(ENUM(UNGRANTED, ` persist="local" key="r3.e"`), ""));
    clean(P(ENUM_IN_STRUCT(UNGRANTED).replace("let <e:E=.Dot/>", "let <e:E=.Dot persist=\"local\" key=\"r3.s\"/>"), ""));
  });
  test("`reset-on=`: clean", () => {
    clean(P(`    let <n:int=0/>\n` + ENUM(UNGRANTED, " reset-on=[@n]"), ""));
  });
  test("a local enum's rebinding: clean", () => {
    expect(codes(P(`    type E:enum = { Dot, A(xs: ${UNGRANTED}) }\n`, "let e: E = .Dot;\n        e = .Dot;"))).toEqual([]);
  });
  // regression guards: a struct CELL / struct field with an append-only tape field stays judged (#1528)
  const BOXC = `    type Box:struct = { title: string, xs: ${UNGRANTED} }\n    let <b:Box=({ title: "t", xs: [1] })/>\n`;
  test("guard: a struct cell's whole write that replaces its tape field is still E-WRITE-NOT-GRANTED", () => {
    expect(codes(P(BOXC, "@b = { title: \"u\", xs: [] };"))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
  test("guard: a struct field holding a struct with a tape is still judged", () => {
    expect(codes(P(`    type In:struct = { ys: ${UNGRANTED} }\n    type O:struct = { title: string, let inner: In }\n    let <o:O=({ title: "t", inner: { ys: [1] } })/>\n`, "@o.inner = { ys: [] };"))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
  test("guard: `persist=\"local\"` / `reset` of a struct cell with an append-only tape field stay refused", () => {
    expect(codes(P(BOXC.replace("/>", " persist=\"local\" key=\"r3.b\"/>"), ""))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P(BOXC, "reset(@b);"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("guard: Core C3 still judges a struct cell's tape field", () => {
    const core = clean(P(BOXC, "@b = { title: \"u\", xs: @b.xs };"));
    const w = find(core.fns, (n) => n.variant === "Write")[0];
    w.data.value.data.fields[1] = { variant: "ArrayOf", data: { elems: [] } };
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("tape field `b.xs`"))).toBe(true);
  });
});

const NEST = `    type In:struct = { ys: int[free, append] }\n    type O:struct = { title: string, let inner: In }\n    let <o:O=({ title: "t", inner: { ys: [1] } })/>\n`;
const BOX = `    type Box:struct = { title: string, xs: int[free, append] }\n    let <b:Box=({ title: "t", xs: [1] })/>\n`;
const DOC = `type In:struct = { ys: int[free, append] }\n<doc title:string>\n    export let <inner:In=({ ys: [1] })/>\n</>\nrenders <p class="doc">\${title}</p>\n`;
const inst = (fn) => `${DOC}<program>\n    function go() { ${fn} }\n    <main>\n        <doc as=d title="x"/>\n        <button onclick=go()>go</button>\n    </main>\n</program>\n`;

describe("F3 — a spread override that keeps a nested tape: the analyzer and Core agree", () => {
  test("`@o = { ...@o, inner: { ys: @o.inner.ys } }` — clean in both (no raw C3)", () => {
    clean(P(NEST, "@o = { ...@o, inner: { ys: @o.inner.ys } };"));
  });
  test("with a call in another override (the Commit form: values bound to Locals first)", () => {
    clean(P(NEST, "@o = { ...@o, title: nm(), inner: { ys: @o.inner.ys } };\n    }\n    function nm() -> string {\n        return \"x\";"));
  });
  test("the declaration-instance form `@d = { ...@d, inner: { ys: @d.inner.ys } }` — clean in both", () => {
    clean(inst("@d = { ...@d, inner: { ys: @d.inner.ys } };"));
  });
  test("a tape REPLACED in the same shape is still refused (the analyzer first, with its own code)", () => {
    expect(codes(P(NEST, "@o = { ...@o, inner: { ys: [] } };"))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(inst("@d = { ...@d, inner: { ys: [] } };"))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
  // soundness controls for the snapshot reading (planted Core)
  const snapCore = () => {
    const core = clean(P(NEST, "@o = { ...@o, inner: { ys: @o.inner.ys } };"));
    const lets = find(core.fns, (n) => n.variant === "Let" && n.data.sym.hint === "before");
    expect(lets.length).toBe(1);
    return { core, before: lets[0] };
  };
  test("Core control: a snapshot Local that is ALSO Assigned is not a snapshot (C3)", () => {
    const { core, before } = snapCore();
    const go = core.fns.find((f) => f.sym.hint === "go");
    go.body.stmts.splice(1, 0, { variant: "Assign", data: { local: before.data.sym, value: { variant: "Lit", data: { lit: { variant: "Absent" } } } } });
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("o.inner.ys"))).toBe(true);
  });
  test("Core control: a snapshot of ANOTHER place is not a keep (C3)", () => {
    const { core, before } = snapCore();
    before.data.init.data.place.data.path = [];          // `before` now snapshots nothing of `o`
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("o.inner.ys"))).toBe(true);
  });
});

describe("F4 — an identity override is a keep, not a `replace`", () => {
  test("`@b = { ...@b, xs: @b.xs }` — clean in both", () => {
    clean(P(BOX, "@b = { ...@b, xs: @b.xs };"));
    clean(P(BOX, "@b = { ...@b, title: \"u\", xs: @b.xs };"));
  });
  test("`@o = { ...@o, inner: @o.inner }` — clean in both", () => {
    clean(P(NEST, "@o = { ...@o, inner: @o.inner };"));
  });
  test("the instance form `@d = { ...@d, inner: @d.inner }` — clean in both", () => {
    clean(inst("@d = { ...@d, inner: @d.inner };"));
  });
  test("Core: a Replace whose value reads the written place itself keeps every tape in it", () => {
    const core = clean(P(BOX, "@b = { title: \"u\", xs: @b.xs };"));
    const w = find(core.fns, (n) => n.variant === "Write")[0];
    w.data.value = w.data.value.data.fields[1];          // Read(@b.xs) …
    w.data.value = { variant: "Read", data: { place: { ...w.data.value.data.place, data: { ...w.data.value.data.place.data, path: w.data.value.data.place.data.path.slice(0, 1) } } } };   // … now Read(@b)
    expect(mods.check.checkCore(core)).toEqual([]);
  });
  test("a NON-identity override of an append-only tape is still refused", () => {
    expect(codes(P(BOX, "@b = { ...@b, xs: [] };"))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
});
