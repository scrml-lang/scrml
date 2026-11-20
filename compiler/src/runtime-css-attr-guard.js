// SPEC §5.2 — the runtime write guards for the CSS-url attributes and a stylesheet `<link>`'s `href`
// (impl#1; S479 carve-out 2 — ruling:user-voice-scrml.md-S479-3B-rest-item-21, gap
// g-impl1-svg-css-url-attr-and-link-stylesheet-href-unguarded-s473).
//
// The compiler routes every data write of a CSS-url attribute, an SVG animation value whose target
// may be one, and a `<link>`'s `href`, through the two setters at the end of this file
// (`codegen/url-attr-guard.ts` `dataAttrWriteGuard` / `guardedAttrWrite`). The runtime inlines this
// file verbatim (`export ` stripped; runtime-template.js chunk 'cssattrguard', which depends on
// 'urlguard' for `_scrml_safe_url`), so a page with no such write ships none of it.
//
// The CSS value reader is the bootstrap's, ported verbatim — `cssValueOf` + `cssAttrValue` +
// `CSS_URL_ATTRS` / `CSS_ATTR_FUNCTIONS` / `LOCAL_FRAGMENT_URL` in
// compiler/self-host-v2/slice-m1/runtime/runtime.js (the §25.7 bridge's value check, s473 / s479).
// Same alphabet, same function sets, same accept/refuse: do not widen one without the other.
//
// Plain function and `const` declarations only — no imports — and every top-level name carries the
// `_scrml_` / `_SCRML_` prefix the runtime reserves.

// The CSS-url attributes (SPEC §5.2 "Data-supplied CSS-url attributes — runtime guard (S473)"): the
// SVG presentation attributes whose CSS value grammar admits `<url>` / `<image>`. Matched by
// lowercased name on EVERY element (SVG, HTML or custom — fail closed).
export const _SCRML_CSS_URL_ATTRS = new Set([
  "fill", "stroke", "marker", "marker-start", "marker-mid", "marker-end",
  "clip-path", "mask", "filter", "cursor", "color-profile",
]);

// The §25.7 bridge's CSS-value alphabet and colour / math functions (bootstrap `cssValueOf`).
const _SCRML_CSS_VALUE_ALPHABET = /^[A-Za-z0-9 #%.,+\-*/_()]*$/;
const _SCRML_CSS_VALUE_FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color",
  "calc", "min", "max", "clamp",
]);
const _SCRML_CSS_VALUE_MAX = 256;

// For the CSS-url attributes only: the Filter Effects 1 filter functions and the CSS Shapes 1 basic
// shapes, none of which takes a URL (bootstrap `CSS_ATTR_FUNCTIONS`).
const _SCRML_CSS_ATTR_FUNCTIONS = new Set([
  "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate",
  "invert", "opacity", "saturate", "sepia",
  "inset", "circle", "ellipse", "polygon",
]);

// S479 (ruled §3.B item 22, INTERIM) — exactly `url(#ident)`, a same-document fragment reference.
const _SCRML_LOCAL_FRAGMENT_URL = /^url\(#[A-Za-z_][A-Za-z0-9_-]*\)$/;

// The bootstrap's `cssValueOf(v, extraFunctions)` for a string: the text when admitted, else null.
function _scrml_css_attr_value_of(v) {
  if (v.length > _SCRML_CSS_VALUE_MAX || !_SCRML_CSS_VALUE_ALPHABET.test(v)) return null;
  if (v.includes("/*") || v.includes("*/")) return null;
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === "(") {
      let j = i;
      while (j > 0 && /[A-Za-z0-9_-]/.test(v[j - 1])) j--;
      const name = v.slice(j, i).toLowerCase();
      // a bare `(` is a grouping only inside a function (`calc((1px + 2px) * 2)`)
      if (name === "" ? depth === 0 : !(_SCRML_CSS_VALUE_FUNCTIONS.has(name) || _SCRML_CSS_ATTR_FUNCTIONS.has(name))) return null;
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth < 0) return null;
    }
  }
  return depth === 0 ? v : null;
}

// Is `text` (the string the write would set) admitted on a CSS-url attribute? `perEntry` (an animation
// `values` list) judges every `;`-separated entry (bootstrap `cssAttrValue`).
export function _scrml_css_attr_value_admitted(text, perEntry) {
  const entries = perEntry ? text.split(";") : [text];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (_SCRML_LOCAL_FRAGMENT_URL.test(e.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""))) continue;
    if (_scrml_css_attr_value_of(e) === null) return false;
  }
  return true;
}

function _scrml_css_guard_report(message) {
  const err = new Error(message);
  if (typeof _scrml_error_boundary_log === "function") {
    _scrml_error_boundary_log("css-guard", err);
  } else if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error("[scrml css-guard] " + err.message);
  }
}

// THE write of a CSS-url attribute (or of an SVG animation value that may animate one) from data
// (SPEC §5.2 "Data-supplied CSS-url attributes"). `value` is converted to a string exactly as
// `setAttribute` converts it. `target` is passed only for an animation value whose animated attribute
// may ALSO be a URL attribute — `""` when `attributeName` is computed: then §5.2 rule 3's URL guard
// judges first (a refused scheme is written as `about:blank`, as `_scrml_safe_url` does), then this
// one. A refused value is NOT written: the attribute is removed, and the refusal is reported once,
// naming the attribute and the element — never the value.
export function _scrml_css_attr_set(el, name, value, target) {
  const text = String(value);
  if (typeof target === "string") {
    const u = _scrml_safe_url(el, name, text, target);
    if (u !== text) { el.setAttribute(name, u); return; }
  }
  const lower = String(name).toLowerCase();
  if (_scrml_css_attr_value_admitted(text, lower === "values")) { el.setAttribute(name, text); return; }
  el.removeAttribute(name);
  const tag = el && typeof el.tagName === "string" ? "<" + el.tagName.toLowerCase() + "> " : "";
  _scrml_css_guard_report(
    "refused a data-supplied value for " + tag + String(name) + "=: the browser reads this attribute as " +
    "CSS, and only a finite number, a plain CSS value (no url(), image-set(), var(), quotes, escapes, ; { } " +
    "< or !) or exactly a same-document url(#id) is written there from data (SPEC §5.2). The attribute was removed.",
  );
}

// Does this `<link>` load (or may it load) a stylesheet? Its `rel` text holds `stylesheet` anywhere
// (ASCII case-insensitive — a superset of the token test, fail closed). A `rel` written from data is
// refused at compile time with any data `href` (E-ATTR-STYLESHEET-HREF), so the static text decides.
function _scrml_link_loads_sheet(el) {
  const rel = el && typeof el.getAttribute === "function" ? el.getAttribute("rel") : null;
  return rel !== null && String(rel).toLowerCase().indexOf("stylesheet") !== -1;
}

// THE write of a `<link>`'s `href` (any case, any `prefix:href`) from data (SPEC §5.2 "Data-supplied
// stylesheets (S472)": "Every runtime path that writes a `<link>`'s `href` from data SHALL refuse the
// write when the element's `rel` contains `stylesheet` …"). Refused: the attribute is removed and the
// refusal reported (never the value). Otherwise the value is judged by §5.2 rule 3's URL guard.
export function _scrml_link_href_set(el, name, value) {
  if (_scrml_link_loads_sheet(el)) {
    el.removeAttribute(name);
    _scrml_css_guard_report(
      "refused a data-supplied `" + String(name) + "` on a <link> whose `rel` loads a stylesheet: a " +
      "stylesheet is never chosen by data (SPEC §5.2). The attribute was removed.",
    );
    return;
  }
  el.setAttribute(name, _scrml_safe_url(el, name, value));
}
