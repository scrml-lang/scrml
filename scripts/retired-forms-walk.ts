/**
 * scripts/retired-forms-walk.ts — the source reader of the retired-forms gate (S482, fix round r1 of #2101).
 *
 * WHY ONE WALKER. Review #2101 MED-2: the first gate stripped comments, strings and foreign bodies with
 * separate regex passes in a fixed order, so a string `"?{"` opened a "foreign body" that blanked the rest
 * of its block, a string `"src/*.js"` opened a block comment, and a string holding one backtick opened a
 * template literal — each hid a retired form after it. Quoted text in MARKUP (`<p>"Hello"/`) was blanked
 * as a string, which hid the retired closer the bootstrap refuses there. This walker reads the source ONCE,
 * in source order, the way the bootstrap reads it (compiler/self-host-v2/lex.scrml + parse.scrml): code
 * (strings, templates with `${…}`, `//` / `/* *\/` comments, `_{ }` / `?{ }` / `#{ }` bodies), markup
 * (an opener's attributes; a body's free text, where quotes are text and `//` opens a comment only after
 * whitespace, §4.18.1b; `<pre>` / `<code>` / `<script>` / `<style>` raw bodies, §4.17), and `${ … }`
 * logic inside markup.
 *
 * WHY NOT THE COMPILER'S OWN TOKENIZER. The authority for what is retired is the bootstrap (impl#2), which
 * runs as compiled scrml — too slow for a ~1 s pre-commit gate over ~3,000 files — and impl#1's
 * block-splitter / tokenizer (compiler/src, frozen) reads an older dialect and throws on fragments (most
 * SPEC fences are fragments). So this is a PORT of the bootstrap's own rules, function by function, with
 * the bootstrap function each part mirrors named in its comment; where it deliberately differs, the
 * comment says so.
 *
 * WHAT IT ANSWERS (per source text):
 *   kinds[i]     what character i is: CODE, COMMENT, STRING (string / template / quoted attribute text),
 *                RAW (a raw body), FOREIGN (`_{ }` / `?{ }` / `#{ }`), PROSE (free text of a closed HTML
 *                element — never code). Detectors match over CODE (and STRING for `keepStrings` rows).
 *   closerHits   offsets of retired trailing-`/` closers — the bootstrap's candidate rule
 *                (parse.scrml retiredSlashesIn) and its hit rule (slashKeep / slashDrop / slashHitIn: a
 *                candidate is a hit when its element, or one around it, is left unclosed), plus the
 *                `{<div>x/}` value closer (lex.scrml retiredValueCloserAt).
 *   angleReads   offsets of legacy cell reads `<n>` (lex.scrml angleCellReadEnd in an operand slot).
 */

export const K_CODE = 0, K_COMMENT = 1, K_STRING = 2, K_RAW = 3, K_FOREIGN = 4, K_PROSE = 5, K_TEXT = 6;

/** lex.scrml isVoidName — the HTML void elements. */
export const VOID_NAMES = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** lex.scrml isRawName — raw-content bodies (§4.17). */
const RAW_NAMES = new Set(["script", "style", "pre", "code"]);
/** Code-default bodies (§40.8; host-global-scan.ts CODE_DEFAULT_TAGS): their direct text is code. */
const CODE_DEFAULT = new Set(["program", "page", "channel"]);

const isLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isIdStart = (c: string) => isLetter(c) || c === "_" || c === "$";
const isIdCont = (c: string) => isIdStart(c) || (c >= "0" && c <= "9");
/** lex.scrml isTagNameCh. */
const isTagNameCh = (c: string) => isIdCont(c) || c === "-" || c === "." || c === ":";
/** parse.scrml opensTag (RULED S442): `<` then a letter, `!`, `/`, `?`, `*`, `_`, `.`. */
const opensTag = (c: string) => isLetter(c) || c === "!" || c === "/" || c === "?" || c === "*" || c === "_" || c === ".";
/** The "last significant character" after an element in code: neither an operand nor an operator. */
const EL = "\u0001";
const isNoteSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

type Cand = { at: number };
type El = { name: string; html: boolean; inValue: boolean; value: boolean };

export type Analysis = { kinds: Uint8Array; closerHits: number[]; angleReads: number[] };

export function analyze(src: string, htmlNames: Set<string>): Analysis {
  const n = src.length;
  const kinds = new Uint8Array(n);
  const blocks = new Map<number, number>();   // `${` offset -> end (exclusive), for the candidate scanner
  let cand: Cand[] = [];
  let hit: number[] = [];
  let dry = -1;
  const angleReads: number[] = [];
  const mark = (from: number, to: number, k: number) => { for (let i = Math.max(0, from); i < Math.min(n, to); i++) kinds[i] = k; };
  const markKeepNl = (from: number, to: number, k: number) => { for (let i = Math.max(0, from); i < Math.min(n, to); i++) if (src[i] !== "\n") kinds[i] = k; };

  // ---------------------------------------------------------------- the candidate / hit bookkeeping
  // parse.scrml slashHit / slashHitIn / slashDrop
  const slashHit = (from: number, to: number) => {
    const keep: Cand[] = [];
    let moved = false;
    for (const c of cand) { if (c.at >= from && c.at < to) { hit.push(c.at); moved = true; } else keep.push(c); }
    if (moved) cand = keep;
    return moved;
  };
  const slashHitIn = (from: number, to: number) => {
    if (dry >= from && dry < to) return;
    slashHit(from, to);
    for (const h of hit) if (h >= from && h < to) return;
    dry = from;
  };
  const slashDrop = (from: number, to: number) => {
    for (const h of hit) if (h >= from && h < to) return;
    cand = cand.filter((c) => !(c.at >= from && c.at < to));
  };

  /** parse.scrml pathSlashAt. */
  const pathSlashAt = (from: number, j: number) => {
    for (let k = j - 1; k >= from; k--) {
      const c = src[k];
      if (isNoteSpace(c) || c === ">" || c === "}") return false;
      if (c === "/" || c === ":") return true;
    }
    return false;
  };

  /** parse.scrml retiredSlashesIn over the text run src[from, to) — the candidates.
   *  DIFFERS (deliberately, wider): a `//` comment after the `/` (past spaces) counts as the line end
   *  (`/   // closes <div>` — a bare `/` line with a note; the bootstrap reads the `//` as the next byte). */
  const scanRun = (from: number, to: number, value: boolean) => {
    for (let j = from; j < to; j++) {
      const c = src[j], c1 = src[j + 1] ?? "";
      if (c === "/" && c1 === "/" && j > 0 && isNoteSpace(src[j - 1])) {
        const nl = src.indexOf("\n", j);
        if (nl < 0 || nl >= to) return;
        j = nl;
      } else if (c === "<" && src.startsWith("<!--", j)) {
        const ce = src.indexOf("-->", j + 4);
        if (ce < 0 || ce >= to) return;
        j = ce + 2;
      } else if (c === "$" && c1 === "{") {
        const e = blocks.get(j) ?? braceEnd(j + 1);
        if (e > to) return;
        j = e - 1;
      } else if ("#^_~?!".includes(c) && c1 === "{") {
        const e = braceEnd(j + 1);
        if (e > to) return;
        j = e - 1;
      } else if (c === "/" && (j === 0 || src[j - 1] !== "/") && c1 !== "/" && c1 !== ">") {
        let k = j + 1;
        while (k < to && (src[k] === " " || src[k] === "\t" || src[k] === "\r")) k++;
        let closerAt = false;
        if (k < to && (src[k] === "\n" || src[k] === ";")) closerAt = true;
        // DIFFERS (wider): in markup written as a VALUE in code (`=> <p>Active/,`, `f(<b>x/)`), a `/` right
        // before the `,` / `)` / `}` that ends the value — the retired closer of a value element
        if (value && k < to && (src[k] === "," || src[k] === ")" || src[k] === "}")) closerAt = true;
        if (k < to && src[k] === "/" && src[k + 1] === "/") closerAt = true;      // the deliberate difference above
        if (k >= to && (to >= n || src[to] === "<")) closerAt = true;
        if (closerAt && !pathSlashAt(from, j)) cand.push({ at: j });
      }
    }
  };

  /** The end (exclusive) of the balanced `{ … }` whose `{` is at `open`, or the text length. String-aware
   *  (#2101 r2 LOW-1): a brace inside a `'…'` / `"…"` / `` `…` `` string of the body (SQL, JS, CSS) is not
   *  counted. A quote is a string only when it closes on the same line: an apostrophe in a comment
   *  (`/* don't *\/ }`) stays a plain character, so it never hides a `}`. DIFFERS from the bootstrap's
   *  sigil-block skip in retiredSlashesIn (a naive count). */
  const braceEnd = (open: number) => {
    let depth = 0;
    for (let i = open; i < n; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        for (; j < n && src[j] !== c && src[j] !== "\n"; j++) if (src[j] === "\\") j++;
        if (j < n && src[j] === c) { i = j; continue; }
        continue;     // unclosed on its line: a plain character
      }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return i + 1; }
    }
    return n;
  };

  // ---------------------------------------------------------------- code
  /** A string literal at `i` (quote q): its end; the content is STRING (the quotes stay CODE, so
   *  `throw "x"` still reads as `throw` followed by an operand). Ends at the quote or the line end. */
  const lexString = (i: number, q: string) => {
    let j = i + 1;
    for (; j < n && src[j] !== q && src[j] !== "\n"; j++) if (src[j] === "\\") j++;
    mark(i + 1, Math.min(j, n), K_STRING);
    return j < n && src[j] === q ? j + 1 : j;
  };
  /** A template literal at `i`: text is STRING, each `${ … }` is code. */
  const lexTemplate = (i: number) => {
    let j = i + 1;
    while (j < n && src[j] !== "`") {
      if (src[j] === "\\") { kinds[j] = K_STRING; if (src[j + 1] !== "\n") kinds[j + 1] = K_STRING; j += 2; continue; }
      if (src[j] === "$" && src[j + 1] === "{") { const e = code(j + 2, "}", false); blocks.set(j, e); j = e; continue; }
      if (src[j] !== "\n") kinds[j] = K_STRING;
      j++;
    }
    return j < n ? j + 1 : n;
  };

  /**
   * The legacy cell read `<name>` at `pos` (lex.scrml angleCellReadEnd), its end, else -1: a bare
   * `<name>` (lowercase or `_` first, not a void element) followed past spaces / tabs by `; ) , ] }`, or
   * by an operator or `.` when the element never closes as markup.
   */
  const angleCellReadEnd = (pos: number) => {
    let k = pos + 1;
    const c0 = src[k] ?? "";
    if (!((c0 >= "a" && c0 <= "z") || c0 === "_")) return -1;
    while (k < n && isIdCont(src[k]) && src[k] !== "$") k++;
    if (src[k] !== ">") return -1;
    if (VOID_NAMES.has(src.slice(pos + 1, k).toLowerCase())) return -1;
    const end = k + 1;
    let j = end;
    // DIFFERS (wider): past line breaks too — `return <n>⏎}` is the same read (the bootstrap reads that
    // `<n>` as an element run to a later closer and reports the unclosed element instead)
    while (j < n && isNoteSpace(src[j])) j++;
    if (j >= n) return end;
    const c = src[j], c1 = src[j + 1] ?? "";
    if (c === "/" && (c1 === "/" || c1 === "*")) return -1;     // a comment follows: no operator
    if (c === "=" && c1 !== "=") return -1;
    if (";),]}".includes(c)) return end;
    const op = "+-*/%=!&|?>.".includes(c) || (c === "<" && !(c1 === "/" || c1 === "!" || isLetter(c1)));
    if (op && !elementCloses(pos)) return end;
    return -1;
  };

  /** Does the element at `pos` close as markup (lex.scrml markupAttrValueExtentAt < length)? A probe
   *  walk on a copy of the state: nothing it marks is kept. */
  const elementCloses = (pos: number) => {
    const saved = { kinds: kinds.slice(), cand: cand.slice(), hit: hit.slice(), dry, reads: angleReads.length };
    const r = element(pos, true, true, true);
    kinds.set(saved.kinds); cand = saved.cand; hit = saved.hit; dry = saved.dry; angleReads.length = saved.reads;
    return r.closed;
  };

  /**
   * Code from `i` to its stop: `}` / `)` / `]` (the closing one, past it), "closer" (a `</` — not
   * consumed: a code-default body's closer) or "eof". `codeDefault`: a body whose line-start `<tag` is
   * markup (the file root, `<program>` / `<page>` / `<channel>`).
   */
  function code(i: number, stop: "}" | ")" | "]" | "closer" | "eof", codeDefault: boolean): number {
    let depth = 0;
    let lastSig = "";       // the last significant (non-space, non-comment) character
    let lastWord = "";      // the identifier that ended at lastSig, if one did
    let lineStart = true;   // only spaces since the line began
    let regionHead = true;  // nothing significant yet in this region
    const sig = (c: string, word = "") => { lastSig = c; lastWord = word; lineStart = false; regionHead = false; };
    while (i < n) {
      const c = src[i], c1 = src[i + 1] ?? "";
      if (c === "\n") { lineStart = true; i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }
      if (c === "/" && c1 === "/") { const nl = src.indexOf("\n", i); const e = nl < 0 ? n : nl; mark(i, e, K_COMMENT); i = e; continue; }
      if (c === "/" && c1 === "*") { const ce = src.indexOf("*/", i + 2); const e = ce < 0 ? n : ce + 2; markKeepNl(i, e, K_COMMENT); i = e; continue; }
      if (c === "<" && src.startsWith("<!--", i)) { const ce = src.indexOf("-->", i + 4); const e = ce < 0 ? n : ce + 3; markKeepNl(i, e, K_COMMENT); i = e; continue; }
      if (c === '"' || c === "'") { i = lexString(i, c); sig(c); continue; }
      // a regular-expression literal where an operand is read (`isoDate: /^\d{4}$/`, `x = /a</`): its
      // body is STRING (a `{` / `<` / quote in it is not code). On a line break it was a division.
      // (#2101 r2 LOW-1: not after `}` — `{v: 1} / 2` is a division)
      if (c === "/" && (regionHead || "(,=:[!&|?{;~^".includes(lastSig) || lastSig === EL || ["return", "typeof", "case", "in", "of"].includes(lastWord))) {
        let j = i + 1, cls = false;
        for (; j < n && src[j] !== "\n"; j++) {
          if (src[j] === "\\") { j++; continue; }
          if (src[j] === "[") cls = true;
          else if (src[j] === "]") cls = false;
          else if (src[j] === "/" && !cls) break;
        }
        if (j < n && src[j] === "/") { mark(i + 1, j, K_STRING); i = j + 1; while (i < n && /[a-z]/i.test(src[i])) i++; sig("/"); continue; }
      }
      if (c === "`") { i = lexTemplate(i); sig("`"); continue; }
      // foreign / SQL / CSS bodies: `_{ }`, `_={ }=`, `_=={ }==`, `?{ }`, `#{ }` — opaque here
      if ((c === "_" || c === "?" || c === "#") && (c1 === "{" || (c === "_" && c1 === "=")) && !(c === "_" && isIdCont(src[i - 1] ?? ""))) {
        let o = i + 1;
        while (src[o] === "=") o++;
        if (src[o] === "{") { const e = braceEnd(o); markKeepNl(i, e, K_FOREIGN); i = e; sig("}"); continue; }
      }
      if (c === "$" && c1 === "{") { const e = code(i + 2, "}", false); blocks.set(i, e); i = e; sig("}"); continue; }
      if (c === "<") {
        if (c1 === "/" && stop === "closer") return i;
        if (c1 === "/") {   // a stray closer (no element open here): skip it
          const gt = src.indexOf(">", i); i = gt < 0 ? n : gt + 1; sig(">"); continue;
        }
        if (opensTag(c1) && c1 !== "/" && c1 !== "!") {
          // (#2101 r2 LOW-2: `<` too — `1 < <n>` is a read in an operand slot, as the bootstrap's binaryOpLast)
          const operand = "([,=?:!&|+-*/%~^<>".includes(lastSig) && lastSig !== "" || ["return", "lift", "yield", "else", "in", "of", "case", "throw", "await", "let", "const", "export"].includes(lastWord);
          const statementStart = regionHead || lastSig === "{" || lastSig === "}" || lastSig === ";" || lastSig === EL || (codeDefault && lineStart);
          // lex.scrml markupValueAhead: at a region head / after `{`, only a legacy read is a value; in an
          // operand slot a legacy read is that one token, otherwise an element (#2101 r1 LOW-2: an
          // arithmetic / comparison operator is an operand slot too, as the bootstrap now reads it)
          // a code-default body's items (the file root, `<program>`) are markup / declarations: no read there
          const head = (regionHead && !codeDefault) || lastSig === "{";
          const lr = operand || head ? angleCellReadEnd(i) : -1;
          if (lr > 0) {
            angleReads.push(i); i = lr; sig(">"); continue;
          }
          if (operand || statementStart) {
            // the retired declaration spelling `<x> = v` / `<x attrs>: T = v` stays code (§66.21)
            const r = element(i, false, (stop === "}" && !codeDefault) || depth > 0, true);
            i = r.end; sig(EL); continue;
          }
        }
        i++; sig("<"); continue;
      }
      if ("{([".includes(c)) { depth++; i++; sig(c); continue; }
      if ("})]".includes(c)) {
        if (depth === 0) {
          if (c === stop) return i + 1;
          if (stop === "}" || stop === ")" || stop === "]") return i;   // a mismatched closer ends the region (unbalanced source)
          i++; sig(c); continue;
        }
        depth--; i++; sig(c); continue;
      }
      if (isIdStart(c)) {
        let j = i + 1;
        while (j < n && isIdCont(src[j])) j++;
        const w = src.slice(i, j);
        i = j; sig(src[j - 1], w); continue;
      }
      i++; sig(c);
    }
    return n;
  }

  // ---------------------------------------------------------------- markup
  /**
   * The element whose `<` is at `pos`. `probe`: answer only whether it closes. `inValue`: it was opened
   * in code (a `{ … }` attribute value or a `${ … }` region) — an unbalanced `}` in its text ends it
   * unclosed, and a `/` before that `}` is the retired value closer (lex.scrml retiredValueCloserAt).
   */
  function element(pos: number, probe: boolean, inValue: boolean, value: boolean): { end: number; closed: boolean } {
    let k = pos + 1;
    while (k < n && (src[k] === "*" || src[k] === "_" || src[k] === "." || src[k] === "?")) k++;
    while (k < n && isTagNameCh(src[k])) k++;
    const name = src.slice(pos + 1, k);
    const lower = name.toLowerCase();
    // the opener (lex.scrml openerEndAt): quoted values are STRING (a `${ … }` in one is code),
    // `{ … }` / `( … )` / `[ … ]` values are code
    let i = k;
    let selfClosed = false;
    for (; i < n; ) {
      const c = src[i], c1 = src[i + 1] ?? "";
      if (c === ">") { i++; break; }
      if (c === "/" && c1 === ">") { i += 2; selfClosed = true; break; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c) {
          if (src[j] === "$" && src[j + 1] === "{") { const e = code(j + 2, "}", false); blocks.set(j, e); j = e; continue; }
          if (src[j] !== "\n") kinds[j] = K_STRING;
          j++;
        }
        i = j + 1; continue;
      }
      if (c === "$" && c1 === "{") { const e = code(i + 2, "}", false); blocks.set(i, e); i = e; continue; }
      if (c === "{") { i = code(i + 1, "}", false); continue; }
      if (c === "(") { i = code(i + 1, ")", false); continue; }
      if (c === "[") { i = code(i + 1, "]", false); continue; }
      if (c === "<" && opensTag(c1)) break;   // a broken opener: the next tag starts here
      i++;
    }
    if (i > n) i = n;
    if (selfClosed || VOID_NAMES.has(lower) || name === "") return { end: i, closed: true };
    // the retired declaration spelling `<x> = v` (§66.21): not an element — the opener stays code
    if (/^[ \t]*=(?![=>])/.test(src.slice(i, i + 8)) || (/^[ \t]*:[^>]/.test(src.slice(i, i + 8)) && !/^[ \t]*:>/.test(src.slice(i, i + 8)))) {
      return { end: i, closed: true };
    }
    if (RAW_NAMES.has(lower)) {
      let close = -1;
      for (let j = src.indexOf("</", i); j >= 0; j = src.indexOf("</", j + 1)) {
        const after = j + 2 + lower.length;
        if (src.slice(j + 2, after).toLowerCase() === lower && src[after] === ">") { close = j; break; }
      }
      // unclosed (#2101 r2 LOW-1): raw only to the next closing tag of any name (`<p>see <pre> below</p>`),
      // which the enclosing element then reads — not to the end of the text. An anonymous `</>` there is
      // taken as the raw element's own (the author's intent; the bootstrap's rawNameCloseAt accepts only
      // `</name>`, so it refuses the file either way)
      if (close < 0) {
        const nc = src.indexOf("</", i);
        const stop = nc < 0 ? n : nc;
        markKeepNl(i, stop, K_RAW);
        return { end: src.startsWith("</>", stop) ? stop + 3 : stop, closed: false };
      }
      markKeepNl(i, close, K_RAW);
      return { end: close + lower.length + 3, closed: true };
    }
    const bodyStart = i;
    if (CODE_DEFAULT.has(lower)) {
      const e = code(i, "closer", true);
      if (e >= n) { if (!probe) slashHitIn(bodyStart, n); return { end: n, closed: false }; }
      const gt = src.indexOf(">", e);
      const cn = src.slice(e + 2, gt < 0 ? n : gt).trim().toLowerCase();
      const end = gt < 0 ? n : gt + 1;
      if (cn !== "" && cn !== lower) { if (!probe) slashHitIn(bodyStart, end); return { end, closed: false }; }
      return { end, closed: true };
    }
    const el: El = { name: lower, html: htmlNames.has(lower), inValue, value };
    return body(bodyStart, el, probe);
  }

  /** A free-text body (parse.scrml parseKids): text runs, child elements, `${ … }`, comments, to its closer. */
  function body(start: number, el: El, probe: boolean): { end: number; closed: boolean } {
    let i = start;
    let runStart = start;
    let braces = 0;
    const textAt: number[] = [];     // offsets of this body's own text characters
    const flush = (to: number) => { scanRun(runStart, to, el.value); };
    const finish = (end: number, how: "own" | "anon" | "unclosed") => {
      // PROSE only when the element closed and it is an HTML element (its text is never code). Otherwise
      // its text is read as code (its strings / comments lexed), so an unclosed or a custom element never
      // hides a form from the code detectors.
      if (how !== "unclosed" && el.html) { for (const t of textAt) kinds[t] = K_PROSE; }
      else lexTextAsCode(textAt);
      if (how === "own") slashDrop(start, end);
      if (how === "unclosed") slashHitIn(start, end);
      return { end, closed: how !== "unclosed" };
    };
    while (i < n) {
      const c = src[i], c1 = src[i + 1] ?? "";
      if (c === "<" && c1 === "/") {
        flush(i);
        const gt = src.indexOf(">", i);
        const end = gt < 0 ? n : gt + 1;
        const cn = src.slice(i + 2, gt < 0 ? n : gt).trim().toLowerCase();
        if (cn === "") return finish(end, "anon");
        if (cn === el.name) return finish(end, "own");
        return finish(end, "unclosed");      // a closer naming another element (E-PARSE-CLOSER): consumed
      }
      if (c === "<" && src.startsWith("<!--", i)) {
        const ce = src.indexOf("-->", i + 4); const e = ce < 0 ? n : ce + 3; markKeepNl(i, e, K_COMMENT); i = e; continue;
      }
      if (c === "<" && opensTag(c1)) {
        flush(i);
        const r = element(i, probe, el.inValue, el.value);
        i = r.end; runStart = i; continue;
      }
      if (c === "$" && c1 === "{") { const e = code(i + 2, "}", false); blocks.set(i, e); i = e; continue; }
      if ((c === "#" || c === "?" || c === "_") && c1 === "{") { const e = braceEnd(i + 1); markKeepNl(i, e, K_FOREIGN); i = e; continue; }
      if ((c === "^" || c === "!" || c === "~") && c1 === "{") { i = code(i + 2, "}", false); continue; }
      if (c === "/" && c1 === "/" && i > 0 && isNoteSpace(src[i - 1])) {
        const nl = src.indexOf("\n", i); const e = nl < 0 ? n : nl; mark(i, e, K_COMMENT); i = e; continue;
      }
      if (el.inValue) {
        if (c === "{") braces++;
        else if (c === "}") {
          if (braces === 0) { flush(i); return finish(i, "unclosed"); }   // the value's `}`: not consumed
          braces--;
        } else if (c === "/" && braces === 0 && src[i - 1] !== "*" && /^[ \t\r\n]*\}/.test(src.slice(i + 1, i + 64))) {
          if (!probe) hit.push(i);         // lex.scrml retiredValueCloserAt: `{<div>x/}`
        }
      }
      if (c !== "\n") textAt.push(i);
      i++;
    }
    flush(n);
    return finish(n, "unclosed");
  }

  /** Text that is not prose (a custom / unclosed element's body): its strings and comments, lexed. */
  function lexTextAsCode(at: number[]) {
    let idx = 0;
    while (idx < at.length) {
      const i = at[idx];
      const c = src[i];
      if (c === '"' || c === "'" || c === "`") {
        let j = idx + 1;
        while (j < at.length && at[j] === at[j - 1] + 1 && src[at[j]] !== c && src[at[j]] !== "\n") j++;
        if (j < at.length && src[at[j]] === c && at[j] === at[j - 1] + 1) {   // a closed quote on the same run
          for (let q = idx + 1; q < j; q++) kinds[at[q]] = K_STRING;
          idx = j + 1; continue;
        }
      }
      idx++;
    }
  }

  code(0, "eof", true);
  return { kinds, closerHits: [...new Set(hit)].sort((a, b) => a - b), angleReads };
}

/** The text with everything that is not CODE (and, with keepStrings, STRING) blanked to spaces —
 *  same length, newlines kept, so an offset is a source offset. */
export function view(src: string, kinds: Uint8Array, keepStrings: boolean): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const k = kinds[i];
    out += k === K_CODE || (keepStrings && k === K_STRING) || src[i] === "\n" ? src[i] : " ";
  }
  return out;
}
