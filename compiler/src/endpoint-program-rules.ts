/**
 * @module endpoint-program-rules
 *
 * The two `<endpoint>` rules no single file can judge (SPEC §61.2, §61.7), built in
 * impl#1 by ruling:user-voice-scrml.md-S480-four-recs item 1 — *"impl#1 builds the
 * §61.2 placement and §61.7 duplicate-route refusals under carve-out 1 (endpoint
 * 415 / strict keys)"*:
 *
 *   §61.2 (ruling:user-voice-scrml.md-S478-open-Qs-item-36): "An `<endpoint>`
 *   declaration SHALL be a direct child of the top-level `<program>` (the entry
 *   file's `<program>`, §40.8). An `<endpoint>` anywhere else — … or in a file that
 *   is not the program's entry — is `E-STRUCTURAL-ELEMENT-MISPLACED` (§4.15)."
 *
 *   §61.7 (ruling:user-voice-scrml.md-S478-open-Qs-item-34): "Two `<endpoint>`
 *   declarations of one program with the same `path=` and the same `method=` are
 *   `E-ENDPOINT-ROUTE-DUPLICATE` (§61.9), reported at the second. One `path=` with
 *   two different `method=`s is two routes."
 *
 * The markup loci of §61.2 (inside a `<page>`, a `<channel>`, a nested `<program>`,
 * an element, outside any `<program>`) are judged per file by the buildAST walk in
 * ast-builder.js, and the `${ … }` locus by parseLogicBody; this module judges what
 * needs the whole build:
 *
 *   - THE ENTRY. An endpoint that is a direct child of a file's structurally
 *     top-level `<program>` is misplaced when that file is not an entry of the
 *     application. The entry files are route inference's application-program
 *     candidates (`resolveBuildRoot`, §40.8 "The build root") — the one rule every
 *     other app-scope decision uses. A route file (`pages/`, `routes/`) of a build
 *     with an application program is never one: its `<program>` is nested under the
 *     application's (§4.12, S445 item 1). A file another file of the build IMPORTS
 *     (or re-exports from) is never one either, whatever it declares: §61.2 "a route
 *     belongs to the served program, not to an imported module" — the import graph
 *     (module-resolver.js `buildImportGraph`, the MOD stage) decides it, so a module
 *     with its own top-level `<program>` and an `<endpoint>`, imported by the entry,
 *     is refused (#1998 review r1 F3). When the build still holds several candidates
 *     (two top-level `<program>`s in different files that do not import each other —
 *     the §40.8 `E-PROGRAM-002` shape, which impl#1 does not refuse yet) each is
 *     accepted as an entry here: choosing one by file order is the guess §40.8
 *     forbids, and this rule is not the place to refuse the second program
 *     (g-impl1-endpoint-entry-ambiguous-app-s480).
 *   - ONE HANDLER PER ROUTE. Every web-app file's top-level endpoints mount on ONE
 *     server (`scrml build`'s `_server.js` and `scrml dev` register every module's
 *     routes side by side), so a path and method is checked across the files of the
 *     compilation, in file order then declaration order, and reported at the second.
 *     A §64 `kind="tool"` program serves its own endpoints from its own harness, so
 *     its routes are checked within the file.
 *
 * Mirrors the bootstrap, which builds both: compiler/self-host-v2/analyze.scrml
 * `endpointPass` (the same messages; a misplaced top-level endpoint is still counted
 * for duplicates, as there).
 */

import { resolveBuildRoot } from "./route-inference.ts";
import { toPosix } from "./path-canonical.js";
import { isToolProgram } from "./tool-program.ts";
import { forEachProgramWithRole } from "./program-role.ts";

type NodeLike = Record<string, unknown>;

interface Span { file?: string; start: number; end: number; line: number; col: number }

export interface EndpointRuleDiagnostic {
  code: "E-STRUCTURAL-ELEMENT-MISPLACED" | "E-ENDPOINT-ROUTE-DUPLICATE";
  message: string;
  span: Span;
  severity: "error";
}

/** The recognized `<endpoint>` methods (§61.7, the §60.2 set). */
const ENDPOINT_METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function fileNodes(fileAST: unknown): unknown[] {
  const f = fileAST as NodeLike;
  if (Array.isArray(f?.nodes)) return f.nodes as unknown[];
  const inner = f?.ast as NodeLike | undefined;
  return inner && Array.isArray(inner.nodes) ? (inner.nodes as unknown[]) : [];
}

function filePathOf(fileAST: unknown): string {
  const f = fileAST as NodeLike;
  if (typeof f?.filePath === "string") return f.filePath;
  const inner = f?.ast as NodeLike | undefined;
  return inner && typeof inner.filePath === "string" ? inner.filePath : "";
}

/**
 * The `<endpoint>`s that are direct children of the file's structurally top-level
 * `<program>`s (no `<program>` / `<page>` ancestor in the file — the implied
 * application ancestor of a route file is NOT applied here: such a file is judged
 * by the entry rule, with the entry message).
 */
export function topLevelProgramEndpoints(fileAST: unknown): NodeLike[] {
  const out: NodeLike[] = [];
  forEachProgramWithRole(fileNodes(fileAST), (program, role) => {
    if (role !== "top-level" || !Array.isArray(program.children)) return;
    for (const c of program.children as unknown[]) {
      if (c && typeof c === "object" && (c as NodeLike).kind === "endpoint-decl") out.push(c as NodeLike);
    }
  });
  return out;
}

/**
 * The application's entry files (§40.8): route inference's application-program
 * candidates over the build's web-app files (not §64 tools), less every file another
 * file of the build imports (`importedFiles`, posix paths — `importedFilePaths`). One
 * file in a well-formed application; see the module comment for several.
 */
export function endpointEntryFiles(
  files: readonly unknown[],
  givenRoot?: string,
  importedFiles: ReadonlySet<string> | null = null,
): Set<unknown> {
  const web = (files ?? []).filter((f) => !!f && typeof f === "object" && !isToolProgram(f));
  const candidates = resolveBuildRoot(web as never, givenRoot).candidates as unknown[];
  return new Set<unknown>(
    importedFiles === null ? candidates : candidates.filter((f) => !importedFiles.has(toPosix(filePathOf(f)))),
  );
}

interface ImportGraphEntry {
  imports?: ReadonlyArray<{ absSource?: string | null }>;
  exports?: ReadonlyArray<{ reExportSource?: string | null }>;
}

/**
 * The files of the build that another file of it imports or re-exports from (posix
 * paths), from the MOD stage's import graph (`absSource` of every import, the resolved
 * `reExportSource` of every re-export). A file importing itself does not count, and
 * neither does an edge on an import cycle (#1998 review r2 L1): a cycle is
 * E-IMPORT-002 (§21.3), and the entry's own `<program>` imported back by a module of
 * the cycle is not "an imported module" — counting it added a misleading
 * E-STRUCTURAL-ELEMENT-MISPLACED next to the cycle error. An edge u → v is on a cycle
 * when u and v are in one strongly connected component (Tarjan).
 */
export function importedFilePaths(importGraph: Iterable<[string, ImportGraphEntry]> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!importGraph) return out;
  const edges = new Map<string, string[]>();
  for (const [file, entry] of importGraph) {
    const self = toPosix(String(file));
    const list = edges.get(self) ?? [];
    const add = (p: unknown) => {
      if (typeof p !== "string" || p === "") return;
      const q = toPosix(p);
      if (q !== self) list.push(q);
    };
    for (const imp of entry?.imports ?? []) add(imp?.absSource);
    for (const exp of entry?.exports ?? []) add(exp?.reExportSource);
    edges.set(self, list);
  }
  const comp = stronglyConnected(edges);
  for (const [u, vs] of edges) {
    for (const v of vs) {
      const cu = comp.get(u);
      if (cu !== undefined && cu === comp.get(v)) continue; // an edge on a cycle
      out.add(v);
    }
  }
  return out;
}

/** Tarjan's strongly connected components, iteratively: node → component id. */
function stronglyConnected(edges: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comp = new Map<string, number>();
  let next = 0;
  let compId = 0;
  for (const root of edges.keys()) {
    if (index.has(root)) continue;
    const work: Array<{ node: string; i: number }> = [{ node: root, i: 0 }];
    index.set(root, next); low.set(root, next); next++;
    stack.push(root); onStack.add(root);
    while (work.length > 0) {
      const top = work[work.length - 1];
      const succ = edges.get(top.node) ?? [];
      if (top.i < succ.length) {
        const w = succ[top.i++];
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next); next++;
          stack.push(w); onStack.add(w);
          work.push({ node: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(top.node, Math.min(low.get(top.node)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].node;
        low.set(parent, Math.min(low.get(parent)!, low.get(top.node)!));
      }
      if (low.get(top.node) === index.get(top.node)) {
        let w: string | undefined;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.set(w, compId);
        } while (w !== top.node);
        compId++;
      }
    }
  }
  return comp;
}

function spanOf(node: NodeLike, file: string): Span {
  const s = node.span as Span | undefined;
  return s && typeof s.start === "number" ? s : { file, start: 0, end: 0, line: 1, col: 1 };
}

/** A short place for a message (the diagnostic's own span carries the full path). */
function shortFile(file: string): string {
  const norm = file.replace(/\\/g, "/");
  return norm.slice(norm.lastIndexOf("/") + 1) || norm;
}

function where(span: Span, file: string, here: string): string {
  const f = span.file ?? file;
  return f === here ? `line ${span.line}` : `${shortFile(f)}:${span.line}:${span.col}`;
}

/** Run both build-level rules over the compilation's FileASTs. */
export function checkEndpointProgramRules(
  files: readonly unknown[],
  givenRoot?: string,
  importedFiles: ReadonlySet<string> | null = null,
): EndpointRuleDiagnostic[] {
  const diags: EndpointRuleDiagnostic[] = [];
  const all = (files ?? []).filter((f) => !!f && typeof f === "object");
  const perFile = all.map((f) => ({ f, eps: topLevelProgramEndpoints(f) }));
  if (!perFile.some((x) => x.eps.length > 0)) return diags; // a program without `<endpoint>`: nothing to judge
  const entries = endpointEntryFiles(all, givenRoot, importedFiles);
  const firstAt = new Map<string, Span>();
  for (const { f, eps } of perFile) {
    if (eps.length === 0) continue;
    const file = filePathOf(f);
    const tool = isToolProgram(f);
    for (const ep of eps) {
      const span = spanOf(ep, file);
      if (!tool && !entries.has(f)) {
        diags.push({
          code: "E-STRUCTURAL-ELEMENT-MISPLACED",
          message:
            `E-STRUCTURAL-ELEMENT-MISPLACED: \`<endpoint>\` in \`${shortFile(file)}\`, which is not the program's entry file` +
            (importedFiles !== null && importedFiles.has(toPosix(file)) ? ` (another file of the build imports it)` : ``) + ` — ` +
            `an \`<endpoint>\` is grammatical only as a direct child of the top-level \`<program>\` (§61.2, §4.15): ` +
            `a route belongs to the served program, not to an imported module or a route file; move it into the ` +
            `entry file's \`<program>\`.`,
          span,
          severity: "error",
        });
      }
      const path = typeof ep.path === "string" ? ep.path : "";
      const method = typeof ep.method === "string" ? ep.method : "";
      if (path === "" || !ENDPOINT_METHODS.has(method)) continue; // already refused at parse time
      const key = `${tool ? file : ""}\u0000${method} ${path}`;
      const first = firstAt.get(key);
      if (first === undefined) {
        firstAt.set(key, span);
        continue;
      }
      diags.push({
        code: "E-ENDPOINT-ROUTE-DUPLICATE",
        message:
          `E-ENDPOINT-ROUTE-DUPLICATE: a second \`<endpoint path="${path}" method="${method}">\` (the first is at ` +
          `${where(first, file, span.file ?? file)}) — one path and method has one handler (§61.7); give this ` +
          `endpoint another path or method, or merge its arms into the first.`,
        span,
        severity: "error",
      });
    }
  }
  return diags;
}
