/**
 * claim-gate-banner-s472.test.js — the S469 "Banner + exempt" exemption is enforced
 * (g-claim-gate-banner-exempt-unenforced).
 *
 * WHY THIS EXISTS. S469 excused ten dated pieces from the claim-gate BECAUSE each carries a banner
 * ("Written <date>, before the S469 language rulings … older dialect … not checked by the docs
 * gate"). Nothing checked the banner: stripping it left the gate at exit 0. And the site renders two
 * of those pieces as `.scrml` pages (docs/website/pages/articles/v0.{2,3}.0-announce.scrml) that the
 * markdown-only claim-gate never reads — same older-dialect code, no banner, no gate.
 *
 * Pinned: `bannerProblems()` over fixture trees (banner present / stripped / after the code / file
 * absent / an unbannered site twin), and the real repo carries every banner.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import * as surface from "../../../scripts/claim-gate-surface.js";

const ROOT = join(import.meta.dir, "../../..");
const B = "```";
const BANNER = "> **Written 2026-05-05, before the S469 language rulings (October 2026).** The code in this piece is in the older dialect; not all of it compiles on either compiler, and it is not checked by the docs gate.";
const PAGE_BANNER = `<p class="note">Written 2026-05-05, before the S469 language rulings (October 2026). The code in this piece is in the older dialect; not all of it compiles on either compiler, and it is not checked by the docs gate.</p>`;
const fence = [`${B}scrml`, "<count> = 0", B].join("\n");

describe("claim-gate — the dated-piece banner is checked (S472)", () => {
  let root;
  const write = (rel, text) => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "claim-banner-"));
    write("docs/articles/ok-2026-01-01.md", `${BANNER}\n\n# ok\n\n${fence}\n`);
    write("docs/articles/stripped-2026-01-01.md", `# stripped\n\n${fence}\n`);
    write("docs/articles/late-2026-01-01.md", `# late\n\n${fence}\n\n${BANNER}\n`);
    write("docs/website/ann-2026-05-05.md", `---\ntitle: x\n---\n\n${BANNER}\n\n${fence}\n`);
    write("docs/website/pages/articles/ann.scrml", `<page>\n<h1>x</h1>\n<pre><code>&lt;count&gt; = 0</code></pre>\n</page>\n`);
    write("docs/website/good-2026-05-06.md", `${BANNER}\n\n${fence}\n`);
    write("docs/website/pages/articles/good.scrml", `<page>\n${PAGE_BANNER}\n<pre><code>x</code></pre>\n</page>\n`);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const problems = (list) => surface.bannerProblems(root, list).map((p) => p.file);

  test("a bannered piece passes; a stripped one, and one whose banner comes after the code, fail", () => {
    expect(problems(["docs/articles/ok-2026-01-01.md"])).toEqual([]);
    expect(problems(["docs/articles/stripped-2026-01-01.md"])).toEqual(["docs/articles/stripped-2026-01-01.md"]);
    expect(problems(["docs/articles/late-2026-01-01.md"])).toEqual(["docs/articles/late-2026-01-01.md"]);
  });

  test("a listed piece that is absent fails (a stale exemption row is not a pass)", () => {
    expect(problems(["docs/articles/gone-2026-01-01.md"])).toEqual(["docs/articles/gone-2026-01-01.md"]);
  });

  test("the site page rendering an exempt piece (its slug twin) must carry the banner too", () => {
    expect(problems(["docs/website/ann-2026-05-05.md"])).toEqual(["docs/website/pages/articles/ann.scrml"]);
    expect(problems(["docs/website/good-2026-05-06.md"])).toEqual([]);
  });

  test("the twin is found by slug: a dated name and its -PUBLISH copy share one page", () => {
    expect(surface.siteTwinOf("docs/website/v0.2.0-announce-2026-05-05.md")).toBe("docs/website/pages/articles/v0.2.0-announce.scrml");
    expect(surface.siteTwinOf("docs/articles/i-am-jacks-engine-PUBLISH.md")).toBe("docs/website/pages/articles/i-am-jacks-engine.scrml");
  });

  test("every SURFACE_UNGATED dated row is in BANNERED_DATED (no excuse escapes the check)", () => {
    const dated = Object.entries(surface.SURFACE_UNGATED).filter(([, why]) => /bannered: older-dialect/.test(why)).map(([p]) => p);
    expect(dated.sort()).toEqual([...surface.BANNERED_DATED].sort());
  });

  test("the real repo: every exempt piece and both site announcements carry the banner", () => {
    expect(surface.bannerProblems(ROOT)).toEqual([]);
  });

  test("claim-gate --list on the real repo reports no BANNER MISSING and exits 0", () => {
    const r = spawnSync("bun", ["scripts/claim-gate.js", "--list"], { cwd: ROOT, encoding: "utf8" });
    expect(r.stdout).not.toContain("BANNER MISSING");
    expect(r.status).toBe(0);
  }, 60_000);
});
