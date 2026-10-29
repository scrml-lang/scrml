// impl1-check.ts — impl#1 still compiles each stdlib file the way it did on base.
// For each stdlib .scrml file (scrml:compiler* excepted), compile it with impl#1 in place
// (compileScrml, default and library mode, write to a temp dir) and record its Error codes. With `--save <json>` record the result, with `--against <json>` compare with a
// saved run (run `--save` with base's stdlib checked out IN PLACE — the stdlib-path exemptions are read off
// the compiler's own stdlib path, so a copy elsewhere compiles differently). Reports every file whose code
// multiset changed (a NEW code is a regression).
// USAGE: bun docs/changes/s473-stdlib-bootstrap-clean/impl1-check.ts [--save f.json | --against f.json] [file…]
import { readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { compileScrml } = await import(join(ROOT, "compiler/src/api.js"));
const args = process.argv.slice(2);
import { readFileSync, writeFileSync } from "node:fs";
const take = (k: string) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const save = take("--save"), against = take("--against");
const saved: Record<string, string[]> = against ? JSON.parse(readFileSync(against, "utf8")) : {};
const record: Record<string, string[]> = {};
function walk(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".scrml") ? [join(d, e.name)] : []);
}
const rels = (args.length ? args.map((f) => relative(ROOT, resolve(f))) : walk(join(ROOT, "stdlib")).map((f) => relative(ROOT, f)))
  .filter((r) => !r.startsWith("stdlib/compiler/")).sort();
const TMP = mkdtempSync(join(tmpdir(), "s473-impl1-"));
function codes(abs: string, mode?: string): string[] {
  try {
    const r: any = compileScrml({ inputFiles: [abs], outputDir: join(TMP, "o"), write: true, log: () => {}, ...(mode ? { mode } : {}) });
    return (r.errors ?? []).map((e: any) => e.code ?? "?").sort();
  } catch (e: any) { return ["THROW:" + String(e?.message ?? e).slice(0, 80)]; }
}
let bad = 0;
for (const rel of rels) {
  for (const mode of [undefined, "library"]) {
    const now = codes(join(ROOT, rel), mode);
    const tag = `${rel} [${mode ?? "default"}]`;
    record[tag] = now;
    const was = against ? [...(saved[tag] ?? [])] : null;
    if (was === null) { console.log(tag, now.length ? now.join(",") : "clean"); continue; }
    const wasS = was.join(","), nowS = now.join(",");
    if (wasS === nowS) { console.log(tag, "same", nowS || "clean"); continue; }
    const added = now.filter((c) => { const i = was.indexOf(c); if (i < 0) return true; was.splice(i, 1); return false; });
    if (added.length) bad++;
    console.log(tag, added.length ? "REGRESSED +" + added.join(",") : "improved", "| was:", wasS || "clean", "| now:", nowS || "clean");
  }
}
rmSync(TMP, { recursive: true, force: true });
if (save) writeFileSync(save, JSON.stringify(record, null, 1));
if (bad) { console.log(`${bad} regressed`); process.exit(1); }
