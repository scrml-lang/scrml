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
