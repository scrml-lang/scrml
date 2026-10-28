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
// Call shape (S473 fix round, review MED-1): impl#1 does not check call arity
// or argument types (§41.18 S472 Status — it carries E-CALL-ARITY, §7.3), so
// EVERY public export checks its own call shape and THROWS a TypeError
// (code "E-CALL-ARITY" for a wrong argument count, "E-CALL-ARGUMENT" for an
// argument of the wrong kind) instead of answering a call the S469 API does
// not define — `min(3, 1, 0)`, `parseInt("42")` (the radix is REQUIRED,
// §41.18: "An omitted radix is `E-CALL-ARITY`"), `toNumber(5)` (§41.18:
// `toNumber(s: string)`). A refusal, never a silently picked answer — the
// same rule `round(x)` already followed.
//
// Internal (NOT part of the scrml:math API — stdlib/math/index.scrml does not
// export them, so an adopter import of one is E-IMPORT-004): `floorUnchecked`,
// `ceilUnchecked`, `minUnchecked` and `maxUnchecked`, the raw host floor / ceil
// / min / max the runtime's own shims (auth.js, data.js, time.js) use. They do
// not trap or check their call shape: those callers' behaviour is unchanged by
// the S469 API (S472 ruling).

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

// The call-shape refusal (see header). `what` names the member and its S469
// signature, so the message says what the call should have been.
function refuse(code, what, detail) {
  const e = new TypeError(code + ": scrml:math " + what + " — " + detail + " (§41.18; impl#1 does not check this at compile time)");
  e.code = code;
  throw e;
}

function arity(args, n, what) {
  if (args.length !== n) refuse("E-CALL-ARITY", what, "takes " + n + " argument" + (n === 1 ? "" : "s") + ", got " + args.length);
}

function num(v, what, name) {
  if (typeof v !== "number") refuse("E-CALL-ARGUMENT", what, "`" + name + "` must be a number, got " + (v === null ? "not" : typeof v));
}

function str(v, what, name) {
  if (typeof v !== "string") refuse("E-CALL-ARGUMENT", what, "`" + name + "` must be a string, got " + (v === null ? "not" : typeof v));
}

function numTape(xs, what) {
  if (!Array.isArray(xs)) refuse("E-CALL-ARGUMENT", what, "`xs` must be a tape of numbers, got " + (xs === null ? "not" : typeof xs));
  for (const x of xs) num(x, what, "xs[…]");
}

// §41.18 / §19.17 — the E-INT-CONVERSION-RT trap: never a silently wrong int.
function intOf(r, what, x) {
  if (Number.isFinite(r) && Math.abs(r) <= MAX_EXACT_INT) return r === 0 ? 0 : r; // `-0` is the int 0
  const e = new Error("E-INT-CONVERSION-RT: " + what + "(" + String(x) + ") has no int value — NaN, ±∞, or outside ±(2^53−1) (§41.18)");
  e.name = "ScrmlTrap";
  e.code = "E-INT-CONVERSION-RT";
  throw e;
}

export function floor(x) {
  arity(arguments, 1, "floor(x: number) -> int");
  num(x, "floor(x: number) -> int", "x");
  return intOf(Math.floor(x), "floor", x);
}

export function ceil(x) {
  arity(arguments, 1, "ceil(x: number) -> int");
  num(x, "ceil(x: number) -> int", "x");
  return intOf(Math.ceil(x), "ceil", x);
}

export function trunc(x) {
  arity(arguments, 1, "trunc(x: number) -> int");
  num(x, "trunc(x: number) -> int", "x");
  return intOf(Math.trunc(x), "trunc", x);
}

// `.HalfEven` picks the even neighbour of a tie; `.HalfUp` goes AWAY FROM
// ZERO (`-2.5` → `-3`); the directed modes are floor / ceil / trunc.
export function round(x, mode) {
  if (arguments.length === 1) refuse("E-CALL-ARITY", "round(x: number, mode: Rounding) -> int", "the mode is required and must be a Rounding value (.HalfEven, .HalfUp, .Floor, .Ceil, .Trunc) — `round(x)` is E-CALL-ARITY");
  arity(arguments, 2, "round(x: number, mode: Rounding) -> int");
  num(x, "round(x: number, mode: Rounding) -> int", "x");
  switch (mode) {
    case "HalfEven": {
      let r = Math.round(x);
      if (r - x === 0.5 && Math.abs(r % 2) === 1) r = r - 1;
      return intOf(r, "round", x);
    }
    case "HalfUp":
      return intOf(x < 0 ? -Math.round(-x) : Math.round(x), "round", x);
    case "Floor":
      return intOf(Math.floor(x), "round", x);
    case "Ceil":
      return intOf(Math.ceil(x), "round", x);
    case "Trunc":
      return intOf(Math.trunc(x), "round", x);
    default:
      throw new TypeError("round(x, mode): the mode is required and must be a Rounding value (.HalfEven, .HalfUp, .Floor, .Ceil, .Trunc), got " + String(mode) + " (§41.18 — `round(x)` is E-CALL-ARITY)");
  }
}

export function abs(x) {
  arity(arguments, 1, "abs(x: number) -> number");
  num(x, "abs(x: number) -> number", "x");
  return Math.abs(x);
}

export function min(a, b) {
  const what = "min(a: number, b: number) -> number (a tape's minimum is minOf(xs))";
  arity(arguments, 2, what);
  num(a, what, "a");
  num(b, what, "b");
  return Math.min(a, b);
}

export function max(a, b) {
  const what = "max(a: number, b: number) -> number (a tape's maximum is maxOf(xs))";
  arity(arguments, 2, what);
  num(a, what, "a");
  num(b, what, "b");
  return Math.max(a, b);
}

export function clamp(value, minimum, maximum) {
  const what = "clamp(value: number, minimum: number, maximum: number) -> number";
  arity(arguments, 3, what);
  num(value, what, "value");
  num(minimum, what, "minimum");
  num(maximum, what, "maximum");
  return Math.min(Math.max(value, minimum), maximum);
}

export function minOf(xs) {
  arity(arguments, 1, "minOf(xs: number[]) -> number | not");
  numTape(xs, "minOf(xs: number[]) -> number | not");
  if (xs.length === 0) return null;
  let m = xs[0];
  for (const x of xs) m = Math.min(m, x);
  return m;
}

export function maxOf(xs) {
  arity(arguments, 1, "maxOf(xs: number[]) -> number | not");
  numTape(xs, "maxOf(xs: number[]) -> number | not");
  if (xs.length === 0) return null;
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
  // §41.18: the radix is REQUIRED — "An omitted radix is `E-CALL-ARITY`"; base-10
  // text is `int.parse(s)`. A radix that is a number but not an int in 2–36 is a
  // failed parse (`not`, §41.18 "PA reading"), never a trap.
  const what = "parseInt(s: string, radix: int) -> int | not";
  arity(arguments, 2, what);
  str(s, what, "s");
  num(radix, what, "radix");
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

// `number.parse(s)` (§14.13.4): an optional `-`, digits with an optional `.`
// fraction, an optional exponent — the whole string, a FINITE result only.
const NUMBER_TEXT = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

function parseNumberText(s) {
  if (!NUMBER_TEXT.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : n;
}

export function parseFloat(s) {
  arity(arguments, 1, "parseFloat(s: string) -> number | not");
  str(s, "parseFloat(s: string) -> number | not", "s");
  return parseNumberText(s);
}

// §41.18 (S469, applying S440 dpa-037 Call 4): `toNumber(s: string) -> number | not`
// — a whole-string parse; the struck `Number(value)` coercion of a non-string is gone.
export function toNumber(s) {
  arity(arguments, 1, "toNumber(s: string) -> number | not");
  str(s, "toNumber(s: string) -> number | not", "s");
  return parseNumberText(s);
}

export function isNaN(x) {
  arity(arguments, 1, "isNaN(x: number) -> bool");
  num(x, "isNaN(x: number) -> bool", "x");
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

export function minUnchecked(a, b) {
  return Math.min(a, b);
}

export function maxUnchecked(a, b) {
  return Math.max(a, b);
}
