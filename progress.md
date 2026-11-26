# progress — s483-component-cell-server-only (lane scratch; removed before the PR)

- base origin/main c58d24b7c (contains #2121, merge 88edf1dd3)
- r0 WIP: print.scrml BodyCells generalized to every declaration (program + user); bodyCands adds
  component-body (FieldRole.Child, not use-site-given) cells; bodyAsConsts shells them in every
  instance, binding only in the classification (fin: none — "nothing runs its seed").
  lower.scrml: a program-cell reset / reset-on write is InitOf (MED-1); print initOfJs prints it
  inline (byte-identical) for Lexical(0); bodyWriteUse: Static write whose value is InitOf = write.
  b04: client clean, Chromium same.
- Per instance: the classification is per DECLARATION field — a read through any instance (own
  renders/handlers Lexical, as= handle, shared instance, <*x/>) keeps it client for all instances;
  otherwise every instance's field is the shell (`rt.seeded(() => null)`) and no artifact runs the
  seed (server holds no instance; no per-instance server run).
- r0 committed a6e5e502e (hook PASS 58633/0). Measured base c58d24b7c -> head, Chromium: L1 (lane c/ 31 + s483-body-cell 32 + s483-2121 x/imp 66) 129 programs: 128 equal values; c30 newly refused (INTERIM, widened like b11/b12); 20 no longer ship the secret, 0 newly do. L2 (#2113 sets s482-2113 + s482-2113-r2rev) 502: all equal, 0 leak changes. Server artifacts load: base 223/223, head 222/222.
- Sub-case "only server code reads a component cell": unreachable — a server fn reading @card.k is E-REACTIVE-003; an unread body cell seeded from it is the INTERIM refusal. Not decided.
- Props (attributes) not covered: c16/c17 still ship (gap to file).
- r0 docs: SPEC §7.6 rule (b) component sentence + 2 provenances; gaps resolved/new attr gap; Chromium file 4 pass; conformance 851/3/0, 0 verdict diffs; corpus 0/0/0
