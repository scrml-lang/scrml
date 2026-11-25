// retired-forms-lint-s482.test.js — the retired-forms gate (scripts/retired-forms-lint.ts) and its ledger
// (compiler/retired-forms.json). Ruling: scrml-support/user-voice-scrml.md S482 "⭐ RULED — every retirement /
// deprecation PR adds a retired-forms ledger row and migrates" — "hard forms fail CI outside labelled
// negatives; soft counts may not rise"; "the ledger also feeds bootstrap-conformance".

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rowLines, readFences, migrationHeading, scan, check, checkAgainstBase, lowered, markerAllows, posix, caseIsNegativeFor } from "../../../scripts/retired-forms-lint.ts";
import { analyze, view } from "../../../scripts/retired-forms-walk.ts";

const ROOT = resolve(import.meta.dir, "../../..");
const LEDGER = JSON.parse(readFileSync(join(ROOT, "compiler/retired-forms.json"), "utf8"));
const row = (id) => LEDGER.rows.find((r) => r.id === id);
const lines = (id, src) => rowLines(row(id), src, ROOT);
const hits = (id, src) => lines(id, src).length;
/** a body inside a function inside a logic block inside <program> (the #2101 review harness's wrap) */
const wrap = (body) => `<program>\n\${\n  fn probe(x) {\n${body.split("\n").map((l) => "    " + l).join("\n")}\n  }\n}\n</program>\n`;
const mk = (m) => `<program>\n<div>\n${m}\n</div>\n</program>\n`;

describe("the ledger", () => {
  test("every row has id, tier, old, new, codes, spec, ruling, enforcedBy; ids are unique; tiers are HARD / SOFT", () => {
    const ids = new Set();
    for (const r of LEDGER.rows) {
      for (const k of ["id", "tier", "old", "new", "spec", "ruling", "enforcedBy"]) expect(typeof r[k]).toBe("string");
      expect(Array.isArray(r.codes)).toBe(true);
      expect(["HARD", "SOFT"]).toContain(r.tier);
      expect(["bootstrap", "impl#1", "bootstrap+impl#1", "lint-only", "none"]).toContain(r.enforcedBy);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      if (r.detector === null) expect(typeof r.note).toBe("string");   // why it is not linted
    }
  });

  test("every regex detector compiles; every builtin is known", () => {
    for (const r of LEDGER.rows) {
      if (!r.detector) continue;
      if (r.detector.kind === "regex") expect(() => new RegExp(r.detector.pattern, r.detector.flags)).not.toThrow();
      else expect(["trailing-slash-closer", "angle-cell-read", "while-loop", "return-type-colon", "fn-type-arrow", "tape-js-method"]).toContain(r.detector.name);
    }
  });

  test("rows for every retired form the audit named (#2101 r1 MED-4)", () => {
    for (const id of ["slot-whitespace-form", "state-type-fn-overload", "render-by-tag"]) expect(row(id)).toBeTruthy();
    expect(row("render-by-tag").codes).toContain("E-DECL-FIELD-TAG-NEEDS-STAR");
  });

  test("bootstrap-conformance's LEGACY_MARKERS are the ledger's legacyMarker rows, in order", async () => {
    const { LEGACY_MARKERS, NO_FIX_RULE_MARKERS } = await import("../../../scripts/bootstrap-conformance.ts");
    const ms = LEDGER.rows.map((r) => r.legacyMarker).filter(Boolean).sort((a, b) => a.order - b.order);
    expect(LEGACY_MARKERS.map(([n, re]) => [n, re.source, re.flags])).toEqual(ms.map((m) => [m.name, new RegExp(m.pattern, m.flags).source, m.flags]));
    expect([...NO_FIX_RULE_MARKERS].sort()).toEqual(ms.filter((m) => m.noFixRule).map((m) => m.name).sort());
    expect(LEGACY_MARKERS.map(([n]) => n)).toEqual(["rhs-decl", "const-cell", "component-const", "engine-element", "no-program-root", "spaced-state-opener", "inline-typed-state-opener"]);
  });
});

describe("the source-order reader (#2101 r1 MED-2)", () => {
  const code = (src) => view(src, analyze(src, new Set(["p", "div", "code", "pre"])).kinds, false);
  test("comments, strings, foreign / SQL / CSS bodies are not code (lines kept)", () => {
    const src = `a // while (x)\n/* while (y) */ b\n<!-- while (z) -->\n"while (q)" _{ while (r) } ?{ while } #{ while }`;
    const s = code(src);
    expect(s.split("\n").length).toBe(4);
    expect(s).not.toContain("while");
  });
  test("a string holding `?{`, `/*` or one backtick does not hide what follows", () => {
    expect(hits("while-loop", wrap('let s = "?{"\nwhile (x) { }'))).toBe(1);
    expect(hits("while-loop", wrap('let g = "src/*.js"\nwhile (x) { }\nlet h = "*/"'))).toBe(1);
    expect(hits("while-loop", wrap('let q = "`"\nwhile (x) { }\nlet r = "`"'))).toBe(1);
  });
  test("a regular-expression literal is not code (`{4}`, `(?<n>` in it)", () => {
    expect(hits("closer-trailing-slash", wrap("const r = { d: /^\\d{4}(?<y>x)$/, z: /a/ }"))).toBe(0);
  });
  test("raw bodies `<pre>` / `<code>` (§4.17) and a closed HTML element's prose are not code (LOW-1)", () => {
    expect(hits("while-loop", "<program>\n<pre>${ while (x) { } }</pre>\n</program>")).toBe(0);
    expect(hits("while-loop", "<program>\n<p>Old form: <code>while (x) { }</code></p>\n</program>")).toBe(0);
    expect(hits("while-loop", "<program>\n<p>Please wait while (it loads) the page.</p>\n</program>")).toBe(0);
    expect(hits("throw-stmt", "<program>\n<p>Do not throw away your work.</p>\n</program>")).toBe(0);
  });
});

describe("closer-trailing-slash (Appendix E) — the bootstrap's candidate + hit rule", () => {
  test("hits: `content/`, quoted text, a space before `/`, a bare `/` line, `lift <li>x/;`, `{<div>x/}`, a value closer", () => {
    for (const m of ["<p>hello/", '<p>"Hello"/', "<p>'ok'/", "<p>`x`/", "<p>hello /", "<p>hello\n/"]) expect(hits("closer-trailing-slash", mk(m))).toBe(1);
    expect(hits("closer-trailing-slash", wrap("lift <li>${x}/;"))).toBe(1);
    expect(hits("closer-trailing-slash", "<program>\n${ let v = {<div>x/} }\n</program>")).toBe(1);
    expect(hits("closer-trailing-slash", "body={ (item) => <li>${item}/ }")).toBe(1);
    expect(hits("closer-trailing-slash", "match @s {\n  .Active => <p>Active/,\n}")).toBe(1);
    expect(hits("closer-trailing-slash", "<div>\n  /   // closes <div>\n")).toBe(1);
  });
  test("not: `</>`, `<br/>`, a URL / path word, a division (also wrapped), a legal `and/` in a closed element, a `<pre>` body", () => {
    for (const src of [`<p>x</>`, `<br/>`, mk("<p>see http://x.com/</p>"), mk("<p>a/b/</p>"), "<program>\n${ let q = a/\n b }\n</program>",
      "<program>\n<div>\n<p>either this or that and/\nmore</>\n</div>\n</program>", `<pre>pages/\n</pre>`]) {
      expect(lines("closer-trailing-slash", src)).toEqual([]);
    }
  });
});

describe("angle-cell-read (R3) — the bootstrap's operand-slot rule", () => {
  test("hits a legacy read in an operand slot or a region head, HTML-named or not (LOW-2: the bootstrap fires on `<data>`)", () => {
    for (const b of ["f(<n>)", "@y = 1 + <n>", "@y =\n  <n> + 1", "f(<data>)", "f(<title>)", "return <n>", "return <xs>.length;"]) expect(hits("angle-cell-read", wrap(b))).toBe(1);
    expect(hits("angle-cell-read", "<program>\n<p>${<count>}</p>\n</program>")).toBe(1);
  });
  test("not: a declaration, markup, a void element, a type, prose", () => {
    for (const b of ["<n> = 5", "let v = <b>x</b>;", "return <li> - item</li>;", "let p = <Point>;", "f(<br>)"]) expect(hits("angle-cell-read", wrap(b))).toBe(0);
    for (const src of ["<program>\n<p>(<mything>) is</p>\n</program>", "<program>\n<p>where x = <thing>.</p>\n</program>", "<program>\n<x>\n// c\n</x>\n<style>\n.a { }\n</style>\n</program>"]) {
      expect(hits("angle-cell-read", src)).toBe(0);
    }
  });
});

describe("whole-text detectors — every spelling from #2101 review MED-1 / MED-3", () => {
  const cases = [
    ["while-loop", "while\n(x) { }"], ["while-loop", "if (a) { b() } while (x) { }"],
    ["do-while-loop", "do\n{ x() } while (y)"], ["try-catch", "try\n{ a() } catch (e) { }"], ["switch-stmt", "switch\n(x) { }"],
    ["class-decl", "class Foo\n{ }"], ["class-decl", "const A = class { }"], ["class-decl", "class Foo<T> { }"],
    ["throw-stmt", "throw(err)"], ["throw-stmt", "throw\n  err"],
    ["async-await", "let v = await(x)"], ["async-await", "let h = async x => x"], ["async-await", "let v = await\n  x"], ["async-await", "async\nfn g() { }"],
    ["dynamic-import", 'let m = import\n("x")'], ["flush-call", "flush(\n)"], ["writable-grant", "let <xs:int[\n  writable\n]=[]/>"],
    ["on-dismount", "on\ndismount { }"], ["machine-element", "< machine name=M for=number>\n</>"],
    ["return-type-colon", "fn f(x: int = g()): int { }"], ["return-type-colon", "fn f(\n  x: int\n): int { }"],
    ["fn-type-arrow", "let f: (x: (int)) -> int = g"], ["fn-type-arrow", "let f: fn(int) -> int = g"],
    ["tape-rhs", "<xs> =\n  [1, 2]"],
    ["tape-js-method", "xs.push\n(1)"], ["tape-js-method", "xs.sort()"], ["tape-js-method", "xs.reverse()"], ["tape-js-method", "xs.fill(0)"], ["tape-js-method", "let y = xs.toSorted()"],
  ];
  for (const [id, body] of cases) test(`${id}: ${JSON.stringify(body)}`, () => expect(hits(id, wrap(body))).toBe(1));
  test("multi-line openers: `<input\\n fixed/>`, `<let\\n x=1/>`; rule='… -> …' single-quoted", () => {
    expect(hits("fixed-attr", "<program>\n<input\n  fixed/>\n</program>")).toBe(1);
    expect(hits("let-in-opener", "<program>\n<let\n  x=1/>\n</program>")).toBe(1);
    expect(hits("rule-event-arrow", "<program>\n<engine for=S>\n  <x rule='click -> .On'/>\n</>\n</program>")).toBe(1);
  });
  test("legal: a do-while tail is the do row's, `.pop()` / `.shift()`, a used `.sort()`, `(x: int) => int`, `-> T`, a `fn(x) { }` lambda", () => {
    expect(hits("while-loop", wrap("do { x() } while (y)"))).toBe(0);
    for (const b of ["xs.pop()", "xs.shift()", "let y = xs.sort()", "<p>${@ns.sort().join(\",\")}</p>"]) expect(hits("tape-js-method", wrap(b))).toBe(0);
    expect(hits("fn-type-arrow", wrap("let f: (x: int) => int = g"))).toBe(0);
    expect(hits("fn-type-arrow", wrap(".Required: fn(field) { return field },"))).toBe(0);
    expect(hits("return-type-colon", wrap("fn f(x: int) -> int { }"))).toBe(0);
  });
  test("a line holding two hits counts two (per HIT, HIGH-3)", () => {
    expect(hits("throw-stmt", wrap("throw a; throw b"))).toBe(2);
  });
  test("async-await does not double-count `for await`", () => {
    expect(lines("async-await", "for await (let x of s) {}")).toEqual([]);
    expect(lines("for-await", "for await (let x of s) {}")).toEqual([1]);
  });
});

describe("allow markers (#2101 r1 MED-5)", () => {
  const ok = (src) => markerAllows(src, src.split("\n").findIndex((l) => l.includes("while (x)")) + 1, "while-loop", ROOT);
  test("exact id, a reason, in a comment", () => {
    expect(ok("// retired-ok: while-loop — shows the retired form\nwhile (x) { }")).toBe(true);
    expect(ok("while (x) { }  /* retired-ok: while-loop — the contrast */")).toBe(true);
  });
  test("refused: no reason, inside a string, an id prefix", () => {
    expect(ok("// retired-ok: while-loop\nwhile (x) { }")).toBe(false);
    expect(ok('while (x) { let m = "retired-ok: while-loop — x" }')).toBe(false);
    expect(ok("// retired-ok: while-loop-not-this — x\nwhile (x) { }")).toBe(false);
  });
});

describe("markdown fences (#2101 r1 HIGH-1 / HIGH-2)", () => {
  test("```scrml AND untagged fences are read; another language is not; a migration region runs to the next heading of its level", () => {
    const md = "## 4.4 Closers\ntext\n```scrml\n<p>x/\n```\n```\nuntagged\n```\n```js\nawait x\n```\n## Appendix E: Migration\n### E.1 Sub\n```scrml\n<p>y/\n```\n## Appendix F\n```scrml\nz\n```\n";
    const fs = readFences(md);
    expect(fs.map((f) => [f.startLine, f.info, f.migration])).toEqual([[4, "scrml", false], [7, "", false], [15, "scrml", true], [19, "scrml", false]]);
    expect(migrationHeading("66.21 Legacy forms and migration")).toBe(true);
    expect(migrationHeading("63.4 Stages")).toBe(true);
    expect(migrationHeading("6.3 Cells")).toBe(false);
  });
  test("a fence is a negative only by `<!-- retired-neg: <id> — reason -->` directly above it", () => {
    const md = "<!-- retired-neg: while-loop — the contrast -->\n```scrml\nwhile (x) {}\n```\n<!-- retired-neg: while-loop -->\n```scrml\nwhile (y) {}\n```\n";
    const fs = readFences(md);
    expect([...fs[0].negIds]).toEqual(["while-loop"]);
    expect([...fs[1].negIds]).toEqual([]);        // no reason
  });
  test("a conformance case is a negative for a row only by its expected codes (and a generic row's caseIdPattern)", () => {
    expect(caseIsNegativeFor(row("while-loop"), { id: "x", codes: ["E-LOOP-WHILE-RETIRED"] })).toBe(true);
    expect(caseIsNegativeFor(row("while-loop"), { id: "x", codes: [] })).toBe(false);
    expect(caseIsNegativeFor(row("flush-call"), { id: "scope-undeclared-neg", codes: ["E-SCOPE-001"] })).toBe(false);
    expect(caseIsNegativeFor(row("flush-call"), { id: "flush-retired-neg", codes: ["E-SCOPE-001"] })).toBe(true);
  });
});

describe("paths are posix on every OS (#2101 r1 HIGH-4)", () => {
  test("posix() normalises backslashes", () => {
    expect(posix("conformance\\cases\\x\\neg\\case.scrml")).toBe("conformance/cases/x/neg/case.scrml");
  });
});

describe("scan + check over a scratch tree", () => {
  const mk2 = () => {
    const d = mkdtempSync(join(tmpdir(), "rfl-"));
    mkdirSync(join(d, "compiler"), { recursive: true });
    mkdirSync(join(d, "samples"), { recursive: true });
    mkdirSync(join(d, "conformance/cases/x/neg"), { recursive: true });
    mkdirSync(join(d, "conformance/cases/x/pos"), { recursive: true });
    return d;
  };
  const ledger = { rows: [row("while-loop"), row("rhs-decl")] };

  test("negatives by metadata / marker / region — never by a mention in prose or a comment", () => {
    const d = mk2();
    try {
      writeFileSync(join(d, "conformance/cases/x/neg/case.scrml"), "${ while (a) { } }\n");
      writeFileSync(join(d, "conformance/cases/x/neg/expected.json"), JSON.stringify({ id: "neg", expect: { codes: ["E-LOOP-WHILE-RETIRED"] } }));
      writeFileSync(join(d, "conformance/cases/x/pos/case.scrml"), "${ while (a) { } }\n");
      writeFileSync(join(d, "conformance/cases/x/pos/expected.json"), JSON.stringify({ id: "pos", expect: { codes: [] } }));
      writeFileSync(join(d, "samples/a.scrml"), "// retired-ok: while-loop — shows the retired form\n${ while (a) { } }\n${ while (b) { } }\n");
      writeFileSync(join(d, "compiler/SPEC.md"), [
        "## 49 Loops", "```scrml", "while (x) { }", "```",
        "Invalid (E-LOOP-WHILE-RETIRED):", "```scrml", "while (y) { }   // E-LOOP-WHILE-RETIRED", "```",
        "<!-- retired-neg: while-loop — the §49 contrast -->", "```scrml", "while (z) { }", "```",
        "```", "while (u) { }", "```",
        "## Appendix E: Migration", "```scrml", "while (w) { }", "```", ""].join("\n"));
      const hs = scan(d, ledger);
      expect(hs.map((h) => `${h.file}:${h.line}`).sort()).toEqual(["compiler/SPEC.md:14", "compiler/SPEC.md:3", "compiler/SPEC.md:7", "conformance/cases/x/pos/case.scrml:1", "samples/a.scrml:3"]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("counts must EQUAL the baseline: HARD outside pending fails, a rise fails, a drop fails until lowered", () => {
    const hs = [
      { row: "while-loop", file: "a.scrml", line: 1, text: "" },
      { row: "while-loop", file: "b.scrml", line: 1, text: "" },
      { row: "rhs-decl", file: "a.scrml", line: 2, text: "" },
      { row: "rhs-decl", file: "a.scrml", line: 3, text: "" },
    ];
    const base = { soft: { "rhs-decl": { "a.scrml": 1, "c.scrml": 4 } }, pending: { "while-loop": { since: "2026-11-24", why: "x", files: { "a.scrml": 1 } } } };
    const r = check(ledger, hs, base);
    expect(r.ok).toBe(false);
    expect(r.rows.find((x) => x.id === "while-loop").newHard).toEqual(["b.scrml (1)"]);
    const s = r.rows.find((x) => x.id === "rhs-decl");
    expect(s.rises).toEqual(["a.scrml: 1 -> 2"]);
    expect(s.drops).toEqual(["c.scrml: 4 -> 0"]);
    const lo = lowered(ledger, hs, base);
    expect(lo.soft["rhs-decl"]).toEqual({ "a.scrml": 1 });
    expect(lo.pending["while-loop"].files).toEqual({ "a.scrml": 1 });
    expect(lo.pending["while-loop"].since).toBe("2026-11-24");
    // a drop alone fails (no slack)
    const onlyDrop = check(ledger, [], { soft: {}, pending: { "while-loop": { since: "d", why: "x", files: { "a.scrml": 1 } } } });
    expect(onlyDrop.ok).toBe(false);
  });

  test("equal: ok", () => {
    const hs = [{ row: "while-loop", file: "a.scrml", line: 1, text: "" }];
    const base = { soft: {}, pending: { "while-loop": { since: "2026-11-24", why: "x", files: { "a.scrml": 1 } } } };
    expect(check(ledger, hs, base).ok).toBe(true);
  });

  test("--base-ref: a baseline cannot certify itself (#2101 r1 HIGH-3)", () => {
    const L0 = { rows: [row("while-loop"), row("rhs-decl"), row("machine-element")] };
    const B0 = { soft: { "rhs-decl": { "a.scrml": 2 } }, pending: { "while-loop": { since: "d", why: "x", files: { "a.scrml": 1 } } } };
    expect(checkAgainstBase(L0, B0, L0, B0)).toEqual([]);
    // R5: a new pending key; a raised count
    expect(checkAgainstBase(L0, { ...B0, pending: { "while-loop": { since: "d", why: "x", files: { "a.scrml": 1, "z.scrml": 1 } } } }, L0, B0).length).toBe(1);
    expect(checkAgainstBase(L0, { ...B0, soft: { "rhs-decl": { "a.scrml": 3 } } }, L0, B0).length).toBe(1);
    // R6: debt for a row with none in the base
    expect(checkAgainstBase(L0, { ...B0, pending: { ...B0.pending, "machine-element": { since: "d", why: "x", files: { "s.scrml": 1 } } } }, L0, B0).length).toBe(1);
    // a new HARD row brings no debt; a new SOFT row records its starting count
    const L1 = { rows: [...L0.rows, { ...row("class-decl") }, { ...row("const-cell") }] };
    expect(checkAgainstBase(L1, { ...B0, pending: { ...B0.pending, "class-decl": { since: "d", why: "x", files: { "s.scrml": 1 } } } }, L0, B0).length).toBe(1);
    expect(checkAgainstBase(L1, { ...B0, soft: { ...B0.soft, "const-cell": { "s.scrml": 5 } } }, L0, B0)).toEqual([]);
    // a removed row, a downgrade, a nulled detector
    expect(checkAgainstBase({ rows: [row("rhs-decl"), row("machine-element")] }, B0, L0, B0).length).toBe(1);
    expect(checkAgainstBase({ rows: [{ ...row("while-loop"), tier: "SOFT" }, row("rhs-decl"), row("machine-element")] }, B0, L0, B0).length).toBeGreaterThan(0);
    expect(checkAgainstBase({ rows: [{ ...row("while-loop"), detector: null }, row("rhs-decl"), row("machine-element")] }, B0, L0, B0).length).toBe(1);
  });
});
