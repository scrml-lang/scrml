# s482-handler-reach — progress

Gap: g-boot-handler-reach-runs-binding-early-s482 (MED). Brief: ~/.cache/scrml/review/s482-briefs/handler-reach.md.
Scratch: ~/.cache/scrml/review/s482-handler-reach/ (base = archive of the #2063 head; head = this worktree; h/run.sh Chromium harness).

- [ ] wait for #2063 (s482-seed-reach) on origin/main (developing on its head meanwhile; print.scrml untouched by it)
- [ ] base probe values (Chromium)
- [ ] fix: print.scrml reachOf skips code that runs after the mount (handlers, bind write-back, request bodies); effects unchanged
- [ ] tests slice-m4/handler-reach-s482.test.js (red on base, green on head); seed-reach-s482 handler test 1 -> 5
- [ ] gates; gap record; PR
