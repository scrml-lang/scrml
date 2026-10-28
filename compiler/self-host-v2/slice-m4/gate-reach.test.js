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
// SPEC is silent on whether the form-owner association joins the gate set, so a
// bound control carrying `form=` whose value has a surface is refused.
// ---------------------------------------------------------------------------
describe("`form=` on a bound control (the HTML form owner) — refused, fail closed", () => {
  const OWNER = (control, extra = "") => `<program>
    let <calls:int=0/>
    let <v:string="" length(>=2)/>
    let <q:string=""/>
    function save() { @calls = @calls + 1; }
    <main>
        <form id="f" onsubmit=save()>${extra}<button type="submit">go</button></form>
        ${control}
        <p class="calls">\${@calls}</p>
    </main>
</program>
`;
  const codes = (src) => run(src).diags.map((d) => d.code);
  test("an external `<select form=\"f\" bind:value=@v>` with `length(>=2)` (the reviewer's fail-open) → E-BOOTSTRAP-UNSUPPORTED at `form=`", () => {
    const src = OWNER(`<select form="f" bind:value=@v><option value="">-</option></select>`);
    const d = run(src).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(src.slice(d[0].span.start, d[0].span.start + 5)).toBe("form=");
    expect(d[0].message).toContain("`v`");
    expect(d[0].message).toContain("§55.17.3");
  });
  test("an external `<input form=\"f\">` binding a validated value → refused", () => {
    expect(codes(OWNER(`<input form="f" bind:value=@v/>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a control INSIDE the form naming another owner with `form=` → refused", () => {
    expect(codes(OWNER("", `<input form="other" bind:value=@v/>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a field of a declaration (any field has a surface, §55.6) bound with `form=` → refused", () => {
    const src = `<program>
    <f note:string="n">
        let <w:string=""/>
    </>
    renders <input form="x" bind:value=@f.w/>
    <main><form id="x"></form><f/></main>
</program>
`;
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("controls: `form=` on a control binding a value with NO surface is accepted; the bound control without `form=` is gated as before", async () => {
    expect(codes(OWNER(`<input form="f" bind:value=@q/>`))).toEqual([]);
    await loadProgram(clean(OWNER("", `<input class="v" bind:value=@v/>`)), "owner-inside-ok");
    type($("input.v"), "a");
    submit($("main form"));
    expect(calls()).toBe("0");
    type($("input.v"), "ab");
    submit($("main form"));
    expect(calls()).toBe("1");
  });
});
