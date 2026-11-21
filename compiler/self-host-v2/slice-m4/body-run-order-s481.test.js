// body-run-order-s481.test.js — lane s481-body-run-order: the program body runs once, top to bottom,
// in source order (SPEC §7.6 S481, §40.8).
// Ruling: user-voice-scrml.md "⭐ RULED — program-body run order: one source-ordered sequence (#2025
// review P1–P3), PA rec adopted (S481)" — "The program body runs once, top to bottom, in source
// order, and that sequence is the module initialization. Every file-scope initializer runs whether
// or not anything reads it, so the S480 tool ruling extends to web programs. A display of a `free`
// value reads it where it stands." (owner: "yes, adopt your rec on P1–P3").
// Gaps g-spec-file-scope-unread-init-web-s481 (P1), g-spec-file-scope-init-vs-body-top-write-s481
// (P2), g-spec-body-render-order-free-s481 (P3).
//
// Every case runs on the SHIPPING path: the bootstrap CLI artifact (scripts/scrml-boot.ts
// `compileSource` → print.scrml printProgram) executed by the conformance runner's
// `runBootstrapArtifact` (happy-dom). Red on base 0d775f390: P1 rendered "1" (the unread
// initializer was never printed), P2 rendered "1" (the initializer ran at module initialization,
// before the earlier body-top write). P3 already rendered "1" / "10" there; it is pinned so the
// sequence keeps it.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s481-body-order-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function compile(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  return res;
}
async function texts(src, ids) {
  const res = await compile(src);
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim());
}

const P1 = `<program>
\${
    let o: int[free, write] = [1];
    function bump() -> int { o[0] = o[0] + 10; return o[0]; }
    const unused: int = bump();
}
<p id="c">\${o[0]}</p>
</program>
`;

const P2 = `<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const k: int = n; }
<p id="c">\${k}</p>
</program>
`;

const P3 = `<program>
\${ let o: int[free, write] = [1]; }
<p id="a">\${o[0]}</p>
\${ o[0] = 10; }
<p id="c">\${o[0]}</p>
</program>
`;

describe("§7.6 S481 — one source-ordered program body (ruling S481 P1–P3)", () => {
  test("P1: an initializer nothing reads still runs (its effect is seen)", async () => {
    expect(await texts(P1, ["c"])).toEqual(["11"]);
  }, 120000);

  test("P2: an initializer runs after the body-top statement written before it", async () => {
    expect(await texts(P2, ["c"])).toEqual(["5"]);
  }, 120000);

  test("P3: a display of a `free` value reads it where it stands", async () => {
    expect(await texts(P3, ["a", "c"])).toEqual(["1", "10"]);
  }, 120000);

  test("several unread initializers run in source order, between the body's statements", async () => {
    const src = `<program>
\${
    let log: string = "";
    function note(s: string) -> int { log = log + s; return 0; }
    const a: int = note("a");
}
\${ note("b"); }
\${ const c: int = note("c"); }
<p id="c">\${log}</p>
</program>
`;
    expect(await texts(src, ["c"])).toEqual(["abc"]);
  }, 120000);
});

describe("§7.6 S481 — a binding read before its place is set before it is read", () => {
  test("a cell seed that reads a file-scope binding sees its value", async () => {
    const src = `<program>
\${
    function three() -> int { return 3; }
    const start: int = three();
}
let <c:int=(start)/>
<p id="c">\${@c}</p>
</program>
`;
    expect(await texts(src, ["c"])).toEqual(["3"]);
  }, 120000);

  test("a component's use-site value, seeded at construction, reads the binding set (not undefined)", async () => {
    // the instances the body mounts unconditionally are constructed with the program (§66.7.6
    // L12 (b)), so `o` is set before construction; where a use-site value sits in the sequence is
    // the open owner question (§66.7.6 rule 5 vs S481) — both instances read 1 today
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
    expect(await texts(src, ["a", "c"])).toEqual(["1", "1"]);
  }, 120000);

  test("a display before the place, through a function, reads the binding set", async () => {
    const src = `<program>
\${
    function seven() -> int { return 7; }
    function g() -> int { return k; }
}
<p id="a">\${g()}</p>
\${ const k: int = seven(); }
<p id="c">\${k}</p>
</program>
`;
    expect(await texts(src, ["a", "c"])).toEqual(["7", "7"]);
  }, 120000);

  test("a derived cell over a free value: e02 (with a CSS bridge) / e03 keep their values", async () => {
    const e02 = `<program>
\${ let o: int[free, write] = [1]; }
<s:int=100/>
<dd:int=(@s + o[0])/>
\${ o[0] = 10; }
<p id="c" class="x">\${@dd}</p>
#{ .x { width: @dd; } }
</program>
`;
    const e03 = `<program>
\${ let o: int[free, write] = [1]; }
<s:int=100/>
<dd:int=(@s + o[0])/>
<p id="a">\${@dd}</p>
\${ o[0] = 10; }
<p id="c">\${@dd}</p>
</program>
`;
    expect(await texts(e02, ["c"])).toEqual(["101"]);
    expect(await texts(e03, ["a", "c"])).toEqual(["101", "101"]);
  }, 120000);
});

describe("§7.6 S481 — artifacts", () => {
  test("a binding only server code reads stays out of the client artifact", async () => {
    const src = `<program>
\${
    const SALT: string = "zz-server-only-salt";
    server function salted(s: string) -> string { return s + SALT; }
}
<p id="c">hi</p>
</program>
`;
    const res = await compile(src);
    expect(res.client.js).not.toContain("zz-server-only-salt");
  }, 120000);

  test("an in-sequence binding is declared at module level and assigned in its place", async () => {
    const res = await compile(P2);
    expect(res.client.js).toMatch(/^let k;$/m);
    expect(res.client.js).toMatch(/k = n;/);
  }, 120000);
});
