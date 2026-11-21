// runorder-followups-s482.test.js — lane s482-runorder-followups: the S481 follow-ups to the
// program body's one source-ordered run (#2041, SPEC §7.6 rule (b) S481, §40.8, §17.1.1, §66.7.6).
// Rulings: user-voice-scrml.md S481 "⭐ RULED — body run order follow-ups from #2041 (construction
// place, later-binding reach, server-only)" (ruling:user-voice-scrml.md-S481-run-order-followups)
// and "⭐ RULED — nested initializers in conditional constructs; comments / `#{}` between if-chain
// members (#2041 r2)" (ruling:user-voice-scrml.md-S481-nested-init-chain-comments); #2041 r2 review
// LOW-1 (a place inside `<textarea>`).
//
// Every case runs on the SHIPPING path: the bootstrap CLI artifact (scripts/scrml-boot.ts
// `compileSource` → print.scrml printProgram) executed by the conformance runner's
// `runBootstrapArtifact` (happy-dom), or the artifact's text where happy-dom cannot see the defect
// (an RCDATA element's content — a real browser reads it as text).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-runorder-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function result(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  return await compileSource(file);
}
async function compile(src) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function errCodes(src) {
  const res = await result(src);
  return res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}
async function texts(src, ids) {
  const res = await compile(src);
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}
// the program's own template (`scrml:program`) in the client HTML
function programTemplate(html) {
  const m = html.match(/<template id="scrml:program"[^>]*>([\s\S]*?)<\/template>/);
  return m ? m[1] : "";
}

const LOG = `\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 7; }
}`;

// =============================================================================
// E — #2041 r2 review LOW-1: `<textarea>` / `<title>` content is RCDATA (`<script>` / `<style>`
// raw text): the HTML parser reads `<!--run-->` there as TEXT, so a place's comment anchor printed
// inside one became the textarea's value in Chromium. A place inside one is put just after the
// element (lower.scrml lowerPlaced / isTextOnlyElem). Red on base a27564881: the template held
// `<textarea id="t"><!--run--></textarea>`.
// =============================================================================
describe("E — a place inside an RCDATA element prints no anchor there (#2041 r2 LOW-1)", () => {
  test("t1: `<textarea>${ const … }</textarea>` — the textarea's template content is empty; the place still runs", async () => {
    const src = `<program>
${LOG}
<textarea id="t">\${ const a: int = note("a"); }</textarea><p id="r">\${log}</p>
</program>
`;
    const res = await compile(src);
    expect(programTemplate(res.client.html)).toContain('<textarea id="t"></textarea>');
    expect(await texts(src, ["r"])).toEqual(["a"]);
  }, 120000);

  test("t5: `<title>Hello${ const … }</title>` — the title text is only `Hello`", async () => {
    const src = `<program>
${LOG}
<title>Hello\${ const a: int = note("a"); }</title>
<p id="r">\${log}</p>
</program>
`;
    const res = await compile(src);
    expect(res.client.html).not.toMatch(/<title>[^<]*<!--/);
    expect(await texts(src, ["r"])).toEqual(["a"]);
  }, 120000);

  test("a textarea nested in an element: the place inside it runs before the place after it", async () => {
    const src = `<program>
${LOG}
<div id="w"><textarea id="t">\${ const a: int = note("a"); }</textarea>\${ const b: int = note("b"); }</div><p id="r">\${log}</p>
</program>
`;
    const res = await compile(src);
    expect(programTemplate(res.client.html)).toContain('<textarea id="t"></textarea>');
    expect(await texts(src, ["r"])).toEqual(["ab"]);
  }, 120000);
});

// =============================================================================
// B — ruling:user-voice-scrml.md-S481-run-order-followups item 2: "A display or statement that
// calls a function reaching a binding whose place is later" → "E-SCOPE-001, the S479
// file-scope-initializer rule extended to body code" (analyze.scrml bodyReachDiags). Red on base
// a27564881: each compiled (the printer ran the binding at module initialization, early).
// Corpus (examples/ samples/ benchmarks/ conformance/cases, 2960 files): 0 newly rejected.
// =============================================================================
const SEVEN = `\${
    function seven() -> int { return 7; }
}`;
describe("B — body code reaching a later binding is E-SCOPE-001", () => {
  test("a display calling a function that reads a later binding", async () => {
    expect(await errCodes(`<program>
${SEVEN}
\${ function g() -> int { return k; } }
<p id="a">\${g()}</p>
\${ const k: int = seven(); }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("through two helpers", async () => {
    expect(await errCodes(`<program>
${SEVEN}
\${
    function h() -> int { return k; }
    function g() -> int { return h() + 1; }
}
<p id="a">\${g()}</p>
\${ const k: int = seven(); }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("a recursive function reaching it", async () => {
    expect(await errCodes(`<program>
${SEVEN}
\${ function g(n: int) -> int { if (n > 0) { return g(n - 1); } return k; } }
<p id="a">\${g(2)}</p>
\${ const k: int = seven(); }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("a statement calling it, and a direct read in a display", async () => {
    expect(await errCodes(`<program>
${SEVEN}
\${ function g() -> int { return k; } }
\${ g(); }
\${ const k: int = seven(); }
</program>
`)).toEqual(["E-SCOPE-001"]);
    expect(await errCodes(`<program>
${SEVEN}
<p id="a">\${k}</p>
\${ const k: int = seven(); }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("a statement writing a later `let`", async () => {
    expect(await errCodes(`<program>
\${ n = 5; }
\${ let n: int = 1; }
<p id="a">\${n}</p>
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("legal: a function declared later reaching an EARLIER binding (7, in place)", async () => {
    const src = `<program>
${SEVEN}
\${ const k: int = seven(); }
<p id="a">\${g()}</p>
\${ function g() -> int { return k; } }
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["a"])).toEqual(["7"]);
  }, 120000);

  test("legal: a handler calling it runs after the body; a function value passed, not called", async () => {
    const src = `<program>
${SEVEN}
\${
    function g() -> int { return k; }
    function keep(f: () => int) -> int { return 0; }
    let out: int = 0;
}
<button id="b" onclick={ out = g(); }>go</button>
\${ keep(() => g()); }
\${ const k: int = seven(); }
<p id="a">\${k}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["a"])).toEqual(["7"]);
  }, 120000);
});

// =============================================================================
// C — ruling:user-voice-scrml.md-S481-nested-init-chain-comments item 1: a file-scope initializer
// that acts, written inside `if=` content or a component's slot content: "make it a compile error
// naming the construct" — E-FILE-SCOPE-INIT-IN-CONSTRUCT (analyze.scrml constructInitDiags). Red on
// base a27564881 (it compiled and ran once, just after the construct). Corpus: 0 newly rejected.
// =============================================================================
describe("C — an acting initializer inside if= / slot content is refused, naming the construct", () => {
  const LOGF = `\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 7; }
}
let <f:boolean=true/>`;
  test("inside an `if=` element", async () => {
    const res = await result(`<program>
${LOGF}
<p if=(@f)>\${ const a: int = note("a"); }</p>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("`if=` element");
  }, 120000);

  test("deeper inside an `else` member", async () => {
    const res = await result(`<program>
${LOGF}
<p if=(@f)>yes</p>
<div else><section><span>\${ let a: int = note("a"); }</span></section></div>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("`else` element");
  }, 120000);

  test("in the slot content of a component nested in another's slot content", async () => {
    const res = await result(`<card t:string="x">
</> renders <div>\${t}<slot/></div>
<program>
${LOGF}
<card><div><card><b>\${ const a: int = note("a"); }</b></card></div></card>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("slot content of `<card>`");
  }, 120000);

  test("legal: an initializer that does not act, inside `if=` content", async () => {
    const src = `<program>
let <f:boolean=false/>
<p if=(@f)>\${ const a: int = 1 + 2; }</p>
<p id="r">\${a}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["r"])).toEqual(["3"]);
  }, 120000);

  test("legal: an acting initializer in a plain element still runs in its place", async () => {
    const src = `<program>
${LOGF}
<div><span>\${ const a: int = note("a"); }</span></div>
<p id="r">\${log}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["r"])).toEqual(["a"]);
  }, 120000);
});

// =============================================================================
// D — ruling:user-voice-scrml.md-S481-nested-init-chain-comments item 2: a `//` comment or a `#{}`
// style block between `if=` / `else` members: "neither breaks the chain" (§17.1.1 S482). The
// bootstrap already accepted both (the parser drops a `//` comment; analyze's chain check skips a
// CSS node) — these PIN it, so they are not red on base; impl#1 refuses them (carried,
// g-impl1-chain-comment-css-s482).
// =============================================================================
describe("D — a `//` comment or `#{}` between chain members keeps the chain", () => {
  const chain = (mid) => `<program>
let <f:boolean=false/>
<p id="a" if=(@f)>yes</p>
${mid}
<p id="b" else>no</p>
</program>
`;
  for (const [name, mid] of [
    ["a `//` comment", "// a note"],
    ["a `//` comment holding `${`", "// a note with ${ x } in it"],
    ["a `#{}` block with braces in a string", '#{ p::before { content: "{ } ${"; } .x { color: red; } }'],
    ["blank lines, an HTML comment and `//` comments mixed", "\n// one\n\n<!-- two -->\n// three\n"],
  ]) {
    test(name, async () => {
      const src = chain(mid);
      expect(await errCodes(src)).toEqual([]);
      expect(await texts(src, ["a", "b"])).toEqual(["<none>", "no"]);
    }, 120000);
  }
  test("nested: a `//` comment and a `#{}` between members inside an element", async () => {
    const src = `<program>
let <f:boolean=false/>
<div>
<p id="a" if=(@f)>yes</p>
// nested note
#{ .q { color: red; } }
<p id="b" else>no</p>
</div>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["b"])).toEqual(["no"]);
  }, 120000);
});
