/**
 * inbox-debt.test.js — the scripts/inbox-debt.ts classifier (S470, the bite proof).
 *
 * WHY THIS EXISTS. inbox-debt.ts asserts that every message pushed to scrml's `inbox` branch
 * is HANDLED (its file name exists under `handOffs/incoming/read/` or `resolved/` on `main`)
 * or is reported UNHANDLED. Its classifier is a PURE function over two tree listings and a
 * path→text map — this test pins it without git or a network. An unproven gate is a
 * hypothesis (pa-base §8).
 *
 * The fixtures are the real S470 shapes: the flogence `needs: action` message the S470 boot
 * missed, and the S454 bryan→peter messages whose frontmatter says `to: scrml` while the file
 * name says `-to-peter-`.
 */

import { describe, test, expect } from "bun:test";
import {
  classify, classifyMessage, parseFrontmatter, addresseeFromName, recipientsOf,
  isMessagePath, handledNames, owes,
} from "../../../scripts/inbox-debt.ts";

const IN = "handOffs/incoming/";
const FLOGENCE = "2026-10-24-from-flogence-S59-to-scrml-type-027-on-error-type-arm.md";
const PETER = "2026-10-05-from-S454-bryan-to-peter-merge-on-green-review.md";
const FYI = "2026-10-24-from-flogence-S59-to-scrml-re-type-027-fixed.md";
const OLD = "2026-10-01-from-S447-bryan-to-peter-stamp-all.md";

const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nbody text\n`;

describe("inbox-debt — what counts as a message", () => {
  test("files under read/ or resolved/ (any depth) are not messages; placeholders are not", () => {
    expect(isMessagePath(`${IN}${FLOGENCE}`)).toBe(true);
    expect(isMessagePath(`${IN}read/${FLOGENCE}`)).toBe(false);
    expect(isMessagePath(`${IN}resolved/${FLOGENCE}`)).toBe(false);
    expect(isMessagePath(`${IN}sub/read/${FLOGENCE}`)).toBe(false);
    expect(isMessagePath(`${IN}.gitkeep`)).toBe(false);
    expect(isMessagePath(`handOffs/outgoing/${FLOGENCE}`)).toBe(false);
    // a file NAMED like the dir is still a message
    expect(isMessagePath(`${IN}read.md`)).toBe(true);
  });

  test("handledNames reads only read/ and resolved/ under incoming, by basename", () => {
    const h = handledNames([
      `${IN}read/${OLD}`,
      `${IN}resolved/2026/${FYI}`,
      `${IN}${FLOGENCE}`,                  // sitting in incoming on main is NOT handled
      `handOffs/read/${PETER}`,            // a read/ outside incoming is NOT handled
    ]);
    expect([...h].sort()).toEqual([FYI, OLD].sort());
  });
});

describe("inbox-debt — handled / unhandled classification", () => {
  const inboxTree = [`${IN}${OLD}`, `${IN}${FLOGENCE}`, `${IN}${PETER}`, `${IN}${FYI}`, `${IN}read/${OLD}`];
  const texts = new Map([
    [`${IN}${FLOGENCE}`, fm({ from: "flogence@theRog", to: "scrml", subject: '"E-TYPE-027 now fires"', needs: "action" })],
    [`${IN}${PETER}`, fm({ from: "scrml@asus-vivobook", to: "scrml", subject: '"(for Peter) #1297"', needs: "action" })],
    [`${IN}${FYI}`, fm({ from: "flogence@theRog", to: "scrml", subject: "re: fixed", needs: "fyi" })],
  ]);

  test("a basename under main's read/ is HANDLED; everything else is UNHANDLED; population excludes read/", () => {
    const r = classify(inboxTree, [`${IN}read/${OLD}`], texts);
    expect(r.total).toBe(4);
    expect(r.handled).toBe(1);
    expect(r.unhandled.map((m) => m.name).sort()).toEqual([FLOGENCE, FYI, PETER].sort());
  });

  test("main's resolved/ discharges too", () => {
    const r = classify(inboxTree, [`${IN}read/${OLD}`, `${IN}resolved/${FYI}`], texts);
    expect(r.unhandled.map((m) => m.name)).not.toContain(FYI);
    expect(r.handled).toBe(2);
  });

  test("the inbox branch's OWN read/ does not discharge — only main's tree does", () => {
    const r = classify(inboxTree, [], texts);
    expect(r.unhandled.map((m) => m.name)).toContain(OLD);
    expect(r.handled).toBe(0);
  });

  test("needs: action / reply sort first, then by name", () => {
    const r = classify(inboxTree, [`${IN}read/${OLD}`], texts);
    expect(r.unhandled.map((m) => m.name)).toEqual([PETER, FLOGENCE, FYI]);
  });

  test("owes() — true iff an unhandled message needs action or reply", () => {
    expect(owes(classify(inboxTree, [`${IN}read/${OLD}`], texts))).toBe(true);
    const fyiOnly = classify([`${IN}${FYI}`], [], texts);
    expect(owes(fyiOnly)).toBe(false);
    const reply = classify([`${IN}x-from-a-to-scrml-y.md`], [], new Map([[`${IN}x-from-a-to-scrml-y.md`, fm({ needs: "Reply" })]]));
    expect(owes(reply)).toBe(true);
    expect(owes(classify([`${IN}${FLOGENCE}`], [`${IN}read/${FLOGENCE}`], texts))).toBe(false);
  });

  test("an empty inbox is 0 of 0, not an error", () => {
    const r = classify([], [`${IN}read/${OLD}`], new Map());
    expect(r).toEqual({ total: 0, handled: 0, unhandled: [] });
  });
});

describe("inbox-debt — frontmatter parse", () => {
  test("reads flat key: value pairs, strips one layer of quotes, lowercases keys", () => {
    const f = parseFrontmatter('---\nFrom: flogence@theRog\nsubject: "E-TYPE-027: 55 errors"\nneeds: action\nre: \'x\'\n---\nbody\nneeds: fyi\n');
    expect(f).toEqual({ from: "flogence@theRog", subject: "E-TYPE-027: 55 errors", needs: "action", re: "x" });
  });

  test("no opening fence, or an unclosed fence → null (reported, never silently empty)", () => {
    expect(parseFrontmatter("# just a note\nneeds: action\n")).toBe(null);
    expect(parseFrontmatter("---\nneeds: action\nno close")).toBe(null);
    expect(classifyMessage(`${IN}${FLOGENCE}`, "plain").hasFrontmatter).toBe(false);
    expect(classifyMessage(`${IN}${FLOGENCE}`, undefined).hasFrontmatter).toBe(false);
  });

  test("CRLF and a BOM parse; first duplicate key wins", () => {
    expect(parseFrontmatter("﻿---\r\nneeds: reply\r\nneeds: fyi\r\n---\r\n")).toEqual({ needs: "reply" });
  });
});

describe("inbox-debt — MISDELIVERED?", () => {
  test("the file name's -to-<who>- segment flags even when frontmatter says to: scrml (the S454 shape)", () => {
    const m = classifyMessage(`${IN}${PETER}`, fm({ from: "scrml@asus-vivobook", to: "scrml", needs: "action" }));
    expect(m.misdelivered).toBe(true);
    expect(m.misdeliveredWhy).toContain("-to-peter-");
  });

  test("frontmatter to: someone else flags", () => {
    const m = classifyMessage(`${IN}2026-10-30-from-x-re-y.md`, fm({ to: "peter", needs: "fyi" }));
    expect(m.misdelivered).toBe(true);
    expect(m.misdeliveredWhy).toContain("to: peter");
  });

  test("to: scrml@host, a list including scrml, a session-tagged scrml, and no address at all are NOT flagged", () => {
    for (const to of ["scrml", "scrml@asus-vivobook", "flogence, scrml", "S470-scrml"]) {
      expect(classifyMessage(`${IN}${FLOGENCE}`, fm({ to })).misdelivered).toBe(false);
    }
    expect(classifyMessage(`${IN}2026-10-01-from-flogence-S52-re-S447-db-paths.md`, fm({ needs: "fyi" })).misdelivered).toBe(false);
  });

  test("addresseeFromName takes the FIRST -to- after -from-", () => {
    expect(addresseeFromName(FLOGENCE)).toBe("scrml");
    expect(addresseeFromName(PETER)).toBe("peter");
    expect(addresseeFromName("2026-10-01-from-flogence-S52-re-S447-db-paths-changed-verified.md")).toBe(null);
    expect(addresseeFromName("2026-10-01-from-a-to-scrml-how-to-fix.md")).toBe("scrml");
    expect(addresseeFromName("no-sender-to-peter.md")).toBe(null);
  });

  test("recipientsOf normalizes host suffixes and lists", () => {
    expect(recipientsOf("scrml@asus-vivobook")).toEqual(["scrml"]);
    expect(recipientsOf("Peter, scrml; flogence@theRog")).toEqual(["peter", "scrml", "flogence"]);
  });

  test("a misdelivered message is still UNHANDLED and still owes (a label, not an exemption)", () => {
    const p = `${IN}${PETER}`;
    const r = classify([p], [], new Map([[p, fm({ to: "scrml", needs: "action" })]]));
    expect(r.unhandled).toHaveLength(1);
    expect(owes(r)).toBe(true);
  });
});
