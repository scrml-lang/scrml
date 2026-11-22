// meta-s481.test.js — s481 (s481-boot-meta): `^{}` meta blocks in the bootstrap, phases 0 + 1
// (compiler/self-host-v2/meta.scrml, emit-gate.scrml; parse.scrml parseMetaExpr / parseMetaNode /
// parseFragment).
//
// Rulings: ruling:user-voice-scrml.md S480 "⭐ RULED — bootstrap census build order" item 2 (build
// `^{}` after Track M) and ruling:user-voice-scrml.md-S481-meta-four (all four items).
//
// Pinned here:
//   1. every static code fires on its own fault, and only its own (§22.11): E-META-001 (§22.12
//      allow-list), -002, -003, -005, -006, -007, -009, -010; a block that fails is never ALSO refused
//      as unsupported;
//   2. compile-time evaluation (the interpreter): emit / emit.raw / reflect, the method surface,
//      E-META-EVAL-001 (an unevaluable form, a host failure, the step and depth bounds — deterministic);
//   3. the splice: E-META-EVAL-002 (re-parse, the gate, a logic position), E-SCRIPT-001 from emitted
//      output, spans rewritten to the block;
//   4. a runtime block is refused by name (phase 2 is not built);
//   5. DRIFT: emit-gate.scrml is impl#1's markup-attr-allow-list.js + the document member table, on
//      a grid of inputs;
//   6. DIFFERENTIAL: compile-time bodies over the corpus method surface render the same markup under
//      impl#1 (its JS realm) and the bootstrap (its interpreter).

import { describe, test, expect, beforeAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { loadM2 } from "./harness.js";
import { frontEndStdlib } from "./lowered.js";
import { compileScrml } from "../../src/api.js";
import * as A from "../../src/markup-attr-allow-list.js";
import { _SCRML_EMIT_DOCUMENT_MEMBERS } from "../../src/dom-named-property-members.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "m.scrml", src }], "m.scrml");
const P = (body) => `<program>\n${body}\n</program>\n`;
const errs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => d.code);

// ---------------------------------------------------------------------------
// 1. static codes — each on its own fault, alone
// ---------------------------------------------------------------------------
const STATIC = [
  ["E-META-001 free host name", P(`^{ console.log("hi"); meta.emit("<p>x</p>"); }`), ["E-META-001"]],
  ["E-META-001 refused member", P(`^{ const F = emit.constructor; emit("<p>x</p>"); }`), ["E-META-001"]],
  ["E-META-001 computed key", P(`^{ const k = "constr" + "uctor"; const F = emit[k]; emit("<p>x</p>"); }`), ["E-META-001"]],
  ["E-META-001 bare cell name", P(`    let <count:int=0/>\n<div>^{ emit("<p>" + count + "</p>"); }</div>`), ["E-META-001"]],
  // the source const is ALSO refused by the analysis (`globalThis` is no scrml name); the block's own fault is E-META-001
  ["E-META-001 captured const holds a host name", P(`    const k = globalThis;\n<div>^{ emit("<p>" + k + "</p>"); }</div>`), ["E-META-001", "E-SCOPE-001"]],
  ["E-META-002 invalid token", P(`^{\n  meta.emit("start");\n  )\n}`), ["E-META-002"]],
  ["E-META-003 reflect(Unknown)", P(`^{ const x = reflect(NoSuchType); emit("<p>x</p>"); }`), ["E-META-003"]],
  ["E-META-005 emit + a runtime value", P(`^{ emit.raw("<p>hi</p>"); meta.set("x", 1); }`), ["E-META-005"]],
  ["E-META-005 emit + a cell", P(`    let <n:int=0/>\n<div>^{ emit("<p>" + @n + "</p>"); }</div>`), ["E-META-005"]],
  ["E-META-006 lift", P(`^{ lift(1); emit("<p>x</p>"); }`), ["E-META-006"]],
  ["E-META-007 ?{} in a runtime block", P(`^{ let r = ?{ \`SELECT 1\` }; meta.emit("" + r); }`), ["E-META-007"]],
  ["E-META-009 nested in compile-time", P(`    type Color:enum = { Red, Green }\n^{ reflect(Color); ^{ emit("<span>inner</span>"); } }`), ["E-META-009"]],
  ["E-META-010 compiler.*", P(`^{ emit("<p>" + compiler.version + "</p>"); }`), ["E-META-010"]],
];

describe("s481 — the static checks (§22.11, §22.12)", () => {
  for (const [name, src, codes] of STATIC) {
    test(name, () => {
      const r = run(src);
      expect([...new Set(errs(r))].sort()).toEqual(codes);
    });
  }
  test("a parse report naming a specific rule stands as its own code (D29), not E-META-002", () => {
    const c = errs(run(P(`^{ if (1 === 1) { emit("<p>x</p>"); } }`)));
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("E-META-002");
  });
  test("a compile-time match no arm of which matches runs nothing (as impl#1's evaluation)", () => {
    expect(html(P(`<div id="m">^{ const v = "z"; match v { "a" :> emit("<p>a</p>"), "b" :> emit("<p>b</p>"), } emit("<p>end</p>"); }</div>`))).toContain(`<div id="m"><p>end</p></div>`);
  });
  test("a block that fails a static check is not also refused as unsupported", () => {
    for (const [, src] of STATIC) expect(errs(run(src))).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("ruling S481-meta-four item 1: a literal reflect(T) beside a runtime value is a RUNTIME block, not E-META-005", () => {
    const r = run(P(`    type User:struct = { name: string }\n^{ const i = reflect(User); meta.emit("<p>" + i.name + "</p>"); }`));
    expect(errs(r)).not.toContain("E-META-005");
    // phase 2 is not built: the runtime block is refused by name
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("runtime `^{}`");
  });
});

// ---------------------------------------------------------------------------
// 2. evaluation and the splice
// ---------------------------------------------------------------------------
function html(src) {
  const r = run(src);
  expect(errs(r)).toEqual([]);
  const out = mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");
  expect(out.refused ?? []).toEqual([]);
  const m = /<template id="scrml:program"[^>]*>([\s\S]*?)<\/template>/.exec(out.html);
  return m ? m[1] : "";
}

describe("s481 — compile-time emit / emit.raw / reflect (§22.4)", () => {
  test("emit() output is spliced where the block stands", () => {
    expect(html(P(`<div id="m">^{ emit("<p id=\\"x\\">hi</p>"); }</div>`))).toContain(`<div id="m"><p id="x">hi</p></div>`);
  });
  test("a top-level block (a program body) splices too; whitespace between emitted nodes there is dropped", () => {
    expect(html(P(`^{ emit("<p>a</p>\\n  <p>b</p>"); }`))).toBe(`<p>a</p><p>b</p>`);
  });
  test("emit() normalizes \\\\n \\\\\" \\\\t \\\\\\\\; emit.raw() does not (§22.4.1)", () => {
    expect(html(P(`^{ emit("<pre>x\\\\ny</pre>"); }`))).toContain("x\ny");
    expect(html(P(`^{ emit.raw("<pre>x\\\\ny</pre>"); }`))).toContain("x\\ny");
  });
  test("reflect: impl#1's shape (ruling S481-meta-four item 3) — variants are names, fields {name, type}", () => {
    const h = html(P(`    type Color:enum = { Red, Green }\n    type User:struct = { name: string, age: number }\n<ul>^{ const c = reflect(Color); emit("<li>" + c.kind + ":" + c.name + ":" + c.variants.join("|") + "</li>"); const u = reflect(User); for (const f of u.fields) { emit("<li>" + f.name + "=" + f.type + "</li>"); } }</ul>`));
    expect(h).toContain("<li>enum:Color:Red|Green</li><li>name=string</li><li>age=number</li>");
  });
  test("a captured const and a captured function (§22.3)", () => {
    const h = html(P(`    type Sw:struct = { name: string, hex: string }\n    const palette: Sw[] = [{ name: "a", hex: "#1" }, { name: "b", hex: "#2" }];\n    function label(s: Sw) -> string { return s.name.toUpperCase(); }\n<div>^{ for (const c of palette) { emit(\`<b>\${label(c)}\${c.hex}</b>\`); } }</div>`));
    expect(h).toContain("<b>A#1</b><b>B#2</b>");
  });
  test("E-META-EVAL-001: a host failure the language defines (toFixed's RangeError)", () => {
    expect(errs(run(P(`^{ const n = 1; emit(n.toFixed(-1)); }`)))).toEqual(["E-META-EVAL-001"]);
  });
  test("E-META-EVAL-001: the step bound — a loop that never ends is refused, deterministically", () => {
    const r = run(P(`^{ let i = 0; for (;;) { i = i + 1; } emit("<p>x</p>"); }`));
    expect(errs(r)).toEqual(["E-META-EVAL-001"]);
    expect(r.diags[0].message).toContain("step bound");
  });
  test("E-META-EVAL-001: the depth bound — unbounded recursion is refused, not a crash", () => {
    const r = run(P(`^{ function f(n) { return f(n + 1); } emit("<p>" + f(0) + "</p>"); }`));
    expect(errs(r)).toEqual(["E-META-EVAL-001"]);
    expect(r.diags[0].message).toContain("depth bound");
  });
  test("E-META-EVAL-001: an unknown method is refused by name, never evaluated without it", () => {
    const r = run(P(`^{ emit("<p>" + "a".localeCompare("b") + "</p>"); }`));
    expect(errs(r)).toEqual(["E-META-EVAL-001"]);
    expect(r.diags[0].message).toContain("localeCompare");
  });
  test("E-META-EVAL-002: emitted output that does not parse", () => {
    expect(errs(run(P(`^{ emit("<div"); }`)))).toEqual(["E-META-EVAL-002"]);
  });
  test("E-META-EVAL-002: an attribute off the closed list; a single-quoted value (§5)", () => {
    expect(errs(run(P(`^{ emit("<p onclick=\\"x\\">hi</p>"); }`)))).toEqual(["E-META-EVAL-002"]);
    expect(errs(run(P(`^{ emit("<p class='x'>hi</p>"); }`)))).toEqual(["E-META-EVAL-002"]);
  });
  test("E-META-EVAL-002: emitting from a logic position (§22.4.1 \"Where emitted output lands\")", () => {
    expect(errs(run(P(`    let <n:int=0/>\n    function bump() { ^{ emit("x"); } @n = @n + 1; }\n<p>x</p>`)))).toEqual(["E-META-EVAL-002"]);
  });
  test("E-SCRIPT-001 on emitted output (held to every rule source is, §22.4.1)", () => {
    expect(errs(run(P(`^{ emit("<div><script>alert(1)</script><p>hi</p></div>"); }`)))).toEqual(["E-SCRIPT-001"]);
  });
  test("spliced nodes carry the block's span", () => {
    const src = P(`<div>\n  ^{ emit("<p>a</p>"); }\n</div>`);
    const r = run(src);
    const at = src.indexOf("^{");
    const end = src.indexOf("}", src.indexOf("emit(")) + 1;
    const prog = r.asts[0].items.find((it) => it.k.variant === "ProgramItem").k.data.p;
    const div = prog.items.map((it) => it.k).find((k) => k.variant === "MarkupItem" && k.data.n.k.variant === "Elem").data.n.k.data.e;
    const p = div.kids.find((n) => n.k.variant === "Elem");
    expect(p.span).toEqual({ start: at, end });
  });
  test("a block that emits nothing leaves nothing; no reserved `^` call survives the pass", () => {
    const r = run(P(`<div>^{ const x = 1; }</div>`));
    // no emit and no reflect: a runtime block (§22.5) — refused by name
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const r2 = run(P(`    type C:enum = { A }\n<div>^{ const c = reflect(C); }</div>`));
    expect(errs(r2)).toEqual([]);
    expect(JSON.stringify(r2.asts)).not.toContain('"name":"^"');
  });
});

// ---------------------------------------------------------------------------
// 2b. S481 r1 (review of #2045) — THE BUDGET (MED-1), CLOSURES (MED-2), LOW-1..5
// ---------------------------------------------------------------------------
const D = (body) => P(`<div id="m">^{ ${body} }</div>`);
const evalErr = (src) => {
  const r = run(src);
  expect(errs(r)).toEqual(["E-META-EVAL-001"]);
  return r.diags.find((d) => d.code === "E-META-EVAL-001").message;
};

describe("s481 r1 — the budget: size and work bounded by the step count (MED-1, SPEC §22.4)", () => {
  // each of these took the machine's memory or crashed before r1 (review MED-1: 24 GB RSS / RangeError)
  test("list doubling (`t = t.concat(t)`) stops at the list bound, before it is built", () => {
    expect(evalErr(D(`let t = [1]; for (let i = 0; i < 30; i = i + 1) { t = t.concat(t); } emit("<p>" + t.length + "</p>");`))).toContain("size bound (1048576 elements)");
  }, 60000);
  test("string doubling (`s = s + s`) stops at the size bound — E-META-EVAL-001, never a RangeError", () => {
    expect(evalErr(D(`let s = "xxxxxxxxxxxxxxxx"; for (let i = 0; i < 40; i = i + 1) { s = s + s; } emit("<p>" + s.length + "</p>");`))).toContain("size bound (16777216 characters)");
  }, 60000);
  test("padStart / repeat / padEnd past the size bound are refused before the string is built", () => {
    expect(evalErr(D(`emit("<p>" + "x".padStart(1000000000).length + "</p>");`))).toContain("1000000000 characters");
    expect(evalErr(D(`emit("<p>" + "x".repeat(2000000000).length + "</p>");`))).toContain("2000000000 characters");
    expect(evalErr(D(`emit("<p>" + "ab".padEnd(20000000, "cd").length + "</p>");`))).toContain("size bound");
  }, 60000);
  test("the arbitrary repeat cap is gone: repeat(200000) evaluates; a fractional count truncates, as JavaScript's", () => {
    expect(html(D(`emit("<p>" + "x".repeat(200000).length + "|" + "ab".repeat(2.5) + "|" + "x".padStart(5, "ab") + "</p>");`))).toContain("<p>200000|abab|ababx</p>");
    expect(evalErr(D(`emit("x".repeat(-1));`))).toContain("RangeError");
  }, 60000);
  test("a shared value counted with everything it holds: `t = [t, t]` and `{ l: r, r: r }` stop at the size bound", () => {
    expect(evalErr(D(`let t = [1]; for (let i = 0; i < 30; i = i + 1) { t = [t, t]; } emit("<p>" + ("" + t).length + "</p>");`))).toContain("counted with everything it holds");
    expect(evalErr(D(`let r = { a: 1 }; for (let i = 0; i < 40; i = i + 1) { r = { l: r, r: r }; } emit("<p>" + (r == r) + "</p>");`))).toContain("counted with everything it holds");
  }, 60000);
  test("nesting is bounded (a walk of a value never overflows the stack)", () => {
    expect(evalErr(D(`let t = [1]; for (let i = 0; i < 100000; i = i + 1) { t = [t]; } emit("<p>" + (t == t) + "</p>");`))).toContain("256 levels of nesting");
  }, 60000);
  test("a built-in's work is charged: a quadratic push loop and a re-read of a long string run out of steps", () => {
    // S482 r3: a push loop is linear (OWNED), so it runs out of steps; each `s + i` builds a 10 Mi
    // string — the allocation bound (never given back) counts them, and is reached before the step bound
    expect(evalErr(D(`let t = []; for (let i = 0; i < 200000; i = i + 1) { t.push(i); } emit("<p>" + t.length + "</p>");`))).toContain("step bound");
    expect(evalErr(D(`const s = "x".repeat(10000000); let n = 0; for (let i = 0; i < 100000; i = i + 1) { if ((s + i).charAt(0) == "x") n = n + 1; } emit("<p>" + n + "</p>");`))).toContain("allocation bound");
    expect(evalErr(D(`let t = [1]; for (let i = 0; i < 20; i = i + 1) { t = t.concat(t); } let n = 0; for (let i = 0; i < 100000; i = i + 1) { if (t.includes(2)) n = n + 1; } emit("<p>" + n + "</p>");`))).toContain("step bound");
  }, 60000);
  test("the bounds are deterministic: the same body fails with the same message", () => {
    const b = D(`let t = []; for (let i = 0; i < 200000; i = i + 1) { t.push(i); } emit("<p>" + t.length + "</p>");`);
    expect(evalErr(b)).toBe(evalErr(b));
  }, 60000);
  test("ordinary bodies stay well inside the budget (building 20000 items, a 30000-element map, sort, split)", () => {
    expect(html(D(`let xs = []; for (const i of 0..20000) { xs.push(i); } emit("<p>" + xs.map((i) => "<li>" + i + "</li>").join("").length + "</p>");`))).toContain("<p>268890</p>");
    expect(html(D(`let t = [1]; for (let i = 0; i < 15; i = i + 1) { t = t.concat(t); } const u = t.map((x, i) => i); emit("<p>" + u.length + "," + u.at(-1) + "</p>");`))).toContain("<p>32768,32767</p>");
    expect(html(D(`let s = ""; for (let i = 0; i < 2000; i = i + 1) { s = s + "<i>" + i + "</i>"; } emit("<p>" + s.length + "</p>");`))).toContain("<p>20890</p>");
    expect(html(D(`const p = "ab,".repeat(100000).split(","); let t = [3, 1, 2]; t.sort((a, b) => a - b); emit("<p>" + p.length + t.join("") + "</p>");`))).toContain("<p>100001123</p>");
  }, 60000);
});

describe("s481 r1 — closures fail closed (MED-2, INTERIM, g-boot-meta-closure-by-value-s481)", () => {
  // the review's probes (cases-st4/): each computed a silently wrong value before r1
  test("a write from inside a lambda to an outer binding is refused by name (forEach accumulation)", () => {
    const m = evalErr(D(`let n = 0; const xs = [1, 2, 3]; xs.forEach((x) => { n = n + x; }); emit("<p>sum=" + n + "</p>");`));
    expect(m).toContain("`n` is written from inside a function or lambda");
    expect(m).toContain("g-boot-meta-closure-by-value-s481");
  });
  test("a write from inside a local fn to an outer binding is refused by name", () => {
    expect(evalErr(D(`let n = 0; fn bump() { n = n + 1; } bump(); bump(); emit("<p>n=" + n + "</p>");`))).toContain("`n` is written from inside a function or lambda");
  });
  test("a write to a binding after a function that reads it was made is refused by name", () => {
    expect(evalErr(D(`let n = 1; const f = () => n; n = 5; emit("<p>f=" + f() + "</p>");`))).toContain("`n` is written after a function or lambda that reads it was made");
    expect(evalErr(D(`const a = { k: 1 }; const g = () => a.k; a.k = 2; emit("<p>" + g() + "</p>");`))).toContain("`a` is written after");
    expect(evalErr(D(`const xs = [1]; const f = () => xs.length; xs.push(2); emit("<p>" + f() + "</p>");`))).toContain("`xs` is written after");
    expect(evalErr(D(`let fs = []; for (let i = 0; i < 3; i = i + 1) { fs.push(() => i); } emit("<p>" + fs.length + "</p>");`))).toContain("`i` is written after");
  });
  test("a list edit from inside a callback is refused too", () => {
    expect(evalErr(D(`const xs = [1]; [1, 2].forEach((x) => { xs.push(x); }); emit("<p>" + xs.length + "</p>");`))).toContain("`xs` is written from inside");
  });
  test("what is exact by value still evaluates: a callback written in a list method, a helper reading a const, reduce", () => {
    expect(html(D(`const xs = [1, 2, 3]; let out = []; for (let i = 0; i < 3; i = i + 1) { out.push(xs.map((x) => x + i).join("-")); } emit("<p>" + out.join(",") + "</p>");`))).toContain("<p>1-2-3,2-3-4,3-4-5</p>");
    expect(html(D(`const base = 5; fn add(x) { return x + base; } let t = 0; t = add(1); t = add(t); emit("<p>" + t + "</p>");`))).toContain("<p>11</p>");
    expect(html(D(`const k = 10; let acc = 0; const ys = [1, 2, 3].map((x) => x * k); acc = acc + 1; emit("<p>" + ys.join(",") + acc + "</p>");`))).toContain("<p>10,20,301</p>");
    expect(html(D(`const sum = [1, 2, 3].reduce((a, b) => a + b, 0); emit("<p>sum=" + sum + "</p>");`))).toContain("<p>sum=6</p>");
  });
  test("value semantics (§66.10 item 1): a binding taken from another is a snapshot — the interpreter is right", () => {
    expect(html(D(`const a = [1]; const b = a; b.push(2); emit("<p>" + a.length + "</p>");`))).toContain("<p>1</p>");
    expect(html(D(`const a = { k: 1 }; const b = a; b.k = 2; emit("<p>" + a.k + "</p>");`))).toContain("<p>1</p>");
  });
});

describe("s481 r1 — one fault, one correct code (LOW-1..5)", () => {
  test("LOW-1: `^{}` as an attribute value that emits — one E-META-EVAL-002 naming the attribute, no internal error", () => {
    const r = run(`<program><div class=^{ emit("x"); }>y</div></program>\n`);
    expect(errs(r)).toEqual(["E-META-EVAL-002"]);
    expect(r.diags.find((d) => d.code === "E-META-EVAL-002").message).toContain("the value of the attribute `class=`");
  });
  test("LOW-2: a body parse fault reports one code (D29)", () => {
    expect(errs(run(D(`const = 3;`)))).toEqual(["E-PARSE-LOCAL"]);
    expect(errs(run(D(`emit("a" +);`)))).toEqual(["E-META-002"]);
  });
  test("LOW-3: a type name read as a value is E-META-001 in the static check (§22.12 item 1), as impl#1", () => {
    const T = (b) => P(`    type C:enum = { A, B }\n<div>^{ ${b} }</div>`);
    expect(errs(run(T(`const c = C; emit("<p>x</p>");`)))).toEqual(["E-META-001"]);
    expect(errs(run(T(`const c = C.B; emit("<p>x</p>");`)))).toEqual(["E-META-001"]);
    expect(html(T(`const c = reflect(C); emit("<p>" + c.name + "</p>");`))).toContain("<p>C</p>");
  });
  test("LOW-4: an emitted namespaced attribute is refused for what it is, not as a declaration", () => {
    const r = run(D(`emit("<svg><a xlink:href=\\"https://x.example/\\"><text>x</text></a></svg>");`));
    expect(errs(r)).toEqual(["E-META-EVAL-002"]);
    expect(r.diags[0].message).toContain("namespaced attribute");
    expect(r.diags[0].message).not.toContain("contains a declaration");
    // a text child: the reader fails the declaration body first — still named for the attribute
    const r2 = run(D(`emit("<svg><a xlink:href=\\"https://x.example/\\">x</a></svg>");`));
    expect(errs(r2)).toEqual(["E-META-EVAL-002"]);
    expect(r2.diags[0].message).toContain("namespaced attribute");
    expect(r2.diags[0].message).not.toContain("declaration body");
    // an unrelated parse failure keeps the reader's own reason; a `:` inside a quoted value is no attribute name
    const r3 = run(D(`emit("<p title=\\"a:b=c\\">x</q>");`));
    expect(errs(r3)).toEqual(["E-META-EVAL-002"]);
    expect(r3.diags[0].message).not.toContain("namespaced attribute");
  });
  test("§45.3: `==` between incompatible types is E-EQ-001 when it runs (the review: `1 == \"1\"` answered false)", () => {
    expect(errs(run(D(`emit("<p>" + (1 == "1") + "</p>");`)))).toEqual(["E-EQ-001"]);
    expect(html(D(`const r = { a: 1 }; emit("<p>" + (1 == 1) + (r.b == "x") + ("a" != "b") + "</p>");`))).toContain("<p>truefalsetrue</p>");
  });
  test("§14.10: `const c = .B` (no annotation) is E-VARIANT-AMBIGUOUS; an annotation, a comparison, a typed param / return resolve", () => {
    const T = (b) => P(`    type C:enum = { A, B }\n<div>^{ ${b} }</div>`);
    expect(errs(run(T(`const c = .B; match c { .A :> { emit("<p>a</p>"); } }`)))).toEqual(["E-VARIANT-AMBIGUOUS"]);
    expect(html(T(`const c: C = .B; match c { .A :> { emit("<p>a</p>"); }, .B :> { emit("<p>b</p>"); }, }`))).toContain("<p>b</p>");
    // §14.10's own examples: `state == .Small`, `applyMushroom(.Small)`, `return .Big` — never refused
    expect(html(T(`const c: C = .B; if (c == .B) { emit("<p>eq</p>"); }`))).toContain("<p>eq</p>");
    expect(html(T(`fn f(x: C) -> string { return "k"; } emit("<p>" + f(.A) + "</p>");`))).toContain("<p>k</p>");
    expect(html(T(`fn g() -> C { return .A; } const c: C = g(); match c { .A :> { emit("<p>a</p>"); }, .B :> { emit("<p>b</p>"); }, }`))).toContain("<p>a</p>");
  });
  test("sort is a stable merge sort: JavaScript's order on ties, and a 4096-element reverse list sorts within the step bound", () => {
    const body = `let t = [{k: 2, n: "a"}, {k: 1, n: "b"}, {k: 2, n: "c"}, {k: 1, n: "d"}, {k: 0, n: "e"}, {k: 2, n: "f"}]; let i = 0; let u = []; for (i < 40) { u = u.concat(t.map((r) => ({ k: (r.k * 7 + i) % 5, n: r.n + i }))); i = i + 1; } u.sort((a, b) => a.k - b.k); emit("<p>" + u.map((r) => r.n).join(",") + "</p>");`;
    const t = [{ k: 2, n: "a" }, { k: 1, n: "b" }, { k: 2, n: "c" }, { k: 1, n: "d" }, { k: 0, n: "e" }, { k: 2, n: "f" }];
    let u = [];
    for (let i = 0; i < 40; i++) u = u.concat(t.map((r) => ({ k: (r.k * 7 + i) % 5, n: r.n + i })));
    u.sort((a, b) => a.k - b.k);
    expect(html(D(body))).toContain("<p>" + u.map((r) => r.n).join(",") + "</p>");
    // 4096 descending (built by doubling): an insertion sort needs ~8.4 M comparator calls, past the step bound
    expect(html(D(`let t = [1]; let i = 0; for (i < 12) { t = t.map((x) => x + t.length).concat(t); i = i + 1; } t.sort((a, b) => a - b); emit("<p>" + t[0] + "," + t[4095] + "," + t.length + "</p>");`))).toContain("<p>1,4096,4096</p>");
    expect(html(D(`let t = ["b", "a", "c", "a"]; t.sort(); emit("<p>" + t.join("") + "</p>");`))).toContain("<p>aabc</p>");
  });
  test("LOW-5: a sort comparator that returns a boolean is refused by name (its order is engine-defined)", () => {
    expect(evalErr(D(`let xs = [3, 1, 2]; xs.sort((a, b) => a > b); emit("<p>" + xs.join(",") + "</p>");`))).toContain("comparator returned a boolean");
    expect(html(D(`let xs = [3, 1, 2]; xs.sort((a, b) => a - b); emit("<p>" + xs.join(",") + "</p>");`))).toContain("<p>1,2,3</p>");
  });
});

// ---------------------------------------------------------------------------
// 5. drift — emit-gate.scrml is impl#1's judge
// ---------------------------------------------------------------------------
describe("s481 — emit-gate.scrml is markup-attr-allow-list.js (drift)", () => {
  const g = () => mods["emit-gate"];
  test("the lists are impl#1's", () => {
    expect(g().emitGlobalAttrs()).toEqual([...A._SCRML_EMIT_GLOBAL_ATTRS]);
    expect(g().emitSvgAttrs()).toEqual([...A._SCRML_EMIT_SVG_ATTRS]);
    expect(g().emitMathmlAttrs()).toEqual([...A._SCRML_EMIT_MATHML_ATTRS]);
    expect(g().emitDocumentMembers()).toEqual([..._SCRML_EMIT_DOCUMENT_MEMBERS]);
    const h = A._SCRML_EMIT_HTML_ELEMENT_ATTRS;
    expect(g().emitHtmlAttrNames()).toEqual(Object.keys(h));
    for (const k of Object.keys(h)) expect(g().emitHtmlAttrElements(k)).toEqual(h[k]);
    expect(g().emitHtmlAttrElements("onclick")).toEqual([]);
  });
  const NS = [A._SCRML_EMIT_NS_HTML, A._SCRML_EMIT_NS_SVG, A._SCRML_EMIT_NS_MATHML, ""];
  const TAGS = ["p", "a", "img", "map", "form", "input", "meta", "label", "output", "object", "svg", "circle", "math", "mi", "x-y", "foreignobject", "annotation-xml"];
  const NAMES = ["id", "ID", "class", "onclick", "OnClick", "href", "xlink:href", "srcset", "for", "usemap", "name", "data-x", "data-", "data-scrml", "DATA-SCRML-X", "data-scrmlx", "aria-label", "aria-", "content", "http-equiv", "fill", "viewbox", "mathcolor", "style", "srcdoc", "is"];
  test("the name judge answers as impl#1's on every (ns, tag, name)", () => {
    for (const ns of NS) for (const tag of TAGS) for (const name of NAMES) {
      expect([ns, tag, name, g().emitAttrNameVerdict(ns, tag, name)]).toEqual([ns, tag, name, A._scrml_emit_attr_name_verdict(ns, tag, name)]);
    }
  });
  const VALUES = ["", "x", "_scrml_x", " __SCRML", "_scrmlx", "body", "querySelector", "cookie", "constructor", "ok"];
  test("the value and named-property judges answer as impl#1's (document half, compile time)", () => {
    const members = { document: _SCRML_EMIT_DOCUMENT_MEMBERS, form: null };
    for (const tag of TAGS) for (const name of ["id", "name", "class"]) for (const v of VALUES) {
      expect(g().emitAttrValueVerdict(name, v, tag)).toBe(A._scrml_emit_attr_value_verdict(name, v, tag));
      for (const hasName of [false, true]) for (const ns of NS) {
        expect(g().emitNamedValueVerdict(ns, tag, name, v, hasName)).toBe(A._scrml_emit_named_value_verdict(ns, tag, name, v, hasName, false, false, members));
      }
    }
  });
  test("the child-namespace rule is impl#1's", () => {
    for (const ns of NS.slice(0, 3)) for (const p of TAGS) for (const c of ["svg", "math", "p", "circle"]) {
      expect(g().emitChildNs(ns, p, c)).toBe(A._scrml_emit_child_ns(ns, p, c));
    }
  });
  test("the fold is ASCII-only", () => {
    for (const s of ["AbC", "İx", "DATA-SCRML", "ß"]) expect(g().emitFoldName(s)).toBe(A._scrml_emit_fold_name(s));
  });
});

// ---------------------------------------------------------------------------
// 6. differential — the interpreter and impl#1's realm render the same markup
// ---------------------------------------------------------------------------
// Each body runs inside `<div id="m">…</div>` under both compilers; the div's children are compared
// after a DOM parse + serialize (attribute spelling is the printers', not the evaluators').
const DECLS = `    type Color:enum = { Red, Green, Blue }\n    type Tok:struct = { id: number, value: string, expiry: number }\n    type Sw:struct = { name: string, hex: string }\n    const palette: Sw[] = [{ name: "slate", hex: "#64748b" }, { name: "rose", hex: "#f43f5e" }];\n    const sizes: number[] = [3, 1, 2];`;
const BODIES = [
  `for (const c of palette) { emit(\`<div class="swatch"><span>\${c.name}</span><code>\${c.hex}</code></div>\`); }`,
  `const info = reflect(Tok); const rows = info.fields.map(f => \`<tr><td>\${f.name}</td><td>\${f.type}</td></tr>\`).join(""); emit(\`<table><tbody>\${rows}</tbody></table>\`);`,
  `const info = reflect(Color); const names = info.variants.map(v => v.toLowerCase()); for (const name of names) { emit("<p>" + name + " of " + names.length + "</p>"); } emit.raw("<pre>" + names.join(", ") + "</pre>");`,
  `reflect(Color).variants.forEach((v, i) => { emit("<li data-i=\\"" + i + "\\">" + v.toUpperCase() + "</li>"); });`,
  `const xs = sizes.slice(); xs.sort(); emit("<p>" + xs.join("-") + "</p>"); emit("<p>" + sizes.filter(n => n > 1).length + "</p>");`,
  `const n = 2.5; emit("<p>" + n.toFixed(2) + " " + (n * 3) + " " + (10 / 4) + " " + (7 % 3) + "</p>");`,
  `function cell(s) { return "<td>" + s + "</td>"; } const row = [0, 1, 2].map(i => cell(i)).join(""); emit("<table><tbody><tr>" + row + "</tr></tbody></table>");`,
  `const c = reflect(Color); for (const v of c.variants) { if (v == "Green") { emit("<b>" + v + "</b>"); } else { emit("<i>" + v + "</i>"); } }`,
  `const label = "  Hello World  ".trim(); emit(\`<h1 title="\${label.toLowerCase()}">\${label.split(" ").join("_")}</h1>\`);`,
  `const m = { a: 1, b: "two" }; const m2 = { ...m, c: true }; emit("<p>" + m2.a + m2.b + m2.c + "</p>");`,
  `const total = sizes.reduce((a, s) => a + s, 0); emit("<p>" + total + " " + sizes.includes(2) + " " + sizes.indexOf(9) + "</p>");`,
  `const w = "abc"; emit("<p>" + w.padStart(5, "*") + w.at(-1) + w.slice(1) + w.repeat(2) + w.replace("b", "B") + "</p>");`,
];

function impl1Html(body) {
  const dir = mkdtempSync(join(tmpdir(), "s481-meta-diff-"));
  try {
    const src = `<program>\n${DECLS}\n<div id="m">^{ ${body} }</div>\n</program>\n`;
    writeFileSync(join(dir, "d.scrml"), src);
    const res = compileScrml({ inputFiles: [join(dir, "d.scrml")], outputDir: join(dir, "out"), write: true, log: () => {} });
    const errors = (res.errors ?? []).filter((e) => e && e.code !== undefined && !String(e.code).startsWith("W-") && !String(e.code).startsWith("I-"));
    if (errors.length > 0) return "ERR " + errors.map((e) => e.code).join(",");
    const f = readdirSync(join(dir, "out")).find((x) => x.endsWith(".html"));
    return readFileSync(join(dir, "out", f), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function inner(htmlText, viaTemplate) {
  const w = new Window();
  w.document.write(htmlText);
  let root = w.document;
  if (viaTemplate) {
    const t = w.document.querySelector('template[id="scrml:program"]');
    root = t ? t.content : null;
  }
  const el = root?.querySelector("#m");
  const out = el ? el.innerHTML.replace(/>\s+</g, "><").trim() : "NO #m";
  w.happyDOM.close();
  return out;
}

describe("s481 — differential: the interpreter renders what impl#1's realm renders", () => {
  for (const body of BODIES) {
    test(body.slice(0, 70), () => {
      const a = impl1Html(body);
      expect(a.startsWith("ERR")).toBe(false);
      const src = `<program>\n${DECLS}\n<div id="m">^{ ${body} }</div>\n</program>\n`;
      const r = run(src);
      expect(errs(r)).toEqual([]);
      const out = mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");
      expect(inner(out.html, true)).toBe(inner(a, false));
    }, 60000);
  }
});

// ---------------------------------------------------------------------------
// S482 r3 — the re-review of #2045 (~/.cache/scrml/review/s482-2045-rev/review.md)
// ---------------------------------------------------------------------------
const codeMsg = (src, code) => {
  const r = run(src);
  expect(errs(r)).toEqual([code]);
  return r.diags.find((d) => d.code === code).message;
};

describe("s482 r3 — HIGH-1: a compile's `^{}` blocks share one emit budget (one per compile since r4) (§22.4)", () => {
  test("characters: two blocks of 600000 characters each — the second is refused, naming the compile's budget", () => {
    const b = `<p>^{ emit("abcdef".repeat(100000)); }</p>`;
    expect(codeMsg(P(`<div>${b}${b}</div>`), "E-META-EVAL-001")).toContain("past the emit budget (1048576 characters");
    expect(errs(run(P(`<div>${b}</div>`)))).toEqual([]);
  }, 60000);
  test("tags: `<` characters are bounded before the markup reader reads them", () => {
    expect(evalErr(D(`emit("<i></i>".repeat(40000));`))).toContain("65536 `<` characters");
  }, 60000);
  test("nodes: the nodes read are bounded across the file's blocks", () => {
    const b = `^{ emit("<i>x</i>".repeat(10000)); }`;
    expect(errs(run(P(`<div>${b}</div>`)))).toEqual([]);
    expect(codeMsg(P(`<div>${b}${b}</div>`), "E-META-EVAL-001")).toContain("32768 nodes");
  }, 60000);
  test("emit() text past the budget is refused before it is normalized", () => {
    expect(evalErr(D(`emit("a\\\\b".repeat(1000000));`))).toContain("past the emit budget");
  }, 60000);
});

describe("s482 r3 — HIGH-2 / HIGH-3: record building and element creation are charged (§22.4)", () => {
  const keys = Array.from({ length: 1000 }, (_, i) => `k${i}: ${i}`).join(", ");
  test("a spread copies per field: a 1000-field spread in a loop runs out of steps, fast", () => {
    const t0 = performance.now();
    expect(evalErr(D(`const r = { ${keys} }; let n = 0; for (n < 50000) { const c = { ...r }; n = n + 1; } emit("<p>" + n + "</p>");`))).toContain("step bound");
    expect(performance.now() - t0).toBeLessThan(20000);
  }, 60000);
  test("a field write copies per field: a 1000-field record written in a loop runs out of steps", () => {
    expect(evalErr(D(`let r = { ${keys} }; let n = 0; for (n < 50000) { r.k1 = n; n = n + 1; } emit("<p>" + n + "</p>");`))).toContain("step bound");
  }, 60000);
  test("a spread and a field write give JavaScript's record (the last value wins)", () => {
    expect(html(D(`const a = { x: 1, y: 2 }; let b = { ...a, z: 3, x: 9 }; b.y = 7; b.w = 0; emit("<p>" + b.x + b.y + b.z + b.w + "</p>");`))).toContain("<p>9730</p>");
  }, 60000);
  test("split makes an element per part: repeated splits of a long string stop at the allocation bound", () => {
    expect(evalErr(D(`const s = "x".repeat(1000000); const a = s.split(""); const b = s.split(""); const c = s.split(""); emit("<p>" + a.length + "</p>");`))).toContain("allocation bound");
    expect(html(D(`const s = "ab,".repeat(1000); emit("<p>" + s.split(",").length + "</p>");`))).toContain("<p>1001</p>");
  }, 60000);
});

describe("s482 r3 — MED-1: only the callback a list method calls now is exempt from pins", () => {
  test("reduce's initial value is kept, so a later write is refused (cl_reduce, cl_reduce_rec, cl_find, the copied-through-map variant)", () => {
    expect(evalErr(D(`let n = 1; const g = [1].reduce((a, x) => a, () => n); n = 5; emit("<p>g=" + g() + "</p>");`))).toContain("`n` is written after a function or lambda that reads it was made");
    expect(evalErr(D(`let r = { k: 1 }; const g = [1].reduce((a, x) => a, () => r.k); r.k = 7; emit("<p>g=" + g() + "</p>");`))).toContain("`r` is written after");
    expect(evalErr(D(`let n = 1; const g = [1].map((x) => x).reduce((a, x) => a, (y) => n + y); n = 5; emit("<p>g=" + g(0) + "</p>");`))).toContain("`n` is written after");
    expect(evalErr(D(`let n = 1; const g = [1].reduce((a, x) => a, (z) => n); const h = [g].map((f) => f); n = 9; emit("<p>" + h[0](0) + "</p>");`))).toContain("`n` is written after");
  });
  test("with no later write the kept initial value is right; the callback itself still pins nothing", () => {
    expect(html(D(`let n = 1; const g = [1].reduce((a, x) => a, () => n); emit("<p>g=" + g() + "</p>");`))).toContain("<p>g=1</p>");
    expect(html(D(`let n = 1; const t = [1].map((x) => x + n); n = 5; emit("<p>" + t[0] + n + "</p>");`))).toContain("<p>25</p>");
  });
});

describe("s482 r3 — LOW-1..4: the source rules hold in a body", () => {
  const T = (b) => P(`    type C:enum = { A, B }\n<div>^{ ${b} }</div>`);
  test("LOW-1: an annotated local initialized with a variant the enum does not declare is E-TYPE-063 (§14.10)", () => {
    expect(codeMsg(T(`let x: C = .Zzz; emit("<p>" + x + "</p>");`), "E-TYPE-063")).toContain("not a variant of the enum `C`");
    expect(errs(run(T(`let x: C = .B; emit("<p>" + x + "</p>");`)))).toEqual([]);
  });
  test("LOW-2: `x == not` / `not != x` is E-EQ-002 (§45.2)", () => {
    expect(errs(run(D(`const x = 1; emit("<p>" + (x == not) + "</p>");`)))).toEqual(["E-EQ-002"]);
    expect(errs(run(D(`const x = 1; emit("<p>" + (not != x) + "</p>");`)))).toEqual(["E-EQ-002"]);
  });
  test("LOW-3: `==` judges element and field types deeply (§45.2 / §45.3)", () => {
    expect(errs(run(D(`emit("<p>" + ([1] == ["1"]) + "</p>");`)))).toEqual(["E-EQ-001"]);
    expect(errs(run(D(`emit("<p>" + ([[1]] == [["a"]]) + "</p>");`)))).toEqual(["E-EQ-001"]);
    expect(errs(run(D(`emit("<p>" + ({ a: 1 } == { a: "x" }) + "</p>");`)))).toEqual(["E-EQ-001"]);
    expect(errs(run(D(`const r = { f: () => 1 }; emit("<p>" + (r == r) + "</p>");`)))).toEqual(["E-EQ-003"]);
    expect(errs(run(D(`const t = [() => 1]; emit("<p>" + (t == t) + "</p>");`)))).toEqual(["E-EQ-003"]);
    expect(html(D(`emit("<p>" + ([1] == [2]) + ([] == ["a"]) + ({ a: [1] } == { a: [1] }) + "</p>");`))).toContain("<p>falsefalsetrue</p>");
  });
  test("LOW-4: a redeclaration in one block of a body is E-SCOPE-REDECLARE (§7.3.3); a nested block may shadow", () => {
    expect(errs(run(D(`let n = 1; const g = () => n; let n = 5; emit("<p>g=" + g() + "</p>");`)))).toEqual(["E-SCOPE-REDECLARE"]);
    expect(errs(run(D(`fn f(a) { let a = 2; return a; } emit("<p>" + f(1) + "</p>");`)))).toEqual(["E-SCOPE-REDECLARE"]);
    expect(html(D(`let n = 1; if (n == 1) { let n = 2; emit("<p>" + n + "</p>"); }`))).toContain("<p>2</p>");
  });
});

describe("s482 r3 — a push loop is linear (OWNED), and a push never changes a list another value holds", () => {
  test("40000 pushes with `.length` / `[i]` reads between them run inside the step and allocation bounds", () => {
    expect(html(D(`let t = []; let i = 0; for (i < 40000) { t.push(i); if (t.length > 0) i = i + 1; } emit("<p>" + t.length + "," + t[39999] + "</p>");`))).toContain("<p>40000,39999</p>");
  }, 60000);
  test("an alias taken before a push keeps the old list (§66.10 value semantics)", () => {
    expect(html(D(`let t = []; t.push(1); t.push(2); const a = t; t.push(3); t.push(4); const b = t; t.push(5); emit("<p>" + a.length + b.length + t.length + "," + a.join("") + "</p>");`))).toContain("<p>245,12</p>");
    expect(html(D(`let t = []; t.push(1); const k = [t]; t.push(2); emit("<p>" + k[0].length + t.length + "</p>");`))).toContain("<p>12</p>");
    expect(html(D(`fn add(l, x) { l.push(x); return l; } let t = []; t.push(1); const u = add(t, 2); t.push(3); emit("<p>" + t.join("") + "," + u.join("") + "</p>");`))).toContain("<p>13,12</p>");
    expect(html(D(`let t = []; t.push(1); for (const v of t) { t.push(v + 1); } emit("<p>" + t.join("") + "</p>");`))).toContain("<p>12</p>");
  });
});

// ---------------------------------------------------------------------------
// S482 r4 — the third re-review of #2045 (~/.cache/scrml/review/s482-2045-r3rev/review.md):
// close the cost CLASS (~/.cache/scrml/review/s482-boot-meta-r4/model.md)
// ---------------------------------------------------------------------------
const timed = (f) => { const t = performance.now(); const v = f(); return { v, secs: (performance.now() - t) / 1000 }; };

describe("s482 r4 — HIGH-1: OWNED is sound — a callback's reads end ownership; no list holds itself (§66.10)", () => {
  test("a list a callback returned is not changed by a later push (o_map_min / o_map_two / o_reduce)", () => {
    expect(html(D(`let a = []; a.push(1); const c = [0].map((x) => a); a.push(2); emit("<p>" + c[0].length + "</p>");`))).toContain("<p>1</p>");
    expect(html(D(`let a = []; a.push(1); const c = [0].map((x) => a); a.push(2); a.push(3); emit("<p>" + c[0].length + "/" + a.length + "</p>");`))).toContain("<p>1/3</p>");
    expect(html(D(`let a = []; a.push(1); a.push(2); const c = [0].reduce((acc, x) => a, 0); a.push(3); emit("<p>" + c.length + "</p>");`))).toContain("<p>2</p>");
    expect(html(D(`let a = []; a.push(1); a.push(2); const c = [0].find((x) => a.length > 0 ? a : []); const d = [0].map((x) => ({ v: a })); a.push(3); emit("<p>" + d[0].v.length + "</p>");`))).toContain("<p>2</p>");
  });
  test("a list cannot come to hold itself — no RangeError (o_cyc1 / o_cyc2 / o_cyc3)", () => {
    expect(html(D(`let a = []; a.push(1); a.push([0].map((x) => a)[0]); emit("<p>" + a[1].length + "</p>");`))).toContain("<p>1</p>");
    expect(html(D(`let a = []; a.push(1); a.push([0].map((x) => a)[0]); emit("<p>" + a + "</p>");`))).toContain("<p>1,1</p>");
    expect(html(D(`let a = []; a.push(1); a.push([0].map((x) => a)[0]); emit("<p>" + (a == a) + "</p>");`))).toContain("<p>true</p>");
  });
  test("push loops stay linear: 20000 pushes of a function's result, then a sort", () => {
    const r = timed(() => html(D(`fn sq(i) { return 20000 - i; } let t = []; let i = 0; for (i < 20000) { t.push(sq(i)); i = i + 1; } t.sort((a, b) => a - b); emit("<p>" + t[0] + "," + t[19999] + "</p>");`)));
    expect(r.v).toContain("<p>1,20000</p>");
    expect(r.secs).toBeLessThan(30);
  }, 60000);
  test("20000 pushes each beside a callback that reads another list", () => {
    expect(html(D(`let t = []; const k = [1, 2]; let i = 0; for (i < 20000) { t.push(k.map((x) => x + i)[0]); i = i + 1; } emit("<p>" + t.length + "," + t[19999] + "</p>");`))).toContain("<p>20000,20000</p>");
  }, 60000);
});

describe("s482 r4 — HIGH-2: a substring search is linear (KMP), and agrees with JavaScript", () => {
  test("100 worst-case indexOf calls on a 1 Mi-character string finish in seconds (idx100)", () => {
    const r = timed(() => html(D(`const x = "a".repeat(1048576); const p = "a".repeat(2048) + "b" + "a".repeat(2048); let n = 0; for (let i = 0; i < 100; i = i + 1) { n = n + x.indexOf(p); } emit("<p>" + n + "</p>");`)));
    expect(r.v).toContain("<p>-100</p>");
    expect(r.secs).toBeLessThan(30);
  }, 60000);
  test("indexOf / includes / split / replace / replaceAll give JavaScript's answers", () => {
    const cases = [["abcabcab", "cab"], ["aaaa", "aa"], ["a,b,,c,", ","], ["xyz", ""], ["", "q"], ["ababab", "abab"]];
    for (const [x, p] of cases) {
      const want = `${x.indexOf(p)}|${x.includes(p)}|${x.split(p).join("/")}|${x.replace(p, "-")}|${x.replaceAll(p, "-")}`;
      expect(html(D(`const x = ${JSON.stringify(x)}; const p = ${JSON.stringify(p)}; emit("<p>" + x.indexOf(p) + "|" + x.includes(p) + "|" + x.split(p).join("/") + "|" + x.replace(p, "-") + "|" + x.replaceAll(p, "-") + "</p>");`))).toContain(`<p>${want}</p>`);
    }
  }, 60000);
});

describe("s482 r4 — HIGH-3: ONE emit budget per compile, imported files included", () => {
  test("two files each emitting 600000 characters: the second is refused", () => {
    const blk = `<div>^{ emit("abcdef".repeat(100000)); }</div>`;
    const files = [
      { path: "app.scrml", src: `<program>\nimport { h1 } from './c1.scrml';\n${blk}\n</program>\n` },
      { path: "c1.scrml", src: `\${ export function h1() { return 1; } }\n${blk}\n` },
    ];
    const r = frontEndStdlib(mods, files, "app.scrml");
    const d = r.diags.find((x) => x.code === "E-META-EVAL-001");
    expect(d?.message ?? "").toContain("past the emit budget (1048576 characters");
  }, 60000);
});

describe("s482 r4 — HIGH-4 / MED-1: the fragment reader counts and stops (attributes, nesting, plain markup)", () => {
  test("an element of more than 1024 attributes is refused before the reader's quadratic range (uattrs150000)", () => {
    const r = timed(() => evalErr(D(`emit("<i" + " a".repeat(150000) + "></i>");`)));
    expect(r.v).toContain("more than 1024 attributes");
    expect(r.secs).toBeLessThan(10);
    expect(errs(run(D(`let e = "<i"; for (let i = 0; i < 1024; i = i + 1) { e = e + " data-a" + i; } emit(e + "></i>");`)))).toEqual([]);
  }, 60000);
  test("the attributes of all emitted elements are bounded (32768)", () => {
    expect(evalErr(D(`let e = "<i"; for (let i = 0; i < 1000; i = i + 1) { e = e + " data-a" + i; } emit((e + "></i>").repeat(40));`))).toContain("32768 attributes");
  }, 60000);
  test("nesting past 256 levels is refused — no RangeError (deep7000, pre/code pairs)", () => {
    expect(evalErr(D(`emit("<b>".repeat(7000) + "x" + "</b>".repeat(7000));`))).toContain("deeper than 256 levels");
    expect(evalErr(D(`emit("<pre>" + "<code>".repeat(20000) + "</code>".repeat(20000) + "</pre>");`))).toContain("deeper than 256 levels");
    expect(errs(run(D(`emit("<b>".repeat(200) + "x" + "</b>".repeat(200));`)))).toEqual([]);
  }, 60000);
  test("output that is not plain markup stops the reader before a logic / CSS reader runs (paren10000, interp3000)", () => {
    const one = (body) => { const r = run(D(body)); expect(errs(r)).toEqual(["E-META-EVAL-002"]); return r.diags.find((d) => d.code === "E-META-EVAL-002").message; };
    const r = timed(() => one(`emit("$" + "{" + "(".repeat(10000) + "1" + ")".repeat(10000) + "}");`));
    expect(r.v).toContain("logic block");
    expect(one(`emit("<b>$" + "{1}</b>");`)).toContain("logic block");
    expect(one(`emit(("<b>$" + "{").repeat(3000) + "1" + "}</b>".repeat(3000));`)).toContain("logic block");
    expect(one(`emit("<i a={" + "{".repeat(10000) + "}".repeat(10000) + "}></i>");`)).toContain("not quoted");
    expect(one(`emit("#" + "{ p { color: red; } }");`)).toContain("CSS");
    expect(r.secs).toBeLessThan(10);
  }, 60000);
  test("a namespaced attribute is still named for what it is (r1 LOW-4)", () => {
    const r = run(D(`emit("<a xlink:href=\\"x\\">x</a>");`));
    expect(errs(r)).toEqual(["E-META-EVAL-002"]);
    expect(r.diags.find((d) => d.code === "E-META-EVAL-002").message).toContain("namespaced attribute");
  });
  test("the gate reports at most 32 distinct faults, then one line", () => {
    const r = run(D(`let s = ""; for (let i = 0; i < 100; i = i + 1) { s = s + "<i bad" + i + "=\\"1\\"></i>"; } emit(s);`));
    const n = r.diags.filter((d) => d.code === "E-META-EVAL-002").length;
    expect(n).toBe(33);
  }, 60000);
});

describe("s482 r4 — LOW-1: a bare variant in every typed position is E-TYPE-063 (§14.10)", () => {
  const T = (body) => P(`    type C:enum = { A, B }\n<div id="m">^{ ${body} }</div>`);
  test("assignment, typed parameter, typed return, comparison", () => {
    expect(errs(run(T(`let x: C = .A; x = .Zzz; emit("<p>" + x + "</p>");`)))).toEqual(["E-TYPE-063"]);
    expect(errs(run(T(`fn f(c: C) { return c; } emit("<p>" + f(.Zzz) + "</p>");`)))).toEqual(["E-TYPE-063"]);
    expect(errs(run(T(`fn f() -> C { return .Zzz; } emit("<p>" + f() + "</p>");`)))).toEqual(["E-TYPE-063"]);
    expect(errs(run(T(`let x: C = .A; emit("<p>" + (x == .Zzz) + "</p>");`)))).toEqual(["E-TYPE-063"]);
  });
  test("the declared variants stay legal in every one of those positions", () => {
    expect(html(T(`let x: C = .A; x = .B; fn f(c: C) -> C { return .A; } emit("<p>" + x + f(.B) + (x == .B) + "</p>");`))).toContain("<p>BAtrue</p>");
  });
});

describe("s482 r4 — LOW-2: a binding scan is charged (frame size × reads)", () => {
  test("20000 bindings and a write loop stop at the step bound quickly (frame20000)", () => {
    let body = "";
    for (let i = 0; i < 20000; i++) body += `let v${i} = ${i}; `;
    body += `let k = 0; for (let i = 0; i < 1000000; i = i + 1) { v0 = v0 + 1; k = k + 1; } emit("<p>" + k + "</p>");`;
    const r = timed(() => evalErr(D(body)));
    expect(r.v).toContain("step bound");
    expect(r.secs).toBeLessThan(15);
  }, 120000);
});

// ---------------------------------------------------------------------------
// S482 r5 — the fourth re-review of #2045 (~/.cache/scrml/review/s482-2045-r4rev/review.md).
// Every expected value is the §66.10 value-semantics answer: what JavaScript gives if every list
// were copied on assignment (a name bound to `t` earlier keeps its own list).
// ---------------------------------------------------------------------------
describe("s482 r5 — HIGH-1: a changing method changes the binding's list as it stands AFTER its arguments (§66.10)", () => {
  test("pp_alias: t.push(t.push(2)) — u keeps [1]; t is [1,2,2] (JS with copy-on-assign: 1,3)", () => {
    expect(html(D(`let t = [1]; const u = t; t.push(t.push(2)); emit("<p>" + u.length + "," + t.length + "</p>");`))).toContain("<p>1,3</p>");
    expect(html(D(`let t = [1]; t.push(t.push(2)); emit("<p>" + t.length + "</p>");`))).toContain("<p>3</p>");
    expect(html(D(`let t = [1]; const u = t; t.push(t.push(t.push(2))); emit("<p>" + u + "|" + t + "</p>");`))).toContain("<p>1|1,2,2,3</p>");
  });
  test("pp_twoarg: t.push(t.push(2), t.push(3)) — u keeps [1]; t is [1,2,3,2,3]", () => {
    expect(html(D(`let t = [1]; const u = t; t.push(t.push(2), t.push(3)); emit("<p>" + u.length + "," + t + "</p>");`))).toContain("<p>1,1,2,3,2,3</p>");
  });
  test("pp_cycle: t.push(t, t.push(0)) — no RangeError; t is [1,0,[1],2] (the argument is t's value when read)", () => {
    expect(html(D(`let t = [1]; t.push(t, t.push(0)); emit("<p>" + t.length + "</p>"); emit("<p>" + t + "</p>");`))).toContain("<p>4</p><p>1,0,1,2</p>");
    expect(html(D(`let t = [1]; t.push(t, t.push(0)); emit("<p>" + (t == t) + "</p>");`))).toContain("<p>true</p>");
  });
  test("pp_pop: t.push(t.pop()) — t is [1,2] (JS: 2)", () => {
    expect(html(D(`let t = []; t.push(1); t.push(2); t.push(t.pop()); emit("<p>" + t.length + "</p>");`))).toContain("<p>2</p>");
  });
  test("pop / reverse / sort see their arguments' changes too (JS: 5,1 · 3,2,1|1,2 · 1,2,3)", () => {
    expect(html(D(`let t = [1]; const x = t.pop(t.push(5)); emit("<p>" + x + "," + t + "</p>");`))).toContain("<p>5,1</p>");
    expect(html(D(`let t = [1, 2]; const u = t; t.reverse(t.push(3)); emit("<p>" + t + "|" + u + "</p>");`))).toContain("<p>3,2,1|1,2</p>");
    expect(html(D(`let t = [3, 1]; t.sort(t.push(2) > 0 ? (a, b) => a - b : (a, b) => b - a); emit("<p>" + t + "</p>");`))).toContain("<p>1,2,3</p>");
  });
  test("an argument that ASSIGNS the receiver is refused (JS would change the list t named before it)", () => {
    expect(evalErr(D(`let t = [1]; t.push((t = [9, 9]).length); emit("<p>" + t + "</p>");`))).toContain("`t` is assigned inside the arguments");
    expect(evalErr(D(`let t = [1]; t.push(t = [9]); emit("<p>" + t.length + "</p>");`))).toContain("`t` is assigned inside the arguments");
    // an assignment of another binding, or of t outside the call, stands
    expect(html(D(`let t = [1]; let k = 0; t.push(k = 5); t = [2]; t.push(k); emit("<p>" + t + "</p>");`))).toContain("<p>2,5</p>");
  });
  test("a sort comparator that pushes, and splice, are refused by name (no engine-dependent answer)", () => {
    expect(evalErr(D(`let t = [3, 1, 2]; t.sort((a, b) => { t.push(0); return a - b; }); emit("<p>" + t + "</p>");`))).toContain("`t` is written from inside a function or lambda");
    expect(evalErr(D(`let t = [1, 2]; t.splice(0, 0, t.pop()); emit("<p>" + t + "</p>");`))).toContain("`.splice()` on a list is not a method");
  });
});

describe("s482 r5 — HIGH-2: one step total for every `^{}` block of a compile (§22.4)", () => {
  const blk = `<div>^{ const x = "ab".repeat(8388000); const p = "ab".repeat(4000) + "c"; let n = 0; for (let i = 0; i < 55; i = i + 1) { n = n + x.indexOf(p); } emit("<i>" + n + "</i>"); }</div>`;
  test("nblk40: forty blocks each just inside the per-block bound stop at the total, fast", () => {
    const r = timed(() => run(P(blk.repeat(40))));
    const ms = r.v.diags.filter((d) => d.code === "E-META-EVAL-001").map((d) => d.message);
    expect(ms.length).toBeGreaterThan(30);
    expect(ms.every((m) => m.includes("step total (4000000 steps"))).toBe(true);
    expect(r.secs).toBeLessThan(30);
  }, 120000);
  test("nfail30: thirty blocks each past the per-block bound — the first four fail on their own bound, the rest on the total", () => {
    const fail = blk.replace("i < 55", "i < 1000");
    const r = timed(() => run(P(fail.repeat(30))));
    const ms = r.v.diags.filter((d) => d.code === "E-META-EVAL-001").map((d) => d.message);
    expect(ms.length).toBe(30);
    expect(ms.filter((m) => m.includes("step bound (1000000 steps")).length).toBe(4);
    expect(ms.filter((m) => m.includes("step total (4000000 steps")).length).toBe(26);
    expect(r.secs).toBeLessThan(30);
  }, 120000);
  test("imported files draw on the same total (mfstep: twenty files of one block)", () => {
    const files = [];
    let imports = "";
    for (let i = 1; i <= 20; i++) {
      files.push({ path: `c${i}.scrml`, src: `\${ export function h${i}() { return 1; } }\n${blk}\n` });
      imports += `import { h${i} } from './c${i}.scrml';\n`;
    }
    files.push({ path: "app.scrml", src: `<program>\n${imports}<p>app</p>\n</program>\n` });
    const r = timed(() => frontEndStdlib(mods, files, "app.scrml"));
    const ms = r.v.diags.filter((d) => d.code === "E-META-EVAL-001").map((d) => d.message);
    expect(ms.filter((m) => m.includes("step total (4000000 steps")).length).toBeGreaterThan(0);
    expect(r.secs).toBeLessThan(30);
  }, 120000);
  test("a compile whose blocks stay under the total is untouched", () => {
    expect(errs(run(P(blk.repeat(2))))).toEqual([]);
  }, 60000);
});

describe("s482 r5 — MED-1: position and limit arguments are JavaScript's", () => {
  const cases = [
    [`"abab".indexOf("b", 2)`, 3], [`"abab".indexOf("b", -5)`, 1], [`"abab".indexOf("b", 99)`, -1], [`"abab".indexOf("", 99)`, 4],
    [`"abab".indexOf("b", 1.9)`, 1], [`"abab".indexOf("b", 0 / 0)`, 1], [`"abab".indexOf("b", "2")`, 3], [`"abab".indexOf("b", 1 / 0)`, -1],
    [`"abab".includes("a", 3)`, false], [`"abab".includes("a", -1)`, true], [`"abc".startsWith("b", 1)`, true], [`"abc".startsWith("c", 2.9)`, true],
    [`"abc".startsWith("", 9)`, true], [`"abc".endsWith("b", 2)`, true], [`"abc".endsWith("c", 99)`, true], [`"abc".endsWith("a", 1.5)`, true],
    [`"abc".endsWith("c", 0 / 0)`, false], [`"a,b,c".split(",", 2).length`, 2], [`"a-b-c".split("-", 0).length`, 0], [`"a-b-c".split("-", -1).length`, 3],
    [`"a-b-c".split("-", 2.9).length`, 2], [`"a-b-c".split("-", 4294967297).length`, 1], [`"abc".split("", 2).join("|")`, "a|b"],
    [`[1, 2, 1].indexOf(1, 1)`, 2], [`[1, 2, 1].indexOf(1, -1)`, 2], [`[1, 2, 1].indexOf(1, -9)`, 0], [`[1, 2, 1].indexOf(1, 9)`, -1],
    [`[1, 2, 3].includes(1, 1)`, false], [`[1, 2, 3].includes(3, -1)`, true], [`[1, 2, 3].includes(1, -1 / 0)`, true], [`[0 / 0].includes(0 / 0)`, true], [`[0 / 0].indexOf(0 / 0)`, -1],
    [`"abc".charAt(1.5)`, "b"], [`"abc".charAt(0 / 0)`, "a"], [`(1.5).toFixed(0 / 0)`, "2"], [`(1.25).toFixed(-0.5)`, "1"], [`"ab".repeat(-0.5)`, ""],
    [`(255).toString(16)`, "ff"], [`(-255).toString(36)`, "-73"], [`(255).toString(10.9)`, "255"],
    [`[1, 2, 3].map((x, i, a) => a.length).join("")`, "333"], [`[1, 2].reduce((acc, x, i, a) => acc + a.length, 0)`, 4],
    [`"xnullx".includes(not)`, true], [`[1, 2].join(not)`, "1null2"], [`"abc".slice(0, not)`, ""], [`"ab".padStart(5, not)`, "nulab"],
  ];
  test("each expression gives the value JavaScript gives (`not` is JavaScript's null)", () => {
    const body = cases.map(([e], i) => `emit("<p>${i}:" + (${e}) + "</p>");`).join(" ");
    const out = html(D(body));
    for (let i = 0; i < cases.length; i++) expect(out).toContain(`<p>${i}:${String(cases[i][1])}</p>`);
  }, 60000);
  test("a radix the evaluator cannot answer deterministically is refused, a bad one is JavaScript's RangeError", () => {
    expect(evalErr(D(`emit("<p>" + (0.5).toString(3) + "</p>");`))).toContain("with a radix other than 10");
    expect(evalErr(D(`emit("<p>" + (5).toString(1) + "</p>");`))).toContain("radix must be between 2 and 36");
    expect(evalErr(D(`let t = [2, 1]; t.sort(not); emit("<p>" + t + "</p>");`))).toContain("`.sort()` takes a function");
  });
});

describe("s482 r5 — LOW-1: a `const` arrow with annotated parameters is a typed position (§14.10)", () => {
  const T = (body) => P(`    type C:enum = { A, B }\n    type D:enum = { A, Zzz }\n<div id="m">^{ ${body} }</div>`);
  test("a call's bare variant the parameter's enum does not declare is E-TYPE-063", () => {
    expect(errs(run(T(`const f = (c: C) => c; emit("<p>" + f(.Zzz) + "</p>");`)))).toEqual(["E-TYPE-063"]);
    expect(errs(run(T(`const f = (c: C) => { return c; }; emit("<p>" + f(.Zzz) + "</p>");`)))).toEqual(["E-TYPE-063"]);
    expect(errs(run(T(`const f = (n: int, c: C) => c; emit("<p>" + f(1, .Zzz) + "</p>");`)))).toEqual(["E-TYPE-063"]);
  });
  test("a declared variant, and an untyped arrow, stay legal", () => {
    expect(html(T(`const f = (c: C) => c; const g = (c) => c; emit("<p>" + f(.B) + g(.Zzz) + "</p>");`))).toContain("<p>BZzz</p>");
  });
});
