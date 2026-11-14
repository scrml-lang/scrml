# s477-boot-compile-perf — BRIEF (TASK verbatim)

change-id: `s477-boot-compile-perf`. scrml repo, BOOTSTRAP compiler (`compiler/self-host-v2/`, written in scrml). Performance only — output MUST stay byte-identical.

## POLICY
Bootstrap only; no `compiler/src/` changes. No semantic change at all: every program must produce byte-identical artifacts and identical diagnostics. Do not hand-edit generated blocks.

## TASK
A real adopter app (~2,300–2,700 lines) takes 10–18 s to compile on the bootstrap; compile time is super-quadratic in file size (measured: 234 lines 0.16 s · 464 0.40 s · 924 1.65 s · 1,844 11.4 s · 2,312 10.7 s · 2,720 18.1 s). A CPU profile of the 2,312-line file puts 9.6 of 12.3 s in `walk.allNodes` (8.3 s self), driven by functions that walk the whole program once PER ITEM they check:
- `compiler/self-host-v2/check.scrml` `onceBoundInit` (~:4976), reached via boundValue → checkWrite per tape-replace write (~4.8 s)
- `compiler/self-host-v2/print.scrml` `isParam` (~:2731) and `reinitUsed` (~:3038), each once per declared field from factoryJs (~2.1 s each)
- lexing `cursorAt`/`advance1` ~1 s (secondary).
(Loci from the previous lane's profile — verify with your own profile.)
1. Baseline: run `gen-big.ts` scaling sizes (234…~3,700 lines) + the two adopter-sized inputs. Adopter files: `~/projects/lotto-analyzer/analyzer.scrml` (2,720 lines; imports `./data/colorado-lotto-plus.scrml`) and `~/.cache/scrml/s476-boot-tape-inplace/r26/` (2,312-line version) — READ ONLY: copy into your lane's scratch dir to compile; never write into `~/projects/lotto-analyzer`. Record one-shot compile times + a cpuprofile summary.
2. Fix at the root: build each per-program index ONCE (e.g. let-binds by symbol, constructed fields by declaration, `InitOf` uses by declaration+field, param sets) and pass/memoize it, replacing per-item whole-program walks. Then re-profile and take the next hotspot; repeat while there is a hotspot worth > ~10% of compile time. Lexer `cursorAt` O(n) position recomputation is fair game if it shows up.
3. Byte-identity gate (mandatory): compile the entire bootstrap conformance corpus + all bootstrap test fixtures + the generated sizes + both adopter inputs with base and head; diff every artifact and diagnostic stream; must be zero diff. Commit the comparison script.
4. Add a scaling regression test that bites: e.g. compile a generated ~1,800-line program and assert time grows < ~2.5× when the input doubles (choose a robust ratio-based assertion, not absolute ms; prove it fails on base).
5. Report before/after table (sizes + adopter files) and the profile summaries.
