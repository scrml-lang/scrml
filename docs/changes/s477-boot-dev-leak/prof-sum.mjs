// s477-boot-dev-leak — summarise a `bun --cpu-prof` profile: top self and inclusive time by function.
// usage: bun prof-sum.mjs <file.cpuprofile>
import { readFileSync } from "fs";
const p = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const key = (n) => n.callFrame.functionName + " @" + n.callFrame.url.split("/").pop() + ":" + n.callFrame.lineNumber;
const self = new Map();
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0));
const fn = new Map();
for (const [id, t] of self) { const k = key(byId.get(id)); fn.set(k, (fn.get(k) ?? 0) + t); }
console.log("SELF:");
for (const [k, t] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((t / 1000).toFixed(0).padStart(7), "ms", k);
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const inc = new Map();
for (const [id, t] of self) {
  const seen = new Set();
  for (let x = id; x !== undefined; x = parent.get(x)) {
    const k = key(byId.get(x));
    if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) ?? 0) + t); }
  }
}
console.log("INCL:");
for (const [k, t] of [...inc].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log((t / 1000).toFixed(0).padStart(7), "ms", k);
