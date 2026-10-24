// security-failable-pack — the §19.4.3 failable wrong-password probe corpus as a permanent gate
// (S468 fix round 1; a sibling of ../security-await-pack).
//
// 935 shapes: the S468 fix-round-1 review of 7ecae57eb (n1–n8 client, s1–s2 server) plus the dev's
// n9 (the F1 class through a name) and n10 (by-binding probes), and S469's n11 (a failable `match`
// in every event-handler value form × container) n12 (the `!` function imported) n13 (a handler through a `const` alias) n14 (a failable call inside a template-literal interpolation) n15 (an object shorthand / an exported `const` alias) n16 (a labeled block in a function-expression body; a quoted attribute `${…}`) n17 (a `}` in a comment / regex of a quoted-attribute interpolation; a line terminator injected through the codegen comment) n18 (a failable call in an engine / `<match>` body kept as raw text) n19 (an `if=` guard on an `<each>` nested in another `<each>`'s row or in lifted markup) n20 (an `if=` guard on a `<match>` inside an `<each>` row or `<empty>` body) n21 (a markup `if=` guard on a nested element or a multi-root item root in an `<each>` row, revoked after the row is built) n22 (a stale effect of a removed row / torn-down arm granting after the revoke; a top-level arm whose owner was taken from the writing row) and n23 (a markup `if=` guard in LIFTED markup — a `for … lift` row, an `if … lift` / bare `lift`, a markup value, a lifted `<each>` root — revoked after mount), and n26 (SIDE `nav`: a soft navigation into another build's page whose button reuses a privileged handler id, or an ungated chunk served under a matching page), and n25 (an `<engine>` used as a gate inside an `<each>` row — refused, §51.0.K), and n24 (S469 s469-impl1-arm-commas — an expression-position `match` arm list the raw-arm reader mis-split: a regex literal in an arm body, a literal alternation, a negative later alternate, a `|`-led arm, a bare handled-call statement arm, an engine `derived=match` read from text) and s3 (S469 s469-impl1-arm-commas r7 — a server-function match lowered from text: a reassignment / a call argument), and s4 + f1 (S469 s469-server-return-match-await — a `match` whose subject or arm value is an async call, at every expression position, server side and — f1, SIDE `fullstack` — client side against the in-process server; and the payload binders of its arms), and s5 + f2 (round 2 — the payload shape across files, a member call in a match arm read as a server call, a nested match as an arm value; s4 / f1 / s5 / f2 pin each shape's class, pinned-class.js), and s6 / f3 / l1 / t1 (round 3 — one shape list, r3-shapes.js, on the server, fullstack, LIBRARY and TOOL sides: the payload shape and its binders in every emission mode, the emitted module run directly). Each shape is compiled and run with a
// wrong and a right password. The floor: a wrong password never logs in. See pack.js for the classes
// and README.md for the why.
//
// RED when: a shape not in KNOWN_FAIL / BY_DESIGN_LOGS_IN logs in on a wrong password; a KNOWN_FAIL
// shape stops doing so (remove the entry); a shape not in UNJUDGED cannot be judged, or an UNJUDGED
// one starts being judged; the shape count drifts.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFamilies, runShape } from "./pack.js";
import { KNOWN_FAIL, UNJUDGED, BY_DESIGN_LOGS_IN } from "./known-fail.js";
import { PINNED_CLASS } from "./pinned-class.js";

const EXPECTED_SHAPE_COUNT = 935;
const families = await loadFamilies();
const ids = families.flatMap(({ family, shapes }) => Object.keys(shapes).map((n) => `${family}/${n}`));

let root;
let seq = 0;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "scrml-failable-pack-"));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("security-failable-pack: the instrument", () => {
  test(`the corpus holds ${EXPECTED_SHAPE_COUNT} shapes with unique ids`, () => {
    expect(ids.length).toBe(EXPECTED_SHAPE_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every KNOWN_FAIL / UNJUDGED / BY_DESIGN_LOGS_IN entry names a shape in the corpus", () => {
    const known = new Set(ids);
    for (const list of [KNOWN_FAIL, UNJUDGED, BY_DESIGN_LOGS_IN, PINNED_CLASS]) {
      expect(Object.keys(list).filter((id) => !known.has(id))).toEqual([]);
    }
  });

  test("every family declares its side", () => {
    expect(families.filter((f) => !["client", "server", "nav", "fullstack", "library", "tool"].includes(f.side)).map((f) => f.family)).toEqual([]);
  });
});

for (const { family, side, shapes } of families) {
  describe(`security-failable-pack: ${family}`, () => {
    for (const [name, s] of Object.entries(shapes)) {
      const id = `${family}/${name}`;
      test(id, async () => {
        const r = await runShape(s, side, join(root, String(seq++)));
        const verdict = `${id}: ${r.cls} — ${r.detail}`;
        // S469 r2 — a pinned shape keeps its class (a PASS that degrades to PASS-DENY / PASS-REFUSED
        // is a regression the floor alone does not see).
        if (PINNED_CLASS[id]) expect(verdict).toBe(`${id}: ${PINNED_CLASS[id]} — ${r.detail}`);
        if (KNOWN_FAIL[id]) {
          // Still failing as recorded. If this goes red the shape is FIXED: delete its entry.
          expect(verdict).toBe(`${id}: FAIL — ${r.detail}`);
        } else if (UNJUDGED[id]) {
          expect(verdict).toBe(`${id}: UNJUDGED — ${r.detail}`);
        } else if (BY_DESIGN_LOGS_IN[id]) {
          // Its own logic logs in on "wrong": any verdict is right; it must still be judged.
          expect(r.cls === "UNJUDGED" ? `NEW UNJUDGED SHAPE — ${verdict}` : "ok").toBe("ok");
        } else {
          // THE FLOOR: a wrong password never logs in.
          expect(r.cls === "FAIL" ? `WRONG PASSWORD ACCEPTED — ${verdict}` : "ok").toBe("ok");
          // An instrument hole must be named, not absorbed.
          expect(r.cls === "UNJUDGED" ? `NEW UNJUDGED SHAPE — ${verdict}` : "ok").toBe("ok");
        }
      }, 60_000);
    }
  });
}
