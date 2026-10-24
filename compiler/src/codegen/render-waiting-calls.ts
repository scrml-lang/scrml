/**
 * render-waiting-calls.ts — S470 (`s470-render-position-server-call-refused`, SECURITY).
 *
 * SPEC §13.7 / §13.8: a value position — and every RENDER position is one: a markup `${ … }`
 * interpolation, a markup attribute value (`if=`, `show=`, `class=`, …), a derived formula
 * (`const <x> = …`), an `<each>` / `<match>` head, an engine `derived=` — "SHALL NOT contain an
 * expression whose value arrives only after the program waits" (E-VALUE-SERVER-CALL). A render
 * position is re-evaluated by a SYNCHRONOUS reactive effect, so a server call or an async-coloured
 * helper there yields a pending Promise, which is truthy: `<span if=${allowed(@pw)}>LOGGED IN</span>`
 * opened on a wrong password (g-markup-gate-tests-server-call-promise,
 * g-derived-cell-rhs-server-call-renders-promise). impl#1 has no async render path (§13.9 pending
 * cells are Nominal), so it refuses the call — ruling:user-voice-scrml.md S469 item 1 ("Refuse in
 * impl#1").
 *
 * ONE check. It does not classify "is this async?" itself: a render expression waits iff a function
 * whose body were that expression would be coloured async by the file's ONE async set
 * (file-async-fns.ts `asyncFnNamesOfFile` — the server functions, every function async by its body,
 * every async import incl. the Promise-returning `scrml:` exports), read off the expression TREE by
 * the colouring's own callee walk (`collectCalleeIdents`: a member call `q.includes(…)` is not a
 * call of a function named `includes` — the S469 r2 lesson). A `?{}` in the position waits too.
 *
 * Fail closed where the tree cannot decide: text the reader cannot parse (an `<each in=>` head it
 * cannot read, an escape hatch, a `!{}` arm body, a match arm) is read with the compiler's
 * tokenizer ONLY TO REFUSE (`mentionedNames`): any async function it names is a waiting call. An
 * escape hatch that carries no text is refused outright. A member call off a namespace import of a
 * scrml module (`auth.verifyPassword(…)`) is a waiting call (the same rule as
 * `waitingBindingsOfFile`).
 *
 * WHERE it looks — the AST, not the emitters (the emitters that lower a render expression are many;
 * the `markup-autoawait-all-emitters` attempt patched three and missed others). Whether a `${ }`
 * block renders is decided by emit-html's OWN predicates (`DEFAULT_LOGIC_MODE_TAGS`,
 * `stmtContainsRenderableLogic`, `stmtContainsLiftExpr`), so a §40.8 default-logic body's bare
 * expressions (mount effects) and an `on mount` body stay action positions. Action positions are
 * never walked: function bodies, event-handler and `bind:` attribute values, `<request>` / `<timer>`
 * / `<poll>` bodies, `when … changes` / message bodies, engine `effect=` / `<onTransition>` / message
 * arms. A node kind this walk does not know, met in a render context, is walked generically: every
 * expression tree in it is judged (over-refusal, never a miss).
 */

import type { ExprNode } from "../types/ast.ts";
import { collectCalleeIdents, bodyHasForeignOrSql } from "./emit-library-shared.ts";
import { templateInterpolationNodesAll, templateTextInterpolationNodes, guardCallArmsRaw, parseExprToNode } from "../expression-parser.ts";
import { mentionedNames, isExprNodeValue, STATEMENT_CHILD_KEYS } from "../failable-value-calls.ts";
import { isEventHandlerAttrName } from "../multi-statement-scan.ts";
import { DEFAULT_LOGIC_MODE_TAGS, stmtContainsRenderableLogic, stmtContainsLiftExpr, isValueFormControlFlowStmt } from "./emit-html.ts";
import { parseMatchArms } from "../match-statechild-parser.ts";
import { readShorthandBody, readBareArmBody, matchArmKey } from "../arm-body-reader.ts";
import { soleLogicBlockPayload } from "../interpolation-extent.ts";

type AnyNode = Record<string, unknown>;

/** The file's waiting-function facts (codegen/index.ts builds them from the ONE async set). */
export interface RenderWaitingFacts {
  /**
   * THE file's "is this a waiting function" predicate (file-async-fns.ts `waitingFnPredicateOfFile`,
   * the one the F4 binding judge uses): a name in the file's async set (server functions + async by
   * body + async imports) that is not a sync helper placed on the server only by its callers, or a
   * namespace import of a scrml module.
   */
  waits: (name: string) => boolean;
  /** The file's server-placed function names (for the message only). */
  serverNames: ReadonlySet<string>;
  /** Locals of `import * as NAME from "<scrml module>"` (members not classified: fail closed). */
  namespaceLocals: ReadonlySet<string>;
  filePath: string;
}

/** One render position that holds a waiting value. */
export interface RenderWaitingSite {
  /** The AST node the refusal is anchored to (one diagnostic per anchor). */
  anchor: object;
  span: unknown;
  /** The position, for the message (`the \`if=\` value of <span>`). */
  position: string;
  /** What would wait (`server function \`isOk\``, `a \`?{}\` query`, …). */
  what: string;
}

/** Statement kinds that are action positions or declarations without a render-time value. */
const SKIPPED_STATEMENT_KINDS = new Set([
  "function-decl", "type-decl", "import-decl", "export-decl", "use-decl",
  "when-effect", "when-message", "when-worker-message", "when-worker-error", "onchange-decl",
]);

/** Markup elements whose BODY is an action (run per load / tick), never rendered from a value. */
const ACTION_BODY_TAGS = new Set(["request", "timer", "poll"]);

/** Attribute-value wrapper kinds the AST builder writes on a markup attribute. */
const ATTR_VALUE_KINDS = new Set(["expr", "call-ref", "variable-ref", "string-literal", "props-block", "absent"]);

function isAttrValue(v: unknown): v is AnyNode {
  if (!v || typeof v !== "object") return false;
  const k = (v as AnyNode).kind;
  if (typeof k !== "string" || !ATTR_VALUE_KINDS.has(k)) return false;
  // A lambda's `{ kind: "expr", value }` body is an expression part, not an attribute value.
  return !(k === "expr" && "value" in (v as object) && !("raw" in (v as object)) && !("exprNode" in (v as object)));
}

class RenderWalk {
  readonly sites: RenderWaitingSite[] = [];
  private readonly reported = new WeakSet<object>();
  private readonly visited = new WeakSet<object>();

  constructor(private readonly facts: RenderWaitingFacts) {}

  // ---- the judgement ------------------------------------------------------

  private describe(name: string): string {
    if (this.facts.serverNames.has(name)) return `server function \`${name}\``;
    if (this.facts.namespaceLocals.has(name)) return `\`${name}\` (a namespace import whose members impl#1 does not classify)`;
    return `\`${name}\`, which the compiler emits async (it calls a server function or a Promise-returning helper)`;
  }

  /** A name the facts call waiting (an async function, or a namespace import — fail closed). */
  private waitingName(name: string): boolean {
    return this.facts.waits(name);
  }

  /** Text read only to refuse: the first waiting function it names, or null. */
  private textNames(text: string): string | null {
    for (const n of mentionedNames(text)) if (this.waitingName(n)) return this.describe(n);
    return null;
  }

  /** What in the expression tree `node` would wait, or null. */
  exprWaits(node: unknown): string | null {
    if (!node || typeof node !== "object") return null;
    // (1) The colouring's own callee walk, against the file's async set.
    const names = new Set<string>();
    this.callees(node, names, new WeakSet());
    for (const n of names) if (this.facts.waits(n)) return this.describe(n);
    // (2) A `?{}` query in the position.
    if (bodyHasForeignOrSql(node)) return "a `?{}` query";
    // (3) What the callee walk cannot see — read to refuse.
    return this.unseenWaits(node, new WeakSet());
  }

  /**
   * The colouring's callee walk (`collectCalleeIdents`), node by node, so that markup an
   * expression holds (`c ? <button onclick=${() => save()}>…</> : ""`) is NOT read as part of the
   * expression: its handlers are action positions, and its render positions are walked as markup
   * (`unseenWaits` → `node`). Each node is handed to `collectCalleeIdents` with its child trees
   * removed (the walk recurses itself); a `match` keeps its arms, whose text the colouring reads.
   */
  private callees(v: unknown, out: Set<string>, seen: WeakSet<object>): void {
    if (!v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) this.callees(x, out, seen); return; }
    const n = v as AnyNode;
    if (n.kind === "markup-value") return;
    const isMatch = n.kind === "match-expr" || n.kind === "match-stmt";
    const shallow: AnyNode = {};
    for (const k of Object.keys(n)) {
      const x = n[k];
      if (x && typeof x === "object") {
        if (k === "callee" && (x as AnyNode).kind === "ident") shallow[k] = x;
        else if (isMatch && (k === "body" || k === "rawArms")) shallow[k] = x;
        continue;
      }
      shallow[k] = x;
    }
    collectCalleeIdents(shallow, out);
    for (const k of Object.keys(n)) {
      if (k === "span") continue;
      if (isMatch && (k === "body" || k === "rawArms")) continue;
      this.callees(n[k], out, seen);
    }
  }

  private unseenWaits(v: unknown, seen: WeakSet<object>): string | null {
    if (!v || typeof v !== "object" || seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) {
      for (const x of v) { const r = this.unseenWaits(x, seen); if (r) return r; }
      return null;
    }
    const n = v as AnyNode;
    if (n.kind === "escape-hatch") {
      const nk = n.nativeKind;
      const raw = n.raw;
      if (nk === "Literal") return null;
      if (nk === "TemplateLiteral" && typeof raw === "string" && raw.startsWith("`")) {
        for (const e of templateInterpolationNodesAll(n as never)) { const r = this.exprWaits(e); if (r) return r; }
        return null;
      }
      if (typeof n.bodyRaw === "string") { const r = this.textNames(n.bodyRaw); if (r) return r; }
      if (typeof raw === "string" && raw.trim() !== "") return this.textNames(raw);
      if (typeof n.bodyRaw === "string") return null;
      return `an expression impl#1 cannot read (${typeof nk === "string" ? nk : "unknown"})`;
    }
    if (n.kind === "lit" && n.litType === "template" && n.hasInterpolation !== false && typeof n.raw === "string") {
      for (const e of templateInterpolationNodesAll(n as never)) { const r = this.exprWaits(e); if (r) return r; }
      return null;
    }
    if (n.kind === "call") {
      const arms = guardCallArmsRaw(n as unknown as ExprNode);
      if (arms !== null) { const r = this.textNames(arms); if (r) return r; }
      const callee = n.callee as AnyNode | undefined;
      if (callee && callee.kind === "member") {
        const obj = callee.object as AnyNode | undefined;
        if (obj && obj.kind === "ident" && typeof obj.name === "string" && this.facts.namespaceLocals.has(obj.name)) {
          return this.describe(obj.name);
        }
      }
    }
    if (n.kind === "markup-value") {
      // Markup held by an expression renders like any markup: walked as such (its own sites).
      this.node((n as { node?: unknown }).node, false);
      return null;
    }
    for (const k of Object.keys(n)) {
      if (k === "span") continue;
      const r = this.unseenWaits(n[k], seen);
      if (r) return r;
    }
    return null;
  }

  private site(anchor: object, span: unknown, position: string, what: string | null): void {
    if (what === null || this.reported.has(anchor)) return;
    this.reported.add(anchor);
    this.sites.push({ anchor, span, position, what });
  }

  private judge(node: unknown, anchor: object, span: unknown, position: string): void {
    this.site(anchor, span, position, this.exprWaits(node));
  }

  /** Expression TEXT the tree holds unparsed: read with the one expression reader, else read to refuse. */
  private judgeText(raw: unknown, anchor: object, span: unknown, position: string): void {
    if (typeof raw !== "string" || raw.trim() === "") return;
    // A head written `on=${ … }` / `if=${ … }` is carried with its `${ }`: the expression is inside
    // (read by the one reader of where a `${ }` ends).
    const text = soleLogicBlockPayload(raw) ?? raw;
    let node: unknown = null;
    try { node = parseExprToNode(text, this.facts.filePath, 0); } catch { node = null; }
    const parsed = node && typeof node === "object" && !((node as AnyNode).kind === "escape-hatch" && (node as AnyNode).nativeKind === "ParseError");
    this.site(anchor, span, position, parsed ? this.exprWaits(node) : this.textNames(raw));
  }

  private judgeAttrValue(v: AnyNode, anchor: object, span: unknown, position: string): void {
    switch (v.kind) {
      case "expr":
        if (v.exprNode && typeof v.exprNode === "object") this.judge(v.exprNode, anchor, span, position);
        else this.judgeText(v.raw, anchor, span, position);
        return;
      case "call-ref": {
        if (typeof v.name === "string" && this.waitingName(v.name)) { this.site(anchor, span, position, this.describe(v.name)); return; }
        const nodes = v.argExprNodes;
        if (Array.isArray(nodes)) { for (const a of nodes) this.judge(a, anchor, span, position); return; }
        for (const a of Array.isArray(v.args) ? v.args : []) {
          if (typeof a === "string") this.judgeText(a, anchor, span, position);
          else this.judge(a, anchor, span, position);
        }
        return;
      }
      case "variable-ref":
        if (v.exprNode && typeof v.exprNode === "object") this.judge(v.exprNode, anchor, span, position);
        else if (typeof v.name === "string" && this.waitingName(v.name)) this.site(anchor, span, position, this.describe(v.name));
        return;
      case "string-literal": {
        if (typeof v.value !== "string" || !v.value.includes("${")) return;
        // A quoted attribute with `${ … }` is emitted as a template literal evaluated at render:
        // its interpolations are read by the slicer codegen emits from.
        const start = (v.span as { start?: number } | undefined)?.start ?? 0;
        for (const e of templateTextInterpolationNodes(v.value, this.facts.filePath, start, undefined, { bare: true })) {
          this.judge(e, anchor, span, position);
        }
        return;
      }
      default:
        return;
    }
  }

  // ---- the walk -----------------------------------------------------------

  nodes(list: unknown, defaultLogic: boolean): void {
    if (!Array.isArray(list)) return;
    for (const n of list) this.node(n, defaultLogic);
  }

  node(n: unknown, defaultLogic: boolean): void {
    if (!n || typeof n !== "object" || this.visited.has(n as object)) return;
    if (Array.isArray(n)) { this.nodes(n, defaultLogic); return; }
    const node = n as AnyNode;
    const kind = node.kind;
    if (typeof kind !== "string") return;
    if (kind === "text" || kind === "comment") return;
    this.visited.add(node);
    switch (kind) {
      case "markup": this.markup(node); return;
      case "logic": this.logic(node, defaultLogic); return;
      case "state": this.nodes(node.children, false); return;
      case "each-block": this.eachBlock(node); return;
      case "match-block": this.matchBlock(node); return;
      case "engine-decl": this.engine(node); return;
      case "if-chain": {
        for (const b of Array.isArray(node.branches) ? node.branches as AnyNode[] : []) {
          if (!b || typeof b !== "object") continue;
          const el = (b.element ?? null) as AnyNode | null;
          const tag = el && typeof el.tag === "string" ? el.tag : "element";
          if (isAttrValue(b.condition)) this.judgeAttrValue(b.condition, (b.condition as object), (b.condition as AnyNode).span ?? node.span, `the \`if=\` / \`else-if=\` condition of <${tag}>`);
          else if (isExprNodeValue(b.condition)) this.judge(b.condition, b, node.span, `the \`if=\` / \`else-if=\` condition of <${tag}>`);
          this.node(el, defaultLogic);
        }
        this.node(node.elseBranch, defaultLogic);
        return;
      }
      case "component-def": this.nodes(node.defChildren, false); return;
      default:
        if (SKIPPED_STATEMENT_KINDS.has(kind)) return;
        this.generic(node, defaultLogic, `a <${kind}> render position`);
    }
  }

  private markup(n: AnyNode): void {
    const tag = typeof n.tag === "string" ? n.tag : "element";
    for (const a of Array.isArray(n.attrs) ? n.attrs as AnyNode[] : []) {
      if (!a || typeof a !== "object" || typeof a.name !== "string") continue;
      const name = a.name;
      if (isEventHandlerAttrName(name) || name.startsWith("bind:")) continue; // action positions
      if (isAttrValue(a.value)) this.judgeAttrValue(a.value, a, a.span ?? n.span, `the \`${name}=\` value of <${tag}>`);
    }
    if (ACTION_BODY_TAGS.has(tag)) return;
    if (typeof n.shorthandBodyRaw === "string" && n.shorthandBodyRaw.trim() !== "") {
      this.judgeText(n.shorthandBodyRaw, n, n.span, `the \`:\` body of <${tag}>`);
    }
    this.nodes(n.children, DEFAULT_LOGIC_MODE_TAGS.has(tag));
  }

  private logic(n: AnyNode, defaultLogic: boolean): void {
    const body = Array.isArray(n.body) ? n.body as AnyNode[] : [];
    const displayInterp = n._displayInterp === true;
    // emit-html's own rule for whether this `${ }` renders.
    // A sole value-form `match` / `if` (`${ match @x { .A :> v … } }`) renders its value too.
    const renders = defaultLogic
      ? displayInterp || body.some((s) => stmtContainsLiftExpr(s))
      : body.some((s) => stmtContainsRenderableLogic(s)) || (body.length === 1 && isValueFormControlFlowStmt(body[0]));
    for (const st of body) this.stmt(st, { renders, defaultLogic: defaultLogic && !displayInterp });
  }

  private stmt(st: unknown, c: { renders: boolean; defaultLogic: boolean }): void {
    if (!st || typeof st !== "object" || this.visited.has(st as object)) return;
    const s = st as AnyNode;
    const kind = s.kind;
    if (typeof kind !== "string" || SKIPPED_STATEMENT_KINDS.has(kind)) return;
    if (kind === "markup" || kind === "logic" || kind === "each-block" || kind === "match-block" ||
        kind === "engine-decl" || kind === "if-chain" || kind === "component-def" || kind === "state") {
      this.node(s, c.defaultLogic);
      return;
    }
    // A derived cell recomputes on every change of what it reads: always a render position.
    if (kind === "state-decl") {
      this.visited.add(s);
      if (s.shape === "derived") {
        const pos = `the formula of derived \`@${String(s.name ?? "?")}\``;
        if (s.initExpr && typeof s.initExpr === "object") this.judge(s.initExpr, s, s.span, pos);
        else this.judgeText(s.init, s, s.span, pos);
      }
      return;
    }
    if (kind === "bare-expr") {
      this.visited.add(s);
      // `on mount { … }` and a §40.8 default-logic body's bare expression are effects, not renders.
      if (s._onMountEffect === true || s.refineParamGuard || c.defaultLogic || !c.renders) return;
      if (s.exprNode && typeof s.exprNode === "object") this.judge(s.exprNode, s, s.span, "the interpolation");
      else this.judgeText(s.expr, s, s.span, "the interpolation");
      return;
    }
    if (kind === "lift-expr") {
      this.visited.add(s);
      const e = s.expr as AnyNode | undefined;
      if (e && typeof e === "object") {
        if (e.kind === "markup") this.node(e.node ?? e, false);
        else if (isExprNodeValue(e)) this.judge(e, s, s.span, "the lifted value");
      }
      return;
    }
    // Any other statement renders only inside a rendering `${ }` (in a default-logic body, only one
    // that lifts markup — the rest run once at module init / mount).
    if (c.defaultLogic && !stmtContainsLiftExpr(s)) return;
    if (!c.renders) return;
    this.visited.add(s);
    this.renderStatement(s);
  }

  /** A statement evaluated while rendering (a value-form `if` / `for`, a lifting loop, a local). */
  private renderStatement(s: AnyNode): void {
    const kind = String(s.kind);
    const pos = kind === "if-stmt" ? "the condition of a rendering `if`"
      : kind === "for-stmt" || kind === "for-loop" ? "the head of a rendering `for`"
      : kind === "match-stmt" ? "a rendering `match`"
      : `a \`${kind}\` evaluated while rendering`;
    const inner = { renders: true, defaultLogic: false };
    for (const k of Object.keys(s)) {
      if (k === "span" || k === "id" || k === "params") continue;
      const v = s[k];
      if (STATEMENT_CHILD_KEYS.has(k)) {
        for (const ch of Array.isArray(v) ? v : [v]) this.stmt(ch, inner);
        continue;
      }
      if (typeof v === "string") {
        // An inline `match` arm's result, carried as text.
        if (k === "result" && kind === "match-arm-inline") this.judgeText(v, s, s.span, "a `match` arm value rendered");
        continue;
      }
      this.value(v, s, pos, inner);
    }
  }

  /** A value carried under some key of a render-position node: judged, or walked when it is a node. */
  private value(v: unknown, owner: AnyNode, pos: string, inner: { renders: boolean; defaultLogic: boolean }): void {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) this.value(x, owner, pos, inner); return; }
    if (isExprNodeValue(v)) { this.judge(v, owner, owner.span, pos); return; }
    if (isAttrValue(v)) { this.judgeAttrValue(v, owner, (v as AnyNode).span ?? owner.span, pos); return; }
    const k = (v as AnyNode).kind;
    if (typeof k === "string") this.stmt(v, inner);
  }

  /** A node kind this walk has no rule for, in a render context: every expression in it is judged. */
  private generic(n: AnyNode, defaultLogic: boolean, pos: string): void {
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "id" || k === "_record") continue;
      const v = n[k];
      if (!v || typeof v !== "object") continue;
      for (const x of Array.isArray(v) ? v : [v]) {
        if (!x || typeof x !== "object") continue;
        if (isExprNodeValue(x)) this.judge(x, n, n.span, pos);
        else if (isAttrValue(x)) this.judgeAttrValue(x, n, (x as AnyNode).span ?? n.span, pos);
        else if (typeof (x as AnyNode).kind === "string") this.node(x, defaultLogic);
      }
    }
  }

  private eachBlock(n: AnyNode): void {
    const span = n.span;
    this.judgeText(n.inExprRaw, n, span, "the `<each in=>` expression");
    this.judgeText(n.ofExprRaw, n, span, "the `<each of=>` expression");
    this.judgeText(n.keyExprRaw, n, span, "the `<each key=>` expression");
    if (isAttrValue(n.ifCond)) this.judgeAttrValue(n.ifCond, n, (n.ifCond as AnyNode).span ?? span, "the `if=` value of <each>");
    else if (typeof n.ifRaw === "string") this.judgeText(n.ifRaw, n, span, "the `if=` value of <each>");
    this.nodes(n.bodyChildren, false);
    this.nodes(n.templateChildren, false);
    this.node(n.emptyChild, false);
  }

  private matchBlock(n: AnyNode): void {
    this.judgeText(n.onExprRaw, n, n.span, "the `<match on=>` expression");
    for (const a of Array.isArray(n.attrs) ? n.attrs as AnyNode[] : []) {
      if (!a || typeof a !== "object" || typeof a.name !== "string" || isEventHandlerAttrName(a.name)) continue;
      if (isAttrValue(a.value)) this.judgeAttrValue(a.value, a, a.span ?? n.span, `the \`${a.name}=\` value of <match>`);
    }
    if (isAttrValue(n.ifCond)) this.judgeAttrValue(n.ifCond, n, (n.ifCond as AnyNode).span ?? n.span, "the `if=` value of <match>");
    // The arm bodies codegen lowers: arm-body-reader's ONE parse of each arm's text.
    const armsRaw = n.armsRaw;
    if (typeof armsRaw === "string" && armsRaw.length > 0) {
      let arms: Array<{ variantName: string; bodyForm: string; bodyRaw: string }> = [];
      try { arms = parseMatchArms(armsRaw).arms as typeof arms; } catch { arms = []; }
      for (const [i, entry] of arms.entries()) {
        if (!entry || !entry.bodyRaw || entry.bodyRaw.trim().length === 0 || entry.bodyForm === "self-closing") continue;
        const key = matchArmKey(i, entry.variantName);
        const label = `<match:${String(n.id)}:${entry.variantName}>`;
        const nodes = entry.bodyForm === "shorthand"
          ? readShorthandBody(n as object, key, entry.bodyRaw, label, this.facts.filePath, n.span, entry.bodyRaw)
          : readBareArmBody(n as object, key, entry.bodyRaw, label).nodes;
        if (Array.isArray(nodes) && nodes.length > 0) this.nodes(nodes, false);
        else this.site(n, n.span, `the <match> arm .${entry.variantName}`, this.textNames(entry.bodyRaw));
      }
    }
  }

  private engine(n: AnyNode): void {
    const pos = "the engine `derived=` expression";
    if (n.derivedExprNode && typeof n.derivedExprNode === "object") this.judge(n.derivedExprNode, n, n.span, pos);
    else this.judgeText(n.derivedExprText, n, n.span, pos);
    this.nodes(n.bodyChildren, false);
    // A `:`-shorthand state body (`<B rule=.A : expr>`) is rendered from arm-body-reader's parse.
    const meta = (n._record as { engineMeta?: { stateChildren?: unknown } } | undefined)?.engineMeta;
    const children = Array.isArray(meta?.stateChildren) ? meta!.stateChildren as AnyNode[] : [];
    const engineName = String(n.engineName ?? "?");
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      if (child.isColonShorthand !== true || typeof child.bodyRaw !== "string" || child.bodyRaw.trim() === "") continue;
      const trimmed = child.bodyRaw.trim();
      const label = `<engine:${engineName}:${String(child.tag ?? "?")}>`;
      const nodes = readShorthandBody(child, "shorthand", trimmed, label, this.facts.filePath, n.span, trimmed);
      if (Array.isArray(nodes) && nodes.length > 0) this.nodes(nodes, false);
      else this.site(child, n.span, `the \`:\` body of state .${String(child.tag ?? "?")}`, this.textNames(trimmed));
    }
  }
}

/**
 * Every render position of `nodes` (a file's top-level nodes) that holds a waiting value.
 * The caller reports each as E-VALUE-SERVER-CALL.
 */
export function renderWaitingCallsOf(nodes: unknown[], facts: RenderWaitingFacts): RenderWaitingSite[] {
  const w = new RenderWalk(facts);
  w.nodes(nodes, true);
  return w.sites;
}
