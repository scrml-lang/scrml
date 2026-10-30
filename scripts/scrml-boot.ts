#!/usr/bin/env bun
/**
 * scripts/scrml-boot.ts — `scrml-boot`: compile a user `.scrml` file with the BOOTSTRAP compiler.
 * change-id: s469-bootstrap-cli.
 *
 * The bootstrap (compiler/self-host-v2/, the scrml-native compiler) speaks the RULED language:
 * the §66 declaration forms, tapes with explicit grants (`<audit:Entry[free, append]=[]/>`),
 * `single` engines, `renders` components, the S440 operator/condition rules. impl#1
 * (`scrml compile`) does not parse §66 at all. Before this file the bootstrap was reachable only
 * through the internal JS API that scripts/bootstrap-conformance.ts drives; this is that same path
 * (front end → checkCore → printProgram / printServer → the bootstrap runtime), as a command.
 *
 * USAGE
 *   bun scripts/scrml-boot.ts compile <file.scrml> [--output-dir <dir>] [--format pretty|line] [--rebuild]
 *   bun scripts/scrml-boot.ts dev <file.scrml> [--output-dir <dir>] [--port <n>] [--format pretty|line]
 *   bun run boot:compile <file.scrml>          (package script → `compile`)
 *   bun run boot:dev <file.scrml>              (package script → `dev`)
 *
 * OUTPUT (default `<dir of file>/dist/<name>/`; `--output-dir` writes into that dir directly):
 *   index.html               the page: the program's <template>s + <script type="module" src="program.client.js">
 *   program.client.js        the client artifact (print.scrml printProgram)
 *   scrml-runtime.js         the bootstrap runtime (slice-m1/runtime/runtime.js)
 *   — and, only when the program has server functions the client calls:
 *   program.server.js        the server artifact (print-server.scrml printServer): `createServer(host)`
 *   scrml-server-runtime.js  its runtime, which imports ./runtime.js (a second copy of the runtime)
 *   — and, only when an imported stdlib module reaches the host through `import:host` (SPEC §21.3.1):
 *   _scrml/<module>/<file>   that module's host file, copied from the stdlib (both artifacts import it)
 * The page loads ES modules, so open it over http (`scrml-boot dev`, or any static server), not file://.
 *
 * DIAGNOSTICS print as impl#1's CLI prints them — `error [CODE]: message` then `  --> file:line:col`
 * and the source lines. `--format line` prints one line each, `file:line:col: error [CODE]: message`
 * (for an editor's quickfix / errorformat). Exit status: 0 clean (warnings allowed), 1 any
 * Error-severity diagnostic or printer refusal, 2 usage error or an internal crash.
 *
 * SPEED. The bootstrap is scrml that impl#1 compiles to JS (~9 s). That build is CACHED on disk
 * (`$SCRML_BOOT_CACHE_DIR`, else `$XDG_CACHE_HOME/scrml/boot-bundle`, else `~/.cache/scrml/boot-bundle`),
 * keyed on a sha256 of: every input of the slice-m2 bundle, every compiler/self-host-v2/*.scrml, every
 * file under compiler/src/ (impl#1 itself — its package version alone does not move per commit), the
 * package version, and the build/load code (slice-m1/harness.js + this file's CACHE_FORMAT). Any change
 * rebuilds; nothing else does. `--rebuild` forces it.
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, watch, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHV2 = join(ROOT, "compiler", "self-host-v2");
const RUNTIME = join(SHV2, "slice-m1", "runtime", "runtime.js");
const SERVER_RUNTIME = join(SHV2, "slice-m1", "runtime", "server-runtime.js");
const CACHE_FORMAT = "scrml-boot-bundle/1";

// ─────────────────────────────────────────────────────────────────────────────
// The bootstrap bundle, cached.
// ─────────────────────────────────────────────────────────────────────────────

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

export function cacheDir(): string {
  if (process.env.SCRML_BOOT_CACHE_DIR) return process.env.SCRML_BOOT_CACHE_DIR;
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "scrml", "boot-bundle");
}

/** The cache key: a content hash of everything the built bundle is a function of. */
export function bundleKey(inputFiles: string[]): string {
  const files = new Set<string>(inputFiles);
  for (const f of readdirSync(SHV2)) if (f.endsWith(".scrml")) files.add(join(SHV2, f));
  for (const f of listFiles(join(ROOT, "compiler", "src"))) files.add(f);
  files.add(join(SHV2, "slice-m1", "harness.js"));
  const h = createHash("sha256");
  h.update(CACHE_FORMAT + "\0");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  h.update("impl1@" + String(pkg.version) + "\0");
  for (const f of [...files].sort()) {
    h.update(relative(ROOT, f).split(sep).join("/") + "\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 32);
}

type Chunk = { name: string | null; deps: string[]; src: string };
export type Boot = { mods: Record<string, any>; cached: boolean; key: string; ms: number };

let loadedBoot: Boot | null = null;

/** Load the bootstrap modules: from the disk cache when the key matches, else build (impl#1) and store. */
export async function loadBoot(opts: { rebuild?: boolean; log?: (s: string) => void } = {}): Promise<Boot> {
  if (loadedBoot && !opts.rebuild) return loadedBoot;
  const t0 = performance.now();
  const h1 = await import("../compiler/self-host-v2/slice-m1/harness.js");
  const h2 = await import("../compiler/self-host-v2/slice-m2/harness.js");
  const bundle = join(SHV2, "slice-m2", "bundle.scrml");
  const key = bundleKey(h1.bundleInputFiles(bundle, h2.M2_MODULES));
  const dir = cacheDir();
  const file = join(dir, key + ".json");
  let chunks: Chunk[] | null = null;
  let cached = false;
  if (!opts.rebuild && existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (data.format === CACHE_FORMAT && data.key === key && Array.isArray(data.chunks)) {
        chunks = data.chunks;
        cached = true;
      }
    } catch { /* a torn or foreign file: rebuild */ }
  }
  if (chunks === null) {
    opts.log?.("scrml-boot: building the bootstrap with impl#1 (cached afterwards)…");
    chunks = h1.buildBundleChunks(bundle, h2.M2_MODULES).chunks as Chunk[];
    try {
      mkdirSync(dir, { recursive: true });
      const tmp = file + "." + process.pid + ".tmp";
      writeFileSync(tmp, JSON.stringify({ format: CACHE_FORMAT, key, chunks }));
      renameSync(tmp, file);
      pruneCache(dir, 8);
    } catch (e) {
      opts.log?.(`scrml-boot: could not write the bundle cache (${(e as Error).message}); continuing uncached`);
    }
  }
  const mods = h1.evaluateChunks(chunks);
  for (const m of ["parse", "link", "analyze", "lower", "check", "print", "print-server"]) {
    if (!mods[m]) throw new Error(`bootstrap module '${m}' missing from the slice-m2 bundle`);
  }
  loadedBoot = { mods, cached, key, ms: performance.now() - t0 };
  return loadedBoot;
}

function pruneCache(dir: string, keep: number) {
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const e of entries.slice(keep)) rmSync(join(dir, e.f), { force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// The source set: the entry + the `.scrml` files it imports (relative imports, transitively).
// ─────────────────────────────────────────────────────────────────────────────

function readSource(f: string, overlay?: ReadonlyMap<string, string>): string {
  const o = overlay?.get(f);
  return o !== undefined ? o : readFileSync(f, "utf8");
}

/** A file's import specifiers, in source order: `(path, src) => from[]` (lowered.js `importFroms`). */
export type ImportReader = (path: string, src: string) => string[];

/**
 * The entry and the `.scrml` files it imports (relative imports, transitively). Each file's imports
 * are read by `readFroms` — lowered.js `importFroms(mods)`, the BOOTSTRAP PARSER's reading
 * (parse.scrml `parseFile` + link.scrml `importsOfItems`), never a text scan. S473 (flogence S60):
 * the regex that stood here accepted only double-quoted specifiers, so `from '../graph-read.scrml'`
 * left its file out of the build — a false E-IMPORT-006 — and it followed an import written inside a
 * comment or a string. #1658 review F2: `compileSource` hands the SAME memoised reader to the front
 * end's stdlib search, which reads every project file's imports too, so each file is parsed for its
 * imports once per compile, not twice.
 * `overlay` (absolute path → text) stands in for the disk: an editor's unsaved buffers. A path in
 * the overlay is read from it (and need not exist on disk); every other path is read from disk.
 */
export function sourceClosure(readFroms: ImportReader, entryAbs: string, overlay?: ReadonlyMap<string, string>): string[] {
  const seen = new Set<string>();
  const todo = [entryAbs];
  while (todo.length > 0) {
    const f = todo.pop() as string;
    if (seen.has(f) || !(overlay?.has(f) || existsSync(f))) continue;
    seen.add(f);
    for (const from of readFroms(f, readSource(f, overlay))) {
      if ((from.startsWith("./") || from.startsWith("../")) && from.endsWith(".scrml")) todo.push(resolve(dirname(f), from));
    }
  }
  return [...seen];
}

function commonDir(files: string[]): string {
  let d = dirname(files[0]);
  while (!files.every((f) => f === d || f.startsWith(d.endsWith(sep) ? d : d + sep))) d = dirname(d);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics.
// ─────────────────────────────────────────────────────────────────────────────

export type Diagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string; // absolute
  line?: number; // 1-based
  col?: number; // 1-based (UTF-16 code units, as JS strings index)
  endLine?: number; // the span's (exclusive) end, when the bootstrap reports one
  endCol?: number;
};

/** A path as the user reads it: relative to the cwd when it is under it, else absolute. */
export function shown(p: string, cwd = process.cwd()): string {
  const r = relative(cwd, p);
  return r === "" ? "." : r.startsWith("..") || isAbsolute(r) ? p : r;
}

const useColor = () => process.stdout.isTTY === true && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = paint("31"), yellow = paint("33"), cyan = paint("36"), dim = paint("2"), bold = paint("1");

function lineCol(src: string, offset: number): { line: number; col: number } {
  let line = 1, last = -1;
  const end = Math.max(0, Math.min(offset, src.length));
  for (let i = 0; i < end; i++) if (src.charCodeAt(i) === 10) { line++; last = i; }
  return { line, col: end - last };
}

function severityOf(d: any): Diagnostic["severity"] {
  const s = String(d.severity ?? "").toLowerCase();
  if (s === "warning") return "warning";
  if (s === "info") return "info";
  if (s === "error") return "error";
  return String(d.code ?? "").startsWith("W-") ? "warning" : String(d.code ?? "").startsWith("I-") ? "info" : "error";
}

/** A printer refusal / checkCore finding is a string, usually `E-CODE: message`. */
function refusalDiag(s: string): Diagnostic {
  const m = /^([EWI]-[A-Z0-9]+(?:-[A-Z0-9]+)*):\s*([\s\S]*)$/.exec(s);
  return m ? { severity: "error", code: m[1], message: m[2] } : { severity: "error", code: "E-BOOTSTRAP-UNSUPPORTED", message: s };
}

function sourceContext(src: string, line: number): string {
  const lines = src.split("\n");
  const out: string[] = [];
  for (let i = Math.max(0, line - 3); i < Math.min(lines.length, line + 2); i++) {
    const n = String(i + 1).padStart(4);
    const here = i + 1 === line;
    out.push(`${here ? red(" > ") : "   "}${here ? red(n) : dim(n)} ${dim("|")} ${lines[i]}`);
  }
  return out.join("\n");
}

export function formatDiagnostic(d: Diagnostic, format: "pretty" | "line", cwd = process.cwd(), sources?: Map<string, string>): string {
  const rel = d.file ? shown(d.file, cwd) : undefined;
  const loc = rel ? `${rel}${d.line ? `:${d.line}${d.col ? ":" + d.col : ""}` : ""}` : "";
  if (format === "line") return `${loc ? loc + ": " : ""}${d.severity} [${d.code}]: ${d.message}`;
  const label = d.severity === "error" ? bold(red("error")) : d.severity === "warning" ? bold(yellow("warning")) : bold(cyan("info"));
  const parts = [`${label} ${dim(`[${d.code}]`)}: ${d.message}`];
  if (loc) {
    parts.push(`  ${cyan("-->")} ${loc}`);
    const src = d.file ? sources?.get(d.file) : undefined;
    if (src !== undefined && d.line) parts.push(sourceContext(src, d.line));
  }
  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// compile
// ─────────────────────────────────────────────────────────────────────────────

export type CompileResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  sources: Map<string, string>; // absolute path → source
  files: string[]; // absolute source paths compiled
  outDir: string;
  written: string[]; // output file names
  server: boolean;
  ms: { boot: number; compile: number };
};

export function defaultOutDir(entryAbs: string): string {
  return join(dirname(entryAbs), "dist", basename(entryAbs, extname(entryAbs)));
}

/** A compile with nothing written: the diagnostics, and the printed artifacts when it got that far. */
export type CheckResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  sources: Map<string, string>; // absolute path → source (the overlay's text where it had one)
  files: string[]; // absolute source paths compiled
  client?: { html: string; js: string }; // present when ok
  serverJs?: string; // present when ok and the program has a server half the client calls
  // s472 (boot-math-port): the stdlib host modules the artifacts import (SPEC §21.3.1) — `src` the
  // file in the stdlib, `out` its path under the output directory (`_scrml/<module>/<file>`)
  hostFiles?: Array<{ src: string; out: string }>; // present when ok
  ms: { boot: number; compile: number };
};

/**
 * s472 (boot-math-port) — the host modules a checked Core's host-backed functions call (core.scrml
 * Fn.host; SPEC §21.3.1, ruling:user-voice-scrml.md S472 "stdlib host `.js` output location": copied to
 * `<outputDir>/_scrml/<module>/<file>`, imported from there by both artifacts). Each must be a file
 * INSIDE its stdlib module's directory — symlinks followed (the compiler refused a path that climbs out,
 * E-IMPORT-012; this keeps a link from doing it) — and export every name a wrapper calls as a function:
 * §21.3.1 "The host module is loaded and named exports are extracted at compile time only". A missing
 * file is E-IMPORT-006, a missing export E-IMPORT-004 (the §21.3 codes for a module / a name that is
 * not there), each a diagnostic at the import — never a page that fails when it loads.
 */
async function hostFilesOf(core: any, stdlibRoot: string, diagnostics: Diagnostic[]): Promise<Array<{ src: string; out: string }>> {
  const byOut = new Map<string, { src: string; out: string; module: string; file: string; names: Set<string> }>();
  for (const f of core.fns ?? []) {
    const h = f.host;
    if (h === null || h === undefined) continue;
    // s473: a `<host>` binding (h.bind, DRAFT SPEC §21.3.3) names no host module — its target is printed in
    // place, and nothing is loaded at build time (rule 3: "The compiler SHALL NOT load, import, or evaluate")
    if (h.bind !== null && h.bind !== undefined) continue;
    const out = `_scrml/${h.module}/${h.file}`;
    let e = byOut.get(out);
    if (e === undefined) {
      e = { src: join(stdlibRoot, h.module, ...String(h.file).split("/")), out, module: String(h.module), file: String(h.file), names: new Set() };
      byOut.set(out, e);
    }
    e.names.add(String(h.name));
  }
  const found: Array<{ src: string; out: string }> = [];
  for (const e of [...byOut.values()].sort((a, b) => (a.out < b.out ? -1 : a.out > b.out ? 1 : 0))) {
    const shownAt = `scrml:${e.module}/${e.file}`;
    let real = "";
    try {
      real = realpathSync(e.src);
    } catch {
      diagnostics.push({ severity: "error", code: "E-IMPORT-006", message: `the host module \`${shownAt}\` (an \`import:host\` of \`scrml:${e.module}\`) does not exist in the stdlib (§21.3.1)`, file: e.src });
      continue;
    }
    const moduleDir = realpathSync(join(stdlibRoot, e.module));
    if (!real.startsWith(moduleDir + sep) || !statSync(real).isFile()) {
      diagnostics.push({ severity: "error", code: "E-IMPORT-012", message: `the host module \`${shownAt}\` resolves outside the module's directory (a link) — a stdlib module's host file SHALL lie in its own directory (§21.3.1)`, file: e.src });
      continue;
    }
    let ns: Record<string, unknown>;
    try {
      ns = await import(pathToFileURL(real).href);
    } catch (err) {
      diagnostics.push({ severity: "error", code: "E-IMPORT-006", message: `the host module \`${shownAt}\` does not load as a JavaScript module: ${String((err as Error)?.message ?? err)}`, file: e.src });
      continue;
    }
    let ok = true;
    for (const name of [...e.names].sort()) {
      if (typeof ns[name] !== "function") {
        ok = false;
        diagnostics.push({ severity: "error", code: "E-IMPORT-004", message: `\`${name}\` is not a function exported by the host module \`${shownAt}\` (§21.3.1: an \`import:host\` binding names a named export of the host module)`, file: e.src });
      }
    }
    if (ok) found.push({ src: real, out: e.out });
  }
  return found;
}

/**
 * Compile `entry` and the `.scrml` files it imports IN MEMORY — nothing is written. `overlay`
 * (absolute path → text) replaces the disk for the paths it names: an editor's unsaved buffers
 * (the entry itself need not exist on disk). Findings are diagnostics; a bootstrap crash throws.
 */
/**
 * s473 (boot-failclosed-sql-protect) — SPEC §14.8.10, "An undeclared `tenant_id` table is refused
 * (S456)", item (2): "A SQLite database file the compiler opens at compile time … is scanned whole —
 * every table and view …: each relation carrying a `tenant_id` column (case-insensitive; read with
 * `table_xinfo`, so a generated column and a hidden one … count) that is not in the tenant set is
 * `E-TENANT-UNDECLARED`, as is a relation whose columns cannot be read (unknown is not clean)."
 *
 * The bootstrap's tenant set is ALWAYS EMPTY — both declaring surfaces (`<schema>`, `<db tables=>`)
 * are refused — so every `tenant_id` relation is undeclared. Before s473 the compile never opened
 * the file, and the built server served every tenant's rows to every request (audit S473 probe
 * s148/t1: an anonymous request got both tenants' orders with 200).
 *
 * BOOTSTRAP INTERIM, wider than the SPEC: §14.8.10 opens only a `<db src=…>` file and leaves a
 * `<program db=…>` file to the startup check (item 3). Here EVERY SQLite file that exists at compile
 * time is scanned, whichever form names it. A database that does not exist yet, or is not SQLite,
 * is item (3)'s — the startup check in slice-m1/runtime/server-runtime.js (`tenantGate`).
 * The scan is the host's, like the stdlib host files: the bootstrap front end does no I/O.
 */
function tenantScan(core: any, root: string, sources: Map<string, string>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const d of core.dbs ?? []) {
    if (d.driver !== "Sqlite") continue;
    let t = String(d.target);
    if (t === ":memory:" || t === "") continue;
    if (t.startsWith("file:")) t = t.slice(5).split("?")[0];
    const declaring = join(root, ...String(d.file).split("/"));
    const path = isAbsolute(t) ? t : resolve(dirname(declaring), t);
    if (seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    const src = sources.get(declaring);
    const at = src !== undefined && src.indexOf(String(d.target)) >= 0 ? lineCol(src, src.indexOf(String(d.target))) : undefined;
    const diag = (message: string): Diagnostic => ({ severity: "error", code: "E-TENANT-UNDECLARED", message, file: declaring, line: at?.line, col: at?.col });
    const fix = "Declare it in `<schema>` so the tenant floor scopes it (`<schema>` / `<db tables=>` are not in the bootstrap yet, so on the bootstrap the tenant set is empty), or — when its rows are not tenant data — rename the column; a view is not a declaration: drop it or rename the column (§14.8.10, S456)";
    let found: string[] = [];
    try {
      const db = new Database(path, { readonly: true });
      try {
        const rels = db.query("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name").all() as Array<{ name: string; type: string }>;
        for (const r of rels) {
          let cols: Array<{ name: string }>;
          try {
            cols = db.query("SELECT name FROM pragma_table_xinfo(?)").all(r.name) as Array<{ name: string }>;
          } catch (e: any) {
            out.push(diag(`the ${r.type} \`${r.name}\` in the SQLite database \`${shown(path)}\` has columns the compiler cannot read (${String(e?.message ?? e)}) — unknown is not clean: it may carry a \`tenant_id\` column outside the compilation's tenant set. ${fix}`));
            continue;
          }
          if (cols.some((c) => String(c.name).toLowerCase() === "tenant_id")) found.push(`${r.type} \`${r.name}\``);
        }
      } finally {
        db.close();
      }
    } catch (e: any) {
      out.push(diag(`the SQLite database \`${shown(path)}\` exists but the compiler cannot read its tables (${String(e?.message ?? e)}) — unknown is not clean: it may hold a \`tenant_id\` relation outside the compilation's tenant set (§14.8.10 item (2))`));
      continue;
    }
    for (const f of found) {
      out.push(diag(`the ${f} in the SQLite database \`${shown(path)}\` carries a \`tenant_id\` column and is not in the compilation's tenant set (§14.8.10 item (2), S456): the tenant floor would not scope it, so the built server would serve every tenant's rows to every request. ${fix}`));
    }
  }
  return out;
}

export async function compileSource(
  entry: string,
  opts: { overlay?: ReadonlyMap<string, string>; rebuild?: boolean; log?: (s: string) => void; stdlibRoot?: string } = {},
): Promise<CheckResult> {
  const entryAbs = resolve(entry);
  const overlay = opts.overlay;
  const boot = await loadBoot({ rebuild: opts.rebuild, log: opts.log });
  const t0 = performance.now();
  const { frontEndStdlib, STDLIB_ROOT, importFroms } = await import("../compiler/self-host-v2/slice-m2/lowered.js");
  // one memoised import reader for the closure AND the front end's stdlib search (#1658 review F2)
  const readFroms: ImportReader = importFroms(boot.mods);
  const abs = sourceClosure(readFroms, entryAbs, overlay);
  if (abs.length === 0) throw new Error(`no such file: ${entryAbs}`);
  const root = commonDir(abs);
  const toRel = (f: string) => relative(root, f).split(sep).join("/");
  const sources = new Map<string, string>();
  const files = abs.map((f) => {
    const src = readSource(f, overlay);
    sources.set(f, src);
    return { path: toRel(f), src };
  });
  const relToAbs = new Map(abs.map((f) => [toRel(f), f]));
  const diagnostics: Diagnostic[] = [];
  const result = (ok: boolean, extra: Partial<CheckResult> = {}): CheckResult =>
    ({ ok, diagnostics, sources, files: abs, ...extra, ms: { boot: boot.ms, compile: performance.now() - t0 } });

  // s471: the `scrml:` stdlib modules the program imports join the compile as source (lowered.js
  // frontEndStdlib); one that does not compile on the bootstrap is withdrawn, and its import refused
  // by name (E-BOOTSTRAP-UNSUPPORTED at the import) — with WHY reported here, at its first error.
  const fe = frontEndStdlib(boot.mods, files, toRel(entryAbs), { stdlibRoot: opts.stdlibRoot, importFroms: readFroms });
  const withdrawn: Diagnostic[] = [];
  for (const r of fe.stdlib.refused as Array<{ module: string; direct: boolean; diags: any[]; sources: Array<{ path: string; src: string; abs: string }> }>) {
    // a module only another stdlib module imports is reported through that one (its import there is the first error)
    if (!r.direct) continue;
    const first = r.diags[0];
    const src = r.sources.find((s) => s.path === first?.file);
    if (src !== undefined) sources.set(src.abs, src.src);
    const lc = src !== undefined && first?.span ? lineCol(src.src, first.span.start) : undefined;
    const n = r.diags.length;
    withdrawn.push({
      severity: "error", code: "E-BOOTSTRAP-UNSUPPORTED",
      message: `\`scrml:${r.module}\` does not compile on the bootstrap yet, so it cannot be imported — its source has ${n} error${n === 1 ? "" : "s"} on the bootstrap; the first: [${first?.code}] ${first?.message}`,
      file: src?.abs, line: lc?.line, col: lc?.col,
    });
  }
  for (const d of [...fe.diags, ...(fe.infos ?? [])]) {
    const f = relToAbs.get(d.file);
    const src = f !== undefined ? sources.get(f) : undefined;
    const lc = src !== undefined && d.span ? lineCol(src, d.span.start) : undefined;
    const ec = src !== undefined && d.span && typeof d.span.end === "number" && d.span.end > d.span.start
      ? lineCol(src, d.span.end) : undefined;
    diagnostics.push({
      severity: severityOf(d), code: String(d.code), message: String(d.message), file: f,
      line: lc?.line, col: lc?.col, endLine: ec?.line, endCol: ec?.col,
    });
  }
  diagnostics.push(...withdrawn);
  if (diagnostics.some((d) => d.severity === "error") || fe.core == null) {
    if (!diagnostics.some((d) => d.severity === "error")) {
      diagnostics.push({ severity: "error", code: "E-BOOTSTRAP-NO-CORE", message: "the front end produced no program (no diagnostic said why — a bootstrap defect)" });
    }
    return result(false);
  }
  // s473: §14.8.10 item (2) — a SQLite file the compile can open is scanned for undeclared tenant tables
  diagnostics.push(...tenantScan(fe.core, root, sources));
  if (diagnostics.some((d) => d.severity === "error")) return result(false);
  // printProgram / printServer run checkCore themselves (the gate at emission); a finding is a refusal.
  const out = boot.mods.print.printProgram(fe.core, "program.client.js", "scrml-runtime.js");
  for (const r of out.refused ?? []) diagnostics.push(refusalDiag(String(r)));
  const so = boot.mods["print-server"].printServer(fe.core, "program.server.js", "scrml-server-runtime.js");
  for (const r of so.refused ?? []) if (!(out.refused ?? []).includes(r)) diagnostics.push(refusalDiag(String(r)));
  if (diagnostics.some((d) => d.severity === "error")) return result(false);
  const serverJs = typeof so.js === "string" && so.js !== "" ? (so.js as string) : undefined;
  const hostFiles = await hostFilesOf(fe.core, opts.stdlibRoot ?? STDLIB_ROOT, diagnostics);
  if (diagnostics.some((d) => d.severity === "error")) return result(false);
  return result(true, { client: { html: out.html, js: out.js }, serverJs, hostFiles });
}

export async function compileFile(file: string, opts: { outDir?: string; rebuild?: boolean; log?: (s: string) => void; stdlibRoot?: string } = {}): Promise<CompileResult> {
  const entryAbs = resolve(file);
  const outDir = opts.outDir ? resolve(opts.outDir) : defaultOutDir(entryAbs);
  const c = await compileSource(entryAbs, { rebuild: opts.rebuild, log: opts.log, stdlibRoot: opts.stdlibRoot });
  const result = (ok: boolean, written: string[] = [], server = false): CompileResult =>
    ({ ok, diagnostics: c.diagnostics, sources: c.sources, files: c.files, outDir, written, server, ms: c.ms });
  if (!c.ok || c.client === undefined) return result(false);

  mkdirSync(outDir, { recursive: true });
  const written = ["index.html", "program.client.js", "scrml-runtime.js"];
  writeFileSync(join(outDir, "index.html"), c.client.html);
  writeFileSync(join(outDir, "program.client.js"), c.client.js);
  copyFileSync(RUNTIME, join(outDir, "scrml-runtime.js"));
  const server = c.serverJs !== undefined;
  if (c.serverJs !== undefined) {
    writeFileSync(join(outDir, "program.server.js"), c.serverJs);
    copyFileSync(SERVER_RUNTIME, join(outDir, "scrml-server-runtime.js"));
    copyFileSync(RUNTIME, join(outDir, "runtime.js"));
    written.push("program.server.js", "scrml-server-runtime.js", "runtime.js");
  } else {
    // a previous compile of this program may have had a server half
    for (const f of ["program.server.js", "scrml-server-runtime.js", "runtime.js"]) rmSync(join(outDir, f), { force: true });
  }
  // s472 (boot-math-port): the stdlib host modules, at `_scrml/<module>/<file>` (SPEC §21.3.1). The
  // `_scrml/` directory is the compiler's: what a previous compile left there goes first.
  rmSync(join(outDir, "_scrml"), { recursive: true, force: true });
  for (const h of c.hostFiles ?? []) {
    const dst = join(outDir, ...h.out.split("/"));
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(h.src, dst);
    written.push(h.out);
  }
  return result(true, written, server);
}

function report(r: CompileResult, format: "pretty" | "line") {
  for (const d of r.diagnostics) {
    console.error(formatDiagnostic(d, format, process.cwd(), r.sources));
    if (format === "pretty") console.error("");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// dev: compile, serve on localhost, recompile on save (the page reloads itself).
// ─────────────────────────────────────────────────────────────────────────────

const RELOAD_PATH = "/__scrml-boot/events";
// The page's dev hook: reload on a good build; on a failed one, show the diagnostics over the page.
const RELOAD_SNIPPET = `<script>(()=>{const es=new EventSource(${JSON.stringify(RELOAD_PATH)});es.onmessage=(e)=>{if(e.data==="reload")return location.reload();let o=document.getElementById("__scrml_boot_errors");if(!o){o=document.createElement("pre");o.id="__scrml_boot_errors";o.style.cssText="position:fixed;inset:auto 0 0 0;max-height:60vh;overflow:auto;margin:0;padding:12px 16px;background:#2b0d0d;color:#ffd7d7;font:13px/1.4 ui-monospace,monospace;white-space:pre-wrap;z-index:2147483647";document.body.appendChild(o);}o.textContent=JSON.parse(e.data);};})();</script>`;
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

async function dev(file: string, opts: { outDir?: string; port: number; format: "pretty" | "line" }) {
  const entryAbs = resolve(file);
  const log = (s: string) => console.error(s);
  let current: CompileResult | null = null;
  let server: { fetch(req: Request): Promise<Response> } | null = null;
  let generation = 0;
  const clients = new Set<ReadableStreamDefaultController>();
  const watchers = new Map<string, ReturnType<typeof watch>>();

  async function build(reason: string) {
    const t = performance.now();
    let r: CompileResult;
    try {
      r = await compileFile(entryAbs, { outDir: opts.outDir, log });
    } catch (e) {
      log(red("scrml-boot: internal error: ") + String((e as Error)?.stack ?? e));
      return;
    }
    report(r, opts.format);
    rewatch(r.files);
    if (!r.ok) {
      log(red(`✗ ${reason}: compile failed — the last good build is still served`));
      const text = "scrml-boot: compile failed\n\n" + r.diagnostics.map((d) => formatDiagnostic(d, "line")).join("\n");
      for (const c of clients) { try { c.enqueue("data: " + JSON.stringify(text) + "\n\n"); } catch { clients.delete(c); } }
      return;
    }
    current = r;
    generation++;
    server = null;
    if (r.server) {
      const mod = await import(pathToFileURL(join(r.outDir, "program.server.js")).href + "?v=" + generation);
      server = mod.createServer({ root: dirname(entryAbs) });
    }
    log(`✓ ${reason}: compiled ${shown(entryAbs)} in ${Math.round(performance.now() - t)} ms → ${shown(r.outDir)}`);
    for (const c of clients) { try { c.enqueue("data: reload\n\n"); } catch { clients.delete(c); } }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function rewatch(files: string[]) {
    const dirs = new Set(files.map((f) => dirname(f)));
    const names = new Set(files);
    for (const [d, w] of watchers) if (!dirs.has(d)) { w.close(); watchers.delete(d); }
    for (const d of dirs) {
      if (watchers.has(d)) continue;
      // watch the DIRECTORY: editors save by rename, which a file watch loses
      watchers.set(d, watch(d, (_ev, name) => {
        if (name == null) return;
        const f = join(d, String(name));
        if (!names.has(f) && !(current?.files ?? []).includes(f)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; void build("changed " + shown(f)); }, 60);
      }));
    }
  }

  await build("start");

  const srv = Bun.serve({
    port: opts.port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === RELOAD_PATH) {
        let ctl: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(c) { ctl = c; clients.add(c); c.enqueue(": connected\n\n"); },
          cancel() { clients.delete(ctl); },
        });
        return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
      }
      if (url.pathname.startsWith("/_scrml/")) {
        // s472 (boot-math-port): a stdlib host module the build copied there is a static file
        // (SPEC §21.3.1); everything else under `/_scrml/` is a server-function route
        const host = current?.written.includes(decodeURIComponent(url.pathname.slice(1))) ? resolve(current.outDir, decodeURIComponent(url.pathname.slice(1))) : null;
        if (host !== null && current !== null && host.startsWith(current.outDir + sep) && existsSync(host)) {
          return new Response(readFileSync(host), { headers: { "Content-Type": MIME[".js"] ?? "text/javascript", "Cache-Control": "no-store" } });
        }
        if (server === null) return new Response("this program has no server functions", { status: 404 });
        return server.fetch(req);
      }
      if (current === null) return new Response("scrml-boot: no successful compile yet — see the terminal", { status: 503 });
      const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const p = resolve(current.outDir, rel);
      if (!p.startsWith(current.outDir + sep) || !existsSync(p) || !statSync(p).isFile() || basename(p) === "program.server.js") {
        return new Response("not found", { status: 404 });
      }
      let body: string | Uint8Array = readFileSync(p);
      if (rel === "index.html") body = String(readFileSync(p, "utf8")).replace("</head>", RELOAD_SNIPPET + "</head>");
      return new Response(body, { headers: { "Content-Type": MIME[extname(p)] ?? "application/octet-stream", "Cache-Control": "no-store" } });
    },
  });
  log(`scrml-boot dev: http://127.0.0.1:${srv.port}/  (watching ${shown(entryAbs)}; Ctrl-C to stop)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `scrml-boot — compile scrml with the BOOTSTRAP compiler (compiler/self-host-v2/, the ruled language)

Usage:
  scrml-boot compile <file.scrml> [options]   Compile; write index.html + program.client.js + runtime
  scrml-boot dev <file.scrml> [options]       Compile, serve on 127.0.0.1, recompile + reload on save

Options:
  --output-dir, -o <dir>   Output directory (default: dist/<name>/ next to the file)
  --format <pretty|line>   Diagnostic format (default pretty; line = file:line:col: error [CODE]: msg)
  --rebuild                Rebuild the cached bootstrap bundle even if its inputs did not change
  --port <n>               dev: HTTP port (default 3000)
  --verbose, -v            Timings (bundle load, compile)

Exit status: 0 compiled · 1 compile errors · 2 usage or internal error.`;

async function main(argv: string[]): Promise<number> {
  const cmd = argv[0];
  if (cmd === undefined || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(USAGE);
    return cmd === undefined ? 2 : 0;
  }
  if (cmd !== "compile" && cmd !== "dev") {
    console.error(`scrml-boot: unknown command '${cmd}'\n\n${USAGE}`);
    return 2;
  }
  let file: string | undefined;
  let outDir: string | undefined;
  let format: "pretty" | "line" = "pretty";
  let port = 3000;
  let rebuild = false;
  let verbose = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    try {
      if (a === "--output-dir" || a === "-o") outDir = val();
      else if (a.startsWith("--output-dir=")) outDir = a.slice("--output-dir=".length);
      else if (a === "--format") format = val() as any;
      else if (a.startsWith("--format=")) format = a.slice("--format=".length) as any;
      else if (a === "--port") port = Number(val());
      else if (a.startsWith("--port=")) port = Number(a.slice("--port=".length));
      else if (a === "--rebuild") rebuild = true;
      else if (a === "--verbose" || a === "-v") verbose = true;
      else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
      else if (file === undefined) file = a;
      else throw new Error(`one input file only (got '${file}' and '${a}')`);
    } catch (e) {
      console.error(`scrml-boot: ${(e as Error).message}`);
      return 2;
    }
  }
  if (format !== "pretty" && format !== "line") { console.error(`scrml-boot: --format is pretty or line`); return 2; }
  if (file === undefined) { console.error(`scrml-boot ${cmd}: no input file\n\n${USAGE}`); return 2; }
  if (!existsSync(file) || !statSync(file).isFile()) { console.error(`scrml-boot: no such file: ${file}`); return 2; }
  if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error(`scrml-boot: bad --port`); return 2; }

  if (cmd === "dev") {
    await dev(file, { outDir, port, format });
    return -1; // keep running
  }
  const t0 = performance.now();
  const r = await compileFile(file, { outDir, rebuild, log: (s) => console.error(s) });
  report(r, format);
  const errors = r.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = r.diagnostics.length - errors;
  if (verbose) {
    console.error(dim(`bundle ${loadedBoot?.cached ? "cached" : "built"} ${Math.round(r.ms.boot)} ms (key ${loadedBoot?.key.slice(0, 12)}) · compile ${Math.round(r.ms.compile)} ms · total ${Math.round(performance.now() - t0)} ms`));
  }
  if (!r.ok) {
    console.error(red(`✗ ${errors} error${errors === 1 ? "" : "s"}${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""} — nothing written`));
    return 1;
  }
  const outRel = shown(r.outDir);
  console.log(`✓ compiled ${shown(resolve(file))} → ${outRel}/ (${r.written.join(", ")})${warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`);
  return 0;
}

if (import.meta.main) {
  // `bun run boot:compile <file>` runs from the repo root; a relative <file> (and every path we
  // print) means the directory the user typed it in: npm passes it as INIT_CWD, bun (1.4) as
  // npm_config_local_prefix.
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  const typedIn = process.env.INIT_CWD || process.env.npm_config_local_prefix;
  if (lifecycle.startsWith("boot") && typedIn && existsSync(typedIn)) process.chdir(typedIn);
  try {
    const code = await main(process.argv.slice(2));
    if (code >= 0) process.exit(code);
  } catch (e) {
    console.error("scrml-boot: internal error: " + String((e as Error)?.stack ?? e));
    process.exit(2);
  }
}
