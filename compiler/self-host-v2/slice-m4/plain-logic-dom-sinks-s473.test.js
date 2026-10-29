// plain-logic-dom-sinks-s473.test.js — s473-boot-plain-logic-dom-sinks.
//
// Ruling (ruling:user-voice-scrml.md S473 "⭐ RULED — S473 PA recs: host allowlist Q1–Q4,
// plain-logic DOM sinks, impl#1 transport routing", item 2), verbatim:
//   "Plain client logic: data written to a known executable sink is a compile ERROR … The set is
//    `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc`, `on*` properties and attributes,
//    `document.write`/`writeln`, and `eval`/`Function`/string `setTimeout`/`setInterval`. Every
//    other DOM member stays open; off-surface members get a warning. The corpus is measured before
//    landing."
//
// SPEC §5.2 "Executable sinks in plain logic (S473)" — E-LOGIC-EXECUTABLE-SINK. The judgment is one
// shared table (url.scrml `logicSinkOf` / `executableAttrName`) applied on the typer's own path
// (analyze.scrml resolveAssign / resolveCall / resolveCallStmt, and parse.scrml's compound
// assignment), so it fires whatever else the bootstrap does or does not yet support there.
//
// Static string literals: an HTML-string sink (`innerHTML`, `outerHTML`, `insertAdjacentHTML`,
// `document.write` / `writeln`) admits a quoted string literal (the author's own markup); `srcdoc`,
// `on*`, `eval` / `Function` and a string timer refuse a literal too (§5.2 S464: a static `srcdoc`
// and a quoted handler are refused; "There is no raw-JavaScript escape hatch").

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const CODE = "E-LOGIC-EXECUTABLE-SINK";
const W = "type W:struct = { let innerHTML: string, let outerHTML: string, let srcdoc: string, let onclick: string, let ONCLICK: string, let online: string, let one: string, let k: string }\n";
const P = (body, markup = `        <button onclick=go()>b</button>`) => `${W}<program>
    let <s:string="x"/>
    <w:W=({ innerHTML: "a", outerHTML: "a", srcdoc: "a", onclick: "a", ONCLICK: "a", online: "a", one: "a", k: "a" })/>
    function tick() { @s = "t"; }
    function go() {
        ${body}
    }
    <main>
${markup}
    </main>
</program>
`;
const run = (src) => frontEnd(mods, [{ path: "s.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const sinkCount = (src) => codes(src).filter((c) => c === CODE).length;

describe("member writes — innerHTML / outerHTML / srcdoc / on* on any value", () => {
  const refused = [
    ["a struct field `innerHTML` from data", "@w.innerHTML = @s;"],
    ["`outerHTML` from data", "@w.outerHTML = @s;"],
    ["`srcdoc` from data", "@w.srcdoc = @s;"],
    ["`srcdoc` from a literal (§5.2 S464: a static srcdoc is refused)", "@w.srcdoc = \"<p>x</p>\";"],
    ["`onclick` from data", "@w.onclick = @s;"],
    ["`ONCLICK` (any case)", "@w.ONCLICK = @s;"],
    ["`onclick` from a literal (§5.2 S464: a quoted handler is refused)", "@w.onclick = \"alert(1)\";"],
    ["a host root `document.body.innerHTML`", "document.body.innerHTML = @s;"],
    ["a host root `document.body.onclick`", "document.body.onclick = @s;"],
    ["bracket access with a literal key", "@w[\"innerHTML\"] = @s;"],
    ["bracket access with a literal on* key on a host root", "document.body[\"onload\"] = @s;"],
    ["bracket access with a NON-literal key on a host value (fail closed)", "const k: string = \"innerHTML\";\n        document.body[k] = @s;"],
    ["compound assignment", "document.body.innerHTML += @s;"],
    ["compound assignment on a struct field", "@w.innerHTML += @s;"],
    ["a destructuring target", "[document.body.innerHTML] = [@s];"],
    ["an object destructuring target", "({ a: document.body.innerHTML } = { a: @s });"],
  ];
  for (const [what, body] of refused) {
    test(`refused: ${what}`, () => {
      expect(codes(P(body))).toContain(CODE);
    });
  }

  test("reported once per write", () => {
    expect(sinkCount(P("document.body.innerHTML = @s;"))).toBe(1);
  });

  test("an inline handler block in markup is judged too", () => {
    expect(codes(P("tick();", `        <button onclick={ document.body.innerHTML = @s; }>b</button>`))).toContain(CODE);
  });

  const open = [
    ["an ordinary struct field", "@w.k = @s;"],
    ["`innerHTML` from a quoted string literal (the author's own markup)", "@w.innerHTML = \"<b>hi</b>\";"],
    ["`outerHTML` from a literal", "@w.outerHTML = \"<b>hi</b>\";"],
    ["`online` (an exempt word, §5.2 rule 1's name test)", "@w.online = @s;"],
    ["`one` (an exempt word)", "@w.one = @s;"],
    ["`textContent` (every other member stays open)", "document.body.textContent = @s;"],
    ["a read of `innerHTML`", "const t: string = @w.innerHTML;\n        @s = t;"],
  ];
  for (const [what, body] of open) {
    test(`not a sink: ${what}`, () => {
      expect(codes(P(body))).not.toContain(CODE);
    });
  }

  test("a struct write of an ordinary field and a literal innerHTML compile clean", () => {
    expect(codes(P("@w.k = @s;\n        @w.innerHTML = \"<b>x</b>\";"))).toEqual([]);
  });
});

describe("calls — eval / Function / string timers / insertAdjacentHTML / document.write", () => {
  const refused = [
    ["`eval(data)`", "eval(@s);"],
    ["`eval(literal)` (a literal is JavaScript text too)", "eval(\"1 + 1\");"],
    ["`window.eval(data)`", "window.eval(@s);"],
    ["`globalThis.Function(data)`", "globalThis.Function(@s);"],
    ["`Function(data)`", "Function(@s);"],
    ["an alias through `.call`", "eval.call(window, @s);"],
    ["an alias through `.apply` of insertAdjacentHTML", "document.body.insertAdjacentHTML.apply(document.body, [\"beforeend\", @s]);"],
    ["`eval` in expression position", "const r: string = eval(@s);\n        @s = r;"],
    ["`setTimeout(data, …)`", "setTimeout(@s, 10);"],
    ["`setTimeout(literal, …)`", "setTimeout(\"tick()\", 10);"],
    ["`window.setInterval(data, …)`", "window.setInterval(@s, 10);"],
    ["`insertAdjacentHTML` from data", "document.body.insertAdjacentHTML(\"beforeend\", @s);"],
    ["`document.write` from data", "document.write(@s);"],
    ["`document.writeln` from data", "document.writeln(@s);"],
    ["`window.document.write` from data", "window.document.write(@s);"],
    ["`setAttribute(\"onclick\", …)`", "document.body.setAttribute(\"onclick\", @s);"],
    ["`setAttribute(\"onclick\", literal)`", "document.body.setAttribute(\"onclick\", \"alert(1)\");"],
    ["`setAttribute(\"SRCDOC\", …)`", "document.body.setAttribute(\"SRCDOC\", @s);"],
    ["`setAttribute` with a non-literal name", "const n: string = \"title\";\n        document.body.setAttribute(n, @s);"],
    ["`setAttributeNS(ns, \"onload\", …)`", "document.body.setAttributeNS(\"x\", \"onload\", @s);"],
    ["`toggleAttribute(\"onclick\")`", "document.body.toggleAttribute(\"onclick\");"],
    ["`Object.assign` of a sink key", "Object.assign(document.body, { innerHTML: @s });"],
    ["`Object.assign` of an on* key", "Object.assign(document.body, { onclick: @s });"],
    ["`Object.assign` of unknown keys onto a host value (fail closed)", "Object.assign(document.body, @w);"],
    ["`Reflect.set` of a sink key", "Reflect.set(document.body, \"innerHTML\", @s);"],
    ["`Reflect.set` with a non-literal key (fail closed)", "const k: string = \"innerHTML\";\n        Reflect.set(document.body, k, @s);"],
  ];
  for (const [what, body] of refused) {
    test(`refused: ${what}`, () => {
      expect(codes(P(body))).toContain(CODE);
    });
  }

  const open = [
    ["`insertAdjacentHTML` from a literal", "document.body.insertAdjacentHTML(\"beforeend\", \"<b>x</b>\");"],
    ["`document.write` from a literal", "document.write(\"<p>x</p>\");"],
    ["`setAttribute(\"title\", data)`", "document.body.setAttribute(\"title\", @s);"],
    ["`setTimeout(fn, …)` — a declared function", "setTimeout(tick, 10);"],
    ["`setTimeout(() => …, …)` — an arrow", "setTimeout(() => tick(), 10);"],
    ["`Object.assign` onto a fresh object", "const o: W = Object.assign({}, @w);\n        @w = o;"],
    ["a `write` on something other than `document`", "@w.write(@s);"],
  ];
  for (const [what, body] of open) {
    test(`not a sink: ${what}`, () => {
      expect(codes(P(body))).not.toContain(CODE);
    });
  }
});

describe("the message names the sink and the way out", () => {
  test("innerHTML", () => {
    const d = run(P("document.body.innerHTML = @s;")).diags.find((x) => x.code === CODE);
    expect(d.message).toContain("innerHTML");
    expect(d.message).toContain("§5.2");
  });
  test("eval", () => {
    const d = run(P("eval(@s);")).diags.find((x) => x.code === CODE);
    expect(d.message).toContain("eval");
  });
  test("severity is Error", () => {
    const d = run(P("eval(@s);")).diags.find((x) => x.code === CODE);
    expect(String(d.severity)).toMatch(/Error/);
  });
});
