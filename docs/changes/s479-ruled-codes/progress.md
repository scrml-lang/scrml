# s479-ruled-codes — progress

Ruling: user-voice-scrml.md "⭐ RULED — S478 hand-off §3.A and §3.B, PA recs adopted (S479, 2026-11-18)", items 1–4.

- [x] setup (branch s479-ruled-codes off origin/main 8341538ba), pretest, base corpus + conformance (PASS 645 / FAIL 12 / CRASH 0)
- [x] items 1–3: SPEC + known-gaps markers removed, provenance cites the ruling
- [x] item 4a: E-PAGE-DUPLICATE (SPEC §40.8 + §34; analyze.scrml pageDiags)
- [x] item 4b: `<match>` without a required `for=` → E-TYPE-024 / E-MATCH-FOR-REQUIRED (SPEC §18.0.1 + §34; analyze.scrml matchEnumFromOn)
- [x] item 4c: branch content-model stays W-HTML-001 (SPEC sentence)
- [x] conformance cases (9 new, impl#1 xfail → g-impl1-ruled-codes-s479), gen-bootstrap-severity, s34-census, claim/snippet/md-shim gates
- [x] corpus: 3152 files, 0 newly-rejecting, 0 newly-accepting, 7 code-set changes (one fewer E-BOOTSTRAP-UNSUPPORTED second report on undeclared `on=@cell`)
- [x] bootstrap conformance PASS 645 → 654, PASS→FAIL 0 (before the no-second-report tweak; rerun at end)
- [ ] commit (hook), types-gate, corpus-compile-floor, comp.sh, PR

Scratch: ~/.cache/scrml/review/s479-ruled-codes/

Note: E-FILE-SCOPE-LET-SERVER-WRITE is NOT emitted by the bootstrap (file-scope `let` refused by name, parse.scrml) — name confirmed in SPEC, emission not invented.
