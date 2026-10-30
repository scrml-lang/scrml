// S473 — scripts/windows-ratchet.ts, the judge of the `windows` CI job (ruling: user-voice-scrml.md,
// "RULED — S473 Windows … CI ratchet guard", item 2). The job fails on a failure outside the baseline and
// on a baseline entry that no longer fails; one retry rescues a flake. These cases pin each verdict on
// fixture junit (Windows-shaped: `\` in file attributes) and on a report bun itself writes.

import { describe, test, expect } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseJunit, mergeReports, judge, retryFiles, render, validateBaseline, gapStatuses, entryId,
  summarize, renderHistory, FILE_DID_NOT_REPORT,
} from "../../../scripts/windows-ratchet.ts";

const FX = join(import.meta.dir, "fixtures/windows-ratchet");
const A = "compiler/tests/unit/a.test.js";
const B = "compiler/tests/unit/b.test.js";
const first = () => parseJunit(readFileSync(join(FX, "first.xml"), "utf8"));
const retry = () => parseJunit(readFileSync(join(FX, "retry.xml"), "utf8"));
const known = { file: A, test: "outer <x> > known & still failing", gap: "g-x", reason: "r" };
const staleE = { file: A, test: "outer <x> > was known, passes now", gap: "g-x", reason: "r" };
const suite = (report, rc = 1) => [{ name: "unit", path: "first.xml", rc, report }];

describe("parseJunit", () => {
  test("ids are POSIX file > describe chain > name; entities decoded; status per case", () => {
    const r = first();
    expect([...r.files].sort()).toEqual([A, B]);
    expect(r.tests.get(`${A} > outer <x> > known & still failing`)).toBe("fail");
    expect(r.tests.get(`${A} > outer <x> > ok`)).toBe("pass");
    expect(r.tests.get(`${A} > outer <x> > skipped one`)).toBe("skip");
    expect(r.tests.get(`${A} > new "regression"`)).toBe("fail");
    expect(r.tests.get(`${B} > fine`)).toBe("pass");
    expect(r.tests.size).toBe(7);
  });

  test("a duplicated id is fail if any occurrence failed (in one report and across merged reports)", () => {
    const x = `<testsuites><testsuite name="f.test.js" file="f.test.js"><testcase name="d" file="f.test.js"/><testcase name="d" file="f.test.js"><failure/></testcase></testsuite></testsuites>`;
    expect(parseJunit(x).tests.get("f.test.js > d")).toBe("fail");
    const ok = parseJunit(`<testsuites><testsuite name="f.test.js" file="f.test.js"><testcase name="d" file="f.test.js"/></testsuite></testsuites>`);
    expect(mergeReports([ok, parseJunit(x)]).tests.get("f.test.js > d")).toBe("fail");
  });

  test("reads the report bun 1.4 actually writes (nested describes, a skip, a failure)", () => {
    const dir = mkdtempSync(join(tmpdir(), "win-ratchet-"));
    try {
      writeFileSync(join(dir, "x.test.js"), `import { test, describe, expect } from "bun:test";
describe("outer", () => { describe("in & ner", () => { test("p", () => {}); test("f", () => { expect(1).toBe(2); }); }); });
test("top", () => {});
test.skip("s", () => {});
`);
      const out = join(dir, "r.xml");
      const p = Bun.spawnSync([process.execPath, "test", "./x.test.js", "--reporter=junit", `--reporter-outfile=${out}`], { cwd: dir, stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(1);
      const r = parseJunit(readFileSync(out, "utf8"));
      expect(Object.fromEntries(r.tests)).toEqual({
        "x.test.js > outer > in & ner > p": "pass",
        "x.test.js > outer > in & ner > f": "fail",
        "x.test.js > top": "pass",
        "x.test.js > s": "skip",
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("judge", () => {
  test("new failure fails; a flake is rescued by the retry; a known failure is fine; a passing entry is STALE", () => {
    const v = judge(suite(first()), retry(), [known, staleE], [A, B]);
    expect(v.newFailures).toEqual([`${A} > new "regression"`]);
    expect(v.flakes).toEqual([`${A} > outer <x> > flaky`]);
    expect(v.stillKnown).toEqual([entryId(known)]);
    expect(v.stale.map((s) => s.id)).toEqual([entryId(staleE)]);
    expect(v.ok).toBe(false);
    const text = render(v, 2, ".github/windows-baseline.json");
    expect(text).toContain("FAIL");
    expect(text).toContain(`✗ ${A} > new "regression"`);
    expect(text).toContain("STALE");
    expect(text).toContain(`~ ${A} > outer <x> > flaky`);
  });

  test("without a retry, the flake is a new failure", () => {
    const v = judge(suite(first()), null, [known], [A, B]);
    expect(v.newFailures).toContain(`${A} > outer <x> > flaky`);
  });

  test("every failure baselined and nothing stale → PASS", () => {
    const base = [known,
      { file: A, test: "outer <x> > flaky", gap: "g-x", reason: "r" },
      { file: A, test: 'new "regression"', gap: "g-x", reason: "r" }];
    const v = judge(suite(first()), null, base, [A, B]);
    expect(v.ok).toBe(true);
    expect(v.stillKnown.length).toBe(3);
  });

  test("a baseline entry that is skipped now, or no longer exists in a file that ran, is stale", () => {
    const skip = { file: A, test: "outer <x> > skipped one", gap: "g-x", reason: "r" };
    const gone = { file: A, test: "renamed away", gap: "g-x", reason: "r" };
    const v = judge(suite(first()), retry(), [known, skip, gone, { file: A, test: 'new "regression"', gap: "g", reason: "r" }], [A, B]);
    expect(v.stale.map((s) => s.id).sort()).toEqual([entryId(gone), entryId(skip)].sort());
  });

  test("an expected file missing from the report (bun drops a file that throws at load) is a failure", () => {
    const C = "compiler/tests/unit/c.test.js";
    const base = [known, { file: A, test: "outer <x> > flaky", gap: "g", reason: "r" }, { file: A, test: 'new "regression"', gap: "g", reason: "r" }];
    const v = judge(suite(first()), null, base, [A, B, C]);
    expect(v.newFailures).toEqual([`${C} > ${FILE_DID_NOT_REPORT}`]);
    // …unless the retry ran it cleanly (a flake at load) …
    const r2 = parseJunit(`<testsuites><testsuite name="${C}" file="${C}"><testcase name="t" file="${C}"/></testsuite></testsuites>`);
    expect(judge(suite(first()), r2, base, [A, B, C]).ok).toBe(true);
    // …and it can be baselined under the file-level id; once it reports again, that entry is stale.
    const fileEntry = { file: C, test: FILE_DID_NOT_REPORT, gap: "g", reason: "r" };
    expect(judge(suite(first()), null, [...base, fileEntry], [A, B, C]).ok).toBe(true);
    const later = mergeReports([first(), r2]);
    expect(judge(suite(later), null, [...base, fileEntry], [A, B, C]).stale.map((s) => s.id)).toEqual([entryId(fileEntry)]);
  });

  test("a baseline entry in a file that did not report is not called stale (the file is the failure)", () => {
    const C = "compiler/tests/unit/c.test.js";
    const inC = { file: C, test: "x", gap: "g", reason: "r" };
    const v = judge(suite(first()), null, [inC], [A, B, C]);
    expect(v.stale).toEqual([]);
    expect(v.newFailures).toContain(`${C} > ${FILE_DID_NOT_REPORT}`);
  });

  test("a missing report, an empty report, and a non-zero exit with nothing failing are suite errors", () => {
    expect(judge([{ name: "unit", path: "nope.xml", rc: 1, report: null }], null, [], []).suiteErrors[0]).toContain("no junit report");
    const empty = parseJunit(`<testsuites></testsuites>`);
    expect(judge([{ name: "e2e", path: "e.xml", rc: 0, report: empty }], null, [], []).suiteErrors[0]).toContain("no test files");
    const clean = parseJunit(`<testsuites><testsuite name="${B}" file="${B}"><testcase name="fine" file="${B}"/></testsuite></testsuites>`);
    const v = judge([{ name: "unit", path: "u.xml", rc: 1, report: clean }], null, [], [B]);
    expect(v.ok).toBe(false);
    expect(v.suiteErrors[0]).toContain("exited 1");
    expect(judge([{ name: "unit", path: "u.xml", rc: 0, report: clean }], null, [], [B]).ok).toBe(true);
  });
});

describe("retryFiles", () => {
  test("files with a failure outside the baseline, plus expected files that did not report", () => {
    expect(retryFiles(first(), new Set([entryId(known)]), [A, B, "z.test.js"])).toEqual([A, "z.test.js"]);
    const allKnown = new Set([entryId(known), `${A} > outer <x> > flaky`, `${A} > new "regression"`]);
    expect(retryFiles(first(), allKnown, [A, B])).toEqual([]);
  });
});

describe("validateBaseline", () => {
  const gaps = gapStatuses(`x <!-- @gap id=g-open sev=LOW status=open locus=a -->
y <!-- @gap id=g-done sev=LOW status=resolved resolved-by=z -->`);
  const exists = (f) => f !== "missing.test.js";
  const e = (o) => ({ file: A, test: "t", gap: "g-open", reason: "why", ...o });
  test("a good baseline is valid; the empty baseline is valid", () => {
    expect(validateBaseline({ entries: [e({})] }, gaps, exists)).toEqual([]);
    expect(validateBaseline({ entries: [] }, gaps, exists)).toEqual([]);
  });
  test("unknown gap, resolved gap, missing file, non-POSIX path, duplicate, missing field", () => {
    const errs = validateBaseline({ entries: [
      e({ gap: "g-nope" }), e({ test: "t2", gap: "g-done" }), e({ file: "missing.test.js" }),
      e({ file: "compiler\\tests\\unit\\a.test.js", test: "t3" }), e({ test: "t4" }), e({ test: "t4" }), e({ reason: "" , test: "t5" }),
    ] }, gaps, exists);
    const all = errs.join("\n");
    expect(all).toContain("g-nope is not in docs/known-gaps.md");
    expect(all).toContain("g-done is RESOLVED");
    expect(all).toContain("does not exist: missing.test.js");
    expect(all).toContain("POSIX");
    expect(all).toContain("duplicate test id");
    expect(all).toContain("`reason` must be a non-empty string");
    expect(validateBaseline({}, gaps, exists)).toEqual(["the baseline has no `entries` list"]);
  });
  test("the committed baseline validates against the committed known-gaps.md", () => {
    const root = join(import.meta.dir, "../../..");
    const json = JSON.parse(readFileSync(join(root, ".github/windows-baseline.json"), "utf8"));
    const g = gapStatuses(readFileSync(join(root, "docs/known-gaps.md"), "utf8"));
    expect(validateBaseline(json, g, (f) => existsSync(join(root, f)))).toEqual([]);
  });
});

describe("summarize (main's windows history, newest first)", () => {
  const row = (runId, windows) => ({ runId, sha: `sha${runId}`.padEnd(12, "0"), event: "push", createdAt: "t", windows });
  test("green latest: no first red", () => {
    const h = summarize([row(9, "success"), row(8, "failure")]);
    expect(h.latest.runId).toBe(9);
    expect(h.firstRed).toBe(null);
    expect(renderHistory(h, "main")).toContain("GREEN");
  });
  test("red latest: first red is the oldest red after the last green; unjudged rows are skipped", () => {
    const h = summarize([row(9, null), row(8, "failure"), row(7, "cancelled"), row(6, "failure"), row(5, "success"), row(4, "failure")]);
    expect(h.latest.runId).toBe(8);
    expect(h.firstRed.runId).toBe(6);
    expect(h.lastGreen.runId).toBe(5);
    expect(h.redRuns).toBe(2);
    const t = renderHistory(h, "main");
    expect(t).toContain("RED");
    expect(t).toContain("first red: sha6");
    expect(t).toContain("gh run view 6 --log-failed");
  });
  test("red with no green in the window says so", () => {
    const h = summarize([row(3, "failure"), row(2, "failure")]);
    expect(h.boundless).toBe(true);
    expect(renderHistory(h, "main")).toContain("OLDER than the window");
  });
  test("nothing judged", () => {
    expect(summarize([row(1, "skipped")]).latest).toBe(null);
  });
});
