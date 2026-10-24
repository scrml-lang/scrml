/**
 * E-GATE-UNSUPPORTED-HOST (S469) — an `if=` / `show=` on an element that does not honour it.
 *
 * WHY. §17.1 `if=` and §17.2 `show=` are visibility guards. On a handful of hosts impl#1's
 * lowering never consulted them: the structural openers (`<engine>` / `<match>` / `<each>`) never
 * read `show=`; the emit-html dispatches for `<errorBoundary>`, `<render>`, `<errors>`, `<channel>`,
 * `<program>`, the state openers and a compound-state namespace wrapper return BEFORE the mount
 * gate; an `<each>`'s `<empty>` fallback and the `<onTimeout>` / `<onIdle>` timers read neither.
 * On every one the attribute was dropped and the content rendered (or the timer armed) whatever
 * the condition said — at exit 0. A guard that fails open. Gaps
 * g-if-on-structural-element-silently-ignored, g-structural-element-if-chain-and-show-composition-nominal,
 * g-if-reject-unenforced-on-structural-declaration-elements.
 *
 * One code for every such host, refused wherever the host is lowered (ast-builder
 * `refuseUnconsumedStructuralChainAttrs`, codegen `refuseIfOnUngatedHost`, symbol-table
 * `timerGateAttrDiagnostic`). An `else` / `else-if=` that is not a chain member keeps its own codes
 * (E-CTRL-001 / E-CTRL-002).
 */

import { tokenizeAttributes } from "./tokenizer.ts";
import { unquotedRejectDiagnostic } from "./unquoted-attr-value.ts";

export const GATE_UNSUPPORTED_HOST_CODE = "E-GATE-UNSUPPORTED-HOST";

/** The gate / chain attribute names a markup opener can carry. */
export type GateAttrName = "if" | "else" | "else-if" | "show";
const GATE_ATTR_NAMES: ReadonlySet<string> = new Set(["if", "else", "else-if", "show"]);

/**
 * S469 round 2 — the gate / chain attributes written on an opener whose attribute region is
 * `attrText` (the text after the tag name, up to — not including — the closing `>`), read by
 * the SAME attribute tokenizer a markup opener goes through (`tokenizeAttributes(…, "markup")`).
 * Used by the openers kept as raw text and re-scanned (engine timers, state-children, `<match>`
 * arms), so "this opener carries `if=` / `else` / `else-if=` / `show=`" is the markup predicate
 * there too — not a hand regex that disagrees about `else=""` or `title="x"else`.
 * Order of appearance; each name once.
 */
export function gateAttrNamesInOpener(attrText: string): GateAttrName[] {
  return scanOpenerGateAttrs(attrText).names;
}

/**
 * S469 round 3 — the whole verdict of the markup attribute reader on a raw-text opener: the gate
 * names it carries AND the refusals the same reader issues on a markup opener, which are what make
 * a `<p>` fail closed:
 *   - an `ATTR_OP_REJECT` value (an unquoted value with a bare operator — `data-x=a/ if=@n`):
 *     the refused run reaches the tag close, so the attributes after it (a gate among them) are
 *     never seen. On markup the E-ATTR-UNQUOTED-OPERATOR / E-ATTR-MULTI-STATEMENT error fails the
 *     compile; here it must too, or the swallowed gate vanishes at exit 0;
 *   - a case variant of a gate name (`IF=`, `Else`, `SHOW=`) — E-GATE-ATTR-CASE.
 */
export function scanOpenerGateAttrs(attrText: string): { names: GateAttrName[]; problems: Array<{ code: string; message: string }> } {
  const names: GateAttrName[] = [];
  const problems: Array<{ code: string; message: string }> = [];
  if (typeof attrText !== "string" || attrText.trim() === "") return { names, problems };
  let toks: Array<{ kind: string; text: string }> = [];
  try {
    toks = tokenizeAttributes(`<x ${attrText.replace(/\/\s*$/, "")}>`, 0, 1, 1, "markup") as Array<{ kind: string; text: string }>;
  } catch {
    return { names, problems };
  }
  let lastName = "";
  const synthetic = `<x ${attrText.replace(/\/\s*$/, "")}>`;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (!t) continue;
    // S469 round 4 — a value the tokenizer DROPPED (`x=-1`, `x=+1`, `x=.5`, `x=~1`, `x=)`, `x=]`)
    // leaves the next attribute's name as the value token: on a markup opener that is E-ATTR-001,
    // and the swallowed name (a gate among them) is lost. Refused the same way here. A dropped
    // `.` / `:` sigil of the opener's own slot grammar (`to=.Idle`, `rule=.A`) is not a refusal —
    // unless the name it left is a gate name.
    if (t.kind === "ATTR_NAME" && k > 0 && toks[k - 1] && toks[k - 1].kind === "ATTR_EQ") {
      const span = (t as { span?: { start?: number } }).span;
      const before = span && typeof span.start === "number" ? synthetic[span.start - 1] : "";
      const lower = t.text.toLowerCase();
      const gateish = GATE_ATTR_NAMES.has(lower);
      if (!(before === "." || before === ":") || gateish) {
        problems.push({
          code: "E-ATTR-001",
          message: `E-ATTR-001: the value of \`${lastName}\` could not be read — the characters before \`${t.text}\` ` +
            `were dropped, so \`${t.text}\` would be taken as its value${gateish ? " and the gate lost" : ""}. ` +
            `It is refused rather than read ungated. Quote or parenthesize the value (\`${lastName}="…"\` / \`${lastName}=(…)\`).`,
        });
      }
      continue;
    }
    if (t.kind === "ATTR_NAME") {
      lastName = t.text;
      if (GATE_ATTR_NAMES.has(t.text) && !names.includes(t.text as GateAttrName)) names.push(t.text as GateAttrName);
      const lower = gateAttrCaseVariant(t.text);
      if (lower) problems.push({ code: GATE_ATTR_CASE_CODE, message: gateAttrCaseMessage(t.text, lower) });
    } else if (t.kind === "ATTR_OP_REJECT") {
      problems.push(unquotedRejectDiagnostic(lastName, t.text));
    }
  }
  return { names, problems };
}

/** §17.1 (S469 round 3) — a gate attribute name written in another case. */
export const GATE_ATTR_CASE_CODE = "E-GATE-ATTR-CASE";

/**
 * The lower-case gate name `name` spells in another case (`IF` → `if`, `Else-If` → `else-if`), or
 * null. THE one predicate every reader applies (markup / structural / raw-text openers).
 */
export function gateAttrCaseVariant(name: unknown): GateAttrName | null {
  if (typeof name !== "string") return null;
  const lower = name.toLowerCase();
  return GATE_ATTR_NAMES.has(lower) && lower !== name ? (lower as GateAttrName) : null;
}

export function gateAttrCaseMessage(name: string, lower: string): string {
  const spelled = lower === "else" ? "`else`" : `\`${lower}=\``;
  return `${GATE_ATTR_CASE_CODE}: \`${name}\` is not the gate attribute ${spelled} — gate attributes are ` +
    `lower-case (§17.1 / §17.1.1 / §17.2), so this one would be written to the DOM as an ordinary ` +
    `attribute and the element would render whatever it says. It is refused rather than emitted ungated. ` +
    `Write ${spelled}.`;
}

/**
 * The refusal for gate attribute `name` on a raw-text opener (`what` names it for the author,
 * e.g. "the engine state-child `<Active>`"). `if=` / `show=` → E-GATE-UNSUPPORTED-HOST;
 * `else` / `else-if=` → E-CTRL-001 / E-CTRL-002 (never a chain member). `fix` replaces the
 * suggested fix of the E-GATE-UNSUPPORTED-HOST message.
 */
export function rawOpenerGateDiagnostic(
  name: GateAttrName,
  tag: string,
  what: string,
  fix?: string,
): { code: string; message: string } {
  if (name === "if" || name === "show") {
    return { code: GATE_UNSUPPORTED_HOST_CODE, message: gateUnsupportedHostMessage(name, tag, what, fix) };
  }
  const code = name === "else" ? "E-CTRL-001" : "E-CTRL-002";
  const spelled = name === "else" ? "`else`" : "`else-if=`";
  return {
    code,
    message:
      `${code}: ${spelled} on ${what} is not part of a lowered \`if=\` chain — it is never a chain member, ` +
      `so the attribute would be ignored. It is refused rather than emitted ungated (§17.1.1).`,
  };
}

/**
 * Elements §17.1.2 says SHALL REJECT `if=` (named, or "every other scrml-defined structural
 * element"): declarations / lifecycle hooks / §4.15 elements. The other refused hosts are
 * rendered subtrees impl#1 cannot gate.
 */
const IF_REJECTED_BY_SPEC: ReadonlySet<string> = new Set([
  "errors", "channel", "render", "onTimeout", "onIdle",
]);

/**
 * The message for `attr` (`"if"` | `"show"`) on `tag`. `hostDescription` replaces the
 * `` `<tag>` `` wording (e.g. "an `<each>`'s `<empty>` fallback"); `fixOverride` the suggested fix.
 */
export function gateUnsupportedHostMessage(attr: "if" | "show", tag: string, hostDescription?: string, fixOverride?: string): string {
  const host = hostDescription ?? `\`<${tag}>\``;
  const spelled = `\`${attr}=\``;
  let why: string;
  if (attr === "if" && IF_REJECTED_BY_SPEC.has(tag)) {
    why = `§17.1.2: \`if=\` is honoured on \`<engine>\` / \`<match>\` / \`<each>\` and on HTML elements and ` +
      `components; every other scrml-defined element SHALL reject it.`;
  } else if (attr === "if") {
    why = `impl#1 lowers ${host} without the §17.1 mount gate, so the condition would be ignored and the ` +
      `content would render whatever it says.`;
  } else {
    why = `impl#1 lowers ${host} without the §17.2 display toggle, so the condition would be ignored and the ` +
      `content would stay visible whatever it says.`;
  }
  const fix = fixOverride ? fixOverride : tag === "onTimeout" || tag === "onIdle"
    ? `Remove the condition, or move the timer into a state that is entered only when the condition holds.`
    : `Move the condition to an element that honours it — wrap it: \`<div ${attr}=COND><${tag} …>…</></div>\`.`;
  return `${GATE_UNSUPPORTED_HOST_CODE}: ${spelled} on ${host} is not honoured — ${why} ` +
    `It is refused rather than emitted ungated. ${fix}`;
}
