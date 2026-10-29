// annotate.ts — apply the parameter annotations of s473-stdlib-bootstrap-clean (signatures.json beside
// this file): each entry replaces ONE exact function head (`export function f(a, b) {`) with its
// annotated form. A head that is not found exactly once is an error (no silent skip).
// USAGE: bun docs/changes/s473-stdlib-bootstrap-clean/annotate.ts [module-file…]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const table: Record<string, [string, string][]> = JSON.parse(readFileSync(join(HERE, "signatures.json"), "utf8"));
const only = process.argv.slice(2);
let bad = 0;
for (const [file, pairs] of Object.entries(table)) {
  if (only.length && !only.includes(file)) continue;
  const abs = join(ROOT, file);
  let s = readFileSync(abs, "utf8");
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(to)) continue; // already applied
    const k = s.split(from).length - 1;
    if (k !== 1) { console.error(`${file}: ${k} matches for ${JSON.stringify(from)}`); bad++; continue; }
    s = s.replace(from, to);
    n++;
  }
  writeFileSync(abs, s);
  console.error(`${file}: ${n} head(s) annotated`);
}
if (bad) process.exit(1);
