// scrml:random — the module's host file (SPEC §21.3.1, §21.3.1.1).
//
// The ONE place scrml:random reads the host RNG (`Math.random()`). It is reached
// ONLY through the `import:host` declaration at the top of
// stdlib/random/index.scrml (S471 option A), and each export is called ONLY by
// the one scrml wrapper whose signature is its type (the S472 wrapper rule): the
// value returned is decoded against that signature (E-HOST-VALUE-MISMATCH-RT on a
// mismatch), so `random` returns a number and `randomInt` an integer within
// ±(2^53−1).
//
// The bootstrap copies this file to `<outputDir>/_scrml/random/host.js`; it
// imports nothing, so it runs unchanged in a browser and on the server.
//
// (impl#1 does not use this file: it ships the hand-written runtime shim
// compiler/runtime/stdlib/random.js, which implements the same surface.)

// A float in [0, 1).
export function random() {
  return Math.random();
}

// An integer uniformly in [min, max], BOTH bounds inclusive; fractional bounds
// are ceiled / floored into the closed interval; `min > max` is normalized.
export function randomInt(min, max) {
  let lo = Math.ceil(min);
  let hi = Math.floor(max);
  if (lo > hi) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
