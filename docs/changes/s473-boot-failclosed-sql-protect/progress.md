# s473-boot-failclosed-sql-protect — progress

Bootstrap security lane (S473): turn silent-accept holes found by the read-only SPEC coverage
audit (part 2 + part 3) into loud refusals on the bootstrap (compiler/self-host-v2). impl#1 frozen,
untouched.

## Items → code → test (all in compiler/self-host-v2/slice-m4/failclosed-sql-protect-s473.test.js
## unless noted; red on base 741a2b51c — 26 fail / 8 near-miss pass — green on head)
1. §14.8.10 undeclared `tenant_id` table served (probe s148/t1) — DONE.
   - item (2): scripts/scrml-boot.ts `tenantScan` — every SQLite file that exists at compile time is
     scanned (`table_xinfo`, tables + views) → E-TENANT-UNDECLARED. INTERIM, wider than the SPEC
     (which opens only `<db src>` files; `<program db=>` is the startup check's).
   - item (3): slice-m1/runtime/server-runtime.js `tenantGate` — every request 503 while a database
     holds a `tenant_id` relation or cannot be inspected; E-DEPLOY-DB-TENANT-UNDECLARED logged once
     per finding; `/_scrml/health` 503 + count, re-checks; backoff 1 s → 30 s. print-server.scrml
     hands the connections to `rt.server`. Test hosts answer `host.tenantRelations`.
2. §14.8.9 / §52.3 type-level `protect=` emitted as HTML (probe s148/t10) — DONE. analyze.scrml
   resolveElem: a capitalized tag that names no declaration and is not an HTML element name →
   E-BOOTSTRAP-UNSUPPORTED (with a §52.3 attribute) / E-COMPONENT-035 (without). resolveHtml:
   `protect=` / `authority=` on any element → E-BOOTSTRAP-UNSUPPORTED.
3. §8.1.2 E-SQL-MULTIPLE-STATEMENTS (probe s8/multi) — DONE. sql.scrml `multiStatement`: scanSql
   tokens when it reads the whole text; else the closed-lexical-subset reader `subsetRead` (admits
   only `-- ` / non-nesting non-executable `/* */` comments beyond scanSql); else the plain split
   (fail closed, says so).
4. §8.9.2 / §19.10.5 implicit envelope unbuilt (probes s8/envelope, p3/p19-tx) — DONE. analyze.scrml
   `envelopeDiags`: a `!` function with ≥2 `?{}` not `.nobatch()` → E-BOOTSTRAP-UNSUPPORTED (the
   SPEC's trigger, not "any write": one query needs no envelope).
5. §19.10.4 / §19.10.6 manual BEGIN in `!` fn ungated (probes s8/manual, p3/p19-manualtx) — DONE.
   `envelopeDiags`: transaction control in a `!` function → E-BOOTSTRAP-UNSUPPORTED; outside `!` it
   was already E-ERROR-015, so no server function admits it.
6. §14.8.10 item (1) program-body allow-list (probe s148/t3) — DONE. sql.scrml `programStatement` →
   E-SQL-PROGRAM-STATEMENT-NOT-ADMITTED / E-TENANT-UNDECLARED (tenant set empty on the bootstrap).
7. §12.2 T3 server-only stdlib import — DONE. analyze.scrml `isServerOnlyStdlib` (the SPEC's S299
   evaluation) refused at the import; slice-m4/server-only-stdlib-s473.test.js re-derives limb (a)
   from stdlib sources and checks impl#1's ESCALATION_SERVER_ONLY_MODULES is covered. Stale comment
   at analyze.scrml placePass header fixed.

## Corpus delta (conformance/cases + samples + stdlib, 2787 files, bootstrap compileSource)
base ok 68 → head ok 67. Newly refused: 1 — conformance/cases/components/post-ce-residual-component-reject
(`<program><Unknown/></program>`, expects E-COMPONENT-035: a FAIL case that now PASSES). 84 already-
failing files gain/lose codes (E-COMPONENT-035, the new SQL codes; a few E-SCOPE-001 nested under an
unknown capitalized tag replaced by E-COMPONENT-035). 0 artifact changes. bootstrap-conformance:
PASS 263 → 264, FAIL 49 → 48.

## Log
- branch cut from origin/main 741a2b51c; baseline measured.
- compiler side + host scan + runtime gate committed; error-rulings tests updated for the
  newly-rejecting shapes (E-ERROR-015 tests now also see E-SQL-MULTIPLE-STATEMENTS / NOT-ADMITTED).
- gaps: owned by PR #1673 (s473-spec-coverage) — narrow them here after it lands.
