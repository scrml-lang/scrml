// retired-forms-lint-s482.test.js — the retired-forms gate (scripts/retired-forms-lint.ts) and its ledger
// (compiler/retired-forms.json). Ruling: scrml-support/user-voice-scrml.md S482 "⭐ RULED — every retirement /
// deprecation PR adds a retired-forms ledger row and migrates" — "hard forms fail CI outside labelled
// negatives; soft counts may not rise"; "the ledger also feeds bootstrap-conformance".

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripScrml, rowLines, scrmlFences, migrationSection, scan, check, lowered } from "../../../scripts/retired-forms-lint.ts";

const ROOT = resolve(import.meta.dir, "../../..");
const LEDGER = JSON.parse(readFileSync(join(ROOT, "compiler/retired-forms.json"), "utf8"));
const row = (id) => LEDGER.rows.find((r) => r.id === id);
const lines = (id, src) => rowLines(row(id), src, ROOT);

describe("the ledger", () => {
  test("every row has id, tier, old, new, codes, spec, ruling; ids are unique; tiers are HARD / SOFT", () => {
    const ids = new Set();
    for (const r of LEDGER.rows) {
      for (const k of ["id", "tier", "old", "new", "spec", "ruling"]) expect(typeof r[k]).toBe("string");
      expect(Array.isArray(r.codes)).toBe(true);
      expect(["HARD", "SOFT"]).toContain(r.tier);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      if (r.detector === null) expect(typeof r.note).toBe("string");   // why it is not linted
    }
  });

  test("every regex detector compiles; every builtin is known", () => {
    for (const r of LEDGER.rows) {
      if (!r.detector) continue;
      if (r.detector.kind === "regex") expect(() => new RegExp(r.detector.pattern, r.detector.flags)).not.toThrow();
      else expect(["trailing-slash-closer", "angle-cell-read"]).toContain(r.detector.name);
    }
  });

  test("bootstrap-conformance's LEGACY_MARKERS are the ledger's legacyMarker rows, in order", async () => {
    const { LEGACY_MARKERS, NO_FIX_RULE_MARKERS } = await import("../../../scripts/bootstrap-conformance.ts");
    const ms = LEDGER.rows.map((r) => r.legacyMarker).filter(Boolean).sort((a, b) => a.order - b.order);
    expect(LEGACY_MARKERS.map(([n, re]) => [n, re.source, re.flags])).toEqual(ms.map((m) => [m.name, new RegExp(m.pattern, m.flags).source, m.flags]));
    expect([...NO_FIX_RULE_MARKERS].sort()).toEqual(ms.filter((m) => m.noFixRule).map((m) => m.name).sort());
    // the seven markers the hard-coded list held (S478 + §66.21)
    expect(LEGACY_MARKERS.map(([n]) => n)).toEqual(["rhs-decl", "const-cell", "component-const", "engine-element", "no-program-root", "spaced-state-opener", "inline-typed-state-opener"]);
  });
});

describe("stripping", () => {
  test("comments, strings, foreign / SQL / CSS bodies become spaces (lines kept)", () => {
    const src = `a // while (x)\n/* while (y) */ b\n<!-- while (z) -->\n"while (q)" _{ while (r) } ?{ while } #{ while }`;
    const s = stripScrml(src);
    expect(s.split("\n").length).toBe(4);
    expect(s).not.toContain("while");
  });
  test("`http://x` is text, not a comment", () => {
    expect(stripScrml(`<a>http://x.com/</a>`)).toContain("http://x.com/");
  });
});

describe("closer-trailing-slash (Appendix E)", () => {
  test("hits: `content/`, a bare `/` line, `lift <li>x/;`, `{<div>x/}`, a `/` before a `// comment`", () => {
    expect(lines("closer-trailing-slash", `<p>hello/\n`)).toEqual([1]);
    expect(lines("closer-trailing-slash", `<div>\n  /\n`)).toEqual([2]);
    expect(lines("closer-trailing-slash", `lift <li>\${x}/;\n`)).toEqual([1]);
    expect(lines("closer-trailing-slash", `<b fallback={<div>oops/}>\n`)).toEqual([1]);
    expect(lines("closer-trailing-slash", `/   // closes <program>\n`)).toEqual([1]);
  });
  test("not: `</>`, `<br/>`, a URL / path word, `a / b` division, a `/;/` regex, a `//` comment, a `<pre>` body", () => {
    for (const src of [`<p>x</>`, `<br/>`, `<p>see http://x.com/`, `<p>a/b/`, `const q = a /\n b`, `x = /;/.test(s)`, `// note /`, `<pre>pages/\n</pre>`]) {
      expect(lines("closer-trailing-slash", src)).toEqual([]);
    }
  });
});

describe("angle-cell-read (R3)", () => {
  test("hits a legacy read `<n>` in a value position", () => {
    for (const src of ["const y = <n> + 1;", "f(<count>)", "if={<count>}", "return <xs>.length;"]) expect(lines("angle-cell-read", src)).toEqual([1]);
  });
  test("not: a declaration `<n> = 5`, markup `= <b>x</b>`, `<li> - item</li>`, a type `<Point>`", () => {
    for (const src of ["<n> = 5;", "const v = <b>x</b>;", "return <li> - item</li>;", "let p = <Point>;"]) expect(lines("angle-cell-read", src)).toEqual([]);
  });
});

describe("other rows", () => {
  test("while-loop counts `while (`, not a do-while tail or `.while(`", () => {
    expect(lines("while-loop", "while (x) { }")).toEqual([1]);
    expect(lines("while-loop", "do { } while (x)")).toEqual([]);
    expect(lines("while-loop", "obj.while(x)")).toEqual([]);
  });
  test("async-await does not double-count `for await`", () => {
    expect(lines("async-await", "for await (let x of s) {}")).toEqual([]);
    expect(lines("for-await", "for await (let x of s) {}")).toEqual([1]);
  });
  test("tape-rhs vs rhs-decl split a right-hand side by `= [`", () => {
    expect(lines("tape-rhs", "<items> = [1, 2]")).toEqual([1]);
    expect(lines("rhs-decl", "<items> = [1, 2]")).toEqual([]);
    expect(lines("rhs-decl", "<count> = 0")).toEqual([1]);
    expect(lines("tape-rhs", "<m> = [:]")).toEqual([]);
  });
});

describe("markdown fences", () => {
  test("```scrml fences with the 4 lines before and the heading", () => {
    const md = "## 4.4 Closers\ntext\n```scrml\n<p>x/\n```\n### Appendix E: Migration\n```scrml\n<p>y/\n```\n";
    const fs = scrmlFences(md);
    expect(fs.length).toBe(2);
    expect(fs[0].startLine).toBe(4);
    expect(fs[0].section).toBe("4.4 Closers");
    expect(migrationSection(fs[1].section)).toBe(true);
    expect(migrationSection("66.21 Legacy forms and migration")).toBe(true);
    expect(migrationSection("63.4 Stages")).toBe(true);
    expect(migrationSection("6.3 Cells")).toBe(false);
  });
});

describe("scan + check over a scratch tree", () => {
  const mk = () => {
    const d = mkdtempSync(join(tmpdir(), "rfl-"));
    mkdirSync(join(d, "compiler"), { recursive: true });
    mkdirSync(join(d, "samples"), { recursive: true });
    mkdirSync(join(d, "conformance/cases/x/neg"), { recursive: true });
    mkdirSync(join(d, "conformance/cases/x/pos"), { recursive: true });
    return d;
  };
  const ledger = { rows: [row("while-loop"), row("rhs-decl")] };

  test("a labelled negative (its expected.json names the row's code), an allow marker, a migration section — not counted", () => {
    const d = mk();
    try {
      writeFileSync(join(d, "conformance/cases/x/neg/case.scrml"), "${ while (a) { } }\n");
      writeFileSync(join(d, "conformance/cases/x/neg/expected.json"), JSON.stringify({ expect: { codes: ["E-LOOP-WHILE-RETIRED"] } }));
      writeFileSync(join(d, "conformance/cases/x/pos/case.scrml"), "${ while (a) { } }\n");
      writeFileSync(join(d, "conformance/cases/x/pos/expected.json"), JSON.stringify({ expect: { codes: [] } }));
      writeFileSync(join(d, "samples/a.scrml"), "// retired-ok: while-loop — shows the retired form\n${ while (a) { } }\n${ while (b) { } }\n");
      writeFileSync(join(d, "compiler/SPEC.md"), [
        "## 49 Loops", "```scrml", "while (x) { }", "```",
        "Invalid (E-LOOP-WHILE-RETIRED):", "```scrml", "while (y) { }", "```",
        "<!-- retired-ok: while-loop — the §49 contrast -->", "```scrml", "while (z) { }", "```",
        "## Appendix E: Migration", "```scrml", "while (w) { }", "```", ""].join("\n"));
      const hits = scan(d, ledger);
      expect(hits.map((h) => `${h.file}:${h.line}`).sort()).toEqual(["compiler/SPEC.md:3", "conformance/cases/x/pos/case.scrml:1", "samples/a.scrml:3"]);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test("HARD outside pending fails; pending holds; a SOFT rise fails; a drop is reported and lowered", () => {
    const hits = [
      { row: "while-loop", file: "a.scrml", line: 1, text: "" },
      { row: "while-loop", file: "b.scrml", line: 1, text: "" },
      { row: "rhs-decl", file: "a.scrml", line: 2, text: "" },
      { row: "rhs-decl", file: "a.scrml", line: 3, text: "" },
    ];
    const base = { soft: { "rhs-decl": { "a.scrml": 1, "c.scrml": 4 } }, pending: { "while-loop": { since: "2026-11-24", why: "x", files: { "a.scrml": 1 } } } };
    const r = check(ledger, hits, base);
    expect(r.ok).toBe(false);
    const w = r.rows.find((x) => x.id === "while-loop");
    expect(w.newHard).toEqual(["b.scrml (1)"]);
    const s = r.rows.find((x) => x.id === "rhs-decl");
    expect(s.rises).toEqual(["a.scrml: 1 -> 2"]);
    expect(s.drops).toEqual(["c.scrml: 4 -> 0"]);
    const lo = lowered(ledger, hits, base);
    expect(lo.soft["rhs-decl"]).toEqual({ "a.scrml": 1 });           // never raised to 2; c dropped
    expect(lo.pending["while-loop"].files).toEqual({ "a.scrml": 1 });
    expect(lo.pending["while-loop"].since).toBe("2026-11-24");
  });

  test("within the baseline: ok", () => {
    const hits = [{ row: "while-loop", file: "a.scrml", line: 1, text: "" }];
    const base = { soft: {}, pending: { "while-loop": { since: "2026-11-24", why: "x", files: { "a.scrml": 1 } } } };
    expect(check(ledger, hits, base).ok).toBe(true);
  });
});
