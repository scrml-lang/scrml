/**
 * url-attr-guard — the emit-side half of SPEC §5.2 rule 3 (S457 ruling "a now with c discussed for
 * later"): every URL-attribute write whose value the compiler cannot prove safe is routed through the
 * runtime guard `_scrml_safe_url(el, name, value)` (defined in `../runtime-url-guard.js`, inlined into
 * the client runtime as the 'urlguard' chunk and into the server bundle for first-paint rows).
 *
 * Two questions, asked by every emitter that writes an attribute from data:
 *   - `dynamicUrlAttrNeedsGuard(tag, name)` — the value is wholly computed at runtime
 *     (`href=${expr}`, a component-substituted `href=@cell`, an `<each>` row's `src=it.img`, a
 *     call-ref): guard whenever `name` is a URL on `tag`.
 *   - `quotedUrlAttrNeedsGuard(tag, name, raw)` — a QUOTED value with `${…}`: guard only when its
 *     literal text before the first interpolation commits to no scheme (`href="${url}"`,
 *     `src="java${x}"`). A literal relative path or safe scheme (`href="/u/${id}"`,
 *     `href="https://x/${id}"`) is proven safe at compile time and its write stays byte-identical;
 *     an unsafe or unprovable literal scheme is refused at compile time (rule 2).
 *
 * `tag` is the emitted element's tag (lowercased by the reader); pass "" when unknown and every name
 * in the URL-attribute set counts (fail closed). The reader and every set live in
 * `../runtime-url-guard.js` — there is no second list here.
 */

import { commentText } from "./comment-text.ts";
import { _scrml_is_url_attr, _SCRML_SVG_ANIMATION_ELEMENTS, _SCRML_SVG_ANIMATION_VALUE_ATTRS } from "../runtime-url-guard.js";
import { _SCRML_CSS_URL_ATTRS } from "../runtime-css-attr-guard.js";
import {
  ATTR_INTERP_EXECUTABLE_CODE,
  animationUrlTarget,
  attrSinkKey,
  executableDataWriteSink,
  interpolatedAttrSinkMessage,
  quotedAnimationValueNeedsRuntimeGuard,
  quotedUrlAttrNeedsRuntimeGuard,
} from "../attr-injection-sink.ts";
import { CGError } from "./errors.ts";
import { recordRefusedLowering } from "./refused-lowering-errors.ts";

/** The runtime guard's name, as emitted. The post-emit chunk gate in emit-client.ts keys off it. */
export const URL_GUARD_FN = "_scrml_safe_url";

/** Is `name` a URL-valued attribute on element `tag` (empty tag → name only, fail closed)? */
export function isUrlAttrOn(tag: string | null | undefined, name: string): boolean {
  return _scrml_is_url_attr(tag ?? "", name) === true;
}

/**
 * The element's attribute list, when the caller has it. Needed for an SVG animation value
 * (`<set attributeName="href" to=…>`): whether `to` writes a URL depends on `attributeName`.
 */
export type ElementAttrs = ReadonlyArray<unknown> | null | undefined;

/**
 * The 4th guard argument for an SVG animation value attribute (S457): the URL attribute it animates
 * (`"href"`), `""` when `attributeName` is computed, or null when `name` is not such a value.
 */
export function urlGuardTarget(tag: string | null | undefined, name: string, attrs?: ElementAttrs): string | null {
  return animationUrlTarget(tag ?? "", name, attrs ?? null);
}

/**
 * A wholly runtime-computed attribute value: guard every URL attribute, and every SVG animation
 * value that writes one.
 */
export function dynamicUrlAttrNeedsGuard(tag: string | null | undefined, name: string, attrs?: ElementAttrs): boolean {
  return isUrlAttrOn(tag, name) || urlGuardTarget(tag, name, attrs) !== null;
}

/**
 * A quoted `${…}` attribute value: guard when it is a URL and its literal prefix commits to no scheme
 * (an animation `values` list: whenever it interpolates — any `;` entry may be data-led).
 */
export function quotedUrlAttrNeedsGuard(
  tag: string | null | undefined,
  name: string,
  raw: string,
  attrs?: ElementAttrs,
): boolean {
  if (urlGuardTarget(tag, name, attrs) !== null) return quotedAnimationValueNeedsRuntimeGuard(name, raw);
  return isUrlAttrOn(tag, name) && quotedUrlAttrNeedsRuntimeGuard(name, raw);
}

/**
 * `_scrml_safe_url(<el>, "<name>", <valueJs>)` — the guarded value expression. For an SVG animation
 * value (`target` from `urlGuardTarget`, non-null) the animated attribute is passed as a 4th argument:
 * `_scrml_safe_url(el, "to", v, "href")`.
 */
export function wrapUrlGuard(elExpr: string, name: string, valueJs: string, target?: string | null): string {
  const extra = typeof target === "string" ? `, ${JSON.stringify(target)}` : "";
  return `${URL_GUARD_FN}(${elExpr}, ${JSON.stringify(name)}, ${valueJs}${extra})`;
}

// ---------------------------------------------------------------------------
// §5.2 (S479 carve-out 2 — ruling:user-voice-scrml.md-S479-3B-rest-item-21; gap
// g-impl1-svg-css-url-attr-and-link-stylesheet-href-unguarded-s473) — the CSS-url attributes and a
// `<link>`'s `href`. Every emitter that writes an attribute from data asks `dataAttrWriteGuard`
// first; a non-null answer replaces its `el.setAttribute(name, …)` with `guardedAttrWrite`'s setter
// call (defined in `../runtime-css-attr-guard.js`, the 'cssattrguard' chunk), which REMOVES a refused
// attribute rather than writing it. A null answer leaves the write — and its bytes — as they were.
// ---------------------------------------------------------------------------

/** The setter a data write of a CSS-url attribute (or an animation value that may write one) uses. */
export const CSS_ATTR_SET_FN = "_scrml_css_attr_set";
/** The setter a data write of a `<link>`'s `href` uses. */
export const LINK_HREF_SET_FN = "_scrml_link_href_set";

/**
 * How a data write of `name` on `tag` is guarded beyond rule 3's value wrapper:
 *   - `{ kind: "css", target }` — a CSS-url attribute (`fill`, `filter`, … — any element, lowercased
 *     name), or an SVG animation value (`to` / `from` / `by` / `values`) whose `attributeName` names
 *     a CSS-url attribute or `style` (local part after any `prefix:`), or is computed, or is absent.
 *     `target` is the URL attribute the animation may ALSO write (`""` when `attributeName` is
 *     computed — both guards judge, rule 3's first), else null;
 *   - `{ kind: "link-href" }` — `href` (any case, any `prefix:href`) on a `<link>` (any case);
 *   - null — neither (the emitter's write is unchanged).
 */
export type AttrWriteGuard = { kind: "css"; target: string | null } | { kind: "link-href" };

function isHrefAttrName(lower: string): boolean {
  return lower === "href" || lower.endsWith(":href");
}

/** Does this animation element's `attributeName` (static, computed or absent) write CSS with a URL? */
function animationWritesCss(attrs: ElementAttrs): boolean {
  let seen = false;
  for (const a of attrs ?? []) {
    const attr = a as { name?: unknown; value?: unknown } | null;
    if (!attr || typeof attr.name !== "string" || attr.name.toLowerCase() !== "attributename") continue;
    const rawValue: unknown = attr.value;
    const v: { kind?: string; value?: unknown } | undefined = typeof rawValue === "string"
      ? { kind: "string-literal", value: rawValue }
      : (rawValue as { kind?: string; value?: unknown } | undefined);
    if (!v || v.kind === "absent") continue;
    seen = true;
    if (v.kind !== "string-literal" || typeof v.value !== "string" || v.value.includes("${")) return true; // computed
    const t = v.value.trim().toLowerCase().replace(/^.*:/, "");
    if (_SCRML_CSS_URL_ATTRS.has(t) || t === "style") return true;
  }
  return !seen; // absent: any attribute may be animated (fail closed, as the bootstrap)
}

export function dataAttrWriteGuard(
  tag: string | null | undefined,
  name: string,
  attrs?: ElementAttrs,
): AttrWriteGuard | null {
  if (typeof name !== "string") return null;
  const lower = name.toLowerCase();
  const t = String(tag ?? "").toLowerCase();
  if (_SCRML_SVG_ANIMATION_ELEMENTS.has(t) && _SCRML_SVG_ANIMATION_VALUE_ATTRS.has(lower)) {
    return animationWritesCss(attrs) ? { kind: "css", target: urlGuardTarget(tag, name, attrs) } : null;
  }
  if (_SCRML_CSS_URL_ATTRS.has(lower)) return { kind: "css", target: null };
  if (t === "link" && isHrefAttrName(lower)) return { kind: "link-href" };
  return null;
}

/**
 * The setter statement (no trailing `;`) for a guarded data write: `valueJs` is the UNGUARDED value
 * expression (the setter applies rule 3's URL guard itself where it is due).
 */
export function guardedAttrWrite(elExpr: string, name: string, valueJs: string, guard: AttrWriteGuard): string {
  if (guard.kind === "link-href") return `${LINK_HREF_SET_FN}(${elExpr}, ${JSON.stringify(name)}, ${valueJs})`;
  const extra = typeof guard.target === "string" ? `, ${JSON.stringify(guard.target)}` : "";
  return `${CSS_ATTR_SET_FN}(${elExpr}, ${JSON.stringify(name)}, ${valueJs}${extra})`;
}

/**
 * §5.2 (S457) — the backstop every emitter asks immediately before it WRITES an attribute's value
 * from data (`setAttribute(name, <data>)`, or an SSR `name="<data>"`): a `srcdoc` (an HTML document)
 * or an event-handler attribute (handler text) is never written from data. VP-3 already refuses a
 * data `srcdoc` on every element; the event-handler names reach here only when an emitter does not
 * wire that spelling as a listener (`ONCLICK=${…}`, `onClick=` in `lift` markup) and would otherwise
 * write the data as JavaScript source. The refusal (E-ATTR-INTERP-EXECUTABLE) goes to the run-wide
 * refused-lowering sink (one per attribute, deduped by `anchor`); returns the comment the caller emits
 * INSTEAD of the write, or null when the write is not an executable sink.
 */
export function refuseExecutableDataWrite(
  name: string,
  tag: string | null | undefined,
  span: object | null | undefined,
  anchor: object | null | undefined,
  where = "",
): string | null {
  const sink = executableDataWriteSink(name);
  if (sink === null) return null;
  const err = new CGError(
    ATTR_INTERP_EXECUTABLE_CODE,
    interpolatedAttrSinkMessage(sink, name, String(tag ?? ""), where, "data"),
    span ?? { start: 0, end: 0 },
  );
  (err as { attrSinkKey?: string }).attrSinkKey = attrSinkKey(
    (span ?? null) as { file?: unknown; start?: unknown; end?: unknown } | null,
    name,
  );
  // The attribute's lowercased name: api.js drops this backstop report when VP-3 already refused
  // the same-named attribute in the same file (a re-parsed `<match>` arm has its own spans).
  (err as { attrSinkName?: string }).attrSinkName = name.toLowerCase();
  recordRefusedLowering(err, anchor ?? null);
  return `/* ${ATTR_INTERP_EXECUTABLE_CODE}: ${commentText(JSON.stringify(name))} is never written from data (executable sink) */`;
}
