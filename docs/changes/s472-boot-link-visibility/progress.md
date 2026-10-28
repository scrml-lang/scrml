# progress — s472-boot-link-visibility

Closes `g-boot-flat-link-namespace-s471` (docs/known-gaps.md): the bootstrap
(`compiler/self-host-v2/`) linked every file into one namespace, so the
export/import boundary was not enforced at use sites.

## SPEC sentences implemented

- §21.3: "Named imports (`{ name }`) and default imports (`name`) from `.scrml` files SHALL
  be resolved by the compiler against the exporting file's export list."
- §21.3: "Importing a name that is not exported by the target file SHALL be a compile error
  (E-IMPORT-004 …)." (already enforced at the import since s471; kept)
- §3 / scope rules (SPEC.md ~1900): "An unquoted identifier that cannot be resolved SHALL be a
  compile error (E-SCOPE-001)." — a name declared in another file and not imported here is
  unresolved here.
- §14.1.2: "Every type name in a type-annotation position SHALL resolve to a *defined* type: a
  built-in …, a type declared in the same file …, or an imported type (§21.8)."
- §41.7: "When an `import` statement imports a name that is already in scope from another
  `import` statement in the same file, the later import WINS and a W-IMPORT-001 warning is
  emitted."
- §7.6: "Re-declaring a name … when that name was already declared at file scope SHALL be a
  compile error (E-SCOPE-010: duplicate binding in file scope)." — read as covering an import
  and a declaration of one name in one file (SPEC does not say it of imports in words; see NOTES).

## Log

- start: branch s472-boot-link-visibility from origin/main 94ec8e735; bun install OK.
- tests first: slice-m4/visibility-s472.test.js (21) + fixture stdlib src/stdlib-s472/vis.
  Red on base: 15 fail / 6 pass (the 6 are positive regression pins) —
  ~/.cache/scrml-pa/s472/red-base.log.
