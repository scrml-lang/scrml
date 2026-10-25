/**
 * s470-await-residue fix round 1 (F5, SECURITY) — LATEST WINS for the async engine hook hosts.
 *
 * #1554's residue fix gave a state-child `effect=` and an `<onTransition>` body an async host (their
 * waiting calls are awaited in place, §13.8 (i)). With no stale-response guard, a run that a later
 * firing of the same hook superseded still resumed: click the right password (its round trip slowed
 * 60ms), go back to Idle, click the wrong one — the right password's run landed LAST and the page
 * showed LOGGED IN with `@pw` = "wrong" (measured on 817aadc0e; base 6081e0685 showed "rejected").
 * Each hook arm now carries a module-scope run counter; a superseded run's continuation never
 * resumes — the check `_scrml_live(await …)` runs synchronously at the resume point — the
 * `<request>` settle machine's latest-wins rule. A `<timer>` (which re-reads on its next tick) is the
 * reference behaviour.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { SCRML_RUNTIME } from "../../src/runtime-template.js";

const page = (hook) => `type Phase:enum = { Idle, Active }
<pw> = "none"
<ok> = false
<msg> = "rejected"
\${
    server function isOk(p) { return p == "secret" }
    function login(p) { @pw = p; @phase = .Active }
    function out() { @phase = .Idle }
}
${hook}
<button id="wrong" onclick=login("wrong")>go</button>
<button id="right" onclick=login("secret")>go</button>
<button id="idle" onclick=out()>out</button>
<p id="out">\${@msg}</p>
`;
const BODY = `@ok = isOk(@pw); if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" }`;
const HOOKS = {
  "<onTransition> body": `<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active rule=.Idle/>
  <onTransition from=.Idle to=.Active>\${ ${BODY} }</onTransition>
</>`,
  "state-child effect=": `<engine for=Phase initial=.Idle>
  <Idle rule=.Active effect=\${ ${BODY} }/>
  <Active rule=.Idle/>
</>`,
  "<onTransition> body, a guarded write": `<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active rule=.Idle/>
  <onTransition from=.Idle to=.Active>\${ @ok = isOk(@pw) !{ _ :> false }
 if (@ok) { @msg = "LOGGED IN" } else { @msg = "rejected" } }</onTransition>
</>`,
  "<onTransition> body, a sole write (gate on the cell)": `<engine for=Phase initial=.Idle>
  <Idle rule=.Active/>
  <Active rule=.Idle/>
  <onTransition from=.Idle to=.Active>\${ @ok = isOk(@pw) }</onTransition>
</>`,
};

/** Compile, mount, click `clicks` in one turn (the "secret" round trip slowed 60ms), read #out. */
async function run(src, clicks, gate = false) {
  const dir = mkdtempSync(join(tmpdir(), "scrml-s470-race-"));
  try {
    const input = join(dir, "app.scrml");
    writeFileSync(input, gate ? src.replace('<p id="out">${@msg}</p>', '<p id="out"><span if=${@ok}>LOGGED IN</span></p>') : src);
    const out = join(dir, "out");
    const res = compileScrml({ inputFiles: [input], write: true, outputDir: out, log: () => {} });
    const errs = (res.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
    if (errs.length) return `REFUSED ${errs.map((e) => e.code).join(",")}`;
    const mods = [];
    for (const b of readdirSync(out).filter((f) => f.endsWith(".server.js"))) mods.push(await import(pathToFileURL(resolve(out, b)).href + "?" + Math.random()));
    const NReq = globalThis.Request, NRes = globalThis.Response;
    if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
    GlobalRegistrator.register();
    try {
      globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        const path = url.replace(/^[a-z]+:\/\/[^/]+/i, "");
        const headers = { ...Object.fromEntries(new Headers(init.headers ?? {}).entries()), Cookie: "scrml_csrf=tok", "X-CSRF-Token": "tok" };
        if (String(init.body ?? "").includes("secret")) await new Promise((r) => setTimeout(r, 60));
        const req = new NReq(`http://localhost${path}`, { method: init.method ?? "GET", headers, body: init.body });
        for (const m of mods) { const r = await m.fetch(req.clone()); if (r) return r; }
        return new NRes("nf", { status: 404 });
      };
      const html = readFileSync(resolve(out, "app.html"), "utf8");
      const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      document.body.innerHTML = (m ? m[1] : html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
      const oe = console.error;
      console.error = () => {};
      try {
        (0, eval)(`(function() {\n${SCRML_RUNTIME}\n${readFileSync(resolve(out, "app.client.js"), "utf8")}\n})();`);
        document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 20));
        for (const id of clicks) document.querySelector("#" + id).click();
        await new Promise((r) => setTimeout(r, 250));
      } finally {
        console.error = oe;
      }
      return document.querySelector("#out")?.textContent ?? null;
    } finally {
      await GlobalRegistrator.unregister();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("s470-await-residue F5 — an async hook run superseded by a later one does not resume", () => {
  for (const [name, hook] of Object.entries(HOOKS)) {
    const gate = name.includes("sole write");
    test(`${name}: right (slow), back to Idle, wrong → not logged in`, async () => {
      expect(await run(page(hook), ["right", "idle", "wrong"], gate)).toBe(gate ? "" : "rejected");
    }, 30_000);
    test(`${name}: right alone still logs in (the guard does not stop the latest run)`, async () => {
      expect(await run(page(hook), ["right"], gate)).toBe("LOGGED IN");
    }, 30_000);
  }
});
