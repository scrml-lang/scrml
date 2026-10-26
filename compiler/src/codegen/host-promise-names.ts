/**
 * host-promise-names.ts — S470 (`s470-render-residue-host-promises`, SECURITY). The NAMES of the
 * SPEC-named host Promise global and the spellings that reach it through a host global object.
 * No imports: read by the async colouring (emit-library-shared), the value-use judge
 * (fn-valued-bindings), the call-site await (emit-expr) and the render / action check.
 *
 * SPEC §13.7 item 4 / §13.8 item 3 name `fetch` a Promise-returning standard-library function (a
 * waiting value). `globalThis.fetch`, `window.fetch`, `self.fetch`, `globalThis["fetch"]`,
 * `window.self.fetch`, `document.defaultView.fetch` are the same host function: a user binding
 * named `fetch` cannot shadow them, so their calls are tracked under ONE pseudo name that no
 * identifier can spell (`HOST_FETCH_MEMBER`).
 */

type AnyNode = Record<string, unknown>;

/** The SPEC-named host Promise-returning globals (§13.7 item 4, §13.8 item 3). */
export const HOST_PROMISE_GLOBALS: ReadonlySet<string> = new Set(["fetch"]);

/** Identifiers that name the host global object (or a window that IS it). */
export const HOST_GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["globalThis", "window", "self", "top", "parent", "frames"]);

/** Properties of a host global object that are the global object again. */
const HOST_GLOBAL_SELF_PROPS = new Set(["globalThis", "window", "self", "top", "parent", "frames"]);

/**
 * The pseudo callee name a call of the host `fetch` through a global object is recorded under
 * (not a valid identifier, so it never collides with a binding).
 */
export const HOST_FETCH_MEMBER = "globalThis.fetch";

function staticKey(n: AnyNode): string | null {
  if (n.kind === "member" && n.computed !== true) {
    const p = n.property as unknown;
    if (typeof p === "string") return p;
    if (p && typeof p === "object" && typeof (p as AnyNode).name === "string") return (p as AnyNode).name as string;
    return null;
  }
  // `obj["fetch"]` — a computed access with a string-literal key is the same property.
  const idx = (n.kind === "index" ? n.index : n.kind === "member" && n.computed === true ? n.property : null) as AnyNode | null | undefined;
  if (idx && typeof idx === "object" && idx.kind === "lit" && typeof idx.value === "string") return idx.value;
  return null;
}

function objectOf(n: AnyNode): AnyNode | null {
  const o = (n.object ?? null) as AnyNode | null;
  return o && typeof o === "object" ? o : null;
}

/**
 * Is `n` an expression for the host global object: `globalThis`, `window`, `self`, `top`, `parent`,
 * `frames`, a chain of those (`globalThis.window`, `window.self`), or `document.defaultView`.
 * `isBound(name)` — a local / file binding of the identifier makes it not the host object.
 */
export function isHostGlobalObjectExpr(v: unknown, isBound: (name: string) => boolean = () => false): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as AnyNode;
  if (n.kind === "ident" && typeof n.name === "string") {
    // S470 s470-host-fetch-followups (R3) — a binding whose value is the host global object
    // (`const w = window`), marked by `markHostGlobalAliases`, IS that object.
    if (n[HOST_ALIAS_MARK] === true) return true;
    return HOST_GLOBAL_OBJECTS.has(n.name) && !isBound(n.name);
  }
  if (n.kind === "member" || n.kind === "index") {
    const obj = objectOf(n);
    // R5 — `frames[0]` / `window[0]`: a numerically indexed window of the host is a host window.
    const idx = (n.kind === "index" ? n.index : n.computed === true ? n.property : null) as AnyNode | null | undefined;
    if (obj && idx && typeof idx === "object" && idx.kind === "lit" && typeof idx.value === "number") {
      return isHostGlobalObjectExpr(obj, isBound);
    }
    const key = staticKey(n);
    if (key === null || !obj) return false;
    if (HOST_GLOBAL_SELF_PROPS.has(key)) return isHostGlobalObjectExpr(obj, isBound);
    if (key === "defaultView") {
      if (obj.kind === "ident" && obj.name === "document" && !isBound("document")) return true;
      const k2 = (obj.kind === "member" || obj.kind === "index") ? staticKey(obj) : null;
      const o2 = objectOf(obj);
      return k2 === "document" && !!o2 && isHostGlobalObjectExpr(o2, isBound);
    }
  }
  return false;
}

/**
 * The host Promise global `n` reads THROUGH a global object (`globalThis.fetch`,
 * `window["fetch"]`, …), or null. A bare `fetch` identifier is not this (its binding decides).
 */
export function hostPromiseMemberOf(v: unknown, isBound: (name: string) => boolean = () => false): string | null {
  if (!v || typeof v !== "object") return null;
  const n = v as AnyNode;
  if (n.kind !== "member" && n.kind !== "index") return null;
  const key = staticKey(n);
  if (key === null || !HOST_PROMISE_GLOBALS.has(key)) return null;
  return isHostGlobalObjectExpr(objectOf(n), isBound) ? key : null;
}

/** The mark `markHostGlobalAliases` sets on an identifier that names a host-global-object alias. */
export const HOST_ALIAS_MARK = "_scrmlHostGlobalAlias";

const ALIAS_DECL_KINDS = new Set(["const-decl", "let-decl", "tilde-decl", "lin-decl"]);

/** Does an initializer hold the host global object (directly, or as a branch of `?:` / `||` / `&&` / `??`)? */
function holdsHostObject(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as AnyNode;
  if (isHostGlobalObjectExpr(n)) return true;
  if (n.kind === "ternary") return holdsHostObject(n.consequent) || holdsHostObject(n.alternate);
  if (n.kind === "binary" && (n.op === "||" || n.op === "&&" || n.op === "??")) return holdsHostObject(n.left) || holdsHostObject(n.right);
  if (n.kind === "sequence" && Array.isArray(n.expressions)) return holdsHostObject(n.expressions[n.expressions.length - 1]);
  return false;
}

/**
 * S470 s470-host-fetch-followups (R3) — `const w = window; w.fetch(u)`: a name bound (declared or
 * assigned, in any scope) to the host global object is that object, so `w.fetch` is the host
 * `fetch`. Every identifier of such a name in the file is marked (`HOST_ALIAS_MARK`), by name and
 * scope-blind — the fail-closed direction: a same-named binding elsewhere also reads as the host
 * object, so its `.fetch(…)` is awaited / refused, never treated as an author function. Chains
 * (`const a = window; const b = a`) are followed to a fixpoint. Idempotent; returns the names.
 */
export function markHostGlobalAliases(fileAST: unknown): Set<string> {
  const names = new Set<string>();
  const roots: unknown[] = [];
  const f = fileAST as AnyNode | null;
  if (f && typeof f === "object") roots.push(f);
  const allIdents: AnyNode[] = [];
  const bindings: Array<[string, unknown]> = [];
  const seen = new WeakSet<object>();
  const visit = (v: unknown): void => {
    if (!v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    const n = v as AnyNode;
    if (n.kind === "ident" && typeof n.name === "string") allIdents.push(n);
    if (typeof n.kind === "string" && ALIAS_DECL_KINDS.has(n.kind) && typeof n.name === "string") bindings.push([n.name, n.initExpr]);
    if (n.kind === "assign" && n.op === "=") {
      const t = n.target as AnyNode | undefined;
      if (t && t.kind === "ident" && typeof t.name === "string") bindings.push([t.name, n.value]);
    }
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record") continue;
      const x = n[k];
      if (x && typeof x === "object") visit(x);
    }
  };
  for (const r of roots) visit(r);
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, val] of bindings) {
      if (names.has(name) || HOST_GLOBAL_OBJECTS.has(name)) continue;
      if (holdsHostObject(val)) {
        names.add(name);
        changed = true;
        for (const id of allIdents) if (id.name === name) id[HOST_ALIAS_MARK] = true;
      }
    }
  }
  return names;
}
