// rcdata-holes-s482.test.js — lane s482-rcdata-holes (gap g-boot-rcdata-hole-anchor-s482).
//
// The HTML parser reads the content of a raw-text / RCDATA element (`<textarea>`, `<title>`, `<xmp>`,
// `<iframe>`, `<noembed>`, `<noframes>`, `<noscript>`; HTML §13.2.6.4.7) as ONE text node. Base printed
// each `${}`'s `<!---->` anchor inside it, so in a real browser the child-index path named no node and
// `<textarea>a ${@x} b</textarea>` threw at mount ("Cannot read properties of undefined (reading
// 'parentNode')") — nothing rendered. happy-dom parses the comment and hides that, so the shape of the
// ARTIFACT is pinned here (no anchor inside the element; one `rt.textContent` hole on the element), and
// the values are pinned through happy-dom; compiler/tests/browser/rcdata-holes-chromium-s482.browser.test.js
// repeats the load + change in Chromium.
//
// SPEC: §24.5 item 2 ("an element (with any hole in it) inside an HTML raw-text or RCDATA element …: the
// parser reads that content as text (an interpolated value inside one stays legal)"; the one line ending
// dropped after `<textarea>`), §34 W-RCDATA-BIND-VALUE-CONTENT-CONFLICT ("a reactive `${...}` in a
// `<textarea>`'s RCDATA content compiles to a reactive `.value` bind"; with `bind:value`, "`bind:value`
// wins … and the reactive content interpolation is dropped").

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-rcdata-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return await compileSource(file);
}
async function compile(src) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function codes(src, severity) {
  const res = await result(src);
  return res.diagnostics.filter((d) => d.severity === severity).map((d) => d.code);
}
// every template's content in the client HTML, joined
function templates(html) {
  return [...html.matchAll(/<template id="[^"]*"[^>]*>([\s\S]*?)<\/template>/g)].map((m) => m[1]).join("\n");
}
// the content of every `<tag …>…</tag>` in the templates
function contents(html, tag) {
  return [...templates(html).matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}
// run the artifact (happy-dom); after `steps`, each textarea's value + child text, the title's text, and texts by id
async function run(src, steps = [], ids = []) {
  const res = await compile(src);
  const r = await runBootstrapArtifact(res.client.html, res.client.js, steps, {}, [], undefined);
  const body = r.body;
  return {
    errors: r.errors ?? r.error ?? null,
    ta: [...body.querySelectorAll("textarea")].map((t) => ({ value: t.value, text: t.textContent })),
    title: [...body.querySelectorAll("title")].map((t) => t.textContent),
    ids: ids.map((id) => String(body.querySelector("#" + id)?.textContent ?? "<none>")),
  };
}

const MIXED = `<program>
let <x:string="hi"/>
<textarea id="t">a \${@x} b</textarea>
<button id="b" onclick=@x = "yo">b</button>
</program>
`;

describe("the artifact: no anchor inside an RCDATA element; one text value on the element", () => {
  test("`a ${@x} b` — the textarea is printed empty and wired by ONE rt.textContent", async () => {
    const res = await compile(MIXED);
    expect(contents(res.client.html, "textarea")).toEqual([""]);
    expect(res.client.js).toContain('rt.textContent(scope$, n$0, () => ["a ", inst$.fields[0 /* x */].get(), " b"]);');
    expect(res.client.js).not.toContain("rt.at(root$, 0, 1)");
  }, 120000);

  test("`${@x}` alone (worked on base by luck) — now the same one-value form", async () => {
    const res = await compile(`<program>
let <x:string="hi"/>
<textarea id="t">\${@x}</textarea>
</program>
`);
    expect(contents(res.client.html, "textarea")).toEqual([""]);
    expect(res.client.js).toContain("rt.textContent(scope$, n$0, () => [inst$.fields[0 /* x */].get()]);");
  }, 120000);

  test("`<title>Page ${@n} of 3</title>` — no anchor in the title", async () => {
    const res = await compile(`<program>
let <n:int=1/>
<title>Page \${@n} of 3</title>
</program>
`);
    expect(contents(res.client.html, "title")).toEqual([""]);
    expect(res.client.js).toContain('rt.textContent(scope$, n$0, () => ["Page ", inst$.fields[0 /* n */].get(), " of 3"]);');
  }, 120000);

  test("raw-text `<xmp>` / `<noscript>` with a `${}` take the same form", async () => {
    const res = await compile(`<program>
let <x:string="hi"/>
<xmp>a \${@x}</xmp><noscript>b \${@x}</noscript>
</program>
`);
    expect(contents(res.client.html, "xmp")).toEqual([""]);
    expect(contents(res.client.html, "noscript")).toEqual([""]);
    expect(res.client.js).toContain('rt.textContent(scope$, n$0, () => ["a ", inst$.fields[0 /* x */].get()]);');
    expect(res.client.js).toContain('rt.textContent(scope$, n$1, () => ["b ", inst$.fields[0 /* x */].get()]);');
  }, 120000);

  test("only static text, and an SVG `<title>` (markup, not RCDATA), print as before", async () => {
    const res = await compile(`<program>
let <n:int=1/>
<textarea id="t">only static</textarea>
<svg><title>svg \${@n} t</title></svg>
</program>
`);
    expect(contents(res.client.html, "textarea")).toEqual(["only static"]);
    expect(contents(res.client.html, "title")).toEqual(["svg <!----> t"]);
    expect(res.client.js).not.toContain("rt.textContent");
  }, 120000);
});

describe("the values (happy-dom), on load and after a cell change", () => {
  test("`a ${@x} b`: `a hi b`, then `a yo b`", async () => {
    expect((await run(MIXED)).ta).toEqual([{ value: "a hi b", text: "a hi b" }]);
    expect((await run(MIXED, [{ click: "#b" }])).ta).toEqual([{ value: "a yo b", text: "a yo b" }]);
  }, 120000);

  test("two holes, a hole first and a hole last", async () => {
    const src = `<program>
let <x:string="hi"/>
let <n:int=1/>
<textarea id="t">\${@x}-\${@n} tail</textarea>
<textarea id="u">head \${@x}</textarea>
<button id="b" onclick=@n = @n + 1>b</button>
</program>
`;
    expect((await run(src)).ta.map((t) => t.value)).toEqual(["hi-1 tail", "head hi"]);
    expect((await run(src, [{ click: "#b" }])).ta.map((t) => t.value)).toEqual(["hi-2 tail", "head hi"]);
  }, 120000);

  test("static text is kept exactly as the bootstrap shows text (an `&amp;` is the five characters, as in a `<p>`)", async () => {
    const r = await run(`<program>
<textarea id="t">a &amp; b &lt;c&gt; \${"x"}</textarea>
<p id="p">a &amp; b &lt;c&gt; x</p>
</program>
`, [], ["p"]);
    expect(r.ta[0].value).toBe(r.ids[0]);
    expect(r.ta[0].value).toBe("a &amp; b &lt;c&gt; x");
  }, 120000);

  test("the ONE line ending after `<textarea>` is dropped, as the parser drops it; a second is kept", async () => {
    const r = await run("<program>\nlet <x:string=\"hi\"/>\n<textarea id=\"t\">\n${@x} first</textarea>\n<textarea id=\"u\">\n\n${@x} second</textarea>\n</program>\n");
    expect(r.ta.map((t) => t.value)).toEqual(["hi first", "\nhi second"]);
  }, 120000);

  test("`<title>Page ${@n} of 3</title>` follows the cell", async () => {
    const src = `<program>
let <n:int=1/>
<title>Page \${@n} of 3</title>
<button id="b" onclick=@n = @n + 1>b</button>
</program>
`;
    expect((await run(src)).title).toEqual(["Page 1 of 3"]);
    expect((await run(src, [{ click: "#b" }])).title).toEqual(["Page 2 of 3"]);
  }, 120000);

  test("a textarea in a component's renders, with a prop and a program cell", async () => {
    const src = `<program>
let <n:int=1/>
<box label:string/>
renders <div class="box"><textarea id="t">\${label} n=\${@n}!</textarea></div>
<main>
<box label="L"/>
<button id="b" onclick=@n = @n + 1>b</button>
</main>
</program>
`;
    expect((await run(src)).ta.map((t) => t.value)).toEqual(["L n=1!"]);
    expect((await run(src, [{ click: "#b" }])).ta.map((t) => t.value)).toEqual(["L n=2!"]);
  }, 120000);

  test("a textarea in an `<each>` row, reading the row item and a program cell", async () => {
    const src = `<program>
<xs:string[]=(["a", "b"])/>
let <s:string="!"/>
<main><each in=@xs as x><textarea>\${x}\${@s} row</textarea></each>
<button id="b" onclick=@s = "?">b</button></main>
</program>
`;
    expect((await run(src)).ta.map((t) => t.value)).toEqual(["a! row", "b! row"]);
    expect((await run(src, [{ click: "#b" }])).ta.map((t) => t.value)).toEqual(["a? row", "b? row"]);
  }, 120000);
});

describe("`bind:value` plus content — §34 W-RCDATA-BIND-VALUE-CONTENT-CONFLICT", () => {
  const src = `<program>
let <x:string="hi"/>
let <y:string="init"/>
<textarea id="t" bind:value=@y>pre \${@x}</textarea>
<button id="b" onclick=@x = "yo">b</button>
</program>
`;
  test("warns; compiles", async () => {
    expect(await codes(src, "warning")).toEqual(["W-RCDATA-BIND-VALUE-CONTENT-CONFLICT"]);
    expect(await codes(src, "error")).toEqual([]);
  }, 120000);

  test("bind:value wins: the value is the bound cell's, and the content is dropped", async () => {
    const res = await compile(src);
    expect(res.client.js).not.toContain("rt.textContent");
    expect((await run(src)).ta[0].value).toBe("init");
    expect((await run(src, [{ click: "#b" }])).ta[0].value).toBe("init");
  }, 120000);

  test("no warning without a `${}` in the content", async () => {
    expect(await codes(`<program>
let <y:string="init"/>
<textarea id="t" bind:value=@y>static</textarea>
</program>
`, "warning")).toEqual([]);
  }, 120000);
});

describe("fail closed: a child that is not text or a `${expr}`", () => {
  test("an element, a use, an `<each>` and an `if=` element in a textarea: E-HTML-PARSER-REPAIR (unchanged)", async () => {
    expect(await codes(`<program>
let <x:string="hi"/>
<textarea>a <b>\${@x}</b></textarea>
</program>
`, "error")).toEqual(["E-HTML-PARSER-REPAIR"]);
    expect(await codes(`<program>
<xs:string[]=(["a"])/>
<textarea><each in=@xs as x>\${x}</each></textarea>
</program>
`, "error")).toEqual(["E-HTML-PARSER-REPAIR"]);
  }, 120000);

  test("an `<effect>` in a title: E-HTML-PARSER-REPAIR", async () => {
    expect(await codes(`<program>
let <x:string="hi"/>
function note(v: int) { }
<title>t \${@x}<effect deps=[@x]>\${ note(1); }</></title>
</program>
`, "error")).toContain("E-HTML-PARSER-REPAIR");
  }, 120000);

  test("a `${ for … lift }` of text values in a textarea: E-BOOTSTRAP-UNSUPPORTED (INTERIM, g-boot-rcdata-text-lift-s482)", async () => {
    const res = await result(`<program>
<xs:string[]=(["a", "b"])/>
<textarea id="t">L \${ for (x of @xs) { lift x; } }</textarea>
</program>
`);
    const errs = res.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs[0].message).toContain("a `${ for … lift }` that lifts text values inside `<textarea>`");
    expect(errs[0].message).toContain("g-boot-rcdata-text-lift-s482");
  }, 120000);

  // s482 (#2069 review LOW-1): markup rows are an element inside the RCDATA element — §24.5 item 2, PERMANENT
  // (E-HTML-PARSER-REPAIR), and the message names the construct written: a `${ if … }` is not a `for`.
  test("a `${ if … }` lifting markup in a textarea: E-HTML-PARSER-REPAIR naming the `if`", async () => {
    const res = await result(`<program>
<x:string="hi"/>
<textarea id="t">\${ if (@x == "hi") { lift <b>q</b>; } }</textarea>
</program>
`);
    const errs = res.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E-HTML-PARSER-REPAIR"]);
    expect(errs[0].message).toContain("a `${ if … }` whose row or branch is markup puts an element inside `<textarea>`");
    expect(errs[0].message).not.toContain("for … lift");
  }, 120000);

  test("a value-form `${ if … }` with markup branches in a title: E-HTML-PARSER-REPAIR naming the `if`", async () => {
    const res = await result(`<program>
<x:string="hi"/>
<title>t \${ if (@x == "hi") { <b/> } else { <i/> } }</title>
</program>
`);
    const errs = res.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E-HTML-PARSER-REPAIR"]);
    expect(errs[0].message).toContain("a `${ if … }` whose row or branch is markup puts an element inside `<title>`");
  }, 120000);

  test("a `${ for … lift <b> }` in a textarea: E-HTML-PARSER-REPAIR", async () => {
    const res = await result(`<program>
<xs:string[]=(["a", "b"])/>
<textarea id="t">\${ for (s of @xs) { lift <b>\${s}</b>; } }</textarea>
</program>
`);
    const errs = res.diagnostics.filter((d) => d.severity === "error");
    expect(errs.map((d) => d.code)).toEqual(["E-HTML-PARSER-REPAIR"]);
    expect(errs[0].message).toContain("a `${ for … lift }` whose row or branch is markup");
  }, 120000);
});
