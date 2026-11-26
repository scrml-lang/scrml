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
