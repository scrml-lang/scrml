// effect-deps-mount-s482.test.js — lane s482-place-fu2 (#2082 r3 review HIGH-5).
//
// §7.6 rule (b) S482: a non-acting file-scope initializer inside a construct runs just before it; a read
// of what code INSIDE the construct writes before the initializer is E-FILE-SCOPE-INIT-IN-CONSTRUCT.
// An `<effect>`'s body does not run at the mount (E-EFFECT-NO-DEPS), but registering it reads each of
// its `deps=` — and an IMPORTED cell's seed runs at its first read. analyze bodyCodeBlocks had mapped
// `.Effect` to nothing, so `<effect deps=[@z]>` before `${ const k = n + 0; }`, `z` imported with a seed
// that writes `n`, compiled and showed k = 1 (source order: 5). The deps are now mount code (never the
// body). compiler/tests/browser/effect-deps-mount-chromium-s482.browser.test.js repeats it in Chromium.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-effect-deps-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

// x15 / x16 of the #2082 r3 review: a library whose cells' seeds write the exported `n`
const LIB = `\${ export let n: int = 1; }
\${ export function bumps() -> string { n = 5; return "s"; } }
\${ export function bumpb() -> boolean { n = 5; return true; } }
export let <z:string=(bumps())/>
export let <zb:boolean=(bumpb())/>
`;

let n = 0;
async function result(main, lib) {
  const d = join(dir, `c${n++}`);
  mkdirSync(d);
  if (lib !== undefined) writeFileSync(join(d, "lib.scrml"), lib);
  writeFileSync(join(d, "main.scrml"), main);
  return await compileSource(join(d, "main.scrml"));
}
async function codes(main, lib) {
  return (await result(main, lib)).diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}
async function texts(main, lib, ids) {
  const res = await result(main, lib);
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.map((d) => d.code + " " + d.message).join("; "));
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return ids.map((id) => String(run.body.querySelector("#" + id)?.textContent ?? "<none>"));
}

describe("an <effect>'s deps= are read at the mount (s482-place-fu2, #2082 r3 HIGH-5)", () => {
  test("refused: x15 — deps=[@z], z imported, its seed writes n, before the initializer", async () => {
    expect(await codes(`\${ import { n, z } from "./lib.scrml"; }
<program>
<div if=(true)><effect deps=[@z]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, LIB)).toEqual(["E-VALUE-WRITES-STATE", "E-VALUE-WRITES-STATE"]);   // s482-value-no-write: the seeds of z and zb (in lib) write `n` — refused where they write
  }, 120000);

  test("refused: x16 — deps=[@zb], a boolean seed", async () => {
    expect(await codes(`\${ import { n, zb } from "./lib.scrml"; }
<program>
<div if=(true)><effect deps=[@zb]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, LIB)).toEqual(["E-VALUE-WRITES-STATE", "E-VALUE-WRITES-STATE"]);   // s482-value-no-write: the seeds of z and zb (in lib) write `n` — refused where they write
  }, 120000);

  test("x15 control (<div>, the source order): the deps read runs z's seed first — 5", async () => {
    expect(await codes(`\${ import { n, z } from "./lib.scrml"; }
<program>
<div><effect deps=[@z]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, LIB)).toEqual(["E-VALUE-WRITES-STATE", "E-VALUE-WRITES-STATE"]);   // s482-value-no-write: the seeds of z and zb (in lib) write `n`
  }, 120000);

  test("legal: the effect AFTER the initializer — its deps read runs later, k = 1", async () => {
    expect(await codes(`\${ import { n, z } from "./lib.scrml"; }
<program>
<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p><effect deps=[@z]>\${ let q: int = 0; }</></div>
</program>
`, LIB)).toEqual(["E-VALUE-WRITES-STATE", "E-VALUE-WRITES-STATE"]);   // s482-value-no-write: the seeds of z and zb (in lib) write `n`
  }, 120000);

  test("legal: the effect's BODY still does not count — it writes n, but does not run at the mount", async () => {
    expect(await texts(`<program>
\${ let n: int = 1; }
let <c:int=0/>
<div if=(true)><effect deps=[@c]>\${ n = 5; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`, undefined, ["o"])).toEqual(["1"]);
  }, 120000);
});

// s482 (lane s482-hold-body — the #2088 review LOW-2 follow-up): two more placements of an effect whose `deps=`
// name an imported cell — a01, the keyword form `when @z changes` (EffectStmt, its own parse path), and a11, an
// effect in an `<each>` row (regionGatherBlocks). Under model (c) the library seed that writes `n` is refused
// where it writes (E-VALUE-WRITES-STATE); with a seed that writes nothing, registering the effect where it stands
// runs no user code — the seed ran before the body (ruling:user-voice-scrml.md-S482-outside-cell-seed-time) — and the
// effect's body is held until the body ends (ruling:user-voice-scrml.md-S482-hold-until-body-ends), so k = 1.
describe("#2088 LOW-2 follow-up: a01 (`when @z changes`) and a11 (an `<each>` row)", () => {
  const A01 = `\${ import { n, z } from "./lib.scrml"; }
<program>
<div if=(true)>\${ when @z changes { let q: int = 0; } }\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`;
  const A11 = `\${ import { n, z } from "./lib.scrml"; }
<program>
<xs:int[]=([1])/>
<div if=(true)><ul><each in=@xs as it><li><effect deps=[@z]>\${ let q: int = 0; }</>r</li></each></ul>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`;
  const QUIET = `\${ export let n: int = 1; }
export let <z:string="s"/>
`;
  test("a01: a writing library seed is refused where it writes", async () => {
    expect(await codes(A01, LIB)).toEqual(["E-VALUE-WRITES-STATE", "E-VALUE-WRITES-STATE"]);
  }, 120000);
  test("a11: a writing library seed is refused where it writes", async () => {
    expect(await codes(A11, LIB)).toEqual(["E-VALUE-WRITES-STATE", "E-VALUE-WRITES-STATE"]);
  }, 120000);
  test("a01 with a seed that writes nothing: compiles, k = 1", async () => {
    expect(await texts(A01, QUIET, ["o"])).toEqual(["1"]);
  }, 120000);
  test("a11 with a seed that writes nothing: compiles, k = 1", async () => {
    expect(await texts(A11, QUIET, ["o"])).toEqual(["1"]);
  }, 120000);
});
