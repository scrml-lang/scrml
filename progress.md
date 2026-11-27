# progress — s483-attr-trap (lane; ruling:user-voice-scrml.md-S483-dropped-attr-trap)

Base: origin/main 353ffe643 (contains #2130). Branch s483-attr-trap.

## Findings at start
- #2129 (trapSiteWhat / ownTrapSites) is NOT on main (PR open, r1 in flight). Its analysis runs on
  analyze's AExpr; the printer works on Core. Nothing to reuse on main; the brief forbids a
  parallel trap classifier. Decision: a dropped value is kept (run in the client) when it reaches
  nothing server-only and is not a bare literal (a literal is the one value the printer knows
  cannot trap without a classifier). Narrowing to "can trap" waits on #2129's printer-side trap
  facts (its r1 item 6). Noted INTERIM in the gap.
- Per-value judgment: each value of a mixed server-only component field is judged ALONE as the
  field's binding by the same serverInits classification (no second classifier); a confirm
  classification with the kept values in the client must reproduce the same server-only set,
  else fall back to dropping all (fail closed: secure, trap lost).
- A kept DEFAULT stays the field's seed; an instance whose own value was dropped then passes
  `not` explicitly so it does not run the default (base never ran it there).

## Log
- 8499106da print.scrml keptVals/ValPick/Drop. r12g/i/j trap on head as on base (pre-#2130); r12c/d/h unchanged vs main; r12f unchanged. k01-k09 extra probes base==head.
- slice-m4/dropped-value-trap-s483.test.js: 4/4 head; 2 fail on main (red before).
- LOW-1: outerRefusal(p, orig) names the dropped use-site reader (a52 -> `<card>.t`); a54 unchanged. slice test 5/5.
- INFO-1 root cause: lower.scrml rendersFields made the kidFields call namedFields already made (use mode) -> 2^depth. Fixed (return early when !sub.live). chain25 main 12.5s -> head 0.48s; chain30 0.58s; chain40 0.77s; chain50 1.1s. keptVals skips classification when <=1 non-literal value.
- SPEC §7.6 rule (b): struck + restated the three sentences (component cell 'running the seed', attribute 'not running them', provenance 'no gain'); new provenance (S483 dropped value that can trap). Gaps: g-boot-dropped-value-trap-s483 (LOW open PERMANENT), g-boot-attr-forward-compile-exponential-s483 (resolved), g-boot-use-site-value-cycle-stack-overflow-s483 (LOW open).
