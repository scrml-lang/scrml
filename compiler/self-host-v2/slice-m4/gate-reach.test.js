// gate-reach.test.js — s472: the gate's reach for the shapes the s449 static
// walk could not name (g-bootstrap-gate-reach-live-dom-reading, REOPENED S239
// round 2: P3 a USE inside the form, P4 a slot filled at the use site, P12 an
// `as=` handle) and the HTML form-owner `form=` control
// (g-bootstrap-gate-external-form-owner-control). Run in happy-dom.
//
// Governing text, SPEC §55.17.3 step 1: "Mark `touched = true` on every
// **bound validated value** of the form — every value that carries validators
// (a validated top-level value, §55.5.1, or a validated child field of a
// declaration) whose `bind:` is on a native control inside the form (the
// §55.17.2 rule 1 composed subtree)". §55.17.2 rule 1: "\"Contains\" is the
// form's **composed** subtree: its own markup plus markup that reaches it
// through `<*x/>` inlines, declaration uses, `<each>` rows and state-view arms".

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import * as rt from "../slice-m1/runtime/runtime.js";

/** Every Core node under `n` for which `pred` holds (Core is plain JSON: `{ variant, data }`). */
function walk(n, pred, out = []) {
  if (Array.isArray(n)) { n.forEach((x) => walk(x, pred, out)); return out; }
  if (n === null || typeof n !== "object") return out;
  if (pred(n)) out.push(n);
  Object.values(n).forEach((x) => walk(x, pred, out));
  return out;
}

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "g.scrml", src }]);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r.core;
};
const $ = (sel) => document.querySelector(sel);
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
const clickEl = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const calls = () => $("p.calls").textContent;

function submit(form, submitter = null) {
  expectNoPageErrors();
  const e = new window.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter });
  form.dispatchEvent(e);
  expectNoPageErrors();
  return e;
}

// ---------------------------------------------------------------------------
// P3 — a USE inside the form whose renders binds a validated field in a closed
// `if=` region: the use's instance exists (it is mounted), its field is empty
// and `req`. The same markup through `<*f/>` was already blocked.
// ---------------------------------------------------------------------------
const P3 = (use) => `<program>
    let <calls:int=0/>
    <f note:string="n">
        let <show:bool=false/>
        let <v:string="" req/>
        renders <input class="v" bind:value=@v/>
        let <w:string=""/>
    </>
    renders <div if=show><*v/></div>
    function save() { @calls = @calls + 1; }
    <main>
        <form onsubmit=save()>${use}<button type="submit">go</button></form>
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;

describe("P3 — a declaration USE inside the form (§55.17.2 rule 1: \"declaration uses\")", () => {
  test("`<f/>`: the closed region's empty `req` field blocks the submit", async () => {
    await loadProgram(clean(P3("<f/>")), "reach-p3-use");
    expect(document.querySelectorAll("main input").length).toBe(0);
    const e = submit($("main form"));
    expect(calls()).toBe("0");
    expect(e.defaultPrevented).toBe(true);
  });
  test("control: the region opened and the field filled → the submit runs", async () => {
    const src = P3("<f/>").replace("let <show:bool=false/>", "let <show:bool=true/>");
    await loadProgram(clean(src), "reach-p3-use-ok");
    type($("input.v"), "x");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
  test("control: two uses — each instance gates by its own value (closed regions)", async () => {
    await loadProgram(clean(P3("<f/><f/>")), "reach-p3-two");
    submit($("main form"));
    expect(calls()).toBe("0");
  });
  test("a use in a CLOSED region of the form has no instance — nothing to gate, the submit runs", async () => {
    const src = P3(`<div if=@calls == 99><f/></div>`).replace("<program>\n", "<program>\n");
    await loadProgram(clean(src.replace("<div if=@calls == 99>", "<div if=(@calls == 99)>")), "reach-p3-no-instance");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// P4 — the form is in a declaration's renders; the use site fills its slot
// with a closed region binding a validated top-level value.
// ---------------------------------------------------------------------------
const P4 = (show) => `<program>
    let <calls:int=0/>
    let <show:bool=${show}/>
    let <email:string="" req/>
    function save() { @calls = @calls + 1; }
    <card note:string="n">
        let <t:string=""/>
    </>
    renders <form onsubmit=save()><slot/><button type="submit">go</button></form>
    <main>
        <card><div if=@show><input class="e" bind:value=@email/></div></card>
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;

describe("P4 — a slot filled at the use site (§55.17.2 rule 1: the composed subtree)", () => {
  test("the filler's closed region: the empty `req` value blocks the submit", async () => {
    await loadProgram(clean(P4(false)), "reach-p4-slot");
    expect(document.querySelectorAll("main input").length).toBe(0);
    const e = submit($("main form"));
    expect(calls()).toBe("0");
    expect(e.defaultPrevented).toBe(true);
  });
  test("control: the filler mounted and filled → the submit runs", async () => {
    await loadProgram(clean(P4(true)), "reach-p4-slot-ok");
    type($("input.e"), "x");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// P12 — a bind through an `as=` handle inside the form, in a closed region.
// ---------------------------------------------------------------------------
const P12 = (aliasSite) => `<program>
    let <calls:int=0/>
    let <show:bool=false/>
    <f note:string="n">
        let <v:string="" req/>
    </>
    renders <span>f</span>
    function save() { @calls = @calls + 1; }
    <main>
        ${aliasSite}
        <form onsubmit=save()>
            <div if=@show><input class="v" bind:value=@h.v/></div>
            <button type="submit">go</button>
        </form>
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;

describe("P12 — an `as=` handle bound in a closed region", () => {
  test("the handle names an instance → its empty `req` field blocks the submit", async () => {
    await loadProgram(clean(P12("<f as=h/>")), "reach-p12-alias");
    const e = submit($("main form"));
    expect(calls()).toBe("0");
    expect(e.defaultPrevented).toBe(true);
  });
  test("a handle that may be absent is refused at the bind (§66.7.5) — it never reaches the gate", () => {
    const d = run(P12("<div if=(@calls == 99)><f as=h/></div>")).diags.map((x) => x.code);
    expect(d).toEqual(["E-DECL-HANDLE-NOT-NARROWED"]);
  });
  test("the gate reads a handle with a presence check: an absent handle names no instance (validityIf → null)", () => {
    expect(rt.validityIf(null, 0)).toBe(null);
  });
  test("Core: the form's Gate names the field through the handle (`.Alias`), not only the live control", () => {
    const gates = walk(clean(P12("<f as=h/>")), (n) => n.variant === "Gate");
    expect(gates.map((g) => g.data.values)).toEqual([["f.v"]]);
    expect(gates[0].data.fields.map((f) => f.data.inst.variant)).toEqual(["Alias"]);
  });
});

// ---------------------------------------------------------------------------
// Core shape — the Reach markers the gate post-pass adds (lower.scrml gateDecls).
// ---------------------------------------------------------------------------
describe("Core — View.Reach", () => {
  test("a use's declaration renders opens with a Reach naming its bound field; the program's renders has none", () => {
    const core = clean(P3("<f/>"));
    const f = core.decls.find((d) => d.sym.hint === "f");
    expect(f.renders[0].variant).toBe("Reach");
    expect(f.renders[0].data.fields.map((x) => [x.data.inst.variant, x.data.idx])).toEqual([["Lexical", 2]]);
    const prog = core.decls.find((d) => d.kind === "Program" || d.kind.variant === "Program");
    expect(walk(prog.renders, (n) => n.variant === "Reach")).toEqual([]);
  });
  test("a slot filler opens with a Reach evaluated at the use site", () => {
    const reaches = walk(clean(P4(false)), (n) => n.variant === "Reach");
    expect(reaches.length).toBe(1);
    expect(reaches[0].data.fields.map((x) => x.data.inst.variant)).toEqual(["Lexical"]);
  });
  test("the bite: the same P3 / P4 programs with every Reach removed from Core are fail-open again", async () => {
    const strip = (n) => {
      if (Array.isArray(n)) return n.filter((x) => !(x && x.variant === "Reach")).map(strip);
      if (n === null || typeof n !== "object") return n;
      return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, strip(v)]));
    };
    await loadProgram(strip(clean(P3("<f/>"))), "reach-p3-bite");
    submit($("main form"));
    expect(calls()).toBe("1");
    await loadProgram(strip(clean(P4(false))), "reach-p4-bite");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
  test("markup that binds nothing surfaced gets no Reach (no output change)", () => {
    const src = P4(false).replace(`<input class="e" bind:value=@email/>`, `<input class="e"/>`);
    expect(walk(clean(src), (n) => n.variant === "Reach")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Behind an UNMOUNTED `<*g/>`: the instances g's renders mounts unconditionally
// exist with g's record (L12 (b)) whether or not the Star is mounted, so their
// bound fields are inside the form's composed subtree (InstRef.Kid).
// ---------------------------------------------------------------------------
const STAR_KID = (show) => `<program>
    let <calls:int=0/>
    let <show:bool=${show}/>
    <f note:string="n">
        let <v:string="" req/>
    </>
    renders <span><input class="v" bind:value=@f.v/></span>
    <g note:string="n">
        let <w:string=""/>
    </>
    renders <div><f/></div>
    function save() { @calls = @calls + 1; }
    <main>
        <form onsubmit=save()>
            <div if=@show><*g/></div>
            <button type="submit">go</button>
        </form>
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;

describe("a closed `<*g/>` whose renders mounts a use — the use's instance exists", () => {
  test("its empty `req` field blocks the submit; Core names it as `.Kid` of the Star's instance", async () => {
    const core = clean(STAR_KID(false));
    const gate = walk(core, (n) => n.variant === "Gate")[0].data;
    expect(gate.fields.map((f) => f.data.inst.variant)).toEqual(["Kid"]);
    await loadProgram(core, "reach-star-kid");
    expect(document.querySelectorAll("main input").length).toBe(0);
    submit($("main form"));
    expect(calls()).toBe("0");
  });
  test("control: the Star mounted and the field filled → the submit runs", async () => {
    await loadProgram(clean(STAR_KID(true)), "reach-star-kid-ok");
    type($("input.v"), "x");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
  test("a bind through g's OWN `as=` handle inside the closed Star: named `.HandleOf` the Star's instance, and it blocks", async () => {
    const src = STAR_KID(false)
      .replace("renders <span><input class=\"v\" bind:value=@f.v/></span>", "renders <span>f</span>")
      .replace("renders <div><f/></div>", "renders <div><f as=h/><input class=\"v\" bind:value=@h.v/></div>");
    const core = clean(src);
    const gate = walk(core, (n) => n.variant === "Gate")[0].data;
    expect(gate.fields.map((f) => f.data.inst.variant)).toEqual(["HandleOf"]);
    await loadProgram(core, "reach-star-handle");
    submit($("main form"));
    expect(calls()).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// g-bootstrap-gate-external-form-owner-control — HTML's form owner (`form=`).
// RULED S472 (user-voice-scrml.md "`form="id"` (HTML form owner) and the submit
// gate"): "a control carrying `form="id"` whose `bind:` targets a validated value
// JOINS THE GATE SET OF THAT ONE FORM (§55.17), and only that form, when `id` is a
// static literal naming exactly one `<form>` in the program … Otherwise … `form=`
// on a validated bind is a COMPILE ERROR." (SPEC §55.17.3, E-FORM-OWNER-UNRESOLVED.)
// ---------------------------------------------------------------------------
describe("`form=\"id\"` (the HTML form owner) — the control joins that one form's gate (RULED S472)", () => {
  const OWNER = (control, extra = "", more = "") => `<program>
    let <calls:int=0/>
    let <show:bool=false/>
    let <id:string="f"/>
    let <v:string="" length(>=2)/>
    let <q:string=""/>
    <xs:string[replace]=(["a"])/>
    function save() { @calls = @calls + 1; }
    <main>
        <form id="f" onsubmit=save()>${extra}<button class="go" type="submit">go</button></form>
        ${control}
        ${more}
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;
  const codes = (src) => run(src).diags.map((d) => d.code);
  const SEL = (attr) => `<select class="s" ${attr} bind:value=@v><option value="">-</option><option value="a">a</option><option value="ab">ab</option></select>`;
  const pick = (v) => { const s = $("select.s"); s.value = v; s.dispatchEvent(new window.Event("input", { bubbles: true })); s.dispatchEvent(new window.Event("change", { bubbles: true })); };

  test("the reviewer's fail-open — an external `<select form=\"f\" bind:value=@v>` with `length(>=2)`: f's gate blocks \"a\", passes \"ab\"; f is marked", async () => {
    const r = run(OWNER(SEL(`form="f"`)));
    expect(r.diags).toEqual([]);
    expect(r.infos.map((i) => i.message.split(" — ")[0])).toEqual(["this form's submit is gated by: v"]);
    await loadProgram(r.core, "owner-ext");
    expect($("main form").getAttribute("data-scrml-gated")).toBe("v");
    pick("a");
    const e = submit($("main form"));
    expect(calls()).toBe("0");
    expect(e.defaultPrevented).toBe(true);
    pick("ab");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
  test("F2 — the name is ASCII case-blind (`FORM=` / `Form=` are `form=` to the browser): it joins f's gate too", async () => {
    await loadProgram(clean(OWNER(SEL(`FORM="f"`))), "owner-ext-upper");
    pick("a");
    submit($("main form"));
    expect(calls()).toBe("0");
    await loadProgram(clean(OWNER(SEL(`Form="f"`))), "owner-ext-mixed");
    pick("a");
    submit($("main form"));
    expect(calls()).toBe("0");
  });
  test("an external control in a CLOSED region still gates f (static reach); the `<input>` carries lowered attributes, so f gets `novalidate`", async () => {
    const r = run(OWNER(`<div if=@show><input class="v" form="f" bind:value=@v/></div>`));
    expect(r.diags).toEqual([]);
    await loadProgram(r.core, "owner-ext-closed");
    expect(document.querySelectorAll("main input").length).toBe(0);
    expect($("main form").hasAttribute("novalidate")).toBe(true);
    submit($("main form"));
    expect(calls()).toBe("0");   // "" fails length(>=2) (LengthFailed)
  });
  test("…and with `req`, the closed external control's empty value blocks f", async () => {
    const src = OWNER(`<div if=@show><input class="v" form="f" bind:value=@v/></div>`).replace(`let <v:string="" length(>=2)/>`, `let <v:string="" req/>`);
    await loadProgram(clean(src), "owner-ext-closed-req");
    submit($("main form"));
    expect(calls()).toBe("0");
  });
  test("a control INSIDE f that names another form `g` gates g, not f (\"only that form\")", async () => {
    const src = OWNER("", `<input class="v" form="g" bind:value=@v/>`, `<form id="g" class="g" onsubmit=save()><button type="submit">g</button></form>`);
    const r = run(src);
    expect(r.diags).toEqual([]);
    await loadProgram(r.core, "owner-inner-other");
    expect($("form.g").getAttribute("data-scrml-gated")).toBe("v");
    expect($("main form").hasAttribute("data-scrml-gated")).toBe(false);
    type($("input.v"), "a");
    submit($("main form"));
    expect(calls()).toBe("1");   // f is not gated by v
    submit($("form.g"));
    expect(calls()).toBe("1");   // g is
  });
  test("COMPILE ERROR when the owner is not one literal-named form: computed, unquoted, no match, two matches, a non-form", () => {
    expect(codes(OWNER(SEL(`form=(@id)`)))).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
    expect(codes(OWNER(SEL(`form=@id`)))).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
    expect(codes(OWNER(SEL(`form="nope"`)))).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
    expect(codes(OWNER(SEL(`form="f"`), "", `<form id="f"></form>`))).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
    expect(codes(OWNER(SEL(`form="d"`), "", `<div id="d"></div>`))).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
    const d = run(OWNER(SEL(`FORM="nope"`))).diags;
    expect(d.map((x) => x.code)).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
    expect(d[0].message).toContain("§55.17.3");
  });
  test("a form with a computed `id` makes every literal `form=` unprovable → E-FORM-OWNER-UNRESOLVED", () => {
    expect(codes(OWNER(SEL(`form="f"`), "", `<form id=(@id)></form>`))).toEqual(["E-FORM-OWNER-UNRESOLVED"]);
  });
  test("bootstrap limit (fail closed): a `form=` control inside an `<each>` or a Tier-0 row → E-BOOTSTRAP-UNSUPPORTED", () => {
    expect(codes(OWNER(`<each in=@xs as x>${SEL(`form="f"`)}</each>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(OWNER(`\${ for (x of @xs) { lift ${SEL(`form="f"`)}; } }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("F4 — `form=` on a control binding a value with NO validators is not refused (a declaration field included)", () => {
    expect(codes(OWNER(`<input form="f" bind:value=@q/>`))).toEqual([]);
    expect(codes(OWNER(`<input form="nope" bind:value=@q/>`))).toEqual([]);
    const src = `<program>
    <f note:string="n">
        let <w:string=""/>
    </>
    renders <input form="x" bind:value=@f.w/>
    <main><form id="x"></form><f/></main>
</program>
`;
    expect(codes(src)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// S239 r1 F1 — a SHARED (top-level) validated value bound inside a USE's
// renders, where the use is not mounted: the value exists, so it gates.
// ---------------------------------------------------------------------------
describe("F1 — a shared value bound through a use that is not mounted still gates", () => {
  const A = (site) => `<program>
    let <calls:int=0/>
    let <step:int=2/>
    let <show:bool=false/>
    let <email:string="" req/>
    <stepOne note:string="n">
        let <t:string=""/>
    </>
    renders <input class="e" bind:value=@email/>
    <f note:string="n">
        let <open:bool=false/>
    </>
    renders <div if=open><stepOne/></div>
    <card note:string="n">
        let <t:string=""/>
    </>
    renders <form class="c" onsubmit=save()><slot/><button type="submit">go</button></form>
    function save() { @calls = @calls + 1; }
    <main>
        ${site}
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;
  const F = (inner) => `<form onsubmit=save()>${inner}<button type="submit">go</button></form>`;
  test("A3 — `<stepOne/>` in a closed step arm (the multi-step form with components)", async () => {
    await loadProgram(clean(A(F(`<div if=(@step == 1)><stepOne/></div>`))), "f1-a3");
    expect(document.querySelectorAll("main input").length).toBe(0);
    submit($("main form"));
    expect(calls()).toBe("0");
  });
  test("A3 control — the field filled, then the step closed: the submit runs", async () => {
    await loadProgram(clean(A(F(`<div if=(@step == 2)><stepOne/></div>`))), "f1-a3-ok");
    type($("input.e"), "a@b");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
  test("B — nested: a mounted `<f/>` whose renders holds `<stepOne/>` in a closed arm", async () => {
    await loadProgram(clean(A(F(`<f/>`))), "f1-b");
    submit($("main form"));
    expect(calls()).toBe("0");
  });
  test("F — a use-site slot filler: `<card><div if=@show><stepOne/></div></card>`", async () => {
    await loadProgram(clean(A(`<card><div if=@show><stepOne/></div></card>`)), "f1-f");
    submit($("form.c"));
    expect(calls()).toBe("0");
  });
  test("a use's OWN field is not named through it (its instance may not exist): Core names only the shared value", () => {
    const core = clean(A(F(`<div if=(@step == 1)><stepOne/></div>`)));
    const gate = walk(core, (n) => n.variant === "Gate")[0].data;
    expect(gate.fields.map((x) => x.data.inst.variant)).toEqual(["Shared"]);  // the program's email, through the use: `.Shared`
  });
});

// ---------------------------------------------------------------------------
// S239 r1 F3 — a form whose validated binds sit only in Tier-0 rows is gated.
// ---------------------------------------------------------------------------
describe("F3 — Tier-0 `${ for … lift }` rows are in the form's composed subtree", () => {
  const T0 = `<program>
    let <calls:int=0/>
    <xs:string[replace]=(["a"])/>
    let <v:string="" length(>=2)/>
    function save() { @calls = @calls + 1; }
    <main>
        <form onsubmit=save()>\${ for (x of @xs) { lift <select class="s" bind:value=@v><option value="">-</option><option value="a">a</option><option value="ab">ab</option></select>; } }<button type="submit">go</button></form>
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;
  test("a lifted `<select bind:value=@v>` with `length(>=2)`: the form is gated and blocks \"a\"", async () => {
    const r = run(T0);
    expect(r.diags).toEqual([]);
    expect(r.infos.map((i) => i.code)).toEqual(["I-FORM-SUBMIT-GATED"]);
    await loadProgram(r.core, "f3-t0");
    expect($("main form").getAttribute("data-scrml-gated")).toBe("v");
    const s = $("select.s");
    s.value = "a";
    s.dispatchEvent(new window.Event("input", { bubbles: true }));
    submit($("main form"));
    expect(calls()).toBe("0");
    s.value = "ab";
    s.dispatchEvent(new window.Event("input", { bubbles: true }));
    submit($("main form"));
    expect(calls()).toBe("1");
  });
});
