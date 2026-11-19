/**
 * route-export-conflict — two server modules exporting ONE route name for TWO routes.
 *
 * `scrml build`'s `_server.js` imports every module's route exports by NAME and
 * imports each name once (F-BUILD-002, build.js `generateServerEntry`): the
 * compiler-generated `_scrml_session_destroy` is exported by every auth module with
 * the same path and method, and a JavaScript module cannot import one name twice. So
 * the first module that exports a name is the one mounted. That is right only when
 * every module exporting the name exports the SAME route. When two modules export
 * one name for different routes (another path or another method), the second route
 * was dropped without a word — a server function named `endpoint_POST__2fx` exported
 * the name of the `<endpoint path="/x!" method="POST">` record, and the endpoint was
 * never served (#1998 review r1 F2).
 *
 * The compiler's own names are unique per route: an endpoint's record is named by its
 * method and path in the reserved `_scrml_` namespace (emit-server.ts
 * `endpointRouteName`), a server function's by its name and a per-compilation counter
 * (route-inference.ts `generateRouteName`). A conflict therefore means a broken
 * invariant — a compiler defect, or a `.server.js` left in the output directory by an
 * earlier build of other sources, which `_server.js` imports too. It is refused as
 * E-CG-006 (§34: "a server-boundary or client-boundary function emits code that
 * violates a codegen invariant … The error message names the specific violation"),
 * never resolved by import order.
 *
 * The route's path and method are read from the module TEXT with the shape every
 * route record is emitted in (`export const NAME = {\n  path: "…",\n  method: "…",`),
 * the reader `dev.js` `failedModuleRoutes` uses.
 */

// INTERIM — the one compiler export known to be emitted under ONE name for DIFFERENT
// routes: every page module's SSR compose route is `_scrml_route___ssr` (its own page
// path), and `_server.js` mounts only the first (open gap
// g-compose-route-export-name-collision-mounts-one-page — no leak, the other pages lose
// the csrf meta fill and the §52.8 seed and recover by 403-then-retry). Refusing it here
// would fail every multi-page build; it keeps its first-importer behaviour until that gap
// is fixed (the capable form: a per-page export name, which this check then covers).
const KNOWN_FIRST_WINS = new Set(["_scrml_route___ssr"]);

const ROUTE_RECORD_RE = /export\s+const\s+(_scrml_\w+|__ri_route_\w+)\s*=\s*\{\s*path:\s*("(?:[^"\\]|\\.)*")\s*,\s*method:\s*("[A-Z]+")/g;

/**
 * The `{ path, method }` of every route record a module's text declares, by export name.
 *
 * @param {string} source  the `.server.js` text
 * @returns {Record<string, { path: string, method: string }>}
 */
export function routeRecordTargets(source) {
  const out = {};
  if (typeof source !== "string") return out;
  ROUTE_RECORD_RE.lastIndex = 0;
  let m;
  while ((m = ROUTE_RECORD_RE.exec(source)) !== null) {
    try {
      out[m[1]] = { path: JSON.parse(m[2]), method: JSON.parse(m[3]) };
    } catch {
      // not a literal we can read — left out; the name is then compared as "unknown"
    }
  }
  return out;
}

/**
 * The first route name two modules export for different routes, or null.
 *
 * @param {Array<{ filename: string, routeNames?: string[], routeTargets?: Record<string, { path: string, method: string }> }>} serverModules
 *   in the order `_server.js` imports them (the first importer wins)
 * @returns {{ code: "E-CG-006", name: string, first: object, second: object } | null}
 */
export function routeExportConflict(serverModules) {
  const seen = new Map();
  for (const mod of serverModules ?? []) {
    for (const name of mod.routeNames ?? []) {
      if (KNOWN_FIRST_WINS.has(name)) continue;
      const t = (mod.routeTargets ?? {})[name] ?? null;
      const here = { filename: mod.filename, path: t ? t.path : null, method: t ? t.method : null };
      const prev = seen.get(name);
      if (prev === undefined) {
        seen.set(name, here);
        continue;
      }
      if (prev.path !== here.path || prev.method !== here.method) {
        return { code: "E-CG-006", name, first: prev, second: here };
      }
    }
  }
  return null;
}

/** The one-line diagnostic for a conflict (the shape build.js prints refusals in). */
export function formatRouteExportConflict(conflict) {
  const at = (r) => `\`${r.filename}\` (${r.method === null ? "an unreadable route" : `${r.method} ${JSON.stringify(r.path)}`})`;
  return (
    `${conflict.code}: two server modules export the route \`${conflict.name}\` for different routes — ` +
    `${at(conflict.first)} and ${at(conflict.second)}. The built server imports a route name once, so the ` +
    `second would be silently unserved. Route names are unique per route in one compilation, so one of the ` +
    `modules is not from this build (rebuild into an empty output directory) or the compiler broke the ` +
    `invariant (please report it).`
  );
}
