/**
 * engine-hydration-initial-cell.test.js
 *
 * §51.0.E (S198 — Approach F A-leg) — dynamic `initial=@cell` runtime-cell
 * hydration. The engine boots to a PERSISTED value snapshotted from a reactive
 * cell at engine-construction (boot-only), routed through the GUARD-FREE
 * construction hook, NOT the transition guard (hydration is CONSTRUCTION, not a
 * transition — `rule=` does not apply).
 *
 * Coverage:
 *   §1  Parser — `initial=@cell` captured as engine-decl.initialCell (distinct
 *        from `.Variant`); the two forms are independent slots.
 *   §2  SYM B15 — existence (E-ENGINE-INITIAL-CELL-UNDECLARED), type-compat
 *        (E-ENGINE-INITIAL-CELL-TYPE), mutual-exclusion (E-ENGINE-INITIAL-BOTH-
 *        FORMS), forbidden-on-derived (E-DERIVED-ENGINE-NO-INITIAL); no spurious
 *        W-ENGINE-INITIAL-MISSING on the cell form.
 *   §3  Codegen — emitEngineCellHydrationInit emits the deferred guard-free set
 *        reading the cell via `_scrml_engine_hydrate_init`, NOT
 *        `_scrml_engine_direct_set`; emitEngineVariantCellInit SKIPS the cell case.
 *   §4  Runtime guard — the emitted client routes hydration through
 *        `_scrml_engine_hydrate_init` with the valid-variant set; the runtime
 *        helper is present in SCRML_RUNTIME and enforces the decoder boundary.
 */

import { describe, test, expect } from "bun:test";
import { splitBlocks } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { runSYM } from "../../src/symbol-table.ts";
import {
  emitEngineVariantCellInit,
  emitEngineCellHydrationInit,
} from "../../src/codegen/emit-engine.ts";
import { SCRML_RUNTIME } from "../../src/runtime-template.js";

function buildAstFromSource(source, filePath = "test.scrml") {
  const bs = splitBlocks(filePath, source);
  return buildAST(bs).ast;
}

function runUpToSYM(source, filePath = "test.scrml") {
  const bs = splitBlocks(filePath, source);
  const { ast } = buildAST(bs);
  return runSYM({ filePath, ast });
}

function findEngineDecl(ast) {
  let found = null;
  function walk(nodes) {
    if (!nodes) return;
    for (const n of nodes) {
      if (!n) continue;
      if (n.kind === "engine-decl") { if (!found) found = n; return; }
      if (n.children) walk(n.children);
      if (n.body) walk(n.body);
    }
  }
  walk(ast.nodes || []);
  if (!found && ast.machineDecls) {
    for (const m of ast.machineDecls) {
      if (m && m.kind === "engine-decl") { found = m; break; }
    }
  }
  return found;
}

function codes(sym) {
  return (sym.errors || []).map((e) => e.code);
}

/** Build a minimal engineMeta carrying the fields the codegen reads. */
function meta(overrides = {}) {
  return {
    forType: "HOSStatus",
    varName: "hosStatus",
    initialVariant: null,
    initialCell: null,
    variants: ["OffDuty", "Driving", "OnDuty", "Sleeper"],
    stateChildren: [
      { tag: "OffDuty", rule: { kind: "multi", targets: ["Driving", "OnDuty", "Sleeper"] } },
      { tag: "Driving", rule: { kind: "multi", targets: ["OnDuty", "OffDuty"] } },
      { tag: "OnDuty", rule: { kind: "multi", targets: ["Driving", "OffDuty", "Sleeper"] } },
      { tag: "Sleeper", rule: { kind: "multi", targets: ["OffDuty", "OnDuty"] } },
    ],
    derivedExpr: null,
    isExported: false,
    isPinned: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §1 — Parser
// ---------------------------------------------------------------------------

describe("§1 parser — initial=@cell capture", () => {
  test("`initial=@cell` recorded on engine-decl.initialCell", () => {
    const src = `<program>
<persistedStatus> : string = "Driving"
<engine for=HOSStatus initial=@persistedStatus>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const eng = findEngineDecl(buildAstFromSource(src));
    expect(eng).not.toBeNull();
    expect(eng.initialCell).toBe("persistedStatus");
    expect(eng.initialVariant).toBeNull();
  });

  test("`initial=.Variant` leaves initialCell null (distinct slots)", () => {
    const src = `<program>
<engine for=HOSStatus initial=.Driving>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const eng = findEngineDecl(buildAstFromSource(src));
    expect(eng.initialVariant).toBe("Driving");
    expect(eng.initialCell ?? null).toBeNull();
  });

  test("absent initial= leaves both slots null", () => {
    const src = `<program>
<engine for=HOSStatus>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const eng = findEngineDecl(buildAstFromSource(src));
    expect(eng.initialVariant).toBeNull();
    expect(eng.initialCell ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2 — SYM B15 validation
// ---------------------------------------------------------------------------

describe("§2 SYM B15 — initial=@cell validation", () => {
  test("string cell holding a variant name → no error, no MISSING warning", () => {
    const src = `<program>
type HOSStatus:enum = { OffDuty, Driving, OnDuty, Sleeper }
<persistedStatus> : string = "Driving"
<engine for=HOSStatus initial=@persistedStatus>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const sym = runUpToSYM(src);
    const c = codes(sym);
    expect(c).not.toContain("E-ENGINE-INITIAL-CELL-UNDECLARED");
    expect(c).not.toContain("E-ENGINE-INITIAL-CELL-TYPE");
    expect(c).not.toContain("E-ENGINE-INITIAL-BOTH-FORMS");
    expect(c).not.toContain("W-ENGINE-INITIAL-MISSING");
  });

  test("cell typed as the for=T enum → no error", () => {
    const src = `<program>
type HOSStatus:enum = { OffDuty, Driving, OnDuty, Sleeper }
<persistedStatus> : HOSStatus = .Driving
<engine for=HOSStatus initial=@persistedStatus>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const sym = runUpToSYM(src);
    const c = codes(sym);
    expect(c).not.toContain("E-ENGINE-INITIAL-CELL-TYPE");
    expect(c).not.toContain("E-ENGINE-INITIAL-CELL-UNDECLARED");
  });

  test("non-existent cell → E-ENGINE-INITIAL-CELL-UNDECLARED", () => {
    const src = `<program>
type HOSStatus:enum = { OffDuty, Driving, OnDuty, Sleeper }
<engine for=HOSStatus initial=@doesNotExist>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const sym = runUpToSYM(src);
    expect(codes(sym)).toContain("E-ENGINE-INITIAL-CELL-UNDECLARED");
    // The cell form must NOT produce the missing-variant warning.
    expect(codes(sym)).not.toContain("W-ENGINE-INITIAL-MISSING");
  });

  test("type-incompatible cell (number) → E-ENGINE-INITIAL-CELL-TYPE", () => {
    const src = `<program>
type HOSStatus:enum = { OffDuty, Driving, OnDuty, Sleeper }
<persistedStatus> : number = 3
<engine for=HOSStatus initial=@persistedStatus>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const sym = runUpToSYM(src);
    expect(codes(sym)).toContain("E-ENGINE-INITIAL-CELL-TYPE");
  });

  test("both initial=.Variant AND initial=@cell → E-ENGINE-INITIAL-BOTH-FORMS", () => {
    const src = `<program>
type HOSStatus:enum = { OffDuty, Driving, OnDuty, Sleeper }
<persistedStatus> : string = "Driving"
<engine for=HOSStatus initial=.OffDuty initial=@persistedStatus>
  <OffDuty rule=.Driving : "Off duty">
  <Driving rule=.OffDuty : "Driving">
</>
</program>`;
    const sym = runUpToSYM(src);
    expect(codes(sym)).toContain("E-ENGINE-INITIAL-BOTH-FORMS");
  });

  test("initial=@cell FORBIDDEN on a derived engine → E-DERIVED-ENGINE-NO-INITIAL", () => {
    const src = `<program>
type HOSStatus:enum = { OffDuty, Driving, OnDuty, Sleeper }
type Phase:enum = { Idle, Busy }
<persistedStatus> : string = "Driving"
<engine for=Phase initial=@persistedStatus derived=if @persistedStatus == "Driving" then .Busy else .Idle>
</>
</program>`;
    const sym = runUpToSYM(src);
    expect(codes(sym)).toContain("E-DERIVED-ENGINE-NO-INITIAL");
  });
});

// ---------------------------------------------------------------------------
// §3 — Codegen
// ---------------------------------------------------------------------------

describe("§3 codegen — emitEngineCellHydrationInit / emitEngineVariantCellInit", () => {
  test("cell form: emitEngineVariantCellInit emits NOTHING (skips the cell case)", () => {
    const out = emitEngineVariantCellInit(meta({ initialCell: "persistedStatus" }));
    expect(out).toEqual([]);
  });

  test("static form: emitEngineCellHydrationInit emits NOTHING (skips the literal case)", () => {
    const out = emitEngineCellHydrationInit(meta({ initialVariant: "Driving", initialCell: null }));
    expect(out).toEqual([]);
  });

  test("cell form: emitEngineCellHydrationInit emits a guard-free hydrate set reading the cell", () => {
    const out = emitEngineCellHydrationInit(meta({ initialCell: "persistedStatus" })).join("\n");
    expect(out).toContain('_scrml_engine_hydrate_init("hosStatus"');
    expect(out).toContain('_scrml_reactive_get("persistedStatus")');
    // The valid-variant set is carried for the runtime decoder boundary.
    expect(out).toContain('["OffDuty","Driving","OnDuty","Sleeper"]');
    expect(out).toContain('"HOSStatus"');
  });

  test("cell form: hydration does NOT route through the transition guard", () => {
    const out = emitEngineCellHydrationInit(meta({ initialCell: "persistedStatus" })).join("\n");
    expect(out).not.toContain("_scrml_engine_direct_set");
  });

  test("cell form: variant set falls back to stateChildren tags when variants[] empty", () => {
    const out = emitEngineCellHydrationInit(
      meta({ initialCell: "persistedStatus", variants: [] }),
    ).join("\n");
    expect(out).toContain('["OffDuty","Driving","OnDuty","Sleeper"]');
  });
});

// ---------------------------------------------------------------------------
// §4 — Runtime helper
// ---------------------------------------------------------------------------

describe("§4 runtime — _scrml_engine_hydrate_init", () => {
  test("the runtime helper is present in SCRML_RUNTIME", () => {
    expect(SCRML_RUNTIME).toContain("function _scrml_engine_hydrate_init(");
  });

  test("the runtime helper throws E-ENGINE-INITIAL-INVALID-VARIANT on the decoder boundary", () => {
    // The helper body references the decoder-boundary error code for both the
    // absence case and the invalid-variant case.
    const idx = SCRML_RUNTIME.indexOf("function _scrml_engine_hydrate_init(");
    const body = SCRML_RUNTIME.slice(idx, idx + 2000);
    expect(body).toContain("E-ENGINE-INITIAL-INVALID-VARIANT");
    // It performs a GUARD-FREE bare set, never the transition guard.
    expect(body).toContain("_scrml_reactive_set(varName, snapshot)");
    // It never CALLS the transition guard (the comment mentions it by name only).
    expect(body).not.toContain("_scrml_engine_direct_set(");
  });
});
