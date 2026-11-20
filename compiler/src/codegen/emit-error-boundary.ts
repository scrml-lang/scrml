// emit-error-boundary.ts
// ---------------------------------------------------------------------------
// errorBoundary (SPEC §19.6) — compiler support for the markup-context error
// catch. Two complementary paths land here (see SPEC §19.6.3 + §19.6.8):
//
//   1. TYPED `!`-error path (PRIMARY, §19.6.3) — a `!`-function call inside the
//      boundary subtree returns the scrml error envelope
//      `{ __scrml_error, type, variant, data }`. The runtime dispatches on
//      `result.variant`: the variant's own `renders` markup (§19.2) is shown
//      first, else the boundary's `fallback=` markup, else E-ERROR-005 would
//      have fired at compile time (§19.6.6).
//
//   2. HOST-JS BACKSTOP (C-hybrid, §19.6.8) — the subtree render is additionally
//      wrapped in an emitted host-JS try/catch so a NON-`!` throw (a host
//      TypeError, a malformed-data exception) degrades to the boundary's
//      `fallback=` rather than corrupting the page. The backstop is
//      compiler-emitted host-JS — NOT a scrml-source try/catch (§19.9.8 is
//      unaffected) — a runtime sibling of the §2.2.1 emitted-JS parse gate.
//      It logs loudly and does NOT silently swallow (§19.6.8 B5).
//
// This module produces the compile-time data (fallback HTML, per-variant
// renders templates) consumed by emit-event-wiring.ts to emit the runtime
// dispatch + backstop. Markup-string-to-HTML uses a re-parse of the raw
// markup fragment through the BS -> TAB -> generateHtml sub-pipeline (the same
// recursion the boundary's own children take), so nested tags + the `</>`
// closer are handled correctly.
// ---------------------------------------------------------------------------

import { runBlockSplitter } from "../block-splitter.js";
import { buildAST } from "../ast-builder.js";
import {
  ATTR_BASE_HREF_CODE,
  ATTR_STYLESHEET_HREF_CODE,
  RENDERS_FIELD_SENTINEL,
  baseHrefFromData,
  stylesheetHrefFromData,
} from "../attr-injection-sink.ts";
import { dataAttrWriteGuard, dynamicUrlAttrNeedsGuard, urlGuardTarget } from "./url-attr-guard.ts";
import { _SCRML_SVG_ANIMATION_ELEMENTS, _SCRML_SVG_ANIMATION_VALUE_ATTRS } from "../runtime-url-guard.js";

/**
 * A compiled markup template for a fallback / renders body.
 *
 * - `htmlTemplate` is the rendered HTML with each `${field}` interpolation
 *   replaced by a sentinel-delimited field marker. The runtime substitutes
 *   these from the error variant's `.data` payload. When `fields` is empty the
 *   template is pure static HTML.
 * - `fields` lists the payload field names referenced (in first-seen order).
 */
export interface BoundaryMarkupTemplate {
  htmlTemplate: string;
  fields: string[];
}

// Sentinel delimiting a runtime-substituted payload field inside the rendered
// HTML template. Chosen to never collide with source markup: a private-use
// Unicode codepoint that does not appear in scrml source or generated HTML.
// The one spelling is attr-injection-sink.ts `RENDERS_FIELD_SENTINEL` — the §5.2 checks read it as
// data (S480 r1 F1: a captured field is not a static attribute value).
const FIELD_SENTINEL = RENDERS_FIELD_SENTINEL;

/**
 * Convert a raw scrml markup fragment (the `fallback=` attribute value or a
 * variant `renders` body) into an HTML template string. Each `${expr}`
 * interpolation whose expr is a bare identifier (a variant payload field) is
 * captured as a runtime-substituted field; richer expressions are left as a
 * literal `${...}` marker in the HTML (best-effort — payload-field refs are the
 * canonical §19.2.2 shape).
 *
 * Re-parses the fragment through the BS -> TAB -> generateHtml path so nested
 * elements + the `</>` closer lower exactly as the boundary's own children do.
 * `generateHtml` is passed lazily (caller injects it) to avoid a static import
 * cycle with emit-html.ts.
 */
/**
 * Reverse the block-splitter's tokenizer spacing for a markup fragment so it
 * re-parses cleanly. A variant's `renders` markup arrives via the enum
 * type-decl's `raw` string in tokenized form (`< div class = err > ... < / >`);
 * the `fallback=` attribute value arrives already-compact. This normalization
 * is idempotent on already-compact markup, so it is safe for both sources.
 *
 *   `< div`  -> `<div`     (tag opener)
 *   `< /`    -> `</`       (close-tag opener)
 *   ` >`     -> `>`        (tag close)
 *   ` / >`   -> `/>`       (self-close, incl. the `</>` scrml closer)
 */
function normalizeTokenizedMarkup(s: string): string {
  return s
    .replace(/<\s+/g, "<")
    .replace(/\s*\/\s*>/g, "/>")
    .replace(/\s+>/g, ">");
}

/**
 * Convert scrml's TERSE `/` markup-value closer into the explicit `</>` form so
 * the isolated re-parse (BS -> TAB -> generateHtml) can lower it.
 *
 * A `fallback={<markup/>}` (SPEC §19.6.2) or a `renders <markup/>` clause may use
 * the terse `/` closer — a `/` that closes the innermost open element, the value-
 * boundary analog of `</>` (SPEC §19.6.2's canonical form is `{<div>...text/}`,
 * the DOMINANT shape across the SPEC's boundary examples). The standalone re-parse
 * only understands `</>` / `</tag>` closers; a bare terse `/` yields ZERO nodes,
 * so the boundary's declared fallback markup silently compiled to an EMPTY string
 * (`fallbackExpr === '""'`) — the boundary caught the error but rendered nothing
 * (GitHub #22). Rewriting each terse `/` closer to `</>` restores the fallback.
 *
 * A `/` is a terse closer ONLY when an element is open (`depth > 0`) AND the `/`
 * is at a closer position: immediately followed (ignoring whitespace) by end-of-
 * fragment or by a `<` (the next sibling opener / an ancestor's `</>` closer).
 * This preserves literal text slashes (`and/or`, `http://x`) — a `/` with a
 * non-`<` character after it is text, not a closer. `${...}` interpolation spans
 * (which may legitimately contain `<` / `/`) are copied verbatim, and quoted
 * attribute strings are skipped. Idempotent on markup that already uses `</>`.
 */
function convertTerseClosers(s: string): string {
  let out = "";
  let i = 0;
  const n = s.length;
  let depth = 0;             // open markup element depth
  let inD = false, inS = false; // inside a "..." / '...' attribute string
  while (i < n) {
    const c = s[i];
    if (inD) { out += c; if (c === '"') inD = false; i++; continue; }
    if (inS) { out += c; if (c === "'") inS = false; i++; continue; }
    // Copy a `${ ... }` interpolation span verbatim (brace-balanced) — its
    // interior may hold `<` / `/` that are NOT markup structure.
    if (c === "$" && s[i + 1] === "{") {
      let j = i + 2;
      let braceDepth = 1;
      while (j < n && braceDepth > 0) {
        if (s[j] === "{") braceDepth++;
        else if (s[j] === "}") braceDepth--;
        j++;
      }
      out += s.slice(i, j);
      i = j;
      continue;
    }
    if (c === '"') { inD = true; out += c; i++; continue; }
    if (c === "'") { inS = true; out += c; i++; continue; }
    if (c === "<") {
      if (s[i + 1] === "/") {
        // Explicit closer `</...>` or `</>` — copy through, pop one level.
        let j = i + 2;
        while (j < n && s[j] !== ">") j++;
        if (j < n) j++; // include the closing `>`
        out += s.slice(i, j);
        if (depth > 0) depth--;
        i = j;
        continue;
      }
      if (/[A-Za-z]/.test(s[i + 1] ?? "")) {
        // Opener `<tag ...>` or inline self-close `<tag/>` — scan to its `>`.
        let j = i + 1;
        let d = false, sq = false, selfClose = false;
        while (j < n) {
          const cc = s[j];
          if (d) { if (cc === '"') d = false; j++; continue; }
          if (sq) { if (cc === "'") sq = false; j++; continue; }
          if (cc === '"') { d = true; j++; continue; }
          if (cc === "'") { sq = true; j++; continue; }
          if (cc === "/" && s[j + 1] === ">") { selfClose = true; j += 2; break; }
          if (cc === ">") { j++; break; }
          j++;
        }
        out += s.slice(i, j);
        if (!selfClose) depth++;
        i = j;
        continue;
      }
      // A `<` not opening markup (e.g. a stray less-than) — copy literally.
      out += c; i++; continue;
    }
    if (c === "/" && depth > 0 && s[i + 1] !== ">") {
      // Terse closer only when the next non-whitespace char is end-of-fragment
      // or a `<` markup token; otherwise it is a literal slash in text.
      let k = i + 1;
      while (k < n && /\s/.test(s[k] ?? "")) k++;
      if (k >= n || s[k] === "<") {
        out += "</>";
        depth--;
        i++;
        continue;
      }
    }
    out += c; i++;
  }
  return out;
}

/** The payload-field interpolation `${field}` a fallback / renders template captures. */
const FIELD_INTERP = /\$\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}/g;

/**
 * §5.2 "Data-supplied stylesheets (S472)" over a `renders` / `fallback=` template (S480 r1 F1; r2
 * N1): the `<link>` attributes written from a payload field whose `rel` loads a stylesheet
 * (attr-injection-sink.ts `stylesheetHrefFromData`). Its callers are VP-3
 * (validators/attribute-interpolation.ts): `collectRendersStylesheetHrefErrors` for every enum
 * variant's `renders` (reported at the declaration) and `collectExecutableSinkErrors` for every
 * `<errorBoundary fallback=…>` (reported at the boundary) — the two templates `emitBoundaryMarkupExpr`
 * builds. The runtime twin is `_scrml_link_href_html`. The template is re-parsed as
 * `compileBoundaryMarkup` parses it, except that an UNQUOTED `name=${field}` is read as the quoted
 * `name="${field}"` (codegen drops its value, but it is data all the same — fail closed, as the
 * bootstrap refuses `href=sheet`). Returns one `{ tag, name, code }` per refused attribute.
 *
 * S480 (carve-out 2 widened — ruling:user-voice-scrml.md-S480-census-recs item 5): the same walk
 * reports a `<base>`'s `href` taken from a payload field — §5.2 "Data never moves the document base
 * (S473)": "A `<base>` … whose `href` (any case) is not a static string … SHALL be a compile error
 * (E-ATTR-BASE-HREF)" (attr-injection-sink.ts `baseHrefFromData`, the bootstrap's shape). The runtime
 * twin is `_scrml_link_href_html(…, "base")`.
 */
export type RendersHrefRefusal = { tag: string; name: string; code: string };
export function rendersHrefRefusalHits(rawMarkup: string): RendersHrefRefusal[] {
  const trimmed = normalizeTokenizedMarkup((rawMarkup ?? "").trim());
  if (trimmed === "") return [];
  const quotedForm = trimmed.replace(/=\s*\$\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}/g,
    (_m, name: string) => `="${FIELD_SENTINEL}${name}${FIELD_SENTINEL}"`);
  const prepared = convertTerseClosers(
    quotedForm.replace(FIELD_INTERP, (_m, name: string) => `${FIELD_SENTINEL}${name}${FIELD_SENTINEL}`));
  let nodes: any[];
  try {
    const bs = runBlockSplitter({ filePath: "<errorBoundary-markup>", source: prepared });
    nodes = ((buildAST(bs) as { ast?: { nodes?: any[] } })?.ast?.nodes) ?? [];
  } catch {
    // compileBoundaryMarkup then writes the template as escaped TEXT (no element, no attribute).
    return [];
  }
  const hits: RendersHrefRefusal[] = [];
  const seen = new Set<any>();
  const visit = (n: any): void => {
    if (!n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (typeof n.tag === "string" && Array.isArray(n.attrs)) {
      for (const a of n.attrs) {
        if (!a || typeof a.name !== "string") continue;
        if (stylesheetHrefFromData(n.tag, a.name, a.value, n.attrs)) {
          hits.push({ tag: n.tag, name: a.name, code: ATTR_STYLESHEET_HREF_CODE });
        } else if (baseHrefFromData(n.tag, a.name, a.value)) {
          hits.push({ tag: n.tag, name: a.name, code: ATTR_BASE_HREF_CODE });
        }
      }
    }
    for (const k of ["children", "body", "nodes"]) if (n[k]) visit(n[k]);
  };
  visit(nodes);
  return hits;
}

/**
 * The raw markup text of an `<errorBoundary>`'s `fallback={<markup/>}` attribute value — an `expr`
 * wrapper whose `raw` holds the markup source, or an escape-hatch node carrying it in `.raw`. "" when
 * there is none. The one reader for codegen (emit-html.ts) and the §5.2 check (VP-3).
 */
export function boundaryFallbackRaw(value: unknown): string {
  const fv = value as { raw?: unknown; exprNode?: { raw?: unknown } } | null | undefined;
  if (!fv || typeof fv !== "object") return "";
  return (typeof fv.raw === "string" ? fv.raw : undefined) ??
    (fv.exprNode && typeof fv.exprNode.raw === "string" ? fv.exprNode.raw : "") ?? "";
}

export function compileBoundaryMarkup(
  rawMarkup: string,
  generateHtmlFn: (nodes: any[], ctxOrErrors: any) => string,
): BoundaryMarkupTemplate {
  const trimmed = normalizeTokenizedMarkup((rawMarkup ?? "").trim());
  if (trimmed === "") return { htmlTemplate: "", fields: [] };

  // Capture `${ident}` payload-field interpolations BEFORE re-parse so they do
  // not become `<span data-scrml-logic>` placeholders (which the re-parse would
  // otherwise produce for an unbound identifier). Replace each with a sentinel-
  // delimited field marker embedded in a plain text node, then re-parse.
  const fields: string[] = [];
  const withFields = trimmed.replace(FIELD_INTERP, (_m, name: string) => {
    if (!fields.includes(name)) fields.push(name);
    return `${FIELD_SENTINEL}${name}${FIELD_SENTINEL}`;
  });
  // Rewrite scrml's terse `/` markup-value closer to the explicit `</>` form the
  // standalone re-parse understands (SPEC §19.6.2's `{<div>...text/}` shape);
  // without this the fallback markup silently compiled to "" (GitHub #22). Run
  // AFTER the field-interp pass so any remaining literal `${...}` span is opaque.
  const prepared = convertTerseClosers(withFields);

  let html: string;
  try {
    const bs = runBlockSplitter({ filePath: "<errorBoundary-markup>", source: prepared });
    const built = buildAST(bs) as { ast?: { nodes?: any[] } };
    const nodes = built?.ast?.nodes ?? [];
    html = generateHtmlFn(nodes, null);
  } catch {
    // If the fragment does not re-parse cleanly (e.g. an exotic body the sub-
    // pipeline cannot lower in isolation), fall back to escaping the raw text
    // so the runtime still renders SOMETHING readable rather than emitting
    // invalid JS. The boundary still catches; only the displayed markup is the
    // raw text. This is conservative — the parse gate (§2.2.1) never sees a
    // broken template because the output is a plain JS string literal.
    html = escapeHtmlText(prepared);
  }

  return { htmlTemplate: html, fields };
}

/**
 * Emit a JS string-concatenation expression that reconstructs the boundary
 * markup template at runtime, substituting each field sentinel with
 * `String(<dataExpr>.<field>)`. `dataExpr` is the JS expression that yields the
 * error variant's `.data` payload object (e.g. `result.data`).
 *
 * - Static template (no fields)  -> a single quoted string literal.
 * - Field template               -> `"prefix" + _scrml_error_boundary_text(data.field) + "suffix"`.
 *
 * Field values are converted to HTML-escaped text (runtime-template.js
 * `_scrml_error_boundary_text`) and the surrounding HTML is a compile-time-known
 * literal, so the result is always valid JS and a payload never becomes markup.
 */
export function emitBoundaryMarkupExpr(
  tpl: BoundaryMarkupTemplate,
  dataExpr: string,
  payloadFields?: string[],
): string {
  if (tpl.fields.length === 0) {
    return JSON.stringify(tpl.htmlTemplate);
  }
  // §51.3.2 — the error envelope stores EVERY payload variant's fields as a
  // field-keyed object on `.data`, for BOTH single- AND multi-field variants
  // (matching the enum constructor `Shape.Circle(10)` -> `data:{r:10}`,
  // emitFailExpr, parseVariant, and the `!{}` / `match` payload binders). So a
  // `${field}` reference lowers to `(data).field` uniformly. (`payloadFields`
  // is retained for caller-signature stability; the field name comes from the
  // sentinel segment, so no arity discrimination is needed.)
  void payloadFields;
  const fieldValue = (field: string): string => `(${dataExpr}) != null ? (${dataExpr}).${field} : ""`;
  const pieces: string[] = [];
  // Split on the sentinel. The split alternates literal-HTML and field-name
  // segments: even indices are HTML, odd indices are field names.
  const pushHtml = (html: string): void => {
    const segments = html.split(FIELD_SENTINEL);
    for (let i = 0; i < segments.length; i++) {
      if (i % 2 === 0) {
        if (segments[i] !== "") pieces.push(JSON.stringify(segments[i]));
      } else {
        // S468 fix round 1 (F3) — the template is written with innerHTML, so a payload
        // value is HTML-escaped (text, never markup): §4.18.6 — an interpolated value
        // "SHALL be escaped per the existing interpolation escaping rules".
        pieces.push(`_scrml_error_boundary_text(${fieldValue(segments[i])})`);
      }
    }
  };
  // §5.2 "Data-supplied CSS-url attributes" (S479 carve-out 2; S480 r1 F2) — a CSS-url attribute
  // (`fill=`, `filter=`, … or an SVG animation value that may animate one) whose value carries a
  // payload field is not written raw: the whole ` name="…"` is built at run time by
  // `_scrml_css_attr_html` (runtime-css-attr-guard.js), which judges the assembled value with the
  // same reader as `_scrml_css_attr_set` and writes nothing (reported) when it is refused.
  // §5.2 "Data-supplied stylesheets (S472)" (S480 r2 N1) — likewise a `<link>`'s `href` carrying a
  // payload field is built by `_scrml_link_href_html` from its `rel` and `href` pieces: not written
  // (reported) when `rel` loads a stylesheet. Defence in depth: VP-3 already refuses that template
  // (E-ATTR-STYLESHEET-HREF).
  // §5.2 rule 3 (S480, carve-out 2 widened — ruling:user-voice-scrml.md-S480-census-recs item 5; gap
  // g-impl1-renders-href-unguarded-s480): "a data-supplied value written to a URL attribute … SHALL be
  // judged at run time". Every other URL attribute carrying a payload field (`href`, `src`, `action`,
  // `formaction`, `xlink:href`, `poster`, `data` on `<object>` … — `_scrml_is_url_attr` on its element),
  // and an SVG animation value that animates one (`<set attributeName="href" to="${f}">`), is built by
  // `_scrml_url_attr_html`, which judges the assembled value with `_scrml_safe_url` (refused →
  // `about:blank`, reported), as every DOM writer's URL write is judged. A non-stylesheet `<link href>`
  // goes through `_scrml_link_href_html`, which now applies the same guard (as `_scrml_link_href_set`
  // does). A `<base>`'s `href` from a payload field is never written (`_scrml_link_href_html(…, "base")`
  // → `""`; VP-3 already refuses it, E-ATTR-BASE-HREF).
  const valueParts = (value: string): string => {
    const segs = value.split(FIELD_SENTINEL);
    const parts: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      if (i % 2 === 0) { if (segs[i] !== "") parts.push(JSON.stringify(decodeHtmlAttr(segs[i]))); }
      else parts.push(fieldValue(segs[i]));
    }
    return `[${parts.join(", ")}]`;
  };
  let at = 0;
  for (const g of guardedTemplateAttrs(tpl.htmlTemplate)) {
    pushHtml(tpl.htmlTemplate.slice(at, g.start));
    if (g.kind === "link-href") {
      const rel = g.rel === null ? "null" : valueParts(g.rel);
      const base = g.tag === "base" ? `, "base"` : "";
      pieces.push(`_scrml_link_href_html(${JSON.stringify(g.name)}, ${rel}, ${valueParts(g.value)}${base})`);
    } else if (g.kind === "url") {
      const extra = typeof g.target === "string" ? `, ${JSON.stringify(g.target)}` : "";
      pieces.push(`_scrml_url_attr_html(${JSON.stringify(g.tag)}, ${JSON.stringify(g.name)}, ${valueParts(g.value)}${extra})`);
    } else {
      const extra = typeof g.target === "string" ? `, ${JSON.stringify(g.target)}` : "";
      pieces.push(`_scrml_css_attr_html(${JSON.stringify(g.tag)}, ${JSON.stringify(g.name)}, ${valueParts(g.value)}${extra})`);
    }
    at = g.end;
  }
  pushHtml(tpl.htmlTemplate.slice(at));
  if (pieces.length === 0) return '""';
  return pieces.join(" + ");
}

/** Undo emit `escapeHtmlAttr` (`&` `"` `<` `>`) and the `'` escape, for a literal part of a value. */
function decodeHtmlAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The attributes of a generated template (`generateHtml` output: ` name="value"`, values
 * attribute-escaped) that a §5.2 write guard covers: a payload field (`FIELD_SENTINEL`) in the value,
 * and `url-attr-guard.ts` `dataAttrWriteGuard` answers `css` (a CSS-url attribute; a captured field in
 * another attribute's value — `attributeName` — counts as computed) or `link-href` (a `<link>`'s or a
 * `<base>`'s `href`; `rel` is that element's `rel` value, null when it has none) for the name on that
 * element; otherwise `url` when §5.2 rule 3 guards the name there (`dynamicUrlAttrNeedsGuard`: a URL
 * attribute on that element, or an SVG animation value whose static `attributeName` names one —
 * `target`). An SVG animation value whose `attributeName` is itself a payload field is guarded even when
 * the value is static (S480: the data chooses which attribute the static text is written to —
 * `attributeName="${f}" to="javascript:…"`; the bootstrap judges such a value at run time,
 * `animatedUrlTarget` → "").
 * `start` is the whitespace before the name, `end` just past the closing quote.
 */
type GuardedTemplateAttr = {
  start: number; end: number; tag: string; name: string; value: string;
  kind: "css" | "link-href" | "url"; target: string | null; rel: string | null;
};
function guardedTemplateAttrs(html: string): GuardedTemplateAttr[] {
  const out: GuardedTemplateAttr[] = [];
  if (html.indexOf(FIELD_SENTINEL) < 0) return out;
  const n = html.length;
  let i = 0;
  while (i < n) {
    if (html[i] !== "<" || !/[A-Za-z]/.test(html[i + 1] ?? "")) { i++; continue; }
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(html[j])) j++;
    const tag = html.slice(i + 1, j);
    const attrs: Array<{ start: number; end: number; name: string; value: string | null }> = [];
    while (j < n) {
      const ws = j;
      while (j < n && /\s/.test(html[j])) j++;
      if (j >= n || html[j] === ">") { j++; break; }
      if (html[j] === "/" ) { j++; continue; }
      const nameStart = j;
      while (j < n && !/[\s=/>]/.test(html[j])) j++;
      const name = html.slice(nameStart, j);
      let value: string | null = null;
      if (html[j] === "=") {
        j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const close = html.indexOf(q, j + 1);
          const end = close < 0 ? n : close;
          value = html.slice(j + 1, end);
          j = close < 0 ? n : close + 1;
        } else {
          const vs = j;
          while (j < n && !/[\s>]/.test(html[j])) j++;
          value = html.slice(vs, j);
        }
      }
      if (name === "") { j++; continue; }
      attrs.push({ start: ws, end: j, name, value });
    }
    const asAst = attrs.map((a) => ({
      name: a.name,
      value: a.value === null ? { kind: "absent" }
        : { kind: "string-literal", value: a.value.replace(/\uE000([^\uE000]*)\uE000/g, "${$1}") },
    }));
    const lowerTag = tag.toLowerCase();
    const computedAnimationTarget = _SCRML_SVG_ANIMATION_ELEMENTS.has(lowerTag) &&
      attrs.some((r) => r.name.toLowerCase() === "attributename" && r.value !== null && r.value.indexOf(FIELD_SENTINEL) >= 0);
    for (const a of attrs) {
      if (a.value === null) continue;
      if (a.value.indexOf(FIELD_SENTINEL) < 0 &&
          !(computedAnimationTarget && _SCRML_SVG_ANIMATION_VALUE_ATTRS.has(a.name.toLowerCase()))) continue;
      const guard = dataAttrWriteGuard(tag, a.name, asAst as any);
      if (!guard) {
        if (dynamicUrlAttrNeedsGuard(tag, a.name, asAst as any)) {
          out.push({ start: a.start, end: a.end, tag: lowerTag, name: a.name, value: a.value,
            kind: "url", target: urlGuardTarget(tag, a.name, asAst as any), rel: null });
        }
        continue;
      }
      if (guard.kind === "link-href") {
        const relAttr = attrs.find((r) => r.name.toLowerCase() === "rel");
        const rel = relAttr === undefined ? null : (relAttr.value ?? "");
        out.push({ start: a.start, end: a.end, tag: tag.toLowerCase(), name: a.name, value: a.value,
          kind: "link-href", target: null, rel });
        continue;
      }
      out.push({ start: a.start, end: a.end, tag: tag.toLowerCase(), name: a.name, value: a.value,
        kind: "css", target: guard.target, rel: null });
    }
    i = j;
  }
  return out;
}

/** Minimal HTML-text escape for the re-parse fallback path. */
function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ---------------------------------------------------------------------------
// Variant -> `renders` markup extraction (§19.2).
//
// The `renders` clause survives into the AST only inside the enum type-decl's
// `raw` string (the type system's parseEnumBody extracts it into VariantDef,
// but that structured form is not threaded back onto the codegen-side AST
// node). For the boundary's per-variant render dispatch we parse the raw
// directly — mirroring emit-client.ts:getAllVariantInfo's raw-fallback split —
// and capture each variant's `renders <markup>` body as a raw string.
// ---------------------------------------------------------------------------

/** A single enum type's variant -> renders-markup map, keyed by enum type name. */
export interface EnumRendersInfo {
  /** Enum type name (e.g. "LoadError"). */
  typeName: string;
  /** variantName -> raw `renders` markup string (only variants that HAVE a renders clause). */
  renders: Map<string, string>;
  /**
   * variantName -> ordered payload field names. Per §51.3.2 the error envelope
   * stores EVERY payload variant's fields as a field-keyed object on `.data`
   * (single- AND multi-field alike, matching the enum constructor / emitFailExpr
   * / parseVariant / the `!{}` + `match` payload binders), so a `${field}`
   * interpolation lowers to `_eb_result.data.{field}` uniformly. The ordered
   * field list is retained for arity diagnostics / potential future use.
   */
  variantFields: Map<string, string[]>;
}

/**
 * Parse one enum type-decl's `raw` body and return its variant -> renders-markup
 * map. Only variants that carry a `renders` clause appear in the map; a variant
 * with no `renders` is absent (it falls through to the boundary's `fallback=`).
 *
 * Recognises both shapes:
 *   Name           renders <markup>      (unit variant)
 *   Name(f:T, ...) renders <markup>      (payload variant)
 * Variants are split at top-level newline / comma / pipe (depth-tracked), so a
 * `renders` body containing nested elements / commas stays with its variant
 * until the next top-level separator.
 */
export function extractVariantRenders(decl: { name?: string; raw?: string }): EnumRendersInfo {
  const typeName = decl?.name ?? "";
  const renders = new Map<string, string>();
  const variantFields = new Map<string, string[]>();
  let body = (decl?.raw ?? "").trim();
  if (body.startsWith("{")) body = body.slice(1);
  if (body.endsWith("}")) body = body.slice(0, -1);
  body = body.trim();
  if (!body) return { typeName, renders, variantFields };

  // Top-level split on newline / comma / pipe (depth-tracked so payload parens
  // and `renders` markup angle-brackets do not split a variant prematurely).
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of body) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    // A top-level newline / comma / pipe ends the current variant. Inside a
    // `renders` body the separators are part of markup text; but the canonical
    // §19.2 shape places each variant (with its renders) on its own logical
    // line, and the depth guard keeps payload + bracketed markup intact.
    if (depth === 0 && (ch === "\n" || ch === "," || ch === "|")) {
      if (buf.trim()) parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);

  // The split above breaks a multi-line variant (`Name(...)\nrenders <markup>`)
  // into two parts. Re-join a bare `renders <markup>` continuation onto the
  // immediately-preceding variant-name part.
  const merged: string[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (t.startsWith("renders ") && merged.length > 0) {
      merged[merged.length - 1] = merged[merged.length - 1].trim() + " " + t;
    } else {
      merged.push(part);
    }
  }

  for (const part of merged) {
    let trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(".")) trimmed = trimmed.slice(1).trim();
    const rendersIdx = trimmed.indexOf(" renders ");
    if (rendersIdx === -1) continue; // no renders clause on this variant
    const markup = trimmed.slice(rendersIdx + " renders ".length).trim();
    let head = trimmed.slice(0, rendersIdx).trim();
    // Strip payload parens from the variant name + capture the payload field
    // names (in declared order) for arity-aware substitution.
    const parenIdx = head.indexOf("(");
    const name = (parenIdx === -1 ? head : head.slice(0, parenIdx)).trim();
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) continue;
    const fields: string[] = [];
    if (parenIdx !== -1) {
      const closeParen = head.lastIndexOf(")");
      if (closeParen > parenIdx) {
        const payloadStr = head.slice(parenIdx + 1, closeParen).trim();
        if (payloadStr) {
          for (const fp of payloadStr.split(",")) {
            const colon = fp.indexOf(":");
            const fieldName = (colon === -1 ? fp : fp.slice(0, colon)).trim();
            if (fieldName) fields.push(fieldName);
          }
        }
      }
    }
    if (markup) {
      renders.set(name, markup);
      variantFields.set(name, fields);
    }
  }

  return { typeName, renders, variantFields };
}

/**
 * Walk a file AST and collect every enum type-decl's variant -> renders map,
 * keyed by enum type name. type-decl nodes appear both at top level and inside
 * `logic` bodies (the `${ type X:enum = {...} }` shape), so the walk descends
 * into logic/children/body containers.
 */
export function collectEnumRenders(fileAST: any): Map<string, EnumRendersInfo> {
  const out = new Map<string, EnumRendersInfo>();
  const seen = new Set<any>();
  const visit = (n: any): void => {
    if (!n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    if (n.kind === "type-decl" && (n.typeKind === "enum") && typeof n.name === "string") {
      const info = extractVariantRenders(n);
      if (info.renders.size > 0) out.set(info.typeName, info);
    }
    for (const k of ["nodes", "children", "body", "branches", "arms", "armBody"]) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  };
  const root = fileAST?.nodes ? fileAST : (fileAST?.ast ?? fileAST);
  if (Array.isArray(root?.nodes)) root.nodes.forEach(visit);
  // Also consult an explicit typeDecls list when present (TAB attaches it).
  if (Array.isArray(root?.typeDecls)) root.typeDecls.forEach(visit);
  return out;
}
