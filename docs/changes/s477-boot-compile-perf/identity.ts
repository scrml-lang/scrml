// s477-boot-compile-perf — byte-identity gate: compile a corpus with one repo's bootstrap and record
// every artifact and the whole diagnostic stream; then diff two such records (base vs head).
//
//   bun identity.ts list <corpus root> <out.txt> [extra files…]
//       every .scrml under conformance/cases, compiler/self-host-v2/<subdirs> (the fixtures, not the
//       compiler's own modules) and compiler/tests of <corpus root>, plus the extra files
//   bun identity.ts twins <corpus root> <out dir> <list.txt>
//       the §66 twin of every twinned conformance case (what the bootstrap is graded on), appended
//   bun identity.ts dump <repo root> <list.txt> <out.jsonl>
//       compileSource (scripts/scrml-boot.ts of <repo root>, in process) on each listed file; one JSON
//       line per file: the diagnostics in full, and a sha256 of each artifact (client html, client js,
//       server js, every host-src shim, the host-file copy list), or the thrown error's message.
//       <repo root> is replaced by <ROOT> in every recorded string (two checkouts compare equal).
//   bun identity.ts diff <a.jsonl> <b.jsonl>
//       exit 0 iff both hold the same files with identical records; prints every differing file.
import { readdirSync, readFileSync, statSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";

const [cmd, ...rest] = process.argv.slice(2);
const sha = (s: string | undefined) => (s === undefined ? null : createHash("sha256").update(s).digest("hex"));

function walk(dir: string, out: string[]) {
  let ents: string[];
  try { ents = readdirSync(dir); } catch { return; }
  for (const e of ents.sort()) {
    if (e === "node_modules" || e === "dist") continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith(".scrml")) out.push(p);
  }
}

if (cmd === "list") {
  const [root, outFile, ...extra] = rest;
  const files: string[] = [];
  walk(join(root, "conformance/cases"), files);
  // the fixtures under compiler/self-host-v2/<subdir>; NOT the impl#1 build entries there that
  // import the compiler's own modules (slice-*/bundle.scrml, *.core.scrml): those compile the
  // whole 77k-line compiler, which is the bootstrap's build, not a program it is graded on
  const sh = join(root, "compiler/self-host-v2");
  const modules = readdirSync(sh).filter((e) => e.endsWith(".scrml"));
  const importsCompiler = (p: string) => modules.some((m) => readFileSync(p, "utf8").includes(`from "../${m}"`));
  for (const d of readdirSync(sh).sort()) {
    const p = join(sh, d);
    if (statSync(p).isDirectory()) {
      const sub: string[] = [];
      walk(p, sub);
      for (const f of sub) if (!importsCompiler(f)) files.push(f);
    }
  }
  walk(join(root, "compiler/tests"), files);
  for (const x of extra) files.push(resolve(x));
  writeFileSync(outFile, files.join("\n") + "\n");
  console.log(`${files.length} files -> ${outFile}`);
} else if (cmd === "twins") {
  // bun identity.ts twins <corpus root> <out dir> <list.txt>
  //   the §66 twin (scripts/bootstrap-conformance.ts twinOf — what the bootstrap is graded on) of
  //   every twinned conformance case, written to <out dir>/<case>/ with its aux files; appended to list
  const [root, outDir, listFile] = rest;
  const { loadCases } = await import(join(resolve(root), "conformance/run.ts"));
  const { twinOf } = await import(join(resolve(root), "scripts/bootstrap-conformance.ts"));
  const added: string[] = [];
  for (const c of loadCases(join(resolve(root), "conformance/cases"))) {
    const tw = twinOf(c);
    if (!tw.twinned) continue;
    const dir = join(outDir, c.relDir);
    mkdirSync(dir, { recursive: true });
    for (const [p, src] of Object.entries(tw.auxFiles)) writeFileSync(join(dir, p), src as string);
    writeFileSync(join(dir, "case.scrml"), tw.source);
    added.push(join(resolve(dir), "case.scrml"));
  }
  added.sort();
  appendFileSync(listFile, added.join("\n") + "\n");
  console.log(`${added.length} twins -> ${outDir}, appended to ${listFile}`);
} else if (cmd === "dump") {
  const [root0, listFile, outFile] = rest;
  const root = resolve(root0);
  const { compileSource } = await import(join(root, "scripts/scrml-boot.ts"));
  const files = readFileSync(listFile, "utf8").split("\n").filter(Boolean);
  writeFileSync(outFile, "");
  const norm = (s: string) => s.split(root).join("<ROOT>");
  const t0 = performance.now();
  let n = 0;
  for (const f of files) {
    let rec: Record<string, unknown>;
    try {
      const c = await compileSource(f);
      rec = {
        file: f,
        ok: c.ok,
        diagnostics: c.diagnostics.map((d: Record<string, unknown>) => JSON.parse(norm(JSON.stringify(d)))),
        html: sha(c.client?.html),
        js: sha(c.client?.js),
        serverJs: sha(c.serverJs),
        hostFiles: (c.hostFiles ?? []).map((h: { src: string; out: string }) => norm(h.src) + " -> " + h.out),
        hostSrcCopies: (c.hostSrc?.copies ?? []).map((h: { src: string; out: string }) => norm(h.src) + " -> " + h.out),
        hostSrcShims: (c.hostSrc?.shims ?? []).map((h: { out: string; text: string }) => h.out + " " + sha(norm(h.text))),
      };
    } catch (e) {
      // the bundle's own function names carry impl#1's numeric suffixes (`_scrml_kids_6736`), which
      // move when a module gains a function: compare the message with those suffixes dropped
      rec = { file: f, threw: norm(String((e as Error)?.message ?? e)).replace(/(_scrml_\w+?)_\d+/g, "$1") };
    }
    appendFileSync(outFile, JSON.stringify(rec) + "\n");
    n++;
    if (n % 200 === 0) console.error(`${n}/${files.length} ${Math.round((performance.now() - t0) / 1000)} s`);
  }
  console.log(`${n} files dumped -> ${outFile} in ${Math.round((performance.now() - t0) / 1000)} s`);
} else if (cmd === "diff") {
  const read = (p: string) => new Map(readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => [JSON.parse(l).file as string, l]));
  const a = read(rest[0]);
  const b = read(rest[1]);
  let diffs = 0;
  let artifacts = 0;
  let diags = 0;
  let threw = 0;
  for (const [f, la] of a) {
    const lb = b.get(f);
    if (lb !== la) { diffs++; console.log(`DIFF ${f}\n  a: ${la.slice(0, 400)}\n  b: ${(lb ?? "(missing)").slice(0, 400)}`); }
    const r = JSON.parse(la);
    if (r.threw) threw++;
    else {
      diags += r.diagnostics.length;
      for (const k of ["html", "js", "serverJs"]) if (r[k]) artifacts++;
      artifacts += r.hostSrcShims.length;
    }
  }
  for (const f of b.keys()) if (!a.has(f)) { diffs++; console.log(`DIFF ${f}: only in b`); }
  console.log(`${a.size} files compared (${artifacts} printed artifacts, ${diags} diagnostics, ${threw} thrown); ${diffs} differ`);
  process.exit(diffs === 0 ? 0 : 1);
} else {
  console.error("usage: bun identity.ts list|dump|diff …");
  process.exit(2);
}
