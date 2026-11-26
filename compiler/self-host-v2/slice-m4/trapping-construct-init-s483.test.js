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

    test(`division by a binding — in ${label}`, async () => {
      const d = await errors(wrap("const c: number = 1.0 / y;"));
      expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
      expect(d[0].message).toContain("divides by `y`");
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

    test(`accepted: a literal, pure arithmetic, division by a non-zero literal, items.at(0) — in ${label}`, async () => {
      for (const ini of ["const a: int = 5;", "const b: int = n + 2 * n - 1;", "const c: number = x / 2.0;", "const first: int | not = items.at(0);"]) {
        const d = await errors(wrap(ini));
        expect(d.map((x) => x.code)).toEqual([]);
      }
    }, 120000);
  }

  test("modulo by a binding", async () => {
    const d = await errors(inIf("const c: int = 7 % n;"));
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("divides by `n` (`%`)");
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
