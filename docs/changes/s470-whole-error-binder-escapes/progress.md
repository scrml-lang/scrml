# progress — s470-whole-error-binder-escapes

- 2026-10-24 start: worktree verified at base 915b6775f; bun install + pretest ok.
- 2026-10-24 REPRODUCED on base 915b6775f (run.mjs + r6a/r6b copied to scratch): r6a 33 FAIL, r6b 7 FAIL (r6b library-import case UNJUDGED: harness gap).
  Escape 1 (shadowed callee): fullstack/library/tool `shadow const arrow`, `shadow let fn`, `shadow arm-local const/fn`; all sides `shadow nested param`; library/tool `fn shadowed in fn by const`; r6b `import check + nested local check`, `top-level const check + nested fn check`, `fn declared after shadow param in fn` (lib/tool).
  Escape 2 (log inherited): `fn body log param` (server, library), `fn body local log` (server, fullstack, library; tool PASS-500).
  Escape 3 (ctor residual): `ctor data member` all 4 sides; `ctor extract match`, `ctor extract dot ctor`, `ctor extract match eq` (server, tool).
- 2026-10-24 DONE escapes 1+2 (type-system.ts): audit ctx now carries the LEXICAL scope + declaration frames;
  callee resolved via the existing `resolveFnBinding(name, scope, forExact=true)` (exactly one decl, else refuse);
  a name any frame declares (arm body, re-parsed nested body, callee params/body) is refused; callee body audited
  in its decl scope with its own frames; `log` builtin recomputed per body (auditLogIsBuiltin), and never the
  builtin if the file declares/imports `log` anywhere. r6a 33 -> 10 FAIL (all 10 = escape 3), r6b 7 -> 0.
  Locus hypothesis HELD (auditBinderCallArgs / auditWholeErrorBinderText).
  NEXT: escape 3.
