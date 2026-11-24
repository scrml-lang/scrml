// closer-cleanup-s482.test.js — s482-closer-cleanup: the retired trailing-`/` closer.
//
// OWNER RULING (user-voice-scrml.md, "the `/}` "terse closer" is the retired trailing-slash
// closer; Appendix E governs (S482)"). Appendix E: "Any source file using bare `/` or trailing
// content`/` closers SHALL be rejected by the compiler with a diagnostic pointing to §4.4. The
// diagnostic SHALL include a hint: "Did you mean `</>`?""
//
// (1) The lexer's terse branch is gone: `{<div>oops/}` is not a markup value closed by `/}` —
//   it is E-SYNTAX-050 at the `/` (one diagnostic, the value never read as code). RED ON BASE
//   (base: one E-BOOTSTRAP-UNSUPPORTED "markup as an attribute value", i.e. accepted as a closer).
// (2) A trailing `content/` or bare `/` where an element is left unclosed is named E-SYNTAX-050
//   with the hint. RED ON BASE (base: only E-PARSE-CLOSER / E-PARSE-UNCLOSED). A `/` in text is
//   legal text (`a/b`, `and/or`, a URL, a `/` before a real closer) and is never refused.
// (3) #2087 review LOW-B — a real markup value with an unmatched `}` in its prose is one by-name
//   refusal over the whole value again (the legacy-read test is now the closer's NAME and where the
//   `}` stands). RED ON BASE.
// (4) #2087 review NIT-4 — skippedDecls is one pass (timing pin, generous bound).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;
const MV = "markup as an attribute value";
const mvDiag = (r) => errs(r).find((d) => d.message.includes(MV));
const s050 = (r) => errs(r).filter((d) => d.code === "E-SYNTAX-050");

describe("(1) no terse `/}` closer — a `{<tag>…/}` value is E-SYNTAX-050", () => {
  const EB = (fb) => `<program>\n    <errorBoundary fallback=${fb}>\n        <p>body</p>\n    </>\n</program>\n`;

  test("`fallback={<div class=\"x\">oops/}`: E-SYNTAX-050 at the `/`, with the hint", () => {
    const src = EB(`{<div class="x">oops/}`);
    const r = run(src);
    const ds = s050(r);
    expect(ds.length).toBe(1);
    expect(src.slice(ds[0].span.start, ds[0].span.end + 1)).toBe("/}");
    expect(ds[0].message).toContain("Did you mean `</>`?");
    expect(ds[0].message).toContain("§4.4");
    expect(ds[0].severity).toBe("Error");
    expect(mvDiag(r)).toBeUndefined();
    expect(codes(r).filter((c) => c.startsWith("E-PARSE") || c === "E-TYPE-045")).toEqual([]);
  });

  test("a component prop `header={<h1>Hi/}` likewise", () => {
    const src = P(`    <div header={<h1>Hi/}>x</div>`);
    const r = run(src);
    expect(s050(r).length).toBe(1);
    expect(codes(r).filter((c) => c.startsWith("E-PARSE"))).toEqual([]);
  });

  test("the `</>` twin is still one by-name markup-value refusal, no E-SYNTAX-050", () => {
    const r = run(EB(`{<div class="x">oops</>}`));
    expect(s050(r)).toEqual([]);
    expect(mvDiag(r).code).toBe("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("a `/` inside a nested element or a `//` comment is not the value's closer", () => {
    expect(s050(run(EB(`{<div><b>a/</b> b</>}`)))).toEqual([]);
    expect(s050(run(EB(`{<div>x // a/}\n        y</>}`)))).toEqual([]);
  });
});

describe("(2) a trailing `content/` or bare `/` left unclosed — E-SYNTAX-050 (§4.4, Appendix E)", () => {
  test("`<p>hello/` before the program's closer", () => {
    const src = P(`<p>hello/`);
    const r = run(src);
    const ds = s050(r);
    expect(ds.length).toBe(1);
    expect(src.slice(ds[0].span.start - 5, ds[0].span.end)).toBe("hello/");
    expect(ds[0].message).toContain("Did you mean `</>`?");
    expect(ds[0].message).toContain("`<p>`");
  });

  test("a bare `/` on its own line", () => {
    const src = P(`<div>\n<p>hi</p>\n/`);
    const ds = s050(run(src));
    expect(ds.length).toBe(1);
    expect(src.slice(ds[0].span.start - 1, ds[0].span.end + 1)).toBe("\n/\n");
    expect(ds[0].message).toContain("`<div>`");
  });

  test("each unclosed `<li>a/` of a list is named", () => {
    expect(s050(run(P(`<ul>\n<li>a/\n<li>b/\n</ul>`))).length).toBe(2);
  });

  test("`<p>a/` at the end of the input (block-015's shape)", () => {
    expect(s050(run(`<p>hello/`)).length).toBe(1);
  });

  for (const [what, body] of [
    ["`a/b` and `and/or`", `<p>see a/b and/or c</p>`],
    ["a URL ending in `/` at a line end", `<p>see http://a.com/\nmore</p>`],
    ["a `/` right before a real closer", `<li>defined /</>`],
    ["a `/` before a child element", `<p>a/<b>b</b></p>`],
    ["a `/` in a `${ }` slot", `<p>\${ 4.0 / 2.0 }</p>`],
    ["a self-closing `<br/>`", `<p>a<br/>b</p>`],
  ]) {
    test(`legal: ${what} — no diagnostic`, () => {
      expect(codes(run(P(body)))).toEqual([]);
    });
  }

  test("a `/` ending a `//` comment or inside `<!-- -->` in an unclosed element is not named", () => {
    const r = run(P(`<div>\n    // no Date.now() /\n    <!-- a /\n    b --> x\n<p>hi</p>`));
    expect(codes(r).length).toBeGreaterThan(0);
    expect(s050(r)).toEqual([]);
  });

  test("an unclosed element with no trailing `/` gets no E-SYNTAX-050", () => {
    const r = run(P(`<div>\n<p>hi</p>`));
    expect(codes(r).length).toBeGreaterThan(0);
    expect(s050(r)).toEqual([]);
  });
});

describe("(2b) #2095 review MED-1 — a retired closer inside an element a later closer left unclosed", () => {
  // In the retired reading the `/` closed the element whose text holds it, so the `</>` meant
  // for the element around it was spent on it, and THAT element ends unclosed: every retired
  // closer inside an unclosed element is named, however deep. RED ON 71c5c8409 (no 050).
  for (const [what, src, slashes] of [
    ["`<div>⏎<p>hello/⏎</>`", P(`<div>\n<p>hello/\n</>`), ["hello/"]],
    ["`<div>⏎<p>one/⏎<p>two</>⏎</>`", P(`<div>\n<p>one/\n<p>two</>\n</>`), ["one/"]],
    ["`<div if=true>⏎<p>yes/⏎</>`", P(`<div if=true>\n<p>yes/\n</>`), ["yes/"]],
    ["`lift <li>${item}/` with a newline and no `;` (SPEC's own §17.4 shape)",
      `<program>\n    <ul>\n        \${ for (item of @items) {\n            lift <li>\${item}/\n        } }\n    </>\n</>\n`, ["}/"]],
  ]) {
    test(`${what}: one E-SYNTAX-050 per retired closer, with the hint`, () => {
      const r = run(src);
      const ds = s050(r);
      expect(ds.map((d) => src.slice(d.span.start - (slashes[0].length - 1), d.span.end))).toEqual(slashes);
      for (const d of ds) expect(d.message).toContain("Did you mean `</>`?");
    });
  }

  test("NIT-2: several hits come out in source order", () => {
    const src = P(`<div>\n<p>a/\n<span>b/\n<i>c/\n</>`);
    const ds = s050(run(src));
    expect(ds.map((d) => src[d.span.start - 1])).toEqual(["a", "b", "c"]);
  });

  test("LOW-1: a URL's `/` in an element unclosed for another reason is not named", () => {
    const r = run(P(`<div>see http://x.com/\n<p>ok</p>`));
    expect(codes(r).length).toBeGreaterThan(0);
    expect(s050(r)).toEqual([]);
  });

  test("LOW-1: a `}` in a string does not end a `${ }` slot's skip", () => {
    const r = run(P(`<div>\${ "}" + a /\n b }\n<p>ok</p>`));
    expect(s050(r)).toEqual([]);
  });

  test("a closed sibling's `and/or/` inside an unclosed element is text (a path word)", () => {
    expect(s050(run(P(`<div>\n<p>and/or/\nthings</p>\n<span>x`)))).toEqual([]);
  });
});

describe("(2c) #2095 review LOW-2 — `/}` value shapes", () => {
  const EB = (fb) => `<program>\n    <errorBoundary fallback=${fb}>\n        <p>body</p>\n    </>\n</program>\n`;
  test("`err/⏎}` (space before the `}`) and an inner `<b>x/}` are each one E-SYNTAX-050, no parse cascade", () => {
    for (const fb of [`{<div>err/\n}`, `{<div><b>x/}</div>}`]) {
      const r = run(EB(fb));
      expect(s050(r).length).toBe(1);
      expect(codes(r).filter((c) => c.startsWith("E-PARSE"))).toEqual([]);
    }
  });

  test("a value that reads as a CLOSED element keeps its prose `/}` as text (one by-name refusal)", () => {
    for (const fb of [`{<p>a/}b</p>}`, `{<p>see https://x.com/}</p>}`]) {
      const src = P(`    <div header=${fb}>y</div>`);
      const r = run(src);
      expect(s050(r)).toEqual([]);
      const d = mvDiag(r);
      expect(src.slice(d.span.start, d.span.end)).toBe(fb);
      expect(codes(r).filter((c) => c.startsWith("E-PARSE"))).toEqual([]);
    }
  });
});

describe("(3) #2087 LOW-B — a `}` in a real markup value's prose is text", () => {
  for (const fb of [`{<p>a } b</p>}`, `{<div>oops }</div>}`]) {
    test(`\`header=${fb}\`: one refusal over the whole value`, () => {
      const src = P(`    <div header=${fb}>y</div>`);
      const r = run(src);
      const d = mvDiag(r);
      expect(src.slice(d.span.start, d.span.end)).toBe(fb);
      expect(codes(r).filter((c) => c.startsWith("E-PARSE"))).toEqual([]);
    });
  }

  test("in a slot too (b20)", () => {
    const src = P(`    \${ <div header={<b>a } b</b>}>y</div> }`);
    const d = mvDiag(run(src));
    expect(src.slice(d.span.start, d.span.end)).toBe(`{<b>a } b</b>}`);
  });

  test("a legacy read closed by a later `</>` in a slot keeps its block reading", () => {
    const r = run(`<program>\n    let <n:int=0/>\n    \${ <p if={<n>}>hi</> }\n</program>\n`);
    expect(mvDiag(r)).toBeUndefined();
    expect(codes(r)).not.toContain("E-PARSE-UNCLOSED");
  });
});

describe("(4) #2087 NIT-4 — skippedDecls is one pass", () => {
  test("a 2000-line refused block is read in well under the quadratic time", () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `        y${i} = f(a, b, c);`).join("\n");
    const t0 = performance.now();
    const r = run(P(`    type A = number extra {\n${lines}\n    }\n    <p>hi</p>`));
    const ms = performance.now() - t0;
    expect(codes(r).length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(20000);
  }, 90000); // base (quadratic) took ~26s on this shape (#2087 review NIT-4); head ~2s
});
