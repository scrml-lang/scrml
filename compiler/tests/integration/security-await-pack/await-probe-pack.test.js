// security-await-pack — the wrong-password probe corpus as a permanent gate (S466, dpa-023 phase 1a).
//
// 904 shapes from ten adversarial review rounds (plus the r8 review's x1, fix round 9's r9, the r9 review's y1–y3, the r10 review's z1–z4 and the S468 literal-arm families la1–la5) of the §13.2 server-await fix
// (g-imported-async-server-fn-not-awaited-s465). Each shape is compiled, its server bundle loaded,
// and its `f` route called with a wrong and a right password. The floor: a wrong password is never
// answered WELCOME. See pack.js for the classes and README.md for the why.
//
// RED when: a shape not in KNOWN_FAIL accepts a wrong password; a KNOWN_FAIL shape stops accepting
// it (remove the entry); a shape not in UNJUDGED loses its server route; the shape count drifts;
// the POSITIVE CONTROL fails (below).
//
// POSITIVE CONTROL (S472, g-await-pack-no-positive-control-s472). The floor alone ("never FAIL")
// accepts PASS-500 / PASS-REFUSED for every shape, so a BLIND instrument was green: with every route
// answering 403 — a CSRF mismatch, or happy-dom's GlobalRegistrator leaked into the same bun process
// (its Request drops the Cookie header) — the pack ran 907 pass / 0 fail with the await hole LIVE.
// Two checks make blindness red:
//   1. SENTINELS — pinned shapes on the imported-async path the gap is about, which must classify
//      exactly PASS (wrong → 200 "REJECTED", right → 200 "WELCOME"). They run FIRST, so a blind
//      instrument fails in seconds, before the corpus.
//   2. A CLASS FLOOR over the whole corpus — at least PASS_FLOOR shapes PASS, at most PASS_500_CEILING
//      are PASS-500. Measured on main c8070b56a: PASS 317, PASS-500 18 (of 904). Blinded: PASS 0.
//      A legitimate shift (a ruling that refuses a family) may move these: re-measure with
//      classify.js and change the constants in the same PR, saying why.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPassword } from "../../../runtime/stdlib/auth.js";
import {
  loadFamilies, makeTemplateDb, runShape, PINNED_HASH, RIGHT_PASSWORD, WRONG_PASSWORD,
} from "./pack.js";
import { KNOWN_FAIL, UNJUDGED } from "./known-fail.js";

const EXPECTED_SHAPE_COUNT = 904;
const SENTINELS = ["s1/direct", "s1/alias", "s1/reexport", "n1/reexportAlias", "y1/reexport3"];
const PASS_FLOOR = 250;
const PASS_500_CEILING = 60;
const seen = new Map(); // id -> cls, filled by the per-shape tests, read by the class floor
const families = await loadFamilies();
const ids = families.flatMap(({ family, shapes }) => Object.keys(shapes).map((n) => `${family}/${n}`));

let root;
let templateDb;
let seq = 0;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "scrml-await-pack-"));
  templateDb = makeTemplateDb(root);
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("security-await-pack: the instrument", () => {
  test(`the corpus holds ${EXPECTED_SHAPE_COUNT} shapes with unique ids`, () => {
    expect(ids.length).toBe(EXPECTED_SHAPE_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every KNOWN_FAIL / UNJUDGED entry names a shape in the corpus", () => {
    const known = new Set(ids);
    expect(Object.keys(KNOWN_FAIL).filter((id) => !known.has(id))).toEqual([]);
    expect(Object.keys(UNJUDGED).filter((id) => !known.has(id))).toEqual([]);
  });

  test("the pinned hash is a real argon2id hash scrml:auth verifies", async () => {
    expect(PINNED_HASH.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(RIGHT_PASSWORD, PINNED_HASH)).toBe(true);
    expect(await verifyPassword(WRONG_PASSWORD, PINNED_HASH)).toBe(false);
  });

  test("POSITIVE CONTROL: every sentinel shape classifies PASS (the instrument can see a WELCOME)", async () => {
    const byId = new Map(families.flatMap(({ family, shapes, defaultLib }) =>
      Object.entries(shapes).map(([n, s]) => [`${family}/${n}`, { s, defaultLib }])));
    const got = [];
    for (const id of SENTINELS) {
      expect(byId.has(id) ? "ok" : `SENTINEL NOT IN CORPUS — ${id}`).toBe("ok");
      const { s, defaultLib } = byId.get(id);
      const r = await runShape(s, defaultLib, join(root, `sentinel-${seq++}`), templateDb);
      got.push(`${id}: ${r.cls} — ${r.detail}`);
    }
    // A blind instrument (every route 403/500, or every compile refused) shows here as PASS-500 /
    // PASS-REFUSED, with the response in the detail.
    expect(got.filter((v) => !/: PASS — wrong=200:"REJECTED" right=200:"WELCOME/.test(v))).toEqual([]);
  }, 120_000);
});

for (const { family, shapes, defaultLib } of families) {
  describe(`security-await-pack: ${family}`, () => {
    for (const [name, s] of Object.entries(shapes)) {
      const id = `${family}/${name}`;
      test(id, async () => {
        const r = await runShape(s, defaultLib, join(root, String(seq++)), templateDb);
        seen.set(id, r.cls);
        const verdict = `${id}: ${r.cls} — ${r.detail}`;
        if (KNOWN_FAIL[id]) {
          // Still failing as recorded. If this goes red the shape is FIXED: delete its entry.
          expect(verdict).toBe(`${id}: FAIL — ${r.detail}`);
        } else if (UNJUDGED[id]) {
          expect(verdict).toBe(`${id}: UNJUDGED — ${r.detail}`);
        } else {
          // THE FLOOR: a wrong password is never answered WELCOME.
          expect(r.cls === "FAIL" ? `WRONG PASSWORD ACCEPTED — ${verdict}` : "ok").toBe("ok");
          // An instrument hole must be named, not absorbed.
          expect(r.cls === "UNJUDGED" ? `NEW UNJUDGED SHAPE — ${verdict}` : "ok").toBe("ok");
        }
      }, 60_000);
    }
  });
}

describe("security-await-pack: positive control — class floor", () => {
  test(`at least ${PASS_FLOOR} shapes PASS and at most ${PASS_500_CEILING} are PASS-500 over the full corpus`, () => {
    // Needs the whole corpus in this process (a -t filter that skips shapes cannot pass it).
    expect(seen.size).toBe(EXPECTED_SHAPE_COUNT);
    const n = (c) => [...seen.values()].filter((v) => v === c).length;
    expect({ PASS: n("PASS") >= PASS_FLOOR ? "ok" : n("PASS"), "PASS-500": n("PASS-500") <= PASS_500_CEILING ? "ok" : n("PASS-500") })
      .toEqual({ PASS: "ok", "PASS-500": "ok" });
  });
});
