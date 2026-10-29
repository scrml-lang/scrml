// mechanical.ts — the two mechanical stdlib-source fixes of s473-stdlib-bootstrap-clean, as a script
// (reproducible; the reviewer can re-run it on base and diff).
//   --unwrap   drop the top-level `<program>` … `</program>` wrapper (S471 ruling: "I guess its ok to
//              drop the <program> wrapper" — library form, §21.5). Only the exact shape
//              `<program>` / `${` … `}` / `</program>` (one logic block, nothing else) is rewritten.
//   --semis    insert the statement `;` the bootstrap reports as E-STMT-MISSING-SEMICOLON (its span is
//              the empty span where the `;` goes, parse.scrml parseTermStmt), to a fixpoint (the
//              parser's cascade guard reports one per block after the first error).
// USAGE: bun docs/changes/s473-stdlib-bootstrap-clean/mechanical.ts --unwrap|--semis <stdlib/file.scrml>…
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const args = process.argv.slice(2);
const mode = args.shift();
const files = args.map((f) => resolve(f));

if (mode === "--unwrap") {
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    const L = s.split("\n");
    const tops = L.map((l, i) => [l, i] as const).filter(([l]) => /^(<|\$\{|\})/.test(l));
    if (tops.length !== 4 || tops[0][0] !== "<program>" || tops[1][0] !== "${" || tops[2][0] !== "}" || tops[3][0] !== "</program>") {
      console.error("skip (not the plain wrapper shape):", relative(ROOT, f));
      continue;
    }
    const out = L.filter((_, i) => i !== tops[0][1] && i !== tops[3][1]);
    writeFileSync(f, out.join("\n"));
    console.error("unwrapped", relative(ROOT, f));
  }
} else if (mode === "--semis") {
  const boot = await import(join(ROOT, "scripts/scrml-boot.ts"));
  const { frontEnd } = await import(join(ROOT, "compiler/self-host-v2/slice-m2/lowered.js"));
  const B = await boot.loadBoot({ log: (s: string) => console.error(s) });
  for (const f of files) {
    let total = 0;
    for (let round = 0; round < 60; round++) {
      const src = readFileSync(f, "utf8");
      // the file alone, as the entry (parse diagnostics do not depend on the closure)
      const r = frontEnd(B.mods, [{ path: "m.scrml", src }], "m.scrml");
      // Only at a LINE END (the rest of the line blank or a `//` comment): a diagnostic after an
      // earlier parse error in the same construct can point mid-expression (`if (typeof x != "s"␣)`),
      // where a `;` would change what impl#1 reads.
      // And never before a line that CONTINUES the expression (starts with an operator, `.`, `?`,
      // `:`, `,`, `)` or `]`) — a `;` there would split one impl#1 statement in two.
      const atEol = (o: number) => {
        const m = /^[ \t]*(\/\/[^\n]*)?(\r?\n|$)/.exec(src.slice(o, o + 400));
        if (!m) return false;
        const next = /^\s*(\S)/.exec(src.slice(o + m[0].length).replace(/^(\s*\/\/[^\n]*\n)+/, ""));
        return !next || !/[.+\-*/%&|?:,)\]=<>]/.test(next[1]);
      };
      const at = [...new Set(r.parseDiags.filter((d: any) => d.code === "E-STMT-MISSING-SEMICOLON" && d.file === "m.scrml" && d.span.start === d.span.end && /insert `;` after/.test(d.message) && atEol(d.span.start)).map((d: any) => d.span.start as number))].sort((a, b) => b - a);
      if (at.length === 0) break;
      let out = src;
      for (const o of at) out = out.slice(0, o) + ";" + out.slice(o);
      writeFileSync(f, out);
      total += at.length;
    }
    console.error(`${relative(ROOT, f)}: ${total} \`;\` inserted`);
  }
} else {
  console.error("usage: mechanical.ts --unwrap|--semis <file>…");
  process.exit(2);
}
