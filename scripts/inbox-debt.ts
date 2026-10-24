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
 *   HANDLED   the basename appears under `handOffs/incoming/read/` OR `.../resolved/` in
 *             `git ls-tree origin/main`. NEVER the working-tree filesystem: a dirty or
 *             stale checkout must not be able to fake a discharge (or hide a message).
 *   UNHANDLED everything else. Printed with basename · needs · from · subject, parsed from
 *             the message's own frontmatter (`git show origin/inbox:<path>`).
 *
 * MISDELIVERED? A message on scrml's inbox addressed to someone other than scrml is flagged,
 * not silently counted. The addressee is read from TWO places, because the witnessed case needs
 * both: the S454 bryan→peter messages carry `to: scrml` in their frontmatter and name the real
 * recipient only in the FILE NAME (`…-from-S454-bryan-to-peter-…`) and the subject
 * ("(for Peter) …"). A `to:`-only check reads those three as correctly delivered. So: the
 * frontmatter `to:` AND the file-name `-to-<who>-` segment must each be scrml (or absent).
 * A flagged message is still UNHANDLED and still counts — MISDELIVERED? is a label, not an
 * exemption; someone must route it and move it to `read/`.
 *
 * DESIGN CONSTRAINTS (pa-base §8 gate-design + §2 detection-is-a-ratio — the issue-debt.ts /
 * review-debt.ts shape, which this file mirrors):
 *   - DETECTION, NOT CONTROL. Exit 0 always in default mode. NEVER wire this into CI — a
 *     red-over-backlog gate is the §8 cry-wolf shape. It runs at BOOT (scripts/boot.ts
 *     delegates to it) and reports. `--check` is for the PA's own hand: exit 1 iff any
 *     UNHANDLED message has `needs: action` or `needs: reply` (misdelivered ones included —
 *     an action owed to the wrong desk is still an action nobody has taken).
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
 *   bun scripts/inbox-debt.ts --check          # exit 1 iff an unhandled action/reply; 2 if UNAVAILABLE
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
/** `needs:` values that owe a response — sorted first, and the only ones `--check` fails on. */
export const OWING = new Set(["action", "reply"]);

// ── the pure classifier (no git, no fs, no clock) ─────────────────────────────

export type Frontmatter = Record<string, string>;

export interface Message {
  path: string;            // full tree path on the inbox branch
  name: string;            // basename — the identity the HANDLED test compares
  from: string;
  to: string;
  needs: string;           // lowercased; "" when absent
  subject: string;
  hasFrontmatter: boolean;
  misdelivered: boolean;
  misdeliveredWhy: string; // "" unless misdelivered
}

export interface Report {
  total: number;           // messages on the inbox branch (read/ + resolved/ excluded)
  handled: number;
  unhandled: Message[];    // sorted: owing (action/reply) first, then by name
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
export function handledNames(mainTree: string[]): Set<string> {
  const out = new Set<string>();
  for (const p of mainTree) {
    if (!p.startsWith(INCOMING)) continue;
    const segs = p.slice(INCOMING.length).split("/");
    if (segs.length >= 2 && (HANDLED_DIRS as readonly string[]).includes(segs[0])) out.add(segs[segs.length - 1]);
  }
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
  if (lines[0]?.trim() !== "---") return null;
  const fm: Frontmatter = {};
  for (let i = 1; i < lines.length; i++) {
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

/** Does a recipient token name scrml? `scrml` exactly, or a session-tagged `S470-scrml`. */
function namesSelf(token: string, self: string): boolean {
  return token === self || token.endsWith(`-${self}`);
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
  if (byName !== null && byName !== self) reasons.push(`file name says -to-${byName}-`);
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
  };
}

/** Owing (`needs: action` / `needs: reply`) first; then by name, which leads with the ISO date. */
export function compareMessages(a: Message, b: Message): number {
  const oa = OWING.has(a.needs) ? 0 : 1;
  const ob = OWING.has(b.needs) ? 0 : 1;
  if (oa !== ob) return oa - ob;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The classifier. `inboxTree` / `mainTree` are `git ls-tree -r --name-only` listings of the
 * inbox branch and the integration branch; `texts` maps an inbox path to its content (a
 * missing entry parses as no-frontmatter — the CLI never leaves one missing; it fails instead).
 */
export function classify(
  inboxTree: string[],
  mainTree: string[],
  texts: Map<string, string>,
  self: string = SELF,
): Report {
  const handled = handledNames(mainTree);
  const messages = inboxTree.filter(isMessagePath);
  const unhandled = messages
    .filter((p) => !handled.has(basename(p)))
    .map((p) => classifyMessage(p, texts.get(p), self))
    .sort(compareMessages);
  return { total: messages.length, handled: messages.length - unhandled.length, unhandled };
}

/** `--check`'s predicate: any unhandled message owes a response. */
export function owes(report: Report): boolean {
  return report.unhandled.some((m) => OWING.has(m.needs));
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

function lsTree(ref: string): string[] {
  return git(["ls-tree", "-r", "--name-only", ref, "--", INCOMING]).split("\n").map((s) => s.trim()).filter(Boolean);
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
    const texts = new Map<string, string>();
    const handled = handledNames(mainTree);
    for (const p of inboxTree.filter(isMessagePath)) {
      if (handled.has(basename(p))) continue; // only unhandled messages are read
      texts.set(p, git(["show", `${inboxRef}:${p}`]));
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
  const owing = report.unhandled.filter((m) => OWING.has(m.needs));

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
    owing.length ? `${owing.length} owe action/reply` : "",
    misdelivered.length ? `${misdelivered.length} MISDELIVERED?` : "",
  ].filter(Boolean).join(" · ");
  console.log(`inbox-debt — ${report.unhandled.length} unhandled of ${report.total} on ${inboxRef}${extra ? ` · ${extra}` : ""}`);
  console.log(`  (HANDLED = file name under ${INCOMING}{read,resolved}/ on ${mainRef}; ${report.handled} handled)`);

  if (report.unhandled.length > 0) {
    console.log("");
    for (const m of report.unhandled) {
      const needs = m.hasFrontmatter ? (m.needs || "—") : "NO FRONTMATTER";
      const tag = OWING.has(m.needs) ? "⚠️ OWED" : "• open";
      console.log(`  ${tag}  ${m.name}${m.misdelivered ? "   ⚠️ MISDELIVERED?" : ""}`);
      console.log(`           needs: ${needs} · from: ${m.from || "—"}${m.to ? ` · to: ${m.to}` : ""}`);
      if (m.subject) console.log(`           subject: ${short(m.subject)}`);
      if (m.misdelivered) console.log(`           misdelivered? ${m.misdeliveredWhy} — route it, then move it to read/.`);
    }
    console.log("");
    console.log(`  A message is HANDLED once its file name exists under ${INCOMING}read/ (or resolved/) on ${MAIN_BRANCH}.`);
    console.log(`  Answer / act, then move it there in a PR. Read with: git show ${inboxRef}:<path>`);
  } else if (report.total === 0) {
    console.log(`  ✅ no messages on ${inboxRef}`);
  } else {
    console.log(`  ✅ every message on ${inboxRef} is handled`);
  }

  if (CHECK_MODE && owes(report)) process.exit(1);
}
