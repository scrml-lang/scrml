/**
 * structural-opener-gate-differential (S469 round 2, s469-structural-else-guard).
 *
 * THE PROPERTY: "this opener carries `if=` / `else` / `else-if=` / `show=`" has ONE answer, the
 * markup attribute reader's. The same attribute string on a `<p>` and on an `<engine>` /
 * `<match>` / `<each>` opener gives the same answer. Round 1 read the structural openers with a
 * word scan that disagreed with the markup tokenizer (`else=""`, `title="x"else`, a bare `if`
 * word, a quote inside a `${ // it's }` comment), and every disagreement compiled at exit 0 with
 * the gated branch visible. The structural openers now go through `tokenizeAttributes(…,
 * "markup")` + `parseAttributes` (ast-builder `readStructuralOpenerAttrs`), so this holds by
 * construction; the test keeps it held.
 *
 * Read off the TAB output only (no codegen): a `<p>`'s `attrs`, a structural node's
 * `ifCond` (or the bare-`if` E-CG-003), `chainAttr`, `showAttr`.
 *
 * Plus the `<engine … derived=…>` set: impl#1 requires `derived=` to be the LAST attribute —
 * the derived expression parser reports what it did not consume and any leftover is
 * E-ENGINE-DERIVED-NOT-LAST; and a `for=` / `initial=` written only inside the derived text is
 * never read as the opener's.
 */

import { describe, test, expect } from "bun:test";
import { splitBlocks } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { compileScrml } from "../../src/api.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HEAD = `type Phase:enum = { Idle, Active }\n<ph>: Phase = .Active\n<xs> = [1]\n<f> = true\n<g> = true\n<n> = false\n<m>: Phase = .Idle\n<s> = "x"\n`;

function tab(src) {
  const r = buildAST(splitBlocks("/t/app.scrml", HEAD + src));
  return { ast: r.ast, errors: r.errors ?? [] };
}

function findNode(root, pred) {
  const seen = new Set();
  let hit = null;
  const visit = (v) => {
    if (hit || !v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (pred(v)) { hit = v; return; }
    for (const k of Object.keys(v)) if (k !== "span" && k !== "parent") visit(v[k]);
  };
  visit(root);
  return hit;
}

const GATES = ["if", "else", "else-if", "show"];

/** The markup answer: which gate attributes `<p ATTRS>` carries. */
function markupGates(attrs) {
  const { ast } = tab(`<div id="out"><p ${attrs}>z</p></div>\n`);
  const p = findNode(ast.nodes, (n) => n.kind === "markup" && n.tag === "p");
  if (!p) return null;
  const names = new Set((p.attrs ?? []).map((a) => a.name));
  return Object.fromEntries(GATES.map((g) => [g, names.has(g)]));
}

const STRUCTURAL = {
  engine: { kind: "engine-decl", src: (a) => `<engine ${a} for=Phase initial=.Idle><Idle rule=.Active><p>i</p></><Active rule=.Idle><p>a</p></></>` },
  match: { kind: "match-block", src: (a) => `<match ${a} for=Phase on=@ph><Idle><p>i</p></><Active><p>a</p></></>` },
  each: { kind: "each-block", src: (a) => `<each ${a} in=@xs as x><p>r</p></each>` },
};

/** The structural answer, from the node the builder produced. */
function structuralGates(el, attrs) {
  const { ast, errors } = tab(`<div id="out">${STRUCTURAL[el].src(attrs)}</div>\n`);
  const node = findNode(ast.nodes, (n) => n.kind === STRUCTURAL[el].kind);
  if (!node) return null;
  const bareIf = errors.some((e) => e.code === "E-CG-003" && /the `if` on this `<\w+>` names no condition/.test(e.message));
  return {
    if: !!node.ifCond || bareIf,
    else: node.chainAttr?.name === "else",
    "else-if": node.chainAttr?.name === "else-if",
    show: node.showAttr?.name === "show",
  };
}

// The round-2 review's spellings, each a disagreement in round 1.
const REVIEW = [
  'else=""', 'else="true"', "else=true", "else=${true}", "else=(true)",
  "if else", "name=if else", "data-x=if else", 'title="if" else', "x=if else",
  'title="x"else', "data-y=(1)else",
  "effect=${ // it's\n @g = true\n} else",
  'effect=${ @g = /"/.test("a") } else',
  "else", "else-if=@g", "else-if=(@g)", 'else-if="@g"', "else-if=${@g}",
  "show=@n", 'show="@n"', "show=${@n}", "show=(@n)",
  "if=@n", "if=(@n)", "if",
  "ELSE", "Else", "ELSE-IF=@g", "SHOW=@n", "IF=@n",
  "else\n", "else /",
];

// Seeded random openers from fragments (never both `else` and `else-if=` — one chain role).
const FRAGS = [
  "else", 'else=""', 'else="x"', "else=${true}", "else=(1)", "else-if=@g", "else-if=(@g)",
  "show=@n", 'show="@n"', "show=${@n}", "if=@n", "if=(@n)", "if",
  'title="if"', 'title="else"', "data-x=if", "name=if", 'class="a b"', "data-y=(1)",
  "ELSE", "Show=@n", "aria-label=\"show=x\"", "data-z=${ 'else' }", "data-q=${ // else's\n 1 }",
  'data-r=${ /"/.test("a") }', "hidden",
];
function lcg(seed) { let x = seed >>> 0; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
const rand = lcg(469);
const RANDOM = [];
while (RANDOM.length < 60) {
  const n = 1 + Math.floor(rand() * 4);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(FRAGS[Math.floor(rand() * FRAGS.length)]);
  const s = parts.map((p, i) => (i > 0 && /["')}]$/.test(parts[i - 1]) && rand() < 0.4 ? p : (i > 0 ? " " : "") + p)).join("");
  const hasElse = /(^|[\s"')}])else(?![-\w=])|(^|[\s"')}])else=/.test(s);
  if (hasElse && /(^|[\s"')}])else-if=/.test(s)) continue;
  RANDOM.push(s);
}

describe("has if / else / else-if / show — the same answer on <p> and on every structural opener", () => {
  for (const [label, list] of [["review spelling", REVIEW], ["random", RANDOM]]) {
    for (const attrs of list) {
      const want = markupGates(attrs);
      for (const el of Object.keys(STRUCTURAL)) {
        test(`${label} <${el} ${JSON.stringify(attrs)}>`, () => {
          expect(want).not.toBeNull();
          expect(structuralGates(el, attrs)).toEqual(want);
        });
      }
    }
  }
});

describe("<engine derived=…>: derived= is the last attribute (E-ENGINE-DERIVED-NOT-LAST)", () => {
  const EXPRS = [
    ["ternary", "@n ? .Idle : .Active"],
    ["parenthesized", "(@n ? .Idle : .Active)"],
    ["${} block", "${ @n ? .Idle : .Active }"],
    ["match", "match @m {\n .Idle => .Active\n .Active => .Idle\n}"],
    ["bare cell", "@m"],
    ["call", "pick(@n)"],
  ];
  const TAILS = ["else", 'else=""', "else=${true}", "else-if=@g", "show=@n", "if=@n", "initial=.Idle", "var=x", "pinned", "effect=${ @g = true }", 'title="x"'];
  const engine = (opener) => `<div id="out"><engine ${opener}><Idle><p>i</p></><Active><p>a</p></></></div>\n`;
  for (const [en, expr] of EXPRS) {
    test(`${en} — with nothing after it, no E-ENGINE-DERIVED-NOT-LAST`, () => {
      const { errors } = tab(engine(`for=Phase derived=${expr}`));
      expect(errors.map((e) => e.code)).not.toContain("E-ENGINE-DERIVED-NOT-LAST");
    });
    for (const tail of TAILS) {
      test(`${en} followed by ${JSON.stringify(tail)} — refused, naming the leftover`, () => {
        const { errors } = tab(engine(`for=Phase derived=${expr} ${tail}`));
        const e = errors.find((x) => x.code === "E-ENGINE-DERIVED-NOT-LAST");
        expect(e).toBeDefined();
        expect(e.message).toContain("impl#1 requires `derived=` to be the LAST attribute");
        expect(e.message).toContain(tail.split(/[=\s]/)[0]);
      });
    }
  }

  test("an else before derived= is still the opener's (E-CTRL-001 at the chain check)", () => {
    const { ast } = tab(`<div id="out"><p if=@f>a</p><engine else for=Phase derived=@n ? .Idle : .Active><Idle><p>i</p></><Active><p>a</p></></></div>\n`);
    const eng = findNode(ast.nodes, (n) => n.kind === "engine-decl");
    expect(eng.chainAttr?.name).toBe("else");
  });

  test("a for= / initial= / var= written only inside the derived text is not read as the opener's", () => {
    const { ast } = tab(engine(`name=E for=Phase derived=(@s == "for=Other initial=.Active var=zz" ? .Idle : .Active)`));
    const eng = findNode(ast.nodes, (n) => n.kind === "engine-decl");
    expect(eng.governedType).toBe("Phase");
    expect(eng.initialVariant ?? null).toBeNull();
    expect(eng.varNameOverride ?? null).toBeNull();
  });

  test("the SPEC §51.0.J examples compile clean of the restriction", () => {
    for (const opener of [
      "for=Phase derived=match @m {\n .Idle => .Active\n _ => .Idle\n}",
      "for=Phase derived=@n ? .Active : .Idle",
      "for=Phase derived=pick(@n, @g)",
    ]) {
      const { errors } = tab(engine(opener));
      expect(errors.map((e) => e.code)).not.toContain("E-ENGINE-DERIVED-NOT-LAST");
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Round 3 (review of 412b77b8b). The reader's REFUSALS are part of its answer: an unquoted value with a
// bare operator (`data-x=a/ if=@n`) is an ATTR_OP_REJECT whose refused run reaches the tag close, so
// the gate after it is never tokenized — on a `<p>` the E-ATTR-UNQUOTED-OPERATOR fails the compile.
// Round 2 dropped that error on the structural openers and the swallowed gate vanished at exit 0. The
// same holds for a case-variant gate name (`IF=`, `Else`), refused everywhere (E-GATE-ATTR-CASE).
// ---------------------------------------------------------------------------------------------------

const READER_REFUSALS = new Set(["E-ATTR-UNQUOTED-OPERATOR", "E-ATTR-MULTI-STATEMENT", "E-GATE-ATTR-CASE"]);
const refusalCodes = (errors) => [...new Set(errors.map((e) => e.code).filter((c) => READER_REFUSALS.has(c)))].sort();

const OP_VALUES = ["data-z=a/", "title=a/b", "data-x=1+2", "data-x=a?b:c", "data-x=a&&b", "data-x=a||b",
  "data-x=a*b", "data-x=a==b", "data-x=a,", "data-x=a;", "data-path=admin/panel", "key=x.id+1"];
const GATE_TAILS = ["else", "else-if=@g", "if=@n", "show=@n"];
const CASE_VARIANTS = ["ELSE", "Else", "ELSE-IF=@g", "Else-If=@g", "IF=@n", "If=@n", "SHOW=@n", "Show=@n"];

const ROW = (c) => `<div id="out"><each in=@xs as y><div>${c}</div></each></div>\n`;
const TOP = (c) => `<div id="out">${c}</div>\n`;

describe("round 3 — the reader's refusals are the same on <p> and on every structural opener (TAB)", () => {
  const openers = [];
  for (const v of OP_VALUES) for (const g of GATE_TAILS) openers.push(`${v} ${g}`);
  for (const g of GATE_TAILS) openers.push(`if=@n data-path=admin/panel ${g === "if=@n" ? "" : g}`.trim());
  for (const c of CASE_VARIANTS) openers.push(c);
  for (const attrs of openers) {
    for (const [pn, pos] of [["top level", TOP], ["an <each> row", ROW]]) {
      const want = refusalCodes(tab(pos(`<p ${attrs}>z</p>`)).errors);
      for (const el of Object.keys(STRUCTURAL)) {
        // `<each key=…>` is the each's own expression slot (below), not a markup attribute.
        if (el === "each" && attrs.startsWith("key=")) continue;
        test(`<${el} ${attrs}> in ${pn} — refused like <p ${attrs}>`, () => {
          expect(want.length).toBeGreaterThan(0);
          expect(refusalCodes(tab(pos(STRUCTURAL[el].src(attrs))).errors)).toEqual(want);
        });
      }
    }
  }
});

function compileCodes(src) {
  const dir = mkdtempSync(join(tmpdir(), "scrml-gate-diff-"));
  try {
    const f = join(dir, "app.scrml");
    writeFileSync(f, HEAD + src);
    const r = compileScrml({ inputFiles: [f], write: false, outputDir: join(dir, "out"), log: () => {} });
    return (r.errors ?? []).filter((e) => (e.severity ?? "error") === "error").map((e) => e.code);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("round 3 — the same in a component body, and on the raw-text openers (full compile)", () => {
  const SAMPLE = ["data-z=a/ else", "data-x=a+b show=@n", "data-x=a/ if=@n", "data-x=a; else", "IF=@n", "Else"];
  for (const attrs of SAMPLE) {
    const want = refusalCodes(compileCodes(`const W = <div><p ${attrs}>z</p></div>\n<div id="out"><W/></div>\n`).map((code) => ({ code })));
    for (const el of ["match", "each"]) {
      test(`<${el} ${attrs}> in a component body — refused like <p>`, () => {
        expect(want.length).toBeGreaterThan(0);
        const got = refusalCodes(compileCodes(`const W = <div>${STRUCTURAL[el].src(attrs)}</div>\n<div id="out"><W/></div>\n`).map((code) => ({ code })));
        expect(got).toEqual(want);
      });
    }
    const RAW = {
      "an engine state-child": (a) => `<div id="out"><engine for=Phase initial=.Active><Idle rule=.Active><p>i</p></><Active rule=.Idle ${a}><p>a</p></></></div>\n`,
      "a <match> arm": (a) => `<div id="out"><match for=Phase on=@ph><Idle><p>i</p></><Active ${a}><p>a</p></></></div>\n`,
      "a <match> arm in a row": (a) => ROW(`<match for=Phase on=@ph><Idle><p>i</p></><Active ${a}><p>a</p></></>`),
      "an <onTimeout>": (a) => `<div id="out"><engine for=Phase initial=.Active><Idle rule=.Active><p>i</p></><Active rule=.Idle><onTimeout after=10ms to=.Idle ${a}/><p>a</p></></></div>\n`,
      "an <onIdle>": (a) => `<div id="out"><engine for=Phase initial=.Active><onIdle after=10ms to=.Idle ${a}/><Idle rule=.Active><p>i</p></><Active rule=.Idle><p>a</p></></></div>\n`,
    };
    for (const [rn, mk] of Object.entries(RAW)) {
      test(`${rn} with ${JSON.stringify(attrs)} — refused like <p>`, () => {
        const got = refusalCodes(compileCodes(mk(attrs)).map((code) => ({ code })));
        expect(got).toEqual(want);
      });
    }
  }
});

describe("round 3 (MED-2) — an if= before derived= is read as the opener's gate, not refused", () => {
  for (const [label, gate, sep] of [["if=@n", "if=@n", " "], ["if=(@n)", "if=(@n)", " "], ['if="@n"', 'if="@n"', " "], ["if=@n, newline before derived=", "if=@n", "\n  "]]) {
    test(label, () => {
      const { ast, errors } = tab(`<div id="out"><engine for=Phase ${gate}${sep}derived=@n ? .Active : .Idle><Idle><p>i</p></><Active><p>a</p></></></div>\n`);
      const eng = findNode(ast.nodes, (n) => n.kind === "engine-decl");
      expect(eng.ifCond).toBeDefined();
      expect(errors.map((e) => e.code)).not.toContain("E-CG-003");
      expect(errors.map((e) => e.code)).not.toContain("E-ENGINE-DERIVED-NOT-LAST");
    });
  }
  test("a comma sequence in derived= (`derived=@m, show=@n`) is refused", () => {
    const { errors } = tab(`<div id="out"><engine for=Phase derived=@m, show=@n><Idle><p>i</p></><Active><p>a</p></></></div>\n`);
    expect(errors.map((e) => e.code)).toContain("E-ENGINE-DERIVED-NOT-LAST");
  });
});

describe("round 3 — an <each> expression slot ends where the expression parser says; the gate after it is read", () => {
  const ROWSRC = (a) => `<div id="out"><each in=@xs as x ${a}><p>r</p></each></div>\n`;
  test("key=x.id+1 if=@n — the if= is the each's gate", () => {
    const { ast, errors } = tab(ROWSRC("key=x.id+1 if=@n"));
    const n = findNode(ast.nodes, (v) => v.kind === "each-block");
    expect(n.ifCond).toBeDefined();
    expect(refusalCodes(errors)).toEqual([]);
  });
  test("key=x.id+1 else — E-CTRL-001 (read, refused as an unconsumed chain attribute)", () => {
    const { errors } = tab(`<div id="out"><p if=@f>a</p>${STRUCTURAL.each.src("key=x.id+1 else")}</div>\n`);
    expect(errors.map((e) => e.code)).toContain("E-CTRL-001");
  });
  test("key=x.id+1 show=@n — E-GATE-UNSUPPORTED-HOST", () => {
    expect(tab(ROWSRC("key=x.id+1 show=@n")).errors.map((e) => e.code)).toContain("E-GATE-UNSUPPORTED-HOST");
  });
  test("of=@n + 1 as i if=@n — the if= is read", () => {
    const { ast } = tab(`<div id="out"><each of=@n + 1 as i if=@n><p>r</p></each></div>\n`);
    expect(findNode(ast.nodes, (v) => v.kind === "each-block").ifCond).toBeDefined();
  });
  test("a NON-slot operator value on <each> stays refused (data-x=a+b if=@n)", () => {
    expect(refusalCodes(tab(ROWSRC("data-x=a+b if=@n")).errors)).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
  });
});
