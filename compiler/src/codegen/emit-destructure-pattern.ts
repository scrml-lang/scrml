/**
 * emit-destructure-pattern.ts — A5 (2026-05-17)
 *
 * Helpers for serializing structured DestructurePattern AST nodes back to
 * JavaScript source text. Used by emit-logic.ts (let/const decls) and
 * emit-control-flow.ts (for-stmt headers) when the LHS is a destructuring
 * pattern rather than a bare identifier.
 *
 * The structured form lives on `let-decl.name`, `const-decl.name`, and
 * `for-stmt.variable` since A5 retired A1's regex-based text extractor.
 * Codegen still needs flat JS LHS text — that's what these helpers produce.
 */

import type { DestructurePattern, DestructureArrayElement, DestructureObjectProperty } from "../types/ast.ts";
import { CGError } from "./errors.ts";
import { recordRefusedLowering } from "./refused-lowering-errors.ts";

export function isDestructurePattern(v: unknown): v is DestructurePattern {
  if (!v || typeof v !== "object") return false;
  const k = (v as { kind?: unknown }).kind;
  return k === "destructure-array" || k === "destructure-object";
}

/**
 * Render a DestructurePattern back to JavaScript source text suitable for
 * use as a destructuring LHS. Pure serialization — no semantic transforms.
 *
 * Examples:
 *   { kind: "destructure-array", elements: [{kind:"name", name:"a"}, {kind:"name", name:"b"}] }
 *     → "[a, b]"
 *   { kind: "destructure-object", properties: [{kind:"name", fieldName:"a", bindName:"a"}, {kind:"name", fieldName:"b", bindName:"ren"}] }
 *     → "{ a, b: ren }"
 *   { kind: "destructure-array", elements: [{kind:"hole"}, {kind:"name", name:"b"}] }
 *     → "[, b]"
 */
/**
 * S465 r4 — how a default value is lowered: given the parsed node (when the
 * builder read one) and the source text. Without one, the text is kept verbatim
 * (the pre-r4 serialization; the callers that lower code pass a lowerer — a
 * default is an EXPRESSION, and a call in it must be seen by the await classifier).
 */
export type DefaultLowerer = (text: string, node: unknown) => string;

export function emitDestructurePatternText(p: DestructurePattern, lowerDefault?: DefaultLowerer, opts: VariantKeyOpts = {}): string {
  // S470 (s470-unit-variant-tag-read, review F2) — a `variant` key at the TOP of the
  // pattern reads `.variant` off the destructured value itself, which a pattern cannot
  // reach (a unit variant is its bare tag string, §51.3.2; `{ variant } = "Gone"` binds
  // undefined). A declaration splits it (`topLevelVariantKeyOf` + `variantDestructureSource`);
  // every other binding site (a parameter, a `for` head, an assignment pattern) refuses.
  if (!opts.topVariantSplit && topLevelVariantKeyOf(p)) refuseTopLevelVariantKey(p);
  return emitPatternInner(p, lowerDefault);
}

function emitPatternInner(p: DestructurePattern, lowerDefault?: DefaultLowerer): string {
  const defOf = (d: string | undefined, n: unknown): string =>
    d ? ` = ${lowerDefault ? lowerDefault(d, n) : d}` : "";
  if (p.kind === "destructure-array") {
    const parts: string[] = [];
    for (const el of p.elements) {
      parts.push(emitArrayElement(el, defOf, lowerDefault));
    }
    if (p.rest) parts.push(`...${p.rest}`);
    return `[${parts.join(", ")}]`;
  } else {
    const parts: string[] = [];
    for (const prop of p.properties) {
      parts.push(emitObjectProperty(prop, defOf, lowerDefault));
    }
    if (p.rest) parts.push(`...${p.rest}`);
    return `{ ${parts.join(", ")} }`;
  }
}

type DefOf = (d: string | undefined, n: unknown) => string;

function emitArrayElement(el: DestructureArrayElement, defOf: DefOf, lowerDefault?: DefaultLowerer): string {
  if (el.kind === "hole") return "";
  if (el.kind === "name") {
    const def = defOf(el.default, el.defaultExpr);
    return `${el.name}${def}`;
  }
  // nested
  const def = defOf(el.default, el.defaultExpr);
  // S470 (review F2) — an array element has no key to bind its value under twice, so a
  // `variant` key directly in it cannot be lowered here: refused (`[{ variant }] = …`).
  if (topLevelVariantKeyOf(el.pattern)) refuseTopLevelVariantKey(el.pattern);
  return `${emitPatternInner(el.pattern, lowerDefault)}${def}`;
}

function emitObjectProperty(prop: DestructureObjectProperty, defOf: DefOf, lowerDefault?: DefaultLowerer): string {
  if (prop.kind === "nested") {
    const def = defOf(prop.default, prop.defaultExpr);
    // S470 (review F2) — `{ e: { variant } }`: bind the field's value once under a
    // compiler temporary, then destructure the SAME key again (a pattern may name a key
    // twice; it is read twice, left to right) with the `variant` binding defaulting to
    // that value when it is a unit variant's tag string — the tag read, in pattern form.
    if (prop.pattern.kind === "destructure-object" && topLevelVariantKeyOf(prop.pattern)) {
      const tmp = variantTempFor(prop.pattern);
      return `${prop.fieldName}: ${tmp}${def}, ${prop.fieldName}: ${emitObjectPatternWithTagDefault(prop.pattern, tmp, defOf, lowerDefault)}${def ? ` = ${tmp}` : ""}`;
    }
    return `${prop.fieldName}: ${emitPatternInner(prop.pattern, lowerDefault)}${def}`;
  }
  // name
  const def = defOf(prop.default, prop.defaultExpr);
  if (prop.fieldName === prop.bindName) {
    return `${prop.bindName}${def}`;
  }
  return `${prop.fieldName}: ${prop.bindName}${def}`;
}

/**
 * Convenience: if `name` is a string, return it; if it's a DestructurePattern,
 * serialize it. Used by the let-decl / const-decl code paths that take
 * `node.name` (which is now string | DestructurePattern since A5).
 */
export function nameOrPatternText(name: unknown, lowerDefault?: DefaultLowerer, opts: VariantKeyOpts = {}): string {
  if (typeof name === "string") return name;
  if (isDestructurePattern(name)) return emitDestructurePatternText(name, lowerDefault, opts);
  return "";
}

// ---------------------------------------------------------------------------
// S470 (s470-unit-variant-tag-read, review F2) — a destructured `variant` key
// ---------------------------------------------------------------------------

export interface VariantKeyOpts {
  /** The caller destructures a top-level `variant` key from `variantDestructureSource(…)`. */
  topVariantSplit?: boolean;
}

/** The pattern's own `variant` key (an object pattern naming `variant` directly), or null. */
export function topLevelVariantKeyOf(p: DestructurePattern): DestructureObjectProperty | null {
  if (!p || p.kind !== "destructure-object") return null;
  return p.properties.find((pr) => pr.fieldName === "variant") ?? null;
}

/**
 * The value a declaration with a top-level `variant` key destructures from: a unit
 * variant (a string) is read as `{ variant: tag }`, anything else as itself — so the
 * `variant` binding is the tag read (`lowerVariantTagRead`) and every other key reads
 * what it read before (a unit variant has no other field).
 */
export function variantDestructureSource(valueJs: string): string {
  return `((__scrml_is_v) => typeof __scrml_is_v === "string" ? { variant: __scrml_is_v } : __scrml_is_v)(${valueJs})`;
}

const _variantTemps = new WeakMap<object, string>();
let _variantTempSeq = 0;
function variantTempFor(p: object): string {
  let t = _variantTemps.get(p);
  if (!t) { t = `__scrml_dv_${++_variantTempSeq}`; _variantTemps.set(p, t); }
  return t;
}

/** `{ variant, x }` with `variant` defaulting to `tmp` when `tmp` is a tag string. */
function emitObjectPatternWithTagDefault(
  p: DestructurePattern & { kind: "destructure-object" }, tmp: string, defOf: DefOf, lowerDefault?: DefaultLowerer,
): string {
  const parts: string[] = [];
  for (const prop of p.properties) {
    if (prop.fieldName !== "variant") { parts.push(emitObjectProperty(prop, defOf, lowerDefault)); continue; }
    if (prop.kind === "nested") { refuseTopLevelVariantKey(p); parts.push(emitObjectProperty(prop, defOf, lowerDefault)); continue; }
    const user = prop.default ? (lowerDefault ? lowerDefault(prop.default, prop.defaultExpr) : prop.default) : "undefined";
    const bind = prop.bindName === "variant" ? "variant" : `variant: ${prop.bindName}`;
    parts.push(`${bind} = (typeof ${tmp} === "string" ? ${tmp} : ${user})`);
  }
  if (p.rest) parts.push(`...${p.rest}`);
  return `{ ${parts.join(", ")} }`;
}

function refuseTopLevelVariantKey(p: DestructurePattern): void {
  recordRefusedLowering(new CGError(
    "E-CODEGEN-INVALID-LOGIC",
    "E-CODEGEN-INVALID-LOGIC: this destructuring pattern names a `variant` key directly, here (a parameter, " +
      "a `for` head, an assignment, an array element, or a pattern under `variant`). A unit enum variant is " +
      "its bare tag (§51.3.2), so a pattern cannot read its `variant` — it would bind `undefined` and a gate " +
      "on it would fail open. Bind the whole value and read `x.variant` (or test `x is .V`) instead.",
    (p as { span?: object }).span ?? {},
  ), p as object);
}
