// rcdata-init-place-s482.test.js — lane s482-place-fu, item 1 (#2079 review PRE-2).
//
// A file-scope initializer written inside `<textarea>` / `<title>` (content the HTML parser reads as
// text: it holds no place) was put just AFTER the element. The element's own content read the binding
// before that place, so the printer ran it at module initialization, with every binding its initializer
// reads: `${ n = 5; } ${ const m = n; } <p>${m}</p> <textarea>${ const k = m + 0; }${k}</textarea>`
// showed m = 1 and k = 1 (source order: 5 and 5). §7.6 rule (b) S482 (lane s482-place-fu): it runs just
// before the element. Code inside the element before the initializer that writes what it reads, or that
// runs before an initializer that acts, is E-FILE-SCOPE-INIT-IN-CONSTRUCT (the place before the element
// would run it after that code).
// compiler/tests/browser/rcdata-init-place-chromium-s482.browser.test.js repeats the values in Chromium.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-rcdata-place-")); });
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
// the value of each `#id` (a textarea's value), and the document title
async function values(src, ids) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  const doc = run.body.ownerDocument;
  return ids.map((id) => {
    if (id === "title") return String(doc.title);
    const el = run.body.querySelector("#" + id);
    if (!el) return "<none>";
    return String(el.tagName === "TEXTAREA" ? el.value : el.textContent);
  });
}

describe("1 — an initializer in `<textarea>` / `<title>` runs just before the element", () => {
  test("textarea: read through a file-scope const — m and k both 5 (base: 1 and 1)", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<textarea id="o2">\${ const k: int = m + 0; }\${k}</textarea>
</program>
`, ["o", "o2"])).toEqual(["5", "5"]);
  }, 120000);

  test("title: the same — m and the title both 5 (base: 1 and 1)", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<title>\${ const k: int = m + 0; }\${k}</title>
</program>
`, ["o", "title"])).toEqual(["5", "5"]);
  }, 120000);

  // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): an initializer in an
  // element whose content holds no place is a value position, and so is every display / attribute value there:
  // none may write a file-scope `let`. ~~The refusal of an acting initializer after code in the element~~
  // (INTERIM g-boot-rcdata-init-after-code-s482) is lifted: a call of a function that writes nothing is legal
  // anywhere in the element, and a writer is refused where it writes (E-VALUE-WRITES-STATE).
  test("a calling initializer first in the element runs before the element's text", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ function inc(x: int) -> int { return x + 2; } }
\${ n = 5; }
<textarea id="o2">\${ const k: int = inc(n); }\${k} \${n}</textarea>
<p id="o">\${n}</p>
</program>
`, ["o", "o2"])).toEqual(["5", "7 5"]);
  }, 120000);

  test("refused at the writer: a writing initializer in the element (~~ran in its place~~)", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = n + 1; return 7; } }
<textarea id="o2">\${ const k: int = bump(); }\${k}</textarea>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the initializer of `const k`, written inside `<textarea>`");
  }, 120000);

  test("refused at the writer: a display inside the element writes what the initializer reads", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<textarea id="o2">\${bump()}\${ const k: int = n + 0; }\${k}</textarea>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the interpolation calls `bump()`, which writes `n`");
  }, 120000);

  test("legal (INTERIM lifted): a calling initializer after a display in the element", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ function inc(x: int) -> int { return x + 2; } }
\${ n = 5; }
<title>\${n}\${ const k: int = inc(n); }</title>
<p id="o">\${k}</p>
</program>
`, ["o", "title"])).toEqual(["7", "5"]);
  }, 120000);

  test("legal (INTERIM lifted): a calling initializer after an attribute value of the element", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ function inc(x: int) -> int { return x + 2; } }
\${ n = 5; }
<textarea id="o2" rows=(n + 2)>\${ const k: int = inc(n); }\${k}</textarea>
</program>
`, ["o2"])).toEqual(["7"]);
  }, 120000);

  test("refused at the writer: an attribute value of the element that writes", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = n + 1; return 0; } }
<textarea rows=(bump() + 2)>\${ const k: int = n + 0; }\${k}</textarea>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("legal: a display before a non-acting initializer that does not write what it reads", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ n = 5; }
<textarea id="o2">\${n} \${ const k: int = n + 1; }\${k}</textarea>
</program>
`, ["o2"])).toEqual(["5 6"]);
  }, 120000);

  test("unchanged: an initializer in a plain element still runs in its place, among its children", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ function inc(x: int) -> int { return x + 2; } }
\${ n = 5; }
<div><b id="o2">\${n}</b>\${ const k: int = inc(n); }<p id="o">\${k}</p></div>
</program>
`, ["o2", "o"])).toEqual(["5", "7"]);
  }, 120000);

  // #2082 review HIGH-1 — the `bind:` reads `@s` at the mount, before the initializer: its seed runs there.
  // s482-value-no-write: the seed that writes is refused where it writes.
  test("refused at the writer: a `bind:` of the element names a later cell whose seed writes", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bumps() -> string { n = 5; return "s"; } }
<textarea id="o2" bind:value=@s>\${ const k: int = n + 0; }</textarea><p id="o">\${k}</p>
let <s:string=(bumps())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
    expect(d[0].message).toContain("the initializer of `@s` calls `bumps()`");
  }, 120000);

  // #2082 review LOW-1 — a literal attribute value is no code
  test("legal: a calling initializer after a literal attribute (rows=3) — source order", async () => {
    expect(await values(`<program>
\${ let n: int = 1; }
\${ function inc(x: int) -> int { return x + 2; } }
<textarea id="o2" rows=3 hidden=false>\${ const k: int = inc(n); }\${n}</textarea>
<p id="o">\${k}</p>
</program>
`, ["o", "o2"])).toEqual(["3", "1"]);
  }, 120000);
});
