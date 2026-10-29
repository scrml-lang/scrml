// s472-boot-math-port fixture host module for `scrml:bad` — `k` picks the value
// returned: 0 is always a value that FITS the wrapper's declared type, every
// other `k` a value that does not (or, for `maybeInt`, an absence).
const SHAPES = [
  undefined, // 0: replaced per export by a fitting value
  "7", // 1: a string
  1.5, // 2: a fraction
  null, // 3: null
  undefined, // 4: undefined
  Promise.resolve(7), // 5: a thenable (a host binding is never a waiting value)
  2 ** 53, // 6: outside ±(2^53−1)
  1, // 7: a number where a boolean is declared
  NaN, // 8: NaN (a number — fits `number`, not `int`)
];

const pick = (k, fits) => (k === 0 ? fits : SHAPES[k]);

export function anInt(k) { return pick(k, 7); }
export function maybeInt(k) { return pick(k, 7); }
export function aString(k) { return pick(k, "seven"); }
export function aBool(k) { return pick(k, true); }
export function aNumber(k) { return pick(k, 7.5); }
