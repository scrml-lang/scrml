// host-files.js — s472 (boot-math-port): put the stdlib host modules a lowered Core's host-backed
// functions call (core.scrml Fn.host) where the printed artifacts import them —
// `<dir>/_scrml/<module>/<file>` (SPEC §21.3.1) — as scripts/scrml-boot.ts compileFile does for a
// build. No side effects on import (the server harness reads it without happy-dom).

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const STDLIB = join(import.meta.dir, "..", "..", "..", "stdlib");

/** Copy each host module of `core` from `stdlibRoot` (default: the repo stdlib) into `<dir>/_scrml/<module>/<file>`. */
export function copyHostFiles(core, dir, stdlibRoot = STDLIB) {
  for (const f of core.fns ?? []) {
    const h = f.host;
    if (h === null || h === undefined) continue;
    if (h.bind !== null && h.bind !== undefined) continue; // s473: a `<host>` binding names no host module
    const dst = join(dir, "_scrml", h.module, ...String(h.file).split("/"));
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(stdlibRoot, h.module, ...String(h.file).split("/")), dst);
  }
}
