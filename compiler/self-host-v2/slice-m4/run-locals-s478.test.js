// run-locals-s478.test.js — s478-boot-run-locals: a local declared at a body-top run's top
// level is FILE-SCOPE (closes g-boot-run-locals-scope-s478).
//
// Governing text:
//   OWNER RULING S478 (user-voice-scrml.md, body-top question 2): "`lin` (and every local)
//   declared at a body-top run's top level is FILE-SCOPE per §7.6, so `${ lin token = …; }` then
//   `<p>${token}</p>` is legal (closes g-boot-run-locals-scope-s478 once built). Today's false
//   E-LIN-001 + E-SCOPE-001 is a bootstrap bug."
//   §7.6: "A variable declared with `let` or `const` at the top level of a file-level `${}` block
//   SHALL be in scope for all subsequent `${}` blocks and markup interpolations in the same file"
//   · "Only top-level declarations within the `${}` block participate in file scope" · "Re-declaring
//   a name with `let` in a later file-level `${}` block when that name was already declared at file
//   scope SHALL be a compile error (E-SCOPE-010: duplicate binding in file scope)".
//   §7.6.1: "A V5-strict structural cell `<x>` and a local `let x` cannot coexist in the same file
//   scope" (E-NAME-COLLIDES-STATE).
//   §35.2.2: "A `lin` variable declared in a `${}` logic block MAY be consumed in a later `${}`
//   logic block or in an intervening markup interpolation within the same parent scope" · "The
//   compiler SHALL hoist the JS storage for such a `lin` variable to a single binding at the common
//   ancestor scope" · "Any reference to the `lin` variable in an intermediate `${}` logic block,
//   intermediate markup interpolation … SHALL be E-LIN-002" · "a `lin` variable declared in a
//   nested `${}` block but never consumed before the parent scope closes SHALL be E-LIN-001".
//   §35.3: "the existence of a reference to a `lin` identifier in a consuming position is the
//   consumption" (a static count — a re-render does not count again).
//   §35.4.4: "`lin` variables from outer scope SHALL NOT be consumed inside loop bodies" (E-LIN-002).
//   §6.7.4: an effect body — "a `lin` variable read in it is E-LIN-004".
//   §35.5: E-LIN-006 "when a `lin` variable is consumed inside a `<request>` … body and the `lin`
//   variable was declared outside that body".
//
// RED ON BASE (origin/s478-boot-nested-logic): every program below that reads the local after
// its run was E-SCOPE-001 on the read + E-LIN-001 on the declaration.

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
const FT = `function fetchToken() -> string { return "tok-1"; }`;
const textOf = (sel) => document.querySelector(sel).textContent;

describe("owner ruling S478 / §35.2.2 — a body-top `lin` is consumed by a later interpolation or run", () => {
  test("docs/lin.md's example: `${ lin token = … }` then `<p>${token}</p>` compiles and renders the value", async () => {
    const r = run(P(`  ${FT}\n  \${\n    lin token = fetchToken();\n  }\n  <p id="z">Welcome — your session starts with \${token}.</p>`));
    expect(codes(r)).toEqual([]);
    const { out } = await loadProgram(r.core, "rl-doc");
    expect(textOf("#z")).toBe("Welcome — your session starts with tok-1.");
    // ONE binding at the scope (§35.2.2), assigned by the run
    expect(out.js).toContain("let token;");
    expect(out.js).toContain("token = fetchToken();");
  });

  test("a bare body-top `lin` is the same", async () => {
    const r = run(P(`lin t = "ab";\n<p id="z">\${t}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "rl-bare");
    expect(textOf("#z")).toBe("ab");
  });

  test("consumed in a later `${}` block, markup between", async () => {
    const r = run(P(`  ${FT}\n  function authenticate(t: string) -> int { return 7; }\n  let <n:int=0/>\n  \${ lin token = fetchToken(); }\n  <p id="m">middle</p>\n  \${ @n = authenticate(token); }\n  <p id="z">\${@n}</p>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "rl-later");
    expect(textOf("#z")).toBe("7");
  });

  test("through plain HTML elements at any depth", () => {
    expect(codes(run(P(`\${ lin token = "a"; }\n<div><section><p>\${token}</p></section></div>`)))).toEqual([]);
  });

  test("a re-rendering interpolation counts ONCE (static), and keeps the value", async () => {
    const r = run(P(`let <n:int=0/>\n\${ lin token = "ab"; }\n<p id="z">\${token.length + @n}</p>\n<button id="b" onclick={ @n = @n + 1; }>b</button>`));
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "rl-rerender");
    expect(textOf("#z")).toBe("2");
    click(document.querySelector("#b"));
    expect(textOf("#z")).toBe("3");
  });
});

describe("§35.2 / §35.2.2 / §35.5 — the count across nodes", () => {
  test("two interpolations: E-LIN-002 on the second", () => {
    const src = P(`  ${FT}\n  \${ lin token = fetchToken(); }\n  <p>Peek: \${token}</p>\n  <p>And again: \${token}</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-LIN-002"]);
    expect(errs(r)[0].span.start).toBe(src.lastIndexOf("token"));
  });

  test("an interpolation, then a later run: E-LIN-002", () => {
    expect(codes(run(P(`let <n:int=0/>\n\${ lin token = "a"; }\n<p>\${token}</p>\n\${ @n = token.length; }`)))).toEqual(["E-LIN-002"]);
  });

  test("never consumed: E-LIN-001 at the declaration (scope exit is the program's end)", () => {
    const src = P(`  ${FT}\n  \${ lin token = fetchToken(); }\n  <p>none</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-LIN-001"]);
    expect(src.slice(errs(r)[0].span.start).startsWith("lin token")).toBe(true);
  });

  test("consumed in a later run's loop body: E-LIN-002 (§35.4.4)", () => {
    expect(codes(run(P(`let <n:int=0/>\n\${ lin token = "a"; }\n\${ for (const i of [1, 2]) { @n = token.length; } }`)))).toEqual(["E-LIN-002"]);
  });

  test("a later run's nested `const` of its name shadows it: E-LIN-005", () => {
    expect(codes(run(P(`let <n:int=0/>\n\${ lin token = "a"; }\n\${ if (@n == 0) { const token = 1; @n = token; } }\n<p>\${token}</p>`)))).toEqual(["E-LIN-005"]);
  });
});

describe("§7.6 — ordering, nesting, names", () => {
  test("a read BEFORE the run is out of scope (\"subsequent\"): E-SCOPE-001 there only", () => {
    const src = P(`  ${FT}\n  <p>\${token}</p>\n  \${ lin token = fetchToken(); }\n  <p>\${token}</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    expect(errs(r)[0].span.start).toBe(src.indexOf("token"));
  });

  test("a local of a nested block stays block-scoped (\"Only top-level declarations\")", () => {
    expect(codes(run(P(`  ${FT}\n  let <c:bool=true/>\n  \${ if (@c) { lin token = fetchToken(); } }\n  <p>\${token}</p>`)))).toEqual(["E-SCOPE-001", "E-LIN-001"]);
  });

  test("the same name in two runs: E-SCOPE-010 on the second (one file scope)", () => {
    const r = run(P(`  ${FT}\n  function use(t: string) -> int { return 1; }\n  let <n:int=0/>\n  \${ lin token = fetchToken(); @n = use(token); }\n  \${ lin token = fetchToken(); @n = use(token); }\n  <p>\${@n}</p>`));
    expect(codes(r)).toEqual(["E-SCOPE-010"]);
  });

  test("beside a function of its name: E-SCOPE-010", () => {
    expect(codes(run(P(`function token() -> string { return "t"; }\n\${ lin token = "a"; }\n<p>\${token}</p>`)))).toEqual(["E-SCOPE-010"]);
  });

  test("beside a cell of its name: E-NAME-COLLIDES-STATE (§7.6.1)", () => {
    expect(codes(run(P(`let <token:int=0/>\n\${ lin token = "a"; }\n<p>\${token}</p>`)))).toEqual(["E-NAME-COLLIDES-STATE"]);
  });
});

describe("positions that are not the run's own scope — refused by name, counted (no E-LIN-001 cascade)", () => {
  test("an `<effect>` body: E-LIN-004 (§6.7.4)", () => {
    const c = codes(run(P(`let <n:int=0/>\n\${ lin token = "a"; }\n<effect deps=[@n]>\${ log(token); }</>`)));
    expect(c).toContain("E-LIN-004");
    expect(c).not.toContain("E-LIN-001");
  });

  test("a `${ for … }` loop row: E-LIN-002 (§35.4.4)", () => {
    expect(codes(run(P(`\${ lin token = "a"; }\n<ul>\${ for (const i of [1, 2]) { lift <li>\${token}</li>; } }</ul>`)))).toEqual(["E-LIN-002"]);
  });

  test("an `if=` element's body, an attribute value, an event handler: E-BOOTSTRAP-UNSUPPORTED (INTERIM)", () => {
    expect(codes(run(P(`let <c:bool=true/>\n\${ lin token = "a"; }\n<div if=@c><p>\${token}</p></div>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(run(P(`\${ lin token = "a"; }\n<p title=token>x</p>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(run(P(`let <n:int=0/>\n\${ lin token = "a"; }\n<button onclick={ @n = token.length; }>b</button>`)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("a function written after the run that reads it: refused by name, not \"not declared\"", () => {
    const r = run(P(`\${ lin token = "a"; }\n\${ function f() -> string { return token; } }\n<p>\${f()}</p>`));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("body-top local `token`");
  });

  test("bound after a wait in its run and read outside it: refused by name; read inside the run: built", async () => {
    const SRV = `server function srv() -> string { return "s"; }`;
    const late = run(P(`${SRV}\n\${ lin t = srv() !{ _ :> "u" }; }\n<p>\${t}</p>`));
    expect(codes(late)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(late)[0].message).toContain("bound after a wait");
    expect(codes(run(P(`${SRV}\nfunction use(x: string) -> int { return 1; }\nlet <n:int=0/>\n\${ lin t = srv() !{ _ :> "u" }; @n = use(t); }\n<p>\${@n}</p>`)))).toEqual([]);
    // bound BEFORE the wait: read after the run, built
    expect(codes(run(P(`${SRV}\nlet <m:string=""/>\n\${ lin t = "x"; @m = srv() !{ _ :> "u" }; }\n<p>\${t}\${@m}</p>`)))).toEqual([]);
  });
});
