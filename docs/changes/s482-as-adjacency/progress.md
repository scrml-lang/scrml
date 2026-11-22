# s482-as-adjacency — progress

Lane: build the owner ruling (user-voice-scrml.md "RULED — `as.value`: adjacency decides",
ruling:user-voice-scrml.md-S482-as-adjacency): a `.` touching `as` is member access; a spaced
`as .V` stays the §14.12.6.2 bare-variant cast. Plus the #2058 review follow-ups (LOW-1..3, INFO-1).

Base: origin/main a7f50def5 (contains #2058).

## Log
- lex.scrml: `dotLastKind` — classifyCode reads `as` as a name for the `.` decision only when the
  `.` touches it (span.end == cursor pos). `/` after `as` unchanged. Probe: `as.value`,
  `as.f()`, `as.value.deep` lex Dot+Ident and compile/run; `a as .P`, `x as\n.V`, `as /*c*/.V`,
  `as //c\n.V`, imports unchanged.
