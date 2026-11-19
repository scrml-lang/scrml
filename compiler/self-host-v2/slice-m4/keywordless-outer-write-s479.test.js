// s479-binding-rulings r1 (review MED-1) — a write to a KEYWORDLESS binding from a nested scope is
// judged exactly as a write to the same binding written with `const`.
// SPEC §50.8.5: "A binding is `const` when it was created WITHOUT `let`. That covers both the explicit
// keyword form (`const x = 1`) and the keywordless bare naming statement (`x = 1`), which declares `x`
// exactly as `const x = 1` does." §50.10: "A binding created without `let` SHALL be a `const` binding."
// §7.6: "Variables declared in a file-level `${}` block are accessible to all subsequent markup and
// nested `${}` blocks within the same file." So `count = …` inside a function, where `count` is the
// file-scope keywordless binding, is a WRITE to it (E-ASSIGN-004) — not a second declaration of a
// dead local, which silently lost the update (base: no diagnostic; printed `const count_1 = …`).
import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const codes = (src) => {
  const r = frontEnd(mods, [{ path: "s.scrml", src }]);
  return [...(r.parseDiags || []), ...r.diags].filter((d) => d.severity === "Error").map((d) => d.code);
};

// each variant: a program written once with the outer binding keywordless (`d` = "") and once with
// `const` (`d` = "const "); `want` is the codes both must give
const V = [
  ["file scope, read-modify-write in a function (review reproducer 1)", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ ${d}count = 0; function inc() -> int { count = count + 1; return count; } }\n<p>\${count + inc()}</p>\n</program>\n`],
  ["file scope, written in a function a handler calls (review reproducer 2)", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ ${d}count = 0; function inc() { count = 5; } }\n<button onclick=inc()>x</button>\n<p>\${count}</p>\n</program>\n`],
  ["file scope, the function written BEFORE the declaring block", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ function inc() { count = 5; } }\n\${ ${d}count = 0; }\n<button onclick=inc()>x</button>\n<p>\${count}</p>\n</program>\n`],
  ["file scope, written in a loop body inside a function", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ ${d}total = 0; function f(xs: int[]) { for (it of xs) { total = total + it; } } }\n<button onclick=f([1])>x</button>\n<p>\${total}</p>\n</program>\n`],
  ["file scope, inside a `<page>`", ["E-ASSIGN-004"],
    (d) => `<program>\n<page>\n\${ ${d}count = 0; function inc() { count = 5; } }\n<button onclick=inc()>x</button>\n<p>\${count}</p>\n</page>\n</program>\n`],
  ["file scope, an inline handler", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ ${d}count = 0; }\n<button onclick=\${count = 5}>x</button>\n<p>\${count}</p>\n</program>\n`],
  ["file scope, an arrow handler body", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ ${d}count = 0; }\n<button onclick=\${() => { count = 5; }}>x</button>\n<p>\${count}</p>\n</program>\n`],
  ["file scope, the same block and a later block", ["E-ASSIGN-004"],
    (d) => `<program>\n\${ ${d}count = 0; if (count == 0) { count = 1; } }\n<p>\${count}</p>\n</program>\n`],
  ["function local, written in a nested block", ["E-ASSIGN-CONST"],
    (d) => `<program>\n\${ function f() -> int { ${d}x = 0; if (x == 0) { x = 1; } return x; } }\n<p>\${f()}</p>\n</program>\n`],
  ["function local, written in a loop body", ["E-ASSIGN-CONST"],
    (d) => `<program>\n\${ function f(xs: int[]) -> int { ${d}total = 0; for (it of xs) { total = total + it; } return total; } }\n<p>\${f([1, 2])}</p>\n</program>\n`],
  ["function local, written in a nested function", ["E-ASSIGN-CONST"],
    (d) => `<program>\n\${ function f() -> int { ${d}x = 0; function g() { x = 1; } g(); return x; } }\n<p>\${f()}</p>\n</program>\n`],
  ["a `let` in the function shadows it — legal", [],
    (d) => `<program>\n\${ ${d}count = 0; function f() -> int { let count = 1; count = 2; return count; } }\n<p>\${count + f()}</p>\n</program>\n`],
];

describe("§50.8.5 — a keywordless binding written from a nested scope is `const` there", () => {
  for (const [name, want, mk] of V) {
    test(name, () => {
      const k = codes(mk(""));
      expect(k).toEqual(codes(mk("const ")));
      expect([...new Set(k)].sort()).toEqual(want);
    });
  }

  test("the arrow body inside a function: E-ASSIGN-004 for both forms", () => {
    const mk = (d) => `<program>\n\${ ${d}count = 0; function mk() { const g = () => { count = 5; }; g(); } }\n<button onclick=mk()>x</button>\n<p>\${count}</p>\n</program>\n`;
    const k = codes(mk(""));
    expect(k).toEqual(codes(mk("const ")));
    expect(k).toContain("E-ASSIGN-004");
  });
});
