// ruled-markup-events-s478.test.js — s478-ruled-markup-events: the S478 open-Qs rulings
// (user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478)")
// that are not covered by an existing slice file. (Items 1, 12, 13 are in
// markup-in-logic-s478 / body-top-s478 / match-block-s478.)
//
// SPEC, verbatim:
//   §18.10 (amended S478) "The compiler SHALL also emit E-SYNTAX-011 when a `|` after an arm
//          pattern is followed by something that is not a pattern (`.Admin | p.active :> …`): that
//          is the same guard, spelled with a pipe. A `|` between two patterns stays alternation."
//   Appendix H.6 (added S478) "A listener's event … has the interface this table gives its event
//          name …; every other event name is `Event`"; "When that element can hold no element (a void
//          element on H.4 — `<input>`), `event.target` is that element … and the reads
//          `event.target.value` and `event.target.checked` are typed by the entry that interface has".
//   §13.2 (amended S478) "A loop … whose body or condition contains a suspension point counts as
//          after the first `await` for its WHOLE body and condition, in every iteration".
//
// RED ON BASE: the item-15 guard tests (base: E-PARSE-ARM "alternation … not yet supported"); the
// item-9 accept tests (base: `e.key` / `e.clientX` / `e.target.value` refused by name); the item-11
// loop test (base: no diagnostic).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code);
const FN = (arms) => `<program>
type Role:enum = { Admin, Editor, Viewer }
type Post:struct = { role: Role, active: boolean }
fn label(p: Post) -> string {
    return match p.role {
        ${arms}
    };
}
<p>${"${"}label({ role: .Admin, active: true })}</p>
</program>
`;

describe("item 15 — §18.10: `| <non-pattern>` after an arm pattern is E-SYNTAX-011", () => {
  test("`.Admin | p.active :>` is E-SYNTAX-011, one report at the `|`", () => {
    const e = errs(FN(`.Admin | p.active :> "admin",\n        .Editor :> "editor",\n        .Viewer :> "viewer"`));
    expect(e.map((d) => d.code)).toEqual(["E-SYNTAX-011"]);
    expect(e[0].message).toContain("§18.10");
  });
  test("a bare-name guard and a call guard are E-SYNTAX-011 too", () => {
    expect(codes(FN(`.Admin | ok :> "admin",\n        _ :> "x"`))).toEqual(["E-SYNTAX-011"]);
    expect(codes(FN(`.Admin | isOn(p) :> "admin",\n        _ :> "x"`))).toEqual(["E-SYNTAX-011"]);
  });
  test("a `|` between two patterns stays alternation (not built: E-PARSE-ARM, by name)", () => {
    const c = codes(FN(`.Admin | .Editor :> "staff",\n        .Viewer :> "viewer"`));
    expect(c).toContain("E-PARSE-ARM");
    expect(c).not.toContain("E-SYNTAX-011");
    expect(codes(FN(`.Admin | _ :> "any"`))).not.toContain("E-SYNTAX-011");
  });
  test("the `if` guard keeps its E-SYNTAX-011", () => {
    expect(codes(FN(`.Admin if p.active :> "admin",\n        _ :> "x"`))).toContain("E-SYNTAX-011");
  });
  // fix round 1 of #1945 (review MED-1): §18.2 `variant-pattern ::= … | TypeName ('.' | '::') VariantName`
  test("qualified-alt: `Role.Admin | Role.Editor :>` is alternation (E-PARSE-ARM), not a guard", () => {
    for (const alt of ["Role.Admin | Role.Editor", ".Admin | Role.Editor", "Role::Admin | Role::Editor"]) {
      const c = codes(FN(`${alt} :> "staff",\n        .Viewer :> "viewer"`));
      expect(c).toContain("E-PARSE-ARM");
      expect(c).not.toContain("E-SYNTAX-011");
    }
  });
  test("a real guard after `|` still gets E-SYNTAX-011 (`| x > 1`, `| p.active`, lowercase member)", () => {
    expect(codes(FN(`.Admin | x > 1 :> "admin",\n        _ :> "x"`))).toContain("E-SYNTAX-011");
    expect(codes(FN(`Role.Admin | p.active :> "admin",\n        _ :> "x"`))).toContain("E-SYNTAX-011");
  });
});

// fix round 1 of #1945 (review MED-2) — §18.0.1 (amended S478): "the parent's content model applies to
// each arm's content where the `<match>` stands"; §24.2 / §28.1: a content-model violation is W-HTML-001
// under the default `html-content-model = warn`. A branch is its own template (§24.5 item 2), so its own
// parse errors are unchanged and what only its placement breaks is the warning.
const HM = (body) => `<program>
type Ph:enum = { A, B }
let <ph:Ph=.A/>
let <c:bool=true/>
<xs:int[]=([1])/>
${body}
</program>
`;
const diagsOf = (src) => run(src).diags.filter((d) => d.severity === "Error" || d.code === "W-HTML-001");
const warnCodes = (src) => diagsOf(src).map((d) => d.code + ":" + d.severity);
describe("MED-2 — a branch's content is judged in its parent's content model (W-HTML-001)", () => {
  test.each([
    ["div arm in <p>", `<p>x<match on=@ph><A><div>a</div></><B : "b"></match></p>`],
    ["div arm in <tbody>", `<table><tbody><match on=@ph><A><div>a</div></><B><tr><td>b</td></tr></></match></tbody></table>`],
    ["text arm in <tbody>", `<table><tbody><match on=@ph><A : "text"><B><tr><td>b</td></tr></></match></tbody></table>`],
    ["a > a arm", `<a href="/x"><match on=@ph><A><a href="/y">in</a></><B : "b"></match></a>`],
    ["button > button arm", `<button><match on=@ph><A><button>in</button></><B : "b"></match></button>`],
    ["nested match in <p>", `<p><match on=@ph><A><match on=@ph><A><div>a</div></><B : "x"></match></><B : "b"></match></p>`],
    ["if= div in <p>", `<p>x<div if=@c>a</div></p>`],
    ["if= div in <tbody>", `<table><tbody><div if=@c>a</div></tbody></table>`],
    ["each row div in <p>", `<p><each in=@xs as x><div>a</div></each></p>`],
    ["if= a in <a>", `<a href="/x"><a href="/y" if=@c>in</a></a>`],
  ])("%s → one W-HTML-001 (Warning), no error", (_n, body) => {
    expect(warnCodes(HM(body))).toEqual(["W-HTML-001:Warning"]);
    expect(diagsOf(HM(body))[0].message).toContain("§24.2");
  });
  test.each([
    ["li arms in <ul>", `<ul><li>h</li><match on=@ph><A><li>a</li></><B><li>b</li></></match></ul>`],
    ["span arm in <p>", `<p>x<match on=@ph><A><span>a</span></><B : "b"></match></p>`],
    ["tr arms in <tbody>", `<table><tbody><match on=@ph><A><tr><td>a</td></tr></><B><tr><td>b</td></tr></></match></tbody></table>`],
    ["option arms in <select>", `<select><match on=@ph><A><option>a</option></><B><option>b</option></></match></select>`],
    ["if= tr in <tbody>", `<table><tbody><tr if=@c><td>a</td></tr></tbody></table>`],
  ])("%s → clean", (_n, body) => {
    expect(warnCodes(HM(body))).toEqual([]);
  });
  test("a direct child keeps its §24.5 error; a foreign breakout in an arm keeps its error", () => {
    expect(warnCodes(HM(`<p>x<div>a</div></p>`))).toEqual(["E-HTML-PARSER-REPAIR:Error"]);
    expect(warnCodes(HM(`<svg><match on=@ph><A><div>a</div></><B><rect/></></match></svg>`))).toEqual(["E-HTML-FOREIGN-BREAKOUT:Error"]);
  });
});

// fix round 1 of #1945 (review LOW-8): no second report beside E-MATCH-ON-REQUIRED / E-TYPE-UNKNOWN
describe("LOW-8 — `<match>` without `for=`: one report per fault", () => {
  test("no `on=`: E-MATCH-ON-REQUIRED alone", () => {
    expect(codes(HM(`<div><match><A>"a"</><B>"b"</></match></div>`))).toEqual(["E-MATCH-ON-REQUIRED"]);
  });
  test("a cell whose type did not resolve: E-TYPE-UNKNOWN, no \"`string`, not an enum\"", () => {
    const c = codes(HM(`let <q:Nope=.B/>\n<div><match on=@q><A>"a"</><B>"b"</></match></div>`));
    expect(c).toContain("E-TYPE-UNKNOWN");
    expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(c).not.toContain("E-TYPE-024");
  });
  // S479 (hand-off §3.A item 4) — §18.0.1 "Amended S479": an omitted `for=` over a known non-enum
  // `on=` is E-TYPE-024 (it was refused by name).
  test("an int cell gets E-TYPE-024 (S479)", () => {
    expect(codes(HM(`let <q:int=1/>\n<div><match on=@q><A>"a"</><B>"b"</></match></div>`))).toContain("E-TYPE-024");
  });
});

const EV = (body) => `<program>
let <k:string=""/>
let <v:string=""/>
let <c:bool=false/>
let <x:number=0/>
${body}
<p id="out">${"${"}@k}|${"${"}@v}|${"${"}@c}|${"${"}@x}</p>
</program>
`;

describe("item 9 — Appendix H.6: the listener's event has its attribute's interface", () => {
  test("`onkeydown` → KeyboardEvent (`e.key`), `onclick` → MouseEvent (`e.clientX`), typed by H.3", () => {
    expect(codes(EV(`<div onkeydown=${"${"}(e) => { @k = e.key; }}>k</div>`))).toEqual([]);
    expect(codes(EV(`<button onclick=${"${"}(e) => { @x = e.clientX; }}>b</button>`))).toEqual([]);
    // the slot type is the entry's: `key` is a string, so it is no number
    expect(codes(EV(`<div onkeydown=${"${"}(e) => { @x = e.key; }}>k</div>`))).toEqual(["E-TYPE-031"]);
  });
  test("a member of another interface stays refused by name (`onclick` has no `key`)", () => {
    const e = errs(EV(`<div onclick=${"${"}(e) => { @k = e.key; }}>k</div>`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("MouseEvent");
  });
  test("`e.target.value` / `e.target.checked` on an `<input>` are typed H-096 `string` / H-098 `bool`", () => {
    expect(codes(EV(`<input oninput=${"${"}(e) => { @v = e.target.value; }}/>`))).toEqual([]);
    expect(codes(EV(`<input type="checkbox" onchange=${"${"}(e) => { @c = e.target.checked; }}/>`))).toEqual([]);
    expect(codes(EV(`<input oninput=${"${"}(e) => { @x = e.target.value; }}/>`))).toEqual(["E-TYPE-031"]);
  });
  test("else the refusal stays: `target` on an element that can hold others, `target` as a value, another member", () => {
    for (const h of [
      `<div oninput=${"${"}(e) => { @v = e.target.value; }}>d</div>`,
      `<input oninput=${"${"}(e) => { const t = e.target; }}/>`,
      `<input oninput=${"${"}(e) => { @v = e.target.id; }}/>`,
      `<input oninput=${"${"}(e) => { const f = () => e.target.value; }}/>`,
    ]) expect(codes(EV(h))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("runtime: the reads see the real event", async () => {
    const r = run(EV(`<input id="i" oninput=${"${"}(e) => { @v = e.target.value; }}/>
<input id="cb" type="checkbox" onchange=${"${"}(e) => { @c = e.target.checked; }}/>
<div id="d" onkeydown=${"${"}(e) => { @k = e.key; }}>k</div>`));
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    await loadProgram(r.core, "ev-h6");
    const i = document.getElementById("i");
    i.value = "hello";
    i.dispatchEvent(new window.Event("input", { bubbles: true }));
    const cb = document.getElementById("cb");
    cb.checked = true;
    cb.dispatchEvent(new window.Event("change", { bubbles: true }));
    document.getElementById("d").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Q", bubbles: true }));
    expect(document.getElementById("out").textContent).toBe("Q|hello|true|0");
  });
});

describe("item 11 — §13.2: a loop that suspends counts as after for its whole body", () => {
  const LOOP = (pre) => `for (const i of [1, 2]) { ${pre} const ok: bool = isOk(i) !{ _ :> false }; }`;
  const P = (h) => `<program>
<verdict:string="unset"/>
server function isOk(n: int) { return n > 100; }
<p>${"${"}@verdict}</p>
<form onsubmit=${"${"}(event) => { ${h} }}><button>s</button></form>
</program>
`;
  test("a control call BEFORE the suspension in the loop body is E-EVENT-CONTROL-AFTER-AWAIT", () => {
    const e = errs(P(LOOP("if (i == 2) { event.preventDefault(); }")));
    expect(e.map((d) => d.code)).toEqual(["E-EVENT-CONTROL-AFTER-AWAIT"]);
    expect(e[0].message).toContain("loop that suspends");
  });
  test("a plain non-control read in the loop, a call before the loop, a loop with no suspension: no error", () => {
    expect(codes(P(LOOP("const t: string = event.type;")))).toEqual([]);
    expect(codes(P("event.preventDefault(); " + LOOP("")))).toEqual([]);
    expect(codes(P(`for (const i of [1, 2]) { event.preventDefault(); } const ok: bool = isOk(1) !{ _ :> false };`))).toEqual([]);
  });
});
