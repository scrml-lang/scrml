// compile-scaling-fn-count-s480.probe.js — the measurement behind compile-scaling-fn-count-s480.test.js,
// run in a FRESH process (a long test process's heap would tax the larger compile's garbage collection).
// usage: bun compile-scaling-fn-count-s480.probe.js <dir> <shape> <N> <runs>
// Writes the generated program of `shape` at N and 4N top-level functions into <dir>, compiles each
// once to warm the bundle and the JIT, then `runs` times interleaved (scripts/scrml-boot.ts
// compileSource — the whole pipeline). Prints {"small": ms, "large": ms}, each the best run.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const { compileSource } = await import(join(ROOT, "scripts", "scrml-boot.ts"));

// `indep`: N one-line functions; `chain`: each calls the one before it (a call chain N deep);
// `fan`: each calls up to 8 earlier ones.
export function program(shape, n) {
  const L = ["<program>", "${"];
  for (let i = 0; i < n; i++) {
    if (shape === "indep") L.push(`  fn f${i}(x: int) -> int { return x + ${i}; }`);
    else if (shape === "chain") L.push(i === 0 ? "  fn f0(x: int) -> int { return x + 1; }" : `  fn f${i}(x: int) -> int { return f${i - 1}(x) + ${i % 7}; }`);
    else {
      const calls = [];
      for (let k = 1; k <= 8 && i - k * 37 >= 0; k++) calls.push(`f${i - k * 37}(x)`);
      L.push(`  fn f${i}(x: int) -> int { return ${calls.length ? calls.join(" + ") + " + " : "x + "}${i}; }`);
    }
  }
  L.push("}", "<p>${f1(2)}</p>", "</program>");
  return L.join("\n") + "\n";
}

async function timed(file) {
  const t0 = performance.now();
  const c = await compileSource(file);
  const ms = performance.now() - t0;
  if (!c.ok) throw new Error("the generated program did not compile: " + c.diagnostics.slice(0, 3).map((d) => `${d.code} ${d.message}`).join("; "));
  return ms;
}

if (import.meta.main) {
  const [dir, shape, nArg, runsArg] = process.argv.slice(2);
  const n = Number(nArg);
  const small = join(dir, `${shape}-small.scrml`);
  const large = join(dir, `${shape}-large.scrml`);
  writeFileSync(small, program(shape, n));
  writeFileSync(large, program(shape, 4 * n));
  await timed(small);
  await timed(large);
  let a = Infinity;
  let b = Infinity;
  for (let i = 0; i < Number(runsArg); i++) {
    a = Math.min(a, await timed(small));
    b = Math.min(b, await timed(large));
  }
  console.log(JSON.stringify({ small: a, large: b }));
}
