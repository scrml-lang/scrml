# s482-seed-timing — progress

Lane: seed timing for Q12 (cells declared outside the body) and Q13 (locked field = constant seeded at
the instance's mount unless it reads a cell). Bootstrap-only (compiler/self-host-v2/), SPEC + gaps;
compiler/src/ frozen (S471). Base: origin/main 52eb72585 (contains #2096, model (c)).
Brief: ~/.cache/scrml/review/s482-briefs/seed-timing.md. Probes / harness:
~/.cache/scrml/review/s482-seed-timing/ (base worktree `base/` at 52eb72585).

## Rulings (verbatim, scrml-support/user-voice-scrml.md)

- Q12 — ruling:user-voice-scrml.md-S482-outside-cell-seed-time (~:22501): rec *"before the body, in
  link order"* — the same as the library's plain `let` / `const` initializers, even when nothing reads
  the cell; §66.6.4's lazy materialization keeps governing a declaration's shared instance, not
  top-level library cells. Owner: *"yes, before the body"*.
- Q13 — ruling:user-voice-scrml.md-S482-locked-field-derived (~:22506): *"a locked field is derived
  exactly when its initializer reads a cell, directly or through any function it calls, at any depth.
  Otherwise it's a constant, whose initializer is a seed computed at its place, meaning the instance's
  mount."* Owner: *"yes, derived only when it reads a cell"*.
- Model (c) (~:22539), rider Q13: *"a locked-field initializer that WRITES is E-VALUE-WRITES-STATE; the
  derived-iff-reads-a-cell half stands."* Owner: *"yes, adopt (c) with the riders"*.
- PRINCIPLE (S482): corpus usage is not evidence of what the language should do.

## Item A — what "the instance's mount" means for the #2096 r2 MED-A probes

z01 / z02 / z03 (`~/.cache/scrml/review/s482-2096-r2rev/p/`): the component INSTANCE `<card/>` /
`<cp/>` stands directly in the program body — an unconditional mount, which has a place in the body
(§7.6 R1: *"Every declaration, statement, display, attribute value and unconditional mount has one
place in the body. A cell's seed runs at its place."*). Only the DISPLAY of `v`
(`<b if=(@show)>${v}</b>`) is conditional. The instance mounts at load, when `n` is 1, so Q13's
*"a seed computed at its place, meaning the instance's mount"* gives `v` = 1 + 1 = **2**, and it is
never recomputed (a constant, §66.9 rule 1). The reviewer's "expected 2" is right.

The brief's alternative — an instance that is itself under `if=` — is a different shape: §66.7.6 rule
5 (O59) *"A conditionally-mounted instance, and an instance in an `<each>` row, gets its record AT
MOUNT, and a fresh record on each remount."* There the mount is when the branch shows, after
`n = 10`, so **11** is correct (probe z04). Same for an `<each>` row added by the click (z06 row 2:
11; row 1, mounted at load: 2).

Base (52eb72585) Chromium: z01 11, z02 11, z03 11 (wrong); z04 11 (right); z05 (displayed at load) 2;
z06 rows `11 11` (row 1 wrong); z07 (derived control, reads `@m`) 11 (right); z08 (a locked PROGRAM
cell after `n = 5`, before `n = 7`) 11 (ruling: 6, its place); z09 6; z10 (prop default `n + 1`) 11.

## Steps

- [ ] A. constant locked fields / prop defaults seeded at the instance's mount (print + runtime);
      locked program cells seeded at their place (lower View.Init + print held + analyze judgment)
- [ ] B. cells declared outside the body seeded before the body, in link order
- [ ] C. lift construct refusals that existed only because outside-cell seeds were lazy
- [ ] D. gaps resolved / INTERIMs recorded
- [ ] E. bwAny message (LOW-A)
- [ ] F. E-SCOPE-001 sentence check
- [ ] SPEC §6.15 / §7.6 / §66.6.4 / §66.9 / §66.7.6
- [ ] gates
