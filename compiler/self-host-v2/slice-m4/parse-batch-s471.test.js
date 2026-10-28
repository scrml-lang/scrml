// parse-batch-s471.test.js — s471-bootstrap-parse-batch: parser gaps closed in
// compiler/self-host-v2/parse.scrml (each section names its known-gaps id and
// the governing SPEC sentence).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const P = (body, decls = "") => `<program>\n    type Ph:enum = { A, B }\n    let <n:int=5/>\n${decls}\n    <main>\n        ${body}\n        <b>end</b>\n    </main>\n</program>\n`;
const W = (inner) => `\n        ${inner}\n        <b>end</b>\n    `;
const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
let k = 0;
async function html(src) {
  const r = run(src);
  expect(r.diags.map((d) => d.code)).toEqual([]);
  await loadProgram(r.core, "s471pb-" + k++);
  return document.querySelector("main").innerHTML;
}
const state = (idle) => P(`<p><*ph/></p>`, `    <ph:Ph=.A single>\n        <A rule=.B>${idle}</>\n        <B rule=.A : "B">\n    </>`);

// ---------------------------------------------------------------------------
// g-bootstrap-code-body-several-display-literals-refused — SPEC §4.18.3 (S444):
// "a body may hold several such statements"; §7.2.2 rule 2: a standalone
// display-text literal is "an item delimited by its own closer".
// ---------------------------------------------------------------------------
describe("several display-text literals in one state-child body (§4.18.3)", () => {
  test("`\"a\"` newline `\"b\"` — two items, rendered in order", async () => {
    expect(await html(state('\n            "a"\n            "b"\n        '))).toBe(W("<p>ab<!--if--></p>"));
  });
  test("`\"a\" \"b\"` on one line (§7.2.2 rule 4: a newline is whitespace)", async () => {
    expect(await html(state('"a" "b"'))).toBe(W("<p>ab<!--if--></p>"));
  });
  test("each item keeps its own `${…}` segments and escapes", async () => {
    expect(await html(state('"n=${@n}" " \\"q\\""'))).toBe(W('<p>n=5 "q"<!--if--></p>'));
  });
  test("a malformed escape in the second item is E-PARSE-001, once", () => {
    expect(codes(state('"a" "b\\q"'))).toEqual(["E-PARSE-001"]);
  });
  test("a single literal then a nested tag (unchanged)", async () => {
    expect(await html(state('"a" <i>x</i>'))).toBe(W("<p>a<i>x</i><!--if--></p>"));
  });
  // s471 review F2 (PA: refuse — no SPEC sentence licenses a `;` after a
  // closer-delimited item in a code-default body; §7.2.2 rule 2 lists the literal
  // under "What takes no `;`"). Fails closed, as on base.
  test("F2: `\"a\";`, `\"a\"; \"b\"`, `\"a\" \"b\";` fail closed (E-UNQUOTED-DISPLAY-TEXT, as before s471)", () => {
    expect(codes(state('"a";'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    expect(codes(state('"a"; "b"'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    expect(codes(state('"a" "b";'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
  test("fail closed: a literal followed by anything but another literal is still one expression", () => {
    expect(codes(state('"a" @n'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
  test("an operand `\"a\"` is still an ordinary string (`\"x\".length`)", () => {
    expect(codes(state('"xy".length'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// g-bootstrap-runaway-display-literal-cascades-before-closer — SPEC §4.18.3: "A
// display-text literal that reaches end-of-file (or the body's closer) before its
// closing `"` is an unterminated literal — `E-CTX-001` against the opening `"`,
// recovered per §4.18.7".
// ---------------------------------------------------------------------------
const stateLast = (idle, closer = "</>") => P(`<p><*ph/></p>`, `    <ph:Ph=.A single>\n        <B rule=.A : "B">\n        <A rule=.B>${idle}${closer}\n    </>`);
describe("a runaway display-text literal recovers at the body's closer (§4.18.3 / §4.18.7)", () => {
  test("`\"C:\\\"` with a later `\"` in the file → exactly E-CTX-001 (no cascade)", () => {
    const r = run(state('"C:\\"'));
    expect(r.diags.map((d) => d.code)).toEqual(["E-CTX-001"]);
    expect(r.diags[0].message).toContain("before the `<A>` body's closer");
  });
  test("control: the same body as the LAST state child (no later `\"`) → E-CTX-001 too", () => {
    expect(codes(stateLast('"C:\\"'))).toEqual(["E-CTX-001"]);
  });
  test("the report points at the opening `\"`", () => {
    const src = state('"C:\\"');
    const d = run(src).diags[0];
    expect(src.substring(d.span.start, d.span.end)).toBe('"');
    expect(src.substring(d.span.start, d.span.start + 6)).toBe('"C:\\"<');
  });
  test("parsing resumes at the closer: the sibling state child is still read", () => {
    const r = run(state('"C:\\"'));
    expect(r.diags.some((d) => d.code === "E-PARSE-UNCLOSED" || d.code === "E-UNQUOTED-DISPLAY-TEXT")).toBe(false);
  });
  test("a CLOSED literal holding a closer is still content (error path only): `\"use </> here\"` renders", async () => {
    expect(await html(state('"use </> here"'))).toBe(W("<p>use &lt;/&gt; here<!--if--></p>"));
  });
  // s471 review F1: a CLOSED literal holding `</>`, with something ELSE in the run
  // failing, is never re-read as runaway — each row is exactly base's verdict.
  const stY = (idle) => `<program>\n    type Ph:enum = { A, B }\n    let <y:string="Y"/>\n    <ph:Ph=.A single>\n        <A rule=.B>${idle}</>\n        <B rule=.A : "B">\n    </>\n    <main><p><*ph/></p></main>\n</program>\n`;
  test("F1: `\"x </> y\" + String.raw`z`` → E-UNQUOTED-DISPLAY-TEXT (base), no E-CTX-001", () => {
    expect(codes(stY('"x </> y" + String.raw`z`'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
  test("F1: `\"x </> y\" + ((q) => { return q; })(\"z\")` → E-UNQUOTED-DISPLAY-TEXT (base)", () => {
    expect(codes(stY('"x </> y" + ((q) => { return q; })("z")'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
  test("F1: `\"x </> ${@y}\" + \"q\"` → E-BOOTSTRAP-UNSUPPORTED (base — an honest refusal never triggers)", () => {
    expect(codes(stY('"x </> ${@y}" + "q"'))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("F1: `\"use </> here\" @n` → E-UNQUOTED-DISPLAY-TEXT (base)", () => {
    expect(codes(state('"use </> here" @n'))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
});

// ---------------------------------------------------------------------------
// g-bootstrap-let-decl-in-db-channel-body-refused-s469 — SPEC §66.2.5 (S469 O61):
// "`let <x/>` / `export <x/>` (and a locked `<x/>` declaration) MAY stand directly in a
// `<db>` body or a `<channel>` body." The declaration is never E-DECL-KEYWORD-NOT-ITEM;
// the block-owned (server-side) state it declares is not in the bootstrap — refused by name.
// ---------------------------------------------------------------------------
describe("a declaration in a `<db>` / `<channel>` body is an item, not a misplaced keyword (§66.2.5 O61)", () => {
  const DB = (body) => `<program>\n    <db src="./app.db">\n        ${body}\n        <p>in the db block</p>\n    </db>\n    <main><p>x</p></main>\n</program>\n`;
  const DBMSG = "a declaration in a `<db>` body";
  for (const decl of ["let <hits:int=0/>", "export let <hits:int=0/>", "export <hits:int=0/>", "<hits:int=0/>"]) {
    test(`\`${decl}\` in a <db> body → one named E-BOOTSTRAP-UNSUPPORTED, no E-DECL-KEYWORD-NOT-ITEM`, () => {
      const r = run(DB(decl));
      expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(r.diags[0].message).toContain(DBMSG);
    });
  }
  test("the refusal spans the whole declaration, keyword included", () => {
    const src = DB("let <hits:int=0/>");
    const d = run(src).diags[0];
    expect(src.substring(d.span.start, d.span.end)).toBe("let <hits:int=0/>");
  });
  test("prose in a <db> body is still text: `<p>Please let <b>me</b> know</p>` and a bare `let <b>x</b>`", () => {
    expect(codes(DB("<p>Please let <b>me</b> know</p>"))).toEqual([]);
    expect(codes(DB("let <b>x</b> be"))).toEqual([]);
  });
  test("a <db> body with no declaration is unchanged (clean)", () => {
    expect(codes(DB(""))).toEqual([]);
  });
  test("`let <x/>` in a <channel> body: only the element's own refusal (no E-DECL-KEYWORD-NOT-ITEM)", () => {
    const src = `<program>\n    <channel name="chat">\n        let <count:int=0/>\n    </channel>\n    <main><p>x</p></main>\n</program>\n`;
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("control: `let <x:int=0/>` in a plain <div> body is still E-DECL-KEYWORD-NOT-ITEM (§66.2.5 S449 reading)", () => {
    expect(codes(P("<div>let <x:int=0/></div>"))).toContain("E-DECL-KEYWORD-NOT-ITEM");
  });
});
