// else-failable-s474.test.js — s474-else-failable-error-variants: on a failable result,
// `else` / `_` covers the success value `.Ok` ONLY. An `else` that would take an error
// variant no earlier arm names is E-MATCH-ELSE-ABSORBS-ERROR (SPEC §18.6, §19.4.3, §19.7.1).
//
// Ruling: scrml-support/user-voice-scrml.md S474 "⭐ RULED — `else` on a failable match;
// `scrml fix` S466 readings" item 1 — PERMANENT (security): *"proven exploit:
// `match check(pw) { .Locked :> "locked", else :> "LOGGED IN" }` logs in on `.Denied`"*.
//
// One choke point: analyze.scrml `resolveArms` (the `absorb` flag) + `coverDiags`, which every
// failable-subject `match` reaches (`guarded` for a `!` call / `?{}`, `remoteGuarded` for a client
// call of a server function). A `!{}` handler's arms are outside the rule (every arm there is a
// failure). Every "red on base" test below reported nothing (or the old E-TYPE-020 hint) on
// 1945c2e21; the accepted-form tests are green on both.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const diag = (src, code) => run(src).diags.find((d) => d.code === code);
const SQ = "?" + "{";
const ABS = "E-MATCH-ELSE-ABSORBS-ERROR";

// ── the exploit's program: `check` fails `.Denied` on a wrong password ─────────────────────────
const AUTH = `    type AuthErr:enum = { Denied, Locked }
    function check(p: string)! AuthErr {
        if (p == "locked") fail AuthErr.Locked;
        if (p != "secret") fail AuthErr.Denied;
        return true;
    }`;
const P = (fns) => `<program>\n    let <msg:string=""/>\n    let <wrong:string=""/>\n    let <right:string=""/>\n${AUTH}\n${fns}\n    <main>\n        <button onclick=login()>go</button>\n        <p id="msg">\${@msg}</p>\n        <p id="wrong">\${@wrong}</p>\n        <p id="right">\${@right}</p>\n    </main>\n</program>\n`;
const login = (body) => `    function login() {\n${body}\n    }`;

// ── a server function, called from the client (§19.9.10: its failure set adds `.Transport`) ──
const SAVE = `    type SaveError:enum = {\n        Conflict(current: int)\n        TooLong(limit: int)\n        Storage\n    }
    function saveNote(id: string, text: string, base: int)! SaveError {
        ${SQ}\`UPDATE notes SET body = \${text} WHERE id = \${id}\`}.run() !{ _ :> { fail .Storage; } };
        return base + 1;
    }`;
const PDB = (fns, main = "") => `<program db="./app.db">\n    let <status:string=""/>\n${SAVE}\n${fns}\n    <main>\n${main}\n    </main>\n</program>\n`;
const BTN = `        <button onclick=save()>s</button>`;

describe("E-MATCH-ELSE-ABSORBS-ERROR — every way a failable result reaches a `match` (red on base)", () => {
  test("the exploit, value position: `.Locked :> …, else :> \"LOGGED IN\"` — names `.Denied`, offers `_ e`", () => {
    const src = P(login(`        @msg = match check("wrong") { .Locked :> "locked", else :> "LOGGED IN" };`));
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual([ABS]);
    expect(r.core == null).toBe(true);                      // an Error: no artifact (§34, §2.2.1)
    const m = r.diags[0].message;
    expect(m).toContain("Denied");
    expect(m).not.toContain("Locked,");                    // `.Locked` has its own arm: not listed
    expect(m).toContain("`_ e :> …`");
    expect(m).toContain("`.Ok` only");
  });

  test("`_` is `else`'s alias: the same", () => {
    expect(codes(P(login(`        @msg = match check("wrong") { .Locked :> "locked", _ :> "LOGGED IN" };`)))).toEqual([ABS]);
  });

  test("after `.Ok(v)`: the `else` would take every error variant — all named", () => {
    const src = P(login(`        @msg = match check("wrong") { .Ok(v) :> "LOGGED IN", else :> "no" };`));
    expect(codes(src)).toEqual([ABS]);
    expect(diag(src, ABS).message).toContain("Denied, Locked");
  });

  test("a wildcard-only `match`", () => {
    expect(codes(P(login(`        @msg = match check("wrong") { _ :> "LOGGED IN" };`)))).toEqual([ABS]);
  });

  test("`return match …`", () => {
    expect(codes(P(`    function who(p: string) -> string {\n        return match check(p) { .Locked :> "locked", else :> "LOGGED IN" };\n    }\n${login(`        @msg = who("wrong");`)}`))).toEqual([ABS]);
  });

  test("a statement-position `match`", () => {
    expect(codes(P(login(`        match check("wrong") { .Locked :> { @msg = "locked"; }, else :> { @msg = "LOGGED IN"; } }`)))).toEqual([ABS]);
  });

  test("a `match` nested in a `!{}` arm is a `match` on a failable result too", () => {
    expect(codes(P(login(`        check("a") !{ .Locked :> { match check("b") { .Denied :> { @msg = "d"; }, else :> { @msg = "IN"; } } }, _ :> { @msg = "o"; } };`)))).toEqual([ABS]);
  });

  test("a `?{}` query: the `else` would take the SqlError variants no arm names", () => {
    const src = PDB(`    function look()! SaveError {\n        const n: int = match ${SQ}\`SELECT 1\`}.get() { .QueryFailed :> 0, else :> 1 };\n        return n;\n    }`);
    expect(codes(src)).toEqual([ABS]);
    expect(diag(src, ABS).message).toContain("ConstraintViolation, ConnectionLost");
  });

  test("a client call of a server function: every declared variant named, but `.Transport` is not", () => {
    const src = PDB(`    function save() {\n        match saveNote("n", "t", 1) { .Conflict(c) :> { @status = "c"; }, .TooLong(n) :> { @status = "l"; }, .Storage :> { @status = "s"; }, else :> { @status = "saved"; } }\n    }`, BTN);
    expect(codes(src)).toEqual([ABS]);
    expect(diag(src, ABS).message).toContain("Transport");
  });

  test("a server→server call owes only the callee's own variants — a missing one is named", () => {
    const src = PDB(`    function relay()! SaveError {\n        ${SQ}\`SELECT 1\`}.get() !{ _ :> { fail .Storage; } };\n        const n: int = match saveNote("n", "t", 1) { .Conflict(c) :> 0, else :> 1 };\n        return n;\n    }`);
    expect(codes(src)).toEqual([ABS]);
    const m = diag(src, ABS).message;
    expect(m).toContain("TooLong, Storage");
    expect(m).not.toContain("Transport");
  });
});

describe("the spellings the bootstrap refuses by name never reach the match (fail closed)", () => {
  // SPEC §18.6: the rule is on the subject's TYPE — an optional call and a call through a failable
  // function value are failable exactly as the direct call. The bootstrap has neither: each is
  // refused by name, so no `else` on one is ever accepted.
  test("an optional call `check?.(p)`", () => {
    const cs = codes(P(login(`        @msg = match check?.("wrong") { .Locked :> "locked", else :> "LOGGED IN" };`)));
    expect(cs).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a call through a function value bound to a name", () => {
    const r = run(P(login(`        const f = check;\n        @msg = match f("wrong") { .Locked :> "locked", else :> "LOGGED IN" };`)));
    expect(r.diags.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(r.core == null).toBe(true);
  });
});

describe("E-TYPE-020's hint on a failable result never offers `else` (red on base)", () => {
  test("a missing error variant: the hint offers the name or `_ e`, and says `else` covers `.Ok` only", () => {
    const src = P(login(`        @msg = match check("wrong") { .Locked :> "locked" };`));
    expect(codes(src)).toEqual(["E-TYPE-020"]);
    const m = diag(src, "E-TYPE-020").message;
    expect(m).not.toContain("else :>");
    expect(m).not.toContain("_ :>");
    expect(m).toContain("_ e :>");
    expect(m).toContain("Ok, Denied");
  });

  test("a missing `.Ok` only: the hint offers `.Ok(v)`, not `else`", () => {
    const src = P(login(`        @msg = match check("wrong") { .Locked :> "locked", _ e :> "no" };`));
    expect(codes(src)).toEqual(["E-TYPE-020"]);
    const m = diag(src, "E-TYPE-020").message;
    expect(m).toContain(".Ok(v) :>");
    expect(m).not.toContain("else :>");
  });
});

describe("accepted forms stay accepted (green on base and head)", () => {
  test("`.Ok(v) :> …, _ e :> …`", () => {
    expect(codes(P(login(`        @msg = match check("wrong") { .Ok(v) :> "LOGGED IN", _ e :> "no" };`)))).toEqual([]);
  });
  test("explicit error arms, then `else` / `_` for the success value", () => {
    expect(codes(P(login(`        @msg = match check("wrong") { .Locked :> "locked", .Denied :> "denied", else :> "LOGGED IN" };`)))).toEqual([]);
    expect(codes(P(login(`        @msg = match check("wrong") { .Locked :> "locked", .Denied :> "denied", _ :> "LOGGED IN" };`)))).toEqual([]);
  });
  test("a client call of a server function: `.Transport` named too, then `else`", () => {
    expect(codes(PDB(`    function save() {\n        match saveNote("n", "t", 1) { .Conflict(c) :> { @status = "c"; }, .TooLong(n) :> { @status = "l"; }, .Storage :> { @status = "s"; }, .Transport(t) :> { @status = "t"; }, else :> { @status = "saved"; } }\n    }`, BTN))).toEqual([]);
    expect(codes(PDB(`    function save() {\n        match saveNote("n", "t", 1) { .Ok(v) :> { @status = "saved"; }, _ e :> { @status = "e"; } }\n    }`, BTN))).toEqual([]);
  });
  test("server→server: the callee's own variants, then `else` (no `.Transport` owed)", () => {
    expect(codes(PDB(`    function relay()! SaveError {\n        ${SQ}\`SELECT 1\`}.get() !{ _ :> { fail .Storage; } };\n        const n: int = match saveNote("n", "t", 1) { .Conflict(c) :> 0, .TooLong(n) :> 0, .Storage :> 0, else :> 1 };\n        return n;\n    }`))).toEqual([]);
  });
  test("a `?{}` query: every SqlError variant named, then `else`", () => {
    expect(codes(PDB(`    function look()! SaveError {\n        const n: int = match ${SQ}\`SELECT 1\`}.get() { .QueryFailed :> 0, .ConstraintViolation :> 0, .ConnectionLost :> 0, else :> 1 };\n        return n;\n    }`))).toEqual([]);
  });
  test("a `!{}` handler's `else` / `_` is the catch-all over the errors — outside the rule", () => {
    expect(codes(P(login(`        check("wrong") !{ .Locked :> { @msg = "l"; return; }, else :> { @msg = "denied"; return; } };\n        @msg = "IN";`)))).toEqual([]);
    expect(codes(PDB(`    function save() {\n        saveNote("n", "t", 1) !{ .Conflict(c) :> { @status = "c"; }, else :> { @status = "other"; } };\n    }`, BTN))).toEqual([]);
  });
  test("a `match` over an error VALUE (the `_ err` binder) is an ordinary enum match — `else` takes its variants", () => {
    expect(codes(P(login(`        check("wrong") !{ _ err :> { @msg = match err { .Locked :> "l", else :> "other" }; return; } };\n        @msg = "IN";`)))).toEqual([]);
  });
});

describe("runtime — the accepted forms route an error to its own arm, never to the success arm", () => {
  test("explicit error arms + `else`, and `_ e`: a wrong password is denied, the right one logs in", async () => {
    const src = P(`    function a(p: string) -> string {\n        return match check(p) { .Locked :> "locked", .Denied :> "denied", else :> "LOGGED IN" };\n    }\n    function b(p: string) -> string {\n        return match check(p) { .Ok(v) :> "LOGGED IN", _ e :> "denied" };\n    }\n${login(`        @wrong = a("hunter3") + "/" + b("hunter3");\n        @right = a("secret") + "/" + b("secret");\n        @msg = a("locked") + "/" + b("locked");`)}`);
    const r = run(src);
    expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    await loadProgram(r.core, "else-failable-s474", []);
    click([...document.querySelectorAll("button")].find((x) => x.textContent === "go"));
    expect(document.querySelector("#wrong").textContent).toBe("denied/denied");
    expect(document.querySelector("#right").textContent).toBe("LOGGED IN/LOGGED IN");
    expect(document.querySelector("#msg").textContent).toBe("locked/denied");
  });
});
