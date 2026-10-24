/**
 * match-subject-await-s469.test.js — g-server-return-match-failable-subject-unawaited-s469 (security).
 *
 * SPEC §13.2: "An async-colored function is one the compiler emits `async` … It MAY be called directly
 * (the compiler awaits the call)". A `match` subject is a direct call. Before S469 the value IIFE
 * (`return match check(k) { … }`) lowered its subject in a context carrying no async fact, and the
 * client's expression bridge (`v = match …`, an argument, an operand) dropped the facts too: the call
 * was emitted unawaited, the Promise's tag read `.Ok`, and a DENIED input ran the success arm.
 *
 * Binders (SPEC §18.7): the server pass published no variant field registry, so `fail E::V("x")` wrote
 * the bare `data: "x"` (every reader reads `data.<field>`) and a positional `.V(r)` left `r` unbound
 * (`/* §1a: cannot positionally bind … *\/`). Arity mismatch / mixed forms are E-TYPE-021, an undeclared
 * named field E-TYPE-022, an unresolvable positional binder E-TYPE-027 — never a runtime ReferenceError.
 *
 * The executed end-to-end floor is the security-failable-pack (families s4, f1); this file pins the
 * emitted shapes and the diagnostics.
 */

import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

function compileSource(source, label = "case") {
  const uniq = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s469-msa-${uniq}`);
  const input = resolve(dir, "app.scrml");
  const outDir = resolve(dir, "out");
  mkdirSync(dir, { recursive: true });
  writeFileSync(input, source);
  try {
    const result = compileScrml({ inputFiles: [input], write: true, outputDir: outDir, log: () => {} });
    const read = (name) => {
      const p = resolve(outDir, name);
      return existsSync(p) ? readFileSync(p, "utf8") : "";
    };
    const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    return { errors, codes: errors.map((e) => e.code), clientJs: read("app.client.js"), serverJs: read("app.server.js") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SERVER = (body, pre = "") => `type AuthErr:enum = { Denied(reason: string), Gone }
type Shape:enum = { Circle(r: number), Rect(w: number, h: number) }
<msg> = "init"
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    server function shapeOf(p) -> Shape {
        if (p != "secret") { return Shape.Circle(1) }
        return Shape.Rect(2, 3)
    }
${pre}
    server function login(p) {
${body}
    }
    function go() { @msg = login("wrong") !{ _ :> "err" } }
}
<button onclick=go()>go</button>
<p>\${@msg}</p>
`;
const CLIENT = (body) => `type AuthErr:enum = { Denied(reason: string), Gone }
<msg> = "init"
\${
    server function check(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Denied("bad")
        return true
    }
    function login(p) {
${body}
    }
    function go(p) { @msg = login(p) }
}
<button onclick=go("wrong")>go</button>
<p>\${@msg}</p>
`;
const ARMS = `.Denied(r) :> "rejected", .Gone :> "rejected", else :> "LOGGED IN"`;

/** The `login` route handler's body text (the part after the CSRF gate). */
function loginHandler(serverJs) {
  const at = serverJs.indexOf("async function _scrml_handler_login_");
  return at < 0 ? "" : serverJs.slice(at, serverJs.indexOf("export const __ri_route_login_", at));
}

describe("the match SUBJECT is awaited in every server lowering", () => {
  const cases = [
    ["return match", `return match check(p) { ${ARMS} }`],
    ["return match, paren subject", `return match (check(p)) { ${ARMS} }`],
    ["nested match subject", `return match (match check(p) { ${ARMS} }) { "rejected" :> "rejected", else :> "LOGGED IN" }`],
    ["reassignment (text lowering)", `let v = ""\n v = match check(p) { ${ARMS} }\n return v`],
    ["call argument (text lowering)", `return String(match check(p) { ${ARMS} })`],
    ["statement match", `let v = ""\n match check(p) { .Denied(r) :> { v = "rejected" } else :> { v = "LOGGED IN" } }\n return v`],
    ["const match", `const v = match check(p) { ${ARMS} }\n return v`],
    ["multi-scrutinee return match", `return match (check(p), 1) { (.Denied(r), _) :> "rejected", (_, _) :> "LOGGED IN" }`],
  ];
  for (const [name, body] of cases) {
    test(name, () => {
      const r = compileSource(SERVER(body), "srv");
      expect(r.codes).toEqual([]);
      const h = loginHandler(r.serverJs);
      expect(h).toMatch(/= await check\(p\);/);
      expect(h).not.toMatch(/= check\(p\);/);
    });
  }

  test("an awaited subject makes the value IIFE async and awaited (never a stranded await)", () => {
    const r = compileSource(SERVER(`let v = ""\n v = match check(p) { ${ARMS} }\n return v`), "srv-iife");
    expect(r.codes).toEqual([]);
    expect(loginHandler(r.serverJs)).toContain("v = await (async function() {");
  });

  test("an arm VALUE calling a server function is awaited in the value IIFE", () => {
    const r = compileSource(SERVER(`const k = "a"\n return match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }`,
      `    server function isOk(p) { return p == "secret" }`), "srv-arm");
    expect(r.codes).toEqual([]);
    expect(loginHandler(r.serverJs)).toMatch(/return \(?await isOk\(p\)\)? \?/);
  });
});

describe("the match SUBJECT is awaited in every client lowering", () => {
  const cases = [
    ["return match", `return match check(p) { ${ARMS} }`],
    ["reassignment", `let v = ""\n v = match check(p) { ${ARMS} }\n return v`],
    ["call argument", `return String(match check(p) { ${ARMS} })`],
    ["logical operand", `return (p != "" && match check(p) { ${ARMS} }) || "rejected"`],
    ["cell write", `@msg = match check(p) { ${ARMS} }\n return @msg`],
  ];
  for (const [name, body] of cases) {
    test(name, () => {
      const r = compileSource(CLIENT(body), "cli");
      expect(r.codes).toEqual([]);
      expect(r.clientJs).toMatch(/= await _scrml_fetch_check_\d+\(p\);/);
      expect(r.clientJs).not.toMatch(/= _scrml_fetch_check_\d+\(p\);/);
    });
  }

  test("an expression-tree match arm calling a server function colours the client function async", () => {
    const r = compileSource(CLIENT(`const k = "a"\n let v = ""\n v = match k { "a" :> isOk(p) ? "LOGGED IN" : "rejected", else :> "rejected" }\n return v`)
      .replace("    function login", "    server function isOk(p) { return p == \"secret\" }\n    function login"), "cli-color");
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/async function _scrml_login_\d+\(p\)/);
    expect(r.clientJs).toMatch(/\(await _scrml_fetch_isOk_\d+\s*\(\s*p\s*\)\)/);
  });
});

describe("payload binders (SPEC §18.7) — a binding or a compile-time refusal, never an unbound name", () => {
  test("the server `fail` payload is field-keyed (§51.3.2, §57.8), as the client's is", () => {
    const r = compileSource(SERVER(`return match check(p) { ${ARMS} }`), "keyed");
    expect(r.codes).toEqual([]);
    expect(r.serverJs).toContain(`variant: "Denied", data: { reason: "bad" } }`);
    expect(r.serverJs).not.toContain(`data: "bad"`);
  });

  test("a positional binder on a failable subject binds the declared field", () => {
    const r = compileSource(SERVER(`return match check(p) { .Denied(r) :> r == "bad" ? "rejected" : "x", else :> "LOGGED IN" }`), "pos");
    expect(r.codes).toEqual([]);
    expect(r.serverJs).toMatch(/const r = _scrml_match_\d+\.data\.reason;/);
    expect(r.serverJs).not.toContain("cannot positionally bind");
  });

  test("a positional binder on a `Shape | not` subject binds (server)", () => {
    const r = compileSource(SERVER(`return area(shapeOf(p))`,
      `    server function area(k: Shape | not) {\n        return match k { .Circle(r) :> r == 1 ? "a" : "b", .Rect(w, h) :> w == 2 ? "c" : "d", not :> "e" }\n    }`), "ornot");
    expect(r.codes).toEqual([]);
    expect(r.serverJs).toMatch(/const r = _scrml_match_\d+\.data\.r;/);
    expect(r.serverJs).toMatch(/const w = _scrml_match_\d+\.data\.w; const h = _scrml_match_\d+\.data\.h;/);
  });

  const refusals = [
    ["too many positional binders", `const k = shapeOf(p)\n return match k { .Circle(r, z) :> "a", .Rect(w, h) :> "b" }`, "E-TYPE-021"],
    ["too few positional binders", `const k = shapeOf(p)\n return match k { .Circle(r) :> "a", .Rect(w) :> "b" }`, "E-TYPE-021"],
    ["mixed positional and named binders", `const k = shapeOf(p)\n return match k { .Circle(r) :> "a", .Rect(w, h: hh) :> "b" }`, "E-TYPE-021"],
    ["a named binder for an undeclared field", `const k = shapeOf(p)\n return match k { .Circle(rad: r) :> "a", .Rect(w, h) :> "b" }`, "E-TYPE-022"],
    ["a named binder for an undeclared field, failable subject", `return match check(p) { .Denied(rsn: r) :> "a", else :> "b" }`, "E-TYPE-022"],
    ["too many binders, failable subject", `return match check(p) { .Denied(r, q) :> "a", else :> "b" }`, "E-TYPE-021"],
    ["text lowering: a named binder for an undeclared field", `const k = shapeOf(p)\n let v = ""\n v = match k { .Circle(rad: r) :> "a", .Rect(w, h) :> "b" }\n return v`, "E-TYPE-022"],
    ["text lowering: too many binders", `const k = shapeOf(p)\n let v = ""\n v = match k { .Circle(r, z) :> "a", .Rect(w, h) :> "b" }\n return v`, "E-TYPE-021"],
  ];
  for (const [name, body, code] of refusals) {
    test(`${name} → ${code}`, () => {
      const r = compileSource(SERVER(body), "ref");
      expect(r.codes).toContain(code);
      const msg = r.errors.find((e) => e.code === code)?.message ?? "";
      expect(msg).toContain("§18.7");
      // The pattern is shown as written, not token-spaced (`. Circle ( r )`).
      expect(msg).not.toMatch(/`\.\s+[A-Z]\w*\s*\(/);
      expect(msg).toMatch(/`\.[A-Z]\w*\(/);
    });
  }
});
