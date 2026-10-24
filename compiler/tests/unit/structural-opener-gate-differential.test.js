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
