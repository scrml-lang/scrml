// scaffold-cells.js — s478 (E-DG-002, SPEC §34 row (§31, §22.6), Warning: "a reactive `@variable`
// is declared but never consumed — no reader edge in any render or logic context … Resolution:
// remove the unused cell, or prefix with `_` to suppress").
//
// Many suites build their programs from a SHARED scaffold — a block of cell declarations that some
// cases read and others do not. A case that does not name a scaffold cell at all has no use for it,
// so its program should not declare it: these helpers drop exactly those declarations. A cell the
// case does name stays — if the case only writes it, the case reads it or `_`-names it itself.
// Nothing here looks at diagnostics; it only decides which declarations a program carries.

/** The cell a scaffold line declares (`let <n:int=0/>`, `<xs:int[]=([1])/>`, `<r=(@b)/>`), or null. */
export function scaffoldCell(line) {
  const m = line.match(/^\s*(?:let\s+)?<([A-Za-z_]\w*)[:=]/);
  return m ? m[1] : null;
}

const named = (name, text) => new RegExp(`@${name}\\b`).test(text);

/**
 * `src` with each line of `scaffold` (a newline-separated declaration block, or an array of lines)
 * whose cell nothing else in `src` names emptied. A line of `src` that is not one of the
 * scaffold's cell lines is never touched, so a case's own declarations are kept as written.
 */
export function dropUnnamedScaffold(src, scaffold) {
  const lines = new Set((Array.isArray(scaffold) ? scaffold : scaffold.split("\n")).filter((l) => scaffoldCell(l) !== null));
  // A dropped line is left EMPTY, not removed, so every later line keeps its number (a runtime
  // location like `t.scrml:7` is unchanged). To a fixed point: a dropped derived line
  // (`<dbl=(@n * 2)/>`) may have been the only use of another.
  let all = src.split("\n");
  for (;;) {
    let dropped = false;
    all = all.map((l, i) => {
      if (!lines.has(l)) return l;
      const rest = all.slice(0, i).concat(all.slice(i + 1)).join("\n");
      if (named(scaffoldCell(l), rest)) return l;
      dropped = true;
      return "";
    });
    if (!dropped) return all.join("\n");
  }
}
