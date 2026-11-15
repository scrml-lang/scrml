// analyze-checks-followup-s478.test.js — s478-boot-analyze-followup: the #1867 S239 review's
// findings on the s478-boot-analyze-checks lane (analyze-checks-s478.test.js).
//
//   F1 — the C13 suppression (a `match` the binder refused for its coverage, E-TYPE-020 /
//     E-MATCH-012) drops only the `| not` widening; the arms' own type is kept, so a separate
//     E-TYPE-031 inside an arm still fires.
//   F2 — W-STYLE-CONFLICT-POSSIBLE names the winner per pair: §65.2 (S473 D20) leaves
//     program-global rules un-wrapped, so specificity decides, and source order only on a tie.
//   F3 — E-ENGINE-MOUNT-NOT-ENGINE for a CAPITALISED imported non-declaration (§34's own
//     `<EngineName/>` form), and its message names the tag by its opener.
//   F4 — a variant whose name failed to parse (`Étoile`) draws no E-ENUM-VARIANT-CASE on its
//     leftover text.
//   orphanElse — a handler block's `; else` is E-STMT-UNEXPECTED-TOKEN too.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const D = "$" + "{";
const run = (src, extra = []) => frontEnd(mods, [...extra, { path: "app.scrml", src }]);
const all = (r) => [...(r.parseDiags ?? []), ...r.diags];
const errs = (src, extra) => all(run(src, extra)).filter((d) => d.severity === "Error");
const errCodes = (src, extra) => [...new Set(errs(src, extra).map((d) => d.code))].sort();
const diagsOf = (src, code, extra) => all(run(src, extra)).filter((d) => d.code === code);
// a diagnostic may reach both lists; count distinct reports (place + message)
const count = (src, code, extra) => new Set(diagsOf(src, code, extra).map((d) => `${d.file}:${d.span.start}:${d.message}`)).size;

// =============================================================================================
// F1 — a coverage-refused `match` still types its arms
// =============================================================================================
describe("F1 — E-TYPE-020 / E-MATCH-012 do not mask an arm's own E-TYPE-031", () => {
  const wrap = (fnsrc) => `<program>
type Role:enum = { Admin, Editor, Viewer }
${fnsrc}
<p>${D}label(.Admin, not)}</p>
</program>
`;
  test("a `T | not` arm of a match missing a variant: E-TYPE-020 AND E-TYPE-031", () => {
    const src = wrap(`fn label(r: Role, m: string | not) -> string {
    return match r {
        .Admin  :> m,
        .Editor :> "editor"
    };
}`);
    expect(errCodes(src)).toEqual(["E-TYPE-020", "E-TYPE-031"]);
  });
  test("a `T | not` arm of a `T | not` subject with no `not` arm: E-MATCH-012 AND E-TYPE-031", () => {
    const src = wrap(`fn label(r: Role | not, m: string | not) -> string {
    return match r {
        .Admin  :> m,
        .Editor :> "editor",
        .Viewer :> "v"
    };
}`);
    expect(errCodes(src)).toEqual(["E-MATCH-012", "E-TYPE-031"]);
  });
  test("the missing arm itself still draws no E-TYPE-031 (C13 holds)", () => {
    const src = wrap(`fn label(r: Role, m: string | not) -> string {
    return match r {
        .Admin  :> "a",
        .Editor :> "editor"
    };
}`);
    expect(errCodes(src)).toEqual(["E-TYPE-020"]);
  });
});

// =============================================================================================
// F2 — W-STYLE-CONFLICT-POSSIBLE wording
// =============================================================================================
describe("F2 — W-STYLE-CONFLICT-POSSIBLE names the winner per pair (§65.2 S473 D20)", () => {
  const prog = (css) => `<program>
  #{
${css}
  }
  <button class="btn">Go</button>
</program>
`;
  const msg = (src) => {
    const ds = diagsOf(src, "W-STYLE-CONFLICT-POSSIBLE");
    expect(ds.length).toBeGreaterThan(0);
    return ds[0].message;
  };
  test("unequal specificity: the higher-specificity selector wins, not source order", () => {
    const m = msg(prog("      .btn { color: blue; }\n      button { color: red; }"));
    expect(m).toContain("the higher-specificity selector, `.btn` (specificity 0,1,0), wins over `button` (specificity 0,0,1) although it comes first");
    expect(m).not.toContain("source order alone");
    const m2 = msg(prog("      button { color: red; }\n      .btn { color: blue; }"));
    expect(m2).toContain("the higher-specificity selector, `.btn` (specificity 0,1,0), wins over `button` (specificity 0,0,1)");
    expect(m2).not.toContain("although it comes first");
  });
  test("equal specificity: source order alone, the later rule", () => {
    const m = msg(prog("      .btn { color: red; }\n      button.btn { padding: 0; }\n      .btn { color: blue; }"));
    expect(m).toContain("equal specificity 0,1,0, so which value wins is decided by source order alone: the later rule, `.btn`");
  });
});

// =============================================================================================
// F3 — E-ENGINE-MOUNT-NOT-ENGINE, capitalised
// =============================================================================================
describe("F3 — E-ENGINE-MOUNT-NOT-ENGINE for a capitalised imported non-declaration", () => {
  const app = (imp, body) => `<program>\n${imp}\n${body}\n<p>x</p>\n</program>\n`;
  test("`import { Helper }` (a function), then `<Helper/>`", () => {
    const lib = [{ path: "lib.scrml", src: "${ export function Helper() { return 1; } }\n" }];
    const src = app("import { Helper } from './lib.scrml';", "<Helper/>");
    expect(errCodes(src, lib)).toEqual(["E-ENGINE-MOUNT-NOT-ENGINE"]);
    expect(diagsOf(src, "E-ENGINE-MOUNT-NOT-ENGINE", lib)[0].message).toContain("`<Helper>` mounts the imported `Helper`, which is a function");
  });
  test("an imported type, `<Kind/>`", () => {
    const lib = [{ path: "lib.scrml", src: "${ export type Kind:enum = { A, B } }\n" }];
    const src = app("import { Kind } from './lib.scrml';", "<Kind/>");
    expect(errCodes(src, lib)).toEqual(["E-ENGINE-MOUNT-NOT-ENGINE"]);
    expect(diagsOf(src, "E-ENGINE-MOUNT-NOT-ENGINE", lib)[0].message).toContain("which is a type");
  });
  test("a capitalised tag that is not imported stays E-COMPONENT-035", () => {
    expect(errCodes(app("", "<Nothing/>"))).toEqual(["E-COMPONENT-035"]);
  });
  test("`<helper></helper>` — the message does not print a self-closing `<helper/>`", () => {
    const lib = [{ path: "lib.scrml", src: "${ export function helper() { return 1; } }\n" }];
    const src = app("import { helper } from './lib.scrml';", "<helper></helper>");
    const ds = diagsOf(src, "E-ENGINE-MOUNT-NOT-ENGINE", lib);
    expect(ds.length).toBeGreaterThan(0);
    expect(ds[0].message).not.toContain("<helper/>");
    expect(ds[0].message).toContain("`<helper>` mounts the imported `helper`");
  });
});

// =============================================================================================
// F4 — no case check on a variant whose parse failed
// =============================================================================================
describe("F4 — E-ENUM-VARIANT-CASE is not made on a failed variant's leftover", () => {
  const prog = (t) => `<program>\n${t}\n<p>x</p>\n</program>\n`;
  test("`Étoile` is one E-PARSE-TYPE, no `rename it \\`Toile\\``", () => {
    const src = prog("type K:enum = { Étoile, B }");
    expect(errCodes(src)).toEqual(["E-PARSE-TYPE"]);
    expect(count(src, "E-PARSE-TYPE")).toBe(1);
  });
  test("`日本` is one report, and a failed variant's payload is dropped with it", () => {
    expect(count(prog("type K:enum = { 日本, B }"), "E-PARSE-TYPE")).toBe(1);
    expect(errCodes(prog("type K:enum = { Étoile(r: int), B }"))).toEqual(["E-PARSE-TYPE"]);
  });
  test("a real lowercase variant after a failed one is still reported", () => {
    const src = prog("type K:enum = { Étoile, b }");
    expect(errCodes(src)).toEqual(["E-ENUM-VARIANT-CASE", "E-PARSE-TYPE"]);
    expect(diagsOf(src, "E-ENUM-VARIANT-CASE")[0].message).toContain("`b`");
  });
});

// =============================================================================================
// orphanElse in a handler block
// =============================================================================================
describe("orphanElse — a handler block's unclaimed `else` (§17.1.1)", () => {
  const p = (h) => `<program>
let <ok:boolean=true/>
let <n:number=0/>
function bump() { @n = @n + 1; }
<button onclick=${h}>go</button>
<p>${D}@n}</p>
</program>
`;
  test("`onclick={ if (@ok) { bump(); }; else { bump(); } }`", () => {
    const src = p(`{ if (@ok) { bump(); }; else { bump(); } }`);
    expect(errCodes(src)).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
    const d = diagsOf(src, "E-STMT-UNEXPECTED-TOKEN")[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("else");
  });
  test("`onclick={ bump(); else bump(); }`", () => {
    expect(errCodes(p(`{ bump(); else bump(); }`))).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
  });
  test("a claimed `else` in a handler block is clean", () => {
    expect(errCodes(p(`{ if (@ok) { bump(); } else { bump(); } }`))).toEqual([]);
  });
  // The `onclick=${ … }` handler form (§5.2, parse.scrml parseAttrValue).
  test("`onclick=${ if (…) { … }; else { … } }` and `onclick=${ bump(); else bump(); }`", () => {
    expect(errCodes(p(`${D} if (@ok) { bump(); } else { bump(); } }`))).toEqual([]);
    expect(errCodes(p(`${D} if (@ok) { bump(); }; else { bump(); } }`))).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
    expect(errCodes(p(`${D} bump(); else bump(); }`))).toEqual(["E-STMT-UNEXPECTED-TOKEN"]);
  });
});
