// form-action-meta-refresh-guard-s473.test.js — s473-boot-form-action-meta-refresh-guard.
//
// Ruled S473 (user-voice-scrml.md "S473 owner questions round 2"):
//   1. "Form `action` / `formaction` from data: REFUSED unless static." A data-bound value posts
//      the form's fields (password included) off-origin; proven in Chromium.
//   2. "`<meta http-equiv=\"refresh\">` from data: REFUSED." It navigates the whole page
//      off-origin; proven in Chromium.
//
// Before this lane the bootstrap compiled `<form action=@u>`, `<button formaction=@u>` and
// `<meta http-equiv="refresh" content=@u>` clean, and `rt.attr` wrote them: the §5.2 rule 3 URL
// guard admits `https:`, so the guard let an off-origin action through, and `content` is not a
// URL attribute at all.
//
// Defence in depth, two layers (the #1637 `<base href>` pattern):
//   1. compile — E-ATTR-FORM-ACTION / E-ATTR-META-REFRESH (§5.2);
//   2. runtime — `rt.attr` never writes these from data (fail closed).

import { describe, test, expect, beforeAll, afterEach, spyOn } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

const run = (src) => frontEnd(mods, [{ path: "s.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const rt = await import("../slice-m1/runtime/runtime.js");

function captured(body) {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    body();
    return { warns: warn.mock.calls.map((c) => c.map(String).join(" ")), errors: error.mock.calls.map((c) => c.map(String).join(" ")) };
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
}

function elementOf(markup, sel) {
  document.body.innerHTML = markup;
  return document.querySelector(sel);
}

const PROG = (tag, extra = "") => `<program>
    let <u:string="https://evil.example/"/>
${extra}    <main>
        ${tag}
    </main>
</program>
`;

// ---------------------------------------------------------------------------
// 1a. compile — E-ATTR-FORM-ACTION
// ---------------------------------------------------------------------------
describe("compile — a data-bound form `action` / `formaction` is E-ATTR-FORM-ACTION", () => {
  const refused = (tag, extra) => expect(codes(PROG(tag, extra))).toEqual(["E-ATTR-FORM-ACTION"]);
  test("`<form action=@u>` with a password field (the ruling's case)", () => refused(`<form action=@u><input name="pw" type="password"/></form>`));
  test("`action=(@u)`", () => refused(`<form action=(@u)></form>`));
  test("case variants: `ACTION=`, `Action=`", () => { refused(`<form ACTION=@u></form>`); refused(`<form Action=(@u)></form>`); });
  test("case variants: `<FORM>`, `<fOrM>`", () => { refused(`<FORM action=@u></FORM>`); refused(`<fOrM action=@u></fOrM>`); });
  test("a computed value", () => refused(`<form action=("https://" + @u)></form>`));
  test("a call", () => refused(`<form action=pick(@u)></form>`, `    function pick(v: string) -> string { return v; }\n`));
  test("a member of a cell", () => refused(`<form action=@cfg.post></form>`, `    type Cfg:struct = { post: string }\n    let <cfg:Cfg=({ post: "https://evil.example/" })/>\n`));
  test("under `if=`", () => refused(`<form if=@shown action=(@u)></form>`, `    let <shown:boolean=true/>\n`));
  test("`<button formaction=@u>`", () => refused(`<form><button formaction=@u>go</button></form>`));
  test("`<input type=submit formaction=(@u)>`", () => refused(`<form><input type="submit" formaction=(@u)/></form>`));
  test("`<input type=image formaction=@u>`", () => refused(`<form><input type="image" src="/go.png" formaction=@u/></form>`));
  test("case variants: `FORMACTION=`, `FormAction=`, `<BUTTON>`", () => {
    refused(`<form><button FORMACTION=@u>go</button></form>`);
    refused(`<form><input type="submit" FormAction=(@u)/></form>`);
    refused(`<form><BUTTON formaction=@u>go</BUTTON></form>`);
  });
  test("`formaction` on any element (fail closed — inert elsewhere, nothing lost)", () => refused(`<div formaction=@u></div>`));
  test("an <each> row's field", () => {
    expect(codes(`type Row:struct = { id: int, post: string }
<program>
    <rows:Row[]=([{ id: 1, post: "https://evil.example/" }])/>
    <main><each in=@rows key=@.id as row><form action=row.post><button formaction=row.post>go</button></form></each></main>
</program>
`)).toEqual(["E-ATTR-FORM-ACTION", "E-ATTR-FORM-ACTION"]);
  });
  test("a declaration's field (reported once, at the definition)", () => {
    expect(codes(`<login to:string>
</>
renders <form class="login" action=to><input name="pw" type="password"/></form>

<program>
    <main>
        <login to="https://evil.example/"/>
        <login to="/login"/>
    </main>
</program>
`)).toEqual(["E-ATTR-FORM-ACTION"]);
  });
  test("the diagnostic names the safe form and the section", () => {
    const d = run(PROG(`<form action=@u></form>`)).diags[0];
    expect(d.message).toContain("§5.2");
    expect(d.message).toContain("static");
    expect(d.severity).toBe("Error");
  });
});

// ---------------------------------------------------------------------------
// 1b. compile — E-ATTR-META-REFRESH
// ---------------------------------------------------------------------------
describe("compile — a data-bound `<meta http-equiv=\"refresh\">` is E-ATTR-META-REFRESH", () => {
  const refused = (tag, extra, n = 1) => expect(codes(PROG(tag, extra))).toEqual(Array(n).fill("E-ATTR-META-REFRESH"));
  test("`content=@u` (the ruling's case)", () => refused(`<meta http-equiv="refresh" content=@u/>`));
  test("`content=(\"0;url=\" + @u)`", () => refused(`<meta http-equiv="refresh" content=("0;url=" + @u)/>`));
  test("case variants of the value: `Refresh`, `REFRESH`", () => {
    refused(`<meta http-equiv="Refresh" content=@u/>`);
    refused(`<meta http-equiv="REFRESH" content=@u/>`);
  });
  test("case variants of the names: `Http-Equiv=`, `CONTENT=`, `<META>`", () => {
    refused(`<meta Http-Equiv="refresh" CONTENT=@u/>`);
    refused(`<META HTTP-EQUIV="refresh" content=@u/>`);
  });
  test("whitespace around the value (a superset of the browser's keyword test — fail closed)", () => refused(`<meta http-equiv=" refresh " content=@u/>`));
  test("an entity in the value (`ref&#114;esh`) is unprovable — treated as refresh", () => refused(`<meta http-equiv="ref&#114;esh" content=@u/>`));
  test("the attribute order does not matter", () => refused(`<meta content=@u http-equiv="refresh"/>`));
  test("a data `http-equiv` (it could become `refresh`) — with a static content", () => refused(`<meta http-equiv=@u content="0;url=https://evil.example/"/>`));
  test("a data `http-equiv` with no content", () => refused(`<meta http-equiv=(@u)/>`));
  test("a data `http-equiv` and a data `content` — each attribute is reported", () => refused(`<meta http-equiv=@u content=@u/>`, "", 2));
  test("an <each> row's field", () => {
    expect(codes(`type Row:struct = { id: int, go: string }
<program>
    <rows:Row[]=([{ id: 1, go: "0;url=https://evil.example/" }])/>
    <main><each in=@rows key=@.id as row><meta http-equiv="refresh" content=row.go/></each></main>
</program>
`)).toEqual(["E-ATTR-META-REFRESH"]);
  });
  test("a declaration's field (reported once, at the definition)", () => {
    expect(codes(`<bounce go:string>
</>
renders <span class="b"><meta http-equiv="refresh" content=go/></span>

<program>
    <main>
        <bounce go="0;url=https://evil.example/"/>
        <bounce go="5"/>
    </main>
</program>
`)).toEqual(["E-ATTR-META-REFRESH"]);
  });
  test("the diagnostic names the safe form and the section", () => {
    const d = run(PROG(`<meta http-equiv="refresh" content=@u/>`)).diags[0];
    expect(d.message).toContain("§5.2");
    expect(d.message).toContain("static");
    expect(d.severity).toBe("Error");
  });
});

describe("compile — the other spellings do not compile either (never written from data)", () => {
  // Each spelling is pinned to the exact codes that stop it today, all Errors — so the pin goes
  // red when the bootstrap learns the form (it must then meet E-ATTR-FORM-ACTION / -META-REFRESH).
  const refusedAs = (tag, expected) => {
    const ds = run(PROG(tag)).diags;
    expect([...new Set(ds.map((d) => d.code))]).toEqual(expected);
    for (const d of ds) expect(d.severity).toBe("Error");
  };
  test("a spread `{...@u}`", () => { refusedAs(`<form {...@u}></form>`, ["E-PARSE-TAG"]); refusedAs(`<meta {...@u}/>`, ["E-PARSE-TAG"]); });
  test("a braced `action={@u}` / `content={@u}`", () => {
    refusedAs(`<form action={@u}></form>`, ["E-STMT-MISSING-SEMICOLON", "E-BOOTSTRAP-UNSUPPORTED"]);
    refusedAs(`<meta http-equiv="refresh" content={@u}/>`, ["E-STMT-MISSING-SEMICOLON", "E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a quoted template `action=\"${@u}\"` / `content=\"0;url=${@u}\"`", () => {
    refusedAs(`<form action="\${@u}"></form>`, ["E-BOOTSTRAP-UNSUPPORTED"]);
    refusedAs(`<button formaction="\${@u}">go</button>`, ["E-BOOTSTRAP-UNSUPPORTED"]);
    refusedAs(`<meta http-equiv="refresh" content="0;url=\${@u}"/>`, ["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a prefixed name (`x:action=`)", () => refusedAs(`<form x:action=@u></form>`, ["E-BOOTSTRAP-UNSUPPORTED"]));
});

describe("compile — static forms and data elsewhere still build", () => {
  const clean = (tag, extra) => expect(codes(PROG(tag, extra))).toEqual([]);
  test("a static relative `action`", () => clean(`<form action="/login"><input name="pw" type="password"/></form>`));
  test("a static off-origin `action` (the author's own choice)", () => clean(`<form action="https://pay.example/checkout"></form>`));
  test("a static `formaction`", () => clean(`<form><button formaction="/save">save</button></form>`));
  test("a `<form>` with no action", () => clean(`<form><button>go</button></form>`));
  test("a data `action` on a non-form element (not a submission target; element scope)", () => clean(`<div action=@u></div>`));
  test("a static `<meta http-equiv=\"refresh\" content=\"…\">`", () => clean(`<meta http-equiv="refresh" content="30;url=/x"/>`));
  test("a data `content` on a `<meta name>` (no pragma)", () => clean(`<meta name="description" content=@u/>`));
  test("a data `content` beside a static non-refresh `http-equiv`", () => clean(`<meta http-equiv="content-language" content=@u/>`));
  test("a data `href` on `<a>` (§5.2 rule 3 judges its scheme)", () => clean(`<a href=@u>a</a>`));
  test("a cell named `action` is not the attribute", () => expect(codes(`<program>
    let <action:string="x"/>
    <main><p>\${@action}</p></main>
</program>
`)).toEqual([]));
});

// ---------------------------------------------------------------------------
// 2. runtime — `rt.attr` never writes these from data (fail closed)
// ---------------------------------------------------------------------------
const FORM_REPORT = "[scrml url-guard] refused a data-supplied form submission target (`action` on a <form>, or `formaction`): where a form's fields are sent is never chosen by data (SPEC §5.2). The attribute was removed.";
const META_REPORT = "[scrml url-guard] refused a data-supplied `http-equiv`, or `content` on a refresh <meta>: data never navigates the page (SPEC §5.2). The attribute was removed.";

function refusedWrite(markup, sel, name, report) {
  const el = elementOf(markup, sel);
  const before = el.getAttributeNames().filter((n) => n.toLowerCase() !== name.toLowerCase());
  const scope = new rt.Scope(rt.root);
  let ran = 0;
  const { warns } = captured(() => rt.attr(scope, el, name, () => { ran++; return "https://evil.example/"; }));
  expect(el.getAttributeNames()).toEqual(before);
  expect(ran).toBe(0);
  expect(warns).toEqual([report]);
  scope.dispose?.();
  return el;
}

function writtenAs(markup, sel, name, value) {
  const el = elementOf(markup, sel);
  const scope = new rt.Scope(rt.root);
  const { warns } = captured(() => rt.attr(scope, el, name, () => value));
  expect(el.getAttribute(name)).toBe(value);
  expect(warns).toEqual([]);
  scope.dispose?.();
  return el;
}

describe("runtime — `rt.attr` never writes a form's submission target", () => {
  for (const name of ["action", "ACTION", "Action"]) {
    test(`${name}= on <form>`, () => refusedWrite(`<form id="f"><input name="pw" type="password"></form>`, "#f", name, FORM_REPORT));
  }
  for (const [markup, name] of [
    [`<button id="x">go</button>`, "formaction"],
    [`<button id="x">go</button>`, "FORMACTION"],
    [`<input id="x" type="submit">`, "formAction"],
    [`<input id="x" type="image">`, "formaction"],
    [`<div id="x"></div>`, "formaction"],
  ]) {
    test(`${name}= on ${markup}`, () => refusedWrite(markup, "#x", name, FORM_REPORT));
  }
  test("a template-supplied `action` is removed, never left standing beside a refused data write", () => {
    const el = elementOf(`<form id="f" action="https://evil.example/"></form>`, "#f");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "action", () => "https://evil.example/"));
    expect(el.hasAttribute("action")).toBe(false);
    expect(warns).toEqual([FORM_REPORT]);
    scope.dispose?.();
  });
  test("the report never carries the value", () => {
    const el = elementOf(`<form id="f"></form>`, "#f");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "action", () => "https://secret.example/token123"));
    for (const w of warns) { expect(w).not.toContain("secret"); expect(w).not.toContain("token123"); }
    scope.dispose?.();
  });
  test("a data `action` on a non-form element is still written", () => writtenAs(`<div id="d"></div>`, "#d", "action", "x"));
  test("a data `method` / `target` on <form> is still written (no off-origin choice; not ruled)", () => {
    writtenAs(`<form id="f"></form>`, "#f", "method", "post");
    writtenAs(`<form id="f"></form>`, "#f", "target", "_self");
  });
});

describe("runtime — `rt.attr` never writes a page-navigating <meta> from data", () => {
  for (const name of ["http-equiv", "HTTP-EQUIV", "Http-Equiv"]) {
    test(`${name}= on <meta> (data never chooses a pragma)`, () => refusedWrite(`<meta id="m" content="0;url=https://evil.example/">`, "#m", name, META_REPORT));
  }
  for (const equiv of ["refresh", "Refresh", "REFRESH", " refresh "]) {
    for (const name of ["content", "CONTENT"]) {
      test(`${name}= on <meta http-equiv="${equiv}">`, () => refusedWrite(`<meta id="m" http-equiv="${equiv}">`, "#m", name, META_REPORT));
    }
  }
  test("a template-supplied `content` on a refresh <meta> is removed", () => {
    const el = elementOf(`<meta id="m" http-equiv="refresh" content="0;url=https://evil.example/">`, "#m");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "content", () => "5"));
    expect(el.hasAttribute("content")).toBe(false);
    expect(warns).toEqual([META_REPORT]);
    scope.dispose?.();
  });
  test("a `content` after a refused data `http-equiv` on the same <meta> is refused too (computed — fail closed)", () => {
    const el = elementOf(`<meta id="m">`, "#m");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => {
      rt.attr(scope, el, "http-equiv", () => "refresh");
      rt.attr(scope, el, "content", () => "0;url=https://evil.example/");
    });
    expect(el.getAttributeNames()).toEqual(["id"]);
    expect(warns).toEqual([META_REPORT, META_REPORT]);
    scope.dispose?.();
  });
  test("a data `content` on a `<meta name>` is still written", () => writtenAs(`<meta id="m" name="description">`, "#m", "content", "hello"));
  test("a data `content` beside a static non-refresh `http-equiv` is still written", () => writtenAs(`<meta id="m" http-equiv="content-language">`, "#m", "content", "en"));
  test("a data `content` on a non-meta element is still written", () => writtenAs(`<div id="d"></div>`, "#d", "content", "x"));
});

// ---------------------------------------------------------------------------
// end to end — the static forms compile and run
// ---------------------------------------------------------------------------
describe("end to end — compiled programs", () => {
  test("a static form action and a static formaction are emitted as written", async () => {
    const r = run(`<program>
    let <n:int=0/>
    <main>
        <form id="f" action="/login"><input name="pw" type="password"/><button id="b" formaction="/save">save</button></form>
        <p>\${@n}</p>
    </main>
</program>
`);
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    await loadProgram(r.core, "form-e2e", []);
    expect(document.querySelector("#f").getAttribute("action")).toBe("/login");
    expect(document.querySelector("#b").getAttribute("formaction")).toBe("/save");
  });
});
