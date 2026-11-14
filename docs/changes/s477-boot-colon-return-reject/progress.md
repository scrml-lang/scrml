# progress — s477-boot-colon-return-reject

- start: base origin/main b5c4ce70f + PR #1839 branch (7778a8435) merged (ff); install + pretest OK
- repro at base: every context (`): T`, `) : T`, `):T`, newline `: T`) errored with an UNNAMED `E-PARSE-EXPECTED expected {` + cascade — no silent drop reproduced via `scrml-boot compile`
- parse.scrml parseFn: `:` after `)` (or after `!`) → E-PARSE-FN naming `->`, the type read + kept, no cascade; hostBindLine: `: T` → E-HOST-BINDING-MALFORMED naming `->`
