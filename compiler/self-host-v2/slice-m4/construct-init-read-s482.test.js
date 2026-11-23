// construct-init-read-s482.test.js — lane s482-small-followups, item E (#2071 review INFO-1; gap
// g-boot-nested-init-reads-body-write-s482).
//
// §7.6 rule (b) S482: a file-scope initializer inside the content of an `if=` / `else-if=` / `else`
// element, a component's slot content or a `<match>` arm that ACTS is E-FILE-SCOPE-INIT-IN-CONSTRUCT;
// "One that does not act runs once, just after the construct: nothing can observe where it ran." That
// holds only while what it reads is written by no body code. `${ n = 5; } <div if=(n > 0)>${ const k:
// int = n + 0; }<p>${k}</p></div>` showed 1 in Chromium (source order: 5) — the content reads `k`, so the
// printer ran it at module initialization, before `n = 5`. A read of a file-scope `let` or a program cell
// that body code writes (a body-top statement, a display, an initializer or a seed, directly or through a
// function it calls — not an event handler, an `<effect>` or a `<request>`) now counts as acting
// (PA reading of ruling:user-voice-scrml.md-S481-nested-init-chain-comments item 1, prov=pa-ruled;
// 0 of 2969 corpus files hold any non-acting file-scope initializer in a construct).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-ctor-read-")); });
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
async function texts(src, ids, steps = []) {
  const res = await result(src);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, steps, {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>"));
}

describe("a non-acting initializer in a construct that reads what the body writes is refused", () => {
  test("the review's probe: `n` written by a body-top statement, read in `if=` content", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ n = 5; }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("the initializer of `const k` reads `n`, which the program body writes");
    expect(d[0].message).toContain("the content of an `if=` element (`<div if=…>`)");
  }, 120000);

  test("written through a function the body calls", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() { n = 5; } }
\${ bump(); }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  // (a program cell read in a file-scope initializer is refused before this rule — E-BOOTSTRAP-UNSUPPORTED,
  // INTERIM g-boot-file-scope-init-residue-s479 — so the cell half of the rule is not reachable yet)
  test("in a `<match>` arm and in slot content", async () => {
    const arm = await errors(`<program>
\${ type Ph:enum = { Idle, Ready } }
let <ph:Ph=.Idle/>
\${ let n: int = 1; }
\${ n = 5; }
<match for=Ph on=@ph>
  <Idle><p>\${ const k: int = n + 0; }</p></>
  <Ready><p>ready</p></>
</match>
<p id="r">\${k}</p>
</program>
`);
    expect(arm.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(arm[0].message).toContain("reads `n`, which the program body writes");
    expect(arm[0].message).toContain("the `<Idle>` arm of `<match for=Ph>`");
    const slot = await errors(`<card t:string="x">
</> renders <div>\${t}<slot/></div>
<program>
\${ let n: int = 1; }
\${ n = 5; }
<card><b>\${ const k: int = n * 2; }</b></card>
<p id="r">\${k}</p>
</program>
`);
    expect(slot.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(slot[0].message).toContain("slot content of `<card>`");
  }, 120000);
});

describe("legal: what it reads is written by no body code (where it runs cannot be observed)", () => {
  test("`n` written by nobody: the value is the source-order value", async () => {
    const src = `<program>
\${ let n: int = 5; }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["s"])).toEqual(["5"]);
  }, 120000);

  test("`n` written only by an event handler (it runs after the body)", async () => {
    const src = `<program>
\${ let n: int = 5; }
<button id="b" onclick=\${ n = 7; }>b</button>
<div if=(n > 0)>\${ const k: int = n + 2; }<p id="s">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["s"])).toEqual(["7"]);
  }, 120000);

  test("outside a construct the place is in source order (unchanged)", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ n = 5; }
<div>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["s"])).toEqual(["5"]);
  }, 120000);
});
