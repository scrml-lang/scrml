# progress — s477-boot-colon-return-reject

- start: base origin/main b5c4ce70f + PR #1839 branch (7778a8435) merged (ff); install + pretest OK
- repro at base: every context (`): T`, `) : T`, `):T`, newline `: T`) errored with an UNNAMED `E-PARSE-EXPECTED expected {` + cascade — no silent drop reproduced via `scrml-boot compile`
- parse.scrml parseFn: `:` after `)` (or after `!`) → E-PARSE-FN naming `->`, the type read + kept, no cascade; hostBindLine: `: T` → E-HOST-BINDING-MALFORMED naming `->`
- corpus (conformance + samples + examples + stdlib, 2884 sources, scrml-boot compile before/after): 0 newly failing, 0 newly passing; 6 samples (gauntlet-s19 phase1/2/4) change codeset: cascade -> E-PARSE-FN
- tests: slice-m4/colon-return-s477.test.js 28/28; slice-m4 5796 pass / 0 fail / 113 skip
- conformance fn/return-colon-spelling-neg: bootstrap PASS; impl#1 XFAIL on g-impl1-colon-return-accepted-s477 (status carried — runner refuses an xfail on a deferred gap, S430 P7); impl#1 1736/1840, 104 xfail
- host-global-scan 1/2, 2/2 exit 0, nothing pinned
- bootstrap conformance: PASS 317 · FAIL 253 · NOT-TWINNED 624 · UNSUPPORTED 646 (of 1840)
- SPEC §34 E-PARSE-FN row names the colon-return limb
