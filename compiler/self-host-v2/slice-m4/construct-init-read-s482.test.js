// construct-init-read-s482.test.js — lane s482-small-followups, item E (#2071 review INFO-1; gap
// g-boot-nested-init-reads-body-write-s482), and its follow-up, lane s482-construct-init-fu (#2076 review
// MED-1 / LOW-1).
//
// §7.6 rule (b) S482: a file-scope initializer inside the content of an `if=` / `else-if=` / `else`
// element, a component's slot content or a `<match>` arm that ACTS is E-FILE-SCOPE-INIT-IN-CONSTRUCT.
// #2076 counted a read of anything body code writes, anywhere, as acting: the place was just AFTER the
// construct, the construct's content read the binding before it, so the printer ran it at module
// initialization. That still gave a wrong value through a `const` (`${ n = 5; } ${ const m = n; }
// <p>${m}</p> <div if=(m > 0)>${ const k = m + 0; }…` showed m = 1, k = 1 — the early `k` pulled `m`
// early too), and it refused a write AFTER the construct that nobody can observe.
//
// s482-construct-init-fu: "One that does not act runs once, just before the construct … it sees every
// write the body makes before the construct, and none it makes after, as source order does." A read of
// what code INSIDE the construct writes before the initializer (its attributes, an earlier chain member's
// test, its content, a component used there) still counts as acting: source order runs that write first,
// the place before the construct does not (PA reading of ruling:user-voice-scrml.md-S481-nested-init-
// chain-comments item 1, narrowed; prov=pa-ruled; 0 corpus files hold a non-acting initializer in a
// construct). compiler/tests/browser/construct-init-place-chromium-s482.browser.test.js repeats the
// values in Chromium.

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

describe("a write inside the construct, before the initializer, is refused — at the writer (s482-value-no-write)", () => {
  test("in the `if=` test (a function the test calls writes `n`)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 1; } }
<div if=(bump() > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("in a display of the content before it", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)><p>\${bump()}</p>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("in the test of an earlier member of the if-chain (the place is before the chain)", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 1; } }
<div if=(bump() < 0)>x</div>
<div else>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("in the renders of the component whose slot content holds it", async () => {
    // s482 (lane s482-value-no-write; ruling:user-voice-scrml.md-S482-runorder-model-c A1): the writer is a value
    // position (§6.15) — refused where it writes, E-VALUE-WRITES-STATE; ~~E-FILE-SCOPE-INIT-IN-CONSTRUCT~~ at the reader
    const d = await errors(`\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<card t:string="x">
</> renders <div>\${bump()}<slot/></div>
<program>
<card><b>\${ const k: int = n * 2; }</b><p id="s">\${k}</p></card>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);
});

describe("legal: the place is just before the construct — the source-order value", () => {
  test("#2076 MED-1: read through a file-scope const — m and k both 5 (base: 1 and 1)", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<div if=(m > 0)>\${ const k: int = m + 0; }<p id="o2">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["o", "o2"])).toEqual(["5", "5"]);
  }, 120000);

  test("the #2071 probe: `n` written by a body-top statement before the construct (#2076 refused it)", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ n = 5; }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["s"])).toEqual(["5"]);
  }, 120000);

  test("written through a function the body calls before the construct", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ function bump() { n = 5; } }
\${ bump(); }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["s"])).toEqual(["5"]);
  }, 120000);

  test("#2076 LOW-1: a write after the construct, or after the initializer inside it, is not seen", async () => {
    const after = `<program>
\${ let n: int = 5; }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div>
\${ n = 9; }
</program>
`;
    expect(await errors(after)).toEqual([]);
    expect(await texts(after, ["s"])).toEqual(["5"]);
    const inside = `<program>
\${ let n: int = 5; }
\${ function bump() -> int { n = 9; return 0; } }
<div if=(true)>\${ const k: int = n + 0; }<p id="s">\${k}</p><p>\${bump()}</p></div>
</program>
`;
    // s482 (lane s482-value-no-write, A1): the display after the initializer writes `n` — a render
    // expression that writes a file-scope `let` is refused where it writes
    // ~~expect(await errors(inside)).toEqual([]); expect(await texts(inside, ["s"])).toEqual(["5"]);~~
    expect((await errors(inside)).map((x) => x.code)).toEqual(["E-VALUE-WRITES-STATE"]);
  }, 120000);

  test("in an `else` member, read through a const", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<div if=(m < 0)>x</div>
<div else>\${ const k: int = m + 0; }<p id="o2">\${k}</p></div>
</program>
`;
    expect(await errors(src)).toEqual([]);
    expect(await texts(src, ["o", "o2"])).toEqual(["5", "5"]);
  }, 120000);

  test("in a `<match>` arm and in slot content", async () => {
    const arm = `<program>
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
`;
    expect(await errors(arm)).toEqual([]);
    expect(await texts(arm, ["r"])).toEqual(["5"]);
    const slot = `<card t:string="x">
</> renders <div>\${t}<slot/></div>
<program>
\${ let n: int = 1; }
\${ n = 5; }
<card><b>\${ const k: int = n * 2; }</b></card>
<p id="r">\${k}</p>
</program>
`;
    expect(await errors(slot)).toEqual([]);
    expect(await texts(slot, ["r"])).toEqual(["10"]);
  }, 120000);

  test("nested constructs: the place is before the outermost one", async () => {
    const src = `<program>
\${ let n: int = 1; }
\${ n = 5; }
<section><div if=(n > 0)><div if=(n > 1)>\${ const k: int = n + 0; }<p id="s">\${k}</p></div></div></section>
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
