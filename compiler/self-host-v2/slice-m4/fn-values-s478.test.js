// fn-values-s478.test.js — s478-boot-fn-values: the §5.2.1 handler FUNCTION that takes the event.
//
// §5.2.1: "The expression form is required when: You need the event object: `onclick=${(e) =>
// handler(e, arg)}`". §5.2 (S457): "A `${…}` value that IS a function (`${(e) => …}`, `${fn(e)
// { … }}`) is the listener itself and names its own parameter." Before: every such handler was
// E-BOOTSTRAP-UNSUPPORTED (parse.scrml parseDollarValue). Now an ARROW of one parameter is the
// listener, its parameter bound to the event BY SCOPE. The event's type is not a scrml type
// (§5.2 rule 2) and its members stay open and untyped (§21.3.3 rule 16); the bootstrap builds
// the members Appendix H gives the `Event` interface (H-047 `type`, H-048 `timeStamp` reads;
// H-050 `preventDefault()`, H-051 `stopPropagation()` calls as statements) and refuses every
// other use BY NAME. §13.2 E-EVENT-CONTROL-AFTER-AWAIT: after the handler's first `await`, the
// event is usable only for a plain read of a non-control property.
// Every program here is compiled from source by the bootstrap, its Core checked, printed and RUN
// (happy-dom) where it compiles.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const msgs = (src) => errs(fe(src)).map((d) => `${d.code}: ${d.message}`);
const $ = (sel) => document.querySelector(sel);
let k = 0;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s478-fnv-" + k++);
  return r;
}

const P = (attrs, extra = "") => `<program>
    let <out:string="-"/>
    let <n:int=0/>
${extra}
    ${attrs}
    <p id="o">\${@out}</p>
    <p id="n">\${@n}</p>
</program>
`;

describe("§5.2.1 — a `${(e) => …}` listener (run)", () => {
  test("a block body reads `e.type` (H-047) and calls `e.preventDefault()` (H-050)", async () => {
    await run(P(`<form id="f" onsubmit=\${(e) => { e.preventDefault(); @out = e.type; }}><button>s</button></form>`));
    const ev = new window.Event("submit", { bubbles: true, cancelable: true });
    $("#f").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect($("#o").textContent).toBe("submit");
  });
  test("an expression body, `(ev) => @out = ev.type`", async () => {
    await run(P(`<button id="b" onclick=\${(ev) => @out = ev.type}>b</button>`));
    click($("#b"));
    expect($("#o").textContent).toBe("click");
  });
  test("`e.stopPropagation()` (H-051) keeps the event from the ancestor's handler (§5.2.2 dispatch contract)", async () => {
    await run(P(`<div id="d" onclick={ @n = @n + 10; }><button id="b" onclick=\${(e) => { e.stopPropagation(); @n = @n + 1; }}>b</button><button id="c" onclick={ @n = @n + 1; }>c</button></div>`));
    click($("#b"));
    expect($("#n").textContent).toBe("1");
    click($("#c"));
    expect($("#n").textContent).toBe("12");
  });
  test("`e.timeStamp` (H-048) is a `number`", async () => {
    await run(P(`<button id="b" onclick=\${(e) => { const t: number = e.timeStamp; if (t >= 0) { @out = "ok"; } }}>b</button>`));
    click($("#b"));
    expect($("#o").textContent).toBe("ok");
  });
  test("an event that is not used, and a handler that never names it", async () => {
    await run(P(`<button id="b" onclick=\${(e) => { @n = @n + 1; }}>b</button>`));
    click($("#b"));
    expect($("#n").textContent).toBe("1");
  });
  test("an inner binding of the same name is another binding (§13.2 — by SCOPE, not by name)", async () => {
    await run(P(`<button id="b" onclick=\${(e) => { const e2: string = e.type; @out = e2; }}>b</button>`,
      `    <xs:int[]=([1, 2, 3])/>`));
    click($("#b"));
    expect($("#o").textContent).toBe("click");
  });
  test("a listener in an `<each>` row", async () => {
    await run(P(`<ul><each in=@xs as x><li><button class="r" onclick=\${(e) => { e.stopPropagation(); @out = e.type; @n = @n + x; }}>b</button></li></each></ul>`,
      `    <xs:int[]=([1, 2])/>`));
    click(document.querySelectorAll(".r")[1]);
    expect($("#o").textContent).toBe("click");
    expect($("#n").textContent).toBe("2");
  });
  test("the printed listener names the event as its own argument", () => {
    const r = fe(P(`<button id="b" onclick=\${(e) => { e.preventDefault(); }}>b</button>`));
    expect(errs(r)).toEqual([]);
    const js = mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
    expect(js).toContain("(task$, event$) =>");
    expect(js).toContain("event$.preventDefault()");
  });
  test("a handler that does not take the event prints as before (no event argument)", () => {
    const r = fe(P(`<button id="b" onclick=\${() => { @n = @n + 1; }}>b</button>`));
    expect(errs(r)).toEqual([]);
    const js = mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
    expect(js).not.toContain("event$");
  });
});

const S = (body) => `<program>
    let <verdict:string="unset"/>
    server function isOk(n: int) { return n > 100; }
    <form id="f" onsubmit=\${(event) => { ${body} }}><button>s</button></form>
    <p id="out">\${@verdict}</p>
</program>
`;
const CALL = `const ok: bool = isOk(1) !{ _ :> false }; if (ok) { @verdict = "a"; } else { @verdict = "r"; }`;

describe("§13.2 — E-EVENT-CONTROL-AFTER-AWAIT", () => {
  test("a control call BEFORE the first server call compiles", () => {
    expect(codes(S(`event.preventDefault(); ${CALL}`))).toEqual([]);
  });
  test("`event.preventDefault()` after it is the error", () => {
    expect(codes(S(`${CALL} event.preventDefault();`))).toEqual(["E-EVENT-CONTROL-AFTER-AWAIT"]);
  });
  test("`event.stopPropagation()` after it, inside a later `if`, is the error (source order)", () => {
    expect(codes(S(`${CALL} if (ok) { event.stopPropagation(); }`))).toEqual(["E-EVENT-CONTROL-AFTER-AWAIT"]);
  });
  test("an UNHANDLED server call awaits too (E-ERROR-002 for the call, and the event rule after it)", () => {
    expect(codes(S(`@verdict = isOk(1) ? "a" : "r"; event.preventDefault();`)).sort()).toEqual(["E-ERROR-002", "E-EVENT-CONTROL-AFTER-AWAIT"]);
  });
  test("a plain non-control read after it is allowed", () => {
    expect(codes(S(`${CALL} @verdict = event.type;`))).toEqual([]);
  });
  test("a handler with no server call is never judged", () => {
    expect(codes(S(`@verdict = event.type; event.preventDefault();`))).toEqual([]);
  });
});

describe("never silently accepted — refused by name (E-BOOTSTRAP-UNSUPPORTED)", () => {
  const ONE = (h) => P(`<button id="b" onclick=\${${h}}>b</button>`);
  test("NEGATIVE: a handler reading an event field the bootstrap does not build (`e.foo`, `e.target`, `e.key`)", () => {
    for (const m of ["foo", "target", "key"]) {
      const ms = msgs(ONE(`(e) => { @out = e.${m}; }`));
      expect(ms.length).toBe(1);
      expect(ms[0]).toStartWith(`E-BOOTSTRAP-UNSUPPORTED: \`e.${m}\``);
    }
  });
  test("NEGATIVE: the event passed as an argument (an `int` parameter) — never type-checked as an `int`", () => {
    const ms = msgs(P(`<button id="b" onclick=\${(e) => { f(e); }}>b</button>`, `    function f(x: int) { }`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `e` used as a value");
  });
  test("an alias of the event, and a computed member", () => {
    expect(codes(ONE(`(e) => { const ev = e; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(ONE(`(e) => { e["preventDefault"](); }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a control member taken off the event without a call, and a member write", () => {
    expect(codes(ONE(`(e) => { const pd = e.preventDefault; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgs(ONE(`(e) => { e.returnValue = false; }`))[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `e.returnValue = …`");
  });
  test("NEGATIVE: `e.preventDefault(1)` — Appendix H's signature is `() -> void`", () => {
    expect(codes(ONE(`(e) => { e.preventDefault(1); }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("`e.preventDefault()` used as a value is E-TYPE-001 (§18.3: void)", () => {
    expect(codes(ONE(`(e) => { const v = e.preventDefault(); }`))).toEqual(["E-TYPE-001"]);
  });
  test("the event used inside a lambda in the handler", () => {
    const ms = msgs(P(`<button id="b" onclick=\${(e) => { const ys: int[] = @xs.map(x => x + e.timeStamp); }}>b</button>`, `    <xs:int[]=([1, 2])/>`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toContain("inside a lambda in the handler");
  });
  test("a handler of two parameters, and a function expression that takes the event", () => {
    expect(codes(ONE(`(a, b) => { @n = 1; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(ONE(`(a, b) => @n = 1`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(ONE(`function (e) { @n = 1; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("an arrow whose body only names a function (it does not call it)", () => {
    expect(codes(P(`<button id="b" onclick=\${(e) => f}>b</button>`, `    function f() { }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P(`<button id="b" onclick=\${(e) => { f; }}>b</button>`, `    function f() { }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

// Review round 1 (HIGH-1): an event member read is typed with its Appendix H slot scalar
// (`type` string H-047, `timeStamp` number H-048) — one hostCallType for every host call —
// so a wrong-typed slot is refused (E-TYPE-031, §66.1 rule 5), never accepted as Unknown.
describe("§5.2.1 event member reads are typed (Appendix H scalars)", () => {
  const ONE = (h, extra = "") => P(`<button id="b" onclick=\${${h}}>b</button>`, extra);
  test("NEGATIVE: `e.timeStamp` (number) into int slots — cell, local, argument, arithmetic, index", () => {
    expect(codes(ONE(`(e) => { @n = e.timeStamp; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { const k: int = e.timeStamp; @n = k; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { g(e.timeStamp); }`, `    function g(x: int) { @n = x; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { @n = @n + e.timeStamp; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { @n = @xs[e.timeStamp]; }`, `    <xs:int[]=([1, 2])/>`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: `e.timeStamp` into a string slot, `e.type` (string) into int / bool / enum slots", () => {
    expect(codes(ONE(`(e) => { const s: string = e.timeStamp; @out = s; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { @n = e.type; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { @ok = e.type; }`, `    let <ok:bool=false/>`))).toEqual(["E-TYPE-031"]);
    expect(codes(ONE(`(e) => { @c = e.type; }`, `    type C:enum = { A, B }\n    let <c:C=(C.A)/>`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: `if (e.type)` is E-COND-NOT-BOOLEAN; `e.type - 1` is an operand error", () => {
    expect(codes(ONE(`(e) => { if (e.type) { @out = "t"; } }`))).toEqual(["E-COND-NOT-BOOLEAN"]);
    expect(codes(ONE(`(e) => { @n = e.type - 1; }`))).toEqual(["E-OPERATOR-OPERAND-TYPE"]);
  });
  test("the right slots compile: `e.type` into a string, `e.timeStamp` into a number", () => {
    expect(codes(ONE(`(e) => { @out = e.type; }`))).toEqual([]);
    expect(codes(ONE(`(e) => { const t: number = e.timeStamp; if (t > 0) { @out = "y"; } }`))).toEqual([]);
  });
  test("a control call in a `!{}` arm is not typed `number` (no spurious E-TYPE-031)", () => {
    expect(codes(S(`const ok: bool = isOk(1) !{ _ :> event.preventDefault() };`))).toEqual(["E-EVENT-CONTROL-AFTER-AWAIT"]);
  });
  test("§13.2: `e[k]()` after the first await is E-EVENT-CONTROL-AFTER-AWAIT beside the §5.2 sink refusal", () => {
    expect(codes(S(`const k: string = "preventDefault"; ${CALL} event[k]();`)).sort()).toEqual(["E-EVENT-CONTROL-AFTER-AWAIT", "E-LOGIC-EXECUTABLE-SINK"]);
  });
});
