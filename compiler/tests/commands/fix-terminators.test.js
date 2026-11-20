/**
 * fix-terminators.test.js — the `scrml fix` rules `stmt-semi` and `arm-comma` (S469 dpa-073 F1 / F2 /
 * F3 / F5; S480 "Track M first"). change-id: s480-fix-dialect.
 *
 * Rulings (user-voice-scrml.md S469): "`;` ends a statement; newlines are whitespace"; "`;` after every
 * non-block statement including the last before `}` (`onclick={ @n = @n + 1; }`); block-like
 * statements and closer-delimited items take none"; "the arm list is a comma list (`match x { .A :> 1,
 * .B :> 2, }`) … trailing comma optional"; "a `scrml fix` rule inserts `;` and arm `,` at
 * impl#1-legacy's parsed boundaries, verified by emit diff".
 *
 * Covered: where `;` goes (incl. multi-line expressions, handlers, arm blocks, program bodies, module
 * roots); where it does not (strings, comments, markup text, regex, block-like statements, a markup
 * interpolation's lone value, a legacy `<x> = v` declaration); `,` between arms (match, `!{}`,
 * multi-line alternation heads); idempotence; the impl#1 verify (identical artifacts); the fixS66 /
 * CLI wiring; and the S480 unwrap-logic split (no §66 cell declaration left inside `${}`).
 */

import { describe, test, expect } from "bun:test";
import { fixTerminators, planTerminators, logicBlockStatements, normalizedArtifact, SEMI_RULE, COMMA_RULE } from "../../src/commands/fix-terminators.js";
import { fixS66, S66_RULES, IMPL1_SAFE_RULES } from "../../src/commands/fix-s66.js";

const F = "/virtual/app.scrml";
/** Plan + apply without the impl#1 verify (the planner is what most cases test). */
function apply(src) {
  const p = planTerminators(F, src);
  let out = "";
  let cur = 0;
  for (const e of p.edits) { out += src.slice(cur, e.at) + e.text; cur = e.at; }
  return out + src.slice(cur);
}
/** Apply, and assert a second run plans nothing (idempotence). */
function fixed(src) {
  const out = apply(src);
  expect(planTerminators(F, out).edits).toEqual([]);
  return out;
}
const prog = (body) => `<program>\n\${\n${body}\n}\n</program>\n`;

describe("stmt-semi — where a `;` goes", () => {
  test("every non-block statement of a logic block, the last one included", () => {
    expect(fixed(prog("  let a = 1\n  const b = a + 2\n  log(b)"))).toBe(prog("  let a = 1;\n  const b = a + 2;\n  log(b);"));
  });

  test("an import takes `;` (dpa-073 F3: a statement, not a closer-delimited item)", () => {
    expect(fixed(prog('  import { x } from "./y.scrml"'))).toBe(prog('  import { x } from "./y.scrml";'));
  });

  test("a multi-line expression gets ONE `;`, after its last line", () => {
    const src = prog("  const xs = [\n    1,\n    2\n  ]\n  const t = a +\n    b\n  const u = obj\n    .map(f)\n    .filter(g)");
    expect(fixed(src)).toBe(prog("  const xs = [\n    1,\n    2\n  ];\n  const t = a +\n    b;\n  const u = obj\n    .map(f)\n    .filter(g);"));
  });

  test("inside function bodies and one-line blocks, before the closing `}`", () => {
    const src = prog("  function f(n) {\n    if (n > 1) { return n }\n    return 0\n  }");
    expect(fixed(src)).toBe(prog("  function f(n) {\n    if (n > 1) { return n; }\n    return 0;\n  }"));
  });

  test("a value `match` bound by `const` takes `;` after its `}`; a statement `match` takes none", () => {
    const src = prog("  const r = match n {\n    1 :> \"a\"\n    _ :> \"b\"\n  }\n  match n {\n    1 :> log(1)\n    _ :> log(2)\n  }");
    expect(fixed(src)).toBe(prog("  const r = match n {\n    1 :> \"a\",\n    _ :> \"b\"\n  };\n  match n {\n    1 :> log(1),\n    _ :> log(2)\n  }"));
  });

  test("an arrow-function body is a statement list; the binding takes `;`", () => {
    const src = prog("  const f = (x) => {\n    log(x)\n    return x\n  }\n  xs.forEach((x) => {\n    log(x)\n  })");
    expect(fixed(src)).toBe(prog("  const f = (x) => {\n    log(x);\n    return x;\n  };\n  xs.forEach((x) => {\n    log(x);\n  });"));
  });

  test("an event handler `on…={ … }` is a statement list (dpa-073 F3's own example)", () => {
    expect(fixed("<program>\n<button onclick={ @n = @n + 1 }>+</button>\n</program>\n"))
      .toBe("<program>\n<button onclick={ @n = @n + 1; }>+</button>\n</program>\n");
  });

  test("a program body's bare code (S441) and a module file's root code", () => {
    expect(fixed("<program>\n    import { f } from \"./m.scrml\"\n    fn g() -> int { return f() }\n</program>\n"))
      .toBe("<program>\n    import { f } from \"./m.scrml\";\n    fn g() -> int { return f(); }\n</program>\n");
    expect(fixed("import { T } from './t.scrml'\nexport function g(x) {\n  return x\n}\n"))
      .toBe("import { T } from './t.scrml';\nexport function g(x) {\n  return x;\n}\n");
  });

  test("`lift <markup>` inside a loop takes `;` after the element", () => {
    const src = "<program>\n<ul>\n  ${ for (let m of xs) {\n    lift <li>\n      ${m.name}\n    </li>\n  } }\n</ul>\n</program>\n";
    expect(fixed(src)).toBe("<program>\n<ul>\n  ${ for (let m of xs) {\n    lift <li>\n      ${m.name}\n    </li>;\n  } }\n</ul>\n</program>\n");
  });

  test("a `?` glued to its operand (§19.5 propagation) ends the statement at its line end", () => {
    expect(fixed(prog("  function g(id) {\n    let user = getUser(id)?\n    return user\n  }"))).toBe(prog("  function g(id) {\n    let user = getUser(id)?;\n    return user;\n  }"));
  });

  test("a trailing comment stays after the inserted `;`", () => {
    expect(fixed(prog("  let a = 1 // one"))).toBe(prog("  let a = 1; // one"));
  });
});

describe("stmt-semi — where it does NOT go", () => {
  test("block-like statements: if / else, for, while, function / fn declarations, when, type :kind", () => {
    const src = prog("  if (a) {\n    f()\n  } else {\n    g()\n  }\n  for (const x of xs) {\n    h(x)\n  }\n  fn k() -> int { return 1 }\n  type P:enum = { A, B }\n  when @x changes {\n    f()\n  }");
    const out = fixed(src);
    expect(out).toContain("  } else {\n    g();\n  }\n  for");
    expect(out).toContain("type P:enum = { A, B }\n");
    expect(out).toContain("  }\n  fn k() -> int { return 1; }\n");
    expect(out.match(/\}\s*;/g)).toBe(null);
  });

  test("a braceless `if` body that returns an object literal: the `;` goes after the object, not inside it", () => {
    expect(fixed(prog("  function f(t) {\n    if (t is not) return { code: \"\", why: \"\" }\n    for (const x of xs) if (x) return { a: 1 }\n    return { code: \"x\", why: \"\" }\n  }")))
      .toBe(prog("  function f(t) {\n    if (t is not) return { code: \"\", why: \"\" };\n    for (const x of xs) if (x) return { a: 1 };\n    return { code: \"x\", why: \"\" };\n  }"));
  });

  test("a type alias takes `;` (it is a statement, §40.8)", () => {
    expect(fixed(prog("  type N = number"))).toBe(prog("  type N = number;"));
  });

  test("strings, templates, comments and regex literals are never edited", () => {
    const src = prog("  const s = \"a\nb\"\n  const t = `x\n${y}\nz`\n  // const c = 1\n  /* let d = 2\n  */\n  const r = /a+\\/b/g");
    const out = fixed(src);
    expect(out).toContain("const t = `x\n${y}\nz`;");
    expect(out).toContain("// const c = 1\n");
    expect(out).toContain("/* let d = 2\n  */");
    expect(out).toContain("const r = /a+\\/b/g;");
  });

  test("markup text is not code: a markup interpolation's lone value takes no `;`", () => {
    const src = "<program>\n<p>Don't stop ${@n + 1} here</p>\n<li>${item.name}</li>\n</program>\n";
    expect(fixed(src)).toBe(src);
  });

  test("a legacy reactive declaration `<x> = v` is left for the §66 rules", () => {
    const src = prog("  <count> = 0\n  <name>: string = \"\"\n  bump()");
    expect(fixed(src)).toBe(prog("  <count> = 0\n  <name>: string = \"\"\n  bump();"));
  });

  test("a §66 declaration (`let <x:T=v/>`, `renders <…>`) is a declaration, not a statement", () => {
    const src = "<program>\n    let <count:int=0/>\n    <step:int=1/>\n    fn inc() { @count = @count + @step }\n</program>\n";
    expect(fixed(src)).toBe("<program>\n    let <count:int=0/>\n    <step:int=1/>\n    fn inc() { @count = @count + @step; }\n</program>\n");
  });

  test("an already-terminated program is untouched (idempotence on ruled input)", () => {
    const src = prog("  let a = 1;\n  fn f() -> int { return a; }\n  const r = match a { 1 :> 2, _ :> 3, };");
    expect(apply(src)).toBe(src);
  });

  test("`return` with its value on the next line is reported, never guessed", () => {
    const p = planTerminators(F, prog("  function f() {\n    return\n    g()\n  }"));
    expect(p.notes.map((n) => n.reason).join("\n")).toContain("`return` whose value starts on the next line");
    expect(p.edits.filter((e) => e.line === 4)).toEqual([]);
  });

  test("an unbalanced region is left as written and noted", () => {
    const p = planTerminators(F, prog("  const a = (1\n  let b = 2"));
    expect(p.edits).toEqual([]);
    expect(p.notes.length).toBeGreaterThan(0);
  });
});

describe("arm-comma", () => {
  test("a `,` after every arm another arm follows; block arms included; the trailing one stays optional", () => {
    const src = prog("  const c = match r {\n    .Admin :> \"red\"\n    .Mod :> {\n      log(1)\n      lift \"blue\"\n    }\n    _ :> \"gray\"\n  }");
    expect(fixed(src)).toBe(prog("  const c = match r {\n    .Admin :> \"red\",\n    .Mod :> {\n      log(1);\n      lift \"blue\";\n    },\n    _ :> \"gray\"\n  };"));
  });

  test("an existing `,` is kept; a multi-line alternation head is one arm", () => {
    const src = prog("  const k = match t {\n    .A | .B |\n      .C :> 1,\n    .D :> 2\n    _ :> 3\n  }");
    expect(fixed(src)).toBe(prog("  const k = match t {\n    .A | .B |\n      .C :> 1,\n    .D :> 2,\n    _ :> 3\n  };"));
  });

  test("`!{ … }` handler arms", () => {
    const src = prog("  function g() {\n    load() !{\n      .Bad(m) :> log(m)\n      _ :> log(\"x\")\n    }\n  }");
    expect(fixed(src)).toBe(prog("  function g() {\n    load() !{\n      .Bad(m) :> log(m),\n      _ :> log(\"x\")\n    };\n  }"));
  });

  test("a value arm's lone `{ e }` takes no `;` (§18.5); a statement match's arm block does", () => {
    const src = prog("  const v = match n {\n    1 :> { a + 1 }\n    _ :> { 0 }\n  }\n  match n {\n    1 :> { f() }\n    _ :> { g() }\n  }");
    expect(fixed(src)).toBe(prog("  const v = match n {\n    1 :> { a + 1 },\n    _ :> { 0 }\n  };\n  match n {\n    1 :> { f(); },\n    _ :> { g(); }\n  }"));
  });

  test("the rules can run alone", () => {
    const src = prog("  const c = match r {\n    .A :> 1\n    .B :> 2\n  }");
    const semi = planTerminators(F, src, { semi: true, comma: false }).edits.map((e) => e.rule);
    const comma = planTerminators(F, src, { semi: false, comma: true }).edits.map((e) => e.rule);
    expect(semi).toEqual([SEMI_RULE]);
    expect(comma).toEqual([COMMA_RULE]);
  });
});

describe("verify — impl#1 compiles the file before and after (identical artifacts)", () => {
  test("a program impl#1 compiles is rewritten, and impl#1 reads it the same", () => {
    const src = "<program>\n${\n    <count> = 0\n    function inc() {\n        @count = @count + 1\n    }\n    function label(n: number) -> string {\n        return match n {\n            0 :> \"none\"\n            _ :> \"some\"\n        }\n    }\n}\n<button onclick=inc()>${label(@count)}</button>\n</program>\n";
    const r = fixTerminators(src, { filePath: F });
    expect(r.blockers).toEqual([]);
    expect(r.applied.map((a) => a.rule).sort()).toEqual([COMMA_RULE, SEMI_RULE, SEMI_RULE]);
    expect(r.output).toContain("@count = @count + 1;");
    expect(r.output).toContain("0 :> \"none\",\n");
    expect(r.output).toContain("        };\n    }");
    // idempotent through the verify too
    const r2 = fixTerminators(r.output, { filePath: F });
    expect(r2.changed).toBe(false);
  });

  test("a `;` impl#1 copies verbatim into its emit (a function body inside a call) is the same JS", () => {
    const src = "<program>\n${\n    <todos> = [1, 2]\n    function bump() {\n        @todos = @todos.map(function(t) {\n            return t + 1\n        })\n    }\n}\n<button onclick=bump()>+</button>\n</program>\n";
    const r = fixTerminators(src, { filePath: F });
    expect(r.blockers).toEqual([]);
    expect(r.output).toContain("return t + 1;\n        });");
  });

  test("normalizedArtifact: JS compared as its tree (`;` / empty statements aside), the build identity folded", () => {
    expect(normalizedArtifact("function f() { return 1 }")).toBe(normalizedArtifact("function f() { return 1 ; } ;"));
    expect(normalizedArtifact("f(); g()")).not.toBe(normalizedArtifact("f(); h()"));
    expect(normalizedArtifact('<html data-scrml-build="0123abcd">')).toBe(normalizedArtifact('<html data-scrml-build="zz99yy88">'));
  });

  test("a file that does not compile is not rewritten (no vacuous verify)", () => {
    const src = "<program>\n${\n    function f() {\n        return undeclaredThing\n    }\n}\n</program>\n";
    const r = fixTerminators(src, { filePath: F });
    expect(r.changed).toBe(false);
    expect(r.blockers.map((b) => b.reason).join("\n")).toContain("cannot verify");
  });
});

describe("wiring — fixS66 / the CLI rule set", () => {
  test("stmt-semi and arm-comma are impl#1-safe default rules, chained before the §66 declaration rules", () => {
    expect(IMPL1_SAFE_RULES).toContain("stmt-semi");
    expect(IMPL1_SAFE_RULES).toContain("arm-comma");
    expect(S66_RULES.indexOf("arm-comma")).toBeLessThan(S66_RULES.indexOf("rhs-decl"));
  });

  test("fixS66 with the default rules terminates statements", () => {
    const src = "<program>\n${\n    function inc() {\n        @count = @count + 1\n    }\n}\n</program>\n";
    const r = fixS66(src, { filePath: F, rules: ["stmt-semi"], verify: false });
    expect(r.output).toContain("@count = @count + 1;");
  });
});

describe("unwrap-logic split (S480) — no §66 cell declaration is left inside `${}`", () => {
  test("a depth-0 `${}` holding legacy declarations and a statement is split around the declarations", () => {
    const src = "<program>\n${\n    <query> = \"\"\n    <page> = 1\n    when @query changes {\n        @page = 1\n    }\n}\n<p>${@page}</p>\n</program>\n";
    const r = fixS66(src, { filePath: F, verify: false });
    expect(r.output).toBe("<program>\n    let <query=\"\"/>\n    let <page:number=1/>\n${\n    when @query changes {\n        @page = 1;\n    }\n}\n<p>${@page}</p>\n</program>\n");
    expect(r.output).not.toMatch(/\$\{\s*let </);
  });

  test("statements before and after a declaration keep their own blocks, in order", () => {
    const src = "<program>\n${\n    const k = 3\n    <x> = 1\n    init()\n}\n</program>\n";
    const r = fixS66(src, { filePath: F, verify: false });
    expect(r.output).toBe("<program>\n${\n    const k = 3;\n}\n    <x:number=1/>\n${\n    init();\n}\n</program>\n");
    // idempotent
    expect(fixS66(r.output, { filePath: F, verify: false }).changed).toBe(false);
  });

  test("statement extents come from the `;`-rule scanner", () => {
    const src = "<program>\n${\n    <x> = 1\n    const ys = [\n      1\n    ]\n    f()\n}\n</program>\n";
    const s = src.indexOf("${");
    const st = logicBlockStatements(F, src, s);
    expect(st.map((x) => src.slice(x.start, x.end))).toEqual(["<x> = 1", "const ys = [\n      1\n    ]", "f()"]);
    expect(st.map((x) => x.legacy)).toEqual([true, false, false]);
  });
});
