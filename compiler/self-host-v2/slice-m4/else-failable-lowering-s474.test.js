// else-failable-lowering-s474.test.js — s474-boot-failable-match-lowering: the LOWERING backstop
// behind E-MATCH-ELSE-ABSORBS-ERROR (else-failable-s474.test.js is the analyzer half).
//
// Ruling: scrml-support/user-voice-scrml.md S474 "⭐ RULED — `else` on a failable match" item 1,
// PERMANENT (security), ledger SEC-20: on a failable result, `else` / `_` covers the success value
// `.Ok` ONLY. The #1729 review (LOW, defence in depth) found the analyzer was the ONLY guard: the
// lowering still put the `else` body in the FAILED branch as the fall-through of the named error
// arms, so any checker hole, new failure source, or added `SqlError` variant would send that error
// back to the success arm. Now:
//   1. lower.scrml errArms — a `match`'s plain `_` / `else` is lowered into the success branch ONLY;
//      it is never a failure arm of the Core Attempt.
//   2. check.scrml C-E2 (unchanged) — the Attempt's failure arms must be total over the enum, so a
//      checker hole that leaves an error unnamed is refused at emission (no artifact).
//   3. print.scrml errArmsJs — every variant arm is tested, the last one too; a failure no arm names
//      reaches `rt.unmatchedFailure(…)`, which throws (fails CLOSED). It never runs the `else` body,
//      and never another arm's body.
// Every "red on base" test below failed on origin/main 335427aa1; the accepted-form tests pass on both.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, printCore, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");

// s475 (s475-boot-handled-landing-check): `check` succeeds with a STRING — the `!{}` shapes below
// (BANG, the `else` catch-all) return `check(p) !{ … }` from a `-> string` function, and the
// handled form's value is the join of the success value and the arms' (§19.4.3: arms "Yield a value
// of the call's success type"); a `bool` success there is E-TYPE-031 now.
const AUTH = `    type AuthErr:enum = { Denied, Locked }
    function check(p: string)! AuthErr {
        if (p == "locked") fail AuthErr.Locked;
        if (p != "secret") fail AuthErr.Denied;
        return "ok";
    }`;
const P = (fns) => `<program>\n    let <msg:string=""/>\n${AUTH}\n${fns}\n    function login() {\n        @msg = "x";\n    }\n    <main>\n        <button onclick=login()>go</button>\n        <p id="msg">\${@msg}</p>\n    </main>\n</program>\n`;
// a value-position `match`: explicit error arms, then `else` (the accepted form)
const VALUE = `    function a(p: string) -> string {\n        return match check(p) { .Locked :> "locked", .Denied :> "denied", else :> "LOGGED IN" };\n    }`;
// the same, `_` (else's alias)
const UNDERSCORE = `    function a(p: string) -> string {\n        return match check(p) { .Locked :> "locked", .Denied :> "denied", _ :> "LOGGED IN" };\n    }`;
// a statement-position `match` (an Attempt with no result)
const STMT = `    function s(p: string) {\n        match check(p) { .Locked :> { @msg = "locked"; }, .Denied :> { @msg = "denied"; }, else :> { @msg = "LOGGED IN"; } }\n    }`;
// a `!{}` handler with named arms only (no catch-all)
const BANG = `    function g(p: string) -> string {\n        return check(p) !{ .Locked :> "locked", .Denied :> "denied" };\n    }`;

const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === "span" ? undefined : x)));
const fnOf = (core, name) => core.fns.find((f) => f.sym.hint === name);
const attemptOf = (core, name) => fnOf(core, name).body.stmts.find((s) => s.variant === "Attempt").data;
const patKinds = (att) => att.arms.map((a) => (typeof a.pat === "string" ? a.pat : a.pat.variant)); // a unit variant (PWild) is its name

function compileClean(src) {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
}

/**
 * Print `core`, apply `edit` to the emitted client JS (test scaffolding over a copy of the output, as
 * load-program.js's `expose` is), and import it with `expose` exported. The edit is the test seam that
 * puts a failure value the compiler does not know about where the checker said none can be.
 */
async function loadEdited(core, name, expose, edit) {
  const out = printCore(core, name);
  expect(out.refused).toEqual([]);
  const dir = mkdtempSync(join(tmpdir(), `else-lowering-${name}-`));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  const js = edit(out.js);
  writeFileSync(join(dir, `${name}.client.js`), `${js}\nexport { ${expose.join(", ")} };\n`);
  expectNoPageErrors();
  document.head.innerHTML = /<head>([\s\S]*)<\/head>/.exec(out.html)[1].replace(/<script[^>]*><\/script>/g, "");
  document.body.innerHTML = "";
  const program = await import(join(dir, `${name}.client.js`));
  rmSync(dir, { recursive: true, force: true });
  return { program, js };
}
// the seam: `check` fails with a variant AuthErr does not have (a "new failure source")
const breach = (js) => {
  const edited = js.replace(`rt.failure("Denied")`, `rt.failure("Breach")`);
  expect(edited).not.toBe(js);
  return edited;
};

describe("Core — a `match`'s `else` is in the success branch ONLY", () => {
  test("value position: the Attempt's failure arms are the two named arms; no wildcard failure arm (red on base)", () => {
    const att = attemptOf(compileClean(P(VALUE)).core, "a");
    expect(patKinds(att)).toEqual(["PVariant", "PVariant"]);
    expect(strip(att.ok.value)).toEqual({ variant: "Lit", data: { lit: { variant: "Str", data: { v: "LOGGED IN" } } } });
  });

  test("`_` (else's alias): the same (red on base)", () => {
    expect(patKinds(attemptOf(compileClean(P(UNDERSCORE)).core, "a"))).toEqual(["PVariant", "PVariant"]);
  });

  test("statement position: the same (red on base)", () => {
    expect(patKinds(attemptOf(compileClean(P(STMT)).core, "s"))).toEqual(["PVariant", "PVariant"]);
  });

  test("`.Ok(v)` + `_ e`: `_ e` stays the whole-error failure arm (green on both)", () => {
    const src = P(`    function b(p: string) -> string {\n        return match check(p) { .Ok(v) :> "LOGGED IN", _ e :> "denied" };\n    }`);
    const att = attemptOf(compileClean(src).core, "b");
    expect(patKinds(att)).toEqual(["PWild"]);
    expect(att.arms[0].whole == null).toBe(false);
  });

  test("a `!{}` handler's `else` stays the failure catch-all (green on both)", () => {
    const src = P(`    function g(p: string) -> string {\n        return check(p) !{ .Locked :> "locked", else :> "other" };\n    }`);
    expect(patKinds(attemptOf(compileClean(src).core, "g"))).toEqual(["PVariant", "PWild"]);
  });
});

describe("C-E2 backstop — a checker hole is refused at emission, never printed with `else` taking the error", () => {
  test("the Core loses its `.Denied` arm (as if analyze let `.Locked :> …, else :> …` through): refused (red on base)", () => {
    const r = compileClean(P(VALUE));
    const att = attemptOf(r.core, "a");
    att.arms = att.arms.filter((arm) => !(arm.pat.variant === "PVariant" && arm.pat.data.idx === 0)); // drop `.Denied`
    const found = mods.check.checkCore(r.core);
    expect(found.some((m) => m.startsWith("C-E2") && m.includes("do not cover variant #0"))).toBe(true);
    const out = printCore(r.core, "else-hole");
    expect(out.js).toBe("");
    expect(out.refused.length > 0).toBe(true);
  });
});

describe("printed JS — the `else` body is printed once, in the success branch", () => {
  test("value position: \"LOGGED IN\" appears once, and the failed branch ends in rt.unmatchedFailure (red on base)", () => {
    const js = printCore(compileClean(P(VALUE)).core, "else-printed").js;
    expect(js.split(`"LOGGED IN"`).length - 1).toBe(1);
    expect(js).toContain(`rt.unmatchedFailure(outcome.error, "AuthErr")`);
  });
});

describe("runtime trap — a failure no arm names fails CLOSED; the `else` body never runs", () => {
  test("value position: an out-of-enum failure traps instead of returning \"LOGGED IN\" (red on base)", async () => {
    const { program } = await loadEdited(compileClean(P(VALUE)).core, "else-trap-v", ["a"], breach);
    let got = "(no value)";
    let threw = null;
    try { got = program.a("wrong"); } catch (e) { threw = e; }
    expect(got).toBe("(no value)");
    expect(threw).not.toBe(null);
    expect(String(threw.message)).toContain("AuthErr.Breach");
    expect(String(threw.message)).toContain("reached no arm");
    // the declared variants still route to their own arms, success to `else`
    expect(program.a("locked")).toBe("locked");
    expect(program.a("secret")).toBe("LOGGED IN");
  });

  test("statement position: the trap stops the handler; the `else` body's write never happens (red on base)", async () => {
    const { program } = await loadEdited(compileClean(P(STMT)).core, "else-trap-s", ["s"], breach);
    let threw = null;
    try { program.s("wrong"); } catch (e) { threw = e; }
    expect(threw).not.toBe(null);
    expect(document.querySelector("#msg").textContent).not.toBe("LOGGED IN");
    program.s("secret");
    expect(document.querySelector("#msg").textContent).toBe("LOGGED IN");
  });

  test("a `!{}` with named arms only: an out-of-enum failure traps, it does not run the LAST arm's body (red on base)", async () => {
    const { program } = await loadEdited(compileClean(P(BANG)).core, "else-trap-b", ["g"], breach);
    let got = "(no value)";
    let threw = null;
    try { got = program.g("wrong"); } catch (e) { threw = e; }
    expect(got).toBe("(no value)");
    expect(String(threw && threw.message)).toContain("reached no arm");
    expect(program.g("locked")).toBe("locked");
  });

  test("from a click: the trap is a page error and the cell keeps its old value (red on base)", async () => {
    const src = P(VALUE).replace(`        @msg = "x";`, `        @msg = a("wrong");`);
    const { program } = await loadEdited(compileClean(src).core, "else-trap-c", ["a"], breach);
    expect(typeof program.a).toBe("function");
    document.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const errs = takePageErrors();
    expect(errs.length).toBe(1);
    expect(String(errs[0] && errs[0].message)).toContain("reached no arm");
    expect(document.querySelector("#msg").textContent).toBe("");
  });
});

// The #1729 review's pre-existing gap (c): an `else` after `.Ok` and every error variant covers
// nothing (it takes `.Ok` only), and §18.6 says "The compiler SHALL emit a warning (W-MATCH-001)".
describe("W-MATCH-001 — an `else` after `.Ok` and every error variant is unreachable (§18.6)", () => {
  const codes = (src) => run(src).diags.map((d) => d.code);
  test("`.Ok(v)`, `.Locked`, `.Denied`, `else`: W-MATCH-001 at the `else`, and it still compiles (red on base)", () => {
    const src = P(`    function a(p: string) -> string {\n        return match check(p) { .Ok(v) :> "IN", .Locked :> "l", .Denied :> "d", else :> "LOGGED IN" };\n    }`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["W-MATCH-001"]);
    expect(r.diags[0].message).toContain("`.Ok` only");
    expect(r.core == null).toBe(false);                     // a warning: compilation proceeds
  });
  test("`_` (else's alias), statement position: the same (red on base)", () => {
    expect(codes(P(`    function s(p: string) {\n        match check(p) { .Ok(v) :> { @msg = "IN"; }, .Locked :> { @msg = "l"; }, .Denied :> { @msg = "d"; }, _ :> { @msg = "?"; } }\n    }`))).toEqual(["W-MATCH-001"]);
  });
  test("no `.Ok` arm: the `else` takes `.Ok`, so it is reachable — no warning (green on both)", () => {
    expect(codes(P(VALUE))).toEqual([]);
  });
  test("`.Ok` named but an error is not: still E-MATCH-ELSE-ABSORBS-ERROR, no warning (green on both)", () => {
    expect(codes(P(`    function a(p: string) -> string {\n        return match check(p) { .Ok(v) :> "IN", .Locked :> "l", else :> "LOGGED IN" };\n    }`))).toEqual(["E-MATCH-ELSE-ABSORBS-ERROR"]);
  });
});

describe("accepted forms — unchanged behaviour (green on both)", () => {
  test("explicit error arms + `else`, value and statement position: each error to its arm, success to `else`", async () => {
    const src = `<program>\n    let <msg:string=""/>\n    let <out:string=""/>\n${AUTH}\n${VALUE}\n${STMT}\n    function login() {\n        @out = a("hunter3") + "/" + a("locked") + "/" + a("secret");\n        s("hunter3");\n    }\n    <main>\n        <button onclick=login()>go</button>\n        <p id="msg">\${@msg}</p>\n        <p id="out">\${@out}</p>\n    </main>\n</program>\n`;
    const r = compileClean(src);
    await loadProgram(r.core, "else-lowering-ok", []);
    click([...document.querySelectorAll("button")].find((x) => x.textContent === "go"));
    expect(document.querySelector("#out").textContent).toBe("denied/locked/LOGGED IN");
    expect(document.querySelector("#msg").textContent).toBe("denied");
  });
});
