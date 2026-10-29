# s473-stdlib-bootstrap-clean — AFTER (re-measured)

Same driver and method as `baseline.md` (`measure.ts`; per-module table with codes: `after-table.md`;
raw JSON `~/.cache/scrml-agent-tmp/s473-stdlib-bootstrap-clean/after.json`).

**Headline: 2 clean (math, random) / 35 errors / 0 crash / 16 not-supplied (scrml:compiler*).**
Error diagnostics (closure counts, all 37 measured modules): **2,775 → 2,220** (−556, −20%).
md is untouched (709 → 709; dual-compiler constraints, see below).

## Before / after per module

| module | before | after | what changed |
|---|---|---|---|
| auth | 8 | 7 | wrapper |
| auth/flows | 45 | 37 | wrapper, `;` |
| auth/jwt | 84 | 73 | wrapper, `;` |
| auth/password | 7 | 5 | wrapper, `;` |
| cron | 21 | 18 | wrapper, `;` |
| crypto | 17 | 15 | wrapper, `;` |
| data | 12 | 11 | wrapper |
| data/form-for | 6 | 4 | wrapper, `;` |
| data/messages | 9 | 6 | wrapper, `;` |
| data/parse | 4 | 2 | wrapper, `;` |
| data/schema-for | 3 | 2 | wrapper |
| data/table-for | 8 | 7 | wrapper |
| data/transform | 284 | 204 | `;` (wrapper KEPT — unwrapping adds a new impl#1 code: its `~{ import }` is emitted into the body; see gaps) |
| data/validate | 148 | 121 | `;` (wrapper KEPT) |
| format | 174 | FMT_AFTER | wrapper, `;`, params annotated (§7.3.2 defaults); bodies kept EXACTLY the shim's (`||` fallbacks, `!str`, `String()` — fix round 1, MED-1) |
| fs | 64 | 40 | wrapper, `;`, params annotated |
| host | 6 | 4 | wrapper, `;` |
| http | 21 | 13 | wrapper, `;` |
| **math** | clean | **clean** | — |
| mcp | 4 | 4 | none (wrapper KEPT — unwrapped, impl#1 emits it as a classic script with top-level bindings: host-global R3) |
| md | 709 | 709 | untouched |
| oauth | 89 | 67 | wrapper, `;` |
| oauth/discord | 23 | 18 | wrapper, `;` |
| oauth/github | 27 | 21 | wrapper, `;` |
| oauth/google | 51 | 38 | wrapper, `;` |
| oauth/microsoft | 35 | 27 | wrapper, `;` |
| oauth/pkce | 29 | 20 | wrapper, `;` |
| path | 84 | 45 | wrapper, `;`, params annotated |
| process | 30 | 19 | wrapper, `;` |
| **random** | 28 | **clean** | ported: `import:host` wrappers (stdlib/random/host.js), typed params, `~{}` → slice-m4 test |
| redis | 6 | 5 | wrapper, `;` |
| regex | 65 | 63 | `;` (wrapper KEPT) |
| router | 56 | 38 | wrapper, `;` |
| store | 5 | 4 | wrapper |
| store/kv | 175 | 129 | wrapper, `;` |
| test | 105 | 94 | wrapper, `;` |
| time | 333 | 232 | wrapper, `;` |

impl#1: every stdlib file compiles with the same or fewer error codes than on base, in the default
and the library mode (`impl1-check.ts`, base run with base's stdlib checked out in place); random
and host improved. The stdlib unit tests and the full impl#1 suite pass (pre-commit hook).

## What still blocks the stdlib on the bootstrap — ranked by modules blocked

Counts are from `after.json` (own-file diagnostics). "Program" = fixable in the stdlib source;
"bootstrap" = a missing bootstrap feature. Sizes: S < a day, M a lane, L several lanes / a design.

| # | blocker | modules blocked | kind / size | gap |
|---|---|---|---|---|
| 1 | **Host reach beyond a scalar, isomorphic `import:host` wrapper** — host method calls (148 sites) and host-object member reads (123 sites): `process.*`, `require("node:fs")`, `Bun.*`, `new Intl.*`, `RegExp` handles, `Date`, `crypto.subtle`, timers. Needs the F3 typed host binding in the bootstrap (`<host>` block, `-> waiting T`, `! HostError`, closed `:host` handles — ruled S473 item 4), SERVER-side host bindings for node-only modules (ruled S473 r2 item 3: compiler-bundled stdlib only), and §21.3.1.1 crossing beyond scalars (tape / struct / enum / void results). A node-only host file cannot be an `import:host` module today: BOTH artifacts import it, so the client would load `node:fs`. | 17: auth/jwt, cron, crypto, data/transform, data/validate, format, fs, http, md, oauth/*, path, process, regex, router, store/kv, test, time | bootstrap, **L** (already sequenced: "F3 `<host>` in the bootstrap + a compiler-bundled `scrml:process`", S473) | g-boot-no-host-bridge-s471 (narrowed) |
| 2 | **Parameters with no writable scrml type** — after this lane 231 unannotated sites remain in 27 modules. Some are plainly typable and simply not done here (scalar strings / numbers in time, router, cron, crypto, oauth); the rest have no type to write today: any-valued (`assertEqual(actual, expected)`, `hash(algorithm, input)`), function-valued (handlers, thunks — `safeCall`, `schedule`, `onNavigate`, `debounce`), open host option records (`Intl` / `fs` options), type arguments (`parseVariant(json, T)`, `schemaFor(StructType, …)`). | 27 | program (typable part, S per module) + bootstrap/design for the rest: function values (L, g-bootstrap-function-values-slice-s451), generics (R1 deferred, not ruled), host option records (F3) | — |
| 3 | **`async function`** — a stdlib function that waits (§13.2 auto-await; the impl#1 export seed reads the `async` keyword). The bootstrap parser stops at `async`. | 10: auth/jwt, auth/password, crypto (`hmac`), host, http, mcp, oauth, oauth/pkce, redis, time | bootstrap, **M–L** (rides on F3 `-> waiting T`) | g-boot-async-stdlib-function-s473 (new) |
| 4 | **File-scope `const` with a struct / call / payload-variant initializer** | 9: auth/flows, auth/jwt, data/validate, format, http, oauth, regex, store/kv, time | bootstrap, M | (existing: g-boot-logic-block-const-s472 built literal-only) |
| 5 | **Function values** — arrows outside `.filter`/`.map`, braced-body arrows, callbacks | 8: data/transform, format, fs, oauth/google, router, store/kv, time (+ every handler param of #2) | bootstrap, L | g-bootstrap-function-values-slice-s451 |
| 6 | **`~{}` inline test blocks** | 8: data/transform, data/validate, format, fs, path, process, regex, store/kv | program, S per module (move the assertions to JS tests — the math / random precedent); a bootstrap `~{}` (§19.12) would be M | g-boot-test-block-s473 (new) |
| 7 | **Default (§7.3.2) and rest parameters** — the bootstrap reads `p: T = v` / `...xs: T[]` as extra unnamed parameters | 3 measured (format, path, fs — the annotated ones); every optional-argument API once annotated (time, router, test, http, oauth …) | bootstrap, **M** | g-boot-param-default-and-rest-s473 (new) |
| 8 | **`export { … } from "…"` re-exports** (§21.4) — the barrel modules | 4: auth, data, oauth, store (and each needs its targets clean too) | bootstrap, S–M | g-boot-reexport-from-s473 (new) |
| 9 | **Compiler-intrinsic stdlib functions** (`parseVariant`, `schemaFor`, `formFor`, `tableFor`, `registerMessages` / `messageFor` over `_scrml_*` runtime registries) | 5: data/parse, data/schema-for, data/form-for, data/table-for, data/messages | bootstrap, M each | g-boot-stdlib-intrinsic-fns-s473 (new) |
| 10 | **Compound assignment, counted-head counter writes, `while`** | 4 (+ md's 40 `while`): auth/jwt, data/transform, oauth/pkce, router | program, S (rewrite `x += 1` → `x = x + 1`, `while` → bounded `for`) | — |
| 11 | **`throw` / `try`** (impl#1 E-THROW/E-TRY-NOT-IN-SCRML too) | 3: auth/flows, oauth/pkce, test | program, M (the `!` / `fail` error model — an API change per function) | — |
| 12 | **md** — dual-compiler: impl#1 generates the shipped shim from this source (`gen-md-shim`), the ruled bootstrap spellings are not on impl#1 | 1 (md) | owner sequencing (S473 item 4: "impl#1 learns `div` / `T.parse` / `.append`") | g-boot-stdlib-none-compiles-s471 (correction S472) |
| — | `scrml:compiler*` — not supplied to the bootstrap at all | 16 files | KNOWN-DEFERRED §41.17 | — |

**Smallest next unblocks** (a module goes clean only when ALL its blockers go): none of the remaining
35 is one S fix away. The closest are mcp / redis / host / auth/password (only `async` + one param),
which ride on #3; format needs #1 (Intl through `import:host` — client-safe, scalar except
`formatList`'s tape and `formatNumberAdvanced`'s options) + #6 + #7.
