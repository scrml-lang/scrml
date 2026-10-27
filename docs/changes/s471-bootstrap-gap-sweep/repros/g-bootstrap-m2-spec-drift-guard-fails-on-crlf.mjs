// g-bootstrap-m2-spec-drift-guard-fails-on-crlf: run the drift guard's section reader (copied verbatim from
// compiler/self-host-v2/slice-m2/parse.test.js `lf` + `sectionBlocks`) over SPEC.md as LF and as CRLF.
// Fixed iff both give the same, non-empty, section-scoped block lists. (run: bun <this file>)
import { readFileSync } from "node:fs";
const lf = (t) => t.replace(/\r\n/g, "\n");
function sectionBlocks(spec, num) {
  const text = lf(spec);
  const head = text.indexOf("\n#### " + num + " ");
  if (head < 0) throw new Error("SPEC section not found: " + num);
  const rest = text.slice(head + 1);
  const next = rest.slice(1).search(/\n#{1,4} /);
  const body = next < 0 ? rest : rest.slice(0, next + 1);
  return [...body.matchAll(/```scrml\n([\s\S]*?)```/g)].map((m) => m[1]);
}
const spec = readFileSync(new URL("../../../../compiler/SPEC.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const crlf = spec.replace(/\n/g, "\r\n");
for (const n of ["66.19.1", "66.19.2", "66.19.3"]) {
  const a = sectionBlocks(spec, n), b = sectionBlocks(crlf, n);
  console.log(n, "LF blocks:", a.length, "CRLF blocks:", b.length, "equal:", JSON.stringify(a) === JSON.stringify(b));
}
