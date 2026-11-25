// retired-forms-lint-s482.test.js — the retired-forms gate (scripts/retired-forms-lint.ts) and its ledger
// (compiler/retired-forms.json). Ruling: scrml-support/user-voice-scrml.md S482 "⭐ RULED — every retirement /
// deprecation PR adds a retired-forms ledger row and migrates" — "hard forms fail CI outside labelled
// negatives; soft counts may not rise"; "the ledger also feeds bootstrap-conformance".

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rowLines, readFences, regionErrors, readsInfo, scan, check, checkAgainstBase, baseRulesOnHead, lowered, markerAllows, posix, caseIsNegativeFor, mdFiles, isExcluded } from "../../../scripts/retired-forms-lint.ts";
import { Lexer } from "marked";
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

describe("#2101 r2 LOW-1 / LOW-2 — walker extents", () => {
  test("a brace inside a string of a `?{}` / `_{}` / `#{}` body does not extend it", () => {
    expect(hits("while-loop", wrap("let r = ?{ SELECT '{' FROM t }\nwhile (x) { }"))).toBe(1);
    expect(hits("while-loop", wrap('_{ const s = "{"; }\nwhile (x) { }'))).toBe(1);
    expect(hits("while-loop", "<program>\n#{ .a::before { content: \"{\"; } }\n${ while (x) { } }\n</program>")).toBe(1);
    expect(hits("while-loop", "<program>\n#{ .a { /* don't */ } }\n${ while (x) { } }\n</program>")).toBe(1);
  });
  test("an unclosed `<pre>` is raw only to the next closing tag", () => {
    expect(hits("machine-element", "<program>\n<p>see <pre> below</p>\n< machine name=M for=number>\n</>\n</program>")).toBe(1);
  });
  test("`}` then `/` is a division, not a regular expression", () => {
    expect(hits("while-loop", wrap("let a = {v: 1} / 2; while (x) { } let c = a / 3"))).toBe(1);
  });
  test("`1 < <n>` and `1 > <n>` are legacy reads", () => {
    expect(hits("angle-cell-read", wrap("return 1 < <n>;"))).toBe(1);
    expect(hits("angle-cell-read", wrap("return 1 > <n>;"))).toBe(1);
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
    const fs = readFences(md, [{ heading: "## Appendix E: Migration", children: "^(?![0-9])" }]);
    expect(fs.map((f) => [f.startLine, f.info, f.migration])).toEqual([[4, "scrml", false], [7, "", false], [15, "scrml", true], [19, "scrml", false]]);
  });
  test("#2101 r2 MED-1: a region opens only at its exact heading line, holds only its own sub-headings; text alone opens nothing", () => {
    const R = [{ heading: "## Appendix E: Migration", children: "^(?![0-9])" }, { heading: "## 63. Lifecycle", children: "^63\\.[0-9]" }];
    const md = ["## Appendix E: Migration", "### Background", "```scrml", "a", "```", "### 19.15 Misplaced", "```scrml", "b", "```",
      "## 4. Markup", "#### 63.99 Worked example", "```scrml", "c", "```", "#### Appendix E notes", "```scrml", "d", "```",
      "## 63. Lifecycle", "### 63.4 Fix", "```scrml", "e", "```", "### 4.1 Stray", "```scrml", "f", "```", ""].join("\n");
    expect(readFences(md, R).map((f) => [f.text, f.migration])).toEqual([["a", true], ["b", false], ["c", false], ["d", false], ["e", true], ["f", false]]);
    expect(regionErrors(md, R)).toEqual([]);
    expect(regionErrors(md + "\n## 63. Lifecycle\n", R).length).toBe(1);
    expect(regionErrors("# x\n", R).length).toBe(2);
    // the real SPEC: each ledger region heading stands exactly once
    expect(regionErrors(readFileSync(join(ROOT, "compiler/SPEC.md"), "utf8"), LEDGER.migrationRegions)).toEqual([]);
  });
  test("#2101 r2 MED-2: blockquoted fences and `scrml…` info strings are read", () => {
    const md = ["> ```scrml", "> while (x) { }", "> ```", ">   ```scrml", ">   b", ">   ```", "```scrml{.example}", "c", "```", "```scrml,ignore", "d", "```", "```js", "e", "```", ""].join("\n");
    expect(readFences(md).map((f) => [f.startLine, f.text])).toEqual([[2, "while (x) { }"], [5, "b"], [8, "c"], [11, "d"]]);
    expect(readsInfo("scrml{.neg}")).toBe(true);
    expect(readsInfo("javascript")).toBe(false);
    const q = readFences("> <!-- retired-neg: while-loop — the contrast -->\n> ```scrml\n> while (x) { }\n> ```\n");
    expect([...q[0].negIds]).toEqual(["while-loop"]);
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

describe("markdown is read as CommonMark reads it — marked's lexer (#2101 r3 F1 / F3)", () => {
  const W = "fn f() { while (x) { } }";
  const texts = (md) => readFences(md).map((f) => [f.startLine, f.text]);
  test("F1: a blockquoted fence ends where its blockquote ends — the fence after it is read", () => {
    const md = ["# P", "", "> ```scrml", "> fn a() { }", "", "Prose with `ticks.", "", "```scrml", W, "```", "", "More prose.", ""].join("\n");
    expect(texts(md)).toEqual([[4, "fn a() { }"], [9, W]]);
  });
  test("F1 (SPEC shape): a struck `> ~~```scrml` is not an opener; its `> ```` closer opens a fence that ends with the blockquote", () => {
    const md = ["> ~~```scrml", "> old", "> ```~~", "> *(superseded)*", "", "Prose `x`.", "", "```scrml", W, "```", ""].join("\n");
    expect(texts(md).at(-1)).toEqual([9, W]);
  });
  test("F3: a fence on a list-item marker line, in an ordered item, in a quoted item", () => {
    expect(texts(["- ```scrml", "  " + W, "  ```", ""].join("\n"))).toEqual([[2, W]]);
    expect(texts(["1. ```scrml", "   " + W, "   ```", ""].join("\n"))).toEqual([[2, W]]);
    expect(texts(["> - ```scrml", ">   " + W, ">   ```", ""].join("\n"))).toEqual([[2, W]]);
  });
  test("F3: a 4-space-indented ``` inside a fence is content, not its closer", () => {
    expect(texts(["```scrml", "fn a() { }", "    ```", W, "```", ""].join("\n"))).toEqual([[2, "fn a() { }\n    ```\n" + W]]);
  });
  test("`{.scrml}` is read; `{.js}` is not", () => {
    expect(readsInfo("{.scrml}")).toBe(true);
    expect(readsInfo("{.scrml .numberLines}")).toBe(true);
    expect(readsInfo("{.js}")).toBe(false);
    expect(readsInfo("{.scrmlx}")).toBe(false);
    expect(texts(["```{.scrml}", W, "```", ""].join("\n"))).toEqual([[2, W]]);
  });
  test("a retired-neg marker counts only at the fence's blockquote depth", () => {
    const neg = "<!-- retired-neg: while-loop — the contrast -->";
    expect([...readFences(["> " + neg, "```scrml", W, "```", ""].join("\n"))[0].negIds]).toEqual([]);
    expect([...readFences([neg, "> ```scrml", "> " + W, "> ```", ""].join("\n"))[0].negIds]).toEqual([]);
    expect([...readFences(["> " + neg, "> ```scrml", "> " + W, "> ```", ""].join("\n"))[0].negIds]).toEqual(["while-loop"]);
  });
  test("a migration region opens only at a top-level heading (not one in a blockquote)", () => {
    const R = [{ heading: "## 63. Lifecycle", children: "^63\\.[0-9]" }];
    expect(readFences(["> ## 63. Lifecycle", "```scrml", "a", "```", ""].join("\n"), R)[0].migration).toBe(false);
    expect(readFences(["## 63. Lifecycle", "```scrml", "a", "```", ""].join("\n"), R)[0].migration).toBe(true);
  });

  // PARITY: for every .md the gate reads, the lint's fence set equals marked's fenced code blocks (lang empty,
  // `scrml…` or `{.scrml}`) — and each fence's text stands on the source lines the lint maps it to.
  test("parity: the lint's fences == marked's code blocks over every read .md of the tree", () => {
    let files = 0;
    const diffs = [];
    for (const rel of mdFiles(ROOT, LEDGER.corpus)) {
      files++;
      const md = readFileSync(join(ROOT, rel), "utf8");
      const M = [];
      const walk = (toks) => { for (const t of toks) {
        if (t.type === "code" && t.codeBlockStyle !== "indented" && readsInfo(t.lang ?? "")) M.push(t.text);
        for (const k of ["tokens", "items"]) if (Array.isArray(t[k])) walk(t[k]);
      } };
      walk(Lexer.lex(md, { gfm: true }));
      const fs = readFences(md);
      const L = fs.map((f) => f.text);
      if (JSON.stringify(L) !== JSON.stringify(M)) { diffs.push(`${rel}: lint ${L.length}, marked ${M.length}`); continue; }
      const src = md.split("\n");
      for (const f of fs) {
        const body = f.text === "" ? [] : f.text.split("\n");
        body.forEach((b, i) => {
          const key = (l) => l.replace(/^[\s>]*/, "").trimEnd();
          if (key(src[f.startLine - 1 + i] ?? "") !== key(b)) diffs.push(`${rel}:${f.startLine + i}: mapped line differs`);
        });
      }
    }
    expect(files).toBeGreaterThan(40);
    expect(diffs).toEqual([]);
  });
});

describe("migration regions are bound to their position (#2101 r3 F4)", () => {
  const R = [{ heading: "## 63. Lifecycle", children: "^63\\.[0-9]", after: "## 62. ", before: "## 64. ", firstChild: "### 63.1 " }];
  const ok = ["## 62. Versions", "x", "## 63. Lifecycle", "### 63.1 Stages", "```scrml", "a", "```", "## 64. Tools", ""];
  test("in place: no error", () => { expect(regionErrors(ok.join("\n"), R)).toEqual([]); });
  test("moved before §62, or with its first child gone: an error", () => {
    const moved = ["## 4. Markup", "## 63. Lifecycle", "### 63.1 Stages", "## 5. X", "## 62. Versions", "## 64. Tools", ""];
    expect(regionErrors(moved.join("\n"), R).length).toBe(2);
    const noChild = ok.filter((l) => !l.startsWith("### 63.1"));
    expect(regionErrors(noChild.join("\n"), R).length).toBe(1);
  });
  test("the real SPEC: each ledger region stands in place; Appendix E is no longer a region", () => {
    expect(LEDGER.migrationRegions.some((r) => r.heading.startsWith("## Appendix E"))).toBe(false);
    expect(LEDGER.migrationRegions.every((r) => r.after && r.before)).toBe(true);
  });
});

describe("the file set is ledger data (#2101 r3 F5)", () => {
  test("the ledger carries the corpus; the script holds no exclusion list", () => {
    expect(Array.isArray(LEDGER.corpus.scrmlRoots)).toBe(true);
    expect(isExcluded(LEDGER.corpus, "docs/changes/x/progress.md")).toBe(true);
    expect(isExcluded(LEDGER.corpus, "docs/tutorial.md")).toBe(false);
    const src = readFileSync(join(ROOT, "scripts/retired-forms-lint.ts"), "utf8");
    expect(/export const (EXCLUDED|SKIP_DIRS|SCRML_ROOTS)\b/.test(src)).toBe(false);
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
  const ledger = { rows: [row("while-loop"), row("rhs-decl")], migrationRegions: [{ heading: "## Appendix E: Migration", children: "^(?![0-9])" }], corpus: LEDGER.corpus };

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

  test("#2101 r2 LOW-6: a negative allows one hit per expected occurrence; a helper the case never names allows none", () => {
    const d = mk2();
    try {
      const W = (wh) => "${ " + wh + " }\n";
      writeFileSync(join(d, "conformance/cases/x/neg/case.scrml"), W("while (a) { } while (b) { } while (c) { }"));
      writeFileSync(join(d, "conformance/cases/x/neg/expected.json"), JSON.stringify({ id: "neg", expect: { codes: ["E-LOOP-WHILE-RETIRED"] } }));
      writeFileSync(join(d, "conformance/cases/x/neg/helper.scrml"), W("while (h) { }"));
      writeFileSync(join(d, "conformance/cases/x/pos/case.scrml"), "import { z } from './lib.scrml'\n" + W("while (a) { } while (b) { }"));
      writeFileSync(join(d, "conformance/cases/x/pos/lib.scrml"), W("while (l) { }"));
      writeFileSync(join(d, "conformance/cases/x/pos/expected.json"), JSON.stringify({ id: "pos", expect: { codeCounts: { "E-LOOP-WHILE-RETIRED": 3 } } }));
      const hs = scan(d, ledger).map((h) => h.file).sort();
      // neg: 3 loops, 1 expected -> 2 counted; its unnamed helper -> 1 counted; pos: 3 expected over case.scrml (2) + the named lib (1) -> 0
      expect(hs).toEqual(["conformance/cases/x/neg/case.scrml", "conformance/cases/x/neg/case.scrml", "conformance/cases/x/neg/helper.scrml"]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("#2101 r2 MED-3: the base ledger's rules run over the head tree catch a widened `codes`, a never-matching detector, a new region", () => {
    const d = mk2();
    try {
      writeFileSync(join(d, "conformance/cases/x/neg/case.scrml"), "${ while (a) { } }\n");
      writeFileSync(join(d, "conformance/cases/x/neg/expected.json"), JSON.stringify({ id: "neg", expect: { codes: ["E-OTHER"] } }));
      writeFileSync(join(d, "compiler/SPEC.md"), "## 4. X\n```scrml\nwhile (s) { }\n```\n");
      const base = { rows: [row("while-loop")], migrationRegions: [], corpus: LEDGER.corpus };
      const B = { soft: {}, pending: { "while-loop": { since: "d", why: "x", files: { "conformance/cases/x/neg/case.scrml": 1, "compiler/SPEC.md": 1 } } } };
      expect(baseRulesOnHead(d, base, B)).toEqual([]);
      // head adds a while to the case and widens codes to make the case a "negative": the base rule still counts 2
      writeFileSync(join(d, "conformance/cases/x/neg/case.scrml"), "${ while (a) { } while (b) { } }\n");
      expect(baseRulesOnHead(d, base, B).length).toBe(1);
      const headWide = { rows: [{ ...row("while-loop"), codes: [...row("while-loop").codes, "E-OTHER"] }], corpus: LEDGER.corpus };
      expect(scan(d, headWide).filter((h) => h.file.startsWith("conformance")).length).toBe(1);   // head alone: 1 (budget 1)
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("#2101 r3 F5: a path the head newly excludes cannot hide a hit — the base corpus is run over the head", () => {
    const d = mk2();
    try {
      writeFileSync(join(d, "samples/a.scrml"), "${ while (a) { } }\n");
      const base = { rows: [row("while-loop")], migrationRegions: [], corpus: LEDGER.corpus };
      const B = { soft: {}, pending: {} };
      expect(baseRulesOnHead(d, base, B).length).toBe(1);
      const headLedger = { ...base, corpus: { ...LEDGER.corpus, excluded: { ...LEDGER.corpus.excluded, "samples/a.scrml": "hidden" } } };
      expect(scan(d, headLedger)).toEqual([]);                 // the head alone sees nothing
      expect(baseRulesOnHead(d, base, B, [], headLedger.corpus).length).toBe(1);   // the base corpus still sees it
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("#2101 r3 NIT: a case owns case.scrml and the files it imports in code — never a file named in a comment or a suffix match", () => {
    const d = mk2();
    try {
      const W = (wh) => "${ " + wh + " }\n";
      writeFileSync(join(d, "conformance/cases/x/neg/expected.json"), JSON.stringify({ id: "neg", description: "see helper.scrml and lib/types.scrml", expect: { codeCounts: { "E-LOOP-WHILE-RETIRED": 9 } } }));
      writeFileSync(join(d, "conformance/cases/x/neg/case.scrml"), "// helper.scrml\n${ import { t } from './types.scrml' }\n" + W("while (a) { }"));
      writeFileSync(join(d, "conformance/cases/x/neg/helper.scrml"), W("while (h) { }"));
      writeFileSync(join(d, "conformance/cases/x/neg/types.scrml"), W("while (t) { }"));
      mkdirSync(join(d, "conformance/cases/x/neg/lib"), { recursive: true });
      writeFileSync(join(d, "conformance/cases/x/neg/lib/types.scrml"), W("while (u) { }"));
      const hs = scan(d, ledger).map((h) => h.file).sort();
      expect(hs).toEqual(["conformance/cases/x/neg/helper.scrml", "conformance/cases/x/neg/lib/types.scrml"]);
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
