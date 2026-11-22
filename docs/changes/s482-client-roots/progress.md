# s482-client-roots — progress

Branch `s482-client-roots` from origin/main 3e539ae73 (contains #2053).

## Item 1 — g-boot-dead-client-fn-ships-server-const-s481 (MED)
- Locus confirmed: print.scrml printProgram clientRoots + bodyInits / serverInits croots — every non-server-only fn was a client root, reached or not.
- Fix: print.scrml `clientLiveFns` / `clientFnRoots` — client roots are the declarations, channel onclient hooks, CSS bridge reads, and the initializers of unread acting bindings; closure through calls / FnRef / bindings. Unreached fns are dropped from the client artifact. Tool programs keep every fn.
- Probe x1-dead-client-fn: base ships `zz-sk-live-123` + `function dbg`; head ships neither.

## Item 2 — g-boot-server-only-init-no-server-artifact-s481 (LOW)
- pending
