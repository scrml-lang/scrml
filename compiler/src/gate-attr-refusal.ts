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

export const GATE_UNSUPPORTED_HOST_CODE = "E-GATE-UNSUPPORTED-HOST";

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
 * `` `<tag>` `` wording (e.g. "an `<each>`'s `<empty>` fallback").
 */
export function gateUnsupportedHostMessage(attr: "if" | "show", tag: string, hostDescription?: string): string {
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
  const fix = tag === "onTimeout" || tag === "onIdle"
    ? `Remove the condition, or move the timer into a state that is entered only when the condition holds.`
    : `Move the condition to an element that honours it — wrap it: \`<div ${attr}=COND><${tag} …>…</></div>\`.`;
  return `${GATE_UNSUPPORTED_HOST_CODE}: ${spelled} on ${host} is not honoured — ${why} ` +
    `It is refused rather than emitted ungated. ${fix}`;
}
