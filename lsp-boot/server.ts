#!/usr/bin/env bun
/**
 * lsp-boot/server.ts — a minimal language server backed by the BOOTSTRAP compiler
 * (compiler/self-host-v2/, the ruled language). change-id: s469-boot-lsp.
 *
 * lsp/server.js runs impl#1, which rejects today's spellings (§66 declarations, grants, `single`,
 * `renders`…), so on correct code it shows impl#1 errors. This server shows what `scrml-boot
 * compile` would say — live, from the IN-MEMORY buffer, as you type.
 *
 * Usage: bun run lsp-boot/server.ts --stdio        (package script: `bun run lsp:boot`)
 *
 * WHAT IT DOES
 *   - textDocument/didOpen · didChange (incremental sync) · didClose
 *   - textDocument/publishDiagnostics: a bootstrap compile (scripts/scrml-boot.ts compileSource) of
 *     the buffer text; every open buffer overlays the disk, so an unsaved imported module is read
 *     from its buffer too. `code` = the diagnostic code, `source` = "scrml-boot".
 *   - shutdown / exit.
 *   Nothing else: no hover, definition, completion. They are not faked.
 *
 * SCHEDULING
 *   - Each edit restarts a per-document debounce (SCRML_BOOT_LSP_DEBOUNCE_MS, default 150 ms).
 *   - Compiles run one at a time in a Worker (lsp-boot/worker.ts). A result is published only if
 *     the document is still at the version that was compiled — a stale compile never overwrites a
 *     newer one.
 *   - A compile that an edit has superseded and that has run longer than
 *     SCRML_BOOT_LSP_CANCEL_AFTER_MS (default 500) is cancelled: the worker is terminated and a
 *     fresh one started (it reloads the cached bundle, ~0.15 s). Shorter ones finish and are dropped.
 *   - A compile that is current but runs longer than SCRML_BOOT_LSP_TIMEOUT_MS (default 10000) is
 *     a hang: the worker is terminated and the buffer gets one Error "scrml-boot crashed: …".
 *   - A bootstrap exception, a worker death, or a bundle that will not load is likewise one Error
 *     diagnostic on line 1, "scrml-boot crashed: …". A buffer is never silently clean.
 *   - Editing a file recompiles the other open documents whose last compile read it.
 *
 * The bundle is loaded once, at startup (the first time ever — or after compiler sources change —
 * impl#1 builds it, ~10 s; it is cached on disk, see scripts/scrml-boot.ts). Restart the server to
 * pick up a changed bootstrap.
 */

import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { Diagnostic as BootDiagnostic } from "../scripts/scrml-boot.ts";
import { crashDiagnostic, toLspDiagnostics, uriDiagnostic, type LspDiagnostic } from "./diagnostics.ts";

const envMs = (name: string, dflt: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};
const DEBOUNCE_MS = envMs("SCRML_BOOT_LSP_DEBOUNCE_MS", 150);
const CANCEL_AFTER_MS = envMs("SCRML_BOOT_LSP_CANCEL_AFTER_MS", 500);
const TIMEOUT_MS = envMs("SCRML_BOOT_LSP_TIMEOUT_MS", 10_000);
const TEST_FAULTS = process.env.SCRML_BOOT_LSP_TEST_FAULTS === "1";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let workspaceRoot = process.cwd();
const log = (s: string) => connection.console.log(s);

// ─────────────────────────────────────────────────────────────────────────────
// Documents → paths. A file: URI is its path; an unsaved untitled buffer gets a stable synthetic
// path in the workspace root (it is only ever read from the overlay, never from disk).
// A file: URI that names no local path (S474 backfill L1: `file://remotehost/x.scrml`, an encoded
// `/` as in `file:///tmp/a%2Fb.scrml`) has none: `pathOf` is null, the document is not compiled and
// gets one diagnostic saying why. `fileURLToPath` throws on those, and unguarded that throw killed
// the server.
// ─────────────────────────────────────────────────────────────────────────────

const untitled = new Map<string, string>();
// S474 backfill L2: a MONOTONIC counter. `untitled.size + 1` reused a live buffer's name once an
// earlier one closed, and the overlay then compiled one buffer with the other's text.
let nextUntitled = 1;

/**
 * A `file:` URI's local path, or why it has none. #1723 review L-b: beyond what `fileURLToPath`
 * rejects, a URI that decodes to a directory (`file:`, `file:%00` resolve to `/`) or, off Windows, to
 * a path with a backslash (`%5C`, which no editor writes for a real file) is not a document path.
 */
function localPath(uri: string): { path: string } | { why: string } {
  let p: string;
  try {
    p = resolve(fileURLToPath(uri));
  } catch (e) {
    return { why: (e as Error)?.message ?? String(e) };
  }
  if (p.includes("\0")) return { why: "the path holds a NUL" };
  if (process.platform !== "win32" && p.includes("\\")) return { why: "the decoded path holds a backslash (an encoded %5C)" };
  try {
    if (statSync(p).isDirectory()) return { why: `it decodes to the directory ${p}` };
  } catch {
    /* not on disk yet: an unsaved file is fine */
  }
  return { path: p };
}

/** Why a `file:` URI has no local path, or null when it has one. */
function uriProblem(uri: string): string | null {
  if (!uri.startsWith("file:")) return null;
  const l = localPath(uri);
  return "why" in l ? l.why : null;
}

function pathOf(uri: string): string | null {
  if (uri.startsWith("file:")) {
    const l = localPath(uri);
    return "path" in l ? l.path : null;
  }
  let p = untitled.get(uri);
  if (p === undefined) {
    p = join(workspaceRoot, `.scrml-boot-untitled-${nextUntitled++}.scrml`);
    untitled.set(uri, p);
  }
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// The worker.
// ─────────────────────────────────────────────────────────────────────────────

type Job = { id: number; uri: string; path: string; version: number; text: string; started: number; cancelTimer?: Timer; hangTimer?: Timer };

let worker: Worker | null = null;
let workerReady = false;
let bootFailure: string | null = null; // the last loadBoot failure; cleared when a worker is started again
let inflight: Job | null = null;
let nextId = 1;

const queue: string[] = []; // URIs waiting to compile, oldest first, each once
const timers = new Map<string, Timer>(); // per-URI debounce
const deps = new Map<string, Set<string>>(); // URI → absolute paths its last compile read

function startWorker() {
  workerReady = false;
  bootFailure = null;
  const w = new Worker(new URL("./worker.ts", import.meta.url).href);
  worker = w;
  w.onmessage = (ev: MessageEvent) => { if (worker === w) onWorkerMessage(ev.data); };
  w.onerror = (ev: ErrorEvent) => { if (worker === w) onWorkerDeath(`the compile worker failed: ${ev.message ?? ev}`); };
  w.addEventListener("close", () => { if (worker === w) onWorkerDeath("the compile worker exited"); });
  w.postMessage({ type: "init", faults: TEST_FAULTS });
}

function stopWorker() {
  const w = worker;
  worker = null;
  workerReady = false;
  if (w) w.terminate();
}

function clearJobTimers(j: Job) {
  if (j.cancelTimer) clearTimeout(j.cancelTimer);
  if (j.hangTimer) clearTimeout(j.hangTimer);
}

function publish(uri: string, diagnostics: LspDiagnostic[]) {
  void connection.sendDiagnostics({ uri, diagnostics });
}

/** The job's result applies only while its document is open at the compiled version. */
function isCurrent(j: Job): boolean {
  const doc = documents.get(j.uri);
  return doc !== undefined && doc.version === j.version;
}

function onWorkerMessage(m: any) {
  if (m.type === "log") { log(String(m.message)); return; }
  if (m.type === "ready") {
    workerReady = true;
    log(`scrml-boot LSP: bootstrap ${m.cached ? "loaded from cache" : "built"} in ${Math.round(m.ms)} ms`);
    pump();
    return;
  }
  if (m.type === "boot-failed") {
    // Every waiting document gets the failure; the next edit tries a fresh worker.
    const why = String(m.error).split("\n")[0];
    log("scrml-boot LSP: could not load the bootstrap:\n" + m.error);
    stopWorker();
    bootFailure = why;
    failQueued(`could not load the bootstrap: ${why}`);
    return;
  }
  if (m.type !== "result" && m.type !== "crash") return;
  const j = inflight;
  if (j === null || j.id !== m.id) return; // a cancelled job's late answer
  inflight = null;
  clearJobTimers(j);
  if (isCurrent(j)) {
    if (m.type === "result") {
      deps.set(j.uri, new Set(m.files as string[]));
      publish(j.uri, toLspDiagnostics(m.diagnostics as BootDiagnostic[], j.path, j.text));
    } else {
      log(`scrml-boot LSP: compile of ${j.uri} crashed:\n${m.stack ?? m.error}`);
      publish(j.uri, [crashDiagnostic(j.text, String(m.error))]);
    }
  }
  pump();
}

/** The worker died under a job (OOM, an uncaught error): that job's buffer says so. */
function onWorkerDeath(why: string) {
  log(`scrml-boot LSP: ${why}`);
  const wasReady = workerReady;
  const j = inflight;
  inflight = null;
  stopWorker();
  if (j) {
    clearJobTimers(j);
    if (isCurrent(j)) publish(j.uri, [crashDiagnostic(j.text, why)]);
  }
  if (!wasReady) {
    // died while loading the bundle: report it rather than respawn in a loop; the next edit retries
    bootFailure = why;
    failQueued(`could not load the bootstrap: ${why}`);
    return;
  }
  startWorker();
  pump();
}

function failQueued(why: string) {
  while (queue.length > 0) {
    const uri = queue.shift() as string;
    const doc = documents.get(uri);
    if (doc) publish(uri, [crashDiagnostic(doc.getText(), why)]);
  }
}

function overlay(): [string, string][] {
  const out: [string, string][] = [];
  for (const d of documents.all()) {
    const p = pathOf(d.uri);
    if (p !== null) out.push([p, d.getText()]);
  }
  return out;
}

/** Start the next queued compile, if the worker is free. */
function pump() {
  if (inflight !== null || queue.length === 0) return;
  if (bootFailure !== null) { failQueued(`could not load the bootstrap: ${bootFailure}`); return; }
  if (worker === null) { startWorker(); return; }
  if (!workerReady) return; // "ready" pumps
  const uri = queue.shift() as string;
  const doc = documents.get(uri);
  if (doc === undefined) { pump(); return; }
  const path = pathOf(uri);
  if (path === null) {
    publish(uri, [uriDiagnostic(doc.getText(), uri, uriProblem(uri) ?? "not a local path")]);
    pump();
    return;
  }
  const j: Job = { id: nextId++, uri, path, version: doc.version, text: doc.getText(), started: performance.now() };
  inflight = j;
  j.hangTimer = setTimeout(() => onHang(j), TIMEOUT_MS);
  worker.postMessage({ type: "compile", id: j.id, path, overlay: overlay() });
}

function onHang(j: Job) {
  if (inflight !== j) return;
  inflight = null;
  clearJobTimers(j);
  stopWorker();
  if (isCurrent(j)) publish(j.uri, [crashDiagnostic(j.text, `the compile did not finish within ${TIMEOUT_MS} ms (a hang in the bootstrap?); edit to retry`)]);
  log(`scrml-boot LSP: compile of ${j.uri} timed out after ${TIMEOUT_MS} ms; worker restarted`);
  startWorker();
  pump();
}

/** The in-flight compile is for an older version: cancel it once it has run CANCEL_AFTER_MS. */
function onSuperseded(j: Job) {
  if (j.cancelTimer) return;
  const cancel = () => {
    if (inflight !== j) return;
    inflight = null;
    clearJobTimers(j);
    log(`scrml-boot LSP: cancelled a superseded compile of ${j.uri} after ${Math.round(performance.now() - j.started)} ms`);
    stopWorker();
    startWorker(); // "ready" pumps the newer compile
  };
  const left = CANCEL_AFTER_MS - (performance.now() - j.started);
  if (left <= 0) cancel();
  else j.cancelTimer = setTimeout(cancel, left);
}

function enqueue(uri: string) {
  if (!queue.includes(uri)) queue.push(uri);
  if (bootFailure !== null && worker === null) bootFailure = null; // an edit retries a failed load
  if (inflight !== null && inflight.uri === uri && !isCurrent(inflight)) onSuperseded(inflight);
  pump();
}

function schedule(uri: string) {
  const t = timers.get(uri);
  if (t) clearTimeout(t);
  timers.set(uri, setTimeout(() => { timers.delete(uri); enqueue(uri); }, DEBOUNCE_MS));
}

// ─────────────────────────────────────────────────────────────────────────────
// LSP wiring.
// ─────────────────────────────────────────────────────────────────────────────

connection.onInitialize((params) => {
  const folder = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
  if (folder && folder.startsWith("file:") && uriProblem(folder) === null) workspaceRoot = fileURLToPath(folder);
  else if (params.rootPath) workspaceRoot = params.rootPath;
  startWorker(); // load the bundle while the client finishes starting up
  return {
    capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental },
    serverInfo: { name: "scrml-boot-lsp", version: "0.1.0" },
  };
});

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  schedule(uri);
  // documents whose last compile read this file see its new text too
  const p = pathOf(uri);
  if (p !== null) for (const [other, files] of deps) if (other !== uri && files.has(p) && documents.get(other)) schedule(other);
  // a superseded in-flight compile of this document can be cancelled now, not after the debounce
  if (inflight !== null && inflight.uri === uri) onSuperseded(inflight);
});

documents.onDidClose((ev) => {
  const uri = ev.document.uri;
  const p = pathOf(uri);
  const t = timers.get(uri);
  if (t) clearTimeout(t);
  timers.delete(uri);
  const i = queue.indexOf(uri);
  if (i >= 0) queue.splice(i, 1);
  deps.delete(uri);
  untitled.delete(uri);
  publish(uri, []);
  // documents that imported it now read it from disk
  if (p !== null) for (const [other, files] of deps) if (files.has(p) && documents.get(other)) schedule(other);
});

connection.onShutdown(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  queue.length = 0;
  if (inflight) clearJobTimers(inflight);
  inflight = null;
  stopWorker();
});

// `exit` is handled by the connection: it exits 0 after shutdown, 1 without.

documents.listen(connection);
connection.listen();
