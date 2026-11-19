// ---------------------------------------------------------------------------
// <endpoint> opener — a closed grammar, read whole or refused (#1998 review r2).
// ---------------------------------------------------------------------------
//
// SPEC §61.2: `endpoint-attrs ::= path-attr method-attr accepts-attr cors-attr?`.
//
// N1 (HIGH): the opener is read by the markup attribute tokenizer, which DROPS what it
// cannot read — a `'`, a backtick, a `{…}` block, a comment — and the reader then read the
// text around it on. Inside `note='x cors="*" y'` or ``note=`cors="*"` `` the `cors="*"`
// became the endpoint's own `cors=` (the built server answered `Access-Control-Allow-Origin:
// *`), and `note='path="/evil"' path="/a"` mounted the endpoint at `/evil`. Every character
// of the opener now belongs to a token, else E-ATTR-001 (§5.2 round 4/5 — a value the reader
// drops, a token no attribute owns, is refused on every opener) at its position; a refused
// unquoted value keeps the markup reader's own diagnostic (E-ATTR-UNQUOTED-OPERATOR); each of
// `path=` / `method=` / `accepts=` / `cors=` is written at most once (its own code).
//
// L2: the opener ends where that tokenizer closes it (a hand scanner took `'` for a quote).
// L3: a refused opener is reported by its refusal first and alone — no "(none)" method,
// PATH-MISSING or ACCEPTS-MISSING for an attribute the reader lost.
// N2: a `cors=` origin's host is `[a-z0-9_.-]` (the URL parser keeps `* , ; { } …`).
// L1: an import cycle reports E-IMPORT-002 alone (no entry-file misplacement next to it).
// NITs: the path-rule messages are the bootstrap's (compiler/self-host-v2/analyze.scrml).
//
// The reproducers are built with `scrml build` (the CLI an adopter runs); the clean
// controls run the REAL `_server.js` it emits, over HTTP.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { compileScrml } from "../../src/api.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(testDir, "../../src/cli.js");
const TIMEOUT_MS = 60_000;
const A = "https://a.example";

const TY = `\${
  type Op:enum = {
    Ping
  }
}`;
const EPO = (opener) =>
  `<endpoint ${opener}>
  <Ping : { pong: true }>
</endpoint>`;
const program = (body) => `<program>
${body}
<p>hi</p>
</program>
`;
const app = (opener) => program(`${TY}\n${EPO(opener)}`);

let root;
const procs = [];

function writeApp(name, files) {
  const src = join(root, name, "src");
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(src, f)), { recursive: true });
    writeFileSync(join(src, f), text);
  }
  return src;
}

function build(name, files) {
  const src = writeApp(name, files);
  const dist = join(root, name, "dist");
  const r = Bun.spawnSync(["bun", CLI, "build", src, "-o", dist], { stdout: "pipe", stderr: "pipe" });
  return { exitCode: r.exitCode, out: r.stdout.toString() + r.stderr.toString(), dist };
}

let seq = 0;
function compileOne(text) {
  const src = writeApp(`c${++seq}`, { "app.scrml": text });
  const r = compileScrml({ inputFiles: [join(src, "app.scrml")], write: false, log: () => {} });
  return (r.errors ?? []).filter((e) => !String(e.code ?? "").startsWith("W-"));
}

async function freePort() {
  const s = Bun.serve({ port: 0, fetch: () => undefined });
  const port = s.port;
  s.stop(true);
  return port;
}

async function startProd(dist) {
  const port = await freePort();
  const proc = Bun.spawn(["bun", "_server.js"], {
    cwd: dist,
    env: { ...process.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push(proc);
  let out = "";
  const pump = async (stream) => { for await (const c of stream) out += new TextDecoder().decode(c); };
  pump(proc.stdout);
  pump(proc.stderr);
  const t0 = Date.now();
  while (Date.now() - t0 < 25_000) {
    if (/scrml server listening/.test(out)) return `http://127.0.0.1:${port}`;
    await Bun.sleep(25);
  }
  throw new Error(`_server.js did not come up:\n${out}`);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "endpoint-opener-closed-grammar-"));
});

afterAll(async () => {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  for (const p of procs) { try { await p.exited; } catch { /* ignore */ } }
  if (root) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// N1 — the review r1rev reproducers: refused at compile time, nothing served
// ---------------------------------------------------------------------------

describe("N1 — text inside a `'…'` / backtick run is never an attribute of the endpoint", () => {
  const cases = [
    // [name, opener, column of the first `'` / backtick on the `<endpoint` line (line 7)]
    ["sq1", `path="/a" method="POST" accepts=Op note='x cors="*" y'`, 51],
    ["tick", "path=\"/a\" method=\"POST\" accepts=Op note=`cors=\"*\"`", 51],
    ["sqpath", `note='path="/evil"' path="/a" method="POST" accepts=Op`, 16],
    ["sq2", `path="/a" method="POST" accepts=Op note='>' cors="*"`, 51],
  ];
  for (const [name, opener, col] of cases) {
    test(`${name}: \`<endpoint ${opener}>\` → refused (E-ATTR-001 at the quote), no build output`, () => {
      const r = build(`n1-${name}`, { "app.scrml": app(opener) });
      expect(r.exitCode).not.toBe(0);
      expect(r.out).toContain("E-ATTR-001");
      expect(r.out).toContain(`app.scrml:7:${col} E-ATTR-001`);
      expect(existsSync(join(r.dist, "_server.js"))).toBe(false);
    });
  }

  test("the first diagnostic names the quote, not a missing attribute", () => {
    const errs = compileOne(app(`path="/a" method="POST" accepts=Op note='x cors="*" y'`));
    expect(errs[0].code).toBe("E-ATTR-001");
    expect(errs[0].message).toContain("`'` is not an attribute quote");
    expect(errs.map((e) => e.code)).not.toContain("E-ENDPOINT-CORS-INVALID");
  });

  test("a backtick is named as one", () => {
    const errs = compileOne(app("path=\"/a\" method=\"POST\" accepts=Op note=`cors=\"*\"`"));
    expect(errs[0].code).toBe("E-ATTR-001");
    expect(errs[0].message).toContain("a backtick is not an attribute quote");
  });

  test("control: the same opener with `\"…\"` builds, and serves no CORS", async () => {
    const r = build("n1-control", { "app.scrml": app(`path="/a" method="POST" accepts=Op note="x cors='*' y"`) });
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const pre = await fetch(base + "/a", { method: "OPTIONS", headers: { Origin: A, "Access-Control-Request-Method": "POST" } });
    expect(pre.status).toBe(405);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const res = await fetch(base + "/a", { method: "POST", headers: { "Content-Type": "application/json", Origin: A }, body: '{"tag":"Ping"}' });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const evil = await fetch(base + "/evil", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"tag":"Ping"}' });
    expect(evil.status).not.toBe(200);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// N1 / L3 — the matrix: every attribute, every way the reader can fail to read it
// ---------------------------------------------------------------------------

describe("each attribute: repeated → its own code; value-less → its own code; unreadable → the reader's refusal", () => {
  const BASE = { path: `path="/a"`, method: `method="POST"`, accepts: `accepts=Op` };
  // The attribute under test is written LAST: a value-less `name=` before another
  // attribute would take that attribute as its unquoted value (the reader's refusal).
  const opener = (name, form) =>
    [...["path", "method", "accepts"].filter((n) => n !== name).map((n) => BASE[n]), form].join(" ");
  const REPEAT = {
    path: ["E-ENDPOINT-PATH-INVALID", `path="/a" path="/b"`],
    method: ["E-ENDPOINT-METHOD-INVALID", `method="POST" method="GET"`],
    accepts: ["E-ENDPOINT-ACCEPTS-MISSING", `accepts=Op accepts=Op`],
    cors: ["E-ENDPOINT-CORS-INVALID", `cors="*" cors="${A}"`],
  };
  for (const [name, [code, form]] of Object.entries(REPEAT)) {
    test(`repeated ${name}= → ${code} ("is written 2 times")`, () => {
      const errs = compileOne(app(opener(name, form)));
      const e = errs.filter((x) => x.code === code);
      expect(e.length).toBe(1);
      expect(e[0].message).toContain("is written 2 times");
    });
  }
  test("a repeated path= is refused even when both values are equal", () => {
    const errs = compileOne(app(opener("path", `path="/a" path="/a"`)));
    expect(errs.map((e) => e.code)).toEqual(["E-ENDPOINT-PATH-INVALID"]);
  });

  const VALUELESS = {
    path: "E-ENDPOINT-PATH-MISSING",
    method: "E-ENDPOINT-METHOD-INVALID",
    accepts: "E-ENDPOINT-ACCEPTS-MISSING",
    cors: "E-ENDPOINT-CORS-INVALID",
  };
  for (const [name, code] of Object.entries(VALUELESS)) {
    for (const form of [name, `${name}=`]) {
      test(`value-less \`${form}\` → ${code}`, () => {
        const errs = compileOne(app(opener(name, form)));
        expect(errs.map((e) => e.code)).toEqual([code]);
      });
    }
  }
  test("value-less method names it (\"has no value\"), not \"(none)\"", () => {
    const errs = compileOne(app(opener("method", "method")));
    expect(errs[0].message).toContain("`method=` on `<endpoint>` has no value");
    expect(errs[0].message).not.toContain("(none)");
  });
  test("value-less path names it", () => {
    const errs = compileOne(app(opener("path", "path")));
    expect(errs[0].message).toContain("has no string-literal value");
  });

  // A written attribute whose value the reader drops: the refusal first (at the quote),
  // then that attribute's own code — never a "missing" / "(none)" for it (L3).
  const OWN = {
    path: ["E-ENDPOINT-PATH-MISSING", "its `path` has no string-literal value"],
    method: ["E-ENDPOINT-METHOD-INVALID", "neither a string literal nor a bareword"],
    accepts: ["E-ENDPOINT-ACCEPTS-MISSING", "its `accepts` is not a bare type name"],
    cors: ["E-ENDPOINT-CORS-INVALID", "is not a string literal"],
  };
  for (const name of ["path", "method", "accepts", "cors"]) {
    const v = name === "accepts" ? "Op" : name === "method" ? "POST" : name === "path" ? "/a" : "*";
    const [own, ownWhy] = OWN[name];
    for (const [q, label] of [["'", "single-quoted"], ["`", "backticked"]]) {
      test(`${label} ${name}=${q}${v}${q} → E-ATTR-001 at the quote first, then ${own} naming the value`, () => {
        const errs = compileOne(app(opener(name, `${name}=${q}${v}${q}`)));
        expect(errs[0].code).toBe("E-ATTR-001");
        expect(errs[0].message).toContain(q === "'" ? "`'` is not an attribute quote" : "a backtick is not an attribute quote");
        const rest = errs.filter((e) => e.code !== "E-ATTR-001");
        expect(rest.map((e) => e.code)).toEqual([own]);
        expect(rest[0].message).toContain(ownWhy);
        expect(rest[0].message).not.toContain("(none)");
      });
    }
    test(`${name}= with a refused unquoted value → the reader's refusal (E-ATTR-UNQUOTED-OPERATOR) alone`, () => {
      const errs = compileOne(app(opener(name, `${name}=a/ b`)));
      expect(errs.map((e) => e.code)).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    });
  }

  const dropped = [
    ["a `{…}` block", `{cors="*"}`],
    ["a `${…}` block", `\${cors="*"}`],
    ["a comment", `<!-- cors="*" -->`],
    ["a dropped value", `note=-1 cors="*"`],
    ["a stray `=`", `= cors="*"`],
  ];
  for (const [what, extra] of dropped) {
    test(`${what} in the opener (\`${extra}\`) → refused, no CORS, no cascade`, () => {
      // Before the required attributes, so no unquoted value can absorb it.
      const errs = compileOne(app(`${extra} path="/a" method="POST" accepts=Op`));
      expect(errs.length).toBeGreaterThan(0);
      const codes = new Set(errs.map((e) => e.code));
      expect([...codes].every((c) => c === "E-ATTR-001" || c === "E-ATTR-UNQUOTED-OPERATOR")).toBe(true);
    });
  }
  test("`cors=*` (an unquoted value, §34 E-ENDPOINT-CORS-INVALID) → the dropped value named, then E-ENDPOINT-CORS-INVALID", () => {
    const errs = compileOne(app(`path="/a" method="POST" accepts=Op cors=*`));
    expect(errs.map((e) => e.code)).toEqual(["E-ATTR-001", "E-ENDPOINT-CORS-INVALID"]);
    expect(errs[0].message).toContain("the value of `cors=` (`*`) cannot be read");
  });
  test("after `accepts=Op`, `{cors=\"*\"}` is the unquoted value's refusal, and nothing else", () => {
    const errs = compileOne(app(`path="/a" method="POST" accepts=Op {cors="*"}`));
    expect(errs.map((e) => e.code)).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
  });
});

// ---------------------------------------------------------------------------
// L2 — the opener ends where its tokenizer closes it
// ---------------------------------------------------------------------------

describe("L2 — the opener's end is the attribute tokenizer's", () => {
  test("`note='>' cors=\"*\"` is refused (it no longer ends the opener at a `'`-quoted `>` and drops cors=)", () => {
    const errs = compileOne(app(`path="/a" method="POST" accepts=Op note='>' cors="*"`));
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].code).toBe("E-ATTR-001");
  });
  test("a `>` inside a `\"…\"` value does not end the opener", async () => {
    const r = build("l2-gt", { "app.scrml": app(`path="/a" method="POST" accepts=Op note="a>b" cors="${A}"`) });
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const pre = await fetch(base + "/a", { method: "OPTIONS", headers: { Origin: A, "Access-Control-Request-Method": "POST" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe(A);
  }, TIMEOUT_MS);
  test("an opener over several lines with tabs is read whole", () => {
    const errs = compileOne(app(`\tpath="/a"\n\tmethod="POST"\n\taccepts=Op\n\tcors="${A}"`));
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// N2 — a cors= origin's host is one a page is served from
// ---------------------------------------------------------------------------

describe("N2 — cors= host characters", () => {
  const refused = [
    "https://*.example", "https://a.example,b.example", "https://a;b.example", "https://a{b}.example",
    "https://a!b.example", "https://a$b.example", "https://a&b.example", "https://a(b).example",
    "https://a+b.example", "https://a=b.example", "https://a~b.example", "https://a`b.example",
  ];
  for (const v of refused) {
    test(`cors=${JSON.stringify(v)} → E-ENDPOINT-CORS-INVALID`, () => {
      const errs = compileOne(app(`path="/a" method="POST" accepts=Op cors="${v}"`));
      expect(errs.map((e) => e.code)).toEqual(["E-ENDPOINT-CORS-INVALID"]);
    });
  }
  const accepted = [
    "https://a_b.example", "https://-a.example", "https://a.example.", "https://xn--bcher-kva.example",
    "http://127.0.0.1:8080", "http://[::1]:8080", "https://a-b.c-d.example",
  ];
  for (const v of accepted) {
    test(`cors=${JSON.stringify(v)} → accepted`, () => {
      expect(compileOne(app(`path="/a" method="POST" accepts=Op cors="${v}"`))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// L1 — an import cycle is reported once
// ---------------------------------------------------------------------------

describe("L1 — an import cycle reports E-IMPORT-002, not an entry-file misplacement too", () => {
  test("app ↔ lib (f3cyc): one diagnostic", () => {
    const r = build("l1-cyc", {
      "app.scrml": `<program>
\${
  import { helper } from "./lib.scrml"
  export const K = 1
  type Op:enum = {
    Ping
  }
}
<endpoint path="/a" method="POST" accepts=Op cors="${A}">
  <Ping : { pong: true }>
</endpoint>
<p>\${helper()}</p>
</program>
`,
      "lib.scrml": `\${
  import { K } from "./app.scrml"
  export function helper() { return K + 1 }
}
`,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-IMPORT-002");
    expect(r.out).not.toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
  });
  test("control: an imported (non-cycle) file's endpoint is still misplaced", () => {
    const r = build("l1-imported", {
      "app.scrml": `<program>
\${
  import { helper } from "./page2.scrml"
}
<p>\${helper()}</p>
</program>
`,
      "page2.scrml": `<program>
\${
  export function helper() { return 2 }
  type Op:enum = {
    Ping
  }
}
<endpoint path="/b" method="POST" accepts=Op>
  <Ping : { ok: true }>
</endpoint>
<p>p2</p>
</program>
`,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
  });
});

// ---------------------------------------------------------------------------
// NITs — the path-rule messages are the bootstrap's
// ---------------------------------------------------------------------------

describe("path-rule messages match the bootstrap (compiler/self-host-v2/analyze.scrml)", () => {
  test("reserved prefix: no period after \"Choose another path\"", () => {
    const errs = compileOne(app(`path="/_scrml/x" method="POST" accepts=Op`));
    expect(errs.map((e) => e.code)).toEqual(["E-ENDPOINT-ROUTE-DUPLICATE"]);
    expect(errs[0].message).toMatch(/Choose another path \(line/);
  });
  test("path grammar: the bootstrap's text, ending at the §61.7 parenthesis", () => {
    const errs = compileOne(app(`path="/a?x" method="POST" accepts=Op`));
    expect(errs.map((e) => e.code)).toEqual(["E-ENDPOINT-PATH-INVALID"]);
    expect(errs[0].message).toContain(
      "E-ENDPOINT-PATH-INVALID: `path=\"/a?x\"` on `<endpoint>` — `?` is not a path character (only unreserved " +
      "characters and `/` — no query, fragment, percent-escape or path parameter) (§61.7: a `path=` is an absolute " +
      "path of RFC 3986 unreserved characters and `/`, with no `.`, `..` or empty segment; a trailing `/` is allowed) (line",
    );
    expect(errs[0].message).not.toContain("§61.3");
  });
  test("an astral character is named by its first UTF-16 unit, as the bootstrap's substring(i, i + 1) does", () => {
    const errs = compileOne(app(`path="/\u{1F600}" method="POST" accepts=Op`));
    expect(errs.map((e) => e.code)).toEqual(["E-ENDPOINT-PATH-INVALID"]);
    expect(errs[0].message).toContain("`\uD83D` is not a path character");
  });
});
