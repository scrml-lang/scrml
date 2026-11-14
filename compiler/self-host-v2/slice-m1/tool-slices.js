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
import * as acorn from "acorn";

// s477 r1 (review F1) — the slice must be ONE function body, proven, not just parseable.
// `checkForeignSliceSyntax` parses `return (SOURCE);` — and a slice that closes the sealed
// function's `}` itself (`{ return 1; }), (EVIL), (async function () { return 2; }`) turns
// SOURCE into a comma expression of three functions, which parses: the runtime's eager
// `new Function("return (" + SOURCE + ")")` then RAN `EVIL` at module load, and the sealed
// function it handed back was not the slice. §23.2.4a: "A slice is evaluated as the body of
// a strict-mode async function"; §23.2.6 E-FOREIGN-007: "A slice that is not valid
// JavaScript as the body of a strict-mode async function whose parameters are its crossings
// SHALL be a compile error". So parse the very probe text the check parsed (the layout the
// runtime builds) and require its returned value to be a single async FunctionExpression
// spanning ALL of SOURCE: then the text between SOURCE's own `{` (right after the crossing
// list, which is compiler-made identifiers) and its final `}` is exactly that function's
// body, and nothing else is evaluated when the runtime builds it. Comments, strings,
// regexes and template literals holding `})` are tokens of the parse, so they cannot fool it.
const PROBE_HEAD = "(function (require, __dirname, __filename) {\"use strict\";\nreturn (";
const PROBE_TAIL = ");\n})";

function isOneFunction(source) {
  let ast;
  try {
    ast = acorn.parse(PROBE_HEAD + source + PROBE_TAIL, { ecmaVersion: "latest", sourceType: "script" });
  } catch {
    return false;
  }
  const at = PROBE_HEAD.length;
  const top = ast.body;
  if (top.length !== 1 || top[0].type !== "ExpressionStatement") return false;
  const outer = top[0].expression;
  // the probe's own parentheses are not part of a node's span: the outer function is 1 … length-1
  if (outer.type !== "FunctionExpression" || outer.start !== 1) return false;
  if (outer.end !== at + source.length + PROBE_TAIL.length - 1) return false;
  const stmts = outer.body.body;
  if (stmts.length !== 2 || stmts[1].type !== "ReturnStatement") return false;
  const fnx = stmts[1].argument;
  return fnx !== null && fnx.type === "FunctionExpression" && fnx.async === true
    && fnx.start === at && fnx.end === at + source.length;
}

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
    if (!isOneFunction(source)) {
      diags.push({
        code: "E-FOREIGN-007",
        message: `the foreign slice at ${label} is not valid JavaScript as the body of a sealed async function: its text closes that function's body and continues past it (a \`}\` that is not the slice's own), so it is not ONE function body. A slice is evaluated as the body of a strict-mode async function whose parameters are its crossings (§23.2.4a) — remove the unbalanced \`}\``,
        file: s.file, at: s.at,
      });
      continue;
    }
    sealed.push({ n: s.n, label, source });
  }
  return { sealed, diags };
}
