// g-bootstrap-runtime-flush-not-exception-safe + g-bootstrap-flush-leftovers-after-throw
// Runtime probe against compiler/self-host-v2/slice-m1/runtime/runtime.js (run: bun <this file>).
// A write to `a` queues two render effects; the first throws. Does the second run (exception-safe flush)?
// Then a write to an unrelated cell `z`: does the leftover effect run then (leftovers-after-throw),
// and does an `<effect deps=[@a]>` body run on the `z` write?
import { root, Scope, cell, effect, effectOn } from "../../../../compiler/self-host-v2/slice-m1/runtime/runtime.js";

const s = new Scope(root);
const a = cell(0);
const z = cell(0);
const log = [];
effect(s, () => { if (a.get() === 1) throw new Error("boom"); });
effect(s, () => { log.push("render-b saw a=" + a.get()); });
effectOn(s, [a], () => { log.push("effect(deps=[a]) ran"); });
log.length = 0;

let threw = false;
try { a.set(1); } catch (e) { threw = true; }
console.log("write a=1 threw:", threw);
console.log("after a=1:", JSON.stringify(log));
log.length = 0;
z.set(1);
console.log("after unrelated z=1:", JSON.stringify(log));
