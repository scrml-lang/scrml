// match-block-s478.test.js — s478-boot-match-element: the block-form `<match for=Type on=expr>`
// (SPEC §18.0.1) in the bootstrap. Before this lane every `<match>` was refused by name
// ("`<match>` is a scrml structural element (§18.0.1) … it is not in the bootstrap").
//
// SPEC, verbatim:
//   §18.0.1 "The block-form is a markup-emit construct. It produces UI fragments based on the variant
//           of an enum-typed reactive cell."
//           "`for=Type` — REQUIRED. The enum type the match is over."
//           "`on=expr` — REQUIRED when the matched-on value is not auto-implied. Auto-implied ONLY when
//           an `<engine for=Type>` for the same `Type` is in scope"; "The compiler emits
//           `E-MATCH-ON-REQUIRED` (§34) at parse-time when `<match for=Type>` is missing `on=`".
//           "Payload variants destructure positionally: `<Ready(rows)>` binds `rows` for that arm's body."
//           "Self-closing `<Variant/>` — no body, renders nothing for that variant"; "Bare body
//           `<Variant>...</>` — code-default body"; "Single-expression body `<Variant : expr>`".
//           "Exhaustiveness — the compiler verifies every variant of `Type` has a matching state-child OR
//           a wildcard `<_>` catch-all is present. Otherwise: `E-MATCH-NOT-EXHAUSTIVE`."
//           "A block `<match>` MAY appear inside the body of a DISPATCHED arm — a block-form `<match>`
//           arm … — and SHALL NOT be refused there."
//   §18.0   "Both shapes share a single internal AST and the same exhaustiveness-checking pass".
//   §18.0.2 `rule=` "LEGAL but INERT (warning `W-MATCH-RULE-INERT`)"; `effect=` "FORBIDDEN
//           (`E-MATCH-EFFECT-FORBIDDEN`)"; `<onTransition>` "FORBIDDEN (`E-MATCH-ONTRANSITION-FORBIDDEN`)".
//   §17.1.2.1 "For `<match if=expr>`: no arm is dispatched."
//   §34     E-MATCH-INVALID-ARM: "A tag opener at the block-form `<match>` arm position is not a
//           variant-named arm (`<VariantName>…</>`) or the wildcard `<_>…</_>` catch-all";
//           E-MATCH-BLOCK-IN-LIFT: "A block-form `<match for=Type on=expr>` is placed inside a
//           `${ ... lift ... }` logic loop".

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const TYPES = `type Phase:enum = { Idle, Loading, Ready }\ntype Load:enum = { Empty, Busy, Loaded(name: string, size: int) }\n`;
const prog = (body) => `<program>\n${TYPES}let <ph:Phase=.Idle/>\nlet <ld:Load=.Empty/>\n${body}\n</program>\n`;
const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => run(src).diags.filter((d) => d.code !== "E-DG-002").map((d) => d.code);   // E-DG-002: the fixture declares both cells
const clean = (src) => {
  const r = run(src);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s478match-" + k++, []);

const PHASE_BTNS = `<button id="to-loading" onclick=${"${"}@ph = .Loading}>l</>\n<button id="to-ready" onclick=${"${"}@ph = .Ready}>r</>\n<button id="to-idle" onclick=${"${"}@ph = .Idle}>i</>\n`;
const LOAD_BTNS = `<button id="ld-a" onclick=${"${"}@ld = Load.Loaded("a.pdf", 3)}>a</>\n<button id="ld-b" onclick=${"${"}@ld = Load.Loaded("b.pdf", 7)}>b</>\n<button id="ld-busy" onclick=${"${"}@ld = .Busy}>busy</>\n`;

// ---------------------------------------------------------------------------
describe("1 — arms switch when the matched-on cell changes", () => {
  const SRC = prog(`${PHASE_BTNS}<match for=Phase on=@ph>
    <Idle><p data-arm="idle">Press to load</p></>
    <Loading><p data-arm="loading">Loading now</p></>
    <Ready><p data-arm="ready">All set</p></>
</match>`);
  test("the arm for the current variant is the only one mounted, and swaps on every write (round trip)", async () => {
    await load(SRC);
    expect($('[data-arm="idle"]').textContent).toBe("Press to load");
    expect($$("[data-arm]").length).toBe(1);
    click($("#to-loading"));
    expect($('[data-arm="loading"]').textContent).toBe("Loading now");
    expect($$("[data-arm]").length).toBe(1);
    click($("#to-ready"));
    expect($('[data-arm="ready"]')).not.toBeNull();
    click($("#to-idle"));
    expect($('[data-arm="idle"]')).not.toBeNull();
    expect($$("[data-arm]").length).toBe(1);
  });
  test("the arms mount inside one `<div data-scrml-match-mount>`", async () => {
    await load(SRC);
    expect($$("[data-scrml-match-mount]").length).toBe(1);
    expect($("[data-scrml-match-mount]").querySelector('[data-arm="idle"]')).not.toBeNull();
  });
  test("`:`-shorthand display-text arms, a self-closing arm (renders nothing) and the wildcard `<_>`", async () => {
    await load(prog(`${PHASE_BTNS}<div id="m"><match for=Phase on=@ph>
    <Idle : "idle!">
    <Loading/>
    <_ : "other">
</match></div>`));
    expect($("#m").textContent).toBe("idle!");
    click($("#to-loading"));
    expect($("#m").textContent).toBe("");
    click($("#to-ready"));
    expect($("#m").textContent).toBe("other");
  });
  test("a handler in an arm writes a cell (the arm body is ordinary markup)", async () => {
    await load(prog(`let <n:int=0/>\n<p id="n">${"${"}@n}</p>\n<match for=Phase on=@ph>
    <Idle><button id="inc" onclick=${"${"}@n = @n + 1}>+</button></>
    <_ : "">
</match>`));
    click($("#inc"));
    click($("#inc"));
    expect($("#n").textContent).toBe("2");
  });
});

// ---------------------------------------------------------------------------
describe("2 — payload binders (`<Loaded(name, size)>`)", () => {
  const SRC = prog(`${LOAD_BTNS}<match for=Load on=@ld>
    <Empty><p data-arm="empty">Nothing loaded</p></>
    <Busy><p data-arm="busy">Busy</p></>
    <Loaded(name, size)><p data-arm="loaded">Loaded: ${"${"}name} (${"${"}size})</p></>
</match>`);
  test("the binders read the payload fields, positionally", async () => {
    await load(SRC);
    click($("#ld-a"));
    expect($('[data-arm="loaded"]').textContent).toBe("Loaded: a.pdf (3)");
    expect($('[data-arm="empty"]')).toBeNull();
  });
  test("a new payload of the same variant updates the binders in place; leaving the variant removes the arm", async () => {
    await load(SRC);
    click($("#ld-a"));
    const p = $('[data-arm="loaded"]');
    click($("#ld-b"));
    expect($('[data-arm="loaded"]').textContent).toBe("Loaded: b.pdf (7)");
    expect($('[data-arm="loaded"]')).toBe(p);
    click($("#ld-busy"));
    expect($('[data-arm="loaded"]')).toBeNull();
    expect($('[data-arm="busy"]').textContent).toBe("Busy");
  });
  test("a `_` binder binds nothing; the other binder still reads its own field", async () => {
    await load(prog(`${LOAD_BTNS}<match for=Load on=@ld>
    <Loaded(_, size)><p id="sz">${"${"}size}</p></>
    <_ : "">
</match>`));
    click($("#ld-b"));
    expect($("#sz").textContent).toBe("7");
  });
  test("a binder read in an arm's handler is the current payload", async () => {
    await load(prog(`let <last:string=""/>\n<p id="last">${"${"}@last}</p>\n${LOAD_BTNS}<match for=Load on=@ld>
    <Loaded(name, size)><button id="take" onclick=${"${"}@last = name}>take</button></>
    <_ : "">
</match>`));
    click($("#ld-a"));
    click($("#ld-b"));
    click($("#take"));
    expect($("#last").textContent).toBe("b.pdf");
  });
});

// ---------------------------------------------------------------------------
describe("3 — nesting: a `<match>` in an arm, a `<match>` in an `<each>` row, the `if=` gate", () => {
  test("a nested `<match>` in a dispatched arm (§18.0.1 S439 #5) re-renders with both cells", async () => {
    await load(prog(`${PHASE_BTNS}${LOAD_BTNS}<match for=Phase on=@ph>
    <Idle><p id="o">idle</p></>
    <_><div id="inner"><match for=Load on=@ld>
        <Loaded(name, size)><p id="nm">${"${"}name}</p></>
        <_ : "nothing">
    </match></div></>
</match>`));
    expect($("#o").textContent).toBe("idle");
    click($("#to-loading"));
    expect($("#inner").textContent).toBe("nothing");
    click($("#ld-a"));
    expect($("#nm").textContent).toBe("a.pdf");
    click($("#to-idle"));
    expect($("#inner")).toBeNull();
    click($("#to-ready"));
    expect($("#nm").textContent).toBe("a.pdf");
  });
  test("a nested `<match>` over an outer arm's binder", async () => {
    await load(`<program>\ntype Inner:enum = { A, B }\ntype Outer:enum = { None, Has(i: Inner) }\nlet <o:Outer=.None/>
<button id="a" onclick=${"${"}@o = Outer.Has(Inner.A)}>a</>\n<button id="b" onclick=${"${"}@o = Outer.Has(Inner.B)}>b</>
<div id="m"><match for=Outer on=@o>
    <None : "none">
    <Has(i)><match for=Inner on=i>
        <A : "is A">
        <B : "is B">
    </match></>
</match></div>\n</program>\n`);
    expect($("#m").textContent).toBe("none");
    click($("#a"));
    expect($("#m").textContent).toBe("is A");
    click($("#b"));
    expect($("#m").textContent).toBe("is B");
  });
  test("a `<match>` inside an `<each>` row matches the row's item", async () => {
    await load(`<program>\ntype St:enum = { Open, Closed }\n<items:St[replace]=([St.Open, St.Closed, St.Open])/>
<button id="flip" onclick=${"${"}@items = [St.Closed, St.Closed, St.Open]}>f</>
<ul id="l"><each in=@items as it><li><match for=St on=it>
    <Open : "o">
    <Closed : "c">
</match></li></each></ul>\n</program>\n`);
    expect($("#l").textContent).toBe("oco");
    click($("#flip"));
    expect($("#l").textContent).toBe("cco");
  });
  test("`<match if=…>`: no arm is dispatched while the gate is false (§17.1.2.1)", async () => {
    await load(prog(`let <shown:bool=false/>\n<button id="show" onclick=${"${"}@shown = true}>s</>\n${PHASE_BTNS}<match for=Phase on=@ph if=@shown>
    <Idle><p id="arm">idle</p></>
    <_ : "">
</match>`));
    expect($("#arm")).toBeNull();
    expect($$("[data-scrml-match-mount]").length).toBe(0);
    click($("#show"));
    expect($("#arm").textContent).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
describe("4 — the checks (same arm reader as the §18 `match`)", () => {
  const M = (arms, open = "for=Phase on=@ph") => prog(`<match ${open}>\n${arms}\n</match>`);
  test("E-MATCH-NOT-EXHAUSTIVE: a variant with no arm and no `<_>`", () => {
    const e = errs(M(`<Idle : "i">\n<Loading : "l">`));
    expect(e.map((d) => d.code)).toEqual(["E-MATCH-NOT-EXHAUSTIVE"]);
    expect(e[0].message).toContain("`Ready`");
  });
  test("exhaustive by arms, or by `<_>`: clean", () => {
    clean(M(`<Idle : "i">\n<Loading : "l">\n<Ready : "r">`));
    clean(M(`<Idle : "i">\n<_ : "x">`));
  });
  test("W-MATCH-001: a `<_>` after every variant is covered (a warning)", () => {
    const r = run(M(`<Idle : "i">\n<Loading : "l">\n<Ready : "r">\n<_ : "x">`));
    expect(r.diags.filter((d) => d.code !== "E-DG-002").map((d) => `${d.code}:${d.severity}`)).toEqual(["W-MATCH-001:Warning"]);
  });
  test("E-TYPE-023 a duplicate arm; E-SYNTAX-010 an arm after `<_>`", () => {
    expect(codes(M(`<Idle : "i">\n<Idle : "j">\n<_ : "x">`))).toEqual(["E-TYPE-023"]);
    expect(codes(M(`<_ : "x">\n<Idle : "i">`))).toEqual(["E-SYNTAX-010"]);
  });
  test("E-MATCH-INVALID-ARM: a tag that names no variant (or a lowercase tag)", () => {
    expect(codes(M(`<Idle : "i">\n<Nope : "n">\n<_ : "x">`))).toEqual(["E-MATCH-INVALID-ARM"]);
    expect(codes(M(`<when is="Idle"><p>i</p></when>\n<_ : "x">`))).toEqual(["E-MATCH-INVALID-ARM"]);
  });
  test("E-TYPE-021: the binders' count is not the payload's", () => {
    expect(codes(M(`<Loaded(n)><p>${"${"}n}</p></>\n<_ : "">`, "for=Load on=@ld"))).toEqual(["E-TYPE-021"]);
  });
  test("E-MATCH-ON-REQUIRED: no `on=` (no `<engine>` can imply it)", () => {
    expect(codes(M(`<Idle : "i">\n<_ : "x">`, "for=Phase"))).toEqual(["E-MATCH-ON-REQUIRED"]);
  });
  test("no `for=`: refused by name (§18.0.1 REQUIRED — the SPEC names no code)", () => {
    const e = errs(M(`<Idle : "i">\n<_ : "x">`, "on=@ph"));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("for=");
  });
  test("`for=` naming an unknown type / a struct", () => {
    expect(codes(M(`<_ : "x">`, "for=Nope on=@ph"))).toEqual(["E-TYPE-UNKNOWN"]);
    expect(codes(prog(`type P:struct = { x: int }\n<match for=P on=@ph>\n<_ : "x">\n</match>`))).toEqual(["E-TYPE-024"]);
  });
  test("E-TYPE-VARIANT: the `on=` subject is provably another type than `for=`", () => {
    expect(codes(M(`<Empty : "e">\n<_ : "x">`, "for=Load on=@ph"))).toEqual(["E-TYPE-VARIANT"]);
  });
  test("a `T | not` subject is refused by name (§18.0.1 defines no absence arm)", () => {
    const e = errs(prog(`let <mp:Phase | not=not/>\n<match for=Phase on=@mp>\n<_ : "x">\n</match>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("§18.0.2: `rule=` W-MATCH-RULE-INERT (warning), `effect=` E-MATCH-EFFECT-FORBIDDEN, `<onTransition>` E-MATCH-ONTRANSITION-FORBIDDEN", () => {
    const r = run(M(`<Idle rule=.Loading : "i">\n<_ : "x">`));
    expect(r.diags.filter((d) => d.code !== "E-DG-002").map((d) => `${d.code}:${d.severity}`)).toEqual(["W-MATCH-RULE-INERT:Warning"]);
    expect(codes(M(`<Idle effect=(1) : "i">\n<_ : "x">`))).toEqual(["E-MATCH-EFFECT-FORBIDDEN"]);
    expect(codes(M(`<onTransition to=.Ready/>\n<Idle : "i">\n<_ : "x">`))).toContain("E-MATCH-ONTRANSITION-FORBIDDEN");
  });
  test("fail closed: an unknown attribute on the opener or an arm, text between arms, a named binder", () => {
    expect(codes(M(`<Idle : "i">\n<_ : "x">`, "for=Phase on=@ph class=\"x\""))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(M(`<Idle id="q" : "i">\n<_ : "x">`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(M(`hello\n<Idle : "i">\n<_ : "x">`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(M(`<Loaded(name: n, size: s)><p>x</p></>\n<_ : "">`, "for=Load on=@ld"))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(codes(M(`<Idle : "i">\n<_ : "x">`, "for=Phase on=@ph show=@ph"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("an arm body is code-default (§4.18): bare prose is E-UNQUOTED-DISPLAY-TEXT; a lone word is a name (E-SCOPE-001)", () => {
    expect(codes(M(`<Idle>Ready to fetch.</>\n<_ : "x">`))).toContain("E-UNQUOTED-DISPLAY-TEXT");
    expect(codes(M(`<Idle>idle</>\n<_ : "x">`))).toEqual(["E-SCOPE-001"]);
  });
  test("`<script>` in an arm is E-SCRIPT-001 (§4.17)", () => {
    expect(codes(M(`<Idle><script>x</script></>\n<_ : "x">`))).toContain("E-SCRIPT-001");
  });
  test("E-MATCH-BLOCK-IN-LIFT: a `<match>` in a `${ for … lift … }` row", () => {
    const src = prog(`<ul>${"${"} for (const p of [Phase.Idle]) { lift <li><match for=Phase on=p>\n<Idle : "i">\n<_ : "x">\n</match></li>; } }</ul>`);
    expect(codes(src)).toEqual(["E-MATCH-BLOCK-IN-LIFT"]);
  });
  test("a `<db>` function in a payload arm (a binder scope) is refused by name (g-boot-db-fn-in-match-arm-refusal-untested-s473)", () => {
    const e = errs(prog(`<match for=Load on=@ld>\n<Loaded(name, size)><db src="./app.db">\n    function f() -> int {\n        return 1;\n    }\n</db></>\n<_ : "">\n</match>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("arm");
  });
  test("§66.15.2: `<match>` arms are exclusive branches — one unnamed `<slot/>` per arm compiles; a second one beside the `<match>` does not", () => {
    const CARD = (renders) => `<program>\n${TYPES}    <card p:Phase/>\n    renders ${renders}\n    <main><card p=Phase.Idle><b>hi</b></card></main>\n</program>\n`;
    expect(errs(CARD(`<div><match for=Phase on=p>\n<Idle><p><slot/></p></>\n<_><i><slot/></i></>\n</match></div>`)).map((d) => d.code)).toEqual([]);
    expect(errs(CARD(`<div><slot/><match for=Phase on=p>\n<Idle><p><slot/></p></>\n<_ : "">\n</match></div>`)).map((d) => d.code)).toEqual(["E-COMPONENT-020"]);
  });
  test("§24.5: the mount is a `<div>` — a `<match>` directly in a `<p>` is E-HTML-PARSER-REPAIR", () => {
    expect(codes(prog(`<p>x <match for=Phase on=@ph>\n<Idle : "i">\n<_ : "x">\n</match></p>`))).toEqual(["E-HTML-PARSER-REPAIR"]);
  });
});
