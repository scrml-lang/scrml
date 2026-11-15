/**
 * S478 (s478-impl1-fn-text-scans) — g-input-ref-rewritten-inside-string-literal.
 *
 * `<#name>` is lowered to a compiler-internal identifier before tokenization
 * (`preprocessWorkerAndStateRefs`, ast-builder.js) and again before acorn
 * (`parseExpression` / `parseStatements`, expression-parser.ts). Both rewrote a
 * `<#name>` INSIDE a string literal, so `"read <#id>.error"` shipped as
 * `"read _scrml_input_id_.error"` — a silent change to the literal's value.
 * Both now act only where the match begins in code (`replaceInCode` /
 * `codeOnlyView`, map invariant 43).
 */

import { describe, test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "path";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const testDir = dirname(fileURLToPath(new URL(import.meta.url)));
let tmpCounter = 0;

/** Compile; return { errors, client } (client = the emitted client JS, or ""). */
function compileSource(scrmlSource) {
  const tag = `s478-input-ref-${++tmpCounter}`;
  const tmpDir = resolve(testDir, `_tmp_${tag}`);
  const tmpInput = resolve(tmpDir, `${tag}.scrml`);
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(tmpInput, scrmlSource);
  try {
    const result = compileScrml({ inputFiles: [tmpInput], write: false, outputDir: resolve(tmpDir, "out"), log: () => {} });
    let client = "";
    for (const [fp, output] of result.outputs ?? []) {
      if (fp.includes(tag)) client = output.clientJs ?? "";
    }
    return { errors: (result.errors ?? []).filter((e) => e.severity !== "warning").map((e) => e.code), client };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function program(fnLine) {
  return `<program>
<mouse id="cursor"/>
\${
  ${fnLine}
}
<p>\${m()}</p>
</program>`;
}

describe("g-input-ref-rewritten-inside-string-literal — `<#id>` in a literal is kept verbatim", () => {
  test("fn, double-quoted string (the bootstrap reproducer)", () => {
    const { errors, client } = compileSource(program(`fn m() -> string { return "read <#id>.error" }`));
    expect(errors).toEqual([]);
    expect(client).toContain(`"read <#id>.error"`);
    expect(client).not.toContain("_scrml_input_id_");
  });

  test("function, single-quoted string", () => {
    const { errors, client } = compileSource(program(`function m() { return 'sq <#cursor>.x' }`));
    expect(errors).toEqual([]);
    expect(client).toMatch(/["']sq <#cursor>\.x["']/);
  });

  test("template static text", () => {
    const { errors, client } = compileSource(program("fn m() -> string { return `tmpl <#id>.error` }"));
    expect(errors).toEqual([]);
    expect(client).toContain("`tmpl <#id>.error`");
  });

  test("worker `.send(` form named in a string", () => {
    const { errors, client } = compileSource(program(`fn m() -> string { return "call <#w>.send(x) later" }`));
    expect(errors).toEqual([]);
    expect(client).toContain(`"call <#w>.send(x) later"`);
    expect(client).not.toContain("_scrml_worker_w");
  });

  test("STILL LOWERED: a `<#id>` in code beside a string that names it", () => {
    const { errors, client } = compileSource(program(`function m() { return "<#cursor>: " + <#cursor>.x }`));
    expect(errors).toEqual([]);
    expect(client).toContain(`"<#cursor>: "`);
    expect(client).toContain(`_scrml_input_state_registry.get("cursor").x`);
  });

  test("STILL LOWERED: a bare `<#id>` read", () => {
    const { errors, client } = compileSource(program(`function m() { return <#cursor>.x }`));
    expect(errors).toEqual([]);
    expect(client).toContain(`_scrml_input_state_registry.get("cursor").x`);
  });
});
