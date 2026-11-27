// trapping-construct-init-s483.test.js — lane s483-trapping-construct-init (#2079 review PRE-1; owner Q8).
//
// RULED S482 (ruling:user-voice-scrml.md-S482-trapping-construct-init — owner: "yes, interim refusal now and
// the feature later"): INTERIM — "extend E-FILE-SCOPE-INIT-IN-CONSTRUCT to an initializer inside a construct
// that can fail at run time (indexing, `.value` on a maybe value, checked conversions, division by a
// possibly-zero value)"; PERMANENT — branch-scoped declarations, its own design item. Gap
// g-boot-trapping-construct-init-s482.
//
// A non-acting file-scope initializer inside `if=` / `else-if=` / `else` content, a `<match>` arm or a
// component's slot content runs once, just before the construct, whether or not the construct shows
// (§7.6 R3). Before this lane `${ const first: int = items[0]; }` under `if=(items.length > 0)` compiled and
// the E-INDEX-OUT-OF-RANGE-RT trap stopped the mount (the page stayed blank). Now it is refused.
// compiler/tests/browser/trapping-construct-init-chromium-s483.browser.test.js shows the blank page in
// Chromium for the pre-change shape and the capable forms working.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-trap-init-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return await compileSource(file);
}
async function errors(src) {
  return (await result(src)).diagnostics.filter((d) => d.severity === "error");
}
async function texts(src, ids) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>"));
}

const HEAD = `\${ const items: int[] = []; }
\${ type User:struct = { name: string } }
\${ const user: User | not = not; }
\${ const x: number = 0.0 / 0.0; }
\${ const y: number = 0.0; }
\${ const n: int = 2; }
\${ type Phase:enum = { Idle, Ready } }
\${ function firstOf(xs: int[]) -> int { return xs[0]; } }
<phase:Phase=.Ready/>
`;
const CARD = `<card t:string="x">
</> renders <div>\${t}<slot/></div>
`;

// The three constructs, each holding the initializer `ini`.
function inIf(ini) {
  return `<program>\n${HEAD}<p id="a" if=(items.length > 0)>\${ ${ini} }in</p>\n<p id="z">end</p>\n</program>\n`;
}
function inMatch(ini) {
  return `<program>\n${HEAD}<match for=Phase on=@phase>\n  <Idle><div id="a">\${ ${ini} }idle</div></>\n  <Ready><p>ready</p></>\n</match>\n<p id="z">end</p>\n</program>\n`;
}
function inSlot(ini) {
  return `${CARD}<program>\n${HEAD}<card><b id="a">\${ ${ini} }in</b></card>\n<p id="z">end</p>\n</program>\n`;
}
const CTORS = [["if=", inIf, "`if=` element"], ["<match> arm", inMatch, "`<Idle>` arm of `<match for=Phase>`"], ["slot", inSlot, "slot content of `<card>`"]];

describe("refused: an initializer inside a construct that can trap (E-FILE-SCOPE-INIT-IN-CONSTRUCT)", () => {
  for (const [label, wrap, where] of CTORS) {
    test(`an index read, items[0] — in ${label}`, async () => {
      const d = await errors(wrap("const first: int = items[0];"));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("`const first` can stop at run time");
      expect(d[0].message).toContain("reads `items[0]` by position");
      expect(d[0].message).toContain("E-INDEX-OUT-OF-RANGE-RT");
      expect(d[0].message).toContain(where);
      expect(d[0].message).toContain("g-boot-trapping-construct-init-s482");
      expect(d[0].message).toContain("branch-scoped declarations");
    }, 120000);

    test(`a checked conversion, floor(x) — in ${label}`, async () => {
      const d = await errors(wrap("const k: int = floor(x);").replace("<program>\n", "<program>\n${ import { floor } from \"scrml:math\"; }\n"));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("E-INT-CONVERSION-RT");
    }, 120000);

    test(`a remainder by a computed int, 7 % items.length — in ${label}`, async () => {
      const d = await errors(wrap("const c: int = 7 % items.length;"));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("divides by `items.length` (`%`)");
      expect(d[0].message).toContain("g-bootstrap-int-overflow-and-mod-zero-untrapped-s469");
    }, 120000);

    test(`r1: an unproven tape bound, const c: int[1..=2] = items — in ${label} (#2129 review HIGH-1)`, async () => {
      const d = await errors(wrap("const c: int[1..=2] = items;"));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("E-WRITE-INVARIANT-RT");
      expect(d[0].message).toContain(where);
    }, 120000);

    test(`a call of a function that indexes — in ${label}`, async () => {
      const d = await errors(wrap("const first: int = firstOf(items);"));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("calls `firstOf()`, which reads `xs[0]` by position");
    }, 120000);

    test(`a member of a maybe value, user.name — in ${label} (refused already: E-TYPE-046, unchanged)`, async () => {
      // the construct's test does not narrow an initializer that runs before it; the typer refuses the read
      const d = await errors(wrap("const nm: string = user.name;"));
      expect(d.map((x) => x.code)).toEqual(["E-TYPE-046"]);
    }, 120000);

    test(`accepted: a literal, pure arithmetic, division by a non-zero literal, items.at(0), \`/\` by a number binding — in ${label}`, async () => {
      // r1 (ruling:user-voice-scrml.md-S483-q8-division): `/` on a `number` divisor gives ±∞ / NaN, no trap
      for (const ini of ["const a: int = 5;", "const b: int = n + 2 * n - 1;", "const c: number = x / 2.0;", "const first: int | not = items.at(0);", "const q: number = 1.0 / y;", "const r: number = y / n;"]) {
        const d = await errors(wrap(ini));
        expect(d.map((x) => x.code)).toEqual([]);
      }
    }, 120000);
  }

  test("modulo by a binding not proven non-zero (n - 2)", async () => {
    const d = await errors(inIf("const c: int = 7 % (n - 2);"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("(`%`), with a result that may be an `int` (neither operand is proven a `number`) and a divisor not proven non-zero");
    expect(d[0].message).toContain("ruling:user-voice-scrml.md-S483-q8-division");
  }, 120000);

  test("an `else` member", async () => {
    const d = await errors(`<program>\n${HEAD}<p if=(items.length == 0)>empty</p>\n<p else>\${ const first: int = items[0]; }\${first}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("`else` element");
  }, 120000);

  test("nested constructs: the innermost is named", async () => {
    const d = await errors(`<program>\n${HEAD}<flag:boolean=true/>\n<div if=(@flag)><p if=(items.length > 0)><span>\${ const first: int = items[0]; }in</span></p></div>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("`<p if=…>`");
  }, 120000);

  test("a computed string position (`s.slice(n - 3)`) is refused; a literal one is not", async () => {
    const pre = `<program>\n${HEAD}\${ const s: string = "abc"; }\n`;
    const d = await errors(pre + `<p if=(n > 0)>\${ const t: string = s.slice(n - 3); }\${t}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("computed position");
    const ok = await errors(pre + `<p if=(n > 0)>\${ const t: string = s.slice(1); }\${t}</p>\n</program>\n`);
    expect(ok.map((x) => x.code)).toEqual([]);
  }, 120000);

  test("a lambda the initializer runs (`items.some(v => 10 % v == 0)`) is walked", async () => {
    // (a function value in a file-scope initializer is refused already too — E-BOOTSTRAP-UNSUPPORTED, g-boot-file-scope-init-residue-s479)
    const d = await errors(inIf("const pick: boolean = items.some(v => 10 % v == 0);"));
    expect(d.map((x) => x.code)).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
    expect(d.find((x) => x.code === "E-FILE-SCOPE-INIT-IN-CONSTRUCT").message).toContain("divides by `v` (`%`)");
  }, 120000);
});

describe("unchanged: outside a construct, and the capable forms", () => {
  test("a body-top initializer that indexes is not judged by this rule (it has its place)", async () => {
    const t = await texts(`<program>\n${HEAD}\${ const nums: int[] = [4, 5]; }\n\${ const first: int = nums[0]; }\n<p id="a">\${first}</p>\n<p id="z">end</p>\n</program>\n`, ["a", "z"]);
    expect(t).toEqual(["4", "end"]);
  }, 120000);

  test("the content calls the function itself — it runs only when the branch shows", async () => {
    const t = await texts(`<program>\n${HEAD}<p id="a" if=(items.length > 0)>\${firstOf(items)}</p>\n<p id="z">end</p>\n</program>\n`, ["a", "z"]);
    expect(t).toEqual(["<none>", "end"]);
  }, 120000);

  test("a component's own body inside a construct is the instance's (not a file-scope initializer)", async () => {
    const t = await texts(`<box xs:int[]=[]>\n</> renders <div>\${xs[0]}</div>\n<program>\n${HEAD}<div id="a" if=(items.length > 0)><box xs=(items)/></div>\n<p id="z">end</p>\n</program>\n`, ["a", "z"]);
    expect(t).toEqual(["<none>", "end"]);
  }, 120000);

  test("a non-trapping initializer inside the construct still runs (items.at(0))", async () => {
    const t = await texts(inIf("const first: int | not = items.at(0);"), ["a", "z"]);
    expect(t).toEqual(["<none>", "end"]);
  }, 120000);
});

// r1 (#2129 review) — the fix round.
function inIfPre(pre, ini) {
  return `<program>\n${HEAD}${pre}\n<p id="a" if=(n > 5)>\${ ${ini} }in</p>\n<p id="z">end</p>\n</program>\n`;
}

describe("r1 HIGH-1: an unproven tape bound is judged over the typed tables (E-WRITE-INVARIANT-RT)", () => {
  const SHAPES = [
    ["a const", "", "const c: int[1..=2] = items;"],
    ["a let", "", "let c: int[1..=2] = items;"],
    ["a function's bounded return", "${ function mk(xs: int[]) -> int[1..=2] { return xs; } }", "const c: int[1..=2] = mk(items);"],
    ["a function's bounded parameter", "${ function len2(xs: int[1..=2]) -> int { return xs.length; } }", "const c: int = len2(items);"],
    ["a struct field's bound", "${ type Two:struct = { xs: int[1..=2] } }", "const c: Two = { xs: items };"],
  ];
  for (const [label, pre, ini] of SHAPES) {
    test(`refused: ${label}`, async () => {
      const d = await errors(inIfPre(pre, ini));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("E-WRITE-INVARIANT-RT");
    }, 120000);
  }
  test("accepted: a literal tape the typer proves inside the bound", async () => {
    const d = await errors(inIf("const c: int[1..=2] = [1, 2];"));
    expect(d.map((x) => x.code)).toEqual([]);
  }, 120000);
});

describe("r1 HIGH-2: a stdlib host export is a trap site unless it is listed as trap-free", () => {
  test("refused: scrml:random randomInt (its int decode is E-HOST-VALUE-MISMATCH-RT)", async () => {
    const d = await errors(inIfPre('${ import { randomInt } from "scrml:random"; }', "const r: int = randomInt(1, 6);"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("`randomInt`, a host-backed function of `scrml:random`");
    expect(d[0].message).toContain("E-HOST-VALUE-MISMATCH-RT");
  }, 120000);
  test("accepted: the listed exports — random, min, max, abs, isNaN, parseInt, parseFloat, toNumber", async () => {
    const cases = [
      ['${ import { random } from "scrml:random"; }', "const r: number = random();"],
      ['${ import { min, max, abs } from "scrml:math"; }', "const r: number = abs(min(y, max(y, 1.0)));"],
      ['${ import { isNaN } from "scrml:math"; }', "const r: bool = isNaN(y);"],
      ['${ import { parseInt, parseFloat, toNumber } from "scrml:math"; }', 'const r: int | not = parseInt("12", 10);'],
      ['${ import { parseFloat } from "scrml:math"; }', 'const r: number | not = parseFloat("1.5");'],
      ['${ import { toNumber } from "scrml:math"; }', 'const r: number | not = toNumber("1.5");'],
    ];
    for (const [pre, ini] of cases) {
      const d = await errors(inIfPre(pre, ini));
      expect([ini, d.map((x) => x.code)]).toEqual([ini, []]);
    }
  }, 240000);
});

describe("r1 MED-1: <textarea> / <title> content (§7.6 R3: an element whose content holds no place)", () => {
  for (const tag of ["textarea", "title"]) {
    test(`refused: an index read in <${tag}>`, async () => {
      const d = await errors(`<program>\n${HEAD}<${tag}>\${ const f: int = items[0]; }\${f}</${tag}>\n<p id="z">end</p>\n</program>\n`);
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("written inside `<" + tag + ">`");
    }, 120000);
    test(`accepted: a non-trapping initializer in <${tag}>`, async () => {
      const d = await errors(`<program>\n${HEAD}<${tag}>\${ const s: string = "hi"; }\${s}</${tag}>\n<p id="z">end</p>\n</program>\n`);
      expect(d.map((x) => x.code)).toEqual([]);
    }, 120000);
  }
  test("refused: a foreign block in <textarea> (the acting half)", async () => {
    const d = await errors(`<program>\n${HEAD}<textarea>\${ const r: int = _={ 1 }=; }\${r}</textarea>\n<p id="z">end</p>\n</program>\n`);
    const c = d.find((x) => x.code === "E-FILE-SCOPE-INIT-IN-CONSTRUCT");
    expect(c?.message).toContain("runs a foreign `_={ }=` block");
    expect(c?.message).toContain("`<textarea>`");
  }, 120000);
});

describe("r1 LOW-2: decidable cases are decided", () => {
  test("accepted: scrml:math minOf / maxOf (documented `not` on an empty tape; TRAP_FREE_STDLIB_FNS)", async () => {
    for (const fn of ["minOf", "maxOf"]) {
      const d = await errors(inIfPre(`\${ import { ${fn} } from "scrml:math"; }\n\${ const xs: number[] = []; }`, `const c: number | not = ${fn}(xs);`));
      expect([fn, d.map((x) => x.code)]).toEqual([fn, []]);
    }
  }, 240000);
  test("accepted: % by a const whose initializer is a non-zero literal (a refined one too)", async () => {
    for (const pre of ["${ const d: int = 3; }", "${ const d: int(>0) = 3; }"]) {
      const d = await errors(inIfPre(pre, "const c: int = 7 % d;"));
      expect([pre, d.map((x) => x.code)]).toEqual([pre, []]);
    }
  }, 240000);
  test("refused: % by a const 0, and by a let (it can be written)", async () => {
    for (const pre of ["${ const d: int = 0; }", "${ let d: int = 3; }"]) {
      const d = await errors(inIfPre(pre, "const c: int = 7 % d;"));
      expect([pre, d.map((x) => x.code)]).toEqual([pre, ["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]]);
    }
  }, 240000);
  const POS = "${ function pos(p: int(>0)) -> int { return p; } }";
  test("accepted: a call whose refined parameter gets a literal its static zone passes, pos(3)", async () => {
    const d = await errors(inIfPre(POS, "const c: int = pos(3);"));
    expect(d.map((x) => x.code)).toEqual([]);
  }, 120000);
  test("refused: the same call with a binding, pos(n)", async () => {
    const d = await errors(inIfPre(POS, "const c: int = pos(n);"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("checks its parameter `p` against the refinement `int(>0)`");
  }, 120000);
  test("refused: a literal call of a function that calls itself back (its own arguments are checked too)", async () => {
    const d = await errors(inIfPre("${ function pos(p: int(>0)) -> int { if (p > 5) { return pos(p - 1); } return p; } }", "const c: int = pos(9);"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);
  test("refused: a literal call of a function whose body traps — the body's site is named", async () => {
    const d = await errors(inIfPre("${ function pos(p: int(>0)) -> int { return items[p]; } }", "const c: int = pos(3);"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("reads `items[p]` by position");
  }, 120000);
});

// r1 (#2129 review LOW-3; RULED S483, ruling:user-voice-scrml.md-S483-unread-trapping-init-runs — "a trapping
// initializer is not 'doing nothing', so the printer keeps it"): §7.6 R1 — a file-scope initializer runs at its
// place whether or not anything reads it. Before r1 the printer left out an unread `const f: int = items[0];`
// (it "did nothing"), while the same read through a call ran and trapped.
describe("r1 LOW-3: an unread body-top initializer that can trap is kept and runs at its place", () => {
  const UNREAD = (ini) => `<program>\n${HEAD}\${ ${ini} }\n<p id="z">end</p>\n</program>\n`;
  for (const [label, ini, needle] of [
    ["an index read", "const f: int = items[0];", "rt.indexRead(items, 0"],
    ["an unproven tape bound", "const c: int[1..=2] = items;", "lengthCheck"],
    ["a computed string position", "const t: string = \"abc\".slice(n - 3);", "slice"],
    ["a remainder by a binding", "const r: int = 7 % (n - 2);", "% "],
  ]) {
    test(`kept: ${label}`, async () => {
      const res = await result(UNREAD(ini));
      expect(res.ok).toBe(true);
      expect(res.client.js).toContain(needle);
    }, 120000);
  }
  test("still left out: an unread initializer that cannot trap (arithmetic)", async () => {
    const res = await result(UNREAD("const k: int = n * 7 + 1;"));
    expect(res.ok).toBe(true);
    expect(res.client.js).not.toContain("n * 7");
  }, 120000);
  test("runs: the unread index read traps at its place (E-INDEX-OUT-OF-RANGE-RT), as the same read through a call does", async () => {
    for (const ini of ["const f: int = items[0];", "const f: int = firstOf(items);"]) {
      const res = await result(UNREAD(ini));
      let msg = "";
      try { await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined); } catch (e) { msg = String(e?.message ?? e); }
      expect([ini, msg.includes("E-INDEX-OUT-OF-RANGE-RT")]).toEqual([ini, true]);
    }
  }, 120000);
});

// q8-fu (#2129 r1 review MED-1): a LITERAL `repeat` count or `padStart` / `padEnd` width can trap too — the
// runtime refuses a result longer than the longest string (runtime.js MAX_TEXT_UNITS = 2^29 − 24 UTF-16 units,
// requireFits: E-INDEX-OUT-OF-RANGE-RT). Before, both halves exempted every literal: `s.repeat(600000000)` in an
// untaken `if=` blanked the page, and unread at the body top the printer dropped it (it did not run at its place,
// against ruling:user-voice-scrml.md-S483-unread-trapping-init-runs). A literal is trap-free only when the
// result's length is provable: repeat — a count of 0 / 1, or a literal receiver with 2·len·count ≤ MAX; pad —
// 2·width ≤ MAX, or the default fill on a literal receiver with 2·len + width ≤ MAX.
describe("q8-fu MED-1: a literal repeat count / pad width whose result may pass the longest string", () => {
  const PRE = `<program>\n${HEAD}\${ const s: string = "ab"; }\n\${ let w: string = "xy"; }\n`;
  const inIfS = (ini) => `${PRE}<p id="a" if=(n > 5)>\${ ${ini} }\${c}</p>\n<p id="z">end</p>\n</program>\n`;
  for (const ini of [
    "const c: string = s.repeat(600000000);",            // #2129 r1 probe t01
    "const c: string = s.padStart(600000000);",          // t02
    "const c: string = w.padEnd(600000000, \"-\");",
    "const c: string = w.repeat(2);",                    // receiver length not known: fail closed (big.repeat(2))
    "const c: string = \"ab\".repeat(134217723);",       // 2·2·134217723 > MAX
    "const c: string = w.padEnd(268435445);",            // 2·268435445 > MAX, receiver not a literal
    "const c: string = \"ab\".padEnd(536870885);",       // 2·2 + 536870885 > MAX
    "const c: string = \"ab\".padEnd(300000000, \"-\");", // a fill given: only 2·width counts
  ]) {
    test(`refused: ${ini}`, async () => {
      const d = await errors(inIfS(ini));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("whose result is not proven to fit the longest string (536870888 UTF-16 units");
      expect(d[0].message).toContain("E-INDEX-OUT-OF-RANGE-RT");
    }, 120000);
  }
  test("refused: the same through a function (#2129 r1 probe t06)", async () => {
    const d = await errors(`${PRE}\${ function rep() -> string { return s.repeat(600000000); } }\n<p id="a" if=(n > 5)>\${ const c: string = rep(); }\${c}</p>\n</program>\n`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("with the count `600000000`");
  }, 120000);
  test("accepted: a result the compiler proves fits", async () => {
    for (const ini of [
      "const c: string = \"ab\".repeat(3);",
      "const c: string = s.repeat(3);",                  // a never-written const holding a literal
      "const c: string = \"ab\".repeat(134217722);",     // 2·2·134217722 = MAX
      "const c: string = w.repeat(1);",
      "const c: string = w.repeat(0);",
      "const c: string = w.padStart(10, \"-\");",
      "const c: string = w.padEnd(268435444);",          // 2·268435444 = MAX
      "const c: string = \"ab\".padEnd(536870884);",     // 2·2 + 536870884 = MAX
    ]) {
      const d = await errors(inIfS(ini));
      expect([ini, d.map((x) => x.code)]).toEqual([ini, []]);
    }
  }, 120000);
  test("runs: an accepted literal repeat inside an untaken if= does not trap", async () => {
    expect(await texts(inIfS("const c: string = s.repeat(3);"), ["a", "z"])).toEqual(["<none>", "end"]);
  }, 120000);

  // the printer half (print.scrml primTraps / textFitsCore): an unread body-top initializer that can trap is
  // kept and runs at its place (§7.6 R1; #2129 r1 probes t03 / t04 — it had been dropped)
  const UNREAD = (ini) => `${PRE}\${ ${ini} }\n<p id="z">end</p>\n</program>\n`;
  for (const ini of ["const t: string = s.repeat(600000000);", "const t: string = s.padEnd(600000000);", "const t: string = w.repeat(2);"]) {
    test(`kept, unread: ${ini}`, async () => {
      const res = await result(UNREAD(ini));
      expect(res.ok).toBe(true);
      expect(res.client.js).toMatch(/strRepeat|strPadEnd/);
    }, 120000);
  }
  test("left out, unread: a literal repeat on a literal receiver that fits", async () => {
    const res = await result(UNREAD("const t: string = \"ab\".repeat(3);"));
    expect(res.ok).toBe(true);
    expect(res.client.js).not.toContain("strRepeat");
  }, 120000);
  test("runs: the unread huge repeat traps at its place (E-INDEX-OUT-OF-RANGE-RT)", async () => {
    const res = await result(UNREAD("const t: string = s.repeat(600000000);"));
    let msg = "";
    try { await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined); } catch (e) { msg = String(e?.message ?? e); }
    expect(msg).toContain("E-INDEX-OUT-OF-RANGE-RT");
  }, 120000);
});

// q8-fu (#2129 r1 review LOW-1; ruling:user-voice-scrml.md-S483-q8-division — governing clause "refuse only what
// can actually trap"; its refusal is "`%` … by a possibly-zero int"): a `%` whose divisor the typer proved a
// `number` gives NaN by 0 and owes no trap — accepted, as `/` is. A divisor proven `int` stays refused, and the
// message names the int trap only for it.
describe("q8-fu LOW-1: `%` by a number divisor is not a trap site", () => {
  test("accepted: 7.0 % y, n % y, x % (y + 1.0) (y, x: number)", async () => {
    for (const ini of ["const c: number = 7.0 % y;", "const c: number = n % y;", "const c: number = x % (y + 1.0);"]) {
      const d = await errors(inIf(ini));
      expect([ini, d.map((x) => x.code)]).toEqual([ini, []]);
    }
  }, 120000);
  // q8-fu2 (#2133 review item 3; prov=pa-ruled:S483-mixed-mod-no-trap, the same governing clause): `%` lowers
  // to the bare JS `%` and numJoin(number, int) is `number`, so `7.0 % n0` is NaN, a `number` — the s469 trap is
  // owed on an `int` result only. Before q8-fu2 it was refused by the ruling's literal words ("by a possibly-zero
  // int"); now `%` is a site only when neither operand is proven a `number`.
  test("q8-fu2: accepted — a `number` dividend by an `int` divisor (`7.0 % (n - 2)`, `y % n`); it runs to NaN", async () => {
    for (const ini of ["const c: number = 7.0 % (n - 2);", "const c: number = y % n;", "const c: number = x % items.length;"]) {
      const d = await errors(inIf(ini));
      expect([ini, d.map((x) => x.code)]).toEqual([ini, []]);
    }
    const bodyTop = `<program>\n${HEAD}\${ const c: number = 7.0 % (n - 2); }\n<p id="z">\${c}</p>\n</program>\n`;
    expect(await texts(bodyTop, ["z"])).toEqual(["NaN"]);
  }, 120000);
  test("still refused: `int % int` by a divisor not proven non-zero; the message names the `int` result", async () => {
    const d = await errors(inIf("const c: int = n % (n - 2);"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("with a result that may be an `int`");
    expect(d[0].message).toContain("an `int` `n % 0` has no `int` value");
    expect(d[0].message).toContain("refuse only what can actually trap");
  }, 120000);
});

// q8-fu2 (#2133 review LOW-1): numberOnly read a `Partial`'s proven members as the whole value, so a divisor with a
// branch the typer could not type (`v(2)`, a recursive function: `Partial([number])`) passed as a `number`. A
// Partial is never proven a `number` now — fail closed, either operand.
describe("q8-fu2 LOW-1: a `Partial` operand is not proven a `number`", () => {
  const PRE = `<program>\n${HEAD}\${ const n0: int = 0; }\n\${ function v(q: int) { if (q <= 1) return 0.0; return q * v(q - 1); } }\n`;
  const inIfP = (ini) => `${PRE}<p id="a" if=(n > 5)>\${ ${ini} }\${c}</p>\n<p id="z">end</p>\n</program>\n`;
  for (const ini of [
    "const c: number = n % v(2);",                 // probe g01
    "const c: number = n % (n > 1 ? y : v(2));",   // probe g02
    "const c: number = v(2) % n0;",                // probe g03
  ]) {
    test(`refused: ${ini}`, async () => {
      const d = await errors(inIfP(ini));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("(`%`), with a result that may be an `int`");
    }, 120000);
  }
  test("accepted: a proven `number` on the other side still decides (`y % v(2)`)", async () => {
    const d = await errors(inIfP("const c: number = y % v(2);"));
    expect(d.map((x) => x.code)).toEqual([]);
  }, 120000);
});

// q8-fu2 (#2133 review MED-1): `replaceAll` checks its result against the longest string too (runtime.js
// strReplaceAll → requireFits: E-INDEX-OUT-OF-RANGE-RT). Before, neither half counted it: `big.replaceAll("a", big)`
// in an untaken `if=` blanked the page, and unread at the body top the printer dropped it. It is trap-free only
// when the receiver and the replacement are literals (or never-written consts holding one) with
// (2·L + 1)·2·W + 2·L ≤ MAX — the most the result can be for any `find`, "" included.
describe("q8-fu2 MED-1: replaceAll is a trap site unless its result provably fits", () => {
  const PRE = `<program>\n${HEAD}\${ const s: string = "ab"; }\n\${ let w: string = "xy"; }\n\${ const big: string = "b".repeat(3) + "a"; }\n`;
  const inIfS = (ini) => `${PRE}<p id="a" if=(n > 5)>\${ ${ini} }\${c}</p>\n<p id="z">end</p>\n</program>\n`;
  for (const ini of [
    "const c: string = big.replaceAll(\"a\", big);",   // #2133 review probe r01's shape
    "const c: string = w.replaceAll(\"x\", \"y\");",     // receiver not a literal
    "const c: string = \"ab\".replaceAll(\"a\", w);",    // replacement not a literal
  ]) {
    test(`refused: ${ini}`, async () => {
      const d = await errors(inIfS(ini));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain(".replaceAll(…)`, whose result is not proven to fit the longest string (536870888 UTF-16 units");
      expect(d[0].message).toContain("E-INDEX-OUT-OF-RANGE-RT");
    }, 120000);
  }
  test("accepted: a literal receiver and replacement that fit, a never-written const included, any find", async () => {
    for (const ini of [
      "const c: string = \"abc\".replaceAll(\"b\", \"xyz\");",
      "const c: string = s.replaceAll(\"\", \"--\");",
      "const c: string = s.replaceAll(w, \"q\");",          // the searched-for text does not matter
    ]) {
      const d = await errors(inIfS(ini));
      expect([ini, d.map((x) => x.code)]).toEqual([ini, []]);
    }
  }, 120000);
  test("message: a literal receiver is shown, cut at 16 units (#2133 review item 4 cosmetic)", async () => {
    const d = await errors(inIfS("const c: string = \"a long receiver literal here\".replaceAll(\"a\", w);"));
    expect(d[0].message).toContain("calls `\"a long receiver …\".replaceAll(…)`");
    const r = await errors(inIfS("const c: string = \"ab\".repeat(300000000);"));
    expect(r[0].message).toContain("calls `\"ab\".repeat(…)` with the count `300000000`");
  }, 120000);

  // the printer half (print.scrml primTraps / replaceAllFitsCore): kept unread, and it runs at its place
  const UNREAD = (ini) => `${PRE}\${ ${ini} }\n<p id="z">end</p>\n</program>\n`;
  test("kept, unread: a replaceAll on a non-literal receiver", async () => {
    const res = await result(UNREAD("const t: string = w.replaceAll(\"x\", \"yy\");"));
    expect(res.ok).toBe(true);
    expect(res.client.js).toContain("strReplaceAll");
  }, 120000);
  test("left out, unread: a literal replaceAll that fits", async () => {
    const res = await result(UNREAD("const t: string = \"abc\".replaceAll(\"b\", \"q\");"));
    expect(res.ok).toBe(true);
    expect(res.client.js).not.toContain("strReplaceAll");
  }, 120000);
});
