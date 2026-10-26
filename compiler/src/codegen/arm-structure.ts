/**
 * arm-structure.ts — S465: SERVER arm bodies are emitted from the parsed tree,
 * never re-lowered from their token text.
 *
 * SPEC §13.2: a server function "MAY be called directly (the compiler awaits the
 * call)". The await is decided by the structured expression emitter
 * (`emitExpr`'s call site asks the import classifier, `isStdlibAsyncCallee`).
 * Several arm forms reach codegen with their body carried as TEXT — a literal /
 * alternation / product `match` arm (`"a" :> { … }`, `1 :> expr`), an inline arm's
 * result string, a `!{}` handler arm — and the emitters re-lowered that text
 * through the token rewriters (`rewriteBlockBody`, `rewriteServerExpr`), which
 * never consult the classifier. A call to a Promise-returning import in such a
 * body shipped as a bare Promise: every Promise is truthy, so
 * `"a" :> { if (check(pass, row.pw)) { r = "WELCOME" } }` accepted every password.
 *
 * The fix is not an await patch on the text. On the server the text is PARSED —
 * with the compiler's own statement / expression parsers (the statement one IS
 * the function-top-level parser: `parseStatementTextDetailed`) — and the
 * resulting nodes go through the normal statement / expression emitters, so the
 * classifier, the injector and the Promise trap see these calls exactly as they
 * see any other.
 *
 * FAIL CLOSED BY CONSTRUCTION (S465 r2). On the server both readers below return
 * a tree for every non-empty body — never null — so no caller can fall back to
 * its text lowering. A body the parser refuses is a COMPILE ERROR, recorded in
 * the run-wide refused-lowering sink (`recordRefusedLowering`, drained by
 * `runCG`): the code is the one the same statement gets at function top level
 * when the front-end raised one (`switch` → E-SWITCH-FORBIDDEN, `try` →
 * E-TRY-NOT-IN-SCRML, `throw` → E-THROW-NOT-IN-SCRML, `for … in` → E-CTRL-011,
 * `let a = 1, b = 2` → E-STMT-MISSING-SEMICOLON), else E-STMT-UNEXPECTED-TOKEN
 * (§4: "no statement begins here" — content the statement grammar could read
 * only by dropping it, e.g. a label on a non-loop block `blk: { … }`). The
 * returned tree is then an inert `null` placeholder: the compile fails, so the
 * artifact never runs (§2.2.1, S451).
 *
 *   serverArmBlockStatements(text, mode, anchor?) → statement nodes for a
 *     `{ … }` BLOCK arm body on the server; null only in client mode, for a text
 *     that is not a statement block (an object literal / a value), or for an
 *     empty block (`{}` — nothing to lower).
 *   serverArmExprNode(text, mode, node?) → the ExprNode for an arm VALUE on the
 *     server (the node the parser already built when there is one); null only
 *     in client mode or for empty text.
 *
 * Client mode returns null from both: client arm emission is unchanged here
 * (its own async colouring / `_awaitMatchArmServerCalls` path).
 */

import { parseExprToNode, hasLostTrailingContent, captureTrailingContentWarnings } from "../expression-parser.ts";
import { armBlockStatementsDetailed } from "../arm-body-statements.ts";
import { CGError } from "./errors.ts";
import { recordRefusedLowering } from "./refused-lowering-errors.ts";
import { currentLoweringSpan } from "./sql-one-statement-guard.ts";

type Mode = "client" | "server" | string | undefined | null;

/** Is `text` a `{ … }` statement block (not an object literal)? */
function isStatementBlockText(t: string): boolean {
  if (!(t.startsWith("{") && t.endsWith("}"))) return false;
  let node: any = null;
  const { result } = captureTrailingContentWarnings(() => {
    try { return parseExprToNode(t, "<match-arm-block>", 0); } catch { return null; }
  });
  node = result;
  return !(node && node.kind === "object");
}

/**
 * Did the expression parser READ this node? Not when it is (or holds) a
 * parse-error escape hatch, or was read only by dropping trailing content. The
 * other escape-hatch kinds (an arrow / function value, a sequence) are JS forms
 * the expression emitter lowers the same way at every position — top level too.
 */
function readableExpr(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  let ok = true;
  const seen = new WeakSet<object>();
  const walk = (n: any): void => {
    if (!ok || !n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { for (const c of n) walk(c); return; }
    if ((n.kind === "escape-hatch" && n.nativeKind === "ParseError") || hasLostTrailingContent(n)) { ok = false; return; }
    for (const k of Object.keys(n)) if (k !== "span") walk(n[k]);
  };
  walk(node);
  return ok;
}

const NULL_LIT = (): any => ({ kind: "lit", raw: "null", value: null, litType: "null" });

/** Shorten `t` for a diagnostic. */
function excerpt(t: string): string {
  const one = t.replace(/\s+/g, " ").trim();
  return one.length > 80 ? one.slice(0, 77) + "..." : one;
}

/**
 * Record the refusal of a server arm body (see the file header) and return
 * nothing: the caller emits the inert placeholder.
 */
export function refuseServerArm(body: string, refusal: { code: string | null; message: string; text: string }, anchor?: object | null, whereText?: string): void {
  const where = whereText ?? "in a server `match` / `!{}` arm body";
  let err: CGError;
  if (refusal.code) {
    // The front-end's own diagnostic for the statement, verbatim — the same text
    // the statement gets at function top level — plus where it was found.
    const msg = refusal.message.startsWith(refusal.code) ? refusal.message : `${refusal.code}: ${refusal.message}`;
    err = new CGError(refusal.code, `${msg} (${where}: \`${excerpt(body)}\`)`, currentLoweringSpan() as any);
  } else {
    err = new CGError(
      "E-STMT-UNEXPECTED-TOKEN",
      `E-STMT-UNEXPECTED-TOKEN: unexpected token — no statement begins at \`${excerpt(refusal.text || body)}\` ` +
        `${where} (\`${excerpt(body)}\`). The statement grammar cannot read it (a label is written only on a ` +
        `\`while\` / \`do\` / \`for\` loop, §49.2.2). Rewrite the statement, or move it into a function and call that.`,
      currentLoweringSpan() as any,
    );
  }
  recordRefusedLowering(err, anchor ?? null);
}

/**
 * S468 fix round 1 — FAIL CLOSED on the CLIENT for a `!{}` arm whose handler
 * result is USED (§19.4.3 value position) and whose `{ … }` block the arm reader
 * (`armBlockStatementsDetailed`) refuses.
 *
 * SPEC §19.4.3: "In a value position, every arm SHALL do one of two things" —
 * yield a value ("a block whose last expression is that value (§18.5)") or leave;
 * an arm that does neither "SHALL be a compile error". When the block cannot be
 * read, the compiler cannot establish either, and the client text lowering it
 * used to fall back to (`rewriteBlockBody` + `emitArmAssign`) emits the block's
 * statements as side effects only: the guarded value stays the error envelope —
 * truthy — and `const ok = check(p) !{ .Denied :> { @note = "d"⏎ !yes } }` let a
 * wrong password in. The server already refuses the same text (`refuseServerArm`);
 * this is the client's refusal, so the two boundaries agree.
 *
 * Returns true when the arm was refused (a compile error was recorded): the
 * caller emits an inert placeholder in place of the arm.
 */
export function refuseUnreadableValueArm(arm: { pattern?: string; handler?: string; failExpr?: unknown; span?: unknown }): boolean {
  if (!arm || arm.failExpr) return false;
  const t = (arm.handler ?? "").trim();
  if (!(t.startsWith("{") && t.endsWith("}")) || !t.slice(1, -1).trim()) return false;
  const r = armBlockStatementsDetailed(t);
  if (!r || r.ok) return false;
  const pattern = (arm.pattern ?? "_").trim() || "_";
  const where = `in the \`${pattern}\` arm of a \`!{ }\` handler whose result is used (a value position, §19.4.3)`;
  const sp = arm.span as { file?: unknown; start?: unknown } | undefined;
  const span = sp && typeof sp.file === "string" && sp.file && typeof sp.start === "number" ? sp : currentLoweringSpan();
  let err: CGError;
  if (r.refusal.code) {
    const msg = r.refusal.message.startsWith(r.refusal.code) ? r.refusal.message : `${r.refusal.code}: ${r.refusal.message}`;
    err = new CGError(r.refusal.code, `${msg} (${where}: \`${excerpt(t)}\`)`, span as any);
  } else {
    err = new CGError(
      "E-STMT-UNEXPECTED-TOKEN",
      `E-STMT-UNEXPECTED-TOKEN: unexpected token — no statement begins at \`${excerpt(r.refusal.text || t)}\` ` +
        `${where}: \`${excerpt(t)}\`. The compiler cannot read this arm's block, so it cannot tell what value ` +
        `the arm yields — and in a value position every arm must yield a value or leave. Separate the arm's ` +
        `statements with \`;\`, or move its work into a function and call that.`,
      span as any,
    );
  }
  recordRefusedLowering(err, arm as object);
  return true;
}

/**
 * S470 s470-await-residue fix round 3 (ruling S470 "Emit E-ERROR-012 (Recommended)") — SPEC §19.4.3 /
 * §19.4.4: in a VALUE position every `!{ }` arm SHALL yield a value of the call's success type or
 * LEAVE (`return` / `fail` on every path, or a `break` / `continue` out of an enclosing loop); an arm
 * that does neither FALLS THROUGH, and that SHALL be a compile error, **E-ERROR-012**. impl#1 never
 * emitted it: it lowered the arm and then wrote the call's raw result — on a handled failure, the
 * ERROR ENVELOPE, a truthy object — into the binding / cell (`g-handled-error-arm-failure-writes-
 * envelope-into-cell`, `g-impl1-value-position-arm-fallthrough-s451`), so a later `if (@ok)` passed
 * for a wrong password.
 *
 * Whether an arm yields, by §18.5's rule and impl#1's ONE reading of an arm (the same predicates the
 * value lowering uses — `armBlockStatementsDetailed`, `_blockTailIsValueExpr`): an expression arm
 * yields; a block yields when its tail is an expression (a brace holding one expression is that
 * expression), a `lift <value>`, or a handled call (its handler's value); a `fail` arm, and a block
 * whose tail leaves on every path (`return` / `fail` / `break` / `continue`, an `if` / `else` whose
 * every branch leaves), leaves. Everything else — a write, a declaration, an empty block, a loop —
 * falls through. A block the reader cannot read is `refuseUnreadableValueArm`'s (not judged here).
 */
export function valueArmFallsThrough(
  arm: { handler?: string; failExpr?: unknown },
  isValueTail: (text: string) => boolean,
): boolean {
  if (!arm || arm.failExpr) return false;
  const t = (arm.handler ?? "").trim();
  if (t === "") return true;
  const LEAVE = /^(return|fail|break|continue)(?![A-Za-z0-9_$])/;
  if (!(t.startsWith("{") && t.endsWith("}"))) {
    if (LEAVE.test(t) || /^lift(?![A-Za-z0-9_$])/.test(t)) return false;
    return !isValueTail(t) || textHasWrite(t);
  }
  if (!t.slice(1, -1).trim()) return true;
  const r = armBlockStatementsDetailed(t);
  if (!r || !r.ok) return false;
  return armStatementsFallThrough(r.stmts as any[], isValueTail);
}

/** The block-arm half of `valueArmFallsThrough`, on an arm's parsed statements (a `match` block arm too). */
export function armStatementsFallThrough(stmts: any[], isValueTail: (text: string) => boolean): boolean {
  const LEAVE = /^(return|fail|break|continue)(?![A-Za-z0-9_$])/;
  if (!Array.isArray(stmts) || stmts.length === 0) return true;
  const leaves = (st: any): boolean => {
    if (!st || typeof st !== "object") return false;
    if (st.kind === "return-stmt" || st.kind === "fail-expr" || st.kind === "fail-stmt" ||
        st.kind === "break-stmt" || st.kind === "continue-stmt") return true;
    if (st.kind === "if-stmt") {
      const last = (v: unknown): any => Array.isArray(v) ? v[v.length - 1] : v;
      return !!st.alternate && leaves(last(st.consequent)) && leaves(last(st.alternate));
    }
    if (st.kind === "bare-expr" && typeof st.expr === "string" && LEAVE.test(st.expr.trim())) return true;
    return false;
  };
  const tail = stmts[stmts.length - 1];
  if (leaves(tail)) return false;
  if (tail && tail.kind === "lift-expr") return false;
  // fix round 4 (1) — a handled call as the tail yields its handler's value: only when its own arms
  // yield (or leave), recursively; a nested arm that falls through leaves the envelope.
  if (tail && tail.kind === "guarded-expr" && tail.guardedNode && tail.guardedNode.kind === "bare-expr") {
    const inner = Array.isArray(tail.arms) ? tail.arms : [];
    return inner.length === 0 || inner.some((a: any) => valueArmFallsThrough(a, isValueTail));
  }
  if (tail && tail.kind === "bare-expr" && !tail._onMountEffect) {
    const text = typeof tail.expr === "string" ? tail.expr : "";
    // fix round 4 (2, 3) — a tail that WRITES anywhere in it (an assignment, a compound / logical
    // assignment, `++` / `--`, in parentheses, a ternary branch, a comma, `&&` / `||`) falls through:
    // its value is the write's, not a value of the success type.
    if (text && isValueTail(text) && !exprHasWrite(tail.exprNode ?? null, text)) return false;
  }
  return true;
}

/**
 * fix round 4 — whether an arm's value expression WRITES (outside a nested function): an assignment
 * of any operator, an update (`++` / `--`, prefix or postfix), at any depth. An expression the
 * parser kept only as text (an escape hatch, e.g. a comma sequence) is read for `=` / `++` / `--`
 * (fail closed: a `=` in a string counts too).
 */
export function exprHasWrite(node: unknown, text: string): boolean {
  const WRITE_TEXT = /\+\+|--|(?<![=!<>])=(?![=>])/;
  if (!node || typeof node !== "object") return WRITE_TEXT.test(text);
  const seen = new WeakSet<object>();
  const walk = (v: unknown): boolean => {
    if (!v || typeof v !== "object" || seen.has(v as object)) return false;
    seen.add(v as object);
    if (Array.isArray(v)) return v.some(walk);
    const n = v as any;
    if (n.kind === "lambda") return false;
    if (n.kind === "assign") return true;
    if (n.kind === "unary" && (n.op === "++" || n.op === "--")) return true;
    if (n.kind === "escape-hatch") {
      if (typeof n.bodyRaw === "string") return false; // a function value
      return typeof n.raw === "string" && WRITE_TEXT.test(n.raw);
    }
    for (const k of Object.keys(n)) {
      if (k === "span") continue;
      if (walk(n[k])) return true;
    }
    return false;
  };
  return walk(node);
}

function textHasWrite(text: string): boolean {
  let node: unknown = null;
  try { node = parseExprToNode(text, "<arm-value>", 0); } catch { node = null; }
  return exprHasWrite(node, text);
}

/** The E-ERROR-012 diagnostic (§19.4.3's message), recorded against the arm. */
export function refuseFallThroughValueArm(
  arm: { pattern?: string; binding?: string; handler?: string; span?: unknown },
  calleeName: string,
  position: string,
): void {
  const pat = (arm.pattern ?? "_").trim() || "_";
  const pattern = arm.binding && arm.binding.trim() && arm.binding.trim() !== "_" && pat !== "_" ? `${pat}(${arm.binding.trim()})` : pat;
  const sp = arm.span as { file?: unknown; start?: unknown } | undefined;
  const span = sp && typeof sp.file === "string" && sp.file && typeof sp.start === "number" ? sp : currentLoweringSpan();
  recordRefusedLowering(new CGError(
    "E-ERROR-012",
    `E-ERROR-012: Arm '${pattern}' of the handler on '${calleeName}(…)' produces no value, but the handler's ` +
      `result is used here (${position}). In a value position every arm must yield a value of '${calleeName}'s ` +
      `success type or leave with 'return' / 'fail' (§19.4.3). End the arm with a fallback value (e.g. ` +
      `'| ${pattern} :> { …; lift fallback; }' — a block arm yields with \`lift\`, §18.5), leave with 'return', or ` +
      `call '${calleeName}(…) !{ … }' as a statement and keep the writes in its arms. (Before, impl#1 wrote the ` +
      `call's error value — a truthy object — into the target when this arm ran.)`,
    span as any,
  ), arm as object);
}

/**
 * The statements of a server `{ … }` arm body, parsed (see file header). Returns
 * null when there is nothing to structure: not server mode, not a statement
 * block, or an empty block. A body the parser refuses is a compile error and
 * reads as an inert placeholder — never null.
 */
export function serverArmBlockStatements(
  text: string,
  mode: Mode,
  anchor?: object | null,
  opts?: { alwaysBlock?: boolean; where?: string },
): any[] | null {
  if (mode !== "server") return null;
  const t = (text ?? "").trim();
  // `alwaysBlock`: a braced `!{}` handler body is a statement block even when its
  // text would also read as an object literal (emitArmBody's rule).
  if (opts?.alwaysBlock ? !(t.startsWith("{") && t.endsWith("}")) : !isStatementBlockText(t)) return null;
  if (!t.slice(1, -1).trim()) return null;
  const r = armBlockStatementsDetailed(t);
  if (r && r.ok && Array.isArray(r.stmts) && r.stmts.length > 0) return r.stmts;
  refuseServerArm(t, r && !r.ok ? r.refusal : { code: null, message: "", text: t }, anchor, opts?.where);
  return [{ kind: "bare-expr", expr: "null", exprNode: NULL_LIT(), _armRefusedPlaceholder: true }];
}

/**
 * The parsed ExprNode of a server arm VALUE. `node` (the builder's own parse,
 * when the arm carries one) wins; otherwise the text is parsed. A parse that
 * fails, falls back to an escape hatch, or would drop trailing content is a
 * compile error (see file header) and reads as an inert `null` — never null.
 */
export function serverArmExprNode(text: string, mode: Mode, node?: any, anchor?: object | null): any | null {
  if (mode !== "server") return null;
  if (readableExpr(node)) return node;
  const t = (text ?? "").trim();
  if (!t) return null;
  const { result } = captureTrailingContentWarnings(() => {
    try { return parseExprToNode(t, "<match-arm>", 0); } catch { return null; }
  });
  const parsed: any = result;
  if (readableExpr(parsed)) return parsed;
  // A `{ … }` value that is a statement block is the block route's to read: its
  // refusal reason (the front-end's own code) is the useful one.
  const asBlock = isStatementBlockText(t) ? armBlockStatementsDetailed(t) : null;
  refuseServerArm(t, asBlock && !asBlock.ok ? asBlock.refusal : { code: null, message: "", text: t }, anchor);
  return NULL_LIT();
}

/**
 * S470 (ruling "Emit E-ERROR-012") — the `match` half of §19.4.3: a `match` on a failable call
 * (`__matchSubjectFailable`, stamped by the type system) whose result is USED — the value of a
 * declaration (`let m = match check(p) { … }`) or a `match` inside an expression — is a value
 * position, and an arm that neither yields a value nor leaves is E-ERROR-012. A `match` STATEMENT is
 * a statement position (fall-through allowed). Arms are read as impl#1 lowers them: an inline arm's
 * `result` text, a block arm's parsed `body`.
 */
export function failableMatchFallThroughs(
  nodes: unknown,
  isValueTail: (text: string) => boolean,
  /** fix round 4 — the expression-position arm reader (emit-control-flow `splitMultiArmString` + `parseMatchArm`). */
  readRawArm?: (raw: string) => Array<{ test: string; result: string }> | null,
): void {
  const seen = new WeakSet<object>();
  const visit = (v: unknown, valuePos: boolean, where: string): void => {
    if (!v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) visit(x, valuePos, where); return; }
    const n = v as any;
    // fix round 4 — an EXPRESSION-position `match` (`@ok = match check(p) { … }`) carries its arms as
    // raw text (`rawArms`), read the way its lowering reads them; each arm result judged by one rule.
    if (n.kind === "match-expr" && n.__matchSubjectFailable === true && valuePos && Array.isArray(n.rawArms) && !Array.isArray(n.body)) {
      const callee = n.subject && n.subject.kind === "call" && n.subject.callee && typeof n.subject.callee.name === "string" ? n.subject.callee.name : "the call";
      for (const raw of n.rawArms) {
        const arms = typeof raw === "string" && readRawArm ? readRawArm(raw) : null;
        const list = arms ?? [{ test: "?", result: "" }];
        for (const a of list) {
          const r = (a.result ?? "").trim();
          let falls: boolean;
          if (r.startsWith("{") && r.endsWith("}")) {
            const rb = r.slice(1, -1).trim() ? armBlockStatementsDetailed(r) : null;
            falls = r.slice(1, -1).trim() === "" ? true : !rb || !rb.ok ? true : armStatementsFallThrough(rb.stmts as any[], isValueTail);
          } else {
            falls = r === "" ? true
              : /^(return|fail|break|continue|lift)(?![A-Za-z0-9_$])/.test(r) ? false
              : !isValueTail(r) || textHasWrite(r);
          }
          if (!falls) continue;
          const sp = n.span as { file?: unknown; start?: unknown } | undefined;
          const span = sp && typeof sp.file === "string" && typeof sp.start === "number" ? sp : currentLoweringSpan();
          recordRefusedLowering(new CGError(
            "E-ERROR-012",
            `E-ERROR-012: Arm '${String(a.test ?? "?")}' of the \`match\` on '${callee}(…)' produces no value, but the match's ` +
              `result is used here (${where}). In a value position every arm must yield a value of '${callee}'s success ` +
              `type or leave with 'return' / 'fail' (§19.4.3). End the arm with a value, leave with 'return', or write ` +
              `the \`match\` as a statement and keep the writes in its arms.`,
            span as any,
          ), n as object);
          break;
        }
      }
    }
    if (n.kind === "match-expr" && n.__matchSubjectFailable === true && valuePos && Array.isArray(n.body)) {
      const callee = typeof n.header === "string" ? (n.header.trim().match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "the call") : "the call";
      for (const arm of Array.isArray(n.body) ? n.body : []) {
        if (!arm || typeof arm !== "object") continue;
        let falls = false;
        if (arm.kind === "match-arm-inline") {
          const r = typeof arm.result === "string" ? arm.result.trim() : "";
          falls = r === "" ? true
            : /^(return|fail|break|continue|lift)(?![A-Za-z0-9_$])/.test(r) ? false
            : !isValueTail(r) || exprHasWrite(arm.resultExpr ?? null, r);
        } else if (arm.kind === "match-arm-block") {
          falls = armStatementsFallThrough(arm.body, isValueTail);
        }
        if (!falls) continue;
        const pat = arm.kind === "match-arm-inline" ? String(arm.test ?? "_")
          : arm.isWildcard ? "_" : `.${String(arm.variant ?? "?")}${arm.binding ? `(${arm.binding})` : ""}`;
        const sp = (arm.span ?? n.span) as { file?: unknown; start?: unknown } | undefined;
        const span = sp && typeof sp.file === "string" && typeof sp.start === "number" ? sp : currentLoweringSpan();
        recordRefusedLowering(new CGError(
          "E-ERROR-012",
          `E-ERROR-012: Arm '${pat}' of the \`match\` on '${callee}(…)' produces no value, but the match's result is ` +
            `used here (${where}). In a value position every arm must yield a value of '${callee}'s success type or ` +
            `leave with 'return' / 'fail' (§19.4.3). End the arm with a value (a block arm yields its last ` +
            `expression or \`lift v\`, §18.5), leave with 'return', or write the \`match\` as a statement and keep ` +
            `the writes in its arms.`,
          span as any,
        ), arm as object);
      }
    }
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record") continue;
      const x = n[k];
      if (!x || typeof x !== "object") continue;
      // A declaration's `matchExpr` / initializer, and any match inside an expression, is a value.
      const declVal = k === "matchExpr" && typeof n.name === "string";
      const exprVal = k === "initExpr" || k === "exprNode" && n.kind !== "bare-expr" || k === "resultExpr" || k === "args" || k === "value";
      // A statement / function boundary ends the value position inherited from an enclosing expression.
      const boundary = typeof n.kind === "string" && (/(-stmt|-decl)$/.test(n.kind) || n.kind === "bare-expr" ||
        n.kind === "lambda" || n.kind === "match-arm-block" || n.kind === "logic" || n.kind === "markup");
      visit(x, declVal || exprVal || (valuePos && !boundary),
        declVal ? `bound to \`${String(n.name)}\`` : exprVal ? "used in an expression" : where);
    }
  };
  visit(nodes, false, "");
}
