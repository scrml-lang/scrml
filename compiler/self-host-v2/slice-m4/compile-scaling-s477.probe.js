// compile-scaling-s477.probe.js — the measurement behind compile-scaling-s477.test.js, run in a
// FRESH process (a long test process's heap would tax the larger compile's garbage collection).
// usage: bun compile-scaling-s477.probe.js <dir> <N> <runs>
// Writes the generated program at N and 2N replicas into <dir>, compiles each once to warm the
// bundle and the JIT, then `runs` times interleaved (scripts/scrml-boot.ts compileSource — the
// whole pipeline: front end, check, print). Prints {"small": ms, "large": ms}, each the best run.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const { compileSource } = await import(join(ROOT, "scripts", "scrml-boot.ts"));

// N replicas of a payload-enum / match / cell / handler block, and a button + two
// interpolations per replica in the markup (docs/changes/s477-boot-dev-leak/gen-big.ts).
export function program(n) {
  const decls = [];
  const body = [];
  for (let i = 0; i < n; i++) {
    decls.push(`    type Shape${i}:enum = { Circle(r: int), Rect(w: int, h: int), Dot }
    let <sh${i}:Shape${i}=(Shape${i}.Rect(2, ${i + 1}))/>
    let <log${i}:string=""/>
    function area${i}(s: Shape${i}) -> int {
        return match s {
            .Circle(r) :> 3 * r * r,
            .Rect(w, h) :> w * h + ${i},
            .Dot :> 0
        };
    }
    function grow${i}(n: int) -> Shape${i} {
        if (n == 0) return Shape${i}.Dot;
        if (n == 1) return .Circle(3);
        return Shape${i}.Rect(n, n + 1);
    }
    function step${i}() {
        @sh${i} = grow${i}(3);
        const same: bool = Shape${i}.Rect(3, 4) == @sh${i};
        @log${i} = same ? "eq ok" : "eq bad";
    }`);
    body.push(`        <button id="b${i}" onclick=step${i}()>b${i}</button>
        <p id="area${i}">\${area${i}(@sh${i})}</p>
        <p id="log${i}">\${@log${i}}</p>`);
  }
  return `<program>\n${decls.join("\n")}\n    <main>\n${body.join("\n")}\n    </main>\n</program>\n`;
}

async function timed(file) {
  const t0 = performance.now();
  const c = await compileSource(file);
  const ms = performance.now() - t0;
  if (!c.ok) throw new Error("the generated program did not compile: " + c.diagnostics.slice(0, 3).map((d) => `${d.code} ${d.message}`).join("; "));
  return ms;
}

if (import.meta.main) {
  const [dir, nArg, runsArg] = process.argv.slice(2);
  const n = Number(nArg);
  const small = join(dir, "small.scrml");
  const large = join(dir, "large.scrml");
  writeFileSync(small, program(n));
  writeFileSync(large, program(2 * n));
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
