// base-href-guard-s473.test.js — s473-boot-base-href-guard: data never moves the document base.
//
// Gap g-boot-base-href-from-data-retargets-server-calls-s473 (MED, Chromium-proven in the #1635 review, F2):
// `<base href=(@c)>` compiled clean and `rt.attr` wrote it (the §5.2 rule 3 URL guard admits
// `https:`), so `document.baseURI` moved to the data's origin and the runtime's server-function
// call `fetch("/_scrml/call/N")` — a path-absolute URL, resolved against the BASE — went
// cross-origin with its POST body and its `X-CSRF-Token` header.
//
// Defence in depth, three layers (PA ruling S473, the same class as the S472 `<link>` stylesheet
// ruling):
//   1. compile — a `<base>` whose `href` is not a static string is E-ATTR-BASE-HREF (§5.2);
//   2. runtime — `rt.attr` never writes an `href` on a `<base>` (fail closed);
//   3. runtime — scrml's own server-function call is addressed to the DOCUMENT's origin (resolved
//      against `location.href`, never `document.baseURI`), so a `<base>` from any source — a static
//      one included — cannot redirect it.
// Plus the adjacent check the lane was asked for: `rt.attr` never writes `srcdoc` from data (the
// compile refusal, §5.2 rule 2 "`srcdoc` in every form", already existed; this is its wall).

import { describe, test, expect, beforeAll, afterEach, spyOn } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

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

const BASE = (tag, extra = "") => `<program>
    let <u:string="https://evil.example/"/>
${extra}    <main>
        ${tag}
    </main>
</program>
`;

// ---------------------------------------------------------------------------
// 1. compile — E-ATTR-BASE-HREF
// ---------------------------------------------------------------------------
describe("compile — a data-bound `href` on `<base>` is E-ATTR-BASE-HREF", () => {
  const refused = (tag, extra) => expect(codes(BASE(tag, extra))).toEqual(["E-ATTR-BASE-HREF"]);
  test("`href=(@u)` (the #1635 review F2 reproduction)", () => refused(`<base href=(@u)/>`));
  test("`href=@u` (bare reactive)", () => refused(`<base href=@u/>`));
  test("case variants: `HREF=`, `Href=`", () => { refused(`<base HREF=@u/>`); refused(`<base Href=(@u)/>`); });
  test("case variants: `<BASE>`, `<bAsE>`", () => { refused(`<BASE href=@u/>`); refused(`<bAsE href=(@u)/>`); });
  test("with a static `target` beside it", () => refused(`<base target="_self" href=@u/>`));
  test("a computed value", () => refused(`<base href=("https://" + @u)/>`));
  test("a call", () => refused(`<base href=pick(@u)/>`, `    function pick(v: string) -> string { return v; }\n`));
  test("a member of a cell", () => refused(`<base href=@cfg.root/>`, `    type Cfg:struct = { root: string }\n    let <cfg:Cfg=({ root: "https://evil.example/" })/>\n`));
  test("under `if=`", () => refused(`<base if=@shown href=(@u)/>`, `    let <shown:boolean=true/>\n`));
  test("an <each> row's field", () => {
    expect(codes(`type Row:struct = { id: int, root: string }
<program>
    <rows:Row[]=([{ id: 1, root: "https://evil.example/" }])/>
    <main><each in=@rows key=@.id as row><base href=row.root/></each></main>
</program>
`)).toEqual(["E-ATTR-BASE-HREF"]);
  });
  test("a declaration's field (reported once, at the definition)", () => {
    expect(codes(`<shell root:string>
</>
renders <span class="shell"><base href=root/></span>

<program>
    <main>
        <shell root="https://evil.example/"/>
        <shell root="/app/"/>
    </main>
</program>
`)).toEqual(["E-ATTR-BASE-HREF"]);
  });
  test("the diagnostic names the safe form and the section", () => {
    const d = run(BASE(`<base href=@u/>`)).diags[0];
    expect(d.message).toContain("§5.2");
    expect(d.message).toContain("static");
    expect(d.severity).toBe("Error");
  });
});

describe("compile — the other spellings do not compile either (never written from data)", () => {
  const notClean = (tag) => expect(codes(BASE(tag)).length).toBeGreaterThan(0);
  test("a spread `{...@x}`", () => notClean(`<base {...@u}/>`));
  test("a braced `href={@u}`", () => notClean(`<base href={@u}/>`));
  test("a quoted template `href=\"${@u}\"`", () => notClean(`<base href="\${@u}"/>`));
  test("`xlink:href=` / `xml:base=`", () => { notClean(`<base xlink:href=@u/>`); notClean(`<base xml:base=@u/>`); });
  test("an entity in the attribute name (`h&#114;ef=`)", () => notClean(`<base h&#114;ef=@u/>`));
  test("an entity in the tag name (`<b&#97;se>`)", () => notClean(`<b&#97;se href=@u/>`));
});

describe("compile — benign <base> forms and data hrefs elsewhere still build", () => {
  const clean = (tag, extra) => expect(codes(BASE(tag, extra))).toEqual([]);
  test("a static `href`", () => clean(`<base href="/app/"/>`));
  test("a static absolute `href` (the author's own choice)", () => clean(`<base href="https://cdn.example/app/"/>`));
  test("a static `href` with an entity (static text, judged by rule 2 as before)", () => clean(`<base href="/a&amp;b/"/>`));
  test("a `<base>` with only `target`", () => clean(`<base target="_blank"/>`));
  test("a data `href` on `<a>` (§5.2 rule 3 judges its scheme)", () => clean(`<a href=@u>a</a>`));
  test("a cell named `base` is not the element", () => expect(codes(`<program>
    let <base:int=2/>
    <main><p>\${@base}</p></main>
</program>
`)).toEqual([]));
});

// ---------------------------------------------------------------------------
// 2. runtime — `rt.attr` never writes a `<base>`'s href from data
// ---------------------------------------------------------------------------
const BASE_REPORT = "[scrml url-guard] refused a data-supplied `href` on a <base>: the document's base URL is never chosen by data (SPEC §5.2). The attribute was removed.";

describe("runtime — `rt.attr` never writes a <base>'s href (fail closed)", () => {
  for (const name of ["href", "HREF", "Href", "xlink:href"]) {
    test(`${name}=`, () => {
      const el = elementOf(`<base id="b">`, "#b");
      const scope = new rt.Scope(rt.root);
      let ran = 0;
      const before = document.baseURI;
      const { warns } = captured(() => rt.attr(scope, el, name, () => { ran++; return "https://evil.example/"; }));
      expect(el.getAttributeNames()).toEqual(["id"]);
      expect(ran).toBe(0);
      expect(warns).toEqual([BASE_REPORT]);
      expect(document.baseURI).toBe(before);
      scope.dispose?.();
    });
  }
  test("a template-supplied `href` is removed, never left standing beside a refused data write", () => {
    const el = elementOf(`<base id="b" href="https://evil.example/">`, "#b");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "href", () => "https://evil.example/"));
    expect(el.hasAttribute("href")).toBe(false);
    expect(warns).toEqual([BASE_REPORT]);
    scope.dispose?.();
  });
  test("the report never carries the value", () => {
    const el = elementOf(`<base id="b">`, "#b");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "href", () => "https://secret.example/token123"));
    for (const w of warns) { expect(w).not.toContain("secret"); expect(w).not.toContain("token123"); }
    scope.dispose?.();
  });
  test("a data `target` on <base> is still written (it moves no origin; see gap g-boot-base-target-from-data-s473)", () => {
    const el = elementOf(`<base id="b">`, "#b");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "target", () => "_self"));
    expect(el.getAttribute("target")).toBe("_self");
    expect(warns).toEqual([]);
    scope.dispose?.();
  });
  test("a data `href` on an <a> is still written through the §5.2 rule 3 guard", () => {
    const el = elementOf(`<a id="a">x</a>`, "#a");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "href", () => "https://ok.example/"));
    expect(el.getAttribute("href")).toBe("https://ok.example/");
    expect(warns).toEqual([]);
    scope.dispose?.();
  });
});

const SRCDOC_REPORT = "[scrml url-guard] refused a data-supplied `srcdoc`: an HTML document is never written from data (SPEC §5.2). The attribute was removed.";

describe("runtime — `rt.attr` never writes `srcdoc` from data (the wall behind §5.2 rule 2)", () => {
  for (const name of ["srcdoc", "SRCDOC", "SrcDoc"]) {
    test(`${name}= on <iframe>`, () => {
      const el = elementOf(`<iframe id="f"></iframe>`, "#f");
      const scope = new rt.Scope(rt.root);
      let ran = 0;
      const { warns } = captured(() => rt.attr(scope, el, name, () => { ran++; return "<script>parent.x=1</script>"; }));
      expect(el.getAttributeNames()).toEqual(["id"]);
      expect(ran).toBe(0);
      expect(warns).toEqual([SRCDOC_REPORT]);
      scope.dispose?.();
    });
  }
  test("on any element (fail closed)", () => {
    const el = elementOf(`<div id="d"></div>`, "#d");
    const scope = new rt.Scope(rt.root);
    captured(() => rt.attr(scope, el, "srcdoc", () => "<p>x</p>"));
    expect(el.hasAttribute("srcdoc")).toBe(false);
    scope.dispose?.();
  });
});

// ---------------------------------------------------------------------------
// 3. runtime — scrml's own call goes to the DOCUMENT's origin, never the base's
// ---------------------------------------------------------------------------
const VOID_ROUTE = { path: "/_scrml/call/9", params: [], result: null, error: null };
const ok204 = () => Promise.resolve({ status: 204, text: () => Promise.resolve("") });

function withDocumentUrl(url, body) {
  const prev = String(globalThis.location.href);
  globalThis.happyDOM.setURL(url);
  return Promise.resolve().then(body).finally(() => { globalThis.happyDOM.setURL(prev); });
}

describe("runtime — `rt.call` addresses the document's own origin (a <base> cannot redirect it)", () => {
  test("the fetch target is the absolute same-origin URL of the route path", () => withDocumentUrl("https://app.example/notes/edit.html", async () => {
    document.head.innerHTML = "";
    let seen = null;
    globalThis.fetch = (u, init) => { seen = { u, init }; return ok204(); };
    const v = await rt.call(VOID_ROUTE, [], null);
    expect(rt.failed(v)).toBe(false);
    expect(seen.u).toBe("https://app.example/_scrml/call/9");
    expect(seen.init.method).toBe("POST");
  }));
  test("a STATIC <base href> on another origin does not move it", () => withDocumentUrl("https://app.example/notes/", async () => {
    document.head.innerHTML = `<base href="https://evil.example/">`;
    let seen = null;
    globalThis.fetch = (u) => { seen = u; return ok204(); };
    await rt.call(VOID_ROUTE, [], null);
    expect(seen).toBe("https://app.example/_scrml/call/9");
    document.head.innerHTML = "";
  }));
  test("a <base> pointing at a sub-path of the same origin does not move it either", () => withDocumentUrl("https://app.example/", async () => {
    document.head.innerHTML = `<base href="https://app.example/deep/dir/">`;
    let seen = null;
    globalThis.fetch = (u) => { seen = u; return ok204(); };
    await rt.call(VOID_ROUTE, [], null);
    expect(seen).toBe("https://app.example/_scrml/call/9");
    document.head.innerHTML = "";
  }));
  test("a route path that would leave the origin (`//evil.example/x`) is never fetched — Unreachable", () => withDocumentUrl("https://app.example/", async () => {
    let fetched = 0;
    globalThis.fetch = () => { fetched++; return ok204(); };
    const v = await rt.call({ ...VOID_ROUTE, path: "//evil.example/_scrml/call/9" }, [], null);
    expect(fetched).toBe(0);
    expect(v).toEqual({ error: { variant: "Transport", data: ["Unreachable"] } });
  }));
  test("a document whose URL cannot be a base (about:blank) makes no request — Unreachable (fail closed)", () => withDocumentUrl("about:blank", async () => {
    let fetched = 0;
    globalThis.fetch = () => { fetched++; return ok204(); };
    const v = await rt.call(VOID_ROUTE, [], null);
    expect(fetched).toBe(0);
    expect(v).toEqual({ error: { variant: "Transport", data: ["Unreachable"] } });
  }));
});

// ---------------------------------------------------------------------------
// end to end — a compiled program with a static <base> to another origin: its server call stays home
// ---------------------------------------------------------------------------
describe("end to end — compiled programs", () => {
  test("a static <base> to another origin: the emitted server call still targets the page's origin", async () => {
    const r = run(`<program>
    let <n:int=0/>
    server function ping() -> int { return 1; }
    function go() {
        ping() !{ _ :> @n = 2 };
        @n = 1;
    }
    <main>
        <base href="https://evil.example/"/>
        <button id="go" onclick=go()>go</button>
    </main>
</program>
`);
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    await withDocumentUrl("https://app.example/page", async () => {
      const seen = [];
      globalThis.fetch = (u) => { seen.push(String(u)); return Promise.resolve({ status: 200, text: () => Promise.resolve("1") }); };
      await loadProgram(r.core, "base-e2e", []);
      document.querySelector("#go").dispatchEvent(new Event("click", { bubbles: true }));
      for (let i = 0; i < 200 && seen.length === 0; i++) await new Promise((res) => setTimeout(res, 0));
      expect(seen.length).toBeGreaterThan(0);
      for (const u of seen) expect(u.startsWith("https://app.example/_scrml/call/")).toBe(true);
    });
  });
});
