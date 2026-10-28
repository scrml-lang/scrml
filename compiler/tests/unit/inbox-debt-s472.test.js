/**
 * inbox-debt-s472.test.js — scripts/inbox-debt.ts: what OWES, and what is HANDLED
 * (g-inbox-debt-needs-vocab-and-basename-handled-s472).
 *
 * WHY THIS EXISTS. The S470 classifier owed only on the exact set `needs: action | reply`, while the
 * real inbox corpus uses `ruling`, `triage`, `fix`, `triage + fix`, `ratify`, `**PRIORITY RULING
 * REQUESTED …**` — each printed "• open", left out of the owed count, and `--check` exited 0. And it
 * treated a message as HANDLED when ANY file of the same BASENAME sat under main's read/ — so a
 * re-send under a reused name vanished — and never counted a file pushed straight into read/ on the
 * inbox branch. Only the PURE classifier is exercised (no git, no network). Every assertion here uses
 * the S470 API (`classify`, `owes`, `parseFrontmatter`), so each one is red on the pre-S472 code.
 */

import { describe, test, expect } from "bun:test";
import { classify, owes, parseFrontmatter } from "../../../scripts/inbox-debt.ts";

const IN = "handOffs/incoming/";
const NAME = "2026-10-27-from-flogence-S60-to-scrml-x.md";
const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nbody\n`;
const one = (needs, text) => {
  const p = `${IN}${NAME}`;
  return classify([p], [], new Map([[p, text ?? fm({ from: "flogence", to: "scrml", needs })]]));
};

describe("inbox-debt — any needs: value except an explicit not-owing one OWES (S472)", () => {
  // Every value here is from the real corpus (`git grep -h -i '^needs:' origin/main -- handOffs/incoming/`).
  for (const needs of [
    "ruling", "triage", "fix", "triage + fix", "ratify", "review + ratify (the joint capture-format schema)",
    "routing (your lane)", "**PRIORITY RULING REQUESTED (operator-directed, bryan 2026-07-22)**",
    "action (urgent)", "Action", "reply", "fyi + one lane call", "fyi / your-call", "a scheduling decision",
  ]) {
    test(`needs: ${needs} → owed`, () => {
      expect(owes(one(needs))).toBe(true);
    });
  }
  for (const needs of ["fyi", "FYI", "none", "info", "awareness", "fyi (no action)", "fyi — no ask, no build request", "nothing from you — heads-up"]) {
    test(`needs: ${needs} → not owed`, () => {
      expect(owes(one(needs))).toBe(false);
    });
  }
  test("no needs: field, and no frontmatter at all, owe (fail-closed: nobody said it doesn't)", () => {
    expect(owes(one(null, fm({ from: "flogence", to: "scrml" })))).toBe(true);
    expect(owes(one(null, "just a note, no frontmatter\n"))).toBe(true);
  });
  test("owed messages sort first, whatever their needs: word", () => {
    const a = `${IN}2026-10-01-from-a-to-scrml-early.md`;
    const b = `${IN}2026-10-09-from-b-to-scrml-late.md`;
    const r = classify([a, b], [], new Map([[a, fm({ needs: "fyi" })], [b, fm({ needs: "ruling" })]]));
    expect(r.unhandled.map((m) => m.path)).toEqual([b, a]);
  });
});

describe("inbox-debt — frontmatter after leading blank lines still parses (S472)", () => {
  test("a blank line before the opening --- is tolerated", () => {
    expect(parseFrontmatter("\n\n---\nneeds: action\n---\nbody\n")).toEqual({ needs: "action" });
    expect(owes(one(null, "\n---\nneeds: fyi\n---\n"))).toBe(false);
  });
  test("non-blank text before the fence is still NO FRONTMATTER", () => {
    expect(parseFrontmatter("hello\n---\nneeds: fyi\n---\n")).toBe(null);
  });
});

describe("inbox-debt — HANDLED is the same FILE (name + blob), not the same name (S472)", () => {
  const msg = { path: `${IN}${NAME}`, blob: "b2" };
  const texts = new Map([[`${IN}${NAME}`, fm({ needs: "action" })]]);

  test("an identical copy under main's read/ discharges", () => {
    const r = classify([msg], [{ path: `${IN}read/${NAME}`, blob: "b2" }], texts);
    expect(r).toMatchObject({ total: 1, handled: 1, unhandled: [] });
  });

  test("a re-send under a reused name (different blob) is NOT handled — it is listed and owes", () => {
    const r = classify([msg], [{ path: `${IN}read/${NAME}`, blob: "b1-the-first-message" }], texts);
    expect(r.handled).toBe(0);
    expect(r.unhandled.map((m) => m.path)).toEqual([`${IN}${NAME}`]);
    expect(owes(r)).toBe(true);
  });

  test("resolved/ on the INBOX branch discharges (messaging contract v10: `msg resolve` files there)", () => {
    const r = classify([msg, { path: `${IN}resolved/${NAME}`, blob: "b2" }], [], texts);
    expect(r.unhandled).toEqual([]);
  });

  test("a file pushed straight into read/ on the INBOX branch is counted — read/ there is not a handled location", () => {
    const p = `${IN}read/${NAME}`;
    const r = classify([{ path: p, blob: "b9" }], [], new Map([[p, fm({ needs: "action" })]]));
    expect(r.total).toBe(1);
    expect(r.unhandled.map((m) => m.path)).toEqual([p]);
    expect(owes(r)).toBe(true);
  });

  test("an inbox read/ file that main holds identically is history, not a message", () => {
    const e = { path: `${IN}read/${NAME}`, blob: "b9" };
    const r = classify([e], [e], new Map());
    expect(r).toEqual({ total: 0, handled: 0, unhandled: [] });
  });
});
