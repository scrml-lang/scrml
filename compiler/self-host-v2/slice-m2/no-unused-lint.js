// no-unused-lint.js — s480 (W-UNUSED-BINDING, SPEC §7.3.5). The front end with the unused-binding
// lint's warnings set aside, for the slice tests whose fixtures hold an unread local INCIDENTALLY (a
// loop counter a test never reads, a `const r = f()` kept only for its call) and whose assertions
// pin every diagnostic (`codes(…)` toEqual […], a `clean(…)` with no diagnostic at all). The lint
// itself is tested in slice-m4/unused-binding-s480.test.js; nothing else differs from frontEnd.

import { frontEnd } from "./lowered.js";

export const UNUSED_BINDING = "W-UNUSED-BINDING";

const keep = (d) => d.code !== UNUSED_BINDING;

export function frontEndNoUnusedLint(...args) {
  const r = frontEnd(...args);
  const out = { ...r, diags: r.diags.filter(keep) };
  if (r.typed && Array.isArray(r.typed.diags)) out.typed = { ...r.typed, diags: r.typed.diags.filter(keep) };
  return out;
}
