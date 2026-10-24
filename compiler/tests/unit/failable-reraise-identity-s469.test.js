/**
 * failable-reraise-identity-s469.test.js — S469 s469-server-return-match-await round 5b (review of
 * cf01c66b8). Executed floor: security-failable-pack families s9 / f6 / l4 / t4 (r6-shapes.js).
 *
 *  - `?` (§19.5.3) re-raises a callee's error unchanged, so the enclosing type must carry each variant
 *    with the same field NAMES and TYPES. Two enums are never equal by NAME: an imported
 *    `AuthErr { Denied(reason) }` re-raised as a local `AuthErr { Denied(note) }` is E-ERROR-010.
 *  - The same field names with other types (`code: string` → `code: number`) are E-ERROR-010.
 *  - A short-form arm reading its implicit `e` where no single field binds is refused; the read is
 *    found through an object shorthand and a nested `match` arm (the walk fails closed).
 *  - `_ e :>` binds the WHOLE error (§18.6.1), so `e is not` is false for a unit variant.
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

function compileFiles(files, label = "case") {
  const uniq = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s469-rri-${uniq}`);
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

const AUTH = `\${
    export type AuthErr:enum = { Denied(reason: string), Gone }
    export server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
}
`;
const WRAP = (ty, call = "check(p)") => `server function wrap(p)! -> ${ty} {
        const ok = ${call}?
        return ok
    }`;
const READ = `const v = wrap(p) !{ .Denied(x) :> x == "bad" ? "rejected" : "LOGGED IN", .Gone :> "rejected" }
        return v == true ? "LOGGED IN" : v`;
const LOCAL = `type AuthErr:enum = { Denied(note: string), Gone }`;

describe("`?` never judges two error enums equal by name (HIGH-1)", () => {
  test("an imported callee's enum with the enclosing enum's name and other fields → E-ERROR-010", () => {
    const r = compileFiles({ "auth.scrml": AUTH, "app.scrml": page(`${LOCAL}\n    ${WRAP("AuthErr")}`, READ, `import { check } from "./auth.scrml"`) });
    expect(r.codes).toContain("E-ERROR-010");
  });
  test("the same through `import { check as c }`", () => {
    const r = compileFiles({ "auth.scrml": AUTH, "app.scrml": page(`${LOCAL}\n    ${WRAP("AuthErr", "c(p)")}`, READ, `import { check as c } from "./auth.scrml"`) });
    expect(r.codes).toContain("E-ERROR-010");
  });
  test("the enclosing enum imported from a third file", () => {
    const r = compileFiles({
      "auth.scrml": AUTH,
      "other.scrml": `\${\n    export type AuthErr:enum = { Denied(note: string), Gone }\n}\n`,
      "app.scrml": page(WRAP("AuthErr"), READ, `import { check } from "./auth.scrml"\nimport { AuthErr } from "./other.scrml"`),
    });
    expect(r.codes).toContain("E-ERROR-010");
  });
  test("control: the callee's OWN enum imported and re-raised is accepted", () => {
    const r = compileFiles({ "auth.scrml": AUTH, "app.scrml": page(WRAP("AuthErr"), READ, `import { check, AuthErr } from "./auth.scrml"`) });
    expect(r.codes).not.toContain("E-ERROR-010");
  });
  test("a callee whose error type is an alias declared in a third file cannot be checked → E-ERROR-010", () => {
    const r = compileFiles({
      "types.scrml": `\${\n    export type AuthErr:enum = { Denied(reason: string), Gone }\n    export type AA = AuthErr\n}\n`,
      "auth.scrml": `import { AuthErr, AA } from "./types.scrml"\n\${\n    export server function check(p)! -> AA {\n        if (p != "secret") fail AuthErr::Denied("bad")\n        return true\n    }\n}\n`,
      "app.scrml": page(`type Other:enum = { Denied(note: string), Gone }\n    ${WRAP("Other")}`, READ, `import { check } from "./auth.scrml"`),
    });
    expect(r.codes).toContain("E-ERROR-010");
  });
});

describe("`?` compares field types (MED-1)", () => {
  const decls = (enclosingField) => `type AuthErr5:enum = { Denied2(code: string), Gone2 }
    type Other5:enum = { Denied2(code: ${enclosingField}), Gone2 }
    server function check(p)! -> AuthErr5 {
        if (p != "secret") fail AuthErr5::Denied2("401")
        return true
    }
    ${WRAP("Other5")}`;
  const body = `const v = wrap(p) !{ .Denied2(c) :> c == "401" ? "rejected" : "LOGGED IN", .Gone2 :> "rejected" }
        return v == true ? "LOGGED IN" : v`;
  test("code: string re-raised as code: number → E-ERROR-010, the message names both types", () => {
    const r = compileFiles({ "app.scrml": page(decls("number"), body) });
    expect(r.codes).toContain("E-ERROR-010");
    const m = r.errors.find((e) => e.code === "E-ERROR-010").message;
    expect(m).toContain("code: string");
    expect(m).toContain("code: number");
  });
  test("control: the same names and types are accepted", () => {
    const r = compileFiles({ "app.scrml": page(decls("string"), body) });
    expect(r.codes).not.toContain("E-ERROR-010");
  });
});

describe("a short-form arm's read of its implicit `e` is found, fail closed (HIGH-2)", () => {
  const decls = `type SE:enum = { Denied2(code: number, reason: string), Gone2 }
    server function sf(p)! -> SE {
        if (p != "secret") fail SE::Denied2(401, "bad")
        return true
    }`;
  const body = (expr) => `const e = "ok"
        const v = sf(p) !{
            Denied2 :> ${expr} == "ok" ? "LOGGED IN" : "rejected"
            Gone2 :> "rejected"
        }
        return v == true ? "LOGGED IN" : v`;
  for (const expr of ["({ e }).e", "({ x: 1, e }).e", "({ a: { e } }).a.e", "[{ e }][0].e", `(match "x" { "x" :> e, else :> "" })`]) {
    test(`${expr} → E-TYPE-021`, () => {
      expect(compileFiles({ "app.scrml": page(decls, body(expr)) }).codes).toContain("E-TYPE-021");
    });
  }
  test("control: an arm that does not read e compiles", () => {
    const r = compileFiles({ "app.scrml": page(decls, body(`({ x: 1 }).x == 1 ? "ok" : "no"`)) });
    expect(r.codes).not.toContain("E-TYPE-021");
  });
});

describe("`_ e :>` binds the whole error (M-2)", () => {
  test("over a unit variant the binder is the error envelope, not its null `.data`", () => {
    const r = compileFiles({ "app.scrml": page(`type UE:enum = { Denied, Gone }
    server function ue(p)! -> UE {
        if (p != "secret") fail UE::Denied
        return true
    }`, `const v = ue(p) !{ _ e :> e is not ? "LOGGED IN" : "rejected" }
        return v == true ? "LOGGED IN" : v`) });
    expect(r.codes).toEqual([]);
    expect(r.serverJs).toMatch(/const e = _scrml_\w+;/);
    expect(r.serverJs).not.toMatch(/const e = _scrml_\w+\.data;/);
  });
});
