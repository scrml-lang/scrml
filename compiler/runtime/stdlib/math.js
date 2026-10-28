// scrml:math — runtime shim (impl#1)
//
// Hand-written ES module implementing the SPEC §41.18 surface that
// stdlib/math/index.scrml declares (the S469 API, shipped in S472). Every
// public function is PURE: deterministic, no side effects, no host capability.
// This is impl#1's ONE sanctioned, centralized touch of the host `Math.*` /
// `Number.*` surface — scrml's own runtime shims route their internal
// arithmetic through here (closing the stdlib-ouroboros) and adopters reach
// these instead of raw `Math.round(...)`.
//
// (The bootstrap does not use this file: it compiles stdlib/math/index.scrml,
// whose host reach is the thin stdlib/math/host.js — the same semantics.)
//
// Surface (must match stdlib/math/index.scrml exports):
//   - Rounding                          the mode enum: HalfEven | HalfUp | Floor | Ceil | Trunc
//   - round(x, mode) -> int             mode REQUIRED (no default)
//   - floor(x) / ceil(x) / trunc(x) -> int
//       NaN, ±∞ or a result outside ±(2^53−1) throws the E-INT-CONVERSION-RT trap
//   - abs(x), clamp(value, minimum, maximum), isNaN(x)
//   - min(a, b) / max(a, b)             two numbers
//   - minOf(xs) / maxOf(xs)             a tape → number | not (`null` for an empty tape)
//   - parseInt(s, radix) -> int | not   the WHOLE string in base radix (2–36)
//   - parseFloat(s) / toNumber(s) -> number | not   the whole string, as `number.parse`
//
// Internal (NOT part of the scrml:math API — stdlib/math/index.scrml does not
// export them, so an adopter import of one is E-IMPORT-004): `floorUnchecked`
// and `ceilUnchecked`, the raw host floor / ceil the runtime's own shims
// (auth.js, data.js, time.js) use. They do not trap: those callers' behaviour
// on a NaN clock / length is unchanged by the S469 API (S472 ruling).

const MAX_EXACT_INT = 9007199254740991; // 2^53 − 1, the S468 `int` range

// A unit variant of a scrml enum is its name string (impl#1's compiled shape,
// as `Rule` in data.js): `.HalfUp` compiles to "HalfUp".
export const Rounding = Object.freeze({
  HalfEven: "HalfEven",
  HalfUp: "HalfUp",
  Floor: "Floor",
  Ceil: "Ceil",
  Trunc: "Trunc",
  variants: ["HalfEven", "HalfUp", "Floor", "Ceil", "Trunc"],
});

// §41.18 / §19.17 — the E-INT-CONVERSION-RT trap: never a silently wrong int.
function intOf(r, what, x) {
  if (Number.isFinite(r) && Math.abs(r) <= MAX_EXACT_INT) return r === 0 ? 0 : r; // `-0` is the int 0
  const e = new Error("E-INT-CONVERSION-RT: " + what + "(" + String(x) + ") has no int value — NaN, ±∞, or outside ±(2^53−1) (§41.18)");
  e.name = "ScrmlTrap";
  e.code = "E-INT-CONVERSION-RT";
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

// `.HalfEven` picks the even neighbour of a tie; `.HalfUp` goes AWAY FROM
// ZERO (`-2.5` → `-3`); the directed modes are floor / ceil / trunc.
export function round(x, mode) {
  switch (mode) {
    case "HalfEven": {
      let r = Math.round(x);
      if (r - x === 0.5 && Math.abs(r % 2) === 1) r = r - 1;
      return intOf(r, "round", x);
    }
    case "HalfUp":
      return intOf(x < 0 ? -Math.round(-x) : Math.round(x), "round", x);
    case "Floor":
      return floor(x);
    case "Ceil":
      return ceil(x);
    case "Trunc":
      return trunc(x);
    default:
      throw new TypeError("round(x, mode): the mode is required and must be a Rounding value (.HalfEven, .HalfUp, .Floor, .Ceil, .Trunc), got " + String(mode) + " (§41.18 — `round(x)` is E-CALL-ARITY)");
  }
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

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function minOf(xs) {
  if (!Array.isArray(xs) || xs.length === 0) return null;
  let m = xs[0];
  for (const x of xs) m = Math.min(m, x);
  return m;
}

export function maxOf(xs) {
  if (!Array.isArray(xs) || xs.length === 0) return null;
  let m = xs[0];
  for (const x of xs) m = Math.max(m, x);
  return m;
}

// ASCII digits only, by code unit (no case mapping — U+212A KELVIN SIGN
// lower-cases to `k`).
function digitOf(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 122) return c - 87;
  if (c >= 65 && c <= 90) return c - 55;
  return -1;
}

export function parseInt(s, radix) {
  if (typeof s !== "string" || !Number.isInteger(radix) || radix < 2 || radix > 36) return null;
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

// `number.parse(s)` (§14.13.4): an optional `-`, digits with an optional `.`
// fraction, an optional exponent — the whole string, a FINITE result only.
const NUMBER_TEXT = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

export function parseFloat(s) {
  if (typeof s !== "string" || !NUMBER_TEXT.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

export function toNumber(s) {
  return parseFloat(s);
}

export function isNaN(x) {
  return Number.isNaN(x);
}

// ---------------------------------------------------------------------------
// Internal — the runtime shims' raw host floor / ceil (non-trapping; see header).
// ---------------------------------------------------------------------------
export function floorUnchecked(n) {
  return Math.floor(n);
}

export function ceilUnchecked(n) {
  return Math.ceil(n);
}
