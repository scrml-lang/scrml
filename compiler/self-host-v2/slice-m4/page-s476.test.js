// page-s476.test.js — s476-boot-page: the bootstrap builds `<page>` inside
// `<program>` (SPEC §40.8 "Multi-page apps", §4.15).
//
//   - A `<page>` written directly in the top-level `<program>`'s body is that
//     program's page. Its body is a code-default body like the program's own
//     (§40.8 S441 bullet), read by the program body's reader; it shares the
//     program's scope (§58.8) and renders where it is written. The `<page>` is
//     no DOM element.
//   - Its attributes are checked against §40.8's closed per-route set:
//     `route=` → E-PAGE-ROUTE-ATTR-FORBIDDEN; a name outside the five →
//     E-PAGE-INVALID-ATTR; `auth=` not one of the three literals →
//     E-AUTH-ATTR-INVALID (§52.13.2); a bad `ratelimit=` → E-MW-002. The five
//     per-route concerns themselves are not built — refused by name (INTERIM).
//   - Out of place: `<page>` in markup, in a `<page>`, at a non-route file's top
//     level → E-STRUCTURAL-ELEMENT-MISPLACED (§4.15); `<channel>` in a `<page>`
//     → E-CHANNEL-INSIDE-PAGE (§38.1).
//   - INTERIM refusals: a route file's `<page>` (no per-route documents / shell
//     composition, §40.8.2), a second `<page>` in one file (⚑ the SPEC does not
//     say how two pages of one route combine), a `<page>` in a nested program.
//
// RED ON BASE: 43 of 45 (measured at e29baf177: 2 pass / 43 fail — the 2 are the "unchanged" cell
// / declaration-named-`page` twins; on base every
// `<page>` was E-BOOTSTRAP-UNSUPPORTED "is a scrml structural element (§40)").

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src, path = "t.scrml") => frontEnd(mods, [{ path, src }]);
const runFiles = (files, entry) => frontEnd(mods, files, entry);
const codes = (src, path) => run(src, path).diags.map((d) => d.code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  return r;
};
const html = (src) => mods.print.printProgram(clean(src).core, "app.client.js", "scrml-runtime.js").html;
const page = (attrs, body = "<p>x</p>") => `<program>\n<page${attrs ? " " + attrs : ""}>\n    ${body}\n</page>\n</program>\n`;
const OLD = "is a scrml structural element (§40)";

// ---------------------------------------------------------------------------
describe("a single `<page>` in `<program>` compiles and renders its body", () => {
  test("markup body: compiles clean, renders the body, emits no `<page>` element", () => {
    const h = html(page("", `<h1 id="t">Hello</h1>\n    <p class="c">body</p>`));
    expect(h).toContain(`<h1 id="t">Hello</h1>`);
    expect(h).toContain(`<p class="c">body</p>`);
    expect(h).not.toContain("<page");
    expect(h).not.toContain("</page>");
  });
  test("the page renders in place among the program's own markup", () => {
    const h = html(`<program>\n<nav id="n">nav</nav>\n<page>\n    <main id="m">route</main>\n</page>\n<footer id="f">foot</footer>\n</program>\n`);
    const n = h.indexOf(`id="n"`), m = h.indexOf(`id="m"`), f = h.indexOf(`id="f"`);
    expect(n).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(n);
    expect(f).toBeGreaterThan(m);
  });
  test("an empty / self-closing `<page/>` is clean", () => {
    clean(`<program>\n<page/>\n<p>x</p>\n</program>\n`);
    clean(`<program>\n<page>\n</page>\n</program>\n`);
  });
  test("unchanged twin: the same body without `<page>` renders the same markup", () => {
    const body = `<h1 id="t">Hello</h1>`;
    const withPage = html(page("", body));
    const without = html(`<program>\n    ${body}\n</program>\n`);
    expect(withPage).toContain(body);
    expect(without).toContain(body);
  });
});

describe("page body declarations (a code-default body, §40.8; the program's scope, §58.8)", () => {
  test("a cell, a function and a handler in the page body run in the browser", async () => {
    const src = page("", `let <n:int=0/>
    fn twice(k: int) -> int {
        return k * 2;
    }
    <button id="b" onclick={ @n = @n + 1; }>+</button>
    <p id="o">\${twice(@n)}</p>`);
    await loadProgram(clean(src).core, "s476-page-decls", []);
    expect(document.querySelector("#o").textContent).toBe("0");
    document.querySelector("#b").click();
    document.querySelector("#b").click();
    expect(document.querySelector("#o").textContent).toBe("4");
  });
  test("a type and a `${ }` logic block in the page body", async () => {
    const src = page("", `type Color:enum = { Red, Green }
    \${
        function name(c: Color) -> string {
            return match c {
                .Red :> "red",
                .Green :> "green",
            };
        }
    }
    <p id="o">\${name(Color.Green)}</p>`);
    await loadProgram(clean(src).core, "s476-page-type", []);
    expect(document.querySelector("#o").textContent).toBe("green");
  });
  test("the program's declarations are in scope in the page body (the conformance twin shape)", async () => {
    const src = `<program>\nfn grade(k: int) -> string {\n    return k == 1 ? "green" : "gray";\n}\n<page><main>\n<p id="a">\${ grade(1) }</p>\n<p id="b">\${ grade(9) }</p>\n</main></page>\n</program>\n`;
    await loadProgram(clean(src).core, "s476-page-scope", []);
    expect(document.querySelector("#a").textContent).toBe("green");
    expect(document.querySelector("#b").textContent).toBe("gray");
  });
  test("a page body's errors are reported as in the program body (an undeclared name)", () => {
    const c = codes(page("", `<p>\${@nope}</p>`));
    expect(c).toContain("E-STATE-UNDECLARED");
    expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

describe("a page body the SPEC rejects", () => {
  // §40.8 S441: a bare run at this body top is code; one that is not valid code
  // is E-UNQUOTED-DISPLAY-TEXT. The bootstrap's program body reads no body-top
  // statements yet and reports a bare run as E-PARSE-ITEM (the body-top FAILs of
  // the conformance corpus, `body-top/*`). A page body is the same locus (§40.8:
  // "A `<page>` body … and a `<channel>` body … are the same locus and follow
  // the same rule"), so it answers exactly as the program body does — an error,
  // never page text.
  test("bare prose in a page body is an error, as in the program body, and never rendered", () => {
    const inPage = run(page("", `Page prose here.\n<p>x</p>`)).diags.map((d) => d.code);
    const inProgram = run(`<program>\nPage prose here.\n<p>x</p>\n</program>\n`).diags.map((d) => d.code);
    expect(inPage.length).toBeGreaterThan(0);
    expect(inPage).toEqual(inProgram);
    expect(run(page("", `Page prose here.\n<p>x</p>`)).diags.every((d) => !d.message.includes(OLD))).toBe(true);
  });
  test("a JS construct in a page body: the program body's own §7.2.1 code", () => {
    const c = codes(page("", `class Foo {}\n<p>x</p>`));
    const p = codes(`<program>\nclass Foo {}\n<p>x</p>\n</program>\n`);
    expect(c).toEqual(p);
  });
});

describe("`<page>` out of place (§4.15: E-STRUCTURAL-ELEMENT-MISPLACED)", () => {
  test("at the top level of a file that is not a route file", () => {
    // (the entry has no `<program>`, so E-PROGRAM-MISSING also fires — unchanged)
    expect(codes(`<page>\n<p>x</p>\n</page>\n`)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED", "E-PROGRAM-MISSING"]);
  });
  test("beside a `<program>`, outside it", () => {
    expect(codes(`<program>\n<p>x</p>\n</program>\n<page>\n<p>y</p>\n</page>\n`)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
  });
  test("inside markup in the program body", () => {
    expect(codes(`<program>\n<div>\n<page>\n<p>x</p>\n</page>\n</div>\n</program>\n`)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
  });
  test("inside a `<page>`", () => {
    expect(codes(page("", `<page>\n<p>y</p>\n</page>`))).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
  });
  test("a `<channel>` inside a `<page>` is E-CHANNEL-INSIDE-PAGE (§38.1), one report", () => {
    expect(codes(page("", `<channel name="c">\n    <p>x</p>\n</channel>\n<p>y</p>`))).toEqual(["E-CHANNEL-INSIDE-PAGE"]);
  });
});

describe("route files and multiple pages (INTERIM — refused by name)", () => {
  test("a route file's `<page>` root (`pages/…`) is refused by name, not misplaced", () => {
    const d = run(`<page>\n<p>about</p>\n</page>\n`, "pages/about.scrml").diags;
    // (compiled alone it is also the entry, which has no `<program>`: E-PROGRAM-MISSING)
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-PROGRAM-MISSING"]);
    expect(d[0].message).toContain("route file");
    expect(codes(`<page>\n<p>x</p>\n</page>\n`, "routes/x.scrml")).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-PROGRAM-MISSING"]);
  });
  test("with no program, the project-relative path decides: `about.scrml` under a source root `site/pages` is a route file", () => {
    // scrml-boot hands the front end paths relative to the closure's root and that root's path under
    // the project root as `keyBase` (keyBaseOf) — `pages/about.scrml` compiled alone arrives so
    const d = frontEnd(mods, [{ path: "about.scrml", src: `<page>\n<p>about</p>\n</page>\n` }], "about.scrml", { keyBase: "site/pages" }).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-PROGRAM-MISSING"]);
    expect(d[0].message).toContain("route file");
    const n = frontEnd(mods, [{ path: "about.scrml", src: `<page>\n<p>about</p>\n</page>\n` }], "about.scrml", { keyBase: "site/lib" }).diags;
    expect(n.map((x) => x.code)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED", "E-PROGRAM-MISSING"]);
  });
  test("with an application program, a route file is read relative to the entry's directory (§40.8)", () => {
    const r = runFiles([
      { path: "app/main.scrml", src: `<program>\n<p>home</p>\n</program>\n` },
      { path: "app/lib/page.scrml", src: `<page>\n<p>x</p>\n</page>\n` },
    ], "app/main.scrml");
    // app/lib/page.scrml is not under pages/ or routes/ relative to app/
    expect(r.diags.filter((d) => d.file === "app/lib/page.scrml").map((d) => d.code)).toEqual(["E-STRUCTURAL-ELEMENT-MISPLACED"]);
  });
  test("two `<page>`s in one `<program>`: the second is refused by name (⚑ same route)", () => {
    const d = run(`<program>\n<page>\n<p>a</p>\n</page>\n<page>\n<p>b</p>\n</page>\n</program>\n`).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("second `<page>`");
  });
  test("a `<page>` in a nested `<program>` is refused by name", () => {
    const d = run(`<program>\n<program name="w">\n<page>\n<p>w</p>\n</page>\n</program>\n<p>home</p>\n</program>\n`).diags;
    expect(d.some((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED" && x.message.includes("nested `<program>`") && x.message.includes("<page>"))).toBe(true);
  });
});

describe("`<page>` attributes (§40.8 per-route set)", () => {
  test("`route=` is E-PAGE-ROUTE-ATTR-FORBIDDEN (§4.15)", () => {
    expect(codes(page(`route="/x"`))).toEqual(["E-PAGE-ROUTE-ATTR-FORBIDDEN"]);
  });
  for (const a of [`title="T"`, `class="c"`, `id="p"`, `cors="*"`, `if=(true)`, `loginRedirect="/l"`, `session-secure="true"`, `story="s"`]) {
    test(`\`${a}\` is E-PAGE-INVALID-ATTR`, () => {
      expect(codes(page(a))).toEqual(["E-PAGE-INVALID-ATTR"]);
    });
  }
  // (a non-literal value is written `auth=(…)` here: the bootstrap does not read the
  // `attr=\${…}` attribute form anywhere — E-PARSE-TRAILING, on `<program>` too)
  for (const a of [`auth="role:admin"`, `auth="Required"`, `auth=""`, `auth`, `auth=(1 + 2)`]) {
    test(`\`${a}\` is E-AUTH-ATTR-INVALID (§52.13.2)`, () => {
      expect(codes(page(a))).toEqual(["E-AUTH-ATTR-INVALID"]);
    });
  }
  test("`ratelimit=` not N/unit is E-MW-002 (§39.2.4)", () => {
    expect(codes(page(`ratelimit="lots"`))).toEqual(["E-MW-002"]);
  });
  for (const a of [`auth="required"`, `auth="optional"`, `auth="none"`, `ratelimit="100/min"`, `db="./x.db"`, `csrf="auto"`, `keep-alive`]) {
    test(`a legal per-route \`${a}\` is refused by name (not built — never compiled as if absent)`, () => {
      const d = run(page(a)).diags;
      expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(d[0].message).toContain("<page");
      expect(d[0].message).not.toContain(OLD);
    });
  }
  test("`export <page>` is E-PARSE-EXPORT; a validator call on `<page>` is E-PAGE-INVALID-ATTR", () => {
    expect(codes(`<program>\nexport <page>\n<p>x</p>\n</page>\n</program>\n`)).toEqual(["E-PARSE-EXPORT"]);
    expect(codes(page(`length(>=5)`))).toEqual(["E-PAGE-INVALID-ATTR"]);
  });
  // unchanged on base: a DECLARATION named `page` is a declaration, not the structural element
  test("unchanged: a cell named `page` (`let <page:int=1/>`) is an ordinary cell", async () => {
    const src = `<program>\n    let <page:int=1/>\n    <button id="b" onclick={ @page = @page + 1; }>next</button>\n    <p id="o">\${@page}</p>\n</program>\n`;
    await loadProgram(clean(src).core, "s476-page-cell", []);
    document.querySelector("#b").click();
    expect(document.querySelector("#o").textContent).toBe("2");
  });
  test("unchanged: a user declaration named `page` is E-NAME-COLLIDES-RESERVED (§4.15)", () => {
    expect(codes(`<program>\n    <page label:string="a"/>\n    renders <p>\${label}</p>\n    <p>x</p>\n</program>\n`)).toContain("E-NAME-COLLIDES-RESERVED");
  });
});
