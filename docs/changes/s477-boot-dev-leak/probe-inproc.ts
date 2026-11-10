// s477-boot-dev-leak — in-process probe: compileFile the same input N times, log ms + RSS + heap.
// usage: bun probe-inproc.ts <file.scrml> <outDir> [N]
import { compileFile } from "../../../scripts/scrml-boot.ts";
const [file, outDir, nArg] = process.argv.slice(2);
const n = Number(nArg ?? 12);
for (let i = 0; i < n; i++) {
  const t = performance.now();
  const r = await compileFile(file, { outDir });
  const ms = Math.round(performance.now() - t);
  Bun.gc(true);
  const m = process.memoryUsage();
  console.log(`${i}\tok=${r.ok}\t${ms} ms\trss ${Math.round(m.rss / 1e6)} MB\theap ${Math.round(m.heapUsed / 1e6)} MB`);
}
