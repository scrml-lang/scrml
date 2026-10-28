#!/usr/bin/env bun
/**
 * scripts/inbox-debt.ts — every message on the `inbox` BRANCH is HANDLED, or it is OWED.
 *
 * WHY THIS EXISTS (S470). Since S447 (pa-base v2.18 §10) sibling agents deliver messages by
 * PUSHING to scrml's `inbox` branch (`origin/inbox`, under `handOffs/incoming/`), not by writing
 * into a working tree. A message is HANDLED once its file name exists under
 * `handOffs/incoming/read/` (or `resolved/`) on the integration branch, `main`. The scrml boot
 * only listed the LOCAL `handOffs/incoming/` directory. At S470 boot that read "inbox empty"
 * while `origin/inbox` held an unhandled `needs: action` message from flogence, sent the same
 * day (`2026-10-24-from-flogence-S59-to-scrml-type-027-on-error-type-arm.md`).
 *
 * pa-base §10: an obligation and its probe MUST resolve to the same artifact. The obligation
 * lives on two REFS, so this probe reads exactly those two refs and nothing else:
 *
 *   MESSAGES  `git ls-tree origin/inbox -- handOffs/incoming/`, minus `read/` and `resolved/`
 *             — PLUS any file under `read/` on the INBOX branch that main does not hold
 *             (same name, same blob) under read/ or resolved/: `read/` on the inbox branch
 *             is not a handled location in the messaging contract, so a file pushed straight
 *             into it is a message nobody has filed (S472).
 *   HANDLED   the same FILE — basename AND git blob id — appears under
 *             `handOffs/incoming/read/` OR `.../resolved/` in `git ls-tree origin/main`, or
 *             under `resolved/` on the inbox branch itself (messaging contract v10: `msg
 *             resolve` files there; flobase cross-pa-notify "Status"). A message file is never
 *             edited after it is sent, so the handled copy is byte-identical (measured S472:
 *             13 of 13 handled top-level messages). A same-NAME, different-BLOB copy does NOT
 *             discharge: it is a re-send under a reused name (S472 — basename-only matching
 *             classed it HANDLED and hid it). NEVER the working-tree filesystem: a dirty or
 *             stale checkout must not be able to fake a discharge (or hide a message).
 *   UNHANDLED everything else. Printed with basename · needs · from · subject, parsed from
 *             the message's own frontmatter (`git show origin/inbox:<path>`).
 *   OWED      an unhandled message whose `needs:` is anything but an explicit not-owing value
 *             (`fyi` / `none` / `info` / `awareness` / `nothing`, optionally followed only by a
 *             parenthetical or a dash comment) — and a message with no `needs:` or no
 *             frontmatter at all. S472: the exact set {action, reply} missed the real corpus
 *             (`ruling`, `triage`, `fix`, `triage + fix`, `ratify`, `**PRIORITY RULING …**`,
 *             `action (urgent)`). Fail-closed: an unknown value owes.
 *
 * MISDELIVERED? A message on scrml's inbox addressed to someone other than scrml is flagged,
 * not silently counted. The addressee is read from TWO places, because the witnessed case needs
 * both: the S454 bryan→peter messages carry `to: scrml` in their frontmatter and name the real
 * recipient only in the FILE NAME (`…-from-S454-bryan-to-peter-…`) and the subject
 * ("(for Peter) …"). A `to:`-only check reads those three as correctly delivered. So: the
 * frontmatter `to:` AND the file-name `-to-<who>-` segment must each be scrml (or absent).
 * S470 owner ruling: peter and bryan are this desk's people, so `-to-peter-` / `to: bryan` are
 * delivered (SELF_PEOPLE); the S454 messages are now plain UNHANDLED, not MISDELIVERED?.
 * A flagged message is still UNHANDLED and still counts — MISDELIVERED? is a label, not an
 * exemption; someone must route it and move it to `read/`.
 *
 * DESIGN CONSTRAINTS (pa-base §8 gate-design + §2 detection-is-a-ratio — the issue-debt.ts /
 * review-debt.ts shape, which this file mirrors):
 *   - DETECTION, NOT CONTROL. Exit 0 always in default mode. NEVER wire this into CI — a
 *     red-over-backlog gate is the §8 cry-wolf shape. It runs at BOOT (scripts/boot.ts
 *     delegates to it) and reports. `--check` is for the PA's own hand: exit 1 iff any
 *     UNHANDLED message is OWED (misdelivered ones included — an action owed to the wrong
 *     desk is still an action nobody has taken).
 *   - THE INDISTINGUISHABLE FAILURE (§8). If the fetch or ANY git call fails, the probe prints
 *     `inbox-debt: UNAVAILABLE (<reason>)` and NEVER a count. "0 unhandled" on an error path is
 *     exactly the S470 failure (an unread inbox reported empty). In `--check` mode UNAVAILABLE
 *     exits 2 — not 0, which would read as "verified clean", and not 1, which means "debt found".
 *   - PURE CLASSIFIER. `classify()` takes two tree listings + a path→text map and returns the
 *     report — no git, no fs, no clock — so compiler/tests/unit/inbox-debt.test.js pins it
 *     without a network. `import.meta.main` gates the CLI (the scripts/state.ts S307 pattern).
 *   - READ-ONLY. `git fetch <remote> inbox main` updates remote-tracking refs only; this never
 *     pulls, checks out, commits or pushes. Safe to run at any time, from any checkout.
 *   - TESTABLE FAILURE. `--remote=<name>` (or env `INBOX_DEBT_REMOTE`) picks the remote, so a
 *     bogus name proves the UNAVAILABLE path live (the §8 "prove the bite" obligation).
 *   - WINDOWS-FIRST. ROOT via fileURLToPath; sub-processes via spawnSync with an explicit arg
 *     array, no shell.
 *
 * Usage:
 *   bun scripts/inbox-debt.ts                  # report (boot probe) — exit 0
 *   bun scripts/inbox-debt.ts --check          # exit 1 iff an unhandled message is OWED; 2 if UNAVAILABLE
 *   bun scripts/inbox-debt.ts --json           # {remote, total, unhandled:[…], handled, misdelivered}
 *   bun scripts/inbox-debt.ts --remote=nope    # bogus remote → UNAVAILABLE (bite proof for the error path)
 *   bun scripts/inbox-debt.ts --no-fetch       # use the remote-tracking refs as they are (offline)
 */

import { fileURLToPath } from "node:url";
import { spawnSync } from "child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, ""); // strip trailing sep on BOTH OSes

export const INCOMING = "handOffs/incoming/";
export const HANDLED_DIRS = ["read", "resolved"] as const;
export const INBOX_BRANCH = "inbox";
export const MAIN_BRANCH = "main";
/** The addressee this inbox serves. Anything else is MISDELIVERED?. */
export const SELF = "scrml";
/**
 * The people this desk serves (S470 owner ruling): a message to peter or bryan on scrml's
 * inbox is delivered — the scrml PA works for both. Only another desk (giti, flogence, …) is
 * MISDELIVERED?.
 */
export const SELF_PEOPLE: readonly string[] = ["peter", "bryan"];
/**
 * `needs:` values that do NOT owe a response (S472). The contract vocabulary is
 * `fyi | action` (flobase cross-pa-notify) plus `reply` (pa-scrml-overlay); the corpus also uses
 * `none`, `info`, `awareness`, "nothing from you". Everything else OWES — the S470 exact set
 * {action, reply} classed `ruling` / `triage` / `fix` / `ratify` / `**PRIORITY RULING …**` as
 * "• open", left them out of the header count, and `--check` exited 0 on them.
 */
export const NOT_OWING: readonly string[] = ["fyi", "none", "info", "awareness", "nothing"];
const NOT_OWING_RE = new RegExp(
  `^(?:${NOT_OWING.join("|")})(?: from you)?\\s*(?:$|\\(.*\\)\\s*$|[—–]\\s*.*$|\\s-\\s.*$)`,
);

/**
 * Does this message owe a response? FAIL-CLOSED: owed unless its `needs:` is an explicit
 * not-owing value — optionally followed ONLY by a parenthetical or a dash comment
 * (`fyi (no action)`, `fyi — no ask`). `fyi + one lane call` / `fyi / your-call` carry an ask
 * and owe. A message with no frontmatter, or no `needs:`, owes: nobody has said it doesn't.
 */
export function owesResponse(m: { needs: string; hasFrontmatter: boolean }): boolean {
  if (!m.hasFrontmatter) return true;
  const v = m.needs.toLowerCase().replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  if (v === "") return true;
  return !NOT_OWING_RE.test(v);
}

// ── the pure classifier (no git, no fs, no clock) ─────────────────────────────

export type Frontmatter = Record<string, string>;

/**
 * A tree listing entry: a bare path, or a path + git blob id (`git ls-tree -r` without
 * `--name-only`). The CLI always supplies blobs; a bare path (tests) has blob `undefined`, which
 * matches only another `undefined`.
 */
export type TreeEntry = string | { path: string; blob?: string };
const entryPath = (e: TreeEntry) => (typeof e === "string" ? e : e.path);
const entryBlob = (e: TreeEntry) => (typeof e === "string" ? undefined : e.blob);

export interface Message {
  path: string;            // full tree path on the inbox branch
  name: string;            // basename (identity is basename + blob — see HANDLED)
  from: string;
  to: string;
  needs: string;           // lowercased; "" when absent
  subject: string;
  hasFrontmatter: boolean;
  misdelivered: boolean;
  misdeliveredWhy: string; // "" unless misdelivered
  note: string;            // "" or why a HANDLED-looking file is still counted (S472)
}

export interface Report {
  total: number;           // messages on the inbox branch (read/ + resolved/ excluded)
  handled: number;
  unhandled: Message[];    // sorted: owed first, then by name
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

/**
 * Is `path` a MESSAGE — under `handOffs/incoming/`, not inside a `read/` or `resolved/`
 * directory at any depth below it? `.gitkeep`-style placeholders are not messages.
 */
export function isMessagePath(path: string): boolean {
  if (!path.startsWith(INCOMING)) return false;
  const rest = path.slice(INCOMING.length);
  if (rest === "" || rest.endsWith("/")) return false;
  const segs = rest.split("/");
  const name = segs[segs.length - 1];
  if (name === ".gitkeep" || name === ".keep") return false;
  return !segs.slice(0, -1).some((d) => (HANDLED_DIRS as readonly string[]).includes(d));
}

/**
 * The HANDLED set: basenames of every file under `handOffs/incoming/read/` or
 * `handOffs/incoming/resolved/` (any depth) in the integration branch's tree listing.
 */
export function handledNames(mainTree: TreeEntry[]): Set<string> {
  const out = new Set<string>();
  for (const p of mainTree.map(entryPath)) {
    if (!p.startsWith(INCOMING)) continue;
    const segs = p.slice(INCOMING.length).split("/");
    if (segs.length >= 2 && (HANDLED_DIRS as readonly string[]).includes(segs[0])) out.add(segs[segs.length - 1]);
  }
  return out;
}

/** Is `path` under `handOffs/incoming/read/` (any depth below it)? */
export function isUnderIncomingDir(path: string, dir: string): boolean {
  if (!path.startsWith(INCOMING)) return false;
  const segs = path.slice(INCOMING.length).split("/");
  return segs.length >= 2 && segs.slice(0, -1).includes(dir);
}

/**
 * The HANDLED index (S472): basename → the set of blob ids filed as handled — every file under
 * `read/` or `resolved/` (any depth) on main, plus `resolved/` on the inbox branch (messaging
 * contract v10). A message is handled only when its OWN blob is in its name's set.
 */
export function handledIndex(mainTree: TreeEntry[], inboxTree: TreeEntry[] = []): Map<string, Set<string | undefined>> {
  const out = new Map<string, Set<string | undefined>>();
  const add = (e: TreeEntry) => {
    const n = basename(entryPath(e));
    if (!out.has(n)) out.set(n, new Set());
    out.get(n)!.add(entryBlob(e));
  };
  for (const e of mainTree) {
    const p = entryPath(e);
    if (HANDLED_DIRS.some((d) => p.startsWith(`${INCOMING}${d}/`))) add(e);
  }
  for (const e of inboxTree) if (entryPath(e).startsWith(`${INCOMING}resolved/`)) add(e);
  return out;
}

/**
 * Parse a leading YAML-ish frontmatter block (`---` … `---`) into flat `key: value` pairs.
 * Returns null when the text does not open with a frontmatter fence (or the fence never
 * closes) — a message with no frontmatter is reported as such, never as `needs: ""` silently.
 * Values are trimmed and one layer of matching surrounding quotes is removed. Keys lowercase.
 * First occurrence of a key wins (a later duplicate cannot re-key `needs:`).
 */
export function parseFrontmatter(text: string): Frontmatter | null {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  // S472: blank lines before the opening fence are tolerated (a real sender shape); anything
  // else before it still means "no frontmatter".
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;
  if (lines[start]?.trim() !== "---") return null;
  const fm: Frontmatter = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") return fm;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    let val = m[2].trim();
    if (val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))) {
      val = val.slice(1, -1);
    }
    if (!(key in fm)) fm[key] = val;
  }
  return null; // unclosed fence — not a frontmatter block
}

/**
 * The recipient named in a message FILE NAME — `<date>-from-<sender…>-to-<who>-<slug>.md`.
 * The FIRST `-to-` after `-from-` is the address. null when the name carries no `-to-`
 * (e.g. `…-from-flogence-S52-re-S447-…`): absence is not a misdelivery.
 */
export function addresseeFromName(name: string): string | null {
  const from = name.indexOf("-from-");
  if (from < 0) return null;
  const m = name.slice(from + "-from-".length).match(/-to-([A-Za-z0-9]+)(?:-|\.md$|$)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Normalize a frontmatter `to:` value into recipient tokens: `scrml@asus-vivobook` → `scrml`,
 * `scrml, flogence` → [`scrml`, `flogence`], `S470-scrml (bryan)` → keeps every word token.
 */
export function recipientsOf(to: string): string[] {
  return to
    .toLowerCase()
    .split(/[,;]+/)
    .map((s) => s.trim().split(/\s+/)[0] ?? "")
    .map((s) => s.replace(/@.*$/, ""))
    .filter(Boolean);
}

/** Does a recipient token name this desk? `scrml` exactly, a session-tagged `S470-scrml`, or one of SELF_PEOPLE. */
function namesSelf(token: string, self: string): boolean {
  return token === self || token.endsWith(`-${self}`) || SELF_PEOPLE.includes(token);
}

export function classifyMessage(path: string, text: string | undefined, self: string = SELF): Message {
  const name = basename(path);
  const fm = text === undefined ? null : parseFrontmatter(text);
  const get = (k: string) => (fm?.[k] ?? "").trim();
  const to = get("to");
  const reasons: string[] = [];
  if (to !== "") {
    const rs = recipientsOf(to);
    if (rs.length > 0 && !rs.some((r) => namesSelf(r, self))) reasons.push(`to: ${to}`);
  }
  const byName = addresseeFromName(name);
  if (byName !== null && !namesSelf(byName, self)) reasons.push(`file name says -to-${byName}-`);
  return {
    path,
    name,
    from: get("from"),
    to,
    needs: get("needs").toLowerCase(),
    subject: get("subject"),
    hasFrontmatter: fm !== null,
    misdelivered: reasons.length > 0,
    misdeliveredWhy: reasons.join("; "),
    note: "",
  };
}

/** Owed first; then by name, which leads with the ISO date. */
export function compareMessages(a: Message, b: Message): number {
  const oa = owesResponse(a) ? 0 : 1;
  const ob = owesResponse(b) ? 0 : 1;
  if (oa !== ob) return oa - ob;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The classifier. `inboxTree` / `mainTree` are `git ls-tree -r --name-only` listings of the
 * inbox branch and the integration branch; `texts` maps an inbox path to its content (a
 * missing entry parses as no-frontmatter — the CLI never leaves one missing; it fails instead).
 */
export function classify(
  inboxTree: TreeEntry[],
  mainTree: TreeEntry[],
  texts: Map<string, string>,
  self: string = SELF,
): Report {
  const index = handledIndex(mainTree, inboxTree);
  const isFiled = (e: TreeEntry) => index.get(basename(entryPath(e)))?.has(entryBlob(e)) ?? false;
  const top = inboxTree.filter((e) => isMessagePath(entryPath(e)));
  // read/ on the INBOX branch is not a handled location: a file there that main does not hold
  // (same name + blob) is a message pushed straight into read/ — counted, and labelled.
  const pushedIntoRead = inboxTree.filter((e) => isUnderIncomingDir(entryPath(e), "read") && !isFiled(e));
  const unhandled: Message[] = [];
  for (const e of top) {
    if (isFiled(e)) continue;
    const m = classifyMessage(entryPath(e), texts.get(entryPath(e)), self);
    if (index.has(m.name)) m.note = "a DIFFERENT file of this name was handled — a re-send under a reused name";
    unhandled.push(m);
  }
  for (const e of pushedIntoRead) {
    const m = classifyMessage(entryPath(e), texts.get(entryPath(e)), self);
    m.note = "filed under read/ on the inbox branch, which is not a handled location (main's read/ or resolved/ is)";
    unhandled.push(m);
  }
  unhandled.sort(compareMessages);
  const total = top.length + pushedIntoRead.length;
  return { total, handled: total - unhandled.length, unhandled };
}

/** `--check`'s predicate: any unhandled message owes a response. */
export function owes(report: Report): boolean {
  return report.unhandled.some(owesResponse);
}

// ── git (the only external dependency) ────────────────────────────────────────

function git(argv: string[], timeout = 60_000): string {
  const r = spawnSync("git", argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout });
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code;
    throw new Error(code === "ETIMEDOUT" ? `git ${argv[0]} timed out (${timeout / 1000}s)` : (r.error as Error).message);
  }
  if (r.status !== 0) {
    // The FIRST `fatal:`/`error:` line names the cause; git's trailing lines are boilerplate
    // ("Please make sure you have the correct access rights …").
    const lines = (r.stderr || "").trim().split("\n").map((s) => s.trim()).filter(Boolean);
    const err = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines[0] ?? "";
    const verb = argv.filter((a) => !a.startsWith("-")).slice(0, 1).join(" ");
    throw new Error(`git ${verb} failed (exit ${r.status})${err ? `: ${err}` : ""}`);
  }
  return r.stdout ?? "";
}

/** `git ls-tree -r <ref>` → { path, blob } (S472: HANDLED compares blob ids, not names). */
function lsTree(ref: string): { path: string; blob: string }[] {
  const out: { path: string; blob: string }[] = [];
  for (const line of git(["ls-tree", "-r", "--full-tree", ref, "--", INCOMING]).split("\n")) {
    if (line.trim() === "") continue;
    // `<mode> SP <type> SP <object> TAB <path>`; a path with odd characters is C-quoted by git.
    const m = line.match(/^\d+ (\w+) ([0-9a-f]+)\t(.*)$/);
    if (!m) throw new Error(`git ls-tree: unparsed line ${JSON.stringify(line)}`);
    if (m[1] !== "blob") continue;
    out.push({ path: m[3], blob: m[2] });
  }
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function argValue(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) return argv[i + 1];
    if (a.startsWith(name + "=")) return a.slice(name.length + 1);
  }
  return undefined;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]));
  const JSON_MODE = flags.has("--json");
  const CHECK_MODE = flags.has("--check");
  const NO_FETCH = flags.has("--no-fetch");
  const remote = argValue(argv, "--remote") ?? process.env.INBOX_DEBT_REMOTE ?? "origin";
  const inboxRef = `${remote}/${INBOX_BRANCH}`;
  const mainRef = `${remote}/${MAIN_BRANCH}`;

  let report: Report;
  try {
    // Fetch BOTH refs: the messages (inbox) and the discharge record (main). A stale main
    // only errs toward debt, but a fresh one is cheap and makes the HANDLED column current.
    if (!NO_FETCH) git(["fetch", "--quiet", remote, INBOX_BRANCH, MAIN_BRANCH], 90_000);
    const inboxTree = lsTree(inboxRef);
    const mainTree = lsTree(mainRef);
    // Classify once with no texts to learn which entries are unhandled, read only those, then
    // classify for real (frontmatter only changes labels and order, never handled-ness).
    const texts = new Map<string, string>();
    for (const m of classify(inboxTree, mainTree, texts).unhandled) {
      texts.set(m.path, git(["show", `${inboxRef}:${m.path}`]));
    }
    report = classify(inboxTree, mainTree, texts);
  } catch (e) {
    // §8 the indistinguishable failure: NEVER a count on this path. A probe that says
    // "0 unhandled" because git failed is the S470 boot ("inbox empty") all over again.
    const msg = (e as Error).message;
    if (JSON_MODE) {
      console.log(JSON.stringify({ remote, inboxRef, mainRef, total: null, error: msg, unhandled: null }, null, 2));
    } else {
      console.log(`inbox-debt: UNAVAILABLE (${msg}) — inbox NOT verified this session. Say so in the boot report.`);
    }
    process.exit(CHECK_MODE ? 2 : 0);
  }

  const misdelivered = report.unhandled.filter((m) => m.misdelivered);
  const owing = report.unhandled.filter(owesResponse);

  if (JSON_MODE) {
    console.log(JSON.stringify({
      remote, inboxRef, mainRef, total: report.total, handled: report.handled,
      unhandledCount: report.unhandled.length, owing: owing.length, misdelivered: misdelivered.length,
      unhandled: report.unhandled,
    }, null, 2));
    process.exit(CHECK_MODE && owes(report) ? 1 : 0);
  }

  const short = (s: string, n = 96) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
  const extra = [
    owing.length ? `${owing.length} owe a response` : "",
    misdelivered.length ? `${misdelivered.length} MISDELIVERED?` : "",
  ].filter(Boolean).join(" · ");
  console.log(`inbox-debt — ${report.unhandled.length} unhandled of ${report.total} on ${inboxRef}${extra ? ` · ${extra}` : ""}`);
  console.log(`  (HANDLED = the same file — name + blob — under ${INCOMING}{read,resolved}/ on ${mainRef}, or resolved/ on ${inboxRef}; ${report.handled} handled)`);

  if (report.unhandled.length > 0) {
    console.log("");
    for (const m of report.unhandled) {
      const needs = m.hasFrontmatter ? (m.needs || "—") : "NO FRONTMATTER";
      const tag = owesResponse(m) ? "⚠️ OWED" : "• open";
      console.log(`  ${tag}  ${m.name}${m.misdelivered ? "   ⚠️ MISDELIVERED?" : ""}`);
      console.log(`           needs: ${needs} · from: ${m.from || "—"}${m.to ? ` · to: ${m.to}` : ""}`);
      if (m.subject) console.log(`           subject: ${short(m.subject)}`);
      if (m.misdelivered) console.log(`           misdelivered? ${m.misdeliveredWhy} — route it, then move it to read/.`);
      if (m.note) console.log(`           note: ${m.note}`);
    }
    console.log("");
    console.log(`  A message is HANDLED once the same file (name + content) exists under ${INCOMING}read/ (or resolved/) on ${MAIN_BRANCH}.`);
    console.log(`  Answer / act, then move it there in a PR. Read with: git show ${inboxRef}:<path>`);
  } else if (report.total === 0) {
    console.log(`  ✅ no messages on ${inboxRef}`);
  } else {
    console.log(`  ✅ every message on ${inboxRef} is handled`);
  }

  if (CHECK_MODE && owes(report)) process.exit(1);
}
