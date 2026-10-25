/**
 * s470-unit-variant-tag-read (SECURITY, impl#1) — a `.variant` VALUE read is the variant tag read.
 *
 * §51.3.2: a unit variant is its bare tag string (`"Gone"`), a payload variant `{ variant, data }`.
 * impl#1 emitted `x.variant` as a plain JS member read, so on a unit variant it read `undefined`:
 * `x.variant == "Gone"` was false where `x is .Gone` is true, and a "reject when Gone" gate logged a
 * wrong password in (lane B review, s470-lb4 b12 V2; same on main d582ae04f). The read now lowers to
 * `typeof x === "string" ? x : x.variant` (is-predicate-lowering.ts `lowerVariantTagRead`) — in the
 * structured emitter (emit-expr.ts `emitMember`) and, for text the structured emitter never sees, in
 * the last pass of both string pipelines (rewrite.ts `rewriteVariantTagReads`). A string receiver
 * yields itself; every other receiver keeps the exact JS member read (an error envelope, a struct with
 * a `variant` field of any type). A PLACE — an assignment / `++` / `delete` target, a method callee —
 * keeps the plain member. The wrong-password floor for every side is the security pack's r16 family.
 */
import { describe, test, expect } from "bun:test";
import { resolve } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { pathToFileURL } from "url";
import { compileScrml } from "../../src/api.js";
import { lowerVariantTagRead, lowerVariantCheck } from "../../src/codegen/is-predicate-lowering.ts";
import { rewriteVariantTagReads, rewriteIsOperator, rewriteExpr, rewriteServerExpr } from "../../src/codegen/rewrite.ts";
import { resetRefusedLowerings, drainRefusedLowerings } from "../../src/codegen/refused-lowering-errors.ts";

describe("lowerVariantTagRead — the one lowering", () => {
  test("a bare name is read in place; anything else is bound once", () => {
    expect(lowerVariantTagRead("x", true, false)).toBe(`(typeof x === "string" ? x : x.variant)`);
    expect(lowerVariantTagRead("f(p)", false, false)).toBe(
      `((__scrml_is_v) => typeof __scrml_is_v === "string" ? __scrml_is_v : __scrml_is_v.variant)(f(p))`,
    );
    expect(lowerVariantTagRead("x", true, true)).toBe(`(typeof x === "string" ? x : x?.variant)`);
  });

  test("it agrees with `is` for every receiver `is` can match, and keeps the JS read for the rest", () => {
    const read = (v) => (0, eval)(`(x) => ${lowerVariantTagRead("x", true, false)}`)(v);
    expect(read("Gone")).toBe("Gone"); // a unit variant
    expect(read({ variant: "Denied", data: { reason: "x" } })).toBe("Denied"); // a payload variant
    expect(read({ __scrml_error: true, type: "AuthErr", variant: "Gone", data: {} })).toBe("Gone"); // the error envelope
    expect(read({ variant: 1 })).toBe(1); // a struct's own field, any type
    expect(read({})).toBe(undefined);
    expect(read(5)).toBe(undefined);
    expect(() => read(null)).toThrow(); // a nullish receiver still throws, as `null.variant` does
    const opt = (0, eval)(`(x) => ${lowerVariantTagRead("x", true, true)}`);
    expect(opt(null)).toBe(undefined);
  });

  test("a side-effecting operand runs once", () => {
    let n = 0;
    const f = () => { n++; return "Gone"; };
    expect((0, eval)(`(f) => ${lowerVariantTagRead("f()", false, false)}`)(f)).toBe("Gone");
    expect(n).toBe(1);
  });
});

describe("rewriteVariantTagReads — the string-path twin", () => {
  test("lowers a read off a name, a call, a member chain, an index, a spaced token stream", () => {
    expect(rewriteVariantTagReads(`x.variant == "Gone"`)).toBe(`(typeof x === "string" ? x : x.variant) == "Gone"`);
    expect(rewriteVariantTagReads(`f(a, "b").variant`)).toBe(lowerVariantTagRead(`f(a, "b")`, false, false));
    expect(rewriteVariantTagReads(`r.err.variant`)).toBe(lowerVariantTagRead("r.err", false, false));
    expect(rewriteVariantTagReads(`t[0].variant`)).toBe(lowerVariantTagRead("t[0]", false, false));
    expect(rewriteVariantTagReads(`return v . variant`)).toBe(`return (typeof v === "string" ? v : v.variant)`);
    expect(rewriteVariantTagReads(`_scrml_reactive_get("st").variant`)).toBe(lowerVariantTagRead(`_scrml_reactive_get("st")`, false, false));
  });

  test("an optional chain stays optional", () => {
    expect(rewriteVariantTagReads(`x?.variant`)).toBe(`(typeof x === "string" ? x : x?.variant)`);
    expect(rewriteVariantTagReads(`a?.b.variant`)).toBe(lowerVariantTagRead("a?.b", false, true));
  });

  test("a place keeps the plain member", () => {
    for (const s of [`x.variant = "Gone"`, `x.variant += "a"`, `x.variant ??= "a"`, `x.variant++`, `x.variant--`,
      `++x.variant`, `delete x.variant`, `x.variant(1)`, "x.variant`t`", `x.variant?.()`, `new x.variant()`,
      // review F4 — a comment before the operator, an assignment pattern, a `for` head
      `x.variant /*c*/ = 1`, `[x.variant] = [1]`, `[s.variant, s.k] = [s.k, 1]`, `({ q: x.variant } = o)`,
      `for (x.variant of t) {}`, `for (x.variant in o) {}`]) {
      expect(rewriteVariantTagReads(s)).toBe(s);
    }
  });

  test("review F4 — the read side of a swap is still a read", () => {
    expect(rewriteVariantTagReads(`[s.variant, s.k] = [s.k, s.variant]`)).toBe(
      `[s.variant, s.k] = [s.k, (typeof s === "string" ? s : s.variant)]`,
    );
    expect(rewriteVariantTagReads(`x.variant in o`)).toBe(`(typeof x === "string" ? x : x.variant) in o`);
  });

  test("review F2 (text) — a declaration destructuring `variant` reads it off the tag-read source", () => {
    const src = `((__scrml_is_v) => typeof __scrml_is_v === "string" ? { variant: __scrml_is_v } : __scrml_is_v)`;
    expect(rewriteVariantTagReads(`const {variant} = _scrml_reactive_get("st"); x`)).toBe(
      `const {variant} = ${src}(_scrml_reactive_get("st")); x`,
    );
    expect(rewriteVariantTagReads(`let { variant: t, k } = f(a, b)\ny`)).toBe(`let { variant: t, k } = ${src}(f(a, b))\ny`);
    const once = rewriteVariantTagReads(`const { variant } = v;`);
    expect(rewriteVariantTagReads(once)).toBe(once);
    expect(rewriteVariantTagReads(`const o = { variant: 1 };`)).toBe(`const o = { variant: 1 };`);
  });

  test("review G1 — a text pattern naming `variant` anywhere it cannot be lowered is refused", () => {
    const refused = (s) => {
      resetRefusedLowerings();
      const out = rewriteVariantTagReads(s);
      return { out, codes: drainRefusedLowerings().map((e) => e.code) };
    };
    for (const s of [`const [{ variant }] = [x]`, `const [a, { variant }] = t`, `let [{ variant: v }] = t`,
      `const { a: [{ variant }] } = o`, `const [[{ variant }]] = t`, `const y = 1, { variant } = x`,
      `const { ["variant"]: v } = x`, `const { "variant": v } = x`, `const { 'variant': v } = x`,
      `const { e: { variant } } = r`, `for (const { variant } of xs) {}`, `const f = ({ variant }) => variant`]) {
      expect(refused(s).codes).toEqual(["E-CODEGEN-INVALID-LOGIC"]);
    }
    // not patterns, or no `variant` key: untouched, no refusal
    for (const s of [`const [a, variant] = t`, `const o = { "variant": 1 }`, `f({ variant: 1 })`, `const t = [{ variant: 1 }]`]) {
      expect(refused(s)).toEqual({ out: s, codes: [] });
    }
    // the lowerable form is lowered, not refused
    expect(refused(`const {variant} = x, y = 1`).codes).toEqual([]);
  });

  test("review F7 — `new X().variant` reads off the whole `new X()`", () => {
    expect(rewriteVariantTagReads(`new X().variant`)).toBe(lowerVariantTagRead("new X()", false, false));
  });

  test("review F3 — a literal-key read is the same read; a dynamic key is left", () => {
    expect(rewriteVariantTagReads(`x["variant"] == "Gone"`)).toBe(`(typeof x === "string" ? x : x.variant) == "Gone"`);
    expect(rewriteVariantTagReads(`x?.['variant']`)).toBe(`(typeof x === "string" ? x : x?.variant)`);
    expect(rewriteVariantTagReads(`f(p)["variant"]`)).toBe(lowerVariantTagRead("f(p)", false, false));
    expect(rewriteVariantTagReads(`x["variant"] = 1`)).toBe(`x["variant"] = 1`);
    expect(rewriteVariantTagReads(`x[k]`)).toBe(`x[k]`);
    expect(rewriteVariantTagReads(`x["variants"]`)).toBe(`x["variants"]`);
  });

  test("a comparison is not an assignment", () => {
    expect(rewriteVariantTagReads(`x.variant === "Gone"`)).toBe(`(typeof x === "string" ? x : x.variant) === "Gone"`);
    expect(rewriteVariantTagReads(`x.variant != y.variant`)).toBe(
      `(typeof x === "string" ? x : x.variant) != (typeof y === "string" ? y : y.variant)`,
    );
  });

  test("literal and comment text is not touched; a template interpolation is code", () => {
    expect(rewriteVariantTagReads(`"x.variant"`)).toBe(`"x.variant"`);
    expect(rewriteVariantTagReads(`// x.variant\ny`)).toBe(`// x.variant\ny`);
    expect(rewriteVariantTagReads("`a.variant ${x.variant}`")).toBe("`a.variant ${(typeof x === \"string\" ? x : x.variant)}`");
    expect(rewriteVariantTagReads(`f(")").variant`)).toBe(lowerVariantTagRead(`f(")")`, false, false));
  });

  test("other names and the compiler's own reads are left alone; a second run changes nothing", () => {
    expect(rewriteVariantTagReads(`AuthErr.variants.includes(t)`)).toBe(`AuthErr.variants.includes(t)`);
    expect(rewriteVariantTagReads(`x.variantName`)).toBe(`x.variantName`);
    const tmp = `(_scrml_match_4 != null && typeof _scrml_match_4 === "object") ? _scrml_match_4.variant : _scrml_match_4`;
    expect(rewriteVariantTagReads(tmp)).toBe(tmp);
    for (const s of [`x.variant == "Gone"`, `f(p).variant`, `a?.b.variant`]) {
      const once = rewriteVariantTagReads(s);
      expect(rewriteVariantTagReads(once)).toBe(once);
    }
  });

  test("the `is .V` lowering's own reads are not lowered again", () => {
    const check = lowerVariantCheck("v", `"On"`);
    expect(rewriteVariantTagReads(check)).toBe(check);
  });

  test("it is the last pass of both pipelines", () => {
    expect(rewriteExpr(`x.variant == "Gone"`)).toContain(`(typeof x === "string" ? x : x.variant)`);
    expect(rewriteServerExpr(`x.variant == "Gone"`)).toContain(`(typeof x === "string" ? x : x.variant)`);
  });
});

describe("rewriteIsOperator — `x is .V` in text is tag-normalized (a payload variant matches)", () => {
  test("a readable operand takes lowerVariantCheck, not `=== \"V\"`", () => {
    expect(rewriteIsOperator(`x is .Denied ? 1 : 2`)).toBe(`${lowerVariantCheck("x", `"Denied"`)} ? 1 : 2`);
    expect(rewriteIsOperator(`f(a) is AuthErr.Gone`)).toBe(lowerVariantCheck("f(a)", `"Gone"`));
    expect(rewriteIsOperator(`r.err is . Gone`)).toBe(lowerVariantCheck("r.err", `"Gone"`));
  });
  test("it matches both representations at run time", () => {
    const t = (0, eval)(`(x) => ${rewriteIsOperator("x is .Denied")}`);
    expect(t({ variant: "Denied", data: {} })).toBe(true);
    expect(t("Denied")).toBe(true);
    expect(t("Gone")).toBe(false);
  });
  test("review F7 — `new X()` is one operand; a comment before `is` is whitespace", () => {
    expect(rewriteIsOperator(`new X() is .Denied`)).toBe(lowerVariantCheck("new X()", `"Denied"`));
    expect(rewriteIsOperator(`x /* c */ is .Denied`)).toBe(lowerVariantCheck("x", `"Denied"`));
  });

  test("literal text and `is not` / `is null` are left to the existing rules", () => {
    expect(rewriteIsOperator(`"x is .Denied"`)).toContain(`"x`);
    expect(rewriteIsOperator(`x is null`)).toBe(`x === null`);
  });
});

function compileLibrary(src) {
  const dir = resolve(tmpdir(), `scrml-s470-vtag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const p = resolve(dir, "lib.scrml");
  writeFileSync(p, src);
  const r = compileScrml({ inputFiles: [p], write: false, outputDir: resolve(dir, "out"), log: () => {}, mode: "library" });
  const out = [...r.outputs.values()][0] ?? {};
  return { dir, errors: (r.errors ?? []).filter((e) => e.severity !== "warning"), js: out.libraryJs ?? "" };
}

async function run(src, fn, args) {
  const { dir, errors, js } = compileLibrary(src);
  try {
    expect(errors.map((e) => e.code)).toEqual([]);
    const f = resolve(dir, "lib.mjs");
    writeFileSync(f, js);
    const mod = await import(pathToFileURL(f).href);
    return { js, value: mod[fn](...args) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const LIB = (body) => `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function mkG(p) -> AuthErr {
        if (p != "secret") return AuthErr::Gone
        return AuthErr::Denied("ok")
    }
    export function gate(p) {
        ${body}
    }
}
`;

describe("compiled: `.variant` agrees with `is` (library mode, executed)", () => {
  const cases = [
    ["a typed local", `const x: AuthErr = mkG(p)\n        return x.variant`],
    ["a call read directly", `return mkG(p).variant`],
    ["an object field", `const r = { err: mkG(p) }\n        return r.err.variant`],
    ["a tape element", `const t = [mkG(p)]\n        return t[0].variant`],
    ["an optional chain", `const x = mkG(p)\n        return x?.variant`],
    ["a template literal", "const x = mkG(p)\n        return `${x.variant}`"],
    ["a block-bodied function value", `const f = (v) => { return v.variant }\n        return f(mkG(p))`],
    ["a function expression value", `const f = function(v) { return v.variant }\n        return f(mkG(p))`],
    ["an expression-arrow callback", `return [mkG(p)].map((v) => v.variant)[0]`],
  ];
  for (const [name, body] of cases) {
    test(name, async () => {
      expect((await run(LIB(body), "gate", ["wrong"])).value).toBe("Gone");
      expect((await run(LIB(body), "gate", ["secret"])).value).toBe("Denied");
    });
  }

  test("a struct-like object's own `variant` field is read and written as a plain property", async () => {
    const body = `const s = { variant: 1 }\n        s.variant = s.variant + 1\n        s.variant++\n        return s.variant`;
    const { js, value } = await run(LIB(body), "gate", ["x"]);
    expect(value).toBe(3);
    expect(js).toContain("s.variant = ");
  });

  test("a `match` arm value `x is .Denied` matches a payload variant (text-lowered arm)", async () => {
    const src = `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function mkD(p) -> AuthErr {
        if (p != "secret") return AuthErr::Denied("bad")
        return AuthErr::Gone
    }
    export function gate(p) {
        const x = mkD(p)
        const q: string = p
        return match q { "zz" :> "z", else :> x is .Denied ? "rejected" : "ok" }
    }
}
`;
    expect((await run(src, "gate", ["wrong"])).value).toBe("rejected");
    expect((await run(src, "gate", ["secret"])).value).toBe("ok");
  });

  const DESTRUCTURE = [
    ["review F2 — `const { variant } = …`", `const { variant } = mkG(p)\n        return variant`],
    ["review F2 — a renamed key", `const { variant: tag } = mkG(p)\n        return tag`],
    ["review F2 — `let` with a default", `let { variant = "none" } = mkG(p)\n        return variant`],
    ["review F2 — a nested key", `const { e: { variant } } = { e: mkG(p) }\n        return variant`],
    ["review F3 — a literal key", `const x = mkG(p)\n        return x["variant"]`],
    ["review F3 — an optional literal key", `const x = mkG(p)\n        return x?.["variant"]`],
  ];
  for (const [name, body] of DESTRUCTURE) {
    test(name, async () => {
      expect((await run(LIB(body), "gate", ["wrong"])).value).toBe("Gone");
      expect((await run(LIB(body), "gate", ["secret"])).value).toBe("Denied");
    });
  }

  test("review G2 — the destructuring temporaries are deterministic: the same file compiled twice in one process", () => {
    const src = LIB(`const { variant } = mkG(p)\n        const r = { e: mkG(p) }\n        const { e: { variant: v2 } } = r\n        return variant + v2`);
    const a = compileLibrary(src);
    const b = compileLibrary(src);
    try {
      expect(a.js).toContain("__scrml_dv_");
      expect(b.js).toBe(a.js);
    } finally {
      rmSync(a.dir, { recursive: true, force: true });
      rmSync(b.dir, { recursive: true, force: true });
    }
  });

  test("review F2 — a `variant` key in a parameter pattern is refused, not miscompiled", () => {
    const { errors } = compileLibrary(LIB(`function f({ variant }) { return variant }\n        return f(mkG(p))`));
    expect(errors.map((e) => e.code)).toContain("E-CODEGEN-INVALID-LOGIC");
  });

  test("review F6 — `x is AuthErr.Denied` matches a payload variant", async () => {
    const src = `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function mkD(p) -> AuthErr {
        if (p != "secret") return AuthErr::Denied("bad")
        return AuthErr::Gone
    }
    export function gate(p) {
        const x = mkD(p)
        return x is AuthErr.Denied ? "rejected" : "ok"
    }
}
`;
    expect((await run(src, "gate", ["wrong"])).value).toBe("rejected");
    expect((await run(src, "gate", ["secret"])).value).toBe("ok");
  });

  test("review F4 — a swap through an assignment pattern still compiles and swaps", async () => {
    const body = `const s = { variant: "a", k: "b" }\n        ;[s.variant, s.k] = [s.k, s.variant]\n        return s.variant + s.k`;
    expect((await run(LIB(body), "gate", ["x"])).value).toBe("ba");
  });

  test("the error envelope's `.variant` still reads its tag", async () => {
    const src = `\${
    type AuthErr:enum = { Denied(reason: string), Gone }
    function wrapG(p)! -> AuthErr {
        if (p != "secret") fail AuthErr::Gone
        return true
    }
    export function gate(p) {
        return wrapG(p) !{ _ e :> e.variant }
    }
}
`;
    expect((await run(src, "gate", ["wrong"])).value).toBe("Gone");
  });
});

describe("compiled: review F1 — an `<each>` row's `.variant` read is the tag read", () => {
  test("`${r.e.variant}` / `@.e.variant` / a row `if=` emit the lowering, never a plain `.variant`", () => {
    const dir = resolve(tmpdir(), `scrml-s470-vtag-each-${Date.now().toString(36)}`);
    mkdirSync(dir, { recursive: true });
    const p = resolve(dir, "app.scrml");
    writeFileSync(p, `\${\n    type E:enum = { A(n: number), B }\n}\n<xs> = [{ id: 1, e: E::B }]\n<each in=@xs key=@.id as r><span if=\${r.e.variant != "B"}>\${r.e.variant}</span><b>\${@.e.variant}</b></each>\n`);
    try {
      const r = compileScrml({ inputFiles: [p], write: false, outputDir: resolve(dir, "out"), log: () => {} });
      expect((r.errors ?? []).filter((e) => e.severity !== "warning").map((e) => e.code)).toEqual([]);
      const js = [...r.outputs.values()][0]?.clientJs ?? "";
      expect(js).toContain("__scrml_is_v.variant)(");
      expect(js).not.toMatch(/\br\.e\.variant\b/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("compiled: a markup interpolation's `.variant` read is not also emitted at file scope", () => {
  test("`${@phase.variant}` is consumed by the render wiring only (the pure-read orphan filter)", () => {
    const dir = resolve(tmpdir(), `scrml-s470-vtag-orphan-${Date.now().toString(36)}`);
    mkdirSync(dir, { recursive: true });
    const p = resolve(dir, "app.scrml");
    writeFileSync(p, `\${\n    type Ph:enum = { Idle, Busy }\n}\n<ph>: Ph = .Idle\n<p>\${@ph.variant}</p>\n`);
    try {
      const r = compileScrml({ inputFiles: [p], write: false, outputDir: resolve(dir, "out"), log: () => {} });
      const js = [...r.outputs.values()][0]?.clientJs ?? "";
      const reads = js.split("\n").filter((l) => l.includes("__scrml_is_v.variant"));
      expect(reads.length).toBeGreaterThan(0);
      // every lowered read sits inside the render wiring, none as a bare top-level statement
      expect(reads.filter((l) => /^\(\(__scrml_is_v\)/.test(l.trim()))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
