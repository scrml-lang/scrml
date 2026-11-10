// =============================================================================
// self-host-v2 / slice-m1 / tool-slices.js — s477: the foreign slices of a
// `kind="tool"` module (SPEC §64), prepared for print-server.scrml printTool.
//
// A slice's interior is OPAQUE to the compiler (§23.2.3: "The compiler SHALL NOT
// parse, tokenize, or type-check the content"), and the bootstrap front end has no
// JavaScript reader. Three facts about the slice are still owed before it can be
// emitted, each asked of the slice as the host will BUILD it:
//   - its SHAPE (§23.2.4a "Slice body — single-expression OR multi-statement (both
//     NORMATIVE) … the compiler discriminates between them"): a single expression
//     gets the injected `return (…)`; a statement body is used verbatim;
//   - E-FOREIGN-006 — a crossing name the slice also declares at its top level;
//   - E-FOREIGN-007 — a slice that "is not valid JavaScript as the body of a
//     strict-mode async function whose parameters are its crossings".
// They are answered by impl#1's parser-token scans (compiler/src/codegen/
// foreign-seal.ts), not by a scanner written here: a hand character scanner misreads
// a regex literal (`/['x]/g`) and loses a top-level `return` (s456, flogence), which
// impl#1 already paid for — the proven path, reused.
// =============================================================================

import {
  checkForeignSliceSyntax,
  foreignSliceSource,
  scanForeignSliceShape,
  scanForeignSliceTopLevelBindings,
} from "../../src/codegen/foreign-seal.ts";

function lineCol(src, offset) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === "\n") { line++; col = 1; } else col++;
  }
  return { line, col };
}

/**
 * `slices`: printTool's `toolSlices(core)` — `{ n, file, at, params, body }`.
 * `sourceOf(file)`: the source text of a compiled file (for the site's line:col).
 * Returns `{ sealed: [{ n, label, source }], diags: [{ code, message, file, at }] }`.
 */
export function prepareToolSlices(slices, sourceOf) {
  const sealed = [];
  const diags = [];
  for (const s of slices) {
    const params = [...s.params];
    const text = typeof sourceOf === "function" ? sourceOf(s.file) : undefined;
    const lc = typeof text === "string" ? lineCol(text, s.at) : null;
    const label = lc ? `${s.file}:${lc.line}:${lc.col}` : `${s.file}@${s.at}`;
    const body = String(s.body);
    if (params.length > 0) {
      const shadowed = scanForeignSliceTopLevelBindings(body, new Set(params));
      if (shadowed.length > 0) {
        const names = shadowed.map((n) => `\`${n}\``).join(", ");
        diags.push({
          code: "E-FOREIGN-006",
          message: `the foreign block crosses ${names} in its \`in:{}\` header, and the slice also declares ${shadowed.length === 1 ? "it" : "them"} at its top level — a crossing is a parameter of the sealed slice, so a same-named \`const\` / \`let\` / \`var\` / \`function\` / \`class\` redeclares it (§23.2.4a). Rename the crossing or the slice's own binding`,
          file: s.file, at: s.at,
        });
        continue;
      }
    }
    const shape = scanForeignSliceShape(body);
    const single = shape.parsed && !shape.topLevelReturn && !shape.topLevelStmtSep;
    // the newline before `)` keeps a trailing `//` comment from swallowing the paren
    const inner = single ? `return (${body}\n);` : body;
    const source = foreignSliceSource(params, inner);
    const problem = checkForeignSliceSyntax(source);
    if (problem) {
      const asStatements = single && checkForeignSliceSyntax(foreignSliceSource(params, body)) === null;
      const where = problem.sliceLine !== null ? ` (line ${problem.sliceLine} of the slice)` : "";
      diags.push({
        code: "E-FOREIGN-007",
        message: asStatements
          ? `the foreign slice at ${label} has no top-level \`;\` and no top-level \`return\`, so it is read as ONE expression and given an injected \`return\` — but it is a sequence of statements. Use the statement shape: end each statement with \`;\`, and give the slice its own \`return\` if it produces a value (§23.2.4a)`
          : `the foreign slice at ${label} is not valid JavaScript as the body of a sealed async function: ${problem.message}${where}. A slice is not a module — \`import.meta\` and a static \`import\` are unavailable (use \`__dirname\` / \`__filename\` / \`require\` / \`await import(…)\`) — and TypeScript type syntax is not stripped (§23.2.4a)`,
        file: s.file, at: s.at,
      });
      continue;
    }
    sealed.push({ n: s.n, label, source });
  }
  return { sealed, diags };
}
