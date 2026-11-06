# s475-boot-tooling-hardening progress

- 2026-11-05T19:29:19-07:00 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ac9e430a4551cb0e1; pretest exit 0; base 9eeb6604e
- 2026-11-05T20:05 items 1,2,3,5 implemented: scrml-boot writeOutputs through held dirs (/proc/self/fd) + temp+rename + `wx` writeNewFile; lsp-boot per-URI path cache + first-opened owner for URI aliases. Race, 2000 writeOutputs calls: base writes-escaped 502-676, deletes-escaped 2-6 (3 runs); head 0/0 (3 runs); fallback path forced: 0-1 writes.
- 2026-11-05T20:50 item 4: NAMED_CODES += E-PARSE-ATTR, E-PARAM-TYPE-REQUIRED, E-SCOPE-010 (3 pins re-pinned with names); unnamed E-PARSE-* counts are a ceiling (1..N). sweep3: base hid 186/544 (1 pin-blind), head 185 (0 pin-blind). claim-gate + snippet-gate pass. Gap entries marked resolved; new INTERIM gap g-boot-output-race-non-linux-fallback-s475.
