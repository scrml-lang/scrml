# S471 bootstrap gap sweep — every open `g-bootstrap-*` entry, classified on current main

Base: `9b8ce9efe` (origin/main at dispatch). Each verdict comes from a run: a compile with
`bun scripts/scrml-boot.ts compile <f> --format line --output-dir <scratch>`, plus a runtime half where
the symptom is behaviour. The runtime half used `scripts/bootstrap-conformance.ts --cases <dir> --no-twins`
on a one-case directory: the repro as `case.scrml`, and an `expected.json` asserting the CORRECT
behaviour (`input` + `domAnchored`), executed in happy-dom by the same driver the corpus uses. A FAIL there
is the symptom. Repros are under `repros/<gap-id>[.<limb>].scrml`.

Verdicts: **STILL-OPEN** (the symptom reproduces) · **FIXED** (it is gone, with the landing named) ·
**NARROWED** (some limbs are fixed, others reproduce) · **CANNOT-REPRO** (the entry has no runnable repro).

## Table

| # | id | sev | verdict | evidence | fixing landing / current locus |
|---|---|---|---|---|---|
| 1 | g-bootstrap-lin-not-implemented-s469 | MED | STILL-OPEN | `lin token: string` param → `E-BOOTSTRAP-UNSUPPORTED: an unannotated parameter \`lin\``; `lin t = "a";` → `E-SCOPE-001: \`lin\` is not declared` (plus a new E-STMT-MISSING-SEMICOLON cascade after `lin`) | the message is emitted at `analyze.scrml:13325`, the parameter check |
| 2 | g-bootstrap-let-decl-in-db-channel-body-refused-s469 | MED | STILL-OPEN | `let <count/>` in `<channel>` → `E-DECL-KEYWORD-NOT-ITEM … not the free-text body of \`<channel>\``; in `<db>`, the same code; `<page>` → `E-BOOTSTRAP-UNSUPPORTED: \`<page>\` … is not in the bootstrap` (`<page>` is refused before its body is read) | parse.scrml body mode; the code is E-DECL-KEYWORD-NOT-ITEM |
| 3 | g-bootstrap-loop-value-form-residue-s469 | LOW | STILL-OPEN | all 7 limbs probed reproduce: union tape `E-BOOTSTRAP-UNSUPPORTED … a union tape is not in the bootstrap's type system`; statement-arm `lift` refused; lifted markup in fn refused, then a 14-error cascade; `return` in Tier-0 refused; tape-literal binder `.length` refused. The derived decl `const <ids> = for …` gets the generic `E-PARSE-ITEM: unexpected text at program level`, NOT a named diagnostic. A Tier-0 loop sharing its `${}` gets `E-SCOPE-001: \`const\` is not declared` and a parse cascade | loci exist: analyze `resolveLift`:10747, `typeForStmt`:11564, `resolveTier0`:10820; parse `parseTier0`:2762, `parseLift`:2679, `parseKeywordPrimary`:1661 |
| 4 | g-bootstrap-loop-wait-and-defer-s469 | MED | STILL-OPEN | server call in loop → `E-BOOTSTRAP-UNSUPPORTED … stands in a \`for\` loop — a loop cannot wait`; `defer` in loop and loop in `defer` → both refused | analyze `planLoop`:11753, `loopDefer`:11395, `loopFor`:11348; check `loopForbidden`:2349 |
| 5 | g-bootstrap-loop-head-surface-s469 | LOW | STILL-OPEN | `i += 1` → `compound assignment \`+=\` is not in bootstrap slice M2`; `for … else` → refused (§17.4a); `ps[i].n` → `a field of an index read … is not in the bootstrap yet`; top-level `${ for … }` → `E-PARSE-ITEM … found \`for\``. `K.variants` → `E-TYPE-VARIANT: \`variants\` is not a variant of \`K\``, a misleading code rather than a named "iterable not supported" refusal | parse `parseAssign`:333, `destructAhead`:2525, `forStmt`:2617; analyze `iterElemOf`:11709, `resolveMember`:4930, `isIndexExpr`:11455 |
| 6 | g-bootstrap-loop-codes-owed-s469 | LOW | STILL-OPEN | a const binder write → `E-ASSIGN-CONST` (not E-ASSIGN-004); `for (y of 5)` → `E-BOOTSTRAP-UNSUPPORTED`; `for (a; b)` / `for ()` → `E-PARSE-FOR-HEAD`. A ruling is owed | analyze `resolveAssign`:6786 (E-ASSIGN-CONST at :6813), `iterElemOf`:11709; parse `parseFor`:2567 |
| 7 | g-bootstrap-int-overflow-and-mod-zero-untrapped-s469 | LOW | STILL-OPEN | compiled exit 0; at runtime `7000000000 * 1000000000000` renders `"7e+21"`, `5 % 0` renders `"NaN"`, and the literal `9007199254740993` renders `"9007199254740992"` | print `primJs`:438 |
| 8 | g-bootstrap-method-receiver-narrowing-blind-s469 | LOW | STILL-OPEN | `match @n { not :> 0, else :> @n.length }` → `member access \`.length\` on a value that is not a struct…`; `.toUpperCase()` → `… the bootstrap does not read a narrowing at a method's receiver` | analyze `resolveMember`:4930 |
| 9 | g-bootstrap-tape-methods-insert-remove-fill-owed-s469 | LOW | STILL-OPEN | `@xs.insert(1, 9)` / `@xs.remove(0)` → `E-BOOTSTRAP-UNSUPPORTED \`.insert(…)\` is not in the bootstrap`; tape `.includes` / `.indexOf` → `… on a \`int[]\` is not in the bootstrap` | analyze `methodOf`:7318 |
| 10 | g-bootstrap-method-on-call-result-refused-s469 | LOW | STILL-OPEN | `get().trim()` with `get() -> string` → `\`.trim(…)\` on a value whose type the compiler cannot resolve`; `get().length` → `member access \`.length\` … not in bootstrap slice M2` | analyze `resolveCall`:5124 |
| 11 | g-bootstrap-length-validator-html-attr-utf16-s469 | LOW | STILL-OPEN | `length(<=3)` → emitted `<input id="nm" type="text" maxlength="3">`; `length(>=3)` → `<input … minlength="3">` (native UTF-16 counters still emitted) | the lowering is analyze.scrml:3103-3113 (validator → `minlength`/`maxlength` pairs), not print.scrml |
| 12 | g-bootstrap-semicolon-braceless-else-rejected-s462 | MED | **FIXED** | `if (@c) @r = "a"; else @r = "b";` compiles clean; the runtime half PASSES (click → `#r` = `"b"`) | `parseBlockOrStmt` → `parseTermStmt` consumes the `;`: 3acc76cd8 (s469 semicolons), PR #1510 |
| 13 | g-bootstrap-unclaimed-else-misdiagnosed-as-undeclared-s462 | LOW | STILL-OPEN | `@r = "a" else @r = "b";` → `E-SCOPE-001: \`else\` is not declared`, plus 2× E-STMT-MISSING-SEMICOLON; no E-STMT-UNEXPECTED-TOKEN | parse `parseStmt`:2164 |
| 14 | g-bootstrap-while-in-handler-block-not-parsed-s462 | LOW | **FIXED** (superseded) | `onclick={ while (…) {…} }` → only `E-LOOP-WHILE-RETIRED` (`while` is no scrml loop since §49); no E-PARSE-OBJECT. Sibling `onclick={ for (@i < 3) { … } }` compiles, and the runtime half PASSES (click → `#i` = `"3"`): the handler block is read as statements | 19a2038a3 (s469-loops: `while` retired, the one `for`), PR #1474 |
| 15 | g-bootstrap-md-static-owed-s462 | MED | STILL-OPEN | `<md>## Title …</md>` compiles exit 0 and the page template holds the raw `<md>\n## Title\n\nSome *text*.` (no `h2`); `bootstrap-conformance --filter md/` → the same 7 FAIL (heading-ids-page-wide, in-phrasing-refused, indent-mixed, of-body-refused, second-spelling-strict, static-tree, url-scheme-literal-refused), 8 UNSUPPORTED | no `<md>` production anywhere in self-host-v2 (searched locus stands) |
| 16 | g-bootstrap-stdlib-import-004-missing-s462 | MED | STILL-OPEN | repro `import { totallyBogus } from "scrml:data"` → `E-SCOPE-001: \`totallyBogus\` is not declared` (no E-IMPORT-004); `--filter module/e-import-004` → stdlib-name-not-exported / stdlib-submodule-only FAIL "missing E-IMPORT-004", stdlib-name-exported-clean FAIL twin-extra-error E-SCOPE-001, stdlib-reexport UNSUPPORTED (parse-reject `{`) | compiler/self-host-v2 module linking (link.scrml); no stdlib binding |
| 17 | g-bootstrap-decl-field-named-as-shadowed-by-handle-s462 | LOW | STILL-OPEN | `<card as:string="x" …/>` used as `<card as=c title="T"/>` compiles exit 0, and the runtime half shows `.card` = `"x"` (the field kept its default; `as=` was read as the handle, silently); `as="hello"` → `E-DECL-AS: \`as=\` takes a name` | analyze `resolveUse`:13152; E-DECL-AS at analyze.scrml:3602 |
| 18 | g-bootstrap-text-entities-displayed-literally-s468 | LOW | STILL-OPEN | `<p id="o">a &amp; b &lt;c&gt;</p>` → template prints `a &amp;amp; b &amp;lt;c&amp;gt;`; the runtime half shows `#o` = `"a &amp; b &lt;c&gt;"` | html `escText`:31 / `printNode`:96 |
| 19 | g-bootstrap-runtime-flush-not-exception-safe | MED | STILL-OPEN | runtime probe (`repros/…flush-not-exception-safe.mjs`): two render effects on `a`, the first throws on `a=1` → the second does NOT run in that flush (`after a=1: []`) | runtime.js `flush`:148 → `drainQueues`:154 (no per-item try) |
| 20 | g-bootstrap-m2-direct-handle-refused-inside-own-given | MED | **FIXED** | `given c = @color :> { @color.value = "b"; }` and `{ @seen = @color.value; }` over a conditional `as=color` compile clean; the runtime half PASSES (`.bx` = `"b"`, `#s` = `"b"`) | 78209e3d2 (S440 re-land of #1109 review fixes; tests "a direct READ / WRITE `@color.value` inside the block is accepted", slice-m2/front.test.js), PR #1129 |
| 21 | g-bootstrap-m2-spec-drift-guard-fails-on-crlf | LOW | **FIXED** | the guard's `lf` + `sectionBlocks` (copied verbatim from slice-m2/parse.test.js) over SPEC.md as LF and as CRLF → identical, non-empty block lists for §66.19.1 (1), §66.19.2 (1), §66.19.3 (2); the reader is section-scoped | 78209e3d2 (`const lf = …` CRLF normalisation + per-section reader), PR #1129 |
| 22 | g-bootstrap-code-body-several-display-literals-refused | MED | STILL-OPEN | state-child bodies `"a"⏎"b"`, `"a";`, `"a"; "b"` → each `E-UNQUOTED-DISPLAY-TEXT … did you mean \`""a";"\`?` (the wrong suggestion stands); a single `"only"` is clean | locus moved: `isStandaloneDisplay` is now parse.scrml:3966 (was :1037) |
| 23 | g-bootstrap-nested-interp-string-message-says-display-literal | LOW | STILL-OPEN | `<p : @n == 5 ? "a ${@n} b" : "c">` → `E-BOOTSTRAP-UNSUPPORTED: a display-text literal carrying an interpolation (§4.18.4) inside a larger expression …` (wording unchanged) | locus moved: the message is at parse.scrml:4605 (was :1348) |
| 24 | g-bootstrap-runaway-display-literal-cascades-before-closer | MED | STILL-OPEN | `"C:\"` body + a later `<B … : "B">` → E-UNQUOTED-DISPLAY-TEXT quoting the rest of the file, then 3× E-PARSE-UNCLOSED (`<A>`, `<ph>`, `<program>`); control (last child) → the single `E-CTX-001 … read up to the \`<A>\` body's closer` | locus moved: `displayCloseAt` is now parse.scrml:4935 (was :1641); the E-CTX-001 emit is :4889 |
| 25 | g-bootstrap-unterminated-shorthand-display-literal-meets-later-quote | LOW | STILL-OPEN | `<p : "abc>`⏎`<i : "x">` → E-PARSE-TRAILING (`x`), E-PARSE-SHORTHAND, 2× E-PARSE-UNCLOSED; no E-CTX-001 | locus moved: `parseShorthand` is now parse.scrml:4533 (was :1279) |
| 26 | g-bootstrap-typer-int-into-string-bool-initializer-unchecked | LOW | STILL-OPEN | `let s: string = a` (a: int), `let t: boolean = a`, `let u: string = @n` → no diagnostic; control `let k: int = a` (a: string) → `E-TYPE-031` | locus moved: `checkMaybeNot` is now analyze.scrml:16478 (was :6097); the S442 comment is at :16395 |
| 27 | g-bootstrap-bind-value-with-hand-written-value-accepted | LOW | STILL-OPEN | `<input value="z" bind:value=@s/>` → compiles exit 0 with zero diagnostics | locus moved: `handAttrConflict` is now analyze.scrml:13040 (entry cites :4855-4866 / :4943) |
| 28 | g-bootstrap-call-arity-and-argument-type-checks-owed | MED | NARROWED | `g(1, 2, 3)` / `g(1)` → `E-CALL-ARITY` (both directions); `h(5)` (string param) → `E-TYPE-031 argument 1 of \`h\` expects \`string\``; `int \| not` into `string` → E-TYPE-031; struct `P` into `int` → E-TYPE-031. Remaining: a defaulted parameter `b: int = 2` is not parsed at all (`E-BOOTSTRAP-UNSUPPORTED: an unannotated parameter \`\`` + `… \`2\``), so the "defaults per §7.3.2" limb of the arity rule is unreachable | the checks predate the filing: 55a9f3d5c (arity, #1151) and 8367a6b81 (argument E-TYPE-031, #1157), both S442 (2026-09-29); the gap was filed 2026-10-01 (f9cd63d86, #1222). Emit: analyze.scrml:16425 |
| 29 | g-bootstrap-flush-leftovers-after-throw | LOW | STILL-OPEN | same probe as row 19: after the throwing flush, a write to the UNRELATED cell `z` runs the leftover render effect AND the `<effect deps=[a]>` body (`after unrelated z=1: ["render-b saw a=1","effect(deps=[a]) ran"]`): an effect fires on a cell it does not list | runtime.js `drainQueues`:154 |
| 30 | g-bootstrap-effect-reset-on-owed | MED | STILL-OPEN (umbrella; landed part verified) | LANDED limbs hold: `<effect deps=[@n]>` + a write-free call compile clean, and `reset-on=[@q]` runs (next, next, type → `#pg` = `"1"`, PASS). REMAINS reproduce as listed: `<request>` → `E-BOOTSTRAP-UNSUPPORTED … not in the bootstrap`; an `<effect>` in a function body → refused ("has no position in the tree to own it"); `reset-on=` on a declaration field → refused ("is OPEN (§6.8.4)") | searched locus `compiler/self-host-v2/(effect …)` stands; the write-request half stays blocked on `<request>` |
| 31 | g-bootstrap-c11-ignores-function-values | LOW | CANNOT-REPRO | the front-end limb holds: `const h = peek` in an effect → `E-EFFECT-WRITES-STATE … hands \`peek\` on as a function value` (+ E-BOOTSTRAP-UNSUPPORTED "function values"). The C11 hole itself cannot be reached from source: Core has no function-value expression outside a SeqCall lambda (the entry says so), so no program gets a function value into Core for C11 to miss | check.scrml C11 at :1093, `blockWriteWitness`:1335; analyze `fnValueRef`:18081 |
| 32 | g-bootstrap-onmount-owed | MED | STILL-OPEN | `<onMount>${ beacon(); }</>` → `E-PARSE-EXPECTED: expected \`}\`, found \`;\`` + E-PARSE-TRAILING (read as an ordinary element whose `${}` is an expression; no lifecycle code fires); `on mount { beacon(); }` → a 10-error cascade (E-SCOPE-001 `on`, `mount`, …), no W-ON-MOUNT-DEPRECATED | no `<onMount>` production in self-host-v2 (searched locus stands) |
| 33 | g-bootstrap-effect-open-items-owed | MED | STILL-OPEN | (2) `lift 1;` in an effect body → the generic `E-BOOTSTRAP-UNSUPPORTED \`lift\` appends to a loop BOUND AS A VALUE …`, not E-LIFT-IN-LIFECYCLE-BODY; (3) `deps=[@b.k]` → the interim `E-BOOTSTRAP-UNSUPPORTED a field path as an effect dependency … is OPEN`, not the ruled E-LIFECYCLE-007 message. Items (5)–(9) wait on `<channel>` / `<onTransition>` / `<request>` / `persist=`, all refused | searched locus stands |
| 34 | g-bootstrap-validity-errors-value-and-messages-unbuilt | MED | STILL-OPEN | `req("Please fill")` → `E-BOOTSTRAP-UNSUPPORTED \`req("…")\` — a Level-1 message`; `eq(@v)` and `oneOf([…])` → `… does not evaluate this validator yet`; `${@f.v.errors}` → `… read as a value — the ValidationError array (§55.9) has no type` | analyze `compoundSurface`:5021 |
| 35 | g-bootstrap-gate-reach-live-dom-reading | MED (fail-open) | STILL-OPEN | runtime half, an empty `req` value in a closed `if=` region, form submitted: P3 a USE `<f/>` → `#calls` = `"1"` (handler RAN), even though the compile reported `I-FORM-SUBMIT-GATED … gated by: f.v` and the same through `<*f/>` is blocked (PASS, `"0"`); P4 a slot filled at the use site → `"1"`; P12 a bind through an `as=` handle → `"1"`. All three fail-open shapes reproduce | lower `gateDecls`:3358, `namedFields`:3429, `nameable`:3558 |
| 36 | g-bootstrap-validity-spec-silences-s449 | LOW | STILL-OPEN (SPEC question) | (a) `${@signup.email.submitted}` → `E-SCOPE-001 … a field of a declaration has no \`submitted\` of its own (§55.6); its compound has it: \`@signup.submitted\``, the behaviour the entry records. (b) and (c) are rulings with no wrong output to probe; the entry stays a PA confirmation item | compiler/SPEC.md §55.6 / §55.12 / §55.10 |
| 37 | g-bootstrap-gate-disabled-readonly-controls-still-gate | LOW | STILL-OPEN | `<input disabled bind:value=@email/>` (req, empty) is the only control; the submit is blocked (`#calls` = `"0"`), although HTML bars a disabled control from validation | runtime.js gate (SPEC ruling owed) |
| 38 | g-bootstrap-gate-external-form-owner-control | MED (fail-open) | STILL-OPEN | `<select form="fm" bind:value=@v>` outside the form, `length(>=2)`, value `""`: the form prints as `<form id="fm">` (no `novalidate`, no `data-scrml-gated`), and submit runs the handler (`#calls` = `"1"`) | analyze `gatesIn`:22798 |
| 39 | g-bootstrap-gate-marker-over-names-each-row-fields | LOW | STILL-OPEN | `<each in=@xs as x><row/></each>` over an empty tape → `<form data-scrml-gated="row.v" novalidate="" id="fm">` and `I-FORM-SUBMIT-GATED … gated by: row.v`; nothing gates at runtime (submit → `"1"`, correct) | analyze `gatesIn`:22798 |
| 40 | g-bootstrap-opener-scalar-init-for-sequence-type-unchecked | MED | STILL-OPEN | `<n:int[append]=0/>` + `<main>${@n}</main>` → compiles exit 0 with zero diagnostics | analyze.scrml own-value check (no named function in the locus) |
| 41 | g-bootstrap-shorthand-body-keyword-before-tag-cascades | LOW | STILL-OPEN | `<Idle rule=.Busy : let <b/>>` → E-CLOSER-001, E-PARSE-DECL-BODY, E-SCOPE-001 ×2 (`let`, `b`) — exactly the recorded cascade; no E-DECL-KEYWORD-NOT-ITEM | locus moved: `parseShorthand` is parse.scrml:4533 |
| 42 | g-bootstrap-program-attrs-ignored-fail-open | **HIGH** | **FIXED** | `<program auth="required">` → `E-BOOTSTRAP-UNSUPPORTED: \`<program auth="required">\` is not in the bootstrap — it emits no server and no login gate …, so the program is refused`; sibling `<program frobnicate capabilities="bogus" ratelimit="5/fortnight" lang="cobol">` → W-ATTR-001, E-BOOTSTRAP-UNSUPPORTED (capabilities), E-MW-002 (ratelimit), E-BOOTSTRAP-UNSUPPORTED (`lang=`) | 9e0a4d2ac "fix(bootstrap, §40.8/§4.12): <program> attributes checked or refused; nothing outside the program dropped silently", PR #1257. `declStubs` moved to analyze.scrml:1206 |
| 43 | g-bootstrap-entry-content-outside-program-dropped-silently | **HIGH** | **FIXED** | `<p>stray</p>` before `<program>` → `E-BOOTSTRAP-UNSUPPORTED: \`<p>\` at a file's top level, outside any \`<program>\`, is not in the bootstrap`; `<engine …>` before → the same; a second top-level `<program>` → `E-PROGRAM-002` | 9e0a4d2ac, PR #1257. `phaseA` moved to analyze.scrml:4132 (the `program = d.sym` loop is :4145) |
| 44 | g-bootstrap-unknown-tags-resolved-as-html | MED | NARROWED | FIXED limb: `<style>` (in `<main>` or at program level) → `E-STYLE-001` (8b9cd9919, S462 security, PR #1398). STILL-OPEN: `<Unknown/>` and `<p><x/></p>` compile exit 0, zero diagnostics, printed as `<Unknown></Unknown>` / `<x></x>` | locus moved: `resolveElem` analyze.scrml:12198 → `resolveHtml` :12761 (entry cites ~4640 / ~4980) |
| 45 | g-bootstrap-unimplemented-construct-reported-as-generic-code | LOW | STILL-OPEN | `a: any` → `E-TYPE-UNKNOWN: unknown type \`any\`` (not E-TYPE-ANY-FORBIDDEN); `cleanup(42)` → `E-SCOPE-001: \`cleanup\` is not declared` (not E-LIFECYCLE-004 or a named refusal). The must-use (E-MU-001) limb was not probed separately | searched locus (analyze scope / type resolution) stands |
| 46 | g-bootstrap-diag-has-no-severity | MED | **FIXED** | a warning-only program (`<program frobnicate="1">`) prints `warning [W-ATTR-001]` and compiles exit 0 (`✓ compiled … · 1 warning`); infos print as `info [I-FORM-SUBMIT-GATED]`; the counter grades severity (`severity: E-MD-IN-PHRASING did not fire (expected error)`) | 488abeedc "diagnostics carry §34 severity from one generated table", PR #1270; `Diag` is now ast.scrml:407 (was :220) |
| 47 | g-bootstrap-else-if-else-attrs-ignored | **HIGH** | **FIXED** | the `if=` / `else-if=` / `else` chain, runtime half: at step 1 `#one`/`#two`/`#rest` counts 1/0/0 (PASS); after two clicks 0/0/1 (PASS). Orphan limbs: a lone `else` → `E-CTRL-001`, a lone `else-if=` → `E-CTRL-002` | 2fb41d8b7 "fix(bootstrap, §17.1.1): else-if/else chains render exactly the first true branch", PR #1254 |
| 48 | g-bootstrap-defer-scope-001-and-runs-anyway | **HIGH** | **FIXED** | `defer @count = 99; return @count;` compiles clean, and the runtime half PASSES: `#got` = `"7"` (the return value is read before the deferred write), `#count` = `"99"`. Limb (2): the CLI writes nothing when an Error fires (`✗ N errors — nothing written`, seen throughout this sweep) | 5cad2b1e5 "fix(bootstrap, §19.16): no artifact on errors; defer implemented", PR #1255 |
| 49 | g-bootstrap-unnamed-state-child-variant-codes | MED | NARROWED | the bootstrap still answers `E-DECL-STATE-CHILD` (`<Zed>` not a variant; `rule=.Bogus`) and `E-TYPE-VARIANT` (`=.Nope`). The SPEC half is DONE: §66.20 now names both codes with the legacy codes each supersedes (SPEC.md ~:51245, b68b26c15, PR #1253). STILL-OPEN: the counter's `SUPERSEDED_CODE_MAP` still carries the three rows as `status: "owed"`, with rationale text saying "no §66.20 code is named", so `engine/{state-child,rule,initial}-invalid-variant-pos` still FAIL "missing E-ENGINE-…" (`--filter engine/`). Both codes also still lack a §34 row (severity.scrml) | scripts/bootstrap-conformance.ts `SUPERSEDED_CODE_MAP` ~:273-290; analyze `graphOf`:3343, `resolveVariant`:4899 |
| 50 | g-bootstrap-single-transition-graph-checks-missing | MED | NARROWED | FIXED limbs: payload / `history` / `internal:rule` shapes are now refused by name (`\`history\` on the state-child \`<A>\` is not in the bootstrap … the attribute would be ignored`; `id` the same; counter: `payload-arity-mismatch-pos`, `payload-unit-variant-pos`, `history-no-inner-engine-pos`, `internal-rule-not-composite-pos` are UNSUPPORTED, not silent) — 086f8f209 (PR #1261). STILL-OPEN: exhaustiveness — `type Ph = { A, B, C }` with state-children for A and B only compiles exit 0 (no E-ENGINE-STATE-CHILD-MISSING; `engine/state-child-missing-pos` FAIL). `lifecycle/effect-bare-not-interpolated` is NOT-TWINNED, so ungraded | analyze `graphOf`:3343 |
| 51 | g-bootstrap-module-import-checks-missing | MED | STILL-OPEN | repro `import { a } from "./does-not-exist.scrml"` + `import { b } from "lodash"` → only `E-SCOPE-001: \`a\` is not declared`; `--filter module/` → e-import-004-name-not-exported, e-import-005-bare-specifier, e-import-006-missing-file, e-import-pinned-invalid and e-export-003-attr-conflict all FAIL "missing E-…" | self-host-v2 module linking (link.scrml) |
| 52 | g-bootstrap-opener-refinement-lifecycle-type-rejected | MED | NARROWED | FIXED limb: `<n:integer=5/>` compiles exit 0 (190ccf5d9 "accept integer / boolean as int / bool", PR #1486). STILL-OPEN: `<hp:number(>0)=5/>` → E-PARSE-TAG `(` + E-PARSE-DECL-BODY + E-PARSE-CLOSER + E-PARSE-UNCLOSED (+ a stray E-DECL-STATE-CHILD); `<p:(.A to .B)=.A/>` → `E-PARSE-TYPE: expected a type after \`:\`` + 6× E-PARSE-TAG | parse.scrml opener type reader |
| 53 | g-bootstrap-value-writes-effect-suppression-global | LOW | CANNOT-REPRO | the headline needs `valuePositions` to MISS a position (the defence-in-depth echo then hides behind an unrelated root); no source program does that, so there is nothing to run. Review limb "an imported writer called in an interpolation is reported twice": the repro (+ `.lib.scrml`) reports `E-VALUE-WRITES-STATE` ONCE, but the lib's own cell write is refused (`writing a whole instance`), so this is not a clean negative | analyze `effectPass`:18533 — the `quiet = roots.length > 0` line is :18552; `valuePositions`:18690 |
| 54 | g-bootstrap-s34-rows-owed-s451 | LOW | NARROWED | `bun scripts/gen-bootstrap-severity.ts --check` → `severity.scrml is current`; its header now lists 37 codes with no usable §34 row (was 69). The E-PARSE-* family has rows now (a89be0351, S469, §34.2). Still rowless: E-BOOTSTRAP-UNSUPPORTED, E-DECL-STATE-CHILD, E-TYPE-VARIANT, E-ASSIGN-CONST, E-OPERATOR-OPERAND-TYPE, E-WRITE-NOT-GRANTED, … and E-ENGINE-INVALID-TRANSITION ("Runtime") | compiler/self-host-v2/severity.scrml header :14-52 (generated) |
| 55 | g-bootstrap-attr-namespaced-and-case-s451 | LOW | STILL-OPEN | (1) `<use xlink:href="#a"/>` → `E-BOOTSTRAP-UNSUPPORTED: a declaration inside markup …` (still read as `name:type`); `<p xml:lang="en">` → E-PARSE-DECL-BODY + a parse cascade; (3) `onclick=${f}` → `E-PARSE-TRAILING: unexpected \`{\`` + cascade; (4) a quoted `\${` → refused (`title="…" holds a \`${…}\` interpolation`). (2) case folding not probed (masked by the `class:` refusal, as the entry says) | parse `repeatedAttrDiags`:4448 |
| 56 | g-bootstrap-function-values-slice-s451 | MED | STILL-OPEN | `const h = bump;` → `E-BOOTSTRAP-UNSUPPORTED: \`bump\` names a function without calling it … function values arrive with a later "function values" slice`; `onclick=onE` with `onE(e: Event)` → `… an event-handler reference to \`onE\`, which takes parameters …` (and `Event` is E-TYPE-UNKNOWN). A zero-parameter `onclick=bump` is accepted | analyze non-call function reference (`fnValueRef`:18081) |
| 57 | g-bootstrap-twin-log-unknown-s451 | LOW | STILL-OPEN | `log("hello");` → `E-SCOPE-001: \`log\` is not declared` | searched locus stands |
| 58 | g-bootstrap-sql-kind-known-limits-s451 | MED | CANNOT-REPRO | a recorded limit, not a defect with a symptom: the text classifier cannot prove a query read-only. The binding requirement (a query parallelized or cached because it classifies Select SHALL run in a read-only transaction) has no consumer in the bootstrap yet: `<request>` is refused (row 30), and nothing in self-host-v2 parallelizes or caches by kind (grep: no read-only transaction anywhere) | compiler/self-host-v2/sql.scrml header ("KNOWN LIMITS") |
| 59 | g-bootstrap-rejects-sanctioned-is-some-is-not-s460 | MED | NARROWED | FIXED (headline): `if (u is some) { return u; }` and `if (u is not) { return "-"; } return u;` compile (`is some` → info W-IS-SOME-DEPRECATED, "write `is given`"), and the runtime half PASSES (`#s` = `"xy-"`). No diagnostic teaches `x != not` any more: the three `!= not` hits in analyze.scrml are comments, and `!u` now says "compare explicitly (… `x is given`)". STILL-OPEN (the S462 note in the entry): a `given x :>` match arm → E-PARSE-ARM ×2 + E-SCOPE-001 `given` + a cascade | e18d3a91a "`is some` → `is given` through §63; `is given` works everywhere", PR #1385 |
| 60 | g-bootstrap-narrowing-comment-stale-s460 | LOW | **FIXED** | at the filing commit (02732712a, PR #1368) analyze.scrml:9037 read "…so erring generous — a write…"; on main the sentence is gone. The behaviour it misdescribed, run: a nested-block write `if (@c) { @n = not; }` drops the narrowing (`return @n` → E-TYPE-031 "a `T \| not` is not a `T`"); `!u` on `string \| not` → E-OPERATOR-OPERAND-TYPE | 3d0e54e21 (S460 a′ + F2, PR #1372), which landed after the filing the same day |
| 61 | g-bootstrap-no-host-method-calls-refuses-correct-code-s460 | MED | NARROWED | defect 1 FIXED: `const optional = seg.endsWith("?"); if (optional)`, `s.trim()`, `s.slice(1)`, `s.length` all compile, and the runtime half PASSES (`#o` = `"opt,req,xyxy ,n"`, `#h` = `"3"`) — 27ebf4107 (s469-boot-strings-1, PR #1475). Defect 2 STILL-OPEN: a refused initializer (`seg.frobnicate("?")` → E-STRING-METHOD-UNKNOWN) is blamed again at the condition: `E-COND-NOT-BOOLEAN … a value whose type the compiler cannot resolve` | analyze `condBlamed`:16072, `checkCond`:15849 |
| 62 | g-bootstrap-derived-cycle-through-function-s462 | LOW | STILL-OPEN | `function g() -> int { return @a + 1; }` + `<a:int=(g())/>` compiles exit 0; control (a direct `@a → @b → @a`) → `E-DERIVED-CIRCULAR-DEP` | analyze `derivedCycles`:4227 |
| 63 | g-bootstrap-eq-mixed-types-silent-s462 | LOW | **FIXED** | `let <s:string="a"/>` + `<c=(@s == 1)/>` → `E-EQ-001: \`==\` compares values of one type, and this is \`string\` with \`int\`` | b2351db77 "E-EQ-001 — == across provably different primitive types (§45)" (s469 templates r2), PR #1497 |
| 64 | g-bootstrap-no-channel-handler-checks-s462 | LOW | STILL-OPEN (unreachable) | `grep` finds no E-CHANNEL-005 / -006 / E-CHANNEL-HANDLER-SHADOW in self-host-v2. `<channel name="room" onclient=nope>` inside `<program>` → `E-BOOTSTRAP-UNSUPPORTED: \`<channel>\` … is not in the bootstrap`, so no program reaches the missing checks (fail closed) | the only channel code is E-CHANNEL-OUTSIDE-PROGRAM, now analyze.scrml:1383 (was :1425) |
| 65 | g-bootstrap-local-shadows-state-accepted-s469 | LOW | STILL-OPEN | `let <count:int=0/>` + `function f() { let count = 5; @count = count; }` → compiles exit 0, no E-NAME-COLLIDES-STATE | searched locus stands |
| 66 | g-bootstrap-style-attr-bound-value-unguarded-s469 | MED | STILL-OPEN | `<p id="p" style=(@c)>` with `@c = "background: url(https://evil.example/leak)"` compiles clean; the runtime half shows the live attribute `style` = `"background: url(https://evil.example/leak)"` (unguarded: a network fetch on first paint) | runtime.js `urlGuardOf`:1788 is the only guard; `cssValueOf`:1857 is not on this path |
| 67 | g-bootstrap-css-residuals-s469 | LOW | STILL-OPEN | (1) `p { background: url(@c); }` compiles clean and the page CSS holds `url(@c)` verbatim; (3) `<p data-scrml="zz">` on a non-root element is kept as written (`<p data-scrml="zz">x`). (2) `:root` in a scope and (6) CR-only line endings were not probed; (4) and (5) were fixed in the filing change | css-syntax `parseValue`:741 / `parseCompound`:597; lower `stampAttrs`:2050 |

## Totals

| verdict | count |
|---|---:|
| STILL-OPEN | 45 |
| FIXED | 11 |
| NARROWED | 8 |
| CANNOT-REPRO | 3 |
| **total** | **67** |

**FIXED (11) → landing:**

- `g-bootstrap-semicolon-braceless-else-rejected-s462` → 3acc76cd8 (s469 semicolons), PR #1510
- `g-bootstrap-while-in-handler-block-not-parsed-s462` → 19a2038a3 (s469-loops: `while` retired), PR #1474. Superseded rather than fixed in place: `while` is no longer a scrml loop, and the handler block now parses statements
- `g-bootstrap-m2-direct-handle-refused-inside-own-given` → 78209e3d2, PR #1129 (S440, which predates most of the ledger's later entries)
- `g-bootstrap-m2-spec-drift-guard-fails-on-crlf` → 78209e3d2, PR #1129
- `g-bootstrap-program-attrs-ignored-fail-open` (HIGH) → 9e0a4d2ac, PR #1257
- `g-bootstrap-entry-content-outside-program-dropped-silently` (HIGH) → 9e0a4d2ac, PR #1257
- `g-bootstrap-else-if-else-attrs-ignored` (HIGH) → 2fb41d8b7, PR #1254
- `g-bootstrap-defer-scope-001-and-runs-anyway` (HIGH) → 5cad2b1e5, PR #1255
- `g-bootstrap-diag-has-no-severity` → 488abeedc, PR #1270
- `g-bootstrap-narrowing-comment-stale-s460` → 3d0e54e21, PR #1372
- `g-bootstrap-eq-mixed-types-silent-s462` → b2351db77, PR #1497

No HIGH entry is STILL-OPEN: all four HIGH `g-bootstrap-*` entries are FIXED. The fail-open entries still open are MED:
`gate-reach-live-dom-reading` (three shapes run the handler on an empty `req` value), `gate-external-form-owner-control`,
and `style-attr-bound-value-unguarded-s469` (an unguarded `style=` binding fetches a URL on first paint).

## Notes — NARROWED

- **call-arity-and-argument-type-checks-owed (row 28).** Every named check fires: E-CALL-ARITY in both directions, and
  E-TYPE-031 for a primitive mismatch, a kind mismatch, and `T | not` into `T`. The checks predate the filing (S442,
  #1151 / #1157), so the entry was probably filed against the SPEC's new §7.3.4 text without a re-probe. The one open
  limb is the §7.3.2 default: `b: int = 2` is not parsed, and the error message is malformed (`an unannotated parameter
  \`\`` and `\`2\``). Recommend: re-scope the entry to "default parameters (§7.3.2) are not parsed", and fix the
  empty-name message.
- **unknown-tags-resolved-as-html (row 44).** `<style>` is refused (E-STYLE-001, S462 security #1398). `<Unknown/>` and
  an undeclared lowercase `<x/>` are still printed as HTML elements, with no diagnostic.
- **unnamed-state-child-variant-codes (row 49).** The SPEC call the entry routed to the PA is made: §66.20 names
  E-DECL-STATE-CHILD / E-TYPE-VARIANT, each with the legacy codes it supersedes (#1253). What is left is in the counter,
  not the compiler. The three `SUPERSEDED_CODE_MAP` rows are still `owed`, and their `spec:` text is stale ("no §66.20
  code is named"), so three twins still FAIL. Flipping them to `applied` (`to:` the §66.20 code) should turn those FAILs
  green. Neither code has a §34 row yet (see row 54).
- **single-transition-graph-checks-missing (row 50).** The unsupported state-child attributes are refused by name now
  (#1261). Exhaustiveness (E-ENGINE-STATE-CHILD-MISSING) is still silent: a variant with no state-child compiles.
- **opener-refinement-lifecycle-type-rejected (row 52).** `integer` works (#1486). Refinement `number(>0)` and lifecycle
  `(.A to .B)` openers still fail to parse.
- **s34-rows-owed-s451 (row 54).** 69 → 37 rowless codes. The E-PARSE-* family has rows (a89be0351). The rest is
  listed in the generated header of `severity.scrml`.
- **rejects-sanctioned-is-some-is-not-s460 (row 59).** The headline is FIXED and runs (#1385). Only the S462 addendum
  remains: the `given x :>` match arm is not parsed. A lane that picks this entry up should treat it as "match-arm
  `given`", not "`is some` / `is not`".
- **no-host-method-calls-refuses-correct-code-s460 (row 61).** The string-method catalog exists and runs (#1475).
  Defect 2 is still open: `condBlamed` re-reports a condition whose local's initializer was already refused (one root
  error, two reports).

## Notes — CANNOT-REPRO

- **c11-ignores-function-values (row 31).** Core has no function-value expression outside a SeqCall lambda, so no source
  program can put a function value in front of C11. The front-end rule it backstops does fire. Tried: `const h = peek` in
  an effect body. The front end refuses it twice (function values unsupported, and E-EFFECT-WRITES-STATE), and nothing
  reaches Core. Keep it as a latent note tied to the function-values slice (row 56).
- **value-writes-effect-suppression-global (row 53).** The headline needs `valuePositions` to miss a position. No program
  does, so it can only be shown by mutating the compiler, which this sweep may not do. The review limb (an imported
  writer reported twice) came out once on the repro, but the lib file has its own refusal, so this is not a clean
  negative. A lane would need a lib whose writer compiles clean. The bootstrap reads an exported top-level
  `let <hits/>` in a program-less file as an instance, so the writer needs another shape.
- **sql-kind-known-limits-s451 (row 58).** A documented limitation with no consumer. Nothing in the bootstrap
  parallelizes or caches by SQL kind, and `<request>` is refused. It becomes testable when U3 / `<request cache>` lands.
  Until then it is a design note, not a gap with a symptom.

## Findings beyond the ledger (seen while reproducing; not filed)

- **Gate info claims a gate that does not hold (row 35, P3).** For a USE `<f/>` inside a form, the compile reports
  `I-FORM-SUBMIT-GATED … gated by: f.v`, yet the submit runs the handler on the empty `req` value. The info line tells the
  author the form is protected when it is not. This adds to the fail-open, and it matters for whoever fixes P3.
- **Default parameters (row 28):** `function g(a: int, b: int = 2)` → `E-BOOTSTRAP-UNSUPPORTED: an unannotated parameter
  \`\`` + `\`2\``. A malformed message for an unparsed §7.3.2 form.
- **`K.variants` (row 5):** an `Enum.variants` iterable gets `E-TYPE-VARIANT: \`variants\` is not a variant of \`K\``,
  a misleading code. The entry promises a named refusal.
- **`const <ids> = for …` (row 3):** generic `E-PARSE-ITEM: unexpected text at program level`, not a named refusal.
- **Counter staleness (row 49):** `SUPERSEDED_CODE_MAP` rationale text contradicts the current §66.20.

## Moved loci (line numbers that drifted; the functions all still exist)

| entry | cited | current |
|---|---|---|
| code-body-several-display-literals-refused | parse.scrml:1037 `isStandaloneDisplay` | parse.scrml:3966 |
| nested-interp-string-message-says-display-literal | parse.scrml:1348 | parse.scrml:4605 |
| runaway-display-literal-cascades-before-closer | parse.scrml:1641 `displayCloseAt` | parse.scrml:4935 (E-CTX-001 emit :4889) |
| unterminated-shorthand-display-literal-meets-later-quote | parse.scrml:1279 `parseShorthand` | parse.scrml:4533 |
| typer-int-into-string-bool-initializer-unchecked | analyze.scrml:6097 `checkMaybeNot` (~:6027 comment) | analyze.scrml:16478 (comment :16395) |
| bind-value-with-hand-written-value-accepted | analyze.scrml:4855-4866 / `handAttrConflict`:4943 | analyze.scrml:13040 |
| program-attrs-ignored-fail-open | analyze.scrml `declStubs` ~1083; ast.scrml:201 | analyze.scrml:1206 (FIXED) |
| entry-content-outside-program-dropped-silently | analyze.scrml `phaseA` ~2150 | analyze.scrml:4132, loop :4145 (FIXED) |
| unknown-tags-resolved-as-html | analyze.scrml `resolveElem` ~4640 → `resolveHtml` ~4980 | :12198 → :12761 |
| diag-has-no-severity | ast.scrml:220 | ast.scrml:407 (FIXED) |
| narrowing-comment-stale-s460 | analyze.scrml:9023-9038 | the stale text is gone (FIXED) |
| no-channel-handler-checks-s462 | analyze.scrml:1425 (E-CHANNEL-OUTSIDE-PROGRAM) | analyze.scrml:1383 |
| length-validator-html-attr-utf16-s469 | print.scrml (the lowering) | the lowering is analyze.scrml:3103-3113 |
| runtime-flush-not-exception-safe / flush-leftovers-after-throw | runtime.js `flush` | runtime.js:148 → `drainQueues`:154 |

Function-name loci (no line given) were checked with a definition grep. All of them resolve on main:
`parseAssign`, `destructAhead`, `forStmt`, `iterElemOf`, `resolveMember`, `isIndexExpr`, `planLoop`, `loopDefer`,
`loopFor`, `loopForbidden`, `resolveLift`, `typeForStmt`, `resolveTier0`, `parseTier0`, `parseLift`,
`parseKeywordPrimary`, `resolveAssign`, `parseFor`, `primJs`, `methodOf`, `resolveCall`, `parseIf`, `parseStmt`,
`resolveUse`, `printNode`, `writeGuards`, `resolveAtRead`, `blockWriteWitness`, `gateDecls`, `gatesIn`, `effectPass`,
`derivedCycles`, `checkOperands`, `repeatedAttrDiags`, `stampAttrs`, `parseValue`, `parseCompound`, `urlGuardOf`.

## Method caveats

- Several entries are multi-limb umbrellas ("owed" lists). For those, the probes covered a representative limb per
  item, not every sentence. Each row names what was run, and limbs not probed are said to be not probed.
- `--filter` runs of `scripts/bootstrap-conformance.ts` (md/, module/, engine/, e-import-004, effect-bare) graded the
  corpus cases the entries cite. Those runs are the evidence for rows 15, 16, 49, 50 and 51, alongside the repro.
- The drift-guard verdict (row 21) runs the guard's reader functions, copied verbatim from the test, over a CRLF copy
  of SPEC.md. It does not run the test on a CRLF checkout.
