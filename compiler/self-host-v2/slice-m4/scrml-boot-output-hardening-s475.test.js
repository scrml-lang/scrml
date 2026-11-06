// S475 (s475-boot-tooling-hardening) — `scrml-boot -o <dir>` output writes cannot be carried out of
// the directory by a link made AFTER the checks, nor through a hard link; the temp-file `wx` flag is pinned.
//   g-boot-output-check-then-write-race-s474  — a racer swapping `_scrml` dir <-> symlink: 0 hits on the victim
//   g-boot-output-hardlink-overwrite-s474     — an output hard-linked to an outside file: the outside file keeps its text
//   g-boot-tooling-manifest-wx-unpinned-and-lsp-statsync-s474 (a) — a planted hard link at the manifest temp name
//     is refused, never written through (mutation: `"wx"` -> `"w"` in writeNewFile fails this file)
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");

let tmp;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "scrml-boot-s475-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const fresh = (name) => {
  const d = join(tmp, name);
  mkdirSync(d, { recursive: true });
  return d;
};

describe("g-boot-output-hardlink-overwrite-s474 — an output is replaced, never written in place", () => {
  test("a recorded output hard-linked to a file outside `-o` is rebuilt; the outside file keeps its text", async () => {
    const { writeOutputs } = await import(CLI);
    const w = fresh("hl");
    const out = join(w, "out");
    writeOutputs(out, [{ rel: "index.html", text: "<!doctype html>one\n" }, { rel: "_scrml/a.js", text: "a\n" }]);
    const outside = join(w, "hl.txt");
    writeFileSync(outside, "my notes\n");
    rmSync(join(out, "index.html"));
    linkSync(outside, join(out, "index.html"));
    const outside2 = join(w, "hl2.txt");
    writeFileSync(outside2, "more notes\n");
    rmSync(join(out, "_scrml", "a.js"));
    linkSync(outside2, join(out, "_scrml", "a.js"));
    writeOutputs(out, [{ rel: "index.html", text: "<!doctype html>two\n" }, { rel: "_scrml/a.js", text: "a2\n" }]);
    expect(readFileSync(outside, "utf8")).toBe("my notes\n");
    expect(readFileSync(outside2, "utf8")).toBe("more notes\n");
    expect(readFileSync(join(out, "index.html"), "utf8")).toBe("<!doctype html>two\n");
    expect(readFileSync(join(out, "_scrml", "a.js"), "utf8")).toBe("a2\n");
    expect(readdirSync(out).sort()).toEqual([".scrml-boot-manifest.json", "_scrml", "index.html"]);
  });

  test("a copied output (a host module) hard-linked outside is replaced too", async () => {
    const { writeOutputs } = await import(CLI);
    const w = fresh("hlsrc");
    const out = join(w, "out");
    const src = join(w, "host.js");
    writeFileSync(src, "export const x = 1;\n");
    writeOutputs(out, [{ rel: "_scrml/m/host.js", src }]);
    const outside = join(w, "outside.js");
    writeFileSync(outside, "keep\n");
    rmSync(join(out, "_scrml", "m", "host.js"));
    linkSync(outside, join(out, "_scrml", "m", "host.js"));
    writeOutputs(out, [{ rel: "_scrml/m/host.js", src }]);
    expect(readFileSync(outside, "utf8")).toBe("keep\n");
    expect(readFileSync(join(out, "_scrml", "m", "host.js"), "utf8")).toBe("export const x = 1;\n");
  });
});

describe("g-boot-tooling-manifest-wx-unpinned-and-lsp-statsync-s474 (a) — the temp file is created exclusively (`wx`)", () => {
  test("a hard link planted at the manifest's temp name is refused and the linked file is untouched", async () => {
    const { writeOutputs, OUTPUT_MANIFEST, OutDirError } = await import(CLI);
    const w = fresh("wx");
    const out = join(w, "out");
    writeOutputs(out, [{ rel: "a.txt", text: "a\n" }]);
    const victim = join(w, "victim.txt");
    writeFileSync(victim, "precious\n");
    linkSync(victim, join(out, `.${OUTPUT_MANIFEST}.${process.pid}.tmp`));
    let err;
    try {
      writeOutputs(out, [{ rel: "a.txt", text: "a2\n" }]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OutDirError);
    expect(String(err.message)).toContain("already exists");
    expect(readFileSync(victim, "utf8")).toBe("precious\n");
  });

  test("writeNewFile refuses an existing name (a hard link or a symbolic link) instead of writing through it", async () => {
    const { writeNewFile } = await import(CLI);
    const w = fresh("wx2");
    const victim = join(w, "victim.txt");
    writeFileSync(victim, "precious\n");
    linkSync(victim, join(w, "hard"));
    expect(() => writeNewFile(join(w, "hard"), "x")).toThrow();
    expect(readFileSync(victim, "utf8")).toBe("precious\n");
    writeNewFile(join(w, "new"), "fresh\n");
    expect(readFileSync(join(w, "new"), "utf8")).toBe("fresh\n");
  });
});

// The racer: atomically swaps <out>/_scrml between a real directory and a symbolic link to `victim`.
const RACER = `
const { mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const [W, X] = process.argv.slice(1);
for (;;) {
  try { mkdirSync(W + "/realtmp/math", { recursive: true }); writeFileSync(W + "/realtmp/math/host.js", "x"); renameSync(W + "/realtmp", X + "/_scrml"); } catch {}
  try { symlinkSync(W + "/victim", W + "/lnk"); } catch {}
  try {
    renameSync(X + "/_scrml", W + "/old");
    renameSync(W + "/lnk", X + "/_scrml");
    renameSync(X + "/_scrml", W + "/lnk");
    renameSync(W + "/old", X + "/_scrml");
  } catch {}
  try { rmSync(W + "/old", { recursive: true, force: true }); } catch {}
}
`;

/** Run `builds` writeOutputs calls against a live racer; count operations that landed in the victim. */
export async function raceOutputs(writeOutputs, w, builds) {
  const out = join(w, "X");
  const victim = join(w, "victim");
  const PRECIOUS = "precious\n";
  const seed = () => {
    mkdirSync(join(victim, "math"), { recursive: true });
    mkdirSync(join(victim, "other"), { recursive: true });
    writeFileSync(join(victim, "math", "host.js"), PRECIOUS);
    writeFileSync(join(victim, "other", "x.js"), PRECIOUS);
  };
  seed();
  mkdirSync(out, { recursive: true });
  const A = [{ rel: "index.html", text: "A\n" }, { rel: "_scrml/math/host.js", text: "BUILD\n" }];
  const B = [{ rel: "index.html", text: "B\n" }, { rel: "_scrml/other/x.js", text: "BUILD\n" }];
  const racer = Bun.spawn(["bun", "-e", RACER, w, out], { stdout: "ignore", stderr: "ignore" });
  let writes = 0, deletes = 0, refused = 0, ok = 0;
  try {
    await Bun.sleep(50);
    for (let i = 0; i < builds; i++) {
      try {
        writeOutputs(out, i % 2 === 0 ? A : B);
        ok++;
      } catch {
        refused++;
      }
      for (const f of [join(victim, "math", "host.js"), join(victim, "other", "x.js")]) {
        if (!existsSync(f)) deletes++;
        else if (readFileSync(f, "utf8") !== PRECIOUS) writes++;
      }
      const extra = readdirSync(victim).filter((n) => n !== "math" && n !== "other");
      writes += extra.length;
      for (const n of extra) rmSync(join(victim, n), { recursive: true, force: true });
      seed();
    }
  } finally {
    racer.kill(9);
    await racer.exited;
  }
  return { writes, deletes, refused, ok };
}

describe("g-boot-output-check-then-write-race-s474 — a swap made after the checks cannot redirect a write or delete", () => {
  test.skipIf(process.platform !== "linux")("a racer swapping `_scrml` dir <-> symlink: no write and no delete lands in the victim", async () => {
    const { writeOutputs } = await import(CLI);
    const r = await raceOutputs(writeOutputs, fresh("race"), Number(process.env.SCRML_RACE_BUILDS ?? 600));
    console.log(`race: writes-escaped=${r.writes} deletes-escaped=${r.deletes} refused=${r.refused} ok=${r.ok}`);
    expect(r.ok + r.refused).toBeGreaterThan(0);
    expect(r.writes).toBe(0);
    expect(r.deletes).toBe(0);
  }, 120000);
});

// S475 r1 (review F1): a held directory FOLLOWS a rename, so a sub-directory moved out of `-o` mid-build
// used to take every later write with it while the build reported success (head before r1, /proc mode:
// err null, 4000 of 4000 files outside, 0 in `-o`). Now `OutTree.check()` compares each held directory's
// dev/ino with the entry it was opened from, up to `-o`, around every write and before success: the build
// fails (OutDirError) instead. A mover process renames `<out>/_scrml` away once the build has written f50.
const MOVER = `
const fs = require("node:fs");
const [X, E] = process.argv.slice(1);
for (;;) { if (fs.existsSync(X + "/_scrml/f50.js")) { try { fs.renameSync(X + "/_scrml", E + "/_scrml"); } catch {} break; } }
`;
describe("review F1 — a directory moved out of `-o` mid-build fails the build", () => {
  for (const mode of ["auto", "paths"]) {
    test.skipIf(process.platform !== "linux")(`${mode} mode: the build throws OutDirError, never reports success with \`_scrml\` gone`, async () => {
      const { writeOutputs, OutDirError } = await import(CLI);
      const w = fresh(`moveout-${mode}`);
      const out = join(w, "X");
      const elsewhere = join(w, "elsewhere");
      mkdirSync(elsewhere);
      const outs = Array.from({ length: 4000 }, (_, i) => ({ rel: `_scrml/f${i}.js`, text: "BUILD\n" }));
      const mover = Bun.spawn(["bun", "-e", MOVER, out, elsewhere], { stdout: "ignore", stderr: "ignore" });
      let err = null;
      try {
        writeOutputs(out, outs, mode);
      } catch (e) {
        err = e;
      }
      const t = setTimeout(() => mover.kill(9), 5000);
      await mover.exited;
      clearTimeout(t);
      const moved = existsSync(join(elsewhere, "_scrml"));
      if (!moved) {
        // the mover lost the race outright (the build finished first): then everything is in `-o`
        expect(err).toBeNull();
        expect(readdirSync(join(out, "_scrml")).length).toBe(4000);
        return;
      }
      expect(err).toBeInstanceOf(OutDirError);
    }, 60000);
  }
});
