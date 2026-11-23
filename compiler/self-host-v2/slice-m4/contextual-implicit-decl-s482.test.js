// contextual-implicit-decl-s482.test.js — lane s482-small-followups (gap g-boot-contextual-implicit-decl-s482,
// #2066 review LOW-2).
//
// §50.8.5: "the keywordless bare naming statement (`x = 1`) … declares `x` exactly as `const x = 1` does".
// A contextual word that binds as a name — `from`, `as`, `some`, `pure`, `render`, `server`, `lin`, `of`
// (parse.scrml isContextualName / bindNameTok) — is such a name too: §35.2's S482 sentence lists `lin = 5;`
// as a read of the name, not the `lin` keyword. Analysis proved the declaration (no binding of the word in
// scope) and asked for the file to be re-read with the statement as a declaration (PNs.kw), but the
// parser's kwDeclAhead took only an identifier token, so the re-read did not happen and the statement was
// refused as "internal: … was not re-read as a declaration" (E-BOOTSTRAP-UNSUPPORTED) while `foo = 5;`
// compiled. Now each compiles as `const word = 5`, in a function body and at a program body top.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-kwdecl-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
async function shown(src) {
  const file = join(dir, `app${n++}.scrml`);
  writeFileSync(file, src);
  const res = await compileSource(file);
  const errs = res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message);
  if (!res.ok) return { errs };
  const r = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  return { errs, text: String(r.body.querySelector("#o")?.textContent ?? "<none>") };
}

const WORDS = ["lin", "of", "from", "as", "some", "pure", "render", "server", "foo"];

describe("a contextual word as a keywordless declaration (§50.8.5)", () => {
  for (const w of WORDS) {
    test(`\`${w} = 5;\` in a function body declares \`${w}\``, async () => {
      const r = await shown(`<program>
\${ fn f() -> number { ${w} = 5; return ${w} + 1; } }
<p id="o">\${f()}</p>
</program>
`);
      expect(r.errs).toEqual([]);
      expect(r.text).toBe("6");
    }, 120000);

    test(`\`${w} = 5;\` at a program body top declares \`${w}\``, async () => {
      const r = await shown(`<program>
\${ ${w} = 5; }
<p id="o">\${${w}}</p>
</program>
`);
      expect(r.errs).toEqual([]);
      expect(r.text).toBe("5");
    }, 120000);
  }

  test("the keyword readings are unchanged: `lin x = …` is the lin declaration, `server fn` the modifier", async () => {
    const r = await shown(`<program>
\${ fn f() -> number { lin x = 5; return x + 1; } }
\${ server fn g() -> number { return 2; } }
<p id="o">\${f()}</p>
</program>
`);
    expect(r.errs).toEqual([]);
    expect(r.text).toBe("6");
  }, 120000);
});
