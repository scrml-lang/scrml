/**
 * Process-lifetime (shared) type objects — g-impl1-dbvar-tag-mutates-shared-type-s479.
 *
 * Some objects are created ONCE per process and handed out by identity to every
 * compile: the built-in type table, the compiler-provided enums and binder sets
 * (type-system.ts), and any value MEMOIZED against one of those keys in a
 * process-lifetime cache (e.g. refinement-obligations.ts `_shapeMemo` /
 * `_judgeMemo`, whose judge for the built-in `string` type is one object for the
 * whole process). Such an object can end up reachable from a compile's AST, and
 * an AST walk that annotates what it reaches (codegen's `_dbVar` tagging) would
 * write one compile's facts onto every later compile.
 *
 * Every such object — and everything reachable from it — is recorded here so an
 * annotating walk can stop at it. Rule: a module-level type object, or a value a
 * process-lifetime memo stores against a shared key, MUST pass through
 * `markSharedTypes`. compiler/tests/unit/dbvar-tag-shared-type-singletons.test.js
 * guards the class (a db-scoped compile must not change a later db-less compile).
 *
 * A leaf module (no imports) so both type-system.ts and the modules it imports
 * can use it without an import cycle.
 */

const SHARED_TYPE_OBJECTS = new WeakSet<object>();

/** Record `root` and everything reachable from it as process-lifetime. Returns `root`. */
export function markSharedTypes<T>(root: T): T {
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== "object" || SHARED_TYPE_OBJECTS.has(v as object)) return;
    SHARED_TYPE_OBJECTS.add(v as object);
    if (v instanceof Map) { for (const [k, x] of v) { visit(k); visit(x); } return; }
    if (v instanceof Set) { for (const x of v) visit(x); return; }
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    for (const key of Object.keys(v as object)) visit((v as Record<string, unknown>)[key]);
  };
  visit(root);
  return root;
}

/** True for a process-lifetime type object (or any part of one) — never annotate it per compile. */
export function isSharedTypeObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && SHARED_TYPE_OBJECTS.has(value as object);
}
