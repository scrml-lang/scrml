# s478-boot-drop-literal-workarounds — progress

Bootstrap-only (`compiler/self-host-v2/`). #1853 (s478-impl1-string-literal-rewrite) fenced impl#1's
text-rewrite passes off string literals. This lane writes the bootstrap's literal workarounds as plain
literals where impl#1 now leaves them alone, and keeps (and names) the ones it still corrupts.

## Dropped (plain literal now)
- `refusals.scrml` — the piece-built `FN` / `IS` / `DOT` words (`"f" + "n"`, `"i" + "s"`, `"."`): every row
  now spells `fn`, `is`, `.V(a, b)`, `EnumType.variants`, `Role.Admin`, `<x:T=.V single>` directly.
- `analyze.scrml` — `clockInPureText`: the E-FN-004 text is back inline in `resolveHost`'s `.HostPure` arm
  (the helper existed only because impl#1 printed "`fn`" as "`function`" in a match arm).
- `analyze.scrml` `sessionWord()` / `print.scrml` `storeSession()` — `"sess" + "ion"`. impl#1's route
  inference no longer server-escalates a function for the word `session` in a string (the text trigger
  became the scope-aware free-name check, s466). Probe: the bundle's only change is the literal.
- `css-syntax.scrml` — `openComment()` / `closeComment()` (`/*`, `*/`) and every `LB()` / `RB()` that does
  not split a `${` / `#{` (the F14 workaround S440 retired elsewhere after #1119; css-syntax, written in S469,
  still carried it).

## Kept (impl#1 still corrupts them) — reproducers
- `<#id>` — `analyze.scrml hashId()`, `parse.scrml inputRef()`. Inlined, impl#1 emits
  `_scrml_input_id_` in its place inside the string (bundle probe: every message using it read
  "a `_scrml_input_id_` reference", "read '_scrml_input_id_.error'"). Not one of the passes #1853 fenced.
  Reproducer: in a bundle module, `fn m() -> string { return "read <#id>.error" }`.
- `?{` — `sqlSigil()` in analyze / check / parse / print. Inlined, impl#1 fails the bundle with 37
  false E-FN-001 across 26 `fn` bodies: type-system.ts's E-FN-001 heuristic tests `/\?\{/` on the
  statement TEXT (string-blind). Reproducer: `fn sqlMsg() -> string { return "a ?{ query } sigil" }`
  → E-FN-001.
- `` `Date.now()` `` — `analyze.scrml dateNowText()`. Same heuristic family, E-FN-004. Reproducer:
  ``fn clockMsg() -> string { return "`Date.now()` is non-deterministic" }`` → E-FN-004.
- Out of this class, untouched: `${` / `#{` split in strings (lex `interpOpenText`, parse `interpOpen`,
  analyze `interpOpen` / `slotSigil` / the `"$" + "{"` tests, css-syntax `"$" + LB()`) — a `${` in a
  scrml string is interpolation under impl#1, not a text rewrite; lex `htmlCommentWhy` `<!--` / `-->`
  (deliberately lexical, mirrors impl#1's hasHtmlLikeComment).

## Proofs
- Proof 1 (bootstrap OUTPUT): `scripts/scrml-boot.ts compileSource` over every `.scrml` under
  conformance/cases + samples + compiler/self-host-v2/acceptance (3075 sources; 20547 diagnostics with
  code / severity / message / position; client html / js, server js, tool js, host files hashed), base
  5a0fd0eb5 sources vs head: byte-identical (0 differences). Plus 13 probes for the branches the corpus
  does not reach (nested-fn E-FN-004, prepaint / key= / persist="bogus" / persist="session" cells, a
  field prepaint, six CSS syntax errors + a valid CSS block with a comment): byte-identical.
- Proof 2 (bundle JS, slice-m1 `buildBundleChunks`, 29 chunks): after normalising impl#1's per-function
  counter suffixes (`_scrml_x_6928` → `_N`, which shift because functions were removed) and the
  build-admit hash, 4 chunks differ — analyze, css-syntax, print, refusals — 44 hunks / 122 lines, every
  one either a deleted workaround helper or the literal now written directly.

## Log
- start 5a0fd0eb5. Commits 32459aafd (refusals + clockInPureText), 44ec26c6e (session),
  86bccd81d (css-syntax). Hook each time: 54754 pass / 0 fail.
