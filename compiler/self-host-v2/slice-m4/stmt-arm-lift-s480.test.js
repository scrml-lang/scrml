// stmt-arm-lift-s480.test.js — s480-runtime item 17 (g-bootstrap-loop-value-form-residue-s469, the
// statement-arm `lift` bullet).
//
// Ruling (user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off §3.B", item 17):
//   "**g-bootstrap-loop-value-form-residue-s469** — Rec: INTERIM refusal lifted by building §49.6 rule 7
//    (a statement-arm `lift` goes to the nearest bound loop)."
// SPEC §49.6 rule 7: "A `lift` goes to the **nearest enclosing bound loop** — through any statement loops,
//   `if`s, `match` arms and `!{}` arms in between. A nested `for-binding` captures its own lifts; they do
//   not reach the outer loop."
// SPEC §18.5: "In a STATEMENT position a block arm yields nothing and needs no `lift`." — a VALUE-position
//   arm's `lift` stays the arm's value (unchanged, pinned below).
//
// RED ON BASE: every runtime test — base refused a `lift` in a statement-position arm block with
// E-BOOTSTRAP-UNSUPPORTED.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => [...new Set(run(src).diags.map((d) => d.code))].sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
let k = 0;

const T = `    type E:enum = { A, B, C }\n    type BadError:enum = { Bad }`;
// `f(ys, e)` over `[3, 4, 5]`; its result, shown as text in `#o`
const prog = (body, ret = "string", extra = "") => `<program>
${T}
    <zs:int[]=([3, 4, 5])/>
${extra}    function f(ys: int[], e: E) -> ${ret} {
${body}
    }
    <main>
        <p id="o">\${f(@zs, E.A)}</p>
        <p id="b">\${f(@zs, E.B)}</p>
    </main>
</program>
`;
const shows = async (body, a, b, extra = "") => {
  await loadProgram(clean(prog(body, "string", extra)).core, "s480sal-" + k++, []);
  expect($("#o").textContent).toBe(a);
  expect($("#b").textContent).toBe(b);
};
const txt = `return xs.map(v => \`\${v}\`).join(",");`;

describe("§49.6 rule 7 — a statement-position arm's `lift` goes to the nearest bound loop (runtime)", () => {
  test("a statement `match` arm block's LAST-statement `lift`, and a `lift` before it", async () => {
    await shows(`        const xs = for (y of ys) {
            match e {
                .A :> { lift y; lift 0; },
                .B :> { lift y * 10; },
                .C :> { }
            }
        };
        ${txt}`, "3,0,4,0,5,0", "30,40,50");
  });

  test("a `match` on a value inside the loop (per iteration), arms that lift and arms that do not", async () => {
    await shows(`        const xs = for (y of ys) {
            match y {
                3 :> { lift 1; },
                5 :> { lift y; },
                else :> { }
            }
        };
        ${txt}`, "1,5", "1,5");
  });

  test("through an `if` and a statement loop inside the arm", async () => {
    await shows(`        const xs = for (y of ys) {
            match e {
                .A :> {
                    if (y > 3) { lift y; }
                    for (i of 0..2) { lift i; }
                },
                .B :> { },
                .C :> { }
            }
        };
        ${txt}`, "0,1,4,0,1,5,0,1", "");
  });

  test("a statement `!{}` arm block's `lift` goes to the loop; the success path lifts after it", async () => {
    const extra = `    function g(n: int)! BadError {\n        if (n == 4) fail .Bad;\n        return n;\n    }\n`;
    await shows(`        const xs = for (y of ys) {
            g(y) !{ .Bad :> { lift 99; } };
            lift y;
        };
        ${txt}`, "3,99,4,5", "3,99,4,5", extra);
  });

  test("a nested bound loop inside the arm captures its own lifts (rule 7, second sentence)", async () => {
    await shows(`        const xs = for (y of ys) {
            match e {
                .A :> {
                    const inner = for (i of 0..2) { lift i + y; };
                    lift inner.length;
                },
                .B :> { lift 7; },
                .C :> { }
            }
        };
        ${txt}`, "2,2,2", "7,7,7");
  });

  test("the binder is typed by its arm lifts: `.length` reads it, and a written element type checks them (E-TYPE-031)", async () => {
    await shows(`        const xs = for (y of ys) {
            match e {
                .A :> { lift y; lift 0; },
                .B :> { },
                .C :> { }
            }
        };
        return \`\${xs.length}\`;`, "6", "0");
    expect(codes(prog(`        const xs: string[] = for (y of ys) {
            match e {
                .A :> { lift y; },
                .B :> { },
                .C :> { }
            }
        };
        return xs.join(",");`))).toEqual(["E-TYPE-031"]);
  });

  test("E-LOOP-007 counts a lift reached only through a statement arm", () => {
    expect(codes(prog(`        const xs = for (y of ys) {
            match e {
                .A :> { lift y; },
                .B :> { },
                .C :> { }
            }
        };
        ${txt}`))).toEqual([]);
  });
});

describe("unchanged — what rule 7 does not reach", () => {
  test("a VALUE-position arm block's `lift` is the arm's value (§18.5), not a loop lift", async () => {
    await shows(`        const xs = for (y of ys) {
            const v = match e {
                .A :> { lift y + 1; },
                .B :> { lift 0; },
                .C :> { lift 0; }
            };
            lift v;
        };
        ${txt}`, "4,5,6", "0,0,0");
  });

  test("a statement-arm `lift` with no bound loop around it is refused by name", () => {
    const src = prog(`        match e {
            .A :> { lift 1; },
            .B :> { },
            .C :> { }
        }
        return "x";`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("nearest enclosing bound loop");
  });

  test("INTERIM — a Tier-0 `${ for … }` loop's statement-arm `lift` is still refused by name (its rows are not read)", () => {
    const src = `<program>\n    type E:enum = { A, B }\n    <zs:int[]=([3, 4, 5])/>\n    <e:E=(E.A)/>\n    <main>\n        <ul>\${ for (y of @zs) { match @e { .A :> { lift <li>\${y}</li>; }, .B :> { lift <b>\${y}</b>; } } } }</ul>\n    </main>\n</program>\n`;
    const r = run(src);
    // (the loop then lifts nothing that counts, so E-LOOP-007 follows — as on base)
    expect([...new Set(r.diags.map((d) => d.code))].sort()).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-LOOP-007"]);
    expect(r.diags.find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("Tier-0");
    expect(r.diags.some((d) => d.message.includes("internal"))).toBe(false);
  });

  test("a non-last `lift` in a VALUE-position arm block is still refused by name", () => {
    const src = prog(`        const xs = for (y of ys) {
            const v = match e {
                .A :> { lift y; lift 1; },
                .B :> { lift 0; },
                .C :> { lift 0; }
            };
            lift v;
        };
        ${txt}`);
    expect(codes(src).length).toBeGreaterThan(0);
  });
});
