// s477-boot-compile-perf — one-shot bootstrap compile timings.
// usage: bun bench.ts <repo root> <out dir> <file.scrml>... [--reps n] [--prof]
// Runs `bun <root>/scripts/scrml-boot.ts compile <file> --output-dir <out>/<name>` for each file
// (after one warm-up compile so the bootstrap bundle cache is built), prints wall ms (min of reps).
// --prof writes <out>/<name>.cpuprofile via `bun --cpu-prof`.
import { spawnSync } from "child_process";
import { basename, dirname, join } from "path";
import { mkdirSync, readFileSync, readdirSync, renameSync } from "fs";

const args = process.argv.slice(2);
const reps = args.includes("--reps") ? Number(args[args.indexOf("--reps") + 1]) : 1;
const prof = args.includes("--prof");
const pos = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--reps");
const [root, out, ...files] = pos;
mkdirSync(out, { recursive: true });
const boot = join(root, "scripts/scrml-boot.ts");

function run(file: string, dir: string, extra: string[] = []) {
  const t0 = performance.now();
  const r = spawnSync("bun", [...extra, boot, "compile", file, "--output-dir", dir], { encoding: "utf8", cwd: dirname(file) });
  return { ms: performance.now() - t0, code: r.status, err: (r.stderr ?? "") + (r.stdout ?? "") };
}

run(files[0], join(out, "_warm"));
for (const f of files) {
  const name = basename(dirname(f)) + "-" + basename(f, ".scrml");
  const lines = readFileSync(f, "utf8").split("\n").length - 1;
  let best = Infinity;
  let code: number | null = 0;
  for (let i = 0; i < reps; i++) {
    const r = run(f, join(out, name));
    best = Math.min(best, r.ms);
    code = r.code;
  }
  let profNote = "";
  if (prof) {
    const pd = join(out, name + "-prof");
    mkdirSync(pd, { recursive: true });
    run(f, join(out, name + "-pout"), ["--cpu-prof", "--cpu-prof-dir", pd]);
    const p = readdirSync(pd).filter((x) => x.endsWith(".cpuprofile")).sort().pop();
    if (p) { renameSync(join(pd, p), join(out, name + ".cpuprofile")); profNote = " prof=" + join(out, name + ".cpuprofile"); }
  }
  console.log(`${name.padEnd(28)} ${String(lines).padStart(5)} lines ${String(Math.round(best)).padStart(7)} ms exit=${code}${profNote}`);
}
