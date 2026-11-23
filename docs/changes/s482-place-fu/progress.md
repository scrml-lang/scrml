# s482-place-fu — progress

Lane: follow-ups from the #2079 review (PRE-2, LOW-1) and the #2078 review (LOW-1). Bootstrap-only.
Base: #2079 (s482-construct-init-fu) head f0281eca2, rebased onto origin/main once #2079 merged.

- [x] item 3 (#2078 LOW-1): E-TYPE-044 on a `not` inside a wildcard alternation — analyze plainMatch
      `notNamed` (FPlain notArm only). Test: slice-m4/e-type-044-wild-alt-s482.test.js.
- [ ] item 2 (#2079 LOW-1): constructWrites — a cell seed counts only when it runs between the
      construct's start and the initializer.
- [ ] item 1 (#2079 PRE-2): an initializer in `<textarea>` / `<title>` (and every other element whose
      content holds no place) runs just before the element; SPEC §7.6 rule (b) amended.
- [ ] gates
