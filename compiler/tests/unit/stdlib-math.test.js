/**
 * stdlib-math — unit tests for scrml:math (DD1 Fork 1, 1A; the S469 §41.18 API, shipped S472)
 *
 * Two surfaces:
 *   §A  Behavioral — import the real runtime shim (compiler/runtime/stdlib/math.js)
 *       and exercise every exported function. The shim is impl#1's sanctioned host
 *       Math.* / Number.* touch; these tests pin its behavior to SPEC §41.18.
 *   §B  Compile-level — an adopter `import { round } from 'scrml:math'` used in a
 *       pure `fn` AND a `function` compiles clean (no E-FN-003 / E-FN-004) and
 *       the server-side output rewrites `scrml:math` → `./_scrml/math.js`.
 *
 * S472 (ruling:user-voice-scrml.md S472 "host function type, math API, remaining
 * review debt" items 2–3): the API is S469's — `round(x, mode: Rounding)` with a
 * REQUIRED mode, `floor` / `ceil` / `trunc` → int with the E-INT-CONVERSION-RT trap,
 * whole-string `parseInt(s, radix)` / `parseFloat` / `toNumber` → `T | not`,
 * two-argument `min` / `max`, and `minOf` / `maxOf` over a tape (`not` for an
 * empty one). The §A function set mirrors stdlib/math/index.scrml exports exactly
 * (the bootstrap's stdlib/math/host.js is pinned in
 * compiler/self-host-v2/slice-m4/math-port-s472.test.js).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { compileScrml } from "../../src/api.js";
import * as math from "../../runtime/stdlib/math.js";

// ---------------------------------------------------------------------------
// §A — behavioral (against the real shim)
// ---------------------------------------------------------------------------

const trapCode = (f) => {
  try {
    f();
    return null;
  } catch (e) {
    return e.code;
  }
};

describe("scrml:math — Rounding + round(x, mode)", () => {
  test("M1: the Rounding enum's unit variants are their names (impl#1's compiled enum shape)", () => {
    expect([math.Rounding.HalfEven, math.Rounding.HalfUp, math.Rounding.Floor, math.Rounding.Ceil, math.Rounding.Trunc])
      .toEqual(["HalfEven", "HalfUp", "Floor", "Ceil", "Trunc"]);
  });
  test("M1b: .HalfEven picks the even neighbour of a tie", () => {
    expect([math.round(2.5, "HalfEven"), math.round(-2.5, "HalfEven"), math.round(3.5, "HalfEven"), math.round(2.4, "HalfEven")]).toEqual([2, -2, 4, 2]);
  });
  test("M1c: .HalfUp goes away from zero (-2.5 → -3)", () => {
    expect([math.round(2.5, "HalfUp"), math.round(-2.5, "HalfUp"), math.round(2.4, "HalfUp")]).toEqual([3, -3, 2]);
  });
  test("M1d: the directed modes", () => {
    expect([math.round(-2.5, "Floor"), math.round(-2.5, "Ceil"), math.round(-2.5, "Trunc")]).toEqual([-3, -2, -2]);
  });
  test("M1e: the mode is REQUIRED — `round(x)` fails loudly, never a default", () => {
    expect(() => math.round(2.5)).toThrow(/mode is required/);
  });
});

describe("scrml:math — floor / ceil / trunc → int", () => {
  test("M2: floor toward -Infinity", () => {
    expect(math.floor(2.9)).toBe(2);
    expect(math.floor(-2.1)).toBe(-3);
  });
  test("M3: ceil toward +Infinity; trunc toward zero; -0 is the int 0", () => {
    expect(math.ceil(2.1)).toBe(3);
    expect(math.ceil(-2.9)).toBe(-2);
    expect(math.trunc(-2.9)).toBe(-2);
    expect(Object.is(math.trunc(-0.5), 0)).toBe(true);
  });
  test("M3b: NaN, ±Infinity or a result outside ±(2^53−1) is the E-INT-CONVERSION-RT trap", () => {
    for (const f of [math.floor, math.ceil, math.trunc, (x) => math.round(x, "HalfEven"), (x) => math.round(x, "HalfUp")]) {
      for (const x of [NaN, Infinity, -Infinity, 2 ** 53, 1e300]) expect(trapCode(() => f(x))).toBe("E-INT-CONVERSION-RT");
    }
  });
  test("M3c: the runtime shims' internal floor / ceil do NOT trap (auth.js / data.js / time.js keep their behaviour)", () => {
    expect(math.floorUnchecked(NaN)).toBeNaN();
    expect(math.ceilUnchecked(Infinity)).toBe(Infinity);
    expect(math.floorUnchecked(2.9)).toBe(2);
  });
});

describe("scrml:math — abs", () => {
  test("M4: negative → positive", () => {
    expect(math.abs(-5)).toBe(5);
  });
  test("M5: positive passthrough; zero", () => {
    expect(math.abs(5)).toBe(5);
    expect(math.abs(0)).toBe(0);
  });
});

describe("scrml:math — min / max (two numbers), minOf / maxOf (a tape)", () => {
  test("M6: two-arg pairwise", () => {
    expect(math.min(10, 4)).toBe(4);
    expect(math.max(10, 4)).toBe(10);
  });
  test("M7: min / max take two numbers — a third is not read", () => {
    expect(math.min(3, 1, -9)).toBe(1);
    expect(math.max(3, 1, 99)).toBe(3);
  });
  test("M8: minOf / maxOf over a tape; `not` (null) for an empty tape", () => {
    expect(math.minOf([5, 2, 8])).toBe(2);
    expect(math.maxOf([5, 2, 8])).toBe(8);
    expect(math.minOf([])).toBe(null);
    expect(math.maxOf([])).toBe(null);
  });
});

describe("scrml:math — clamp", () => {
  test("M9: in-range passthrough", () => {
    expect(math.clamp(5, 0, 10)).toBe(5);
  });
  test("M10: below floor", () => {
    expect(math.clamp(-3, 0, 10)).toBe(0);
  });
  test("M11: above ceiling", () => {
    expect(math.clamp(99, 0, 10)).toBe(10);
  });
});

describe("scrml:math — parseInt(s, radix): the WHOLE string → int | not", () => {
  test("M12: base 10 and base 16, either letter case", () => {
    expect(math.parseInt("42", 10)).toBe(42);
    expect(math.parseInt("ff", 16)).toBe(255);
    expect(math.parseInt("FF", 16)).toBe(255);
    expect(math.parseInt("-1010", 2)).toBe(-10);
  });
  test("M13: no `0x` prefix, no trimming, no `+`, no trailing text", () => {
    for (const s of ["0xFF", " 10", "+1", "10px", "", "-"]) expect(math.parseInt(s, 16)).toBe(null);
  });
  test("M14: a digit outside the radix, a radix outside 2–36, a value past 2^53−1 → not", () => {
    expect(math.parseInt("2", 2)).toBe(null);
    expect(math.parseInt("1", 37)).toBe(null);
    expect(math.parseInt("9007199254740992", 10)).toBe(null);
    expect(math.parseInt("9007199254740991", 10)).toBe(9007199254740991);
  });
  test("M15: ASCII digits only (no case-mapped look-alike)", () => {
    expect(math.parseInt("K", 36)).toBe(null);
  });
  test("M16: no implicit-octal surprise on leading zero", () => {
    expect(math.parseInt("010", 10)).toBe(10);
  });
});

describe("scrml:math — parseFloat / toNumber: the whole string → number | not (as number.parse)", () => {
  test("M17: decimal and exponent", () => {
    expect(math.parseFloat("3.14")).toBe(3.14);
    expect(math.parseFloat("-1e3")).toBe(-1000);
  });
  test("M18: a trailing unit is `not` (no leading-prefix parse)", () => {
    expect(math.parseFloat("1.5kg")).toBe(null);
  });
  test("M19: non-numeric → not", () => {
    expect(math.parseFloat("abc")).toBe(null);
  });
  test("M20: toNumber reads the same way", () => {
    expect(math.toNumber("42")).toBe(42);
    expect(math.toNumber("3.14")).toBe(3.14);
  });
  test("M21: `toNumber(\"\")` is not (S440 dpa-037 Call 4)", () => {
    expect(math.toNumber("")).toBe(null);
  });
  test("M22: non-numeric / non-finite → not", () => {
    expect(math.toNumber("abc")).toBe(null);
    expect(math.toNumber("1e400")).toBe(null);
  });
});

describe("scrml:math — isNaN (Number.isNaN, no coercion)", () => {
  test("M23: NaN value → true", () => {
    expect(math.isNaN(NaN)).toBe(true);
  });
  test("M24: real number → false", () => {
    expect(math.isNaN(42)).toBe(false);
  });
  test("M25: numeric string is NOT coerced → false", () => {
    expect(math.isNaN("42")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §B — compile-level (adopter import + pure-fn callability + shim rewrite)
// ---------------------------------------------------------------------------

let TMP;
beforeAll(() => {
  TMP = mkdtempSync(join(tmpdir(), "stdlib-math-"));
});
afterAll(() => {
  if (TMP && existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

function fx(relPath, source) {
  const abs = join(TMP, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, source);
  return abs;
}

describe("§B: scrml:math compile-level", () => {
  test("M26: round() inside a pure `fn` body compiles clean — no E-FN-003 / E-FN-004", () => {
    const src = fx("m26/app.scrml", [
      "${",
      "    import { round, Rounding, abs } from 'scrml:math'",
      "    fn netCents(dollars) {",
      "        return round(abs(dollars) * 100, .HalfUp)",
      "    }",
      "    server function _use() { return netCents(1.255) }",
      "}",
      'h1 "math in pure fn"',
    ].join("\n"));

    const result = compileScrml({
      inputFiles: [src],
      outputDir: join(TMP, "m26", "dist"),
      write: true,
      log: () => {},
    });

    expect(result.errors).toEqual([]);
    const fnErrs = (result.errors || []).filter(
      (e) => e.code === "E-FN-003" || e.code === "E-FN-004",
    );
    expect(fnErrs).toEqual([]);
  });

  test("M27: clamp() inside a `function` (event-handler-class) body compiles clean", () => {
    const src = fx("m27/app.scrml", [
      "${",
      "    import { clamp } from 'scrml:math'",
      "    function _bound(x) {",
      "        return clamp(x, 0, 10)",
      "    }",
      "    server function _use() { return _bound(5) }",
      "}",
      'h1 "math in function"',
    ].join("\n"));

    const result = compileScrml({
      inputFiles: [src],
      outputDir: join(TMP, "m27", "dist"),
      write: true,
      log: () => {},
    });
    expect(result.errors).toEqual([]);
  });

  test("M28: server-side output rewrites scrml:math → ./_scrml/math.js + shim copied", () => {
    const outDir = join(TMP, "m28", "dist");
    const src = fx("m28/app.scrml", [
      "${",
      "    import { parseInt, toNumber } from 'scrml:math'",
      "    server function _coerce(s) {",
      "        return parseInt(s, 10) + toNumber(s)",
      "    }",
      "}",
      'h1 "math shim rewrite"',
    ].join("\n"));

    const result = compileScrml({
      inputFiles: [src],
      outputDir: outDir,
      write: true,
      log: () => {},
    });

    expect(result.errors).toEqual([]);
    expect(existsSync(join(outDir, "_scrml", "math.js"))).toBe(true);

    const serverJs = readFileSync(join(outDir, "app.server.js"), "utf8");
    expect(serverJs).toContain('from "./_scrml/math.js"');
    expect(serverJs).not.toContain('from "scrml:math"');

    const missing = (result.warnings || []).filter(
      (w) => w.code === "W-STDLIB-SHIM-MISSING" && w.message.includes("scrml:math"),
    );
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §C — impl#1 keeps compiling the stdlib module itself (S472: the port must compile on BOTH
// implementations). stdlib/math/index.scrml — the §66 dialect, `import:host`, the S469 API —
// compiles clean on impl#1 in place (its `import:host` is admitted: the file is the compiler's own
// stdlib, compiler/src/host-import.js), in the default and the library mode.
// ---------------------------------------------------------------------------
describe("§C: impl#1 compiles stdlib/math/index.scrml itself", () => {
  const SRC = join(import.meta.dir, "..", "..", "..", "stdlib", "math", "index.scrml");
  for (const mode of [undefined, "library"]) {
    test(`M29: ${mode ?? "default"} mode — no error`, () => {
      const result = compileScrml({
        inputFiles: [SRC],
        outputDir: join(TMP, `m29-${mode ?? "default"}`, "dist"),
        write: true,
        log: () => {},
        ...(mode ? { mode } : {}),
      });
      expect((result.errors || []).map((e) => e.code)).toEqual([]);
    });
  }
});
