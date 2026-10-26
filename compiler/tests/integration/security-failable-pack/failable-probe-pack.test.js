// security-failable-pack — the §19.4.3 failable wrong-password probe corpus as a permanent gate
// (S468 fix round 1; a sibling of ../security-await-pack).
//
// 5195 shapes (S470 s470-promise-all-batch-elements r21 s24 / f27 / l19 / t19 +145 — a call under an operator in a Promise.all batch element; S470 s470-nested-handler-await +1371 (r18-shapes.js s21 / f24 / l16 / t16 — a waiting call inside a `!{}` handler arm; fix rounds 1–3 +530 +44 +60); S470 s470-host-fetch-followups r20 s23 / f26 / l18 / t18 +26; S470 s470-unit-variant-tag-read r16 +199; S470 s470-bang-catch-try-body +360, r10-shapes.js n29 / s13 / f16 / l8 / t8 — the `!{ … } catch …` statement form, refused; S470 s470-render-residue-host-promises r19 f25 +73 — G0 the first round, F1–F5 fix round 1; S470 s470-async-colouring-scope +415, r9-shapes.js s12 / f15 / l7 / t7 — a local binding shadowing an async name; S470 f8 +3; s470-action-body-await f13 +30, f10 +37, f11 +2, f12 +2, f14 +2; S470 + r8-shapes.js s11 / f9 / l6 / t6, the whole-error binder allow-list escapes; S470 + r11-shapes.js s14 / f17 / l9 / t9, typed payload binders; S470 + r12-shapes.js s15 / f18 / l10 / t10, enum facts from the type; S470 + r13-shapes.js s16 / f19 / l11 / t11, imported alias chains, E | not and recursive returns; S470 + r14-shapes.js f20 / l12 / t12, cycles inferred in any order, imported struct fields, the alias-chain limit; S470 + r15-shapes.js s18 / f21 / l13 / t13, dependency-local inference and deep expressions): the S468 fix-round-1 review of 7ecae57eb (n1–n8 client, s1–s2 server) plus the dev's
// n9 (the F1 class through a name) and n10 (by-binding probes), and S469's n11 (a failable `match`
// in every event-handler value form × container) n12 (the `!` function imported) n13 (a handler through a `const` alias) n14 (a failable call inside a template-literal interpolation) n15 (an object shorthand / an exported `const` alias) n16 (a labeled block in a function-expression body; a quoted attribute `${…}`) n17 (a `}` in a comment / regex of a quoted-attribute interpolation; a line terminator injected through the codegen comment) n18 (a failable call in an engine / `<match>` body kept as raw text) n19 (an `if=` guard on an `<each>` nested in another `<each>`'s row or in lifted markup) n20 (an `if=` guard on a `<match>` inside an `<each>` row or `<empty>` body) n21 (a markup `if=` guard on a nested element or a multi-root item root in an `<each>` row, revoked after the row is built) n22 (a stale effect of a removed row / torn-down arm granting after the revoke; a top-level arm whose owner was taken from the writing row) and n23 (a markup `if=` guard in LIFTED markup — a `for … lift` row, an `if … lift` / bare `lift`, a markup value, a lifted `<each>` root — revoked after mount; s469-lift-gate-staleness +28: a cell read two calls deep or through a file-level closure, a run-once group's indirect gate beside a body local, the value-indexed row side written in place, row / group locals in a row, an open gate in a function body; round 2 +11: a local or parameter computed by a call that reads the cell; an inner-loop local in a region of a keyed row; round 3 +4: the same among a fragment row roots, revoked + reordered), and n26 (SIDE `nav`: a soft navigation into another build's page whose button reuses a privileged handler id, or an ungated chunk served under a matching page), and n25 (an `<engine>` used as a gate inside an `<each>` row — refused, §51.0.K), and n24 (S469 s469-impl1-arm-commas — an expression-position `match` arm list the raw-arm reader mis-split: a regex literal in an arm body, a literal alternation, a negative later alternate, a `|`-led arm, a bare handled-call statement arm, an engine `derived=match` read from text) and s3 (S469 s469-impl1-arm-commas r7 — a server-function match lowered from text: a reassignment / a call argument), and n28 (S469 s469-keyed-row-if-gate — a control-flow `if` statement gating content in a keyed `for … lift` row, among the row's roots or inside a row element, revoked by a cell / a same-key replace / an in-place write, with a reorder or a remove + re-add in a LATER handler run; a `match` statement in the row; and a closed gate in a nested-loop region of a keyed row, round 2), and n27 (S469 s469-structural-else-guard — the privileged branch is an `else` / `else-if=` on `<engine>` / `<match>` / `<each>` / `<empty>`, or an `if=` on a host that does not gate: `<empty>`, `<errorBoundary>`, `<render>`, a compound-state wrapper; round 2: the opener spellings the round-1 word scan misread — `else=""`, `else=${true}`, `title="x"else`, a bare `if` word, `${ // it's }` — and a gate on a `<slot>`, an engine state-child, a `<match>` arm, a bare `<engine if>`; round 3: an unquoted operator value swallowing the gate written after it, and case-variant gate names; round 4: a DROPPED value (`tabindex=-1`, `x=+1`, `x=.5`) turning the gate into its value, the 64-segment slot cap, and the order-independent `<each key=… in=…>` spellings; round 5: a stray `=` after an engine sigil value, an orphaned `=` on markup in a row / a `<match>` arm, a reserved-word value `x= else`). Each shape is compiled and run with a
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

// S470 s470-render-position-server-call-refused: +3 (f8). S470 s470-whole-error-binder-escapes: +269 (r8-shapes.js — s11 / f9 / l6 / t6, 40 shapes per side; fix round 1 +32; fix round 2 +77 — 19 per side plus the fullstack-only M1c; fix round 3 +29 — 7 per side plus the fullstack-only EF1; fix round 4 +3 — fullstack F1a–F1c). S470 s470-action-body-await: +73 (f13 +30, f10 +37, f11 +2, f12 +2, f14 +2). S470 s470-async-colouring-scope: +415 (r9-shapes.js — s12 42, f15 221, l7 76, t7 76). S470 s470-typed-payload-binders: +121 (r11-shapes.js — s14 / f17 / l9 / t9: a member read off an enum value, a payload binder of a declared enum field; the r7 VALID controls re-stated; fullstack F4). S470 s470-typed-payload-binders fix round 1: +91 (r12-shapes.js — s15 / f18 / l10 / t10: alias positions, unit-variant / ternary / local returns, imported functions and consts, ternary / lin / destructuring / tape methods and callbacks / value match / closure results, engine-only .advance, .V.history outside the restore form). Fix round 2: +99 (r13-shapes.js — s16 / f19 / l11 / t11: an imported alias of an imported alias, E | not returns, recursive and cyclic returns; the review's fp2 programs as VALID controls). Fix round 3: +16 (r14-shapes.js — f20 / l12 / t12: a cycle of functions whose verdict depended on inference order, a struct field of an imported enum / alias / alias of an alias, a chain of 80 imported aliases refused fail closed), -1 (r11 server W10: a pre-existing server-bundle defect once the control calls its f). S470 s470-render-residue-host-promises: +73 (r19-shapes.js, f25: 22 G0 + 51 fix round 1). S470 s470-bang-catch-try-body: +360 (r10-shapes.js — n29 89 / s13 60 / f16 69 / l8 74 / t8 68; round 4 +20: a missing operator before a next-line `!`; the `!{ … } catch …` statement form, refused: E-TRY-NOT-IN-SCRML; round 3 +28: a gapped `! { … }`, a handler attached to no expression, the form in a for-of head). S470 s470-host-fetch-followups: +26 (r20-shapes.js — s23 / f26 / l18 / t18). S470 s470-promise-all-batch-elements: +145 (r21-shapes.js — f27 112: 26 BAD + 11 controls + F5 7 + F2 2 + F4 2 + F1 8, x msg / gate; s24 / l19 / t19 11 controls each).
// S470 s470-unit-variant-tag-read: +199 (r16-shapes.js — s19 / l14 / t14 42 each, f22 73: `.variant` read off a unit variant value). S470 s470-nested-handler-await: +1371 (r18-shapes.js — s21 237, f24 660, l16 237, t16 237; fix rounds 1–3 +530 +44 +60).
const EXPECTED_SHAPE_COUNT = 5195;
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
