// dropped-value-trap-s483.test.js — lane s483-attr-trap. A server-only component field (an attribute, or a cell
// a use site gives a value: §7.6 rule (b), #2125 / #2130) has several values — its default and each use site's —
// and the classification judged them JOINED: when one reached a secret the field was server-only and EVERY value
// was dropped, so a runtime trap (§19.17, E-INDEX-OUT-OF-RANGE-RT) in another value that reaches nothing
// server-only stopped firing (#2130 review MED-1: r12g, r12i, r12j — red on 353ffe643, the page loaded alive).
//
// Ruled S483 (ruling:user-voice-scrml.md-S483-dropped-attr-trap): "Run secret-free ones" — *"a dropped value that
// reaches nothing server-only is still evaluated for its trap and the result discarded; a dropped value that
// reaches a secret cannot run in the client, so its trap loss is documented in SPEC with a gap"*. Built:
// print.scrml keptVals judges each value of such a field ALONE by the same classification and keeps (runs in the
// client, at its place) the ones that reach nothing server-only; a kept default runs only for an instance that
// gives the field none (an instance whose own value is dropped passes `not`). The trap loss of a value that
// reaches a secret (r12c, r12d, r12h) is gap g-boot-dropped-value-trap-s483.
// Chromium: compiler/tests/browser/dropped-value-trap-chromium-s483.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s483-dropped-trap-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
function writeApp(src) {
  const sub = join(dir, `app${n++}`);
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "main.scrml"), src);
  return join(sub, "main.scrml");
}

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(ROOT, "scripts", "scrml-boot.ts");
const SERVER_FILES = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];

// Compile through the CLI; every CLIENT file read back; the server artifact imported (a load failure fails the test).
async function build(src) {
  const main = writeApp(src);
  const out = main.replace(/main\.scrml$/, "out");
  const p = Bun.spawnSync(["bun", CLI, "compile", main, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) return { ok: false, err: p.stderr.toString() + p.stdout.toString() };
  const names = readdirSync(out);
  const client = names.filter((f) => !SERVER_FILES.includes(f)).map((f) => ({ f, text: readFileSync(join(out, f), "utf8") }));
  if (names.includes("program.server.js")) await import(pathToFileURL(join(out, "program.server.js")).href);
  return { ok: true, client, js: client.find((c) => c.f === "program.client.js")?.text ?? "" };
}
function leaked(client) {
  return client.filter((c) => c.text.includes("zz-sk-live-123")).map((c) => c.f);
}
// run the client artifact (happy-dom): the trap code it stops with, or "alive"
async function outcome(src) {
  const res = await compileSource(writeApp(src));
  if (!res.ok) throw new Error("did not compile: " + res.diagnostics.filter((d) => d.severity === "error").map((d) => d.code + " " + d.message).join("; "));
  try {
    await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
    return "alive";
  } catch (e) {
    const m = /^(E-[A-Z0-9-]+-RT)/.exec(String(e?.message ?? e));
    return m ? m[1] : "threw: " + String(e?.message ?? e);
  }
}

// `label` is server-placed (§12.2 Trigger 5: it reaches a `?{}`), so API_KEY is otherwise read only by server code.
const PROG = (extra) => `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
    function mk() -> string { return API_KEY + "?"; }
    function pick5(xs: string[]) -> string { return xs[5]; }
}
<program db="./app.db">
\${
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${tag(@out)}</p>
\${ const XS: string[] = ["a"]; }
${extra}
<p id="h">alive</p>
</program>
`;

describe("a dropped value that reaches nothing server-only still runs for its trap (the field stays a shell; no secret in the client)", () => {
  test("r12g a use-site value beside a secret use site; r12j beside a secret default; r12i a use-site-given cell beside a secret seed; through a function; the same value twice; a binding the secret value reads too", async () => {
    for (const extra of [
      `<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>\n<card t=(API_KEY)/>`,
      `<card t:string=(mk())/> renders <b>x</b>\n<card t=("p" + XS[5])/>`,
      `<card t:string="x">\n  let <k:string=(API_KEY)/>\n</> renders <b>x</b>\n<card k=("p" + XS[5])/>`,
      `<card t:string="x"/> renders <b>x</b>\n<card t=(pick5(XS))/>\n<card t=(API_KEY)/>`,
      `<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>\n<card t=("p" + XS[5])/>\n<card t=(API_KEY)/>`,
      `\${ const B: string = "b"; }\n<card t:string="x"/> renders <b>x</b>\n<card t=(B + XS[5])/>\n<card t=(B + API_KEY)/>`,
    ]) {
      const s = PROG(extra);
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leaked(b.client)).toEqual([]);
      expect(b.js).toContain("rt.indexRead(");
      expect(await outcome(s)).toBe("E-INDEX-OUT-OF-RANGE-RT");
    }
  }, 900000);

  test("a kept DEFAULT runs only for an instance that gives the field none: k01 traps (a bare `<card/>`), k02 does not (every instance gives t)", async () => {
    const k01 = PROG(`<card t:string=("p" + XS[5])/> renders <b>x</b>\n<card t=(API_KEY)/>\n<card/>`);
    const k02 = PROG(`<card t:string=("p" + XS[5])/> renders <b>x</b>\n<card t=(API_KEY)/>`);
    for (const s of [k01, k02]) {
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leaked(b.client)).toEqual([]);
      // the instance whose secret value is dropped passes `not`, so the default does not run for it
      expect(b.js).toMatch(/mk_card_\w+\(rt\.instance\(decl_card_\w+, inst\$\.scope\), \(\) => null\)/);
    }
    expect(await outcome(k01)).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect(await outcome(k02)).toBe("alive");
  }, 600000);

  test("a kept value that does not trap runs with no effect; a field with no secret anywhere (r12f) is untouched", async () => {
    const k04 = PROG(`<card t:string="x"/> renders <b>x</b>\n<card t=(tag(XS[0]))/>\n<card t=(mk())/>`);
    const b = await build(k04);
    expect(leaked(b.client)).toEqual([]);
    expect(await outcome(k04)).toBe("alive");
    expect(await outcome(PROG(`<card t:string="x"/> renders <b>x</b>\n<card t=("p" + XS[5])/>`))).toBe("E-INDEX-OUT-OF-RANGE-RT");
  }, 600000);
});

describe("#2130 review LOW-1 — a refused cell whose only reader is a dropped use-site value says so", () => {
  test("a52 `<card t=(@pk)/>`, t unread: the message names `<card>.t` (not \"nothing on the client reads\"); a cell nothing reads keeps the old text", async () => {
    const a52 = await build(PROG(`let <pk:string=(mk() + @out)/>\n<card t:string="x"/> renders <b>x</b>\n<card t=(@pk)/>`));
    expect(a52.ok).toBe(false);
    expect(a52.err).toContain("the seed of `@pk`, a cell of the program body whose only reader is the value a use site gives `<card>.t` — a component field nothing on the client reads, so that value is not evaluated");
    expect(a52.err).not.toContain("nothing on the client reads, reaches");
    const a54 = await build(PROG(`<card t:string=(API_KEY)/> renders <b>x</b>\nlet <z:string=(tag(@card.t))/>`));
    expect(a54.ok).toBe(false);
    expect(a54.err).toContain("the seed of `@z`, a cell of the program body that nothing on the client reads, reaches");
  }, 300000);
});

describe("a dropped value that reaches a secret cannot run in the client — its trap is lost (gap g-boot-dropped-value-trap-s483, pinned)", () => {
  test("r12c a use-site value, r12d a default, r12h a component cell's seed: no secret in the client, the page loads", async () => {
    for (const extra of [
      `<card t:string="x"/> renders <b>x</b>\n<card t=(API_KEY + XS[5])/>`,
      `<card t:string=(API_KEY + XS[5])/> renders <b>x</b>\n<card/>`,
      `<card t:string="x">\n  let <k:string=(API_KEY + XS[5])/>\n</> renders <b>x</b>\n<card/>`,
    ]) {
      const s = PROG(extra);
      const b = await build(s);
      expect(b.ok).toBe(true);
      expect(leaked(b.client)).toEqual([]);
      expect(await outcome(s)).toBe("alive");
    }
  }, 600000);
});
