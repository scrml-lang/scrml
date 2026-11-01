// scrml-boot-backfill-s474.test.js — the S474 backfill review of `scrml-boot` (scripts/scrml-boot.ts,
// PR #1467), fixed:
//   C1  `-o <dir>` deleted `<dir>/_scrml/`, `<dir>/_scrml_local/` and the server files with no ownership
//       check. A build now records what it wrote (.scrml-boot-manifest.json). It deletes and overwrites
//       only recorded files, and refuses an unrecorded file in its way.
//   T2  an internal crash exits 2 (it was untested, and a mutant that exited 1 survived).
//   C3  a leading UTF-8 BOM made the whole file one E-PARSE-ITEM and a cascade. It is dropped.
//   C2  `--columns bytes` prints UTF-8 byte columns (vim's `%c`). The default stays UTF-16, now tested.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");
const HI = "<program>\n  <main><p>hi</p></main>\n</program>\n";

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "scrml-boot-s474-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function boot(args) {
  const p = Bun.spawnSync(["bun", CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function source(name, text) {
  const f = join(tmp, name);
  writeFileSync(f, text);
  return f;
}

describe("C1 — `-o <dir>` touches only what a scrml-boot build wrote there", () => {
  test("a user's files under <dir>/_scrml/, <dir>/_scrml_local/ and a user program.server.js survive two compiles", () => {
    const out = join(tmp, "user-dir");
    mkdirSync(join(out, "_scrml", "mine"), { recursive: true });
    mkdirSync(join(out, "_scrml_local"), { recursive: true });
    writeFileSync(join(out, "_scrml", "mine", "notes.txt"), "keep 1\n");
    writeFileSync(join(out, "_scrml_local", "glue.js"), "keep 2\n");
    writeFileSync(join(out, "program.server.js"), "keep 3\n");
    writeFileSync(join(out, "README.md"), "keep 4\n");
    const f = source("hi.scrml", HI);
    for (const run of [1, 2]) {
      const r = boot(["compile", f, "-o", out]);
      expect({ run, code: r.code, err: r.err }).toEqual({ run, code: 0, err: "" });
    }
    expect(readFileSync(join(out, "_scrml", "mine", "notes.txt"), "utf8")).toBe("keep 1\n");
    expect(readFileSync(join(out, "_scrml_local", "glue.js"), "utf8")).toBe("keep 2\n");
    expect(readFileSync(join(out, "program.server.js"), "utf8")).toBe("keep 3\n");
    expect(readFileSync(join(out, "README.md"), "utf8")).toBe("keep 4\n");
    const manifest = JSON.parse(readFileSync(join(out, ".scrml-boot-manifest.json"), "utf8"));
    expect(manifest.files).toEqual(["index.html", "program.client.js", "scrml-runtime.js"]);
  }, 120000);

  test("an unrecorded file the build would overwrite is refused: exit 2, a clear message, nothing written", () => {
    const out = join(tmp, "clash-dir");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "index.html"), "<h1>my page</h1>\n");
    const r = boot(["compile", source("hi2.scrml", HI), "-o", out]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("refusing to write into");
    expect(r.err).toContain("index.html");
    expect(r.err).toContain(".scrml-boot-manifest.json");
    expect(r.err).not.toContain("internal error");
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe("<h1>my page</h1>\n");
    expect(readdirSync(out)).toEqual(["index.html"]);
  }, 120000);

  test("a recorded file the next build no longer writes is removed, with the directories it leaves empty; an unrecorded neighbour stays", async () => {
    const { compileFile, OUTPUT_MANIFEST } = await import(CLI);
    const out = join(tmp, "stale-dir");
    const f = source("hi3.scrml", HI);
    expect((await compileFile(f, { outDir: out })).ok).toBe(true);
    // as a previous build with a server half and a host module would have left it
    const m = JSON.parse(readFileSync(join(out, OUTPUT_MANIFEST), "utf8"));
    m.files.push("program.server.js", "_scrml/math/host.js", "_scrml_local/x/glue.js", "../escape.txt");
    writeFileSync(join(out, OUTPUT_MANIFEST), JSON.stringify(m));
    mkdirSync(join(out, "_scrml", "math"), { recursive: true });
    mkdirSync(join(out, "_scrml", "mine"), { recursive: true });
    mkdirSync(join(out, "_scrml_local", "x"), { recursive: true });
    writeFileSync(join(out, "program.server.js"), "old\n");
    writeFileSync(join(out, "_scrml", "math", "host.js"), "old\n");
    writeFileSync(join(out, "_scrml", "mine", "notes.txt"), "keep\n");
    writeFileSync(join(out, "_scrml_local", "x", "glue.js"), "old\n");
    writeFileSync(join(tmp, "escape.txt"), "outside\n");
    const r = await compileFile(f, { outDir: out });
    expect(r.ok).toBe(true);
    expect(existsSync(join(out, "program.server.js"))).toBe(false);
    expect(existsSync(join(out, "_scrml", "math"))).toBe(false);
    expect(existsSync(join(out, "_scrml_local"))).toBe(false);
    expect(readFileSync(join(out, "_scrml", "mine", "notes.txt"), "utf8")).toBe("keep\n");
    expect(readFileSync(join(tmp, "escape.txt"), "utf8")).toBe("outside\n"); // a `..` entry is ignored
    expect(JSON.parse(readFileSync(join(out, OUTPUT_MANIFEST), "utf8")).files).toEqual(["index.html", "program.client.js", "scrml-runtime.js"]);
  }, 120000);
});

describe("T2 — an internal (bootstrap) crash exits 2, not 1", () => {
  test("20,000 nested parentheses overflow the bootstrap parser's stack: `internal error`, exit 2, nothing written", () => {
    const f = source("parens.scrml", "<program>\n let <x:int=" + "(".repeat(20000) + "1" + ")".repeat(20000) + "/>\n</program>\n");
    const out = join(tmp, "crash-out");
    const r = boot(["compile", f, "-o", out]);
    expect(r.err).toContain("scrml-boot: internal error");
    expect(r.err).toContain("RangeError");
    expect(r.code).toBe(2);
    expect(existsSync(out)).toBe(false);
  }, 120000);
});

describe("C3 — a leading UTF-8 byte-order mark", () => {
  test("is dropped: the file compiles clean (exit 0), as it does without the mark", () => {
    const f = source("bom.scrml", "﻿" + HI);
    expect(readFileSync(f)[0]).toBe(0xef);
    const r = boot(["compile", f, "-o", join(tmp, "bom-out")]);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
  }, 120000);

  test("a BOM file's error on line 1 is reported at the column the user sees", () => {
    const f = source("bom-err.scrml", "﻿<program><p>${@nope}</p></program>\n");
    const r = boot(["compile", f, "--format", "line", "-o", join(tmp, "bom-err-out")]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("bom-err.scrml:1:");
    expect(r.err).not.toContain("E-PARSE-ITEM");
    const col = Number(/bom-err\.scrml:1:(\d+):/.exec(r.err)[1]);
    expect(col).toBe("<program><p>${".length + 1);
  }, 120000);
});

describe("C2 — the `--format line` column unit", () => {
  const EMOJI = "<program>\n    let <x:int=0/>\n    <main>\n        <p>😀😀 ${@nope}</p>\n    </main>\n</program>\n";
  test("is UTF-16 code units by default (two emoji = four units): col 19", () => {
    const r = boot(["compile", source("emoji.scrml", EMOJI), "--format", "line", "-o", join(tmp, "emoji-out")]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("emoji.scrml:4:19: error [E-STATE-UNDECLARED]");
  }, 120000);

  test("`--columns bytes` is UTF-8 bytes (two emoji = eight bytes), for vim's errorformat %c: col 23", () => {
    const r = boot(["compile", source("emoji2.scrml", EMOJI), "--format", "line", "--columns", "bytes", "-o", join(tmp, "emoji2-out")]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("emoji2.scrml:4:23: error [E-STATE-UNDECLARED]");
  }, 120000);

  test("`--columns` takes utf16 or bytes only (exit 2)", () => {
    const r = boot(["compile", source("emoji3.scrml", EMOJI), "--columns", "chars"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--columns is utf16 or bytes");
  });
});
