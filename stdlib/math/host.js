// scrml:math — the module's host file (SPEC §21.3.1, §41.18).
//
// The ONE place scrml:math touches the host `Math.*` / `Number.*` surface. It is
// reached ONLY through the `import:host` declaration at the top of
// stdlib/math/index.scrml (S471 option A: stdlib host reach is `import:host`,
// a thin `.js` beside the scrml module), and each export is called ONLY by the
// one scrml wrapper whose signature is its type (the S472 wrapper rule): the
// value it returns is decoded against that signature where the wrapper
// returns it (E-HOST-VALUE-MISMATCH-RT on a mismatch), so an export here must
// return exactly the declared type — an `int` is integral within ±(2^53−1),
// `int | not` is an int or `null`.
//
// The compiler copies this file to `<outputDir>/_scrml/math/host.js` and both
// `program.client.js` and `program.server.js` import it from there. It imports
// nothing: it runs unchanged in a browser and on the server.
//
// (impl#1 does not use this file: it ships the hand-written runtime shim
// compiler/runtime/stdlib/math.js, which implements the same §41.18 surface.)

const MAX_EXACT_INT = 9007199254740991; // 2^53 − 1, the S468 `int` range

// §41.18 / §19.17: `floor` / `ceil` / `trunc` / `round` of NaN, ±∞, or a value
// that rounds outside ±(2^53−1) is the trap E-INT-CONVERSION-RT — never a
// silently wrong int. A trap is a thrown error carrying its code (as the
// bootstrap runtime's own traps are); nothing in scrml catches it.
function intOf(r, what, x) {
  if (Number.isFinite(r) && Math.abs(r) <= MAX_EXACT_INT) return r === 0 ? 0 : r; // `-0` is the int 0
  const e = new Error("E-INT-CONVERSION-RT: " + what + "(" + String(x) + ") has no int value — NaN, ±∞, or outside ±(2^53−1) (§41.18)");
  e.name = "ScrmlTrap";
  e.code = "E-INT-CONVERSION-RT";
  e.detail = { value: String(x), what };
  throw e;
}

export function floor(x) {
  return intOf(Math.floor(x), "floor", x);
}

export function ceil(x) {
  return intOf(Math.ceil(x), "ceil", x);
}

export function trunc(x) {
  return intOf(Math.trunc(x), "trunc", x);
}

// `.HalfUp`: a tie goes AWAY FROM ZERO (§41.18: `2.5` → `3`, `-2.5` → `-3`).
export function roundHalfUp(x) {
  return intOf(x < 0 ? -Math.round(-x) : Math.round(x), "round", x);
}

// `.HalfEven`: a tie goes to the EVEN neighbour (`2.5` → `2`, `-2.5` → `-2`,
// `3.5` → `4`). `Math.round` sends a tie toward +∞, so a tie it rounded to an
// odd integer is moved down by one; `r - x` is exact for a tie.
export function roundHalfEven(x) {
  let r = Math.round(x);
  if (r - x === 0.5 && Math.abs(r % 2) === 1) r = r - 1;
  return intOf(r, "round", x);
}

export function abs(x) {
  return Math.abs(x);
}

export function min(a, b) {
  return Math.min(a, b);
}

export function max(a, b) {
  return Math.max(a, b);
}

// `Number.isNaN` — no coercion.
export function isNaN(x) {
  return Number.isNaN(x);
}

// §41.18: the WHOLE of `s` in base `radix` (2–36): an optional leading `-`,
// then one or more digits of that base, either letter case — nothing else (no
// trimming, no `+`, no `0x`). `null` (scrml `not`) for any other text, a radix
// outside 2–36, or a value outside ±(2^53−1). Digits are ASCII only (`0`–`9`,
// `a`–`z`, `A`–`Z`), read by code unit — never by a case mapping, which would
// admit look-alikes (U+212A KELVIN SIGN lower-cases to `k`).
function digitOf(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 122) return c - 87;
  if (c >= 65 && c <= 90) return c - 55;
  return -1;
}

export function parseInt(s, radix) {
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) return null;
  let i = 0;
  let negative = false;
  if (s.length > 0 && s[0] === "-") {
    negative = true;
    i = 1;
  }
  if (i === s.length) return null;
  let n = 0;
  for (; i < s.length; i++) {
    const d = digitOf(s.charCodeAt(i));
    if (d < 0 || d >= radix) return null;
    n = n * radix + d;
    if (n > MAX_EXACT_INT) return null;
  }
  if (negative) n = -n;
  return n === 0 ? 0 : n;
}
