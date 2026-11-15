// body-top-s478.test.js — s478-boot-body-top (S478 conformance triage C3): statements at a
// `<program>` / `<page>` body top, and at the top level of a `${ … }` logic block there.
//
// Governing text:
//   §40.8 S441: "A bare run — a run of non-whitespace source characters written directly among
//   the body's children, not inside a markup element and not a `"..."` display-text literal — is
//   **code**. It SHALL be parsed and checked as logic at its position … and it SHALL NOT ship as
//   page text." · display text is declared: a markup element, or "(b) a `"..."` display-text
//   literal …, which renders as a text node at its position — the `"` delimiters are not
//   rendered, and a `${…}` inside it renders its value" · "A bare run that is not valid code is
//   `E-UNQUOTED-DISPLAY-TEXT` (§4.18.7)." · "A **bare expression statement** at this body-top …
//   is **evaluated, not rendered** — it runs once at mount in source order" · "A **bare write**
//   at this body-top (`@x = 1`) is an ordinary write in a logic context" · "A bare expression
//   statement at this body-top built only from literals and operators — `404`, … — … is
//   `E-UNQUOTED-DISPLAY-TEXT` … So is a label on a statement that is not a loop (`Total: 42`)".
//   §4.18.7: "One diagnostic covers each maximal run of consecutive statements that are not valid
//   code, and the statements it covers raise no other diagnostic" — and it "SHALL also name the
//   markup-element form (`<p>…</p>`) as a fix, alongside the `"..."` literal".
//   §17.3 (S449): "A `${ … }` at a `<program>` / `<page>` / `<channel>` body top is a statement
//   list, evaluated, not rendered (§40.8); that is the position this section's 'runs once at
//   mount' describes."
//   §4.18.5: "Whitespace outside a display-text literal but inside a code-default body … is
//   source formatting and is NOT content."
//
// RED ON MAIN: before s478 every bare run was E-PARSE-ITEM "unexpected text at program level",
// and every statement in a program-level `${ … }` was E-PARSE-ITEM "(other statements at
// logic-block level are not in the bootstrap)".

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;
const textOf = (sel) => document.querySelector(sel).textContent;

describe("§40.8 / §4.18.7 — a bare run that is not valid code is ONE E-UNQUOTED-DISPLAY-TEXT", () => {
  test("loose prose: one report over the line, no E-SCOPE-001 on its first word, naming both declared forms", () => {
    const src = P(`let <count:int=0/>\nWelcome to the dashboard.\n<p>\${@count}</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    const d = errs(r)[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("Welcome to the dashboard.");
    expect(d.message).toContain("<p>Welcome to the dashboard.</p>");
    expect(d.message).toContain('"Welcome to the dashboard."');
  });

  test("consecutive prose lines are one report (a maximal run)", () => {
    const src = P(`Hello world, this is prose.\nAnd a second line of it.\n<p>x</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    const d = errs(r)[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("Hello world, this is prose.\nAnd a second line of it.");
  });

  test("a label on a statement that is not a loop, characters the lexer cannot read, a literal-only statement", () => {
    for (const line of ["Total: 42", "© 2026 Acme Inc", "★ ✓ →", "404;", "[1, 2];", "\"a\" + 1;"]) {
      expect(codes(run(P(`${line}\n<p>x</p>`)))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    }
  });

  test("a `<page>` body top is the same locus", () => {
    expect(codes(run(P(`<page>\nPage prose here.\n<p>x</p>\n</page>`)))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });

  test("prose, then code on the next line: the code is read as code (its own diagnostics stand)", () => {
    const r = run(P(`careful, world\nlet <n:int=0/>\n@n = @n + 1;\n<p>\${@n}</p>`));
    expect(codes(r)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });

  test("a construct the named-refusal table knows keeps its own code (`throw` — E-THROW-NOT-IN-SCRML)", () => {
    expect(codes(run(P(`throw "x"\n<p>x</p>`)))).toEqual(["E-THROW-NOT-IN-SCRML"]);
  });
});

describe("§40.8 — body-top statements are code: checked as logic, run once at mount in source order", () => {
  test("a no-effect statement is E-STMT-NO-EFFECT, not display text", () => {
    expect(codes(run(P(`let <count:int=3/>\n@count;\n<p>\${@count}</p>`)))).toEqual(["E-STMT-NO-EFFECT"]);
  });

  test("a statement still takes its `;` (§7.2.2 rule 1)", () => {
    expect(codes(run(P(`let <count:int=0/>\n@count = 5\n<p>\${@count}</p>`)))).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });

  test("bare writes, a `${ … }` statement list and an `if` run once at mount, in source order", async () => {
    const r = run(P(`let <count:int=2/>\n@count = @count + 5;\n@count = @count * 2;\n<p id="z">\${@count}</p>\n\${ if (@count > 10) { @count = @count + 1; } }\n<button id="b" onclick={ @count = 0; }>b</button>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "bt-run");
    expect(textOf("#z")).toBe("15");
    click(document.querySelector("#b"));
    expect(textOf("#z")).toBe("0");   // ran ONCE: a later change does not re-run it
  });

  test("a `;` alone between statements is the terminator, never text (§7.2.2 rule 6)", async () => {
    const r = run(P(`let <count:int=1/>\n@count = @count + 1; @count = @count + 1;\n;\n<p id="z">\${@count}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "bt-semi");
    expect(textOf("#z")).toBe("3");
  });

  test("a body-top `const` is the file-scope constant a program-level `${ const … }` is (§7.6)", async () => {
    const r = run(P(`const n = 3;\nconst msg = \`total is \${n + 1} units\`;\n<p id="z">\${msg}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "bt-const");
    expect(textOf("#z")).toBe("total is 4 units");
  });

  test("a statement outside any `<program>` has no scope to run it — refused by name, never dropped", () => {
    expect(codes(run(`\${ let <n:int=0/> }\n\${ @n = 5; }\n<program>\n<p>x</p>\n</program>\n`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

describe("§4.17 (S462) — `<script>` / `<style>` in a body-top logic block is refused on the parsed element", () => {
  // "A `<script>` / `<style>` element SHALL be rejected with the same codes … at EVERY position
  // markup is parsed or built: … markup in a logic block — `lift <markup>`, `for … lift`, `if …
  // lift` and implied-`lift` arms, bare markup in `${ … }`" · "The decision is made on the parsed
  // element (its node), never on source text".
  const B = (logic) => P(`let <f:boolean=true/>\nlet <code:string="x"/>\n<p>page</p>\n\${ ${logic} }`);
  test("lift / bare / implied-lift / nested-in-svg: one E-SCRIPT-001 (or E-STYLE-001), no cascade", () => {
    expect(codes(run(B("lift <script>${@code}</script>")))).toEqual(["E-SCRIPT-001"]);
    expect(codes(run(B("lift <SCRIPT src=@code></SCRIPT>")))).toEqual(["E-SCRIPT-001"]);
    expect(codes(run(B("lift <style>${@code}</style>")))).toEqual(["E-STYLE-001"]);
    expect(codes(run(B("<script>x</script>")))).toEqual(["E-SCRIPT-001"]);
    expect(codes(run(B("if (@f) { <script>x</script> }")))).toEqual(["E-SCRIPT-001"]);
    expect(codes(run(B("lift <svg><script>x</script></svg>")))).toEqual(["E-SCRIPT-001"]);
  });

  test("a `<script>` in a string is not an element: no E-SCRIPT-001", () => {
    expect(codes(run(B(`const s = "<script>x</script>";`)))).not.toContain("E-SCRIPT-001");
  });

  test("any other markup there is refused by name (not in the bootstrap), never misread", () => {
    expect(codes(run(B("lift <noscript>n</noscript>")))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(run(B("if (@f) { <p>waiting</p> }")))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("§40.8 (b) / §4.18.3 — a standalone `\"…\"` is a display-text literal: a text node, delimiters dropped", () => {
  test("literals render as text at their position; `${…}` inside renders its value; text is escaped; whitespace between is formatting", async () => {
    const r = run(P(`let <count:int=3/>\n<p id="a">Welcome.</p>\n"Items ship on Friday."\n"Count is \${@count} now."\n"a < b & c"`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "bt-display");
    expect(document.body.textContent).toBe("Welcome.Items ship on Friday.Count is 3 now.a < b & c");
  });

  test("a `\"…\"` that does not stand alone is a code string (`\"x\".length;` — E-STMT-NO-EFFECT)", () => {
    expect(codes(run(P(`"x".length;\n<p>x</p>`)))).toEqual(["E-STMT-NO-EFFECT"]);
  });
});
