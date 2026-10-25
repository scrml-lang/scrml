/**
 * s470-async-colouring-scope (SECURITY, impl#1) — gap g-impl1-async-colouring-ignores-local-shadow-s469.
 *
 * Async colouring (SPEC §13.2: a function that calls a server function / an async function is
 * coloured async and every call of it is awaited) read a body's callees by NAME. A helper calling a
 * LOCAL binding that shadows an async file-scope name —
 *
 *     server function check(p) { … }
 *     function allowed(p) { const check = (x) => x == "secret"   return check(p) }
 *
 * — was coloured async, so a render-position / parameter-default use of `allowed` was refused, its
 * library export returned a Promise, and the shadowed call was emitted `await check(p)`. The call
 * names the local: `allowed` is sync. Callees are now resolved against the function's own scopes
 * (`collectFreeCalleeIdents`, emit-library-shared.ts — the `walkScoped` model of local-async-fns.ts
 * with `sequentialLocals`). The DUAL direction is the one that matters for security: a call that
 * names the async function — a shadow in a SIBLING scope, a call BEFORE the shadow, a closure — must
 * keep the colour, or the helper tests a pending Promise (always truthy).
 *
 * Plus the tool-mode fail-open of the same root (FAIL on base 6081e0685): every `<program
 * kind="tool">` function body shared ONE `declaredNames` set, so a `const check` in one function made
 * a LATER function's call of the async `check` read as that local and it was emitted without `await`.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";
import { collectFreeCalleeIdents, locallyBoundOnlyCalleeNames, computeAsyncFnNames } from "../../src/codegen/emit-library-shared.ts";

// ---------------------------------------------------------------------------
// (1) the resolver, on hand-built trees
// ---------------------------------------------------------------------------
const call = (name, ...args) => ({ kind: "call", callee: { kind: "ident", name }, args });
const ret = (expr) => ({ kind: "return-stmt", exprNode: expr });
const constDecl = (name, init) => ({ kind: "const-decl", name, initExpr: init });
const lambda = (params, body) => ({ kind: "lambda", params: params.map((name) => ({ name })), body });
const ifStmt = (consequent) => ({ kind: "if-stmt", condition: { kind: "ident", name: "p" }, consequent });
const fnDecl = (name, params, body) => ({ kind: "function-decl", name, params: params.map((n) => ({ name: n })), body });
const free = (fn, guard = false) => { const out = new Set(); collectFreeCalleeIdents(fn, out, guard); return [...out].sort(); };

describe("collectFreeCalleeIdents — a callee bound by the function's own scope is not the file-scope name", () => {
  test("a const local shadows the call after it", () => {
    expect(free(fnDecl("allowed", ["p"], [constDecl("check", lambda(["x"], [])), ret(call("check", { kind: "ident", name: "p" }))]))).toEqual([]);
  });
  test("a parameter shadows", () => {
    expect(free(fnDecl("apply", ["check", "p"], [ret(call("check"))]))).toEqual([]);
  });
  test("a nested function declaration shadows (hoisted in its block)", () => {
    expect(free(fnDecl("allowed", ["p"], [ret(call("check")), fnDecl("check", ["x"], [])]))).toEqual([]);
  });
  test("a lambda parameter shadows inside the lambda only", () => {
    const body = [constDecl("run", lambda(["check"], [ret(call("check"))])), ret(call("check"))];
    expect(free(fnDecl("allowed", ["p"], body))).toEqual(["check"]);
  });
  test("DUAL: a shadow in a sibling block does not reach the outer call", () => {
    const body = [ifStmt([constDecl("check", lambda(["x"], [])), ret(call("check"))]), ret(call("check"))];
    expect(free(fnDecl("allowed", ["p"], body))).toEqual(["check"]);
  });
  test("DUAL: a call BEFORE a same-block const reads the outer name (sequentialLocals)", () => {
    const body = [constDecl("r", call("check")), constDecl("check", lambda(["x"], [])), ret(call("check"))];
    expect(free(fnDecl("allowed", ["p"], body))).toEqual(["check"]);
  });
  test("DUAL: a const's own initializer reads the outer name", () => {
    expect(free(fnDecl("allowed", ["p"], [constDecl("check", call("check"))]))).toEqual(["check"]);
  });
  test("DUAL: a closure declared before an inner-block shadow reads the outer name", () => {
    const body = [constDecl("f", lambda([], [ret(call("check"))])), ifStmt([constDecl("check", lambda([], []))]), ret(call("f"))];
    expect(free(fnDecl("allowed", ["p"], body))).toEqual(["check"]);
  });
  test("a local's initializer is still walked — a shadow arrow that calls another name", () => {
    expect(free(fnDecl("allowed", ["p"], [constDecl("check", lambda(["x"], [ret(call("isOk"))])), ret(call("check"))]))).toEqual(["isOk"]);
  });
  test("an unmodelled binder (a destructuring pattern) leaves the name FREE — the fail-closed direction", () => {
    const body = [{ kind: "const-decl", name: "{ check }", initExpr: { kind: "ident", name: "o" } }, ret(call("check"))];
    expect(free(fnDecl("allowed", ["p"], body))).toEqual(["check"]);
  });
  test("the guarded walk stops at a nested function's body", () => {
    expect(free(fnDecl("outer", [], [fnDecl("inner", [], [ret(call("isOk"))]), ret(call("inner"))]), true)).toEqual([]);
    expect(free(fnDecl("outer", [], [fnDecl("inner", [], [ret(call("isOk"))]), ret(call("inner"))]), false)).toEqual(["isOk"]);
  });
  test("a parameter default is not part of the body walk", () => {
    const fn = { kind: "function-decl", name: "f", params: [{ name: "a", defaultExpr: call("isOk") }], body: [] };
    expect(free(fn)).toEqual([]);
  });
  test("locallyBoundOnlyCalleeNames — a name with any free call is not local-only", () => {
    const shadowOnly = fnDecl("allowed", ["p"], [constDecl("check", lambda(["x"], [])), ret(call("check"))]);
    expect([...locallyBoundOnlyCalleeNames(shadowOnly)]).toEqual(["check"]);
    const both = fnDecl("allowed", ["p"], [ifStmt([constDecl("check", lambda(["x"], [])), ret(call("check"))]), ret(call("check"))]);
    expect([...locallyBoundOnlyCalleeNames(both)]).toEqual([]);
  });
});

describe("computeAsyncFnNames — the colouring reads the resolved callees", () => {
  const server = new Set(["check"]);
  test("a helper whose only `check` call is a local shadow is sync", () => {
    const allowed = fnDecl("allowed", ["p"], [constDecl("check", lambda(["x"], [])), ret(call("check"))]);
    expect([...computeAsyncFnNames([allowed], null, new Set(), null, null, server)]).toEqual([]);
  });
  test("DUAL: a sibling-block shadow keeps the outer call's colour", () => {
    const allowed = fnDecl("allowed", ["p"], [ifStmt([constDecl("check", lambda(["x"], [])), ret(call("check"))]), ret(call("check"))]);
    expect([...computeAsyncFnNames([allowed], null, new Set(), null, null, server)]).toEqual(["allowed"]);
  });
  test("DUAL: a caller of a coloured helper is coloured transitively", () => {
    const allowed = fnDecl("allowed", ["p"], [ret(call("check"))]);
    const login = fnDecl("login", ["p"], [constDecl("check", lambda([], [])), ret(call("allowed"))]);
    expect([...computeAsyncFnNames([allowed, login], null, new Set(), null, null, server)].sort()).toEqual(["allowed", "login"]);
  });
  test("a local named like an async PEER does not colour", () => {
    const peer = fnDecl("verify2", ["p"], [ret(call("check"))]);
    const allowed = fnDecl("allowed", ["p"], [constDecl("verify2", lambda(["x"], [])), ret(call("verify2"))]);
    expect([...computeAsyncFnNames([peer, allowed], null, new Set(), null, null, server)]).toEqual(["verify2"]);
  });
  test("guarded (library) walk: a directly-called nested helper's FREE callees count, its own shadows do not", () => {
    const viaNested = fnDecl("outer", ["p"], [fnDecl("inner", ["q"], [ret(call("check"))]), ret(call("inner"))]);
    expect([...computeAsyncFnNames([viaNested], null, new Set(["check"]), null, null, null, true)].sort()).toEqual(["check", "outer"]);
    const shadowedInNested = fnDecl("outer", ["p"], [fnDecl("inner", ["q"], [constDecl("check", lambda([], [])), ret(call("check"))]), ret(call("inner"))]);
    expect([...computeAsyncFnNames([shadowedInNested], null, new Set(["check"]), null, null, null, true)]).toEqual(["check"]);
    // a nested helper declared inside the reached helper is still followed by name
    const twoDeep = fnDecl("outer", [], [fnDecl("a", [], [fnDecl("b", [], [ret(call("check"))]), ret(call("b"))]), ret(call("a"))]);
    expect([...computeAsyncFnNames([twoDeep], null, new Set(["check"]), null, null, null, true)].sort()).toEqual(["check", "outer"]);
  });
});

// ---------------------------------------------------------------------------
// (2) end to end — fullstack client, library, tool
// ---------------------------------------------------------------------------
function compileFiles(files, mode) {
  const dir = resolve(tmpdir(), `scrml-s470-colour-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const [name, src] of Object.entries(files)) {
    const p = resolve(dir, name);
    writeFileSync(p, src);
    paths.push(p);
  }
  try {
    const result = compileScrml({ inputFiles: paths, write: false, outputDir: resolve(dir, "out"), log: () => {}, ...(mode ? { mode } : {}) });
    const errs = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    const outs = [...(result.outputs?.values?.() ?? [])];
    const o = outs[0] ?? {};
    return { codes: errs.map((e) => e.code), clientJs: o.clientJs ?? "", libraryJs: o.libraryJs ?? "", toolJs: o.toolJs ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fullstack = (helper, gate = "${allowed(@pw)}") => `<pw> = ""
\${
    server function check(p) { return p == "secret" }
    ${helper}
    function login(p) { @pw = p }
}
<button onclick=login("wrong")>go</button>
<p><span if=${gate}>LOGGED IN</span></p>
`;

describe("fullstack — the client colouring", () => {
  test("a shadowing helper is emitted sync, unawaited, and is accepted in a render gate", () => {
    const r = compileFiles({ "app.scrml": fullstack(`function allowed(p) {
        const check = (x) => x == "secret"
        return check(p)
    }`) });
    expect(r.codes).toEqual([]);
    expect(r.clientJs).toMatch(/(^|\n)function _scrml_allowed_\d+\(p\)/);
    expect(r.clientJs).not.toMatch(/await check\(/);
  });
  test("DUAL: the sibling-block shadow keeps the helper async — the render gate is refused", () => {
    const r = compileFiles({ "app.scrml": fullstack(`function allowed(p) {
        if (p == "") {
            const check = (x) => true
            return check(p)
        }
        return check(p) ? true : false
    }`) });
    expect(r.codes).toContain("E-VALUE-SERVER-CALL");
  });
  test("DUAL: a call before the shadow keeps the helper async", () => {
    const r = compileFiles({ "app.scrml": fullstack(`function allowed(p) {
        const r = check(p) ? true : false
        if (p != "") {
            const check = (x) => true
            const z = check(p)
        }
        return r
    }`) });
    expect(r.codes).toContain("E-VALUE-SERVER-CALL");
  });
});

describe("library and tool", () => {
  const lib = (helper) => `import { hmac } from "scrml:crypto"
\${
    function check(p) { const h = hmac("k", p)
        return p == "secret" && h != "" }
    ${helper}
    export function login(p) { return allowed(p) ? "LOGGED IN" : "rejected" }
}
`;
  test("library: a shadowing helper's export stays sync", () => {
    const r = compileFiles({ "app.scrml": lib(`export function allowed(p) {
        const check = (x) => x == "secret"
        return check(p)
    }`) }, "library");
    expect(r.codes).toEqual([]);
    expect(r.libraryJs).toMatch(/export function allowed\(p\)/);
    expect(r.libraryJs).toMatch(/export function login\(p\)/);
  });
  test("library DUAL: a nested-helper shadow does not reach the outer call", () => {
    const r = compileFiles({ "app.scrml": lib(`export function allowed(p) {
        function other(q) {
            const check = (x) => true
            return check(q)
        }
        return check(p) ? true : false
    }`) }, "library");
    expect(r.codes).toEqual([]);
    expect(r.libraryJs).toMatch(/export async function allowed\(p\)/);
    expect(r.libraryJs).toMatch(/await check\(p\)/);
  });
  const tool = (fns) => `<program kind="tool">
import { hmac } from "scrml:crypto"
\${
    function check(p) { const h = hmac("k", p)
        return p == "secret" && h != "" }
    ${fns}
    function main(args) { log(allowed(args[0]) ? "LOGGED IN" : "rejected") }
}
</program>
`;
  test("tool (FAIL on base): another function's local no longer hides the async call from its await", () => {
    const r = compileFiles({ "app.scrml": tool(`function other(q) {
        const check = (x) => true
        return check(q)
    }
    function allowed(p) { return check(p) ? true : false }`) });
    expect(r.codes).toEqual([]);
    expect(r.toolJs).toMatch(/async function allowed\(p\) \{\n\s*return await check\(p\) \? true : false;/);
    expect(r.toolJs).toMatch(/(^|\n)function other\(q\)/);
  });
  test("tool: a nested-function shadow leaves the helper sync and unawaited", () => {
    const r = compileFiles({ "app.scrml": tool(`function allowed(p) {
        function check(x) { return x == "secret" }
        return check(p)
    }`) });
    expect(r.codes).toEqual([]);
    expect(r.toolJs).toMatch(/(^|\n)function allowed\(p\)/);
    expect(r.toolJs).not.toMatch(/await check\(p\)/);
  });
});
