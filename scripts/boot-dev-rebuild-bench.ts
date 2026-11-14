#!/usr/bin/env bun
/**
 * s477 (boot-dev-leak) — rebuild bench for `scrml-boot dev`.
 *
 * Starts `bun scripts/scrml-boot.ts dev <file>` as a child, then rewrites <file> N times (its text
 * plus a changing trailing comment line, so the save is a real content change), waiting after each
 * save for the child's "✓ changed …" / "✗ changed …" line. Per rebuild it logs the rebuild ms the
 * child reported and the child's RSS (VmRSS from /proc/<pid>/status, Linux) right after it.
 *
 *   bun scripts/boot-dev-rebuild-bench.ts <file.scrml> [--n 20] [--port 4799] [--output-dir <dir>] [--page] [--json]
 *
 * The file is restored to its original text at the end. Exported `benchDevRebuilds` is what the
 * regression test drives.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

export type RebuildSample = { i: number; ms: number; rssMB: number; ok: boolean };

function rssMB(pid: number): number {
  try {
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
    return m ? Math.round(Number(m[1]) / 1024) : -1;
  } catch {
    return -1;
  }
}

/**
 * `--page`: stands in for an open browser tab — loads the page and its script, holds the reload
 * EventSource open, and on each "reload" drops it and loads everything again (what the page's dev
 * hook does), until the child exits.
 */
async function pageLoop(base: string, child: { exitCode: number | null }) {
  while (child.exitCode === null) {
    try {
      await (await fetch(base + "/")).text();
      await (await fetch(base + "/program.client.js")).text();
      const ac = new AbortController();
      const res = await fetch(base + "/__scrml-boot/events", { signal: ac.signal });
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (dec.decode(value).includes("data: reload")) { ac.abort(); break; }
      }
    } catch {
      await Bun.sleep(100);
    }
  }
}

export async function benchDevRebuilds(
  file: string,
  opts: { page?: boolean; n?: number; port?: number; outDir?: string; timeoutMs?: number; log?: (s: string) => void; env?: Record<string, string> } = {},
): Promise<{ start: RebuildSample; rebuilds: RebuildSample[] }> {
  const abs = resolve(file);
  const n = opts.n ?? 20;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const original = readFileSync(abs, "utf8");
  const args = ["bun", join(import.meta.dir, "scrml-boot.ts"), "dev", abs, "--port", String(opts.port ?? 4799)];
  if (opts.outDir) args.push("--output-dir", resolve(opts.outDir));
  const child = Bun.spawn(args, { stdout: "ignore", stderr: "pipe", env: { ...process.env, ...(opts.env ?? {}) } });
  const lines: string[] = [];
  let waiters: Array<() => void> = [];
  (async () => {
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of child.stderr as ReadableStream<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let k: number;
      while ((k = buf.indexOf("\n")) >= 0) {
        lines.push(buf.slice(0, k));
        buf = buf.slice(k + 1);
        const w = waiters;
        waiters = [];
        for (const f of w) f();
      }
    }
  })();
  // wait for the next "✓/✗ <reason>" line at or after index `from`
  async function nextBuild(from: number, reason: RegExp): Promise<{ at: number; ms: number; ok: boolean }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let j = from; j < lines.length; j++) {
        const l = lines[j];
        const good = /^✓ (\S+).*? in (\d+) ms/.exec(l);
        if (good && reason.test(l)) return { at: j + 1, ms: Number(good[2]), ok: true };
        if (/^✗ /.test(l) && reason.test(l)) return { at: j + 1, ms: -1, ok: false };
      }
      if (child.exitCode !== null) throw new Error("scrml-boot dev exited:\n" + lines.join("\n"));
      if (Date.now() > deadline) throw new Error("timed out waiting for a rebuild:\n" + lines.slice(-20).join("\n"));
      await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 250); });
    }
  }
  const rebuilds: RebuildSample[] = [];
  let start: RebuildSample;
  try {
    let s = await nextBuild(0, /^. start:/);
    start = { i: 0, ms: s.ms, rssMB: rssMB(child.pid), ok: s.ok };
    opts.log?.(`start\t${start.ms} ms\trss ${start.rssMB} MB`);
    if (opts.page) void pageLoop(`http://127.0.0.1:${opts.port ?? 4799}`, child);
    let at = s.at;
    for (let i = 1; i <= n; i++) {
      writeFileSync(abs, original + `\n// bench rebuild ${i}\n`);
      const b = await nextBuild(at, /^. changed /);
      at = b.at;
      await Bun.sleep(150); // let the build's tail (server import, reload fan-out) settle before RSS
      const sample = { i, ms: b.ms, rssMB: rssMB(child.pid), ok: b.ok };
      rebuilds.push(sample);
      opts.log?.(`${i}\t${sample.ms} ms\trss ${sample.rssMB} MB${sample.ok ? "" : "\tFAILED"}`);
    }
  } finally {
    writeFileSync(abs, original);
    child.kill();
    await child.exited;
  }
  return { start, rebuilds };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (name: string) => { const k = argv.indexOf(name); if (k < 0) return undefined; const v = argv[k + 1]; argv.splice(k, 2); return v; };
  const n = Number(flag("--n") ?? 20);
  const port = Number(flag("--port") ?? 4799);
  const outDir = flag("--output-dir");
  const json = argv.includes("--json");
  const page = argv.includes("--page");
  const file = argv.filter((a) => a !== "--json" && a !== "--page")[0];
  if (!file) {
    console.error("usage: bun scripts/boot-dev-rebuild-bench.ts <file.scrml> [--n 20] [--port 4799] [--output-dir <dir>] [--page] [--json]");
    process.exit(2);
  }
  const r = await benchDevRebuilds(file, { n, port, outDir, page, log: json ? undefined : (s) => console.log(s) });
  if (json) console.log(JSON.stringify(r));
}
