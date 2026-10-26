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
  if (n.kind === "ident" && typeof n.name === "string") return HOST_GLOBAL_OBJECTS.has(n.name) && !isBound(n.name);
  if (n.kind === "member" || n.kind === "index") {
    const key = staticKey(n);
    const obj = objectOf(n);
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
