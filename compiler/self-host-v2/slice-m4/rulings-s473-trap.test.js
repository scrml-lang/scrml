// rulings-s473-{names,trap,lint}.test.js (one file per ruling) — s473-boot-rulings-names-trap-lint: three S473 owner rulings
// (user-voice-scrml.md "⭐ RULED — S473 PA recs, all", item 4):
//
//   "Same-name components across files, and `<card>` beside `fn card`: REFUSED."
//   "A write past the end of a tape position: runtime TRAP."
//   "A write to a loop copy that changes nothing: W- lint."
//
//   1. NAMES — §7.6: a file-scope name is bound ONCE in its file, whatever it
//      names (a `let` / `const`, a `function`, a `type`, a user declaration):
//      E-SCOPE-010 (g-boot-decl-fn-same-name-one-file-s472). §9.1 DQ-7 / §21:
//      two COMPONENTS of one name in one program, in any two files, are
//      E-COMPONENT-NAME-DUPLICATE (g-boot-component-scope-key-bare-name-s472).
//   2. TRAP — §66.12.6 rule 3: a write to a tape position at or past its end
//      (any position write: `@xs[i] = v`, `@xs[i].f = v`, a local's `xs[i] = v`)
//      is the E-INDEX-OUT-OF-RANGE-RT trap and nothing is written
//      (g-spec-index-write-past-end-enforcement-s472).
//   3. LINT — §66.10: a part write to a `for … of` binder (a COPY) that no later
//      read of the binder observes is W-LOOP-COPY-WRITE-UNREAD
//      (g-loop-copy-part-write-no-op-s472).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const two = (lib, app) =>
  frontEnd(mods, [{ path: "a.scrml", src: lib }, { path: "app.scrml", src: app }], "app.scrml").diags.map((d) => [d.code, d.file]);
const P = (decls, main = `        <p>x</p>`) => `<program>\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
const CARD = `    <card t:string/>\n    renders <div>\${t}</div>`;
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};

// ---------------------------------------------------------------------------
// A click whose handler is expected to TRAP (as position-write-s472.test.js does).
const clickTrap = (el) => {
  const errs = [];
  const onErr = (e) => errs.push(e.error);
  window.addEventListener("error", onErr);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.removeEventListener("error", onErr);
  takePageErrors();
  return errs;
};
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
const $ = (sel) => document.querySelector(sel);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s473-" + k++, []);
const prog = (decls, body, markup) =>
  `<program>\n${decls}\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n${markup}\n    </main>\n</program>\n`;

describe("2 — a write past the end of a tape position is the E-INDEX-OUT-OF-RANGE-RT trap (§66.12.6 rule 3, S473)", () => {
  const ROWS = `    type Row:struct = { let qty: string }\n    <rows:Row[]=([{ qty: "1" }, { qty: "2" }])/>\n    <n:int=2/>`;
  const SHOW = `        <p id="o">\${@rows.map(r => r.qty).join(",")}</p>`;

  test("an element-field write `@xs[i].f = v` past the end: the trap — its code, index, length and location; nothing written", async () => {
    await load(prog(ROWS, `        @rows[0].qty = "7";\n        @rows[@n].qty = "9";`, SHOW));
    expect($("#o").textContent).toBe("1,2");
    const errs = clickTrap(btn("go"));
    expect(errs.length).toBe(1);
    expect(errs[0].code).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect(errs[0].detail).toEqual({ index: 2, length: 2, at: "t.scrml:7" });
    // the first write landed; the trapping one wrote nothing (no growth, no padding)
    expect($("#o").textContent).toBe("7,2");
  });

  test("the ElemAt edit carries its source location for the trap", () => {
    const r = clean(prog(ROWS, `        @rows[@n].qty = "9";`, SHOW));
    const ws = find(r.core.fns, (n) => n.variant === "Write");
    expect(ws[0].data.edit.variant).toBe("ElemAt");
    expect(ws[0].data.edit.data.loc).toMatch(/^t\.scrml:\d+$/);
  });

  test("a whole-element position write `@xs[i] = v` at the end traps too (the s472 path, pinned here)", async () => {
    await load(prog(`    <xs:string[write]=(["a", "b"])/>\n    <n:int=2/>`, `        @xs[@n] = "c";`, `        <p id="o">\${@xs.join(",")}</p>`));
    const errs = clickTrap(btn("go"));
    expect(errs.length).toBe(1);
    expect(errs[0].code).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect($("#o").textContent).toBe("a,b");
  });

  test("a local's position write past its end traps (runtime writePath)", async () => {
    await load(prog(`    <n:int=2/>\n    let <shown:string=""/>`,
      `        let ys: string[write] = ["a", "b"];\n        ys[@n] = "c";\n        @shown = ys.join(",");`, `        <p id="o">\${@shown}</p>`));
    const errs = clickTrap(btn("go"));
    expect(errs.length).toBe(1);
    expect(errs[0].code).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect($("#o").textContent).toBe("");
  });
});
