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
import { isMetaKind } from "../types/ast.ts";
import { collectCalleeIdents, bodyHasForeignOrSql } from "./emit-library-shared.ts";
import { templateInterpolationNodesAll, templateTextInterpolationNodes, guardCallArmsRaw, parseExprToNode } from "../expression-parser.ts";
import { mentionedNames, mentionedNameCounts, isExprNodeValue, STATEMENT_CHILD_KEYS } from "../failable-value-calls.ts";
import { isEventHandlerAttrName } from "../multi-statement-scan.ts";
import { DEFAULT_LOGIC_MODE_TAGS, stmtContainsRenderableLogic, stmtContainsLiftExpr, isValueFormControlFlowStmt } from "./emit-html.ts";
import { parseMatchArms } from "../match-statechild-parser.ts";
import { readShorthandBody, readBareArmBody, matchArmKey } from "../arm-body-reader.ts";
import { soleLogicBlockPayload } from "../interpolation-extent.ts";
import { filterRenderableChildren } from "./emit-variant-guard.ts";
import { readEngineBody, ENGINE_BODY_FILE, messageArmSource, onTransitionBodySource, guardSource } from "../engine-body-reader.ts";
import { parseAfterDuration } from "./parse-after-duration.ts";

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
  /**
   * s470-action-body-await — the callees whose call, written as a WHOLE cell write
   * (`@cell = f(args)`), the client emitter awaits even in a synchronous host: emit-client.ts's
   * reactive-set lift (`(async () => _scrml_reactive_set(…, await f(…)))()`, the `<request>`
   * settle machine) matches the file's server-function fetch stubs and the file's async-coloured
   * client functions (`clientAsyncFactsOf`). An imported async function is NOT lifted (it is
   * emitted as a bare call), so it is not in this set. Absent → nothing is lifted (fail closed).
   */
  lifted?: (name: string) => boolean;
  /**
   * fix round 1 (H2) — the callees an ASYNC action host (a `when` body, the engine opener
   * `effect=`) awaits at its own level: the file's client server-function names
   * (scheduling `_clientServerFnNames`) and its async-coloured client functions — the sets
   * emit-reactive-wiring / emit-client hand those emitters. Absent → none (fail closed).
   */
  awaitedInAsyncHost?: (name: string) => boolean;
  /** The file's engine variables: a write to one is an engine transition, never the lifted reactive set. */
  engineVars?: ReadonlySet<string>;
  /**
   * s470-await-residue fix round 1 (F1) — the cells a derived cell reads, transitively, off the
   * compiler's dependency graph (index.ts, Stage 7 DG edges). null = no DG node of that name.
   */
  derivedReach?: (name: string) => ReadonlySet<string> | null;
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
  /**
   * s470-action-body-await — `"action"`: the position is an ACTION position (§13.8 (i)) whose
   * impl#1 emitter runs it synchronously (module init, a `<timer>` tick, an engine hook, …), so
   * the call is not awaited there. `"render"` (absent): a render / value position.
   */
  kind?: "render" | "action";
  /**
   * s470-await-residue — an ORDER refusal (§13.8 (i)): the waiting call itself is one impl#1
   * starts without waiting (a whole cell write lifted into a detached IIFE, a bare call, a
   * `reset` of a cell whose initializer waits), and a later statement of the same synchronous
   * body observes the state from before it settles. Reported as E-IMPL1-ACTION-NOT-AWAITED with
   * the ordering message.
   */
  order?: boolean;
}

/** s470-await-residue — a waiting call a synchronous body starts and does not wait for. */
interface PendingOrder {
  anchor: object;
  span: unknown;
  pos: string;
  /** The waiting call, for the message. */
  what: string;
  /** The cell it writes (`@ok = f(…)`, `reset(@ok)`), or null for a bare call (any cell, any call observes). */
  cell: string | null;
}

/** An ordered synchronous body: the waiting calls started and not yet followed by an observer. */
interface OrderScope { pending: PendingOrder[] }

/** Loop statement kinds: a site in the body is followed by the body's next iteration. */
const LOOP_KINDS = new Set(["for-stmt", "while-stmt", "do-while-stmt", "for-expr"]);

/** Statement kinds that are action positions or declarations without a render-time value. */
const SKIPPED_STATEMENT_KINDS = new Set([
  "function-decl", "type-decl", "import-decl", "export-decl", "use-decl",
  "when-effect", "when-message", "when-worker-message", "when-worker-error", "onchange-decl",
]);

/** Plain (non-cell) declarations: their initializer is a value position (§13.7). */
const PLAIN_DECL_KINDS = new Set(["const-decl", "let-decl", "tilde-decl", "lin-decl"]);

/** Markup elements whose BODY is an action (run per load / tick), never rendered from a value. */
const ACTION_BODY_TAGS = new Set(["request", "timer", "poll", "timeout"]);

/**
 * s470-await-residue — the action bodies whose emitter now gives them an ASYNC host
 * (`colorAsyncActionBody`: a `<timer>` / `<poll>` tick, a `<timeout>` callback, a state-child
 * `effect=`, an `<onTransition>` body): a waiting call there is awaited in place, so the statements
 * after it observe the settled value. No ordering refusal applies inside them.
 */
const ASYNC_HOSTED_TAGS = new Set(["timer", "poll", "timeout"]);

/** The position label of a statement run once at module init (s470-action-body-await). */
const MODULE_INIT = "a statement run once at module init";

/** String keys of a statement that are names / tags, never expression text (read-to-refuse skips them). */
const TEXT_SKIP_KEYS = new Set([
  "kind", "id", "name", "op", "tag", "variable", "label", "binding", "pattern", "armArrow", "litType",
  "nativeKind", "shape", "parentContext",
]);

/**
 * A structural placeholder the parser leaves where it kept an expression only as the statement's
 * TEXT (a C-style `for` head's `iterExpr`, an unparsed block): no text of its own to read. The
 * statement's text is read instead (`syncStmt`).
 */
function isPlaceholderHatch(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as AnyNode;
  if (n.kind !== "escape-hatch") return false;
  if (n.nativeKind !== "SkippedExpr" && n.nativeKind !== "ParseError") return false;
  return !(typeof n.raw === "string" && n.raw.trim() !== "") && typeof n.bodyRaw !== "string";
}

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
  /** Set while walking a body re-parsed from text: its nodes' spans are relative to that text. */
  private spanOverride: unknown = null;

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
    this.sites.push({ anchor, span: this.spanOverride ?? span, position, what, kind: this.actionMode ? "action" : "render" });
  }

  /** Set while judging a synchronous action body (`syncStmt`): its sites are `kind: "action"`. */
  private actionMode = false;

  private inMode<T>(action: boolean, fn: () => T): T {
    const saved = this.actionMode;
    this.actionMode = action;
    try { return fn(); } finally { this.actionMode = saved; }
  }

  private judge(node: unknown, anchor: object, span: unknown, position: string): void {
    this.site(anchor, span, position, this.localScope ? this.exprWaitsAll(node) : this.exprWaits(node));
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
    // A markup node is a render context, also when a synchronous action body holds it.
    this.inMode(false, () => this.nodeInner(n, defaultLogic));
  }

  private nodeInner(n: unknown, defaultLogic: boolean): void {
    if (!n || typeof n !== "object" || this.visited.has(n as object)) return;
    if (Array.isArray(n)) { this.nodes(n, defaultLogic); return; }
    const node = n as AnyNode;
    const kind = node.kind;
    if (typeof kind !== "string") return;
    if (kind === "text" || kind === "comment") return;
    // A `^{ }` meta block is an effect (§22.2: compile-time, or a runtime effect), never a render;
    // markup a compile-time `emit()` splices is already in the tree this walk reads (review #5).
    // s470-action-body-await — but its body is a SYNCHRONOUS action body (a runtime `^{ }` is
    // lowered into a plain function over the capability object, `_scrml_cap.isOk(…)`, and called
    // at module init): judged as one.
    if (isMetaKind(kind)) { this.meta(node); return; }
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
    if (ACTION_BODY_TAGS.has(tag)) {
      // s470-action-body-await — the body is an action (run per load / tick), but impl#1 lowers
      // it SYNCHRONOUSLY: a `<request>` body's statements run at module init, a `<timer>` /
      // `<poll>` body inside the plain `function() { … }` callback emit-reactive-wiring
      // `emitLifecycleNode` hands `_scrml_timer_start`. Its `${ }` statements are judged as such.
      // s470-await-residue — a `<timer>` / `<poll>` / `<timeout>` body now has an async host (its
      // waiting calls are awaited in place). A `<request>` body is its own synchronous order: its
      // first whole write is the settle machine's load (a cell load, like a declaration's), but the
      // statements after it run at module init, before that load lands.
      const order = ASYNC_HOSTED_TAGS.has(tag) ? null : { pending: [] };
      // A body that runs DURING module init (a `<request>` body's statements, a `<poll>`'s immediate
      // first tick) follows the module-init statements before it.
      const atInit = tag === "request" || tag === "poll";
      for (const ch of Array.isArray(n.children) ? n.children as AnyNode[] : []) {
        if (!ch || typeof ch !== "object" || ch.kind !== "logic" || this.visited.has(ch)) continue;
        this.visited.add(ch);
        if (tag === "poll") this.lateInitFollowers.push(ch.body);
        else if (atInit) this.withOrder(this.moduleOrder, () => this.orderFollow(ch.body));
        this.withOrder(order, () => this.syncStmts(ch.body, `the body of <${tag}>`));
      }
      return;
    }
    if (typeof n.shorthandBodyRaw === "string" && n.shorthandBodyRaw.trim() !== "") {
      // A `:`-shorthand body (`<p : expr>`) is carried parsed as the element's children, whose
      // spans are relative to the body text: walked once, reported at the element (review #8).
      // A body that left no children is read as text.
      const kids = Array.isArray(n.children) ? n.children as unknown[] : [];
      if (kids.length === 0) this.judgeText(n.shorthandBodyRaw, n, n.span, `the \`:\` body of <${tag}>`);
      else this.withSpan(n.span, () => this.nodes(kids, false));
      return;
    }
    const savedHost = this.host;
    this.host = tag;
    try { this.nodes(n.children, DEFAULT_LOGIC_MODE_TAGS.has(tag)); } finally { this.host = savedHost; }
  }

  /** The innermost markup element being walked (names a module-init statement's host in the message). */
  private host: string | null = null;

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
    if (kind === "when-effect") { this.whenBody(s); return; }
    if (typeof kind !== "string" || SKIPPED_STATEMENT_KINDS.has(kind)) return;
    if (isMetaKind(kind)) { this.meta(s); return; }
    if (kind === "markup" || kind === "logic" || kind === "each-block" || kind === "match-block" ||
        kind === "engine-decl" || kind === "if-chain" || kind === "component-def" || kind === "state") {
      this.node(s, c.defaultLogic);
      return;
    }
    // A derived cell recomputes on every change of what it reads: always a render position.
    if (kind === "state-decl" && s.shape === "derived") {
      this.visited.add(s);
      const pos = `the formula of derived \`@${String(s.name ?? "?")}\``;
      if (s.initExpr && typeof s.initExpr === "object") this.judge(s.initExpr, s, s.span, pos);
      else this.judgeText(s.init, s, s.span, pos);
      return;
    }
    // s470-action-body-await — a statement that does not render runs ONCE, synchronously, at module
    // init (in a default-logic body, every statement that does not lift markup; elsewhere every
    // statement of a `${ }` that does not render). §13.8 (i) makes a body-top statement list an
    // action position, where the compiler awaits a waiting value — but impl#1 emits module-init code
    // as plain top-level statements with no async host (`if (isOk(@pw))` tested the pending Promise:
    // always truthy). Every waiting value in it is refused, except the two shapes the emitter
    // awaits or discards itself (`syncStmt`). This replaces the S470 round-2 partial rule (an
    // assignment's right-hand side and a declaration's initializer only), which left the
    // conditions and nested sub-expressions unjudged.
    if ((c.defaultLogic && !stmtContainsLiftExpr(s)) || !c.renders) {
      // s470-await-residue — module-init statements run in ONE synchronous order across the file.
      this.withOrder(this.moduleOrder, () => {
        this.orderFollow(s);
        this.syncStmt(s, this.host ? `a statement in <${this.host}> (run once at module init)` : MODULE_INIT);
      });
      return;
    }
    // A cell write while rendering: the same judgement (the write is not awaited either).
    if (kind === "state-decl") {
      // A render context re-runs reactively (it observes the write when it lands): no module-init order.
      this.withOrder(null, () => this.syncStmt(s, "a cell write while rendering"));
      return;
    }
    if (kind === "bare-expr") {
      this.visited.add(s);
      // `on mount { … }` is an effect, not a render.
      if (s._onMountEffect === true || s.refineParamGuard) return;
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
    // S470 fix round (review #2) — a plain `const` / `let` declared in a `${ }` block (outside any
    // function) is a §13.7 value position too ("an initializer … own value"): impl#1 emits it as a
    // module-level binding holding the call's result, so `${ const ok = isOk(@pw) }` held a pending
    // Promise and a later `<span if=${ok}>` opened. Its initializer is judged wherever the block is.
    if (PLAIN_DECL_KINDS.has(String(kind)) && !stmtContainsLiftExpr(s)) {
      this.visited.add(s);
      this.declInit(s);
      return;
    }
    this.visited.add(s);
    this.renderStatement(s);
  }

  /** A plain declaration's initializer: a §13.7 value position (a function VALUE is not called by being declared). */
  private declInit(s: AnyNode, action = false): void {
    const declName = typeof s.name === "string" ? s.name
      : Array.isArray(s.boundNames) && s.boundNames.length > 0 ? (s.boundNames as string[]).join(", ") : "a destructuring";
    const pos = `the initializer of \`${declName}\``;
    // A function VALUE (`const v = (w, p) => w(p)`) is not called by being declared: its body runs
    // where it is called (a waiting one is E-ASYNC-FN-ESCAPES-AS-VALUE's, §13.9.6).
    const ie = s.initExpr as AnyNode | undefined;
    const isFnValue = !!ie && typeof ie === "object" &&
      (ie.kind === "lambda" || (ie.kind === "escape-hatch" && typeof ie.bodyRaw === "string"));
    if (isFnValue) {
      // fix round 1 (H2) — in a LOCAL body (an engine body, a `^{ }`) nothing colours a local
      // function value async, so a call of it is never awaited: a function value whose body
      // waits is refused where it is declared.
      if (this.localScope) this.inMode(true, () => this.site(s, s.span, `the local function \`${declName}\``, this.exprWaitsAll(ie)));
      return;
    }
    this.inMode(action, () => {
      if (s.initExpr && typeof s.initExpr === "object" && !isPlaceholderHatch(s.initExpr)) this.judge(s.initExpr, s, s.span, pos);
      else if (typeof s.init === "string") this.judgeText(s.init, s, s.span, pos);
    });
  }

  // ---- synchronous action bodies (s470-action-body-await) -------------------
  //
  // §13.8 (i): in an ACTION position a waiting value stands at a suspension point and the compiler
  // awaits it. impl#1 has an async host for a function body, an event handler, `on mount`, a
  // `when … changes` body and an engine opener `effect=` — and NONE for the bodies judged here:
  // module-init statements, a `<request>` body, a `<timer>` / `<poll>` tick, a runtime `^{ }`, an
  // engine state-child `effect=`, an `<onTransition>` body and guard, a `(state × message)` arm, a
  // computed `after=` delay. Their emitters lower the statements into a plain synchronous host, so a
  // waiting value there is a pending Promise (always truthy). impl#1 refuses it (no new async
  // machinery — brief), except two shapes whose emission is already right:
  //   (1) a WHOLE cell write of one lifted call, `@cell = f(args)` (also under `!{ }`): emit-client's
  //       reactive-set lift awaits it in its own async IIFE (or the `<request>` settle machine);
  //   (2) a bare call statement, `f(args)`: its value is discarded (fire-and-forget).
  // In both the arguments are judged (an argument is a value). Everything else — a condition, a
  // loop head, an operand, an argument, a lambda body, a member or local assignment — is judged.

  /** Every statement of a synchronous action body. */
  private syncStmts(list: unknown, pos: string): void {
    if (!Array.isArray(list)) return;
    for (const st of list) { this.orderFollow(st); this.syncStmt(st, pos); }
  }

  private syncStmt(st: unknown, pos: string, fireAndForget = true): void {
    if (!st || typeof st !== "object" || this.visited.has(st as object)) return;
    if (Array.isArray(st)) { for (const x of st) { this.orderFollow(x); this.syncStmt(x, pos, fireAndForget); } return; }
    const s = st as AnyNode;
    const kind = s.kind;
    if (typeof kind !== "string") { this.syncParts(s, s, pos, { needText: false }); return; }
    if (kind === "when-effect") { this.whenBody(s); return; }
    if (kind === "function-decl" && this.localScope) { this.localFunction(s, pos); return; }
    if (SKIPPED_STATEMENT_KINDS.has(kind)) return;
    if (isMetaKind(kind)) { this.meta(s); return; }
    if (kind === "markup" || kind === "logic" || kind === "each-block" || kind === "match-block" ||
        kind === "engine-decl" || kind === "if-chain" || kind === "component-def" || kind === "state" ||
        kind === "lift-expr") {
      if (kind === "lift-expr") { this.stmt(s, { renders: true, defaultLogic: false }); return; }
      this.node(s, false);
      return;
    }
    if (isExprNodeValue(s)) { this.inMode(true, () => this.judge(s, s, s.span, pos)); return; }
    if (kind === "state-decl" && s.shape === "derived") { this.stmt(s, { renders: false, defaultLogic: false }); return; }
    if (PLAIN_DECL_KINDS.has(kind) && !stmtContainsLiftExpr(s)) { this.visited.add(s); this.declInit(s, true); return; }
    this.visited.add(s);
    this.inMode(true, () => {
      switch (kind) {
        case "state-decl": {
          // A §52 `<x server>` declaration's right-hand side is a server-side load (§52.4.3).
          if (s.isServer === true) return;
          if (this.liftedWrite(s)) {
            // A cell DECLARATION's initializer is a value position (§13.8's table), not a suspension
            // point: only a WRITE starts an ordered, un-waited call.
            if (s.structuralForm !== true) this.orderStart(s, pos, this.liftedWhat(s), String(s.name), s.initExpr);
            return;
          }
          // A cell DECLARATION's initializer (`<v> = …`) is a §13.7 value position; a write
          // (`@v = …`) is a statement of the action body.
          const decl = s.structuralForm === true;
          const p = decl ? `the initializer of cell \`@${String(s.name ?? "?")}\``
            : `the value written to \`@${String(s.name ?? "?")}\` (${pos})`;
          this.inMode(!decl, () => {
            if (s.initExpr && typeof s.initExpr === "object" && !isPlaceholderHatch(s.initExpr)) this.judge(s.initExpr, s, s.span, p);
            else this.judgeText(s.init, s, s.span, p);
          });
          return;
        }
        case "bare-expr": {
          // `on mount { … }` has its own async host (emit-reactive-wiring colorAsyncStatements).
          if (s._onMountEffect === true || s.refineParamGuard) return;
          const ex = s.exprNode as AnyNode | undefined;
          if (fireAndForget && ex && this.firedAndForgotten(ex)) {
            // A bare WAITING call is started and not waited for: its effects are unordered.
            if (ex.kind === "call") { const w = this.exprWaits(ex); if (w !== null) this.orderStart(s, pos, w, null, ex); }
            return;
          }
          const p = pos === MODULE_INIT && ex && ex.kind === "assign" ? "the value assigned at module scope" : pos;
          if (ex && typeof ex === "object" && !isPlaceholderHatch(ex)) this.judge(ex, s, s.span, p);
          else this.judgeText(s.expr, s, s.span, p);
          return;
        }
        case "guarded-expr": {
          // `@cell = f(args) !{ … }` — the lift relocates the arm after the await (ss41). Any other
          // guarded statement tests the envelope of an un-awaited call: judged, no fire-and-forget.
          const g = s.guardedNode as AnyNode | undefined;
          if (g && typeof g === "object" && g.kind === "state-decl" && this.liftedWrite(g)) {
            this.visited.add(g);
            if (g.structuralForm !== true) this.orderStart(s, pos, this.liftedWhat(g), String(g.name), g.initExpr);
          } else this.syncStmt(g, pos, false);
          this.syncParts(s.arms, s, pos, { needText: false });
          return;
        }
        default: {
          const flags = { needText: false };
          // s470-await-residue — the ORDER of the body: an `if`'s branches are alternatives (a site
          // in the then-branch is not followed by the else-branch), and a site in a loop body is
          // followed by the loop's next iteration.
          const ord = this.order;
          const isIf = kind === "if-stmt";
          const before = ord ? ord.pending.slice() : [];
          const branchAdds: PendingOrder[] = [];
          for (const k of Object.keys(s)) {
            if (k === "span" || k === "id" || k === "_record") continue;
            const v = s[k];
            if (!v || typeof v !== "object") continue;
            if (STATEMENT_CHILD_KEYS.has(k)) {
              if (ord && isIf && (k === "consequent" || k === "alternate")) {
                ord.pending = before.filter((p) => !this.orderReported.has(p));
                this.syncStmt(v, pos, fireAndForget);
                for (const p of ord.pending) if (!before.includes(p)) branchAdds.push(p);
                continue;
              }
              this.syncStmt(v, pos, fireAndForget);
              continue;
            }
            this.syncParts(v, s, pos, flags);
          }
          if (ord && isIf) ord.pending = before.filter((p) => !this.orderReported.has(p)).concat(branchAdds);
          if (ord && LOOP_KINDS.has(kind)) {
            for (const p of ord.pending.slice()) {
              if (!before.includes(p)) this.orderReport(p, "the loop's next iteration");
            }
          }
          // A head the parser kept only as text (a placeholder where its expression would be — a
          // C-style `for` head, …): the statement's text is read to refuse.
          if (flags.needText) {
            for (const k of Object.keys(s)) {
              if (TEXT_SKIP_KEYS.has(k) || typeof s[k] !== "string") continue;
              this.site(s, s.span, pos, this.textNamesOf(s[k] as string));
            }
          }
          return;
        }
      }
    });
  }

  /** A non-statement value of a synchronous statement: an expression judged, a nested statement walked. */
  private syncParts(v: unknown, owner: AnyNode, pos: string, flags: { needText: boolean }): void {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) this.syncParts(x, owner, pos, flags); return; }
    if (isPlaceholderHatch(v)) { flags.needText = true; return; }
    if (isExprNodeValue(v)) { this.inMode(true, () => this.judge(v, owner, owner.span, pos)); return; }
    if (isAttrValue(v)) { this.inMode(true, () => this.judgeAttrValue(v, owner, (v as AnyNode).span ?? owner.span, pos)); return; }
    const k = (v as AnyNode).kind;
    if (typeof k === "string") { this.syncStmt(v, pos, false); return; }
    for (const key of Object.keys(v as object)) {
      if (key === "span") continue;
      const x = (v as AnyNode)[key];
      if (x && typeof x === "object") this.syncParts(x, owner, pos, flags);
    }
  }

  private textNamesOf(text: string): string | null { return this.textNames(text); }

  // ---- ORDER in a synchronous action body (s470-await-residue) --------------------------------
  //
  // §13.8 (i): at a suspension point the compiler waits "and resumes with what follows" — every
  // statement after a waiting call observes its settled value. The two shapes #1554 accepts in a
  // body impl#1 still runs SYNCHRONOUSLY (module init — the file's `${ }` statements, a `<request>`
  // body, an `<onMount>` tag, a runtime `^{ }` — and a `(state × message)` arm, which must return its
  // next state synchronously) are started and NOT waited for: a whole cell write `@c = f(…)` is lifted
  // into a detached `(async () => …)()`, a bare call `f(…)` runs fire-and-forget. A later statement
  // of the same body therefore read the cell from BEFORE the call (measured: a stale TRUE logged a
  // wrong password in) or raced the call's effects (`save(); @x = load()`). Such a site stays
  // accepted only when nothing after it in its body observes it; otherwise it is refused
  // (E-IMPL1-ACTION-NOT-AWAITED). What observes (`observes`, fail closed): any call / `new` /
  // `reset` / `?{}` / unparsed text, and — for a cell write — a mention of that cell; for a bare
  // call, a mention of ANY cell. Module-init statements run in ONE order across the whole file
  // (`moduleOrder`). The bodies impl#1 now runs in an async host (`<timer>` / `<poll>` / `<timeout>`,
  // engine `effect=` / `<onTransition>`, `on mount`, handlers, function bodies, `when`, the opener)
  // await the call in place: no order rule there.

  /** The ordered body being walked (null: an async-hosted body, or not an action body). */
  private order: OrderScope | null = null;
  /** The file's module-init statement order (one body: every `${ }` statement runs at init, in order). */
  private readonly moduleOrder: OrderScope = { pending: [] };
  /** Pending sites already reported (each refused once). */
  private readonly orderReported = new Set<PendingOrder>();

  private withOrder(scope: OrderScope | null, fn: () => void): void {
    const saved = this.order;
    this.order = scope;
    try { fn(); } finally { this.order = saved; }
  }

  /** A waiting call `anchor` starts without waiting for it, in the current ordered body. */
  private orderStart(anchor: AnyNode, pos: string, what: string, cell: string | null, call?: unknown): void {
    if (!this.order) return;
    // A §36 SSE generator write is a SUBSCRIPTION (emit-client GITI-026), not a value to wait for.
    const callee = call && typeof call === "object" ? (call as AnyNode).callee as AnyNode | undefined : undefined;
    if (callee && callee.kind === "ident" && typeof callee.name === "string" && this.generatorFns.has(callee.name)) return;
    this.order.pending.push({ anchor, span: this.spanOverride ?? anchor.span, pos, what, cell });
  }

  /** `st` runs after every pending site of the current body: refuse each one it observes. */
  private orderFollow(st: unknown): void {
    const ord = this.order;
    if (!ord || ord.pending.length === 0 || !st || typeof st !== "object") return;
    const kept: PendingOrder[] = [];
    for (const p of ord.pending) {
      if (this.observes(st, p.cell, new WeakSet())) {
        const line = this.spanOverride === null ? ((st as AnyNode).span as { line?: unknown } | undefined)?.line : undefined;
        this.orderReport(p, typeof line === "number" ? `a later statement (line ${line})` : "a later statement of the same body");
      }
      else kept.push(p);
    }
    ord.pending = kept;
  }

  private orderReport(p: PendingOrder, follower: string): void {
    if (this.orderReported.has(p)) return;
    this.orderReported.add(p);
    if (this.order) this.order.pending = this.order.pending.filter((x) => x !== p);
    if (this.reported.has(p.anchor)) return;
    this.reported.add(p.anchor);
    const target = p.cell === null ? "its effects" : `the write to \`@${p.cell}\``;
    this.sites.push({
      anchor: p.anchor, span: p.span, position: p.pos, kind: "action", order: true,
      what: `${p.what} and does not wait for it, but ${follower} runs before ${target} lands`,
    });
  }

  // ---- `reset(@c)` of a cell whose reset value waits (s470-await-residue) ----------------------
  //
  // §6.8.1: `reset(@c)` re-evaluates the cell's `default=` (else its initializer) and writes the
  // result. When that expression waits (`<v> = isOk(@pw)`), the runtime settles the re-run call
  // DETACHED (`_scrml_reset_apply`, S368) — the cell never holds the Promise, but `reset` returns at
  // once, so every statement after it reads the value from BEFORE the reset (measured: `reset(@v);
  // if (@v) …` with a previous TRUE logged a wrong password in, in a function body, a `when` body and
  // a handler). impl#1 awaits a reset nowhere, and the function colouring does not see one (a
  // `reset` is not a call), so it is refused wherever anything can follow it — everywhere except the
  // SOLE statement of an event-handler value (the S450 sole-root rule: nothing of that handler
  // follows it). One walk over the whole file (function bodies and handlers included) plus the
  // engine / `when` bodies parsed from text.

  /** Collect the file's waiting-reset cells (before the walk: engine / `when` bodies are judged during it). */
  beginResets(nodes: unknown): void {
    const seen = new WeakSet<object>();
    const gens = (v: unknown): void => {
      if (!v || typeof v !== "object" || seen.has(v as object)) return;
      seen.add(v as object);
      if (Array.isArray(v)) { for (const x of v) gens(x); return; }
      const n = v as AnyNode;
      if (n.kind === "function-decl" && n.isGenerator === true && typeof n.name === "string") this.generatorFns.add(n.name);
      for (const k of Object.keys(n)) if (k !== "span" && k !== "_record") gens(n[k]);
    };
    gens(nodes);
    this.collectDerivedNames(nodes);
    const cells = this.collectWaitingResetCells([nodes, ...this.textBodiesOf(nodes)]);
    this.waitingResetCells = cells.size > 0 ? cells : null;
  }

  // ---- fix round 1 (F1) — a derived cell observes what it reads ---------------------------------

  /** The file's derived cells (`const <d> = …`) and derived engines (`derived=`). */
  private readonly derivedNames = new Set<string>();

  private collectDerivedNames(nodes: unknown): void {
    const seen = new WeakSet<object>();
    const visit = (v: unknown): void => {
      if (!v || typeof v !== "object" || seen.has(v as object)) return;
      seen.add(v as object);
      if (Array.isArray(v)) { for (const x of v) visit(x); return; }
      const n = v as AnyNode;
      if (n.kind === "state-decl" && n.shape === "derived" && typeof n.name === "string") this.derivedNames.add(n.name);
      if (n.kind === "engine-decl") {
        const meta = (n._record as { engineMeta?: { varName?: unknown; derivedExpr?: unknown } } | undefined)?.engineMeta;
        if (meta && typeof meta.varName === "string" && meta.derivedExpr) this.derivedNames.add(meta.varName);
      }
      for (const k of Object.keys(n)) if (k !== "span" && k !== "_record") visit(n[k]);
    };
    visit(nodes);
  }

  /**
   * Whether a mention of `name` observes an un-waited write to `cell`: `name` is a derived cell whose
   * dependency closure (the compiler's DG) reaches `cell`. A derived name the DG has no node for is
   * taken to reach every cell (fail closed).
   */
  private derivedReaches(name: string, cell: string): boolean {
    if (!this.derivedNames.has(name)) return false;
    const reach = this.facts.derivedReach ? this.facts.derivedReach(name) : null;
    if (reach === null) return true;
    for (const r of reach) if (r === cell || r.startsWith(cell + ".") || cell.startsWith(r + ".")) return true;
    return false;
  }

  /**
   * fix round 1 (F2) — the statement lists impl#1 parses from TEXT and lowers with a cell write
   * registering its `_scrml_init_set` reset thunk (an engine opener `effect=`, emit-engine
   * `emitEngineOpenerEffect`; a `when … changes` body, read the same way, fail closed): the same
   * cached parses the walk judges (engine-body-reader `readEngineBody`, same owner / slot / file).
   */
  private textBodiesOf(nodes: unknown): unknown[] {
    const out: unknown[] = [];
    const seen = new WeakSet<object>();
    const visit = (v: unknown): void => {
      if (!v || typeof v !== "object" || seen.has(v as object)) return;
      seen.add(v as object);
      if (Array.isArray(v)) { for (const x of v) visit(x); return; }
      const n = v as AnyNode;
      if (n.kind === "engine-decl") {
        const meta = (n._record as { engineMeta?: Record<string, unknown> } | undefined)?.engineMeta;
        const opener = meta?.openerEffect;
        if (meta && typeof opener === "string" && opener.length > 0) {
          const read = readEngineBody(meta, "openerEffect", opener, ENGINE_BODY_FILE.openerEffect);
          if (read.stmts) out.push(read.stmts);
        }
      }
      if (n.kind === "when-effect" && typeof n.bodyRaw === "string" && n.bodyRaw.trim() !== "") {
        const read = readEngineBody(n, "whenBody", n.bodyRaw, "__when_body__.scrml");
        if (read.stmts) out.push(read.stmts);
      }
      for (const k of Object.keys(n)) if (k !== "span" && k !== "_record") visit(n[k]);
    };
    visit(nodes);
    return out;
  }

  /**
   * fix round 1 (F3) — bodies impl#1 emits AFTER every module-init statement (the engine opener
   * `effect=` — emit-client's opener stage; a `<poll>`'s immediate first tick — the lifecycle stage),
   * whatever their place in the text: checked against the WHOLE module-init order, at the end.
   */
  private readonly lateInitFollowers: unknown[] = [];

  /** Check the late module-init followers against every module-init site (end of the walk). */
  finishModuleOrder(): void {
    for (const f of this.lateInitFollowers) this.withOrder(this.moduleOrder, () => this.orderFollow(f));
  }

  /** The file's generator functions (a §36 SSE write subscribes; it is not an un-waited call). */
  private readonly generatorFns = new Set<string>();

  /** The cells whose reset value waits: key path (`v`, `form.w`) → what waits. */
  private waitingResetCells: Map<string, string> | null = null;
  /** `reset` nodes that are the sole statement of an event-handler value. */
  private readonly soleHandlerResets = new WeakSet<object>();

  private collectWaitingResetCells(nodes: unknown): Map<string, string> {
    const out = new Map<string, string>();
    const seen = new WeakSet<object>();
    const visit = (v: unknown, prefix: string): void => {
      if (!v || typeof v !== "object" || seen.has(v as object)) return;
      seen.add(v as object);
      if (Array.isArray(v)) { for (const x of v) visit(x, prefix); return; }
      const n = v as AnyNode;
      if (n.kind === "state-decl" && typeof n.name === "string" && n.shape !== "derived" && n.isServer !== true) {
        const key = prefix + n.name;
        const thunk = (n.defaultExpr && typeof n.defaultExpr === "object") ? n.defaultExpr
          : (n.initExpr && typeof n.initExpr === "object" && !isPlaceholderHatch(n.initExpr)) ? n.initExpr : null;
        const w = thunk ? this.exprWaits(thunk) : (typeof n.init === "string" ? this.textNames(n.init) : null);
        if (w !== null) out.set(key, w);
        if (Array.isArray(n.children)) visit(n.children, key + ".");
        for (const k of Object.keys(n)) if (k !== "children" && k !== "span" && k !== "_record") visit(n[k], prefix);
        return;
      }
      for (const k of Object.keys(n)) if (k !== "span" && k !== "_record") visit(n[k], prefix);
    };
    visit(nodes, "");
    return out;
  }

  /** The waiting cell a `reset` of `path` re-runs (the cell, or a compound's waiting child), or null. */
  private resetWaits(path: string): { key: string; what: string } | null {
    const cells = this.waitingResetCells;
    if (!cells || cells.size === 0) return null;
    for (const [key, what] of cells) if (key === path || key.startsWith(path + ".")) return { key, what };
    return null;
  }

  private resetTargetPath(t: unknown): string | null {
    if (!t || typeof t !== "object") return null;
    const n = t as AnyNode;
    if (n.kind === "ident" && typeof n.name === "string") return n.name.replace(/^@/, "");
    if (n.kind === "member" && n.computed !== true) {
      const o = this.resetTargetPath(n.object);
      const prop = typeof n.property === "string" ? n.property
        : (n.property && typeof (n.property as AnyNode).name === "string") ? String((n.property as AnyNode).name) : null;
      return o !== null && prop !== null ? `${o}.${prop}` : null;
    }
    return null;
  }

  private resetSite(anchor: object, span: unknown, path: string, hit: { key: string; what: string }): void {
    if (this.reported.has(anchor)) return;
    this.reported.add(anchor);
    this.sites.push({
      anchor, span: this.spanOverride ?? span, position: `\`reset(@${path})\``, kind: "action", order: true,
      what: `${hit.what} again (it re-runs the initializer of \`@${hit.key}\`) and does not wait for it, but what ` +
        "runs after the reset reads the value from before it",
    });
  }

  /** Every `reset` in `v` (any position) of a cell whose reset value waits, except a sole handler statement. */
  resets(v: unknown): void {
    if (this.waitingResetCells === null) return;
    this.resetWalk(v, null, new WeakSet());
  }

  private resetWalk(v: unknown, span: unknown, seen: WeakSet<object>): void {
    if (!v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) this.resetWalk(x, span, seen); return; }
    const n = v as AnyNode;
    const sp = n.span ?? span;
    if (n.kind === "reset-expr") {
      if (this.soleHandlerResets.has(n)) return;
      const path = this.resetTargetPath(n.target);
      const hit = path !== null ? this.resetWaits(path) : null;
      if (path !== null && hit) this.resetSite(n, sp, path, hit);
      else if (path === null && this.waitingResetCells!.size > 0) {
        // A target this walk cannot read: fail closed.
        const first = this.waitingResetCells!.entries().next().value as [string, string];
        this.resetSite(n, sp, "…", { key: first[0], what: first[1] });
      }
      return;
    }
    // An event-handler attribute: a `reset` that is its SOLE statement may run fire-and-forget.
    if (typeof n.name === "string" && isEventHandlerAttrName(n.name) && n.value && typeof n.value === "object") {
      const val = n.value as AnyNode;
      if (val.kind === "call-ref" && val.name === "reset") {
        const args = Array.isArray(val.argExprNodes) ? val.argExprNodes : [];
        if (args.length !== 1) {
          const a0 = Array.isArray(val.args) ? (val.args as unknown[])[0] : null;
          const path = typeof a0 === "string" ? a0.replace(/^@/, "") : null;
          const hit = path !== null ? this.resetWaits(path) : null;
          if (path !== null && hit) this.resetSite(val, sp, path, hit);
        }
        return; // sole statement: `onclick=reset(@v)`
      }
      if (val.kind === "expr") {
        const stmts = val.handlerBlock && Array.isArray((val.handlerBlock as AnyNode).stmts) ? (val.handlerBlock as AnyNode).stmts as AnyNode[] : null;
        if (!stmts || stmts.length === 1) {
          const sole = stmts ? (stmts[0]?.exprNode as AnyNode | undefined) : (val.exprNode as AnyNode | undefined);
          if (sole && sole.kind === "reset-expr") {
            this.soleHandlerResets.add(sole);
            if (val.exprNode && (val.exprNode as AnyNode).kind === "reset-expr") this.soleHandlerResets.add(val.exprNode as object);
          }
        }
        if (!val.exprNode && !val.handlerBlock && typeof val.raw === "string") this.resetText(val.raw, val, sp);
      }
    }
    if (n.kind === "escape-hatch") {
      const text = typeof n.bodyRaw === "string" ? n.bodyRaw : typeof n.raw === "string" ? n.raw : "";
      if (text) this.resetText(text, n, sp);
    }
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record") continue;
      const x = n[k];
      if (x && typeof x === "object") this.resetWalk(x, sp, seen);
    }
  }

  /** Text the tree does not carry: read only to refuse (`reset` beside a waiting cell's name). */
  private resetText(text: string, anchor: object, span: unknown): void {
    const names = mentionedNames(text);
    if (!names.has("reset")) return;
    for (const [key, what] of this.waitingResetCells!) {
      const root = key.split(".")[0]!;
      if (names.has(root)) { this.resetSite(anchor, span, root, { key, what }); return; }
    }
  }

  /** What a lifted whole write `@c = f(…)` calls (for the message). */
  private liftedWhat(s: AnyNode): string {
    const ie = s.initExpr as AnyNode | undefined;
    const callee = ie?.callee as AnyNode | undefined;
    return callee && typeof callee.name === "string" ? this.describe(callee.name) : "a waiting function";
  }

  /**
   * Whether `v` (a statement that runs after a pending site) can observe it: a call of any kind, a
   * `new`, a `reset`, a `?{}`, or text the tree does not carry (fail closed); a write's cell (read or
   * written) — any cell, for a bare call. A function VALUE (a lambda, a nested `function`) does not
   * run where it is declared; markup renders reactively (it re-renders when the write lands).
   */
  private observes(v: unknown, cell: string | null, seen: WeakSet<object>): boolean {
    if (!v || typeof v !== "object" || seen.has(v as object)) return false;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) if (this.observes(x, cell, seen)) return true; return false; }
    const n = v as AnyNode;
    const kind = n.kind;
    if (kind === "lambda" || kind === "function-decl" || kind === "markup" || kind === "markup-value") return false;
    if (typeof kind === "string" && SKIPPED_STATEMENT_KINDS.has(kind)) return false;
    if (kind === "call" || kind === "new" || kind === "reset-expr" || kind === "sql-ref" || kind === "sql" ||
        kind === "guarded-expr" || kind === "match-expr" || kind === "match-stmt") return true;
    if (kind === "escape-hatch") {
      if (n.nativeKind === "Literal") return false;
      const text = typeof n.bodyRaw === "string" ? n.bodyRaw : typeof n.raw === "string" ? n.raw : "";
      return text.trim() !== "" || !isPlaceholderHatch(n);
    }
    const mentions = (name: string): boolean => cell === null || name === cell || name.startsWith(cell + ".") || this.derivedReaches(name, cell);
    if (kind === "ident" && typeof n.name === "string" && n.name.startsWith("@")) return mentions(n.name.slice(1));
    if (kind === "state-decl" && typeof n.name === "string" && mentions(n.name)) return true;
    if (kind === "lit" && n.litType === "template" && n.hasInterpolation !== false && typeof n.raw === "string") {
      for (const e of templateInterpolationNodesAll(n as never)) if (this.observes(e, cell, seen)) return true;
      return false;
    }
    // A statement that holds its expression only as text (no tree): fail closed.
    const treeless = (textKey: string, treeKey: string): boolean =>
      typeof n[textKey] === "string" && (n[textKey] as string).trim() !== "" && (!n[treeKey] || typeof n[treeKey] !== "object");
    if (kind === "bare-expr" && treeless("expr", "exprNode")) return true;
    if ((kind === "state-decl" || (typeof kind === "string" && PLAIN_DECL_KINDS.has(kind))) && treeless("init", "initExpr")) return true;
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record" || k === "id") continue;
      const x = n[k];
      if (x && typeof x === "object" && this.observes(x, cell, seen)) return true;
    }
    return false;
  }

  /**
   * Shape (1): `@cell = f(args)` — a non-derived cell write whose whole value is ONE call of a
   * function the emitter's reactive-set lift awaits (`facts.lifted`), to a cell that is not an
   * engine variable, with no waiting argument.
   */
  private liftedWrite(s: AnyNode): boolean {
    if (s.kind !== "state-decl" || s.shape === "derived" || s.isServer === true) return false;
    // fix round 1 (H1) — a `^{ }` body is lowered through the capability object
    // (`_scrml_cap.isOk(…)`), which the reactive-set lift does not match: no write is awaited there.
    if (this.noLift) return false;
    const lifted = this.facts.lifted;
    if (!lifted) return false;
    const name = typeof s.name === "string" ? s.name : "";
    if (name === "" || name.includes(".") || this.facts.engineVars?.has(name)) return false;
    const ie = s.initExpr as AnyNode | undefined;
    if (!ie || ie.kind !== "call" || ie.optional === true) return false;
    const callee = ie.callee as AnyNode | undefined;
    if (!callee || callee.kind !== "ident" || typeof callee.name !== "string" || !lifted(callee.name)) return false;
    return (Array.isArray(ie.args) ? ie.args : []).every((a) => this.exprWaits(a) === null);
  }

  /** Shape (2): a bare call statement `f(args)` (value discarded) with no waiting argument or receiver. */
  private firedAndForgotten(ex: AnyNode): boolean {
    // A function value written as a statement (`effect=${ () => f() }`) is never called: nothing runs.
    if (ex.kind === "lambda") return true;
    if (ex.kind !== "call") return false;
    if (guardCallArmsRaw(ex as unknown as ExprNode) !== null) return false;
    const callee = ex.callee as AnyNode | undefined;
    if (!callee || typeof callee !== "object") return false;
    if (callee.kind === "member") {
      if (this.exprWaits(callee.object) !== null) return false;
    } else if (callee.kind !== "ident") return false;
    return (Array.isArray(ex.args) ? ex.args : []).every((a) => this.exprWaits(a) === null);
  }

  /** A `^{ }` block: its body is a synchronous action body. */
  private meta(n: AnyNode): void {
    if (this.visited.has(n)) return;
    this.visited.add(n);
    // s470-await-residue — a runtime `^{ }` runs once at module init: in the module-init order.
    this.withOrder(this.moduleOrder, () => this.inLocal(true, () => this.syncStmts(n.body, "a runtime `^{ }` body")));
  }

  // ---- local bodies (fix round 1, H1 / H2) ----------------------------------

  /**
   * Set while walking a body impl#1 lowers OUTSIDE the file's async colouring — an engine body, a
   * `^{ }`, a `when` body, the opener `effect=`: a function declared there is not coloured, so
   * nothing awaits a call of it (H2), and a waiting function read as a value there is followed by
   * no other check (E-ASYNC-FN-ESCAPES-AS-VALUE does not reach these bodies).
   */
  private localScope = false;
  /** Set while walking a `^{ }` body: the whole-write lift does not reach it (H1). */
  private noLift = false;

  private inLocal(meta: boolean, fn: () => void): void {
    const sl = this.localScope, sn = this.noLift;
    this.localScope = true;
    if (meta) this.noLift = true;
    try { fn(); } finally { this.localScope = sl; this.noLift = sn; }
  }

  /** A `function` declared inside a local body: a body that waits is refused (nothing awaits its calls). */
  private localFunction(s: AnyNode, pos: string): void {
    this.visited.add(s);
    const name = typeof s.name === "string" ? s.name : "?";
    this.inMode(true, () => this.site(s, s.span, `the local function \`${name}\` declared in ${pos}`, this.exprWaitsAll(s)));
  }

  /** Every waiting thing in a whole subtree, a waiting function read as a value included. */
  private exprWaitsAll(node: unknown): string | null {
    return this.exprWaits(node) ?? this.valueRefWaits(node, new WeakSet());
  }

  /**
   * A waiting function READ AS A VALUE (`const f = isOk`, `xs.some(isOk)`), not called. A member's
   * property name is not a read of a function of that name (the S469 r2 lesson).
   */
  private valueRefWaits(v: unknown, seen: WeakSet<object>): string | null {
    if (!v || typeof v !== "object" || seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) { const r = this.valueRefWaits(x, seen); if (r) return r; } return null; }
    const n = v as AnyNode;
    if (n.kind === "markup-value") return null;
    if (n.kind === "ident" && typeof n.name === "string" && !n.name.startsWith("@") && this.facts.waits(n.name)) {
      return `${this.describe(n.name)}, read as a value`;
    }
    for (const k of Object.keys(n)) {
      if (k === "span") continue;
      if (k === "callee" && n.kind === "call" && (n.callee as AnyNode | undefined)?.kind === "ident") continue;
      if (k === "property" && n.kind === "member" && n.computed !== true) continue;
      const r = this.valueRefWaits(n[k], seen);
      if (r) return r;
    }
    return null;
  }

  // ---- async action hosts: a `when … changes` body, the engine opener `effect=` ----------------
  //
  // Both are lowered into an async wrapper whose OWN level awaits a call of a function in
  // `facts.awaitedInAsyncHost` (emit-logic `when-effect`, emit-engine `emitEngineOpenerEffect`).
  // Nothing else there is awaited: a call inside a nested function (a lambda, a callback such as
  // `[@pw].forEach(x => isOk(x))`, a `function` expression, a local `function`, an IIFE), a member
  // call off a namespace import, a waiting function read as a value, or a waiting callee outside
  // that set. Each is refused (fix round 1, H2 / L2). Read through engine-body-reader's one parse
  // (the opener: the parse emit-engine lowers; a `when` body: the same reader over its `bodyRaw`).

  private asyncHost(stmts: unknown[] | null, raw: string, anchor: AnyNode, span: unknown, pos: string): void {
    this.inMode(true, () => this.withSpan(span, () => {
      if (!stmts) { this.site(anchor, span, pos, this.textNames(raw)); return; }
      // fix round 4 — the ACCOUNTING INVARIANT (R2 / R3, the third hole in this walk). The source
      // text of each statement (the parse's span over the wrapped body engine-body-reader parsed;
      // the whole body when a span cannot be placed) is read with the compiler's name reader
      // (`mentionedNameCounts`, the `mentionedNames` reader counting occurrences: template
      // interpolations and nested functions included, string contents and property names
      // excluded). The statement is accepted only when the number of waiting-name occurrences in
      // it EQUALS the number of call sites this walk accepted as awaited at the host's own level.
      // Any occurrence the walk did not see (a callback inside a template interpolation, a head
      // carried as text, a shape not thought of) is a mismatch: refused, fail closed.
      const wrapped = "${\n" + raw + "\n}";
      let placed = true;
      let acceptedTotal = 0;
      let refusedAny = false;
      for (const st of stmts) {
        if (!st || typeof st !== "object") continue;
        this.acceptedAwaitedCalls = 0;
        const why = this.asyncWaits(st, false, new WeakSet());
        const accepted = this.acceptedAwaitedCalls;
        acceptedTotal += accepted;
        if (why !== null) { refusedAny = true; this.site(st as object, span, pos, why); continue; }
        const sp = (st as AnyNode).span as { start?: unknown; end?: unknown } | undefined;
        const text = sp && typeof sp.start === "number" && typeof sp.end === "number" && sp.end > sp.start && sp.end <= wrapped.length
          ? wrapped.slice(sp.start, sp.end) : null;
        if (text === null) { placed = false; continue; }
        const named = this.waitingNameCount(text);
        if (named !== accepted) {
          refusedAny = true;
          this.site(st as object, span, pos, this.unaccountedWhy(named, accepted));
        }
      }
      // A statement whose text could not be placed: the same invariant over the whole body.
      if (!placed && !refusedAny) {
        const named = this.waitingNameCount(raw);
        if (named !== acceptedTotal) this.site(anchor, span, pos, this.unaccountedWhy(named, acceptedTotal));
      }
    }));
  }

  /** Call sites `asyncWaits` accepted as awaited at the host's own level (fix round 4). */
  private acceptedAwaitedCalls = 0;

  /** How many times `text` names a waiting function (the occurrence-counting name reader). */
  private waitingNameCount(text: string): number {
    let n = 0;
    for (const [name, c] of mentionedNameCounts(text)) if (this.facts.waits(name)) n += c;
    return n;
  }

  private unaccountedWhy(named: number, accepted: number): string {
    return `a waiting function (its text names one ${named} time${named === 1 ? "" : "s"}, but only ${accepted} ` +
      `of those ${accepted === 1 ? "is a call" : "are calls"} impl#1 awaits at this body's own level — e.g. a call inside a ` +
      "template-literal interpolation's callback, which impl#1 does not await here)";
  }

  private asyncWaits(v: unknown, inFn: boolean, seen: WeakSet<object>): string | null {
    if (!v || typeof v !== "object" || seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) { const r = this.asyncWaits(x, inFn, seen); if (r) return r; } return null; }
    const n = v as AnyNode;
    const kind = n.kind;
    if (kind === "markup-value") return null;
    if (kind === "function-decl" || kind === "lambda") inFn = true;
    // fix round 3 (R1) — a C-style `for` head is carried as TOKENIZED text whose string / template
    // literals have lost their delimiters (`isOk("wrong")` → `isOk ( wrong )`; a template collapses to
    // `${…}` and its `cStyleParts` condition to a bare `$` ident), so the parsed parts this walk reads
    // are not the head the opener `effect=` emits (`for (let i = 0; $; i++)`, measured — a global `$`
    // logged a wrong password in). Outside a `when` body, a head that names a waiting function is
    // refused (the f55eb8d4a behaviour). A `when` body lowers the head from its own `bodyRaw`
    // correctly (reviewer-confirmed: `${await …}`): there the head is judged by the invariant below.
    if (kind === "for-stmt" && n.cStyleParts && typeof n.cStyleParts === "object") {
      const textW = typeof n.iterable === "string" ? this.textNames(n.iterable) : null;
      // In a `when` body the head is judged by the accounting invariant (`asyncHost`): its text's
      // waiting-name occurrences must all be accepted calls in the parsed parts (fix round 4 — an
      // any-match let a decoy call vouch for a hidden one, R2).
      if (textW !== null && !this.whenHost) return `${textW}, in a C-style \`for\` head (impl#1 does not lower that head faithfully here)`;
    }
    // A `!{ }`-handled call in a `when` body is lowered into a synchronous value IIFE
    // (`(() => { let r = f(…); if (r && r.__scrml_error) … })()`): the call is not awaited and the
    // handler tests a pending Promise (measured: wrong password logged in). Refused there.
    if (kind === "guarded-expr" && this.whenHost) {
      const w = this.exprWaits(n.guardedNode);
      if (w) return `${w}, handled with \`!{ }\` (impl#1 lowers that handler in a \`when\` body without awaiting the call)`;
    }
    if (kind === "escape-hatch") {
      if (n.nativeKind === "Literal") return null;
      const text = typeof n.bodyRaw === "string" ? n.bodyRaw : typeof n.raw === "string" ? n.raw : "";
      if (text.trim() === "") return isPlaceholderHatch(n) ? null : "an expression impl#1 cannot read";
      // Text the reader cannot place (a `function` expression, an unparsed expression): any
      // waiting name in it is refused (fail closed).
      const named = this.textNames(text);
      return named !== null && (typeof n.bodyRaw === "string" || inFn)
        ? `${named}, inside a nested function (a callback or a local function)` : named;
    }
    if (kind === "ident" && typeof n.name === "string" && !n.name.startsWith("@") && this.facts.waits(n.name)) {
      return `${this.describe(n.name)}, read as a value`;
    }
    // fix round 4 — a template literal's interpolations are expressions of this statement (the
    // compiler's one template slicer): walked like any other, so an own-level call there is
    // accepted (and counted for the invariant) and a callback there is a nested function (R3).
    if (kind === "lit" && n.litType === "template" && n.hasInterpolation !== false && typeof n.raw === "string") {
      for (const e of templateInterpolationNodesAll(n as never)) {
        const r = this.asyncWaits(e, inFn, seen);
        if (r) return r;
      }
      return null;
    }
    if (kind === "call") {
      const arms = guardCallArmsRaw(n as unknown as ExprNode);
      if (arms !== null) { const r = this.textNames(arms); if (r) return r; }
      const callee = n.callee as AnyNode | undefined;
      if (callee && callee.kind === "ident" && typeof callee.name === "string") {
        const nm = callee.name;
        if (this.facts.waits(nm) && (inFn || !(this.facts.awaitedInAsyncHost?.(nm) ?? false))) {
          return inFn ? `${this.describe(nm)}, inside a nested function (a callback or a local function)` : this.describe(nm);
        }
        // fix round 2 (N1) — an OPTIONAL call `f?.(…)` of a server function is emitted without
        // `await` in these hosts (`_scrml_fetch_isOk_6?.("wrong")`, measured: the opener logged
        // in). Refused for every waiting callee (a helper's optional call happens to be awaited;
        // not relied on).
        if (this.facts.waits(nm) && n.optional === true) {
          return `${this.describe(nm)}, called optionally (\`${nm}?.(…)\`, which impl#1 does not await here)`;
        }
        // An own-level call of a function this host awaits: counted for the invariant (`asyncHost`).
        if (this.facts.waits(nm)) this.acceptedAwaitedCalls++;
      } else if (callee && callee.kind === "member") {
        const obj = callee.object as AnyNode | undefined;
        if (obj && obj.kind === "ident" && typeof obj.name === "string" && this.facts.namespaceLocals.has(obj.name)) {
          return this.describe(obj.name);
        }
      }
    }
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record") continue;
      // fix round 2 — a C-style `for` head is carried parsed in `cStyleParts` (walked); its
      // `iterExpr` is the parser's SkippedExpr placeholder holding the same head as text.
      if (k === "iterExpr" && n.cStyleParts && typeof n.cStyleParts === "object" &&
          (n.iterExpr as AnyNode | undefined)?.nativeKind === "SkippedExpr") continue;
      if (k === "callee" && kind === "call" && (n.callee as AnyNode | undefined)?.kind === "ident") continue;
      if (k === "property" && kind === "member" && n.computed !== true) continue;
      const r = this.asyncWaits(n[k], inFn, seen);
      if (r) return r;
    }
    return null;
  }

  /** A `when … changes { }` body (its `bodyRaw`, read once). */
  private whenBody(s: AnyNode): void {
    if (this.visited.has(s)) return;
    this.visited.add(s);
    const raw = typeof s.bodyRaw === "string" ? s.bodyRaw : "";
    if (raw.trim() === "") return;
    const read = readEngineBody(s, "whenBody", raw, "__when_body__.scrml");
    const saved = this.whenHost;
    this.whenHost = true;
    try {
      this.withOrder(null, () => this.inLocal(false, () => this.asyncHost(read.stmts, raw, s, s.span, "a `when … changes` body")));
      this.withSpan(s.span, () => this.resets(read.stmts));
    }
    finally { this.whenHost = saved; }
  }

  /** Set while walking a `when` body (its `!{ }` lowering is not awaited, see `asyncWaits`). */
  private whenHost = false;

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
      try { arms = parseMatchArms(armsRaw).arms as typeof arms; } catch {
        // The arm reader could not split the body: read it to refuse (fail closed, review #11).
        this.site(n, n.span, "a <match> arm body", this.textNames(armsRaw));
        arms = [];
      }
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
    // S470 fix round 2 (review #1) — `<engine … if=${…}>` is a render gate: emit-html
    // `emitGatedStructural` gates the engine host on `engine-decl.ifCond`. Judged as <match>'s is.
    if (isAttrValue(n.ifCond)) {
      this.judgeAttrValue(n.ifCond, n.ifCond as object, (n.ifCond as AnyNode).span ?? n.span, "the `if=` value of <engine>");
    }
    // S470 fix round (review #3) — only a state child's RENDERED body is a render position, read as
    // codegen renders it (emit-engine `buildEngineArms`): the `bodyChildren` markup node of each
    // state child's tag, its children filtered by emit-variant-guard's `filterRenderableChildren`.
    // A state child's attributes are engine configuration (`rule=`, `effect=` — an action body, as
    // are `<onTransition>` / `<onTimeout>` / message arms) and an engine-level `<onTransition>` is
    // an action: none of them is walked.
    const meta = (n._record as { engineMeta?: { stateChildren?: unknown } } | undefined)?.engineMeta;
    const children = Array.isArray(meta?.stateChildren) ? meta!.stateChildren as AnyNode[] : [];
    const byTag = new Map<string, AnyNode>();
    for (const bc of Array.isArray(n.bodyChildren) ? n.bodyChildren as AnyNode[] : []) {
      if (bc && typeof bc === "object" && bc.kind === "markup" && typeof bc.tag === "string" && !byTag.has(bc.tag)) byTag.set(bc.tag, bc);
    }
    const engineName = String(n.engineName ?? "?");
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const tag = String(child.tag ?? "?");
      const el = byTag.get(tag) ?? null;
      const span = (el?.span ?? n.span) as unknown;
      if (child.isColonShorthand === true) {
        // A `:`-shorthand state body (`<B rule=.A : expr>`) is rendered from arm-body-reader's parse
        // (review #8: reported once, at the state child).
        if (typeof child.bodyRaw !== "string" || child.bodyRaw.trim() === "") continue;
        const trimmed = child.bodyRaw.trim();
        const label = `<engine:${engineName}:${tag}>`;
        const nodes = readShorthandBody(child, "shorthand", trimmed, label, this.facts.filePath, n.span, trimmed);
        if (Array.isArray(nodes) && nodes.length > 0) this.withSpan(span, () => this.nodes(nodes, false));
        else this.site(child, span, `the \`:\` body of state .${tag}`, this.textNames(trimmed));
        continue;
      }
      if (el) this.nodes(filterRenderableChildren(el.children as unknown[] as never[]), false);
    }
    this.engineActionBodies(n, children, byTag, engineName);
  }

  /**
   * s470-action-body-await — the engine's ACTION bodies impl#1 lowers synchronously: a state child's
   * `effect=` and its `<onTransition>` bodies (statements of the plain `…_fire_hooks(from, to)`
   * function, emit-engine `emitHookArm`), an `<onTransition if=>` guard, a `(state × message)` arm
   * (a dispatch-table function), and a computed `<onTimeout after=>` / `<onIdle after=>` delay.
   * Each is read through engine-body-reader's ONE cached parse — the statements the type system
   * walked and codegen lowers (`readEngineBody`, same owner / slot / file name). A body that does
   * not parse is the type system's refusal (E-ERROR-002), never lowered. The opener `effect=` is
   * NOT judged: it has an async host (emit-engine `emitEngineOpenerEffect`, s441).
   */
  private engineActionBodies(n: AnyNode, children: AnyNode[], byTag: Map<string, AnyNode>, engineName: string): void {
    const meta = (n._record as { engineMeta?: Record<string, unknown> } | undefined)?.engineMeta;
    if (!meta) return;
    // fix round 1 (F4) — an arm's transition fires the engine's hooks (state-child `effect=`,
    // `<onTransition>` bodies and guards) right after the arm returns: they FOLLOW the un-waited sites
    // still pending at the arm's end.
    const armScopes: Array<{ scope: OrderScope; span: unknown }> = [];
    const hookBodies: unknown[] = [];
    const body = (owner: object, slot: string, src: string, file: string, span: unknown, pos: string, strict: boolean): void => {
      const read = readEngineBody(owner, slot, src, file);
      if (!read.stmts) return;
      if (slot === "effect" || slot === "body" || slot === "if") hookBodies.push(read.stmts);
      const scope: OrderScope | null = slot === "arm" ? { pending: [] } : null;
      if (scope) armScopes.push({ scope, span });
      // s470-await-residue — a message arm is still a synchronous body (it returns the next state):
      // its own order. A state-child `effect=` / an `<onTransition>` body has an async host now.
      this.withOrder(scope, () => this.inLocal(false, () => this.withSpan(span, () => {
        if (strict) { for (const st of read.stmts!) this.syncStmt(st, pos, false); }
        else this.syncStmts(read.stmts, pos);
        this.resets(read.stmts);
      })));
    };
    const onTransition = (entry: AnyNode, where: string, span: unknown): void => {
      const b = onTransitionBodySource(entry);
      if (b && "src" in b) body(entry, "body", b.src, ENGINE_BODY_FILE.onTransition, span, `the <onTransition> body ${where}`, false);
      if (entry.ifExprRaw !== undefined && entry.ifExprRaw !== null) {
        const g = guardSource(entry.ifExprRaw);
        if (g && "src" in g) body(entry, "if", g.src, ENGINE_BODY_FILE.guard, span, `the <onTransition if=> guard ${where}`, true);
      }
    };
    const delay = (entry: AnyNode, what: string, span: unknown): void => {
      if (typeof entry.after !== "string") return;
      const parsed = parseAfterDuration(entry.after) as { kind: string; exprText?: string };
      if (parsed.kind === "computed" && typeof parsed.exprText === "string") {
        body(entry, "after", parsed.exprText, ENGINE_BODY_FILE.guard, span, what, true);
      }
    };
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const tag = String(child.tag ?? "?");
      const span = (byTag.get(tag)?.span ?? n.span) as unknown;
      if (typeof child.effectRaw === "string" && child.effectRaw.length > 0) {
        body(child, "effect", child.effectRaw, ENGINE_BODY_FILE.stateEffect, span, `the \`effect=\` body of state .${tag}`, false);
      }
      for (const entry of Array.isArray(child.onTransitionElements) ? child.onTransitionElements as AnyNode[] : []) {
        if (entry && typeof entry === "object") onTransition(entry, `in state .${tag}`, span);
      }
      for (const arm of Array.isArray(child.messageArms) ? child.messageArms as AnyNode[] : []) {
        if (!arm || typeof arm !== "object") continue;
        const armName = arm.isWildcard ? "_" : String(arm.variantName ?? "?");
        body(arm, "arm", messageArmSource(arm as never), ENGINE_BODY_FILE.messageArm, span, `the message arm .${armName} of state .${tag}`, false);
      }
      for (const ot of Array.isArray(child.onTimeoutElements) ? child.onTimeoutElements as AnyNode[] : []) {
        if (ot && typeof ot === "object") delay(ot, `the <onTimeout after=> delay in state .${tag}`, span);
      }
    }
    for (const entry of Array.isArray(meta.engineOnTransitions) ? meta.engineOnTransitions as AnyNode[] : []) {
      if (entry && typeof entry === "object") onTransition(entry, `(engine-direct) of engine \`${engineName}\``, n.span);
    }
    const idle = meta.idleWatchdog as AnyNode | undefined;
    if (idle && typeof idle === "object") delay(idle, "the <onIdle after=> delay", n.span);
    for (const { scope, span } of armScopes) {
      if (scope.pending.length === 0) continue;
      this.withOrder(scope, () => this.withSpan(span, () => {
        for (const h of hookBodies) {
          for (const p of scope.pending.slice()) {
            if (this.observes(h, p.cell, new WeakSet())) this.orderReport(p, "the transition's hook (an `effect=` / `<onTransition>` of this engine)");
          }
        }
      }));
    }
    // fix round 1 (H2) — the opener `effect=` is an ASYNC host: only its own-level calls of the
    // functions it awaits are accepted (`asyncHost`). The parse emit-engine lowers (same owner / slot).
    const opener = meta.openerEffect;
    if (typeof opener === "string" && opener.length > 0) {
      const read = readEngineBody(meta, "openerEffect", opener, ENGINE_BODY_FILE.openerEffect);
      // The opener runs once at boot, AFTER every module-init statement (F3): a late follower.
      if (read.stmts) this.lateInitFollowers.push(read.stmts);
      this.withOrder(null, () => this.inLocal(false, () => this.asyncHost(read.stmts, opener, n, n.span, `the opener \`effect=\` body of engine \`${engineName}\``)));
      this.withSpan(n.span, () => this.resets(read.stmts));
    }
  }

  /** Report every site found inside `fn` at `span` (a body re-parsed from text carries its own offsets). */
  private withSpan(span: unknown, fn: () => void): void {
    const saved = this.spanOverride;
    if (saved === null) this.spanOverride = span;
    try { fn(); } finally { this.spanOverride = saved; }
  }
}

/**
 * Every render position of `nodes` (a file's top-level nodes) that holds a waiting value.
 * The caller reports each as E-VALUE-SERVER-CALL.
 */
export function renderWaitingCallsOf(nodes: unknown[], facts: RenderWaitingFacts): RenderWaitingSite[] {
  const w = new RenderWalk(facts);
  w.beginResets(nodes);
  w.nodes(nodes, true);
  w.finishModuleOrder();
  w.resets(nodes);
  return w.sites;
}
