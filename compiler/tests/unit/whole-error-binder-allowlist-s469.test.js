/**
 * whole-error-binder-allowlist-s469.test.js — S469 s469-server-return-match-await round 6 (review of
 * 716ee804e). Executed floor: security-failable-pack families s10 / f7 / l5 / t5 (r7-shapes.js).
 *
 * SPEC §18.6.1: `_ e :>` binds the WHOLE error value, typed as the handled call's error enum.
 *  - HIGH-A: the use of `e` is checked by an ALLOW-list that fails closed — a `match e` over its
 *    enum's variants, an `is` operand, `e.variant`, a whole argument of a variant constructor whose
 *    field is that enum or of a local function whose parameter is typed with it (and whose body
 *    passes the same check), and the `log()` builtin. Everything else is refused: a payload read in
 *    any spelling (E-TYPE-004), a comparison (E-EQ-001), a literal arm (E-TYPE-028), and any other
 *    use — `String(e)`, a template, a container, a local alias, a destructuring, a cell write, an
 *    unchecked call (E-TYPE-031).
 *  - HIGH-B: the binder (and a `match e` on it) is typed by the identity-resolved enum: an imported
 *    callee's `AuthErr { Denied(reason) }` is never read through a local `AuthErr { Denied(note) }`,
 *    and `match e` over an imported enum works with no local enum at all.
 *  - MED: `?` compares CANONICAL field types (aliases resolved in the declaring file; structs and
 *    nested enums structurally; an unknown type is a mismatch).
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

function compileFiles(files, label = "case") {
  const uniq = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s469-web-${uniq}`);
  const outDir = resolve(dir, "out");
  mkdirSync(dir, { recursive: true });
  for (const [name, src] of Object.entries(files)) writeFileSync(resolve(dir, name), src);
  try {
    const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: outDir, log: () => {} });
    const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    const p = resolve(outDir, "app.server.js");
    return { errors, codes: errors.map((e) => e.code), serverJs: existsSync(p) ? readFileSync(p, "utf8") : "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const page = (decls, body, imports = "") => `${imports}
<msg> = "init"
\${
    ${decls}
    server function login(p) {
        ${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;

const DECLS = `type AuthErr:enum = { Denied(reason: string), Gone }
    type Phase:enum = { Idle, Failed(err: AuthErr) }
    type Wrong:enum = { Held(err: string) }
    const bad = "bad"
    server function getReason(x) { return x.reason }
    server function getReasonT(x: AuthErr) { return x.reason }
    server function describe(x: AuthErr) { return match x { .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" } }
    server function wrap(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }`;
const X = (cond) => `const v = wrap(p) !{ _ e :> ${cond} ? "rejected" : "LOGGED IN" }
        return v == true ? "LOGGED IN" : v`;
const B = (blk) => `let o = "LOGGED IN"
        const v = wrap(p) !{ _ e :> {
            ${blk}
        } }
        return v == true ? "LOGGED IN" : o`;
const codesOf = (body, decls = DECLS) => compileFiles({ "app.scrml": page(decls, body) }).codes;
// S470 lane B (s470-typed-payload-binders): `getReasonT(x: AuthErr) { return x.reason }` is itself a
// member read off an enum value — E-TYPE-004 under the S470 ruling "(B) Type the binders" — so the
// ALLOWED uses compile against the same declarations without it.
const DECLS_ALLOWED = DECLS.replace("    server function getReasonT(x: AuthErr) { return x.reason }\n", "");

describe("HIGH-A — every other use of the whole-error binder is refused", () => {
  const REFUSED = [
    ["index", X(`e["reason"] == "bad"`), "E-TYPE-004"],
    ["member", X(`e.reason == "bad"`), "E-TYPE-004"],
    ["optional member", X(`e?.reason == "bad"`), "E-TYPE-004"],
    ["helper untyped", X(`getReason(e) == "bad"`), "E-TYPE-031"],
    ["helper typed with the enum, body reads a field", X(`getReasonT(e) == "bad"`), "E-TYPE-004"],
    ["lambda param member", X(`((x) => x.reason)(e) == "bad"`), "E-TYPE-031"],
    ["lambda destructure", X(`(({ reason }) => reason)(e) == "bad"`), "E-TYPE-031"],
    ["tagged template", X("tag`${e.reason}` == \"bad\""), "E-TYPE-031"],
    ["block destructure", B(`const { reason } = e\n            if (reason == "bad") { o = "rejected" }`), "E-TYPE-031"],
    ["block alias then member", B(`const err = e\n            if (err.reason == "bad") { o = "rejected" }`), "E-TYPE-031"],
    ["block let then compare", B(`let s = e\n            if (s == "bad") { o = "rejected" }`), "E-TYPE-031"],
    ["== a const", X(`e == bad`), "E-EQ-001"],
    ["== a concatenation", X(`e == "ba" + "d"`), "E-EQ-001"],
    ["String(e)", X(`String(e) == "bad"`), "E-TYPE-031"],
    ["template of e", X("`${e}` == \"bad\""), "E-TYPE-031"],
    ["in a tape", X(`[e][0] == "bad"`), "E-TYPE-031"],
    ["in an object", X(`({ x: e }).x == "bad"`), "E-TYPE-031"],
    ["match with a literal arm", X(`(match e { "bad" :> true, else :> false })`), "E-TYPE-028"],
    ["passed to a variant whose field is not the enum", B(`const h = Wrong.Held(e)\n            o = "rejected"`), "E-TYPE-031"],
    ["re-declared inside the arm", B(`const e = "x"\n            o = "rejected"`), "E-TYPE-031"],
  ];
  for (const [n, body, code] of REFUSED) {
    test(`${n} → ${code}`, () => {
      expect(codesOf(body)).toContain(code);
    });
  }
});

describe("HIGH-A — the allowed uses compile", () => {
  const ALLOWED = [
    ["is a variant", X(`e is .Denied`)],
    ["e.variant", X(`e.variant == "Denied"`)],
    ["match e over its variants", `const v = wrap(p) !{ _ e :> match e { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", else :> "rejected" } }
        return v == true ? "LOGGED IN" : v`],
    ["passed to a function typed with the enum that matches it", `const v = wrap(p) !{ _ e :> describe(e) }
        return v == true ? "LOGGED IN" : v`],
    ["passed to a variant whose field is the enum", B(`const ph = Phase.Failed(e)\n            o = "rejected"`)],
    ["logged", B(`log("denied", e)\n            o = "rejected"`)],
  ];
  for (const [n, body] of ALLOWED) {
    test(n, () => {
      expect(codesOf(body, DECLS_ALLOWED)).toEqual([]);
    });
  }
  test("a `log` the arm declares is not the builtin", () => {
    expect(codesOf(B(`const log = (x) => x\n            log(e)\n            o = "rejected"`))).toContain("E-TYPE-031");
  });
});

const AUTH = `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
    export server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
`;
const WM = `const v = check(p) !{ _ e :> match e { .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", else :> "rejected" } }
        return v == true ? "LOGGED IN" : v`;

describe("HIGH-B — the binder is typed by the identity-resolved enum", () => {
  test("`match e` binds the IMPORTED enum's field, not a same-named local enum's", () => {
    const r = compileFiles({ "auth.scrml": AUTH, "app.scrml": page(`type AuthErr:enum = { Denied(note: string), Gone }`, WM, `import { check } from "./auth.scrml"`) });
    expect(r.codes).toEqual([]);
    expect(r.serverJs).toContain(".data.reason");
    expect(r.serverJs).not.toContain(".data.note");
  });
  test("`match e` over an imported enum works with no local enum (the SPEC's own remedy)", () => {
    const r = compileFiles({ "auth.scrml": AUTH, "app.scrml": page("", WM, `import { check } from "./auth.scrml"`) });
    expect(r.codes).toEqual([]);
    expect(r.serverJs).toContain(".data.reason");
  });
  test("passing it to a function typed with a same-named LOCAL enum is refused", () => {
    const r = compileFiles({
      "auth.scrml": AUTH,
      "app.scrml": page(`type AuthErr:enum = { Denied(note: string), Gone }
    server function describe(x: AuthErr) { return match x { .Denied(r) :> r == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" } }`,
        `const v = check(p) !{ _ e :> describe(e) }\n        return v == true ? "LOGGED IN" : v`, `import { check } from "./auth.scrml"`),
    });
    expect(r.codes).toContain("E-TYPE-031");
  });
  test("an unresolvable callee enum makes every use of the binder a refusal", () => {
    const r = compileFiles({
      "types.scrml": `\${\n    export type AuthErr:enum = { Denied(reason: string), Gone }\n    export type AA = AuthErr\n}\n`,
      "auth.scrml": `import { AuthErr, AA } from "./types.scrml"\n\${\n    export server function check(p)! -> AA {\n        if (p != "secret") fail AuthErr::Denied("bad")\n        return true\n    }\n}\n`,
      "app.scrml": page(`type AuthErr:enum = { Denied(note: string), Gone }`, WM, `import { check } from "./auth.scrml"`),
    });
    expect(r.codes).toContain("E-TYPE-031");
  });
});

describe("MED — `?` compares canonical field types", () => {
  const WR = (ty) => `server function wrap(p)! -> ${ty} {
        const ok = check(p)?
        return ok
    }`;
  const CHK = (ty, f) => `server function check(p)! -> ${ty} {
        if (p != "secret") fail ${f}
        return true
    }`;
  const body = `const v = wrap(p) !{ .Denied(x) :> x == 401 ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
        return v == true ? "LOGGED IN" : v`;
  test("alias fields over different base types → E-ERROR-010", () => {
    expect(codesOf(body, `type Code = number\n    type Code2 = string\n    type AuthErr:enum = { Denied(code: Code), Gone }\n    type Other:enum = { Denied(code: Code2), Gone }\n    ${CHK("AuthErr", "AuthErr::Denied(401)")}\n    ${WR("Other")}`)).toContain("E-ERROR-010");
  });
  test("an alias of the same base type is the same field type (no over-refusal)", () => {
    expect(codesOf(body, `type Code = number\n    type AuthErr:enum = { Denied(code: Code), Gone }\n    type Other:enum = { Denied(code: number), Gone }\n    ${CHK("AuthErr", "AuthErr::Denied(401)")}\n    ${WR("Other")}`)).not.toContain("E-ERROR-010");
  });
  test("a same-named alias over another base type in another file → E-ERROR-010", () => {
    const r = compileFiles({
      "auth.scrml": `\${\n    type Code = number\n    export type AuthErr:enum = { Denied(code: Code), Gone }\n    export ${CHK("AuthErr", "AuthErr::Denied(401)")}\n}\n`,
      "app.scrml": page(`type Code = string\n    type Other:enum = { Denied(code: Code), Gone }\n    ${WR("Other")}`, body, `import { check } from "./auth.scrml"`),
    });
    expect(r.codes).toContain("E-ERROR-010");
  });
  test("a same-named struct of another shape in another file → E-ERROR-010", () => {
    const r = compileFiles({
      "auth.scrml": `\${\n    type Info:struct = { v: number }\n    export type AuthErr:enum = { Denied(code: Info), Gone }\n    export ${CHK("AuthErr", "AuthErr::Denied({ v: 401 })")}\n}\n`,
      "app.scrml": page(`type Info:struct = { v: string }\n    type Other:enum = { Denied(code: Info), Gone }\n    ${WR("Other")}`, body, `import { check } from "./auth.scrml"`),
    });
    expect(r.codes).toContain("E-ERROR-010");
  });
  test("a same-named nested enum with other variants in another file → E-ERROR-010", () => {
    const r = compileFiles({
      "auth.scrml": `\${\n    type Kind:enum = { Wrong, Bad }\n    export type AuthErr:enum = { Denied(code: Kind), Gone }\n    export ${CHK("AuthErr", "AuthErr::Denied(Kind.Wrong)")}\n}\n`,
      "app.scrml": page(`type Kind:enum = { Bad, Good }\n    type Other:enum = { Denied(code: Kind), Gone }\n    ${WR("Other")}`, body, `import { check } from "./auth.scrml"`),
    });
    expect(r.codes).toContain("E-ERROR-010");
  });
});
