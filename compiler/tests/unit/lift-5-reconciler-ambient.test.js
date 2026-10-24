/**
 * LIFT-5 — reconciler-factory _scrml_lift_target ambient missing
 *
 * Root cause: In emitForStmt's reactive path (keyed reconcile), the fallback
 * body loop dispatched if-stmt and for-stmt children through emitLogicNode
 * without a containerVar. When those children contained a lift-expr,
 * emitLogicNode called emitLiftExpr with no containerVar, emitting
 * _scrml_lift(() => ...) — which reads the global ambient _scrml_lift_target.
 * Inside _scrml_create_item_N (invoked by the reconciler), _scrml_lift_target
 * is null, so nothing was appended to the DocumentFragment and firstChild
 * returned null for every item.
 *
 * Fix (option C variant): export emitIfStmtWithContainer and
 * emitForStmtWithContainer from emit-lift.js and use them (with
 * continueBehavior: "return") in the fallback body loop so inner lift-expr
 * nodes append directly to tmpContainerVar via appendChild(factory()) instead
 * of calling _scrml_lift() against the null ambient.
 *
 * Tests:
 *   §1  for { if { lift }} — no _scrml_lift() inside _scrml_create_item_N
 *   §2  for { if { lift }} — inner DOM creation appended to DocumentFragment
 *   §3  for { if { lift }} — return value is firstChild (not hardcoded null)
 *   §4  for { if { lift }} — continue in if-body emits return; not continue;
 *   §5  for { if-else { lift } else { lift }} — both branches use appendChild
 *   §6  for { if { lift }} — outer _scrml_lift_target set/cleared wrapping block
 *   §7  for { for { lift }} nested reactive — inner for-stmt uses appendChild
 *
 * S469 (g-keyed-row-control-flow-if-not-reevaluated-s469) — an `if` among a row's ROOTS that lifts (or
 * leaves the row early) decides what the row renders, and a keyed row is built once per key, so such a
 * list is now lowered as the plain loop the block re-runs (§1–§6 "root" cases pin that). The factory
 * path these tests were written for no longer holds a row-deciding `if` in ANY position (S469 round 2
 * removed the element-wrapped region): the "element" cases now pin that such a list is plain and that
 * the `if`'s lifts are routed into the row's element, not to the ambient target.
 */

import { describe, it, expect } from "bun:test";
import { compileScrml } from "../../src/api.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function compileSource(src) {
  const tmp = join(tmpdir(), `scrml-lift5-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
  const srcFile = join(tmp, "test.scrml");
  const outDir = join(tmp, "dist");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(srcFile, src);
  const result = compileScrml({
    inputFiles: [srcFile],
    outputDir: outDir,
    write: false,
  });
  const entry = [...result.outputs.values()][0] ?? {};
  return { errors: result.errors ?? [], clientJs: entry.clientJs ?? "" };
}

// ---------------------------------------------------------------------------
// §1 — No ambient _scrml_lift() call inside _scrml_create_item_N
// ---------------------------------------------------------------------------

describe("LIFT-5 §1 — no ambient _scrml_lift() inside reconciler factory", () => {
  it("for { if { lift }} does not emit _scrml_lift(() => inside createItem fn", () => {
    const src = `<program>
\${ @items = [1, 2, 3, 4, 5] }
\${
  for (let item of @items) {
    lift <ul>\${ if (item % 2 == 0) { lift <li>\${item}</li> } }</ul>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);

    // S469 round 2 — no per-item factory exists for this list (a row-deciding `if`, in any position,
    // lowers the list plain), so the LIFT-5 null-ambient hazard cannot arise; the `if`'s lift is routed
    // into the row's element, not to the ambient target.
    expect(clientJs).not.toContain("_scrml_create_item_");
    expect(clientJs).toMatch(/_scrml_lift_el_\d+\.appendChild\(\(\(\) => \{/);
  });
});

// ---------------------------------------------------------------------------
// §2 — Inner DOM creation is appended to the DocumentFragment
// ---------------------------------------------------------------------------

describe("LIFT-5 §2 — lift inside if appends to DocumentFragment", () => {
  it("if-body lift emits tmpContainerVar.appendChild(...) not _scrml_lift()", () => {
    const src = `<program>
\${ @items = [1, 2, 3, 4, 5] }
\${
  for (let item of @items) {
    lift <ul>\${ if (item % 2 == 0) { lift <li class="even">Even: \${item}</li> } }</ul>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);

    // The factory must use .appendChild((() => { ... })()) pattern
    expect(clientJs).toContain(".appendChild((() => {");
    // The created element must be an <li>
    expect(clientJs).toContain('document.createElement("li")');
    // class attribute must be set
    expect(clientJs).toContain('setAttribute("class", "even")');
  });
});

// ---------------------------------------------------------------------------
// §3 — return value is firstChild (reconciler receives DOM node or null)
// ---------------------------------------------------------------------------

describe("LIFT-5 §3 — factory returns DocumentFragment.firstChild", () => {
  it("createItem fn ends with return tmpVar.firstChild", () => {
    const src = `<program>
\${ @items = [1, 2, 3, 4, 5] }
\${
  for (let item of @items) {
    lift <ul>\${ if (item % 2 == 0) { lift <li>\${item}</li> } }</ul>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);

    // S469 round 2 — the list is the plain loop (no factory, nothing for the reconciler to receive).
    expect(clientJs).not.toContain("_scrml_create_item_");
    expect(clientJs).not.toContain("_scrml_reconcile_list(");
  });
});

// ---------------------------------------------------------------------------
// §4 — continue inside if-body emits return; not continue;
// ---------------------------------------------------------------------------

describe("LIFT-5 §4 — continue in a row's if-body: the list is the plain loop", () => {
  it("continue-stmt inside if inside reactive for: no createItem fn, a real continue", () => {
    const src = `<program>
\${ @items = [{id: 1, active: true}, {id: 2, active: false}] }
\${
  for (let item of @items) {
    if (!item.active) continue
    lift <div>\${item.id}</div>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);

    // S469 — an early exit decides what the row renders: the list is the plain loop the block re-runs,
    // and the `continue` is a real one in a real loop (never inside a per-item factory).
    expect(clientJs).not.toContain("_scrml_create_item_");
    expect(clientJs).toContain("for (const item of ");
    expect(clientJs).toContain("continue;");
  });
});

// ---------------------------------------------------------------------------
// §5 — if-else { lift } both branches use appendChild
// ---------------------------------------------------------------------------

describe("LIFT-5 §5 — if-else both lift branches use appendChild", () => {
  it("if-else { lift } else { lift } emits two appendChild calls in createItem", () => {
    const src = `<program>
\${ @items = [1, 2, 3, 4, 5] }
\${
  for (let item of @items) {
    lift <ul>\${ if (item % 2 == 0) { lift <li class="even">Even</li> } else { lift <li class="odd">Odd</li> } }</ul>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);

    // S469 round 2 — the plain loop; both branches append into the row's element.
    expect(clientJs).not.toContain("_scrml_create_item_");
    const appendCount = (clientJs.match(/_scrml_lift_el_\d+\.appendChild\(\(\(\) => \{/g) || []).length;
    expect(appendCount).toBeGreaterThanOrEqual(2);
    expect(clientJs).toContain('"even"');
    expect(clientJs).toContain('"odd"');
  });
});

// ---------------------------------------------------------------------------
// §6 — outer _scrml_lift_target set/cleared around the whole block
// ---------------------------------------------------------------------------

describe("LIFT-5 §6 — _scrml_lift_target set and cleared around for block", () => {
  it("outer scope sets _scrml_lift_target before createItem fn declaration", () => {
    const src = `<program>
\${ @items = [1, 2, 3] }
\${
  for (let item of @items) {
    lift <div>\${ if (item > 1) { lift <span>\${item}</span> } }</div>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);

    // The block-level lift setup: _scrml_lift_target set before the factory decl
    expect(clientJs).toMatch(/_scrml_lift_target = _scrml_lift_tgt_\d+;/);
    expect(clientJs).toContain("_scrml_lift_target = null;");
    // The wrapper element is lifted to _scrml_lift_target
    expect(clientJs).toContain("_scrml_lift(");
    // S469 round 2 — the plain loop, re-run by the block's render effect.
    expect(clientJs).not.toContain("_scrml_create_item_");
    expect(clientJs).toMatch(/_scrml_effect\(function\(\) \{\n\s*_scrml_lift_tgt_\d+\.innerHTML = "";/);
  });
});

// ---------------------------------------------------------------------------
// §7 — nested for { if { lift }} — inner for-stmt also uses appendChild
// ---------------------------------------------------------------------------

describe("LIFT-5 §7 — nested for-stmt inside reactive for also uses appendChild", () => {
  it("for { for-static { lift }} in createItem uses appendChild not _scrml_lift()", () => {
    const src = `<program>
\${ @groups = [[1, 2], [3, 4]] }
\${
  for (let group of @groups) {
    lift <ul>
      \${
        for (let n of group) {
          lift <li>\${n}</li>
        }
      }
    </ul>
  }
}
</program>`;
    // This is the fragmented-lift path (hasFragmentedLiftBody=true), so
    // emitConsolidatedLift handles it — not the fallback path. Verify it
    // still compiles without errors and doesn't include ambient lift calls
    // in problematic positions.
    const { errors, clientJs } = compileSource(src);
    expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);
    // Should produce a working client.js
    expect(clientJs.length).toBeGreaterThan(0);
    // The word 'undefined' appears only in the reconciler key fn (?. check),
    // not as a runtime error. Just verify the output contains createElement.
    expect(clientJs).toContain('document.createElement("ul")');
    expect(clientJs).toContain('document.createElement("li")');
    // No ambient _scrml_lift() in the nested for (already handled by fragmented path)
    // The nested for body uses appendChild not _scrml_lift()
    expect(clientJs).toContain('.appendChild((() => {');
  });
});

// ---------------------------------------------------------------------------
// S469 — an `if` among the row's roots: the list is the plain loop the block re-runs
// ---------------------------------------------------------------------------

describe("S469 — a root-level row-deciding if lowers the list plain (g-keyed-row-control-flow-if-not-reevaluated-s469)", () => {
  for (const [label, row] of [
    ["if { lift }", `if (item % 2 == 0) { lift <li>\${item}</li> }`],
    ["if { lift } else { lift }", `if (item % 2 == 0) { lift <li class="even">Even</li> } else { lift <li class="odd">Odd</li> }`],
    ["a sibling root, then if { lift }", `lift <i></i>\n    if (item > 1) { lift <span>\${item}</span> }`],
  ]) {
    it(label, () => {
      const { errors, clientJs } = compileSource(`<program>
\${ @items = [1, 2, 3, 4, 5] }
\${
  for (let item of @items) {
    ${row}
  }
}
</program>`);
      expect(errors.filter(e => e.severity !== "warning")).toHaveLength(0);
      expect(clientJs).not.toContain("_scrml_create_item_");
      expect(clientJs).not.toContain("_scrml_reconcile_list(");
      // The block re-runs the loop: its render is an effect.
      expect(clientJs).toMatch(/_scrml_effect\(function\(\) \{\n\s*_scrml_lift_tgt_\d+\.innerHTML = "";/);
    });
  }
});
