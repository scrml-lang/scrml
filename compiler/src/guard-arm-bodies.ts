/**
 * The ONE reader of `!{ }` handler arm bodies that are held as TEXT.
 *
 * An expression-position `!{ }` (`(f(x) !{ _ :> … }) ? a : b`, a call argument, a template
 * interpolation) reaches the expression parser as raw text and is carried as the placeholder
 * member call `<operand>.__scrml_guard__("!{ … }")` — its arms are a string literal, invisible to
 * every tree walk. A statement guard (`guarded-expr`) carries each arm's handler text; an unbraced
 * one is also parsed (`handlerExpr`), a braced one is a statement block held as text.
 *
 * Moved here verbatim from `codegen/emit-library-shared.ts` (S471 s471-null-in-arm-refused) so a
 * pre-codegen check (GCP3, the E-SYNTAX-042 `null` / `undefined` refusal) reads the arms with the
 * SAME reader the S470 await fixes use, without importing the codegen module graph (whose
 * emit-tool ⇄ emit-server cycle is module-init-order sensitive). `emit-library-shared.ts`
 * re-exports both functions, so its callers are unchanged.
 */
import { guardCallArmsRaw } from "./expression-parser.ts";
import { parseGuardArmsFromRaw } from "./ast-builder.js";
import { armBlockStatementsDetailed } from "./arm-body-statements.ts";
import { mentionedNames } from "./failable-value-calls.ts";

type ASTNode = Record<string, unknown>;

/**
 * S470 (fix round 2, R1) — the parsed bodies of an expression-position `!{ }` handler's arms (a
 * braced body's statements, else the arm's expression), or [] for anything else. A body the
 * readers cannot parse is returned as an escape hatch over its text, which every walker treats as
 * un-awaitable (fail closed).
 */
export function exprGuardArmBodies(n: ASTNode): unknown[] {
  if (!n || n.kind !== "call") return [];
  const raw = guardCallArmsRaw(n as never);
  if (raw === null) return [];
  const hatch = (text: string): unknown => unreadableArm(text);
  let arms: Array<{ handler?: unknown; handlerExpr?: unknown }> | null = null;
  try { arms = parseGuardArmsFromRaw(raw, "") as Array<{ handler?: unknown; handlerExpr?: unknown }> | null; } catch { arms = null; }
  if (!arms) return [hatch(raw)];
  const out: unknown[] = [];
  for (const arm of arms) {
    const h = typeof arm?.handler === "string" ? arm.handler.trim() : "";
    if (!h) continue;
    if (h.startsWith("{") && h.endsWith("}")) {
      const r = armBlockStatementsDetailed(h);
      out.push(r && r.ok && Array.isArray(r.stmts) ? r.stmts : hatch(h));
    } else {
      out.push(arm.handlerExpr && typeof arm.handlerExpr === "object" ? arm.handlerExpr : hatch(h));
    }
  }
  return out;
}

/**
 * S470 (fix round 3, N1) — the parsed bodies of every `!{ }` arm a node carries as TEXT: each arm of
 * an expression-position handler (`exprGuardArmBodies`) and each BRACED arm of a statement guard (an
 * unbraced one is already a parsed `handlerExpr`). An arm the reader refuses comes back as an escape
 * hatch carrying the names its text mentions (`armUnreadableNames`), so a consumer can fail closed.
 */
export function guardArmBodiesOf(n: ASTNode): unknown[] {
  if (!n || typeof n !== "object") return [];
  if (n.kind === "call") return exprGuardArmBodies(n);
  if (n.kind !== "guarded-expr" || !Array.isArray(n.arms)) return [];
  const out: unknown[] = [];
  for (const arm of n.arms as Array<{ handler?: unknown }>) {
    const h = typeof arm?.handler === "string" ? arm.handler.trim() : "";
    if (!(h.startsWith("{") && h.endsWith("}")) || !h.slice(1, -1).trim()) continue;
    const r = armBlockStatementsDetailed(h);
    out.push(r && r.ok && Array.isArray(r.stmts) ? r.stmts : unreadableArm(h));
  }
  return out;
}

/** An arm body no reader can parse: an escape hatch carrying the names its text mentions. */
function unreadableArm(text: string): unknown {
  return { kind: "escape-hatch", raw: text, nativeKind: "Unparsed", armUnreadableNames: [...mentionedNames(text)] };
}
