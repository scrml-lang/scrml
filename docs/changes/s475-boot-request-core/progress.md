# s475-boot-request-core progress (append-only)

- 2026-11-05 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-ad8c313a3307b1987 (base 16ffdaee8 = origin/main). Maps read: primary + bootstrap (route "add a lowering"). pretest OK.
- 2026-11-05 baseline corpus hash (2185 files: acceptance, slice-m2/m4 src, examples, conformance/cases; 183 compile clean) taken before any edit.
- 2026-11-05 Core View.Request + RequestState (core.scrml); arms in walk/measure/lower/check/print; C-R1 in check.scrml; requestJs in print.scrml; rt.requestOn in runtime.js; tests slice-m1/request.runtime.test.js (11) + request.core.test.js (6, hand-built and SLICE_CORE=lowered). Mutations: no-cancel -> 2 RED; failure-runs-then -> 1 RED. Gap g-boot-request-read-abort-owed-s475 filed.
- 2026-11-05T23:29:48-07:00 r1 start at /home/bmacs/scrmlMaster/scrml/.claude/worktrees/agent-abc9cc3358269307d (branch s475-boot-request-core-r1 from dfeeb6fc5, merged origin/main f4dcbc8e1). F1/F2 (C-R1 self-trigger + transitive-write refusals), F3 (RequestState all-four, handle, stale from data), F4 (host-error reset), mount:false+deps=[] refusal, stats.requests; request tests extended with the adversarial repros.
