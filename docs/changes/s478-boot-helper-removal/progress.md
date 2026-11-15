# s478-boot-helper-removal — progress

Pure refactor. The bootstrap carried helpers that spelled a message fragment in two pieces only to dodge
impl#1 bugs fixed by #1869 (s478-impl1-fn-text-scans). Removed here; every call site is a plain literal again.

## Removed
- `sqlSigil()` — analyze / check / parse / print (44 call sites). Every inlined `?{` has a `}` later in the
  same string literal (g-block-splitter-sql-sigil-inside-string-literal stays open: a lone `?{` is still
  E-CTX-003). No site needed a kept helper.
- `dateNowText()` — analyze (7).
- `hashId()` — analyze (12); `inputRef()` — parse (1).
- The same workaround without a helper: two `"<" + "#id>"` concatenations in check.scrml C-R1 messages, and
  `hashRefText(id)` now `"<#" + id + ">"` (kept: it is a function of `id`).
- Comments naming the helpers rewritten (`slotSigil` / `hashRefText`). `slotSigil()` / `interpOpen()` stay:
  `${` in a scrml string literal is interpolation (progress F9), not an impl#1 bug.
- known-gaps: g-boot-build-hash-id-in-string-literal-miscompiled-s475 resolved; the sql-sigil entry's prose
  updated.

## Proof
- `bun run pretest` green; impl#1 at main builds the bundle (base and head bundles built fresh, distinct cache keys).
- Corpus (samples/, examples/, conformance/, compiler/self-host-v2/acceptance — 3,149 files), base af7fe4bab vs
  head, `compileSource` per file, checkout path normalized: outputs + diagnostics byte-identical
  (sha256 3135cd05…). 0 throws. Script: ~/.cache/scrml/review/s478-helper-removal/corpus-dump.ts.
- bootstrap-conformance --json: identical except the timing line (PASS 422 / CODES-ONLY 4 / FAIL 142 both).
- `bun test ./compiler/self-host-v2`: 7218 pass, 0 fail.

## Log
- 2026-11-15: inlined, corpus identical, slices green; hook next.
