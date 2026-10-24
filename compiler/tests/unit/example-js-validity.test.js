/**
 * Regression tests for EXAMPLE-JS-VALIDITY fixes:
 *
 *   Fix 1: rewrite.ts parseInlineMatchArm supports :> as arm separator
 *          (tested in emit-match.test.js)
 *
 *   Fix 2: ast-builder.js collectIfCondition — braceless if-body
 *          `if (cond) stmt` — paren-aware condition collection prevents body absorption
 *
 *   Fix 3: emit-control-flow.ts emitForStmt reactive path — `continue` → `return`
 *          via continueBehavior flag (continue is illegal in reactive createItem fn)
 */

import { describe, it, expect } from "bun:test";
import { compileScrml } from "../../src/api.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function compileSource(src) {
  const tmp = join(tmpdir(), `scrml-ev-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
  const srcFile = join(tmp, "test.scrml");
  const outDir = join(tmp, "dist");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(srcFile, src);
  try {
    const result = compileScrml({
      inputFiles: [srcFile],
      outputDir: outDir,
      write: false,
    });
    const entry = [...result.outputs.values()][0] ?? {};
    return { errors: result.errors ?? [], clientJs: entry.clientJs ?? "" };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Fix 2: braceless if-body parsing via collectIfCondition
// ---------------------------------------------------------------------------

describe("Fix 2: braceless if-body — paren-aware condition collection", () => {
  it("if (cond) singleExpr — braceless body placed inside if block, not in condition", () => {
    // Tests that `if (flags[i]) primes.push(i)` compiles correctly:
    // the body must be inside the if block, not absorbed into the condition string.
    const src = `<program>
\${
  function sieve(limit) {
    const primes = []
    for (let i = 2; i <= limit; i++) {
      if (i > 1) primes.push(i)
    }
    return primes
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors).toHaveLength(0);
    // Body must NOT be absorbed into the condition (old bug: "if (( i > 1 ) primes . push")
    expect(clientJs).not.toContain(") primes");
    // Must have a valid if statement with braces (if body was correctly parsed as consequent)
    // The correct output should contain `if` and then the push call inside the block
    expect(clientJs).toContain("if (");
    // primes.push must appear as a statement (ExprNode emitter produces clean JS;
    // string fallback preserves tokenizer spaces as `primes . push ( i )`)
    const hasPush = clientJs.includes("primes.push(i)") || clientJs.includes("primes . push ( i )");
    expect(hasPush).toBe(true);
  });

  it("if (typeof x != 'object') return — keyword in condition does not break parsing", () => {
    // Regression test: typeof is not a STMT_KEYWORD, but `type` is. The paren-aware
    // collector must handle keywords inside the condition without breaking early.
    const src = `<program>
\${
  function typeCheck(x) {
    if (typeof x != "string") return "not-string"
    return x
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors).toHaveLength(0);
    // The return must be inside the if block, not part of the condition
    expect(clientJs).not.toContain(') return "not-string"');
    expect(clientJs).toContain("if (");
  });
});

// ---------------------------------------------------------------------------
// Fix 3: continue → return in reactive for createItem function
// ---------------------------------------------------------------------------

describe("Fix 3: continue → return in reactive for createItem", () => {
  it("continue in reactive for body emits return; not continue;", () => {
    const src = `<program>
\${ @items = [{ id: 1, active: true }, { id: 2, active: false }] }
\${
  for (let item of @items) {
    if (!item.active) continue
    lift <div>\${item.id}</div>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors).toHaveLength(0);
    // S469 (g-keyed-row-control-flow-if-not-reevaluated-s469) — an `if` that leaves the row early
    // decides what the row renders, so the list is lowered as the plain loop the block re-runs (a keyed
    // row would read it once): the `continue` is a real `continue` in a real loop, never inside a
    // per-item factory.
    expect(clientJs).not.toContain("_scrml_create_item");
    expect(clientJs).toContain("for (const item of ");
    expect(clientJs).toContain("continue;");
    expect(() => new Function(clientJs)).not.toThrow();
  });
  it("a keyed row filtered by a lifted if= gate: the factory holds no `continue`", () => {
    // The JS-validity floor of the reconciled path (a gate on the row's item keeps the row keyed).
    const src = `<program>
\${ @items = [{ id: 1, active: true }, { id: 2, active: false }] }
\${
  for (let item of @items) {
    lift <div><b if=(item.active)>\${item.id}</b></div>
  }
}
</program>`;
    const { errors, clientJs } = compileSource(src);
    expect(errors).toHaveLength(0);
    expect(clientJs).toContain("_scrml_create_item");
    expect(clientJs).not.toContain("continue;");
    expect(() => new Function(clientJs)).not.toThrow();
  });
});
