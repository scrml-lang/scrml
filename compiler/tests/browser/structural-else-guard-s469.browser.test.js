/**
 * structural-else-guard-s469 — a branch the author gated never renders anyway.
 *
 * Gaps: g-structural-element-if-chain-and-show-composition-nominal (HIGH, security),
 * g-if-on-structural-element-silently-ignored, g-if-reject-unenforced-on-structural-declaration-elements.
 *
 * Measured on b0cffc6a4 (happy-dom), every row below compiled at exit 0 and rendered the gated
 * content whatever the condition said:
 *   - `else` / `else-if=` on `<engine>` / `<match>` / `<each>`: the structural openers dropped the
 *     attribute at parse time and `collapseIfChains` chains `kind:"markup"` nodes only, so
 *     `<div if=@f>a</div><engine else …>` rendered BOTH branches (top level, nested, an `<each>` row,
 *     a component body, a lifted `<each>`);
 *   - `if=` / `show=` / `else` / `else-if=` on an `<each>`'s `<empty>` fallback: never read;
 *   - `if=` / `show=` on `<errorBoundary>`, `<render>`, a compound-state namespace wrapper (their
 *     emit-html dispatch returns before the §17.1 mount gate);
 *   - `show=` on `<engine>` / `<match>` / `<each>`;
 *   - `if=` / `else` / `else-if=` on `<onTimeout>` / `<onIdle>`, `else` on `<onTransition>`.
 * impl#1 does not lower a structural element as a chain member (frozen; the bootstrap owes the
 * §17.1.2.2 composition), so each is REFUSED: E-CTRL-001 / E-CTRL-002 for an unconsumed `else` /
 * `else-if=`, E-GATE-UNSUPPORTED-HOST for an `if=` / `show=` on a host that does not honour it.
 *
 * Not refused — executed: plain-markup chains, a component use-site / `<errorBoundary>` / `<render>`
 * AS a chain member, `if=` on `<engine>` / `<match>` / `<each>`, a `derived=if … then … else …`
 * engine value, the documented workarounds.
 */

import { describe, test, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { resolve } from "path";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";
import { captureInsideChunkScope } from "../helpers/chunk-scope.js";
import { tmpdir } from "os";

if (!globalThis.document) GlobalRegistrator.register();

const tmpRoot = resolve(tmpdir(), "scrml-structural-else-guard-s469");

function compile(source) {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const tmpDir = resolve(tmpRoot, `case-${uniq}`);
  const outDir = resolve(tmpDir, "out");
  mkdirSync(tmpDir, { recursive: true });
  const tmpInput = resolve(tmpDir, "app.scrml");
  writeFileSync(tmpInput, source);
  const result = compileScrml({ inputFiles: [tmpInput], write: true, outputDir: outDir, log: () => {} });
  const errors = (result.errors ?? []).filter(
    (e) => (e.severity ?? "error") === "error" && !/^[WI]-/.test(e.code ?? ""),
  );
  return { result, errors, outDir };
}

function compileAndMount(source) {
  const c = compile(source);
  if (c.errors.length > 0) return { errors: c.errors.map((e) => e.code) };
  const html = readFileSync(resolve(c.outDir, "app.html"), "utf8");
  const clientJs = readFileSync(resolve(c.outDir, "app.client.js"), "utf8");
  const runtimeJs = readFileSync(resolve(c.outDir, c.result.runtimeFilename ?? "scrml-runtime.js"), "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  const exec = new Function(
    "window",
    "document",
    `${runtimeJs}\n` + captureInsideChunkScope(
      clientJs,
      `globalThis.__sg_set = typeof _scrml_cs_reactive_set === "function" ? _scrml_cs_reactive_set : _scrml_reactive_set;\n`,
    ),
  );
  exec(window, document);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  return { errors: [] };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const set = async (name, v) => { globalThis.__sg_set(name, v); await flush(); };
const visible = (el) => {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (e.style && e.style.display === "none") return false;
  }
  return true;
};
const count = (sel) => [...document.querySelectorAll(sel)].filter(visible).length;

const HEAD = `type Phase:enum = { Idle, Active }
type Badge:enum = { Granted renders <p class="act">badge</p>, Denied renders <i></i> }
<ph>: Phase = .Active
<badge>: Badge = .Granted
<xs> = [1]
<none> = []
<f> = true
<g> = true
<signupForm>
    <userName> = <input type="text"/>
</>
`;

const ELEMENTS = {
  engine: (a) => `<engine ${a} for=Phase initial=.Active><Idle rule=.Active><p class="idle">i</p></><Active rule=.Idle><p class="act">act</p></></>`,
  match: (a) => `<match ${a} for=Phase on=@ph><Idle><p class="idle">i</p></><Active><p class="act">a</p></></>`,
  each: (a) => `<each ${a} in=@xs as x><p class="act">r</p></each>`,
};

const POSITIONS = {
  "in markup": (c) => `<div id="out">${c}</div>\n`,
  "nested deeper": (c) => `<div id="out"><section><p>${c}</p></section></div>\n`,
  "in an <each> row": (c) => `<div id="out"><each in=@xs as y><div>${c}</div></each></div>\n`,
  "in a component body": (c) => `const W = <div>${c}</div>\n<div id="out"><W/></div>\n`,
  "in lifted markup": (c) => `<div id="out">\${ for (y of @xs) { lift <div>${c}</div> } }</div>\n`,
};

// Positions where the element is refused by another rule whatever its attributes (§51.0.K /
// E-MATCH-BLOCK-IN-LIFT); the else/else-if refusal there adds nothing.
const OTHER_RULE = {
  engine: { "in an <each> row": "E-COMPONENT-ENGINE-SCOPE", "in a component body": "E-COMPONENT-ENGINE-SCOPE" },
  match: { "in lifted markup": "E-MATCH-BLOCK-IN-LIFT" },
  each: {},
};

function codes(src) {
  return compile(HEAD + src).errors.map((e) => e.code);
}

describe("else / else-if= on a structural element is refused (E-CTRL-001 / E-CTRL-002), never rendered", () => {
  test("THE REPRO — <div if=@f>a</div><engine else …>, located at the `else`, naming the fix", () => {
    const { errors } = compile(HEAD + `<div id="out"><div if=@f>a</div><engine else for=Phase initial=.Active><Idle rule=.Active><p>i</p></><Active rule=.Idle><p class="act">act</p></></></div>\n`);
    expect(errors.map((e) => e.code)).toEqual(["E-CTRL-001"]);
    const err = errors[0];
    expect(err.message).toContain("`else` on `<engine>`");
    expect(err.message).toContain("is not part of a lowered `if=` chain");
    expect(err.message).toContain("does not lower a structural element as a chain member");
    expect(err.message).toContain("its own `if=` with the negated condition");
    expect(err.span.line).toBe(12);
    expect(err.span.col).toBe(41);
  });

  for (const [en, el] of Object.entries(ELEMENTS)) {
    for (const [form, code] of [["else", "E-CTRL-001"], ["else-if=@g", "E-CTRL-002"]]) {
      for (const [pn, pos] of Object.entries(POSITIONS)) {
        const other = OTHER_RULE[en][pn];
        test(`<${en} ${form}> after an if= sibling, ${pn} — ${other ?? code}`, () => {
          const c = codes(pos(`<div if=@f>a</div>${el(form)}`));
          if (other) expect(c).toContain(other);
          else expect(c).toContain(code);
        });
      }
    }
  }

  test("an orphan <match else> (no if= sibling) is refused the same way", () => {
    expect(codes(`<div id="out">${ELEMENTS.match("else")}</div>\n`)).toEqual(["E-CTRL-001"]);
  });

  test("a structural element does not HEAD a chain either — <each if=@f> then <p else> stays E-CTRL-001", () => {
    expect(codes(`<div id="out"><each if=@f in=@xs as x><i>r</i></each><p else>z</p></div>\n`)).toEqual(["E-CTRL-001"]);
  });

  test("in a component body the refusal is reported as itself, at the `else` (not E-COMPONENT-021)", () => {
    const { errors } = compile(HEAD + `const W = <div><div if=@f>a</div>${ELEMENTS.match("else")}</div>\n<div id="out"><W/></div>\n`);
    expect(errors.map((e) => e.code)).toEqual(["E-CTRL-001"]);
    expect(errors[0].message).toContain("(in component `W`)");
    expect(errors[0].span.line).toBe(12);
  });

  test("a structural element inside a chain BRANCH carrying its own else is refused", () => {
    expect(codes(`<div id="out"><div if=@f><span if=@g>a</span>${ELEMENTS.each("else")}</div><div else>b</div></div>\n`)).toEqual(["E-CTRL-001"]);
  });
});

describe("the <each>'s <empty> fallback takes no chain attribute and no gate", () => {
  for (const [attr, code] of [["else", "E-CTRL-001"], ["else-if=@g", "E-CTRL-002"], ["if=@f", "E-GATE-UNSUPPORTED-HOST"], ["show=@f", "E-GATE-UNSUPPORTED-HOST"]]) {
    for (const [pn, pos] of Object.entries(POSITIONS)) {
      test(`<empty ${attr}>, ${pn} — ${code}`, () => {
        expect(codes(pos(`<each in=@none as x><i>x</i><empty ${attr}><p class="act">e</p></empty></each>`))).toContain(code);
      });
    }
  }
});

describe("if= / show= on a host that does not honour it is refused (E-GATE-UNSUPPORTED-HOST)", () => {
  const HOSTS = {
    errorBoundary: (a) => `<errorBoundary ${a}><p class="act">eb</p></errorBoundary>`,
    render: (a) => `<render ${a} of=@badge/>`,
    "compound-state wrapper": (a) => `<signupForm ${a}><p class="act">w</p></signupForm>`,
  };
  for (const [hn, host] of Object.entries(HOSTS)) {
    for (const attr of ["if=@f", "show=@f"]) {
      for (const pn of ["in markup", "nested deeper", "in a component body"]) {
        test(`${attr} on ${hn}, ${pn}`, () => {
          expect(codes(POSITIONS[pn](host(attr)))).toContain("E-GATE-UNSUPPORTED-HOST");
        });
      }
    }
  }

  for (const [en, el] of Object.entries(ELEMENTS)) {
    test(`show= on <${en}> — refused, located at the attribute`, () => {
      const { errors } = compile(HEAD + `<div id="out">${el("show=@f")}</div>\n`);
      expect(errors.map((e) => e.code)).toContain("E-GATE-UNSUPPORTED-HOST");
      const err = errors.find((e) => e.code === "E-GATE-UNSUPPORTED-HOST");
      expect(err.message).toContain(`\`show=\` on \`<${en}>\` is not honoured`);
      expect(err.span.line).toBe(12);
    });
  }

  test("show= on a lifted <each> — refused", () => {
    expect(codes(POSITIONS["in lifted markup"](ELEMENTS.each("show=@f")))).toContain("E-GATE-UNSUPPORTED-HOST");
  });

  test("§17.1.2 rejects if= on <errors> / <channel> (the message says so)", () => {
    const { errors } = compile(HEAD + `<channel name="c" if=@f></channel>\n<div id="out">x</div>\n`);
    const err = errors.find((e) => e.code === "E-GATE-UNSUPPORTED-HOST");
    expect(err).toBeDefined();
    expect(err.message).toContain("every other scrml-defined element SHALL reject it");
  });
});

describe("engine timers / transition handlers take no chain attribute and no if= they would ignore", () => {
  const ENG = (idle, active) => `<div id="out"><engine for=Phase initial=.Active>${idle}<Idle rule=.Active><p>i</p></><Active rule=.Idle>${active}<p class="act">act</p></></></div>\n`;
  test("<onTimeout if=> — E-GATE-UNSUPPORTED-HOST", () => {
    expect(codes(ENG("", `<onTimeout if=@f after=10ms to=.Idle/>`))).toEqual(["E-GATE-UNSUPPORTED-HOST"]);
  });
  test("<onIdle if=> — E-GATE-UNSUPPORTED-HOST", () => {
    expect(codes(ENG(`<onIdle if=@f after=10ms to=.Idle/>`, ""))).toEqual(["E-GATE-UNSUPPORTED-HOST"]);
  });
  test("<onTimeout else> / <onIdle else-if=> — E-CTRL-001 / E-CTRL-002", () => {
    expect(codes(ENG("", `<onTimeout else after=10ms to=.Idle/>`))).toEqual(["E-CTRL-001"]);
    expect(codes(ENG(`<onIdle else-if=@f after=10ms to=.Idle/>`, ""))).toEqual(["E-CTRL-002"]);
  });
  test("a computed after=${…} holding an `if` is not read as the attribute", () => {
    expect(codes(ENG("", `<onTimeout after=\${@f ? 1 : 2}ms to=.Idle/>`))).toEqual([]);
  });
  test("<onTransition else> — E-CTRL-001; <onTransition if=> still admitted", () => {
    expect(codes(ENG("", `<onTransition to=.Idle if=@f>\${ @g = false }</><onTransition to=.Idle else>\${ @g = true }</>`))).toEqual(["E-CTRL-001"]);
    expect(codes(ENG("", `<onTransition to=.Idle if=@f>\${ @g = false }</>`))).toEqual([]);
  });
});

describe("not refused — executed", () => {
  test("a plain-markup chain toggles its branches", async () => {
    const app = compileAndMount(HEAD + `<div id="out"><p if=@f class="ifb">a</p><p else-if=@g class="eib">b</p><p else class="act">c</p></div>\n`);
    expect(app.errors).toEqual([]);
    await flush();
    expect([count(".ifb"), count(".eib"), count(".act")]).toEqual([1, 0, 0]);
    await set("f", false);
    expect([count(".ifb"), count(".eib"), count(".act")]).toEqual([0, 1, 0]);
    await set("g", false);
    expect([count(".ifb"), count(".eib"), count(".act")]).toEqual([0, 0, 1]);
  });

  for (const [what, branch] of [
    ["a component use-site <K else/>", `<K else/>`],
    ["<errorBoundary else>", `<errorBoundary else><p class="act">eb</p></errorBoundary>`],
    ["<render else …/>", `<render else of=@badge/>`],
  ]) {
    test(`${what} as a chain member renders only when the chain says so`, async () => {
      const app = compileAndMount(HEAD + `const K = <p class="act">k</p>\n<div id="out"><p if=@f class="ifb">a</p>${branch}</div>\n`);
      expect(app.errors).toEqual([]);
      await flush();
      expect(count("#out .act")).toBe(0);
      await set("f", false);
      expect(count("#out .act")).toBe(1);
    });
  }

  for (const [en, el] of Object.entries(ELEMENTS)) {
    test(`if= on <${en}> is honoured`, async () => {
      const app = compileAndMount(HEAD + `<div id="out">${el("if=@f")}</div>\n`);
      expect(app.errors).toEqual([]);
      await flush();
      expect(count("#out .act")).toBe(1);
      await set("f", false);
      expect(count("#out .act")).toBe(0);
    });
  }

  for (const en of ["match", "each"]) {
    test(`the workaround — <${en}> wrapped in the else member — renders only on the else`, async () => {
      const app = compileAndMount(HEAD + `<div id="out"><p if=@f class="ifb">a</p><div else>${ELEMENTS[en]("")}</div></div>\n`);
      expect(app.errors).toEqual([]);
      await flush();
      expect(count("#out .act")).toBe(0);
      await set("f", false);
      expect(count("#out .act")).toBe(1);
    });
  }

  test("an engine derived=if … then … else … value is not read as an `else` attribute", () => {
    const c = codes(`<div id="out"><engine for=Phase derived=if @g then .Idle else .Active><Idle><p>i</p></><Active><p class="act">a</p></></></div>\n`);
    expect(c).not.toContain("E-CTRL-001");
  });

  test("a match on= value holding an `if … else` in parentheses is not read as an `else` attribute", () => {
    const c = codes(`<div id="out"><match for=Phase on=(if (@g) .Idle else .Active)><Idle><p>i</p></><Active><p class="act">a</p></></></div>\n`);
    expect(c).not.toContain("E-CTRL-001");
  });
});
