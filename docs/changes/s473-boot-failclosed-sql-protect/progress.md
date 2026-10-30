# s473-boot-failclosed-sql-protect — progress

Bootstrap security lane (S473): turn silent-accept holes found by the read-only SPEC coverage
audit (part 2 + part 3) into loud compile-time refusals on the bootstrap (compiler/self-host-v2).
impl#1 frozen, untouched.

Corpus baseline (conformance/cases + samples + stdlib, base 741a2b51c): 2787 files, 68 compile ok.

## Items
1. §14.8.10 undeclared `tenant_id` table served (s148/t1) — pending
2. §14.8.9/§52 type-level `protect=` emitted as HTML (s148/t10) — pending
3. §8.1.2 E-SQL-MULTIPLE-STATEMENTS (s8/multi) — pending
4. §8.9.2/§19.10.5 implicit envelope unbuilt, not refused (s8/envelope, p3/p19-tx) — pending
5. §8.9.2/§19.10.6 manual BEGIN in `!` fn ungated (s8/manual, p3/p19-manualtx) — pending
6. §14.8.10 item (1) program-body `?{}` allow-list (s148/t3) — pending
7. §12.2 T3 server-only stdlib import escalation unbuilt — pending

## Log
- branch cut from origin/main 741a2b51c; baseline measured.
