/**
 * host-promise-globals.ts — S470 (`s470-render-residue-host-promises`, SECURITY).
 *
 * The HOST Promise-returning globals a waiting-value check must see. SPEC names exactly one:
 *
 *   §13.7 item 4 — "A call to a Promise-returning standard-library function (§13.2) — `fetch`, the
 *   `scrml:http` functions, and every other standard-library function the compiler emits `async`."
 *   §13.8 item 3 — "a call to a Promise-returning standard-library function (`fetch`, the
 *   `scrml:http` functions, `scrml:auth` `verifyPassword` / `hashPassword`, …)".
 *
 * The `scrml:` functions are already in the file's async set (the export registry's `isAsync`).
 * `fetch` is a host global: no import declares it, so the §13.2 facts never coloured it, and a
 * `fetch(…)` written in a render position or a synchronous action body held a pending Promise —
 * always truthy (g-host-promise-global-in-render-not-refused-s470,
 * g-host-promise-global-in-action-body-s470). The list is the SPEC's, not the host's: other
 * Promise-returning host functions (`Promise.resolve`, `createImageBitmap`, …) are not named by
 * §13.7 / §13.8, whose definition "does not widen" (§13.8), so they are not added here.
 *
 * The name is the HOST global only where nothing binds it: a file-level binding of the name (a
 * `function fetch`, a `const fetch`, an import) makes it the author's own function, judged by the
 * file's async set like any other; a local binding (a parameter, a local declaration) shadows it in
 * its scope (`hostShadowedRefsOf`).
 */
import { computeAsyncFnNames } from "./emit-library-shared.ts";
import { buildCalleeImportMap } from "./scheduling.ts";
import { getNodes } from "./collect.ts";
import { HOST_PROMISE_GLOBALS, HOST_FETCH_MEMBER, hostPromiseMemberOf } from "./host-promise-names.ts";
export { HOST_PROMISE_GLOBALS, HOST_GLOBAL_OBJECTS, HOST_FETCH_MEMBER } from "./host-promise-names.ts";

type AnyNode = Record<string, unknown>;

/**
 * fix round 1 (F3) — does a declaration's initializer hold the host Promise global itself:
 * `fetch`, `globalThis.fetch`, `window["fetch"]`, `window.fetch.bind(window)`? Such a binding IS the
 * host function (`const fetch = globalThis.fetch`): it neither turns the host rule off nor
 * shadows it — it is a waiting function value, refused where it is bound (§13.9.6).
 */
export function holdsHostPromise(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const n = v as AnyNode;
  if (n.kind === "ident" && typeof n.name === "string") return HOST_PROMISE_GLOBALS.has(n.name);
  if (hostPromiseMemberOf(n) !== null) return true;
  if (n.kind === "call") {
    const c = n.callee as AnyNode | undefined;
    if (c && c.kind === "member" && c.property === "bind") return holdsHostPromise(c.object);
  }
  if (n.kind === "binary" || n.kind === "ternary") {
    for (const k of ["left", "right", "consequent", "alternate"]) if (holdsHostPromise(n[k])) return true;
  }
  return false;
}

/** The initializer of a plain declaration, when it holds the host Promise global. */
function declHoldsHost(st: AnyNode): boolean {
  return (st.kind === "const-decl" || st.kind === "let-decl" || st.kind === "tilde-decl" || st.kind === "lin-decl") &&
    holdsHostPromise(st.initExpr);
}

/** Markup elements whose `${ }` body is lowered into a callback of its own (its declarations are local to it). */
const LOCAL_BODY_TAGS = new Set(["request", "timer", "poll", "timeout"]);

const DECL_KINDS = new Set(["const-decl", "let-decl", "tilde-decl", "lin-decl", "function-decl"]);

/** The names a declaration statement binds. */
function declNames(st: AnyNode): string[] {
  if (!st || typeof st !== "object" || typeof st.kind !== "string" || !DECL_KINDS.has(st.kind)) return [];
  const out: string[] = [];
  if (typeof st.name === "string") out.push(st.name);
  if (Array.isArray(st.boundNames)) for (const b of st.boundNames) if (typeof b === "string") out.push(b);
  return out;
}

/** A parameter's bound names (a `LambdaParam` record, or the `name[: T][= d]` text of a function-decl). */
function paramNames(p: unknown): string[] {
  if (typeof p === "string") {
    const m = /^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(p);
    return m ? [m[1]] : [];
  }
  if (!p || typeof p !== "object") return [];
  const r = p as AnyNode;
  const out: string[] = [];
  if (typeof r.name === "string") out.push(r.name);
  if (Array.isArray(r.boundNames)) for (const b of r.boundNames) if (typeof b === "string") out.push(b);
  return out;
}

/**
 * The names the file binds at MODULE scope — an import, or a `function` / plain declaration written
 * directly in a `${ }` body that markup holds (not inside a statement's block: `if (c) { const fetch
 * = 1 }` binds only that block, fix round 1 F3) — read without entering a function body, a
 * statement, a markup VALUE, an `<each>` / `<match>` / engine / component body, or a `<request>` /
 * `<timer>` / `<poll>` / `<timeout>` body (lowered into a callback of its own). A declaration that
 * holds the host Promise global itself (`const fetch = globalThis.fetch`) does not count. A host
 * global of such a name is the author's binding.
 */
export function fileBoundNamesOf(fileAST: unknown): Set<string> {
  const out = new Set<string>(buildCalleeImportMap(fileAST as never).keys());
  const seen = new WeakSet<object>();
  const CONTAINERS = new Set(["markup", "logic", "if-chain", "state"]);
  const visit = (v: unknown): void => {
    if (!v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    const n = v as AnyNode;
    if (n.kind === "logic") {
      for (const st of Array.isArray(n.body) ? n.body as AnyNode[] : []) {
        if (!st || typeof st !== "object") continue;
        if (!declHoldsHost(st)) for (const nm of declNames(st)) out.add(nm);
        if (typeof st.kind === "string" && CONTAINERS.has(st.kind)) visit(st);
      }
    } else if (n.kind === "markup") {
      if (!(typeof n.tag === "string" && LOCAL_BODY_TAGS.has(n.tag))) visit(n.children);
    } else if (n.kind === "state") {
      visit(n.children);
    } else if (n.kind === "if-chain") {
      for (const b of Array.isArray(n.branches) ? n.branches as AnyNode[] : []) if (b && typeof b === "object") visit(b.element);
      visit(n.elseBranch);
    }
  };
  visit(getNodes(fileAST as never));
  return out;
}

/** The host Promise globals this file does NOT bind at module scope (the ones its code can reach). */
export function unboundHostPromiseGlobalsOf(fileAST: unknown): Set<string> {
  const bound = fileBoundNamesOf(fileAST);
  return new Set([...HOST_PROMISE_GLOBALS].filter((n) => !bound.has(n)));
}

/**
 * The file's functions that reach a host Promise global (§13.7 item 2: "a client function that
 * reaches … a Promise-returning standard-library function"), by the colouring's OWN fixpoint
 * (`computeAsyncFnNames`, the host names as its seed). The seed names themselves are in the result.
 * A function whose parameter shadows the name is coloured too (the fixpoint is scope-blind:
 * over-refusal, never a miss).
 */
export function hostPromiseReachOf(fnNodes: unknown[], hostNames: ReadonlySet<string>): Set<string> {
  // fix round 1 (F1) — the global-object spellings (`globalThis.fetch(…)`) are seeded too.
  return computeAsyncFnNames(fnNodes as never, null, new Set([...hostNames, HOST_FETCH_MEMBER]));
}

/**
 * The `ident` nodes naming a host Promise global that a LOCAL binding shadows: a lambda's or a
 * function's parameter, or a declaration in an enclosing statement list (a block, a function body,
 * a `${ }` body). Such an ident is the local, not the host global. Text the tree does not hold
 * (an escape hatch, a body re-parsed from text) is not reached here: read to refuse.
 */
export function hostShadowedRefsOf(nodes: unknown, hostNames: ReadonlySet<string>): WeakSet<object> {
  const out = new WeakSet<object>();
  if (hostNames.size === 0) return out;
  const seen = new WeakSet<object>();
  const visit = (v: unknown, scope: ReadonlySet<string>): void => {
    if (!v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) {
      let inner = scope;
      for (const x of v) {
        // A declaration that holds the host global itself does not shadow it (F3).
        if (x && typeof x === "object" && declHoldsHost(x as AnyNode)) continue;
        for (const nm of declNames(x as AnyNode)) {
          if (hostNames.has(nm)) { if (inner === scope) inner = new Set(scope); (inner as Set<string>).add(nm); }
        }
      }
      for (const x of v) visit(x, inner);
      return;
    }
    const n = v as AnyNode;
    let here = scope;
    if (n.kind === "lambda" || n.kind === "function-decl" || n.kind === "function-expr") {
      for (const p of Array.isArray(n.params) ? n.params : []) {
        for (const nm of paramNames(p)) {
          if (hostNames.has(nm)) { if (here === scope) here = new Set(scope); (here as Set<string>).add(nm); }
        }
      }
    }
    if (n.kind === "ident" && typeof n.name === "string" && here.has(n.name)) out.add(n);
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record") continue;
      const x = n[k];
      if (x && typeof x === "object") visit(x, here);
    }
  };
  visit(nodes, new Set());
  return out;
}

/**
 * fix round 1 (F5) — the host names that seed the file's async facts (`asyncImportedLocalsOf`
 * in codegen/index.ts): the SPEC-named host Promise globals the file does not bind.
 */
export function hostPromiseSeedOf(fileAST: unknown): Set<string> {
  // Only a file whose code can reach the host global is seeded: several emitters read an EMPTY
  // async set as "nothing here waits" (a one-shot interpolation's async wrap is decided by diffing
  // two emits when the client set is non-empty), so a file that never names `fetch` must keep
  // the facts it had.
  if (!fileMentionsHostPromise(fileAST)) return new Set();
  // The global-object spelling (`globalThis.fetch(…)`, recorded by the colouring's callee walk under
  // `HOST_FETCH_MEMBER`) is the host function whatever the file binds.
  return new Set([...unboundHostPromiseGlobalsOf(fileAST), HOST_FETCH_MEMBER]);
}

/**
 * Does the file's tree name a host Promise global anywhere — an identifier, a read through the
 * global object, or text kept unparsed (an escape hatch, a body held as text) that mentions it?
 * Fail closed on text: any mention counts.
 */
function fileMentionsHostPromise(fileAST: unknown): boolean {
  const names = [...HOST_PROMISE_GLOBALS];
  const textRe = new RegExp(`\\b(?:${names.join("|")})\\b`);
  const seen = new WeakSet<object>();
  let hit = false;
  const visit = (v: unknown): void => {
    if (hit || !v || typeof v !== "object" || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    const n = v as AnyNode;
    if (n.kind === "ident" && typeof n.name === "string" && HOST_PROMISE_GLOBALS.has(n.name)) { hit = true; return; }
    if (hostPromiseMemberOf(n) !== null) { hit = true; return; }
    for (const k of Object.keys(n)) {
      if (k === "span" || k === "_record") continue;
      const x = n[k];
      if (typeof x === "string") { if (k !== "kind" && textRe.test(x)) { hit = true; return; } continue; }
      if (x && typeof x === "object") visit(x);
    }
  };
  visit(getNodes(fileAST as never));
  return hit;
}
