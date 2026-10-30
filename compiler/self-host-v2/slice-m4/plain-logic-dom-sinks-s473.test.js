// plain-logic-dom-sinks-s473.test.js — s473-boot-plain-logic-dom-sinks.
//
// Ruling (ruling:user-voice-scrml.md S473 "⭐ RULED — S473 PA recs: host allowlist Q1–Q4,
// plain-logic DOM sinks, impl#1 transport routing", item 2), verbatim:
//   "Plain client logic: data written to a known executable sink is a compile ERROR … The set is
//    `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `srcdoc`, `on*` properties and attributes,
//    `document.write`/`writeln`, and `eval`/`Function`/string `setTimeout`/`setInterval`. Every
//    other DOM member stays open; off-surface members get a warning. The corpus is measured before
//    landing."
// Extended by the S473 PA ruling on the #1663 review: `setHTMLUnsafe`,
// `Range.createContextualFragment`, `DOMParser.parseFromString`, `document.execCommand`
// (insertHTML), and a `location` / `href` / `assign` / `replace` navigation whose URL is not judged.
//
// SPEC §5.2 "Executable sinks in plain logic (S473)" — E-LOGIC-EXECUTABLE-SINK. The table is ONE
// table (url.scrml `logicWriteSink` / `logicCallSink` / `htmlArgIndex` / `attrNameArgIndex`),
// judged on the typer's own path (analyze.scrml `sinkTargetWhy` / `sinkCallWhy`, first in
// resolveAssign / resolveCallStmt / resolveCallOrConstruct; resolveName / resolveMember for an
// `eval` / `Function` value) and at a compound assignment (parse.scrml `compoundSinkMember`).
//
// Two halves (#1663 review F1 / F5): BY NAME on any value (`innerHTML`, `outerHTML`, `srcdoc`), and
// BY TYPE, fail closed (a computed key, `Object.assign` of a non-literal source, an `on…` member, a
// navigation are admitted only on a value whose static type is a scrml type). Member names are
// case-sensitive, as the platform's are. Client logic only; `eval` / `Function` everywhere.
//
// The bootstrap compiles no host value today (`document` / `window` are E-SCOPE-001, `ref=` is
// E-BOOTSTRAP-UNSUPPORTED), so a host-value test asserts THIS code fires there (the judgment runs
// first); a "not a sink" test either compiles CLEAN (a scrml-typed fixture) or, on a host value,
// asserts this code is absent and the site is refused only by an unrelated code today.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const CODE = "E-LOGIC-EXECUTABLE-SINK";
const W = "type W:struct = { let innerHTML: string, let outerHTML: string, let srcdoc: string, let onclick: string, let ONCLICK: string, let online: string, let one: string, let once: string, let href: string, let k: string }\n";
const INIT = `{ innerHTML: "a", outerHTML: "a", srcdoc: "a", onclick: "a", ONCLICK: "a", online: "a", one: "a", once: "a", href: "a", k: "a" }`;
const P = (body, markup = `        <button onclick=go()>b</button>`, extra = "") => `${W}<program>
    let <s:string="x"/>
    let <n:int=0/>
    <w:W=(${INIT})/>
    function tick() { @s = "t"; }
${extra}    function go() {
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

function refusedAll(rows) {
  for (const [what, body, extra] of rows) {
    test(`refused: ${what}`, () => {
      expect(codes(P(body, undefined, extra || ""))).toContain(CODE);
    });
  }
}
function cleanAll(rows) {
  for (const [what, body] of rows) {
    test(`compiles clean: ${what}`, () => {
      expect(codes(P(body))).toEqual([]);
    });
  }
}
// Not judged by this rule, on a value the bootstrap cannot compile yet: this code is absent, and
// the site is refused today only by an unrelated code (named, so the test says what it proves).
function notJudgedAll(rows) {
  for (const [what, body, today] of rows) {
    test(`not this rule: ${what} (today: ${today})`, () => {
      const cs = codes(P(body));
      expect(cs).not.toContain(CODE);
      expect(cs).toContain(today);
    });
  }
}

describe("by name, on any value — innerHTML / outerHTML / srcdoc", () => {
  refusedAll([
    ["a struct field `innerHTML` from data", "@w.innerHTML = @s;"],
    ["`outerHTML` from data", "@w.outerHTML = @s;"],
    ["`srcdoc` from data", "@w.srcdoc = @s;"],
    ["`srcdoc` from a literal (§5.2 S464: a static srcdoc is refused)", "@w.srcdoc = \"<p>x</p>\";"],
    ["a host root `document.body.innerHTML`", "document.body.innerHTML = @s;"],
    ["a nested chain", "document.body.firstChild.innerHTML = @s;"],
    ["a template literal is not static", "document.body.innerHTML = `<b>${@s}</b>`;"],
    ["a concatenation is not static", "document.body.innerHTML = \"<b>\" + @s;"],
    ["bracket access with a literal key", "@w[\"innerHTML\"] = @s;"],
    ["compound assignment on a host value", "document.body.innerHTML += @s;"],
    ["compound assignment on a struct field", "@w.innerHTML += @s;"],
    ["an array destructuring target", "[document.body.innerHTML] = [@s];"],
    ["an object destructuring target", "({ a: document.body.innerHTML } = { a: @s });"],
    ["an assignment in value position", "@s = (@w.innerHTML = @s);"],
    ["a chained assignment", "@w.k = @w.innerHTML = @s;"],
  ]);

  test("reported once per write", () => {
    expect(sinkCount(P("document.body.innerHTML = @s;"))).toBe(1);
  });

  test("an inline handler block in markup is judged too", () => {
    expect(codes(P("tick();", `        <button onclick={ document.body.innerHTML = @s; }>b</button>`))).toContain(CODE);
  });

  cleanAll([
    ["an ordinary struct field", "@w.k = @s;"],
    ["`innerHTML` from a quoted string literal (the author's own markup)", "@w.innerHTML = \"<b>hi</b>\";"],
    ["`outerHTML` from a literal", "@w.outerHTML = \"<b>hi</b>\";"],
    ["a read of `innerHTML`", "const t: string = @w.innerHTML;\n        @s = t;"],
  ]);

  notJudgedAll([
    ["`innerHtml` — names are case-sensitive, as the platform's (an expando)", "document.body.innerHtml = @s;", "E-SCOPE-001"],
    ["`INNERHTML`", "document.body.INNERHTML = @s;", "E-SCOPE-001"],
    ["`textContent` (every other member stays open)", "document.body.textContent = @s;", "E-SCOPE-001"],
  ]);
});

describe("on… members — the platform pattern, by type (#1663 F5)", () => {
  refusedAll([
    ["`onclick` on a host value", "document.body.onclick = @s;"],
    ["`onclick` from a literal on a host value (§5.2 S464: a quoted handler is refused)", "document.body.onclick = \"alert(1)\";"],
    ["a literal on* bracket key on a host value", "document.body[\"onload\"] = @s;"],
    ["`onclick` on a local initialized from a host value", "const b = document.body;\n        b.onclick = @s;"],
  ]);

  cleanAll([
    ["`onclick` — a declared field of a scrml struct is that field, not a handler", "@w.onclick = @s;"],
    ["`once` — a declared struct field", "@w.once = @s;"],
    ["`online` (an exempt word)", "@w.online = @s;"],
    ["`one` (an exempt word)", "@w.one = @s;"],
    ["`ONCLICK` — a struct field (and not the platform pattern)", "@w.ONCLICK = @s;"],
  ]);

  notJudgedAll([
    ["`ONCLICK` on a host value — not the platform pattern `on[a-z]+`", "document.body.ONCLICK = @s;", "E-SCOPE-001"],
  ]);
});

describe("by type, fail closed — computed keys and copied keys (#1663 F1)", () => {
  refusedAll([
    ["a non-literal key on a host value", "const k: string = \"innerHTML\";\n        document.body[k] = @s;"],
    ["a non-literal key on a local alias of a host value", "const b = document.body;\n        b[@s] = @s;"],
    ["a template key on a local alias", "const b = document.body;\n        b[`innerHTML`] = @s;"],
    ["a template key on a host root", "document.body[`innerHTML`] = @s;"],
    ["a non-literal key on a parameter of a type the program does not declare (a host type)", "h(@s);", "    function h(e: Event) { e[@s] = @s; }\n"],
    ["`Object.assign` of a non-literal source onto a host value", "Object.assign(document.body, @w);"],
    ["`Object.assign` of a non-literal source onto a local alias", "const b = document.body;\n        Object.assign(b, @w);"],
    ["`Object.assign` of a spread onto a host value", "Object.assign(document.body, { ...@w });"],
    ["`Object.assign` of a sink key", "Object.assign(document.body, { innerHTML: @s });"],
    ["`Object.assign` of a quoted sink key", "Object.assign(document.body, { \"innerHTML\": @s });"],
    ["`Object.assign` of an on* key onto a host value", "Object.assign(document.body, { onclick: @s });"],
    ["`Object.assign` of a by-name sink key onto a cell (any value)", "Object.assign(@w, { srcdoc: @s });"],
    ["`Reflect.set` of a sink key", "Reflect.set(document.body, \"innerHTML\", @s);"],
    ["`Reflect.set` with a non-literal key on a local alias", "const b = document.body;\n        Reflect.set(b, @s, @s);"],
    ["`Object.defineProperties` naming a sink", "Object.defineProperties(document.body, { innerHTML: { value: @s } });"],
    ["a computed method on a host value", "const m: string = \"insertAdjacentHTML\";\n        document.body[m](\"beforeend\", @s);"],
  ]);

  // A scrml-typed receiver admits a computed key / a copied source (other checks still judge it).
  notJudgedAll([
    ["`Object.assign` of a cell onto a cell (both scrml-typed)", "Object.assign(@w, @w);", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`Object.assign` of a spread onto a cell — consistent with the line above", "Object.assign(@w, { ...@w });", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`Object.assign` onto a fresh object", "const o: W = Object.assign({}, @w);\n        @w = o;", "E-BOOTSTRAP-UNSUPPORTED"],
    ["a computed key on a struct cell", "@w[@s] = @s;", "E-ASSIGN-TARGET"],
    // measured on the corpus (stdlib/data, stdlib/md): a `const` bound to a fresh literal is scrml data,
    // and a numeric key never names a member
    ["a computed key on a `const` bound to an object literal", "const r = {};\n        r[@s] = @s;", "E-TYPE-STRUCT-CONTEXT"],
    ["a numeric-literal key on an inferred local", "let ys = [1];\n        ys[0] = 2;", "E-WRITE-NOT-GRANTED"],
    ["an arithmetic key on an inferred local", "let ys = [1];\n        ys[ys.length - 1] = 2;", "E-WRITE-NOT-GRANTED"],
    ["a braced-arrow timer argument (the parser reports it)", "setTimeout(() => { tick(); }, 10);", "E-BOOTSTRAP-UNSUPPORTED"],
  ]);
});

describe("calls — eval / Function / timers / HTML parsers / document.write", () => {
  refusedAll([
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
    ["`setAttribute(\"SRCDOC\", …)` — attribute names are case-insensitive", "document.body.setAttribute(\"SRCDOC\", @s);"],
    ["`setAttribute` with a non-literal name", "const n: string = \"title\";\n        document.body.setAttribute(n, @s);"],
    ["`setAttributeNS(ns, \"onload\", …)`", "document.body.setAttributeNS(\"x\", \"onload\", @s);"],
    ["`toggleAttribute(\"onclick\")`", "document.body.toggleAttribute(\"onclick\");"],
  ]);
});

describe("#1663 F2 — write / writeln on any receiver", () => {
  refusedAll([
    ["`ownerDocument.write`", "document.body.ownerDocument.write(@s);"],
    ["`contentDocument.write`", "document.body.contentDocument.write(@s);"],
    ["`document.open().write`", "document.open().write(@s);"],
    ["`write` on any other receiver", "@w.write(@s);"],
  ]);
});

describe("#1663 F3 — eval / Function as a value, non-chain callees, constructor", () => {
  refusedAll([
    ["a ternary callee", "(@n == 0 ? eval : tick)(@s);"],
    ["a `&&` callee", "(true && eval)(@s);"],
    ["`Function` passed to `.map`", "const r = [@s].map(Function);"],
    ["`Reflect.apply(eval, …)`", "Reflect.apply(eval, window, [@s]);"],
    ["`f.constructor(…)` (it is `Function`)", "tick.constructor(@s);"],
    ["`eval` bound to a local", "const f = eval;"],
    ["`window.eval` bound to a local", "const g = window.eval;"],
    ["`setTimeout(eval, …)`", "setTimeout(eval, 0, @s);"],
  ]);
});

describe("#1663 F4 — on… attributes through Attr nodes", () => {
  refusedAll([
    ["`getAttributeNode(\"onclick\").value = …`", "document.body.getAttributeNode(\"onclick\").value = @s;"],
    ["`getAttributeNode(…).value` of any attribute (fail closed)", "document.body.getAttributeNode(\"title\").value = @s;"],
    ["`attributes[\"onclick\"].value = …`", "document.body.attributes[\"onclick\"].value = @s;"],
    ["`attributes.getNamedItem(\"onclick\").value = …`", "document.body.attributes.getNamedItem(\"onclick\").value = @s;"],
    ["`createAttribute(\"onclick\")`", "const a = document.createAttribute(\"onclick\");"],
    ["`createAttribute` with a non-literal name", "const a = document.createAttribute(@s);"],
    ["`setAttributeNode(…)`", "document.body.setAttributeNode(document.createAttribute(\"title\"));"],
    ["`attributes.setNamedItem(…)`", "document.body.attributes.setNamedItem(document.createAttribute(\"title\"));"],
  ]);
});

describe("S473 PA ruling on #1663 — HTML parsers, execCommand, navigation", () => {
  refusedAll([
    ["`setHTMLUnsafe` from data", "document.body.setHTMLUnsafe(@s);"],
    ["`createContextualFragment` from data", "document.createRange().createContextualFragment(@s);"],
    ["`parseFromString` from data", "document.parseFromString(@s, \"text/html\");"],
    ["`execCommand(\"insertHTML\", …)` from data", "document.execCommand(\"insertHTML\", false, @s);"],
    ["`execCommand` with a computed command", "document.execCommand(@s, false, \"x\");"],
    ["`location.href = data`", "location.href = @s;"],
    ["`window.location = data`", "window.location = @s;"],
    ["`location = data`", "location = @s;"],
    ["`location.assign(data)`", "location.assign(@s);"],
    ["`window.location.replace(data)`", "window.location.replace(@s);"],
    ["a `javascript:` literal", "location.href = \"javascript:alert(1)\";"],
    ["an element `href` from data", "document.body.href = @s;"],
  ]);

  cleanAll([
    ["a struct field named `href` is that field", "@w.href = @s;"],
    ["a string's `.replace` is not a navigation", "const t: string = @s.replace(\"a\", \"b\");\n        @s = t;"],
  ]);

  notJudgedAll([
    ["a static `https:` navigation (§5.2 rule 3 admits it)", "location.href = \"https://example.com/\";", "E-SCOPE-001"],
    ["`setHTMLUnsafe` from a literal", "document.body.setHTMLUnsafe(\"<b>x</b>\");", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`execCommand(\"bold\")`", "document.execCommand(\"bold\", false, \"\");", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`insertAdjacentHTML` from a literal", "document.body.insertAdjacentHTML(\"beforeend\", \"<b>x</b>\");", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`document.write` from a literal", "document.write(\"<p>x</p>\");", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`setAttribute(\"title\", data)`", "document.body.setAttribute(\"title\", @s);", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`setTimeout(fn, …)` — a declared function", "setTimeout(tick, 10);", "E-SCOPE-001"],
    ["`setTimeout(() => …, …)` — an arrow", "setTimeout(() => tick(), 10);", "E-SCOPE-001"],
  ]);
});

describe("#1663 re-review N1 — an attribute node bound away from the chain", () => {
  refusedAll([
    ["`attributes` bound to a local", "const a = document.body.attributes;\n        a[0].value = @s;"],
    ["an attribute node bound to a local", "const n = document.body.attributes[0];\n        n.value = @s;"],
    ["`getNamedItem(…)` bound to a local", "const n = document.body.attributes.getNamedItem(\"title\");"],
    ["`getAttributeNode(…)` bound to a local", "const n = document.body.getAttributeNode(\"title\");"],
    ["`getNamedItem(\"onclick\")` — its name is judged", "document.body.attributes.getNamedItem(\"onclick\");"],
    ["`getNamedItem` with a computed name", "document.body.attributes.getNamedItem(@s);"],
    ["iterating `attributes`", "for (const at of document.body.attributes) {\n            at.value = @s;\n        }"],
    ["an attribute node passed as an argument", "tick(document.body.attributes[0]);"],
  ]);
  notJudgedAll([
    ["`attributes.length` is a number", "const c: int = document.body.attributes.length;\n        @n = c;", "E-SCOPE-001"],
  ]);
});

describe("#1663 re-review N2 (S473 PA ruling) — URL attributes in logic, `window.open`", () => {
  refusedAll([
    ["`src` from data", "document.body.src = @s;"],
    ["`action` from data", "document.body.action = @s;"],
    ["`formAction` from data", "document.body.formAction = @s;"],
    ["`poster` from data", "document.body.poster = @s;"],
    ["a `javascript:` `src` literal", "document.body.src = \"javascript:alert(1)\";"],
    ["`setAttribute(\"href\", data)`", "document.body.setAttribute(\"href\", @s);"],
    ["`setAttribute(\"SRC\", \"javascript:…\")`", "document.body.setAttribute(\"SRC\", \"javascript:1\");"],
    ["`setAttributeNS(ns, \"href\", data)`", "document.body.setAttributeNS(\"x\", \"href\", @s);"],
    ["`window.open(data)`", "window.open(@s);"],
    ["a bare `open(data)`", "open(@s);"],
    ["`window.open(\"javascript:…\")`", "window.open(\"javascript:alert(1)\");"],
  ]);
  cleanAll([
    ["a struct field named `src`-like (`href`) is that field", "@w.href = @s;"],
  ]);
  notJudgedAll([
    ["`window.open(\"https:…\")` (rule 3 admits it)", "window.open(\"https://example.com/\");", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`setAttribute(\"href\", \"/a\")` (a relative URL)", "document.body.setAttribute(\"href\", \"/a\");", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`document.open()` with no URL", "document.open();", "E-BOOTSTRAP-UNSUPPORTED"],
    ["`indexedDB.open(name)` is not a window's", "indexedDB.open(@s);", "E-BOOTSTRAP-UNSUPPORTED"],
  ]);
});

describe("#1663 re-review N5 — `Document.parseHTMLUnsafe`", () => {
  refusedAll([["`Document.parseHTMLUnsafe(data)`", "Document.parseHTMLUnsafe(@s);"]]);
  notJudgedAll([["`Document.parseHTMLUnsafe(literal)`", "Document.parseHTMLUnsafe(\"<b>x</b>\");", "E-BOOTSTRAP-UNSUPPORTED"]]);
});

describe("#1663 F6 — client logic only; eval / Function everywhere", () => {
  const SRV = (body) => `    server function sv(x: string) -> string {\n        ${body}\n        return x;\n    }\n`;
  test("a server function's DOM-member write is not judged (a server has no DOM)", () => {
    expect(codes(P("tick();", undefined, SRV("document.body.innerHTML = x;")))).not.toContain(CODE);
  });
  test("a server function's `eval` is refused", () => {
    expect(codes(P("tick();", undefined, SRV("eval(x);")))).toContain(CODE);
  });
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
