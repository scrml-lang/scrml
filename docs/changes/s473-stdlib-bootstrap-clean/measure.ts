// measure.ts — every stdlib module through the BOOTSTRAP front end (s473-stdlib-bootstrap-clean).
// For each module `scrml:NAME` (a stdlib/NAME/index.scrml, or a stdlib/NAME/sub.scrml file) a
// one-line entry imports it; frontEndStdlib supplies the module as SOURCE and withdraws it when
// any of its files carries an Error. We record the module's own Error diagnostics (by file), the
// status (clean / errors / crash) and the code histogram.
// USAGE: bun docs/changes/s473-stdlib-bootstrap-clean/measure.ts [--json out.json] [--md out.md] [module…]
import { readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const boot = await import(join(ROOT, "scripts/scrml-boot.ts"));
const { frontEndStdlib } = await import(join(ROOT, "compiler/self-host-v2/slice-m2/lowered.js"));
const B = await boot.loadBoot({ log: (s: string) => console.error(s) });
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const jsonOut = opt("--json"), mdOut = opt("--md");
const STD = join(ROOT, "stdlib");
function modules(): string[] {
  const out: string[] = [];
  for (const d of readdirSync(STD, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (existsSync(join(STD, d.name, "index.scrml"))) out.push(d.name);
    for (const f of readdirSync(join(STD, d.name))) if (f.endsWith(".scrml") && f !== "index.scrml") out.push(`${d.name}/${f.slice(0, -6)}`);
  }
  return out.sort();
}
const want = args.length ? args : modules();
const isErr = (d: any) => d.severity !== "Warning" && d.severity !== "Info";
const lineOf = (src: string, off: number) => src.slice(0, off).split("\n").length;
const results: any[] = [];
for (const m of want) {
  const entry = "probe.scrml";
  const src = `<program>\n\${ import { __probe_s473 } from "scrml:${m}"; }\n</program>\n`;
  let r: any;
  try { r = frontEndStdlib(B.mods, [{ path: entry, src }], entry); }
  catch (e: any) { results.push({ module: m, status: "crash", err: String(e?.stack ?? e).slice(0, 400) }); console.error(m, "crash"); continue; }
  const ref = r.stdlib.refused.find((x: any) => x.module === m);
  const sup = r.stdlib.supplied.find((x: any) => x.module === m);
  if (!ref) { results.push({ module: m, status: sup ? "clean" : "not-supplied", files: sup?.files ?? [] }); console.error(m, sup ? "clean" : "not-supplied"); continue; }
  const srcs = new Map(ref.sources.map((s: any) => [s.path, s.src]));
  const diags = ref.diags.filter(isErr).map((d: any) => ({ code: String(d.code), file: d.file, line: srcs.has(d.file) && d.span ? lineOf(srcs.get(d.file) as string, d.span.start) : null, msg: String(d.message).slice(0, 240) }));
  const own = diags.filter((d: any) => d.file === `scrml:${m}.scrml` || d.file === `scrml:${m}/index.scrml`);
  const codes: Record<string, number> = {};
  for (const d of diags) codes[d.code] = (codes[d.code] ?? 0) + 1;
  results.push({ module: m, status: "errors", total: diags.length, own: own.length, codes, files: ref.sources.map((s: any) => s.path), diags });
  console.error(m, "errors", diags.length);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
const tbl = ["| module | status | errors (own file / closure) | codes |", "|---|---|---|---|"];
for (const r of results) tbl.push(`| ${r.module} | ${r.status} | ${r.status === "errors" ? `${r.own} / ${r.total}` : "—"} | ${r.codes ? Object.entries(r.codes).sort((a: any, b: any) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(", ") : ""} |`);
const md = tbl.join("\n") + "\n";
if (mdOut) writeFileSync(mdOut, md); else console.log(md);
