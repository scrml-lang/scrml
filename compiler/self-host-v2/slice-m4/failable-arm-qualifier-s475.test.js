// failable-arm-qualifier-s475.test.js — s475-boot-parser-residue item 1
// (g-boot-failable-arm-foreign-enum-qualifier-accepted-s474): on a FAILABLE subject, a
// qualified arm `Q.V` must name the failure's own enum. Before this lane the bootstrap
// asked only "does Q declare V?", so `Other.Denied` on a `check()! AuthErr` subject was
// taken as `AuthErr.Denied`. The plain-enum subject already refused it (E-TYPE-VARIANT,
// "`Other.Denied` names `Other`, but the subject is `AuthErr` (§18.13)").
//
// SPEC §18.13: "`TypeName.VariantName` (fully qualified) — always valid; anchors type
// inference" and "The compiler SHALL use any fully qualified arm to resolve the type for
// unqualified arms in the same expression" — the qualifier IS the arm's type, so one that
// is not the subject's is a type error, the same as on a plain subject.
//
// Accepted qualifiers (green on base and head): the failure's enum itself; on a call of a
// server function the callee's declared enum (its variants are the set's first ones,
// §19.9.10); the built-in `SqlError` on a `?{}` subject; the built-in `Error` on a bare `!`.
// A qualified `Transport` arm on a minted client set (`E + Transport`) has no declared enum
// to name: `.Transport(t)` is the form.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const SQ = "?" + "{";
const TV = "E-TYPE-VARIANT";

const AUTH = `    type AuthErr:enum = { Denied, Locked }
    function check(p: string)! AuthErr {
        if (p == "locked") fail AuthErr.Locked;
        if (p != "secret") fail AuthErr.Denied;
        return true;
    }`;
const P = (fns) => `<program>\n    let <msg:string=""/>\n${AUTH}\n${fns}\n    <main>\n        <button onclick=login()>go</button>\n        <p id="msg">\${@msg}</p>\n    </main>\n</program>\n`;
const login = (body) => `    function login() {\n${body}\n    }`;

const SAVE = `    type SaveError:enum = {\n        Conflict(current: int)\n        Storage\n    }
    function saveNote(id: string, text: string, base: int)! SaveError {
        ${SQ}\`UPDATE notes SET body = \${text} WHERE id = \${id}\`}.run() !{ _ :> { fail .Storage; } };
        return base + 1;
    }`;
const PDB = (fns, main = "") => `<program db="./app.db">\n    let <status:string=""/>\n${SAVE}\n${fns}\n    <main>\n${main}\n    </main>\n</program>\n`;
const BTN = `        <button onclick=save()>s</button>`;

describe("a foreign enum's qualifier on a failable arm is E-TYPE-VARIANT (red on base)", () => {
  test("`match` on a `!` call: `Other.Denied` where the failure is `AuthErr` (the review's i07)", () => {
    const r = run(P(`    type Other:enum = { Denied }\n${login(`        @msg = match check("wrong") { Other.Denied :> "d", .Locked :> "l", else :> "LOGGED IN" };`)}`));
    expect(r.diags.map((d) => d.code)).toEqual([TV]);
    expect(r.diags[0].message).toContain("`Other.Denied` names `Other`, but the failure here is `AuthErr`");
    expect(r.diags[0].message).toContain("§18.13");
  });

  test("a `!{}` handler arm", () => {
    expect(codes(P(`    type Other:enum = { Denied }\n${login(`        check("wrong") !{ Other.Denied :> { @msg = "d"; }, .Locked :> { @msg = "l"; } };`)}`))).toEqual([TV]);
  });

  test("a statement-position `match`", () => {
    expect(codes(P(`    type Other:enum = { Denied, Locked }\n${login(`        match check("wrong") { .Ok(v) :> { @msg = "in"; }, .Denied :> { @msg = "d"; }, Other.Locked :> { @msg = "l"; } }`)}`))).toEqual([TV]);
  });

  test("a client call of a server function: `Other.Conflict(c)` where the callee's enum is `SaveError`", () => {
    expect(codes(PDB(`    type Other:enum = { Conflict(current: int) }
    function save() {
        @status = match saveNote("n", "t", 1) { .Ok(v) :> "ok", Other.Conflict(c) :> "c", .Storage :> "s", .Transport(t) :> "t" };
    }`, BTN))).toEqual([TV]);
  });

  test("a client call: a qualified `Transport` arm naming a user enum that declares `Transport` (the set is minted: `.Transport(t)` is the form)", () => {
    const r = run(PDB(`    type Other:enum = { Transport(t: ServerCallError) }
    function save() {
        @status = match saveNote("n", "t", 1) { .Ok(v) :> "ok", .Conflict(c) :> "c", .Storage :> "s", Other.Transport(t) :> "t" };
    }`, BTN));
    expect(r.diags.map((d) => d.code)).toEqual([TV]);
    expect(r.diags[0].message).toContain("`.Transport(t)`");
  });

  test("a `?{}` subject: a user enum's qualifier on a `SqlError` arm", () => {
    expect(codes(PDB(`    type Other:enum = { ConnectionLost }
    function go()! SaveError {
        ${SQ}\`SELECT 1\`}.get() !{ Other.ConnectionLost :> { fail .Storage; }, _ :> { fail .Storage; } };
    }`))).toEqual([TV]);
  });
});

describe("the failure's own enum stays accepted (green on base and head)", () => {
  test("`AuthErr.Denied` on a `check()! AuthErr` subject", () => {
    expect(codes(P(login(`        @msg = match check("wrong") { AuthErr.Denied :> "d", AuthErr.Locked :> "l", else :> "in" };`)))).toEqual([]);
  });

  test("`!{}` with the own enum qualified", () => {
    expect(codes(P(login(`        check("wrong") !{ AuthErr.Denied :> { @msg = "d"; }, .Locked :> { @msg = "l"; } };`)))).toEqual([]);
  });

  test("a client call: the callee's declared enum qualifies its variants", () => {
    expect(codes(PDB(`    function save() {
        @status = match saveNote("n", "t", 1) { .Ok(v) :> "ok", SaveError.Conflict(c) :> "c", SaveError.Storage :> "s", .Transport(t) :> "t" };
    }`, BTN))).toEqual([]);
  });

  test("a client call: a callee enum that declares `Transport` IS the set, so `E.Transport(t)` is its own", () => {
    expect(codes(`<program db="./app.db">
    let <status:string=""/>
    type WErr:enum = {\n        Bad\n        Transport(t: ServerCallError)\n    }
    function wf(id: string)! WErr {
        ${SQ}\`UPDATE notes SET body = 'x' WHERE id = \${id}\`}.run() !{ _ :> { fail .Bad; } };
        return 1;
    }
    function save() {
        @status = match wf("n") { .Ok(v) :> "ok", WErr.Bad :> "b", WErr.Transport(t) :> "t" };
    }
    <main>
${BTN}
    </main>
</program>
`)).toEqual([]);
  });

  test("a `?{}` subject: the built-in `SqlError` qualifies its variants", () => {
    expect(codes(PDB(`    function go()! SaveError {
        ${SQ}\`SELECT 1\`}.get() !{ SqlError.ConnectionLost :> { fail .Storage; }, _ :> { fail .Storage; } };
    }`))).toEqual([]);
  });

  test("a bare `!` function: the built-in `Error` qualifies its variants", () => {
    expect(codes(P(`    function chk()! {\n        fail Error.Generic("x");\n    }\n${login(`        chk() !{ Error.Generic(m) :> { @msg = m; }, _ :> { @msg = "?"; } };`)}`))).toEqual([]);
  });
});
