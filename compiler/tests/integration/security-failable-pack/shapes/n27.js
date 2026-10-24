// Probe family `n27` — S469 (g-keyed-row-control-flow-if-not-reevaluated-s469): a control-flow `if`
// STATEMENT that gates content inside a keyed (reconciled) `for … lift` row. Main built the row once per
// key and read the `if` once: a revoke through a cell (`if (@pw == "secret")`), a same-key replace of the
// row, or an in-place write of the row's field left the gated content in the page.
//
// Positions: the `if` among the row's ROOTS (sole root, beside a sibling root, if / else, else if,
// nested, around a nested loop, an early `continue`) and the `if` inside an ELEMENT of the row (plain,
// if / else, nested, around a nested loop, two elements deep, in one root of a multi-root row, between
// sibling elements). Revokes: a cell; a cell, then a reorder in a SEPARATE handler run (a later timer
// turn — the shape #1529's review found one-run probes miss); a reorder, then the cell revoke; a same-key
// replace; an in-place field write; an in-place write, then a reorder; a cell revoke, then a remove and
// a re-add of the row that shows the text. And a `match` statement in the row (on a cell, on the row's field).
//
// Only row 2's gated element holds text (`${r.id == 2 ? "LOGGED IN" : ""}`), so a reorder that moves a
// stale node of row 2 is visible in `#out`. Every page starts GRANTED and `#wrong` revokes.
// Data, not logic: the default export is a list of [name, scrml source]. Side: client
// (click #wrong / #right, read #out). Do not edit a shape to make it pass.

export const SIDE = "client";

const T = `\${r.id == 2 ? "LOGGED IN" : ""}`;
const B = `<b>${T}</b>`;

const POSITIONS = [
  ["root, sole", (g) => `if (${g}) { lift ${B} }`],
  ["root, beside a sibling root", (g) => `lift <i></i>\n if (${g}) { lift ${B} }`],
  ["root, if / else", (g) => `if (${g}) { lift ${B} } else { lift <i></i> }`],
  ["root, else if", (g) => `if (!(${g})) { lift <i></i> } else if (true) { lift ${B} }`],
  ["root, nested if", (g) => `if (true) { if (${g}) { lift ${B} } }`],
  ["root, around a nested loop", (g) => `if (${g}) { for (k of r.kids) { lift ${B} } }`],
  ["root, early continue", (g) => `if (!(${g})) { continue }\n lift ${B}`],
  ["element", (g) => `lift <span>\${ if (${g}) { lift ${B} } }</span>`],
  ["element, if / else", (g) => `lift <span>\${ if (${g}) { lift ${B} } else { lift <i></i> } }</span>`],
  ["element, nested if", (g) => `lift <span>\${ if (true) { if (${g}) { lift ${B} } } }</span>`],
  ["element, around a nested loop", (g) => `lift <span>\${ if (${g}) { for (k of r.kids) { lift ${B} } } }</span>`],
  ["element, two deep", (g) => `lift <span><em>\${ if (${g}) { lift ${B} } }</em></span>`],
  ["element, in one root of a multi-root row", (g) => `lift <i></i>\n lift <span>\${ if (${g}) { lift ${B} } }</span>`],
  ["element, between sibling elements", (g) => `lift <span><i></i>\${ if (${g}) { lift ${B} } }<u></u></span>`],
];

const ROW = (id, ok) => `{ id: ${id}, ok: ${ok}, kids: [1] }`;
const CELL = `(@pw == "secret")`;
const REVOKES = [
  ["cell", CELL, `@pw = "wrong"`, `@pw = "secret"`],
  ["cell, then a reorder in a later run", CELL,
    `@pw = "wrong"\n setTimeout(() => { @xs = [${ROW(2, true)}, ${ROW(1, true)}] }, 0)`, `@pw = "secret"`],
  ["a reorder, then the cell in a later run", CELL,
    `@xs = [${ROW(2, true)}, ${ROW(1, true)}]\n setTimeout(() => { @pw = "wrong" }, 0)`, `@pw = "secret"`],
  ["same-key replace", `r.ok`,
    `@xs = [${ROW(1, 'grant("wrong")')}, ${ROW(2, 'grant("wrong")')}]`, `@xs = [${ROW(1, 'grant("secret")')}, ${ROW(2, 'grant("secret")')}]`],
  ["in-place write", `r.ok`,
    `@xs[0].ok = grant("wrong")\n @xs[1].ok = grant("wrong")`, `@xs[1].ok = grant("secret")`],
  ["in-place write, then a reorder in a later run", `r.ok`,
    `@xs[1].ok = grant("wrong")\n setTimeout(() => { @xs = [@xs[1], @xs[0]] }, 0)`, `@xs[1].ok = grant("secret")`],
  ["cell, then remove + re-add in later runs", CELL,
    `@pw = "wrong"\n setTimeout(() => { @xs = [${ROW(1, true)}] }, 0)\n setTimeout(() => { @xs = [${ROW(1, true)}, ${ROW(2, true)}] }, 0)`, `@pw = "secret"`],
];

const PAGE = (row, wrong, right) => `<pw> = "secret"
<xs> = [${ROW(1, true)}, ${ROW(2, true)}]
\${
    function grant(p) { return p == "secret" }
}
<button id="wrong" onclick=\${ ${wrong} }>go</button>
<button id="right" onclick=\${ ${right} }>go</button>
<div id="out">\${ for (r of @xs) { ${row} } }</div>
`;

const shapes = [];
for (const [rn, guard, wrong, right] of REVOKES) {
  for (const [pn, pos] of POSITIONS) shapes.push([`${pn} — ${rn}`, PAGE(pos(guard), wrong, right)]);
}
// A `match` STATEMENT in the row decides what the row renders the same way (its lifts went to the ambient
// target on main, outside the row, and were never re-read).
const MATCH_PAGE = (head, row, wrong, right) => `${head}<pw> = "secret"
<xs> = [${ROW(1, true)}, ${ROW(2, true)}]
\${
    function grant(p) { return p == "secret" }
}
<button id="wrong" onclick=\${ ${wrong} }>go</button>
<button id="right" onclick=\${ ${right} }>go</button>
<div id="out">\${ for (r of @xs) { ${row} } }</div>
`;
shapes.push(["a match statement on a cell — cell", MATCH_PAGE(`type Who:enum = { Admin, User }\n<who>: Who = .Admin\n`,
  `match @who { .Admin => { lift ${B} } .User => { lift <i></i> } }`, `@who = .User`, `@who = .Admin`)]);
shapes.push(["a match statement on the row's field — same-key replace", MATCH_PAGE("",
  `match r.ok { true => { lift ${B} } false => { lift <i></i> } }`,
  `@xs = [${ROW(1, 'grant("wrong")')}, ${ROW(2, 'grant("wrong")')}]`, `@xs = [${ROW(1, 'grant("secret")')}, ${ROW(2, 'grant("secret")')}]`)]);
shapes.push(["a match statement on the row's field — in-place write", MATCH_PAGE("",
  `match r.ok { true => { lift ${B} } false => { lift <i></i> } }`,
  `@xs[1].ok = grant("wrong")`, `@xs[1].ok = grant("secret")`)]);
export default shapes;
