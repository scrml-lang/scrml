# s473-boot-dup-fn-lint — progress (append-only)

Gap: `g-impl1-bootstrap-duplicate-fn-last-wins-s473` (found on s473-boot-exitless-loop, PR #1631; not on
main when this lane started, so filed here with the same facts, status resolved).

Policy: S471 — impl#1 (`compiler/src/**`) is frozen for semantics. No impl#1 change in this lane; the
check is a lint over the bootstrap's own sources.

## 2026-10-28 — startup

- Worktree `agent-aaeeae9eac0d84ea2`, branch `s473-boot-dup-fn-lint` from origin/main 69a3ed1d6.
- `bun install`, `bun run pretest` clean.

## 2026-10-28 — measured impl#1 behaviour (probe, ~/.cache scratch)

- Same-file duplicate (`fn dup` twice in b.scrml): no error, no warning. Both emitted
  (`_scrml_dup_2`, `_scrml_dup_4`); the caller and the file's export registry entry both bind `_scrml_dup_4` — LAST wins.
- `import { foo } from "./a.scrml"` + local `fn foo` in the same file: no error. Emitted as
  `const { foo } = _scrml_modules["a.client.js"]` + `function _scrml_foo_5`; calls bind to the IMPORT; the local is dead.
- **How the build links the files.** `slice-m1/harness.js buildBundleChunks` → `compileScrml` over the bundle
  entry + the module list. Each `.scrml` becomes its own chunk (an IIFE) registering
  `_scrml_modules["<file>.client.js"] = { …exports }`; a chunk sees another file's names ONLY through its
  `import`s, emitted as `const { a, b } = _scrml_modules["<file>"]`. Function names are chunk-local
  (`_scrml_<name>_<n>`). So there is no cross-file shared namespace: the only namespace a name can collide
  in is ONE FILE's top level = its functions + its import bindings. The lint checks exactly that
  (fn×fn, fn×import, import×import), per file.
- Base bundle (M2): exactly six names emitted twice in `analyze.client.js` and nowhere else:
  arrayElems, boolKey, fieldOfCap, isAbsentVT, isHtmlFact, isLambda.

## 2026-10-28 — the lint

- `scripts/lint-duplicate-fn.js`, patterned on `scripts/lint-no-default-arm.js` (impl#1's token lexer
  `compiler/native-parser/lex.js`; `--root`, `--json`; exit 0/1/2).
- Scope: every `.scrml` directly in `compiler/self-host-v2/`, every `.scrml` directly in a `slice-*` dir
  (bundle entries incl. `slice-m3/css-bundle.scrml`, and the `*.core.scrml` modules), plus their relative
  imports, transitively — 33 files. NOT the test-input programs (acceptance/, slice `src/`, fixtures,
  bench): a negative case may declare a duplicate on purpose. Note this differs from lint-no-default-arm,
  which walks the whole tree.
- Cross-check: the lint's top-level fn count equals a line-grep count on all 33 files.
- On base: 6 violations — the six pairs, nothing else (no fn×import or import×import collisions exist).
- Wired: CI `slices` job, the bootstrap slice step (right after lint-no-default-arm); the pre-commit hook's
  slice step (runs it right after lint-no-default-arm) and its slice TRIGGER list (+ `scripts/lint-duplicate-fn.js`,
  as lint-no-default-arm is); scripts/git-hooks/README.md.

## 2026-10-28 — the six pairs

For each: both definitions, every call site, which one each call site meant. Before the fix, EVERY call
bound to the later definition (measured on the emitted bundle).

| pair | defs (base lines) | call sites | verdict | behaviour change? |
|---|---|---|---|---|
| `isLambda` | :3060 `(k: AExprK)` match over the kind; :7025 `(e: AExpr)` = `lambdaBody(e) is given` | :3032 `retsInExpr` `isLambda(k)` with `k: AExprK` — meant :3060; :6356, :6883 `isLambda(lam)` with `lam: AExpr` — meant :7025 | rename :3060 → `isLambdaK`, call :3032 → `isLambdaK(k)` | YES at :3032. FIXES a bug: the AExpr version on an AExprK reads `k.k` (undefined), no arm matches, returns false — so `retsInExpr` never skipped a lambda and walked its body, counting a `return` inside it as the enclosing function's (retsIn's own comment: "A lambda's body is not walked (its `return` is not the function's)"). **Latent, not observable at the program level today:** a `return` can stand in a lambda only in a `{ … }` arm of a `match` that is the lambda's value, which the binder refuses first (analyze :10706, E-BOOTSTRAP-UNSUPPORTED "a `{ … }` arm … in a `match` whose value is used"), and the refusal blames the inference; probed 5 shapes (map/filter arm-block returns, a returned map, a plain map) — identical diagnostics base vs fixed. :6356/:6883 unchanged (they already got :7025). |
| `boolKey` | :20911 → `"b:true"`/`"b:false"`; :24590 → `"true"`/`"false"` | :20887 `litKey` `.Bool` — meant :20911 (litKey's convention: `n:`, `s:`, `v:` prefixes); :24569 `sqlParamKey` `.Bool` — meant :24590 | rename :20911 → `litBoolKey`, call :20887 → `litBoolKey(b)` | YES at :20887 (key spelling `"true"` → `"b:true"`), NOT observable: litKey is compared only with litKey (`shapeFix`: `litKey(v) == init`, `init = initKey(...)` → litKey), and no other litKey output is `"true"` or starts `b:`, so the equality relation is identical. Not a bug fix. sqlParamKey unchanged. |
| `arrayElems` | :8959, :18653 | :8927, :9144, :18634, :21482 | identical (binder names only) — merged, kept :8959, deleted :18653 | NO (same emitted body) |
| `fieldOfCap` | :17164 (documented), :20786 | :17179, :19506, :19659, :20799 | identical (nested `if` vs `&&` over the same test) — merged, kept :17164, deleted :20786 | NO |
| `isAbsentVT` | :16594, :17586 | :13170, :16568, :17526, :18618, :19988 | identical byte for byte — merged, kept :16594, deleted :17586 | NO |
| `isHtmlFact` | :13569 `(f: ElemFact)`; :26494 `(f: ElemFact \| not)` (+ `not :> false`) | :13397 (ElemFact), :13502, :26124, :26151, :26229, :26487 (`ElemFact \| not`) | same answer on every `ElemFact`; the later one also takes `not` — merged, kept :26494, deleted :13569 | NO (every call already ran :26494) |

Emitted-bundle check (M2 bundle, normalised for build id / runtime hash / impl#1's numeric suffixes):
only `analyze.client.js` differs from base, and only by (a) `_scrml_isLambda` → `_scrml_isLambdaK` at
its definition and the retsInExpr call, (b) `_scrml_boolKey` → `_scrml_litBoolKey` at its definition and
litKey's call, (c) the four deleted, never-called duplicate bodies. Every other chunk is identical.

## 2026-10-28 — tests

- `compiler/self-host-v2/slice-m1/lint-duplicate-fn.test.js` (9): the real tree is clean; the scope
  (bootstrap sources, not test inputs); fn×fn, fn/function/export, fn×import (`as` alias), import×import;
  not flagged in strings/comments/params/locals; body skipping; a scratch-tree bite (top-level file + a file
  a slice entry imports are linted, a `src/` test input is not; green after the fix).
  On origin/main all 9 are red (the script does not exist). With the script and base analyze.scrml: 1 red
  (the real-tree check, 6 violations).
- `compiler/self-host-v2/slice-m2/dup-fn-s473.test.js` (5): the emitted M2 bundle defines each function
  once — an oracle on impl#1's OUTPUT, independent of the lint's tokenizer (RED on base: six names);
  isLambdaK pins (the arm-block-return-in-lambda outcome, a plain lambda's proven return, the
  unproven control); litBoolKey pin (`@open = false` over `<open:bool=false/>` → reset-on=, `= true` → not).
  The four pins pass on base and after — they hold the "no observable change" verdict.
- Red on base (base analyze.scrml, this branch's tests): 2 (real-tree lint, emitted-bundle oracle).
