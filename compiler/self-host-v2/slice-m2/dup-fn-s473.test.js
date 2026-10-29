// dup-fn-s473.test.js — g-impl1-bootstrap-duplicate-fn-last-wins-s473: analyze.scrml's six
// duplicate top-level functions, renamed / merged (docs/changes/s473-boot-dup-fn-lint/progress.md).
//
// impl#1 binds every call of a duplicated name to the LAST definition and emits both. This file
// pins (1) the emitted bundle — no chunk defines one function name twice (RED on base: six names
// in analyze.client.js), an oracle on impl#1's OUTPUT, independent of the lint's tokenizer; and
// (2) the two call sites whose callee changed:
//
//   isLambda — `retsInExpr` (the return collector behind §66.3 rule 5's inferred return) called
//     `isLambda(k)` with the expression KIND, and so ran the later `isLambda(e: AExpr)` on an
//     `AExprK`: `k.k` is undefined, no arm matches, the answer is always false, and a lambda's body
//     was walked — against retsIn's own comment ("A lambda's body is not walked (its `return` is not
//     the function's)"). Now `isLambdaK(k)`. Not observable at the program level today: a `return`
//     can stand in a lambda only in a `{ … }` arm of a `match` that is the lambda's VALUE, which
//     the binder refuses first (E-BOOTSTRAP-UNSUPPORTED, "a `{ … }` arm … in a `match` whose value
//     is used"), and that refusal blames the inference. The pin below holds that outcome.
//
//   boolKey — `litKey` (a literal's identity, compared with a cell's initializer for the
//     `reset-on=` fix) got the later `boolKey` ("true") instead of its own ("b:true"). Both sides
//     of the comparison are litKey, and no other litKey spelling is "true" or starts "b:", so the
//     equality is unchanged. Pinned below.

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { loadM2, M2_MODULES } from "./harness.js";
import { frontEnd } from "./lowered.js";
import { buildBundleChunks, SELF_HOST_V2 } from "../slice-m1/harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const prog = (decls, main = "<p>x</p>") => ({
  path: "app.scrml",
  src: `<program>\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`,
});
const diags = (decls, main) => frontEnd(mods, [prog(decls, main)]).diags;
const codes = (decls, main) => diags(decls, main).map((d) => d.code);

describe("the emitted M2 bundle defines each function once (impl#1's output, not the lint)", () => {
  test("no chunk has two `function _scrml_<name>_<n>` of one <name>", () => {
    const { chunks } = buildBundleChunks(join(SELF_HOST_V2, "slice-m2", "bundle.scrml"), M2_MODULES);
    const dups = [];
    for (const c of chunks) {
      const names = [...c.src.matchAll(/^function _scrml_([A-Za-z0-9_]+?)_\d+\(/gm)].map((m) => m[1]);
      const seen = new Set();
      for (const n of names) {
        if (seen.has(n)) dups.push(`${c.name}: ${n}`);
        seen.add(n);
      }
    }
    expect(dups).toEqual([]);
  }, 180000);
});

describe("isLambda → isLambdaK: retsInExpr skips a lambda's body", () => {
  const SIX =
    "    function six(xs: bool[]) {\n" +
    "        const ys: string[] = xs.map((x) => match x { true :> { return \"t\"; }, false :> { return \"f\"; } });\n" +
    "        return 6;\n" +
    "    }\n";
  test("a lambda arm block that `return`s is refused by the binder first (the outcome the rename leaves unchanged)", () => {
    const ds = diags(SIX + "    <v:int=(six([true]) + 1)/>");
    expect(ds.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ds.every((d) => d.message.includes("in a `match` whose value is used"))).toBe(true);
  });
  test("a plain lambda in an unannotated function: its return is still proven", () => {
    expect(codes("    function six(xs: int[]) {\n        const ys: int[] = xs.map((x) => x + 1);\n        return 6;\n    }\n    <v:int=(six([1]) + 1)/>")).toEqual([]);
  });
  test("control: a string `return` in the function's OWN body still makes it unproven", () => {
    expect(codes("    function mk(b: bool) { if (b) { return 5; } else { return \"five\"; } }\n    <v:int=(mk(true))/>")).toEqual(["E-DECL-TYPE-UNPROVEN"]);
  });
});

describe("boolKey → litBoolKey: a bool write equal to the cell's initializer is still the reset-on= fix", () => {
  const D = "    let <query:string=\"\"/>\n    let <open:bool=false/>";
  const msg = (eff) => diags(`${D}\n    ${eff}`, "").map((d) => `${d.code} ${d.message}`);
  test("`@open = false` over `<open:bool=false/>` → reset-on=; `@open = true` → not", () => {
    const same = msg("<effect deps=[@query]>${ @open = false; }</>");
    expect(same.length).toBe(1);
    expect(same[0]).toContain("E-EFFECT-WRITES-STATE");
    expect(same[0]).toContain("`reset-on=[@query]`");
    const other = msg("<effect deps=[@query]>${ @open = true; }</>");
    expect(other.length).toBe(1);
    expect(other[0]).not.toContain("reset-on=");
  });
});
