# s473-boot-program-attrs-small — progress (append-only)

Lane: B3 + B9 of the flogence-on-bootstrap measurement
(`~/.cache/scrml/review/s473-flogence-port/REPORT.md`). Bootstrap only (`compiler/self-host-v2/`).

## 2026-10-29T14:12Z — start; tests first

Base `origin/main` 4d5b9a15d. Rulings read verbatim (user-voice-scrml.md S472/S473): none governs
these items; each follows a SPEC sentence quoted below.

What the measurement's sites actually are (read from `results.json`, checked against flogence source):

- **B3** `<program>` attrs refused by the generic "reads no `<program>` attribute": `lang` (21 files),
  `mcp` (2), `title` (1). `db=` is ALREADY read (s451 U1a). `kind=` / `serve=` / `cors=` belong to B2.
- **B9 (a)** `timestamp` → E-TYPE-UNKNOWN (delta-log.scrml:62). A real bootstrap false positive.
- **B9 (b)** "`if` used as a value": all 7 sites (capture-tool 1408/1482, graph-read-tool 36/54/77,
  graph-ingest-tool 54/784, dispatch-tool 81) are the line AFTER a `const x = _={ … }=`; the bootstrap
  reads the `}=` closer as `}` then `=`, so the next statement's `if` lands as an assignment's RHS.
  flogence holds no `= if (…)` / `return if (…)` (grep). It is a B1 cascade, not a feature use:
  NOT built here (the value form §17.6.10 stays refused by name, unchanged).
- **B9 (c)** "writing a whole instance": view.scrml:57-60 writes `@status` etc., declared by the
  legacy `<status> = …` form inside `${ }` (unparsed → undeclared); sample.scrml:115 writes
  `@reportPhase`, the legacy `<engine for=>` implicit cell (retired in §66). Both are writes to a
  name that is not in scope; the bootstrap's place fallback mislabels them "whole instance". Fix:
  E-SCOPE-001, the same code a read of the name gets. A genuine whole-instance write is unchanged.

Governing SPEC sentences:

- §40.7: "Each attribute, when present, generates a standard HTML head tag in the emitted output."
  "A non-string-literal value (e.g., a `${...}` expression, an `@variable` reference) is silently
  ignored — these are static document metadata, not reactive content." "An empty-string value
  (e.g., `title=""`) SHALL be treated as if the attribute were absent — no head tag is emitted."
  "`title=` SHALL emit a `<title>` element in the document `<head>` if and only if the source
  markup does not already contain an explicit `<title>` element. … When an author-written
  `<title>` is present, neither the documentary `title=` nor the compiler's default
  basename-derived `<title>` is emitted." "Documentary attribute values SHALL be HTML-escaped on
  emission" and the fixed order "`<title>`, then the four `<meta>` tags in the order
  `description`, `application-version`, `author`, `license`".
- §23.2.1: "The compiler SHALL determine the language of a `_{}` block by resolving the `lang=`
  attribute of the closest ancestor `<program>` with that attribute set."
- §2959 (§66.3 neighbourhood): "**`date` / `timestamp`** (registered string-shaped primitives)";
  §53.x (E-CONTRACT-002): "Members with a runtime test are: the primitives, including `date` and
  `timestamp` (registered string-shaped primitives, tested as strings)".
- `mcp`: §4.12.2 lists it as an application-level `<program>` attribute; NO SPEC section says what
  it emits (gap filed).

Tests: `compiler/self-host-v2/slice-m4/program-attrs-s473.test.js` — 30 tests, **26 red on base** (29 / 25 measured; the 30th, the s437-r4 handler shape, was added with the E-STATE-UNDECLARED correction and is red on base by construction — base said "whole instance")
(the 4 green are twins: nested `title=` warning, no-`lang` carries none, unknown type still
E-TYPE-UNKNOWN, a real whole-instance write still refused).

## 2026-10-29T15:10Z — implementation

Note: the pre-commit hook runs the bootstrap slices when `compiler/self-host-v2/` is touched, so the
red-first tests could not be committed alone; the red count above was measured on base (4d5b9a15d)
before any source change, and the tests landed with the implementation.

- **core.scrml** — `CoreProgram` gains `head: CoreHead` (`HeadTitle` = Default | Documentary(text) |
  Author, plus `metas: CoreMeta[]`) and `lang: string | not`. `plainHead()` for hand-built Cores.
- **analyze.scrml** — `topProgramAttrDiags`: the five documentary attributes are read (no diag);
  `lang=` quoted → read, anything else → E-BOOTSTRAP-UNSUPPORTED (`langAttrDiag`); `mcp` → its own
  E-BOOTSTRAP-UNSUPPORTED naming the MCP server it needs. `resolveTypeName`: `timestamp` → `string`;
  the §53 named shapes → E-BOOTSTRAP-UNSUPPORTED by name (was E-TYPE-UNKNOWN). `placeAt`: a write to
  an `@name` that names no instance in scope → **E-STATE-UNDECLARED** (§6.1.1: "Bare `@x = expr`
  writes … without a prior `<x>` declaration in scope are **`E-STATE-UNDECLARED`**"), not the
  "whole instance" refusal. (First cut used E-SCOPE-001 to match the read; the conformance report
  showed the SPEC code is E-STATE-UNDECLARED — 3 s437-r4 cases went FAIL — so it was corrected; they
  now PASS. The read side's E-SCOPE-001 is filed: g-bootstrap-undeclared-cell-read-code-s473.)
- **lower.scrml** — `topProgramOf` (shared with `resetShips`), `headOf` (§40.7: literal non-empty
  values; `<title>` in the program's element tree → `Author`), `langOf`.
- **print.scrml / html.scrml** — the head's `<title>` from `CoreProgram.head` (none for `Author`);
  the metas lead the head after it. `Page.title` is `string | not`.
- **severity.scrml** regenerated (E-STATE-UNDECLARED is now used).
- **slice-m2/typer.test.js** — two §66.19 pinned lists re-pinned (the two "whole instance" writes
  there are writes to names not in scope → E-STATE-UNDECLARED). **slice-m4/program-shape.test.js** —
  `title`/`description`/`lang`/`mcp` left the generic-refusal loop; `<foreign lang>` beside
  `<program lang>` is now one code.

Gates so far: lint-no-default-arm, lint-duplicate-fn, slice m1 / m2 / m1-lowered / m3 / m4 / codec
all green. Conformance report regenerated: PASS 259 → 263 (+`foreign-lang-in-program-neg`, +3
`s437-r4-undeclared-cell-*` twins), FAIL 49 → 49, UNSUPPORTED 820 → 816.

Gaps filed: g-spec-program-mcp-attr-unspecified-s473, g-spec-timestamp-missing-from-canonical-type-list-s473,
g-bootstrap-title-elem-in-renders-not-seen-s473, g-bootstrap-undeclared-cell-read-code-s473.

## 2026-10-29T15:55Z — gates; flogence re-measured

snippet-gate caught two spec-ahead pins (README.md:27 tasks.scrml, docs/tutorial.md:1106
10-all-together.scrml) whose code list gained E-STATE-UNDECLARED: a write to a cell the refused
construct would have declared is now E-STATE-UNDECLARED instead of the "whole instance" refusal.
Pins updated.

Gates (CI `checks` steps, run locally): types-gate PASS · `bun test compiler/tests/*.test.js` PASS ·
snippet-gate PASS (after the pins) · claim-gate PASS · corpus-compile-floor PASS · md-shim PASS ·
conflict-marker PASS · SPEC-INDEX PASS · delta-lint PASS · s34-census --check-new PASS (no §34 row
changed) · severity --check PASS · bootstrap-conformance --check PASS · e2e-render-map PASS ·
bootstrap slice step (no-default-arm, duplicate-fn, m1, m2, m1 lowered, m3, m4, codec) PASS.

flogence measurement re-run (driver copied with S = this worktree; flogence untouched), vs the
REPORT's results.json: raw errors 9620 → 9597 (−23), twin 9608 → 9585; clean files 0 → 0. Every
changed diagnostic is one of this lane's: generic `<program lang/title/mcp=…>` refusal 24 → 0;
precise `<program mcp>` refusal 0 → 2; `timestamp` E-TYPE-UNKNOWN 1 → 0; "whole instance" 6 → 0;
E-STATE-UNDECLARED 0 → 6 (the same six sites, now named correctly); `if`-as-value 19 → 19 (B1
cascade, untouched). 23 of 31 files drop by one error; none becomes clean (each still holds B1/B2/
M1-class debt).

## 2026-10-29T17:30Z — fix round 1 (S239 review of ee6f18ebb, LAND-W-F/U)

Merged origin/main first (be9c783cb; severity.scrml conflict resolved by regenerating with
`gen-bootstrap-severity.ts`; known-gaps ids diffed: none lost; counts regenerated).

| finding | fix |
|---|---|
| F1 `timestamp` ≠ `string` (§66.3: a bare `timestamp` cell starts `not`, implicit `(not to T)`) | analyze `stampNoDefaultDiag`: a `timestamp` cell with no own value → E-BOOTSTRAP-UNSUPPORTED naming the lifecycle (§66.3, §14.12). With a value / as a param / as a field it stays a string. Comment in `resolveTypeName` corrected. Gaps: g-bootstrap-timestamp-canonical-empty-s473, g-spec-timestamp-number-vs-string-s473 (§51.11.4 "Number"). |
| F2 title detection | lower `isDocTitleTag` (case-insensitive) and `hidesTitle` (no recursion below `svg` / `textarea` / `noscript` / `template`). The title gap's text widened. |
| F3 author `<title>` only in the inert template until mount | gap g-bootstrap-author-title-only-in-template-s473 |
| F4 invented `@x = …` in the message | message now "`@x` is written here, but it is not declared …" (covers `@x.a = 1`, `bind:value=@x`) |
| F5 malformed twin fixture | `<card k:string="t"/>` + `renders …`, exact `toEqual(["E-BOOTSTRAP-UNSUPPORTED"])` |
| F6 `lang=""` carried as `""` | lower `langOf`: `""` is as if absent |

Tests: program-attrs-s473.test.js now 40 (10 new; 9 red against ee6f18ebb — the F5 fixture swap is a
twin). Gates: the bootstrap slice step, conformance --check (unchanged: PASS 263 / FAIL 49 /
UNSUPPORTED 816), types-gate, root tests, snippet, claim, corpus floor, md-shim, conflict-marker,
SPEC-INDEX, delta-lint, s34-census, severity --check, e2e-render-map — all PASS.
