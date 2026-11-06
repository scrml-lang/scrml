// S475 (s475-boot-tooling-hardening r1, review F4) — `scrml-boot -o` writeOutputs, basic behaviour, in BOTH
// OutTree modes: "auto" (held directories through /proc/self/fd on Linux; on macOS and Windows it IS the
// paths mode) and "paths" (forced). This file lives in compiler/tests/unit so that the `windows` CI job,
// which runs compiler/tests/unit, exercises writeOutputs on its real fallback platform (the race and
// move tests stay Linux-only, in compiler/self-host-v2/slice-m4/scrml-boot-output-hardening-s475.test.js).
// A shape the platform cannot create (a junction / symbolic link without the privilege) is skipped, by a
// probe at load time; everything else runs everywhere.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");

const probe = (make) => {
  const d = mkdtempSync(join(tmpdir(), "scrml-boot-probe-"));
  try {
    mkdirSync(join(d, "t"));
    writeFileSync(join(d, "f"), "x");
    make(d);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
};
// a directory link: a junction on Windows (no privilege needed), a symbolic link elsewhere
const CAN_DIR_LINK = probe((d) => symlinkSync(join(d, "t"), join(d, "l"), "junction"));
const CAN_FILE_LINK = probe((d) => symlinkSync(join(d, "f"), join(d, "l"), "file"));
const CAN_HARD_LINK = probe((d) => linkSync(join(d, "f"), join(d, "h")));

let tmp;
let n = 0;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "scrml-boot-wo-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const fresh = () => {
  const d = join(tmp, `w${n++}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const refusal = (f) => {
  try {
    f();
  } catch (e) {
    return e;
  }
  return null;
};

for (const mode of ["auto", "paths"]) {
  describe(`writeOutputs (${mode} mode)`, () => {
    test("a fresh build writes every output, nested directories, a copied file and the manifest", async () => {
      const { writeOutputs, readOutputManifest } = await import(CLI);
      const w = fresh();
      const out = join(w, "out");
      const src = join(w, "host.js");
      writeFileSync(src, "export const x = 1;\n");
      writeOutputs(out, [{ rel: "index.html", text: "<!doctype html>one\n" }, { rel: "_scrml/m/host.js", src }, { rel: "_scrml/a/b/c.js", text: "c\n" }], mode);
      expect(readFileSync(join(out, "index.html"), "utf8")).toBe("<!doctype html>one\n");
      expect(readFileSync(join(out, "_scrml", "m", "host.js"), "utf8")).toBe("export const x = 1;\n");
      expect(readFileSync(join(out, "_scrml", "a", "b", "c.js"), "utf8")).toBe("c\n");
      expect(readOutputManifest(out)).toEqual(["_scrml/a/b/c.js", "_scrml/m/host.js", "index.html"]);
      // no temp file is left behind
      expect(readdirSync(out).sort()).toEqual([".scrml-boot-manifest.json", "_scrml", "index.html"]);
      expect(readdirSync(join(out, "_scrml", "m"))).toEqual(["host.js"]);
    });

    test("a rebuild replaces its outputs, removes the one it no longer writes and prunes the emptied directory", async () => {
      const { writeOutputs, readOutputManifest } = await import(CLI);
      const out = join(fresh(), "out");
      writeOutputs(out, [{ rel: "index.html", text: "one\n" }, { rel: "_scrml/gone/x.js", text: "x\n" }], mode);
      writeOutputs(out, [{ rel: "index.html", text: "two\n" }], mode);
      expect(readFileSync(join(out, "index.html"), "utf8")).toBe("two\n");
      expect(existsSync(join(out, "_scrml"))).toBe(false);
      expect(readOutputManifest(out)).toEqual(["index.html"]);
    });

    test("a file no build recorded is refused (OutDirError) and nothing is written", async () => {
      const { writeOutputs, OutDirError, OUTPUT_MANIFEST } = await import(CLI);
      const out = fresh();
      writeFileSync(join(out, "index.html"), "mine\n");
      const e = refusal(() => writeOutputs(out, [{ rel: "index.html", text: "build\n" }, { rel: "a.js", text: "a\n" }], mode));
      expect(e).toBeInstanceOf(OutDirError);
      expect(readFileSync(join(out, "index.html"), "utf8")).toBe("mine\n");
      expect(existsSync(join(out, "a.js"))).toBe(false);
      expect(existsSync(join(out, OUTPUT_MANIFEST))).toBe(false);
    });

    test("an output name near the 255-byte limit is written (its temp name is shortened)", async () => {
      const { writeOutputs } = await import(CLI);
      const out = join(fresh(), "out");
      const long = "n".repeat(240) + ".js";
      writeOutputs(out, [{ rel: `_scrml/${long}`, text: "long\n" }], mode);
      expect(readFileSync(join(out, "_scrml", long), "utf8")).toBe("long\n");
      expect(readdirSync(join(out, "_scrml"))).toEqual([long]);
    });

    test("a file where -o should be is refused", async () => {
      const { writeOutputs, OutDirError } = await import(CLI);
      const f = join(fresh(), "out");
      writeFileSync(f, "a file\n");
      expect(refusal(() => writeOutputs(f, [{ rel: "index.html", text: "x\n" }], mode))).toBeInstanceOf(OutDirError);
      expect(readFileSync(f, "utf8")).toBe("a file\n");
    });

    test.skipIf(!CAN_HARD_LINK)("a recorded output hard-linked to an outside file is replaced; the outside file keeps its text", async () => {
      const { writeOutputs } = await import(CLI);
      const w = fresh();
      const out = join(w, "out");
      writeOutputs(out, [{ rel: "_scrml/a.js", text: "1\n" }], mode);
      const outside = join(w, "notes.txt");
      writeFileSync(outside, "my notes\n");
      rmSync(join(out, "_scrml", "a.js"));
      linkSync(outside, join(out, "_scrml", "a.js"));
      writeOutputs(out, [{ rel: "_scrml/a.js", text: "2\n" }], mode);
      expect(readFileSync(outside, "utf8")).toBe("my notes\n");
      expect(readFileSync(join(out, "_scrml", "a.js"), "utf8")).toBe("2\n");
    });

    test.skipIf(!CAN_DIR_LINK)("a directory link (junction / symbolic link) at `_scrml` is refused; its target is untouched", async () => {
      const { writeOutputs, OutDirError } = await import(CLI);
      const w = fresh();
      const out = join(w, "out");
      writeOutputs(out, [{ rel: "index.html", text: "1\n" }, { rel: "_scrml/m/host.js", text: "1\n" }], mode);
      const victim = join(w, "victim");
      mkdirSync(join(victim, "m"), { recursive: true });
      writeFileSync(join(victim, "m", "host.js"), "precious\n");
      rmSync(join(out, "_scrml"), { recursive: true });
      symlinkSync(victim, join(out, "_scrml"), "junction");
      const e = refusal(() => writeOutputs(out, [{ rel: "index.html", text: "2\n" }], mode));
      expect(e).toBeInstanceOf(OutDirError);
      expect(readFileSync(join(victim, "m", "host.js"), "utf8")).toBe("precious\n");
      expect(readdirSync(victim)).toEqual(["m"]);
    });

    test.skipIf(!CAN_FILE_LINK)("a recorded output that became a symbolic link to an outside file is refused; the file is untouched", async () => {
      const { writeOutputs, OutDirError } = await import(CLI);
      const w = fresh();
      const out = join(w, "out");
      writeOutputs(out, [{ rel: "index.html", text: "1\n" }], mode);
      const outside = join(w, "secret.txt");
      writeFileSync(outside, "SECRET\n");
      rmSync(join(out, "index.html"));
      symlinkSync(outside, join(out, "index.html"), "file");
      expect(refusal(() => writeOutputs(out, [{ rel: "index.html", text: "2\n" }], mode))).toBeInstanceOf(OutDirError);
      expect(readFileSync(outside, "utf8")).toBe("SECRET\n");
    });
  });
}

describe("renameOver — a replace refused because the file is in use (Windows) is retried, then reported", () => {
  const err = (code) => Object.assign(new Error(code), { code });
  test("win32: EBUSY twice, then the rename goes through", async () => {
    const { renameOver } = await import(CLI);
    let calls = 0;
    renameOver("a", "b", "x", () => {
      if (++calls < 3) throw err("EBUSY");
    }, "win32");
    expect(calls).toBe(3);
  });
  test("win32: EPERM every time is an OutDirError naming the file, after a bounded number of tries", async () => {
    const { renameOver, OutDirError } = await import(CLI);
    let calls = 0;
    const e = refusal(() => renameOver("a", "b", "index.html in out", () => {
      calls++;
      throw err("EPERM");
    }, "win32"));
    expect(e).toBeInstanceOf(OutDirError);
    expect(String(e.message)).toContain("index.html in out");
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThan(20);
  });
  test("elsewhere: EACCES is an OutDirError at once; other errors pass through unchanged", async () => {
    const { renameOver, OutDirError } = await import(CLI);
    let calls = 0;
    expect(refusal(() => renameOver("a", "b", "x", () => {
      calls++;
      throw err("EACCES");
    }, "linux"))).toBeInstanceOf(OutDirError);
    expect(calls).toBe(1);
    const e = refusal(() => renameOver("a", "b", "x", () => {
      throw err("EXDEV");
    }, "win32"));
    expect(e).not.toBeInstanceOf(OutDirError);
    expect(e.code).toBe("EXDEV");
  });
});
