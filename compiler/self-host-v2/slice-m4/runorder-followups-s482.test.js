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
    // s482-value-no-write: an initializer there is a value position and may not write (`note` wrote `log`)
    const src = `<program>
${LOG}
<textarea id="t">\${ const a: int = 2; }</textarea><p id="r">\${a}</p>
</program>
`;
    const res = await compile(src);
    expect(programTemplate(res.client.html)).toContain('<textarea id="t"></textarea>');
    expect(await texts(src, ["r"])).toEqual(["2"]);
  }, 120000);

  test("t5: `<title>Hello${ const … }</title>` — the title text is only `Hello`", async () => {
    // s482-value-no-write: an initializer there is a value position and may not write (`note` wrote `log`)
    const src = `<program>
${LOG}
<title>Hello\${ const a: int = 2; }</title>
<p id="r">\${a}</p>
</program>
`;
    const res = await compile(src);
    expect(res.client.html).not.toMatch(/<title>[^<]*<!--/);
    expect(await texts(src, ["r"])).toEqual(["2"]);
  }, 120000);

  test("a textarea nested in an element: the place inside it runs before the place after it", async () => {
    // s482-value-no-write: an initializer there is a value position and may not write (`note` wrote `log`)
    const src = `<program>
${LOG}
<div id="w"><textarea id="t">\${ const a: int = 2; }</textarea>\${ const b: int = a + 1; }</div><p id="r">\${b}</p>
</program>
`;
    const res = await compile(src);
    expect(programTemplate(res.client.html)).toContain('<textarea id="t"></textarea>');
    expect(await texts(src, ["r"])).toEqual(["3"]);
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

  test("legal: a handler calling it runs after the body", async () => {
    const src = `<program>
${SEVEN}
\${
    function g() -> int { return k; }
    let out: int = 0;
}
<button id="b" onclick={ out = g(); }>go</button>
\${ const k: int = seven(); }
<p id="a">\${k}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["a"])).toEqual(["7"]);
  }, 120000);
});

// =============================================================================
// B r1 (#2053 review MED-1) — a function VALUE body code hands on counts as called (§6.7.4 rule 3:
// "whatever receives it may call it"), so a reach through one is E-SCOPE-001 too. PA reading of
// ruling item 2's "calls a function reaching a binding whose place is later" (prov=pa-ruled S482
// r1, conditional; measured 0 newly rejected over 2964 corpus files). Red on 758b0577b: it
// compiled and showed k = 1 (k ran before the body), not 5.
// =============================================================================
describe("B r1 — body code reaching a later binding through a function value is E-SCOPE-001", () => {
  const RUN = `\${ let n: int = 1; }
\${ let out: int = 0; }
\${ function g() -> int { return k; } }
\${ function run(f: () => int) -> int { return f(); } }
\${ n = 5; }`;
  test("a statement passing a function, which the callee calls (the review's b-fnvalue)", async () => {
    const res = await result(`<program>
${RUN}
\${ out = run(g); }
<p id="a">\${out}</p>
\${ const k: int = n + 0; }
<p id="b">\${k}</p>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-SCOPE-001"]);
    expect(d[0].message).toContain("`k`");
  }, 120000);

  test("a display passing it (a call through a function value in a display is also E-VALUE-WRITE-UNPROVEN, §6.15)", async () => {
    expect(await errCodes(`<program>
${RUN}
<p id="a">\${run(g)}</p>
\${ const k: int = n + 0; }
</program>
`)).toContain("E-SCOPE-001");
  }, 120000);

  test("a function expression passed in body code", async () => {
    expect(await errCodes(`<program>
${RUN}
\${ out = run(() => k); }
\${ const k: int = n + 0; }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("a function value inside a function the body calls, at depth", async () => {
    expect(await errCodes(`<program>
${RUN}
\${ function h() -> int { return run(g); } }
\${ out = h(); }
\${ const k: int = n + 0; }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("over-refusal, stated: a function value handed on and never called while the body runs", async () => {
    // §7.6 rule (b) S482 r1: the analysis cannot tell a callee that ignores it; it counts as called
    expect(await errCodes(`<program>
${SEVEN}
\${
    function g() -> int { return k; }
    function keep(f: () => int) -> int { return 0; }
}
\${ keep(() => g()); }
\${ const k: int = seven(); }
</program>
`)).toEqual(["E-SCOPE-001"]);
  }, 120000);

  test("legal: the same shapes after the binding's place run in source order (5)", async () => {
    const src = `<program>
${RUN}
\${ const k: int = n + 0; }
\${ out = run(g); }
<p id="a">\${out}</p>
\${ out = out + run(() => k); }
<p id="b">\${out}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["a", "b"])).toEqual(["5", "10"]);
  }, 120000);

  test("legal: a function value in an event handler is not judged", async () => {
    // (and it does not run `k` before the body — s482-handler-reach,
    // g-boot-handler-reach-runs-binding-early-s482: `k` runs at its place, 5)
    const src = `<program>
${RUN}
<button id="x" onclick=\${ out = run(g); }>go</button>
\${ const k: int = n + 0; }
<p id="b">\${k}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["b"])).toEqual(["5"]);
  }, 120000);
});

// =============================================================================
// B r2 (#2053 r1 review MED-A) — a nested function DECLARATION inside a function body code reaches
// is its own callable: what it reads counts only through a call of it or its use as a value
// (§6.7.4 rule 3), at every depth — merely declaring it runs nothing. Red on 0548d92e4: the
// never-called `inner` below made `h()` "use" `k` (E-SCOPE-001); main and r0 compiled it (1 | 7).
// =============================================================================
describe("B r2 — a nested function declaration reaches a later binding only when called or used as a value", () => {
  const HEAD = `\${ let n: int = 1; }
\${ let out: int = 0; }
\${ function run(f: () => int) -> int { return f(); } }
\${ n = 5; }`;
  test("legal: a never-called nested declaration (the review's m-nested-decl) compiles and runs (1 | 7)", async () => {
    const src = `<program>
\${ let out: int = 0; }
\${ function h() -> int { function inner() -> int { return k; } return 1; } }
\${ out = h(); }
<p id="r">\${out}</p>
\${ const k: int = 7 + 0; }
<p id="s">\${k}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["r", "s"])).toEqual(["1", "7"]);
  }, 120000);

  test("legal: two levels of never-called nested declarations", async () => {
    const src = `<program>
\${ let out: int = 0; }
\${ function h() -> int {
    function mid() -> int { function deep() -> int { return k; } return 2; }
    return 1;
} }
\${ out = h(); }
<p id="r">\${out}</p>
\${ const k: int = 7 + 0; }
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["r"])).toEqual(["1"]);
  }, 120000);

  test("legal: two levels, the middle one called but the deepest never called", async () => {
    const src = `<program>
\${ let out: int = 0; }
\${ function h() -> int {
    function mid() -> int { function deep() -> int { return k; } return 2; }
    return mid();
} }
\${ out = h(); }
<p id="r">\${out}</p>
\${ const k: int = 7 + 0; }
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["r"])).toEqual(["2"]);
  }, 120000);

  test("a nested declaration that IS called: E-SCOPE-001 naming the path through it", async () => {
    const res = await result(`<program>
${HEAD}
\${ function h() -> int { function inner() -> int { return k; } return inner(); } }
\${ out = h(); }
\${ const k: int = n + 0; }
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-SCOPE-001"]);
    expect(d[0].message).toContain("calls `h()`, which reaches `inner()`, which uses `k`");
  }, 120000);

  // a nested function named as a value is itself INTERIM E-BOOTSTRAP-UNSUPPORTED (§7.3.1, the
  // bootstrap does not follow its closure out of its function); the reach is judged regardless
  test("a nested declaration used as a value (passed to a scrml function): E-SCOPE-001", async () => {
    const res = await result(`<program>
${HEAD}
\${ function h() -> int { function inner() -> int { return k; } return run(inner); } }
\${ out = h(); }
\${ const k: int = n + 0; }
</program>
`);
    const d = res.diagnostics.filter((x) => x.code === "E-SCOPE-001");
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("calls `h()`, which reaches `inner()`, which uses `k`");
  }, 120000);

  test("a nested declaration used as a value (returned): E-SCOPE-001", async () => {
    expect(await errCodes(`<program>
${HEAD}
\${ function h() -> () => int { function inner() -> int { return k; } return inner; } }
\${ out = run(h()); }
\${ const k: int = n + 0; }
</program>
`)).toContain("E-SCOPE-001");
  }, 120000);

  test("a nested declaration called inside a function expression handed on: E-SCOPE-001", async () => {
    const res = await result(`<program>
${HEAD}
\${ function h() -> int { function inner() -> int { return k; } return run(() => inner()); } }
\${ out = h(); }
\${ const k: int = n + 0; }
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-SCOPE-001"]);
    expect(d[0].message).toContain("calls `h()`, which reaches `inner()`, which uses `k`");
  }, 120000);

  test("two levels, each called: E-SCOPE-001 naming the deepest function", async () => {
    const res = await result(`<program>
${HEAD}
\${ function h() -> int {
    function mid() -> int { function deep() -> int { return k; } return deep(); }
    return mid();
} }
\${ out = h(); }
\${ const k: int = n + 0; }
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-SCOPE-001"]);
    expect(d[0].message).toContain("calls `h()`, which reaches `deep()`, which uses `k`");
  }, 120000);

  test("a never-called nested declaration beside a direct read still refuses the read", async () => {
    const res = await result(`<program>
${HEAD}
\${ function h() -> int { function inner() -> int { return 0; } return k; } }
\${ out = h(); }
\${ const k: int = n + 0; }
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-SCOPE-001"]);
    expect(d[0].message).toContain("calls `h()`, which uses `k`");
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
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const res = await result(`<program>
${LOGF}
<p if=(@f)>\${ const a: int = note("a"); }</p>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("`if=` element");
  }, 120000);

  test("deeper inside an `else` member", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const res = await result(`<program>
${LOGF}
<p if=(@f)>yes</p>
<div else><section><span>\${ let a: int = note("a"); }</span></section></div>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("`else` element");
  }, 120000);

  test("in the slot content of a component nested in another's slot content", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const res = await result(`<card t:string="x">
</> renders <div>\${t}<slot/></div>
<program>
${LOGF}
<card><div><card><b>\${ const a: int = note("a"); }</b></card></div></card>
</program>
`);
    const d = res.diagnostics.filter((x) => x.severity === "error");
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
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
// C (r1, #2053 review HIGH-1) — the same ruling names `<match>`: "A file-scope initializer that
// acts, written inside `if=` content, a component's slot content, or a `<match>`". A `${}` written
// directly in an arm is a parse error, but one nested in an element of an arm was not refused: it
// ran once, unconditionally, whichever arm showed (`post[a]` with the `Idle` arm hidden, in
// Chromium). analyze.scrml constructAt now names the arm. Red on the PR head 758b0577b.
// =============================================================================
describe("C r1 — an acting initializer inside a `<match>` arm is refused, naming the arm", () => {
  const LOGM = `\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 7; }
}
\${ type Ph:enum = { Idle, Ready, Done(n: int) } }
let <f:boolean=true/>
let <ph:Ph=.Ready/>`;
  async function refusal(body) {
    const res = await result(`<program>\n${LOGM}\n${body}\n<p id="r">post[\${log}]</p>\n</program>\n`);
    return res.diagnostics.filter((x) => x.severity === "error");
  }
  test("a non-binder arm that is not shown (the review's c-match-idle)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<match for=Ph on=@ph>
  <Idle><div><p>\${ const a: int = note("a"); }</p></div></>
  <Ready><p>ready</p></>
  <Done(n)><p>done</p></>
</match>`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the `<Idle>` arm of `<match for=Ph>`");
  }, 120000);

  test("deeper, in the arm that is shown, a `let`", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<match for=Ph on=@ph>
  <Idle><p>idle</p></>
  <Ready><section><div><span>\${ let a: int = note("a") + 1; }</span></div></section></>
  <Done(n)><p>done</p></>
</match>`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the `<Ready>` arm of `<match for=Ph>`");
  }, 120000);

  test("the wildcard arm, and a `<match>` with no `for=`", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<match on=@ph>
  <Ready><p>ready</p></>
  <_><div>\${ const a: int = note("a"); }</div></>
</match>`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the `<_>` arm of `<match>`");
  }, 120000);

  test("a binder arm (also refused by the bootstrap for its binders)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<match for=Ph on=@ph>
  <Idle><p>idle</p></>
  <Ready><p>ready</p></>
  <Done(n)><p>\${ const a: int = note("a"); }</p></>
</match>`);
    expect(d.map((x) => x.code)).toContain("E-VALUE-WRITES-STATE");
    expect(d.find((x) => x.code === "E-VALUE-WRITES-STATE").message).toContain("the `<Done>` arm of `<match for=Ph>`");
  }, 120000);

  test("a `<match>` inside `if=` content: the innermost construct (the arm) is named", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<div if=(@f)><match for=Ph on=@ph>
  <Idle><p>\${ const a: int = note("a"); }</p></>
  <Ready><p>ready</p></>
  <Done(n)><p>done</p></>
</match></div>`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the `<Idle>` arm of `<match for=Ph>`");
  }, 120000);

  test("an `if=` element inside an arm: the `if=` (innermost) is named", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<match for=Ph on=@ph>
  <Idle><p>idle</p></>
  <Ready><p if=(@f)>\${ const a: int = note("a"); }</p></>
  <Done(n)><p>done</p></>
</match>`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("`if=` element");
  }, 120000);

  test("an `<each>` row inside an arm (also refused for the row)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await refusal(`<match for=Ph on=@ph>
  <Idle><p>idle</p></>
  <Ready><ul><each in=([1, 2])><li>\${ const a: int = note("a"); }</li></each></ul></>
  <Done(n)><p>done</p></>
</match>`);
    expect(d.map((x) => x.code)).toContain("E-VALUE-WRITES-STATE");
    expect(d.find((x) => x.code === "E-VALUE-WRITES-STATE").message).toContain("the `<Ready>` arm of `<match for=Ph>`");
  }, 120000);

  test("legal: an initializer that does not act, inside an arm", async () => {
    const src = `<program>
\${ type Ph:enum = { Idle, Ready } }
let <ph:Ph=.Idle/>
<match for=Ph on=@ph>
  <Idle><p>\${ const a: int = 1 + 2; }</p></>
  <Ready><p>ready</p></>
</match>
<p id="r">\${a}</p>
</program>
`;
    expect(await errCodes(src)).toEqual([]);
    expect(await texts(src, ["r"])).toEqual(["3"]);
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

// =============================================================================
// A — ruling:user-voice-scrml.md-S481-run-order-followups item 1: "each seed is computed at its
// place in the sequence; records are still created at construction, so component identity (L12)
// is unchanged; a read of a seed before its place computes it early, on demand. Amends §66.7.6
// rule 5." Runtime `rt.hold` / `rt.seed` / `rt.seedAll` (slice-m1/runtime/runtime.js); print.scrml
// heldFields / liveSeedDecl / holdJs / seedPlaceJs / reachOf; lower.scrml programMarks (a program
// cell's declaration is its place). Red on base a27564881 (seeds ran at construction, before the
// body; a binding a seed read ran at module initialization, before an earlier body-top write).
// =============================================================================
describe("A — each seed is computed at its place in the body's run", () => {
  const P2C = (cell) => `<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const k: int = n + 0; }
${cell}
<p id="e">\${@c}</p>
</program>
`;
  test("the ruling's example: `${ n = 5; } ${ const k = n + 0; } <c:int=(k)/>` shows 5 (a derived cell and a `let` cell)", async () => {
    expect(await texts(P2C("<c:int=(k)/>"), ["e"])).toEqual(["5"]);
    expect(await texts(P2C("let <c:int=(k)/>"), ["e"])).toEqual(["5"]);
  }, 120000);

  test("seeds with effects run in source order among the initializers (cell, then component)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): a seed is a value
    // position — one that writes a file-scope `let` (`note` writes `log`) is refused where it writes.
    const src = `<card n:int=0>
    let <m:int=(note("m") + n)/>
</> renders <span id="cm">\${m}</span>
<program>
\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 1; }
    const a: int = note("a");
}
let <c:int=(note("c"))/>
\${ const b: int = note("b"); }
<div id="d"><card n=(b)/></div>
\${ const z: int = note("z"); }
<p id="r">\${log}</p>
<p id="cv">\${@c}</p>
</program>
`;
    // ~~expect(await texts(src, ["r", "cv", "cm"])).toEqual(["acbmz", "1", "2"]);~~
    expect([...new Set(await errCodes(src))]).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("a seed read early by a sibling seed runs then, once — not again at its place", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): a seed is a value
    // position — one that writes a file-scope `let` (`note` writes `log`) is refused where it writes.
    const src = `<program>
${LOG}
let <a:int=(note("a") + @b)/>
\${ const x: int = note("x"); }
let <b:int=(note("b"))/>
<p id="r">\${log}</p>
<p id="v">\${@a}</p>
</program>
`;
    // ~~expect(await texts(src, ["r", "v"])).toEqual(["abx", "14"]);~~
    expect([...new Set(await errCodes(src))]).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("a component's seed reads the body's value at its mount (before and after a write)", async () => {
    const src = `<card n:int=0>
    let <m:int=(n)/>
</> renders <span>\${m}</span>
<program>
\${ let o: int[free, write] = [1]; }
<div id="a"><card n=(o[0])/></div>
\${ o[0] = 10; }
<div id="c"><card n=(o[0])/></div>
</program>
`;
    expect(await texts(src, ["a", "c"])).toEqual(["1", "10"]);
  }, 120000);

  test("a write before its place runs the held seed first (every seed runs once)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): a seed is a value
    // position — one that writes a file-scope `let` (`note` writes `log`) is refused where it writes.
    const src = `<program>
${LOG}
\${ @c = 9; }
let <c:int=(note("c"))/>
<p id="r">\${log}</p>
<p id="v">\${@c}</p>
</program>
`;
    // ~~expect(await texts(src, ["r", "v"])).toEqual(["c", "9"]);~~
    expect([...new Set(await errCodes(src))]).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("seeds in `<each>` rows are computed when the row mounts (unchanged)", async () => {
    const src = `<item v:int=0>
    let <w:int=(v * 2)/>
</> renders <li>\${w}</li>
<program>
<xs:int[]=([1, 2, 3])/>
<ul id="u"><each in=@xs><item v=(@.)/></each></ul>
</program>
`;
    expect(await texts(src, ["u"])).toEqual(["246"]);
  }, 120000);

  test("a held seed does not bring a server-only value into the client", async () => {
    // s482-value-no-write: the seed no longer writes (a writing seed is refused, A1); it is still held
    const src = `<program db="./app.db">
${LOG}
\${
    const API_KEY: string = "zz-sk-live-123";
    server function keyed(s: string) -> string { return s + API_KEY; }
}
\${ function one(s: string) -> int { return 1; } }
let <c:int=(one("c"))/>
<p id="r">\${@c}</p>
</program>
`;
    const res = await compile(src);
    expect(res.client.js).not.toContain("zz-sk-live-123");
    expect(res.client.js).toContain("rt.hold(");
    expect(await texts(src, ["r"])).toEqual(["1"]);
  }, 120000);

  test("a literal seed is not held (nothing can observe where it runs): no hold / seed printed", async () => {
    const res = await compile(`<program>
let <c:int=0/>
<p id="v">\${@c}</p>
</program>
`);
    expect(res.client.js).not.toContain("rt.hold(");
    expect(res.client.js).not.toContain("rt.seed(");
  }, 120000);
});
