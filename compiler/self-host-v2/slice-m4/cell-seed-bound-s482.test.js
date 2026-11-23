// cell-seed-bound-s482.test.js — lane s482-place-fu, item 2 (#2079 review LOW-1).
//
// §7.6 rule (b) S482 (s482-construct-init-fu): a non-acting file-scope initializer inside a construct
// runs just before it; a read of what code INSIDE the construct writes before the initializer is
// E-FILE-SCOPE-INIT-IN-CONSTRUCT. analyze constructWrites counted the seed of EVERY program cell whose
// place is at or after the construct's start — no upper bound, no check that anything there runs it —
// so a cell declared AFTER the construct with a writing seed (`let <z:int=(bump())/>`) was refused, with
// a message putting the write inside the construct. Now a seed counts only when it runs between the
// construct's start and the initializer: its place is there, or code there uses the cell (directly,
// through a function, or through another such seed) — "a read of a seed before its place computes it
// then" (§7.6 rule (b) S482).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-seed-bound-")); });
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

describe("a cell seed counts only when it runs between the construct's start and the initializer", () => {
  test("a writing seed of a cell declared AFTER the construct, not used in it, is not refused (base: refused)", async () => {
    expect(await texts(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
let <z:int=(bump())/>
<p id="o2">\${@z}\${n}</p>
</program>
`, ["o", "o2"])).toEqual(["1", "05"]);
  }, 120000);

  test("legal: the cell is read inside the construct AFTER the initializer", async () => {
    expect(await texts(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p><p id="o2">\${@z}</p></div>
let <z:int=(bump())/>
</program>
`, ["o", "o2"])).toEqual(["1", "0"]);
  }, 120000);

  test("refused: the cell is read inside the construct before the initializer (its seed runs there)", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)><p>\${@z}</p>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
    expect(d[0].message).toContain("reads `n`, which the program body writes inside that construct, before it");
  }, 120000);

  test("refused: the cell is read there through a function", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function rz() -> int { return @z; } }
<div if=(true)><p>\${rz()}</p>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("refused: the cell is read there through the seed of another later cell", async () => {
    const d = await errors(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<div if=(true)><p>\${@y}</p>\${ const k: int = n + 0; }<p>\${k}</p></div>
let <y:int=(@z + 1)/>
let <z:int=(bump())/>
</program>
`);
    expect(d.map((x) => x.code)).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
  }, 120000);
});
