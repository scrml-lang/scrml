// scope-keys-root-s474.test.js — s474-boot-per-file-scope-keys, fix round r1 (review of #1706):
//
//   F1 — a component's per-file output key (S474 door 3: "The CSS scope key and output names are
//        always per-file qualified") hashes its file's path relative to the PROJECT root (§21.3:
//        the nearest ancestor holding `scrml.toml` or `.git`), not the import closure's common
//        directory. Before, one `ui/card.scrml` got a different key in every page whose closure
//        reached a different set of directories. The file names diagnostics show are unchanged.
//   F2 — one file on disk is one module: a file reached under a second spelling (a symlinked
//        directory) is not compiled twice under two keys. The bootstrap resolves imports by path
//        text, so the second spelling is refused by name (E-BOOTSTRAP-UNSUPPORTED).
//
// Real directories (the project-root marker is read from the disk), compiled with scrml-boot.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadM2 } from "./harness.js";

let mods, boot, tmp;
beforeAll(async () => {
  ({ mods } = loadM2());
  boot = await import("../../../scripts/scrml-boot.ts");
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "s474-keyroot-")));
}, { timeout: 120000 });
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const CARD = `export <card t:string/>\nrenders <div class="c">#{ .c { color: red; } }\${t}</div>\n`;
const PA = `import { card } from "./ui/card.scrml";\nexport <pa t:string/>\nrenders <section><card t=t/></section>\n`;
const APP1 = `import { pa } from "./pa.scrml";\n<program>\n    <main><pa t="1"/></main>\n</program>\n`;
// app2 also reaches OUTSIDE src/ — its closure's common directory is the project, not src/
const APP2 = `import { pa } from "./pa.scrml";\n<program>\n    \${ import { hello } from "../shared/x.scrml"; }\n    <main><p>\${hello()}</p><pa t="1"/></main>\n</program>\n`;
const X = `\${\n    export fn hello() -> string {\n        return "hi";\n    }\n}\n`;

let seq = 0;
function project(marker) {
  const root = join(tmp, `p${seq++}`);
  mkdirSync(join(root, "src", "ui"), { recursive: true });
  mkdirSync(join(root, "shared"), { recursive: true });
  if (marker) writeFileSync(join(root, marker), marker === "scrml.toml" ? "" : "");
  writeFileSync(join(root, "src", "ui", "card.scrml"), CARD);
  writeFileSync(join(root, "src", "pa.scrml"), PA);
  writeFileSync(join(root, "src", "app1.scrml"), APP1);
  writeFileSync(join(root, "src", "app2.scrml"), APP2);
  writeFileSync(join(root, "shared", "x.scrml"), X);
  return root;
}
const keysOf = (html) => [...html.matchAll(/data-scrml="([^"]*)"/g)].map((m) => m[1]);
const cardKey = (c) => keysOf(c.client.html).find((k) => k.startsWith("card~"));
const errors = (c) => c.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code}: ${d.message}`);

describe("F1 — the key hashes the PROJECT-relative path (§21.3 root)", () => {
  test("two pages sharing one card.scrml emit the SAME key (a scrml.toml project)", async () => {
    const root = project("scrml.toml");
    const c1 = await boot.compileSource(join(root, "src", "app1.scrml"));
    const c2 = await boot.compileSource(join(root, "src", "app2.scrml"));
    expect(errors(c1)).toEqual([]);
    expect(errors(c2)).toEqual([]);
    expect(cardKey(c1)).toBe(cardKey(c2));
    expect(keysOf(c1.client.html).find((k) => k.startsWith("pa~"))).toBe(keysOf(c2.client.html).find((k) => k.startsWith("pa~")));
    // the key path is the project-relative path
    expect(cardKey(c1)).toBe(mods.core.scopeKey("src/ui/card.scrml", "card"));
  }, 120000);

  test("a `.git` directory marks the project root too", async () => {
    const root = project(null);
    mkdirSync(join(root, ".git"));
    const c1 = await boot.compileSource(join(root, "src", "app1.scrml"));
    const c2 = await boot.compileSource(join(root, "src", "app2.scrml"));
    expect(cardKey(c1)).toBe(cardKey(c2));
    expect(cardKey(c1)).toBe(mods.core.scopeKey("src/ui/card.scrml", "card"));
  }, 120000);

  test("the reported file names are unchanged: still relative to the source root", async () => {
    const root = project("scrml.toml");
    writeFileSync(join(root, "src", "bad.scrml"), `import { pa } from "./pa.scrml";\n<program>\n    <main><nope/></main>\n</program>\n`);
    const c = await boot.compileSource(join(root, "src", "bad.scrml"));
    const d = c.diagnostics.find((x) => x.severity === "error");
    expect(d.file).toBe(join(root, "src", "bad.scrml"));
  }, 120000);

  test("projectRootOf / keyBaseOf: the nearest marker; with none, the source root (the SPEC's fallback)", () => {
    const root = project("scrml.toml");
    expect(boot.projectRootOf(join(root, "src"))).toBe(root);
    expect(boot.keyBaseOf(join(root, "src"))).toBe("src");
    expect(boot.keyBaseOf(root)).toBe("");
    expect(boot.keyBaseOf(join(root, "src", "ui"))).toBe("src/ui");
    expect(mods.core.fileKeyPath("src", "ui/card.scrml")).toBe("src/ui/card.scrml");
    expect(mods.core.fileKeyPath("", "ui/card.scrml")).toBe("ui/card.scrml");
    expect(mods.core.fileKeyPath("src", "scrml:ui/index.scrml")).toBe("scrml:ui/index.scrml");
  });
});

describe("F2 — one file on disk is one module (a symlinked spelling)", () => {
  test("a file imported as ./ui/card.scrml AND ./ui2/card.scrml (ui2 -> ui) is refused by name, compiled once", async () => {
    const root = project("scrml.toml");
    symlinkSync("ui", join(root, "src", "ui2"));
    writeFileSync(join(root, "src", "pb.scrml"), `import { card } from "./ui2/card.scrml";\nexport <pb t:string/>\nrenders <section><card t=t/></section>\n`);
    writeFileSync(join(root, "src", "app.scrml"), `import { pa } from "./pa.scrml";\nimport { pb } from "./pb.scrml";\n<program>\n    <main><pa t="1"/><pb t="2"/></main>\n</program>\n`);
    const c = await boot.compileSource(join(root, "src", "app.scrml"));
    expect(c.ok).toBe(false);
    const es = c.diagnostics.filter((d) => d.severity === "error");
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(es[0].message).toContain("one file on disk");
    // the closure holds the file once
    expect(c.files.filter((f) => f.endsWith("card.scrml")).length).toBe(1);
  }, 120000);

  test("sourceClosure: the second spelling is reported, not walked", () => {
    const root = project("scrml.toml");
    symlinkSync("ui", join(root, "src", "ui2"));
    writeFileSync(join(root, "src", "pb.scrml"), `import { card } from "./ui2/card.scrml";\nexport <pb t:string/>\nrenders <section><card t=t/></section>\n`);
    const app = join(root, "src", "app.scrml");
    writeFileSync(app, `import { pa } from "./pa.scrml";\nimport { pb } from "./pb.scrml";\n<program>\n    <main><pa t="1"/><pb t="2"/></main>\n</program>\n`);
    const reads = (f, src) => [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    const aliases = [];
    const files = boot.sourceClosure(reads, app, undefined, aliases);
    expect(files.filter((f) => f.endsWith("card.scrml")).length).toBe(1);
    expect(aliases.length).toBe(1);
    expect(aliases[0].spelling.endsWith("card.scrml")).toBe(true);
    expect(aliases[0].spelling).not.toBe(aliases[0].first);
  });
});
