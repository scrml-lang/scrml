// ---------------------------------------------------------------------------
// <endpoint> declaration — parser recognition (S219 W2, endpoint-primitive-2026-06-25)
// ---------------------------------------------------------------------------
//
// SPEC §61 (Typed Inbound Endpoint). W2 (the parser wave) makes the parser
// RECOGNIZE the `<endpoint path= method= accepts=Enum> <Variant…> … </endpoint>`
// declaration and fire the three parse-level diagnostics. This is parser-only —
// no codegen, no HTML/server emission; a VALID `<endpoint>` parses to an
// `endpoint-decl` AST node and emits nothing (later waves consume the node).
//
// §61.2 grammar:
//   endpoint-decl  ::= '<endpoint' endpoint-attrs '>' endpoint-arm+ '</endpoint>'
//   endpoint-attrs ::= path-attr method-attr accepts-attr
//   path-attr      ::= 'path=' string-literal           (the contract URL; §61.7)
//   method-attr    ::= 'method=' http-method-literal     (GET|POST|PUT|PATCH|DELETE)
//   accepts-attr   ::= 'accepts=' enum-type-ref          (a §14/§53 :enum; RAW in W2)
//   endpoint-arm   ::= variant-arm                       (REUSES the §18.0.1 arm grammar)
//
// The KEY divergence from `<api>` (§60): the body is `<Variant>` ARMS (the
// `<match>` arm grammar, REUSED via parseMatchArms), NOT bare endpoint lines.
//
// Two assertion surfaces (mirroring api-decl-parser.test.js):
//   (A) AST shape — via runBlockSplitter + buildAST (the parser stage directly)
//   (B) diagnostics + exit partition — via compileScrml (the real result.errors
//       stream; §34 Errors land in result.errors, NEVER result.warnings).

import { describe, test, expect } from "bun:test";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runBlockSplitter } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { compileScrml } from "../../src/api.js";

const TMP = mkdtempSync(join(tmpdir(), "endpoint-decl-"));

// ---- (A) parser-stage helpers (AST shape) --------------------------------
function parse(src) {
  const bs = runBlockSplitter({ filePath: "t.scrml", source: src });
  return buildAST(bs);
}
function endpointNode(src) {
  const { ast } = parse(src);
  return (ast.nodes ?? []).find(n => n && n.kind === "endpoint-decl") ?? null;
}
function tabCodes(src) {
  const { errors } = parse(src);
  return (errors ?? []).map(e => e.code).filter(Boolean);
}

// ---- (B) full-compile helpers (diagnostic partition + exit) --------------
function compile(src) {
  const p = join(TMP, `t-${Math.random().toString(36).slice(2)}.scrml`);
  writeFileSync(p, src);
  return compileScrml({ inputFiles: [p], write: false, outputDir: join(TMP, "out") });
}
function errCodes(r, code) {
  return (r.errors ?? []).filter(e => (e.code ?? "") === code);
}
function warnCodes(r, code) {
  return (r.warnings ?? []).filter(w => (w.code ?? "") === code);
}

// ===========================================================================
describe("<endpoint> parser — valid declaration → endpoint-decl AST node (§61.2)", () => {
  // The SCOPE example (docs/changes/endpoint-primitive-2026-06-25/SCOPE.md) —
  // bareword-payload arm form. The arms reuse the §18.0.1 `<match>` grammar.
  const VALID =
    `<endpoint path="/fsp" method="POST" accepts=FspMethod>\n` +
    `    <FleetStatus : fleetStatus()>\n` +
    `    <Dispatch prompt proj : dispatch(prompt, proj)>\n` +
    `    <DeltaSince seq : deltasSince(seq)>\n` +
    `</endpoint>\n`;

  test("produces a single endpoint-decl node with path/method/acceptsRaw + 3 arms", () => {
    const n = endpointNode(VALID);
    expect(n).not.toBeNull();
    expect(n.kind).toBe("endpoint-decl");
    expect(n.path).toBe("/fsp");
    expect(n.method).toBe("POST");
    // accepts= is captured RAW (the bareword enum type-ref) — NOT resolved (W3).
    expect(n.acceptsRaw).toBe("FspMethod");
    expect(Array.isArray(n.arms)).toBe(true);
    expect(n.arms.length).toBe(3);
  });

  test("arms[0] captures variantName/bodyForm/bodyRaw via the §18.0.1 reuse", () => {
    const n = endpointNode(VALID);
    expect(n.arms.map(a => a.variantName)).toEqual(["FleetStatus", "Dispatch", "DeltaSince"]);
    // Each arm here uses the canonical inside-opener `:`-shorthand body form.
    expect(n.arms[0].bodyForm).toBe("shorthand");
    expect(n.arms[0].bodyRaw).toBe("fleetStatus()");
    expect(n.arms[1].bodyRaw).toBe("dispatch(prompt, proj)");
    expect(n.arms[2].bodyRaw).toBe("deltasSince(seq)");
  });

  test("valid declaration fires NO E-ENDPOINT-* parse diagnostics", () => {
    const codes = tabCodes(VALID).filter(c => c.startsWith("E-ENDPOINT-"));
    expect(codes).toEqual([]);
  });

  test("the §61.2 canonical parenthesized-payload arm form parses clean", () => {
    // `<Dispatch(prompt, proj) : expr>` — the canonical positional payload form
    // (§61.2). parseMatchArms captures the parenthesized payload separately.
    const src =
      `<endpoint path="/fsp" method="POST" accepts=FspMethod>\n` +
      `    <FleetStatus : fleetStatus()>\n` +
      `    <Dispatch(prompt, proj) : dispatch(prompt, proj)>\n` +
      `    <DeltaSince(seq) : deltasSince(seq)>\n` +
      `</endpoint>\n`;
    const n = endpointNode(src);
    expect(n.arms.length).toBe(3);
    expect(n.arms[1].variantName).toBe("Dispatch");
    expect(n.arms[1].payloadBindingsRaw).toBe("prompt, proj");
    expect(n.arms[2].payloadBindingsRaw).toBe("seq");
    expect(tabCodes(src).filter(c => c.startsWith("E-ENDPOINT-"))).toEqual([]);
  });

  test("method= accepts a bareword (unquoted) HTTP method literal too", () => {
    const src =
      `<endpoint path="/fsp" method=GET accepts=FspMethod>\n` +
      `    <FleetStatus : fleetStatus()>\n` +
      `</endpoint>\n`;
    const n = endpointNode(src);
    expect(n.method).toBe("GET");
    expect(tabCodes(src).filter(c => c.startsWith("E-ENDPOINT-"))).toEqual([]);
  });
});

// ===========================================================================
describe("<endpoint> parser — E-ENDPOINT-PATH-MISSING (§61.9)", () => {
  const SRC =
    `<endpoint method="POST" accepts=FspMethod>\n` +
    `    <FleetStatus : fleetStatus()>\n` +
    `</endpoint>\n`;

  test("an <endpoint> with no path= fires E-ENDPOINT-PATH-MISSING (parser stage)", () => {
    expect(tabCodes(SRC)).toContain("E-ENDPOINT-PATH-MISSING");
  });

  test("the Error lands in result.errors, never result.warnings", () => {
    const r = compile(SRC);
    expect(errCodes(r, "E-ENDPOINT-PATH-MISSING").length).toBe(1);
    expect(warnCodes(r, "E-ENDPOINT-PATH-MISSING").length).toBe(0);
  });
});

// ===========================================================================
describe("<endpoint> parser — E-ENDPOINT-METHOD-INVALID (§61.9)", () => {
  const SRC =
    `<endpoint path="/fsp" method="FETCH" accepts=FspMethod>\n` +
    `    <FleetStatus : fleetStatus()>\n` +
    `</endpoint>\n`;

  test("an unrecognized HTTP method fires E-ENDPOINT-METHOD-INVALID (parser stage)", () => {
    expect(tabCodes(SRC)).toContain("E-ENDPOINT-METHOD-INVALID");
  });

  test("the Error lands in result.errors, never result.warnings", () => {
    const r = compile(SRC);
    expect(errCodes(r, "E-ENDPOINT-METHOD-INVALID").length).toBe(1);
    expect(warnCodes(r, "E-ENDPOINT-METHOD-INVALID").length).toBe(0);
  });

  test("the five recognized methods gate clean; a verb-only method fires", () => {
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const ok =
        `<endpoint path="/p" method="${m}" accepts=FspMethod>\n` +
        `    <FleetStatus : fleetStatus()>\n` +
        `</endpoint>\n`;
      expect(tabCodes(ok)).not.toContain("E-ENDPOINT-METHOD-INVALID");
    }
    const bad =
      `<endpoint path="/p" method="HEAD" accepts=FspMethod>\n` +
      `    <FleetStatus : fleetStatus()>\n` +
      `</endpoint>\n`;
    expect(tabCodes(bad)).toContain("E-ENDPOINT-METHOD-INVALID");
  });

  test("a missing method= also fires E-ENDPOINT-METHOD-INVALID (no recognized literal)", () => {
    const noMethod =
      `<endpoint path="/p" accepts=FspMethod>\n` +
      `    <FleetStatus : fleetStatus()>\n` +
      `</endpoint>\n`;
    expect(tabCodes(noMethod)).toContain("E-ENDPOINT-METHOD-INVALID");
  });
});

// ===========================================================================
describe("<endpoint> parser — E-ENDPOINT-ACCEPTS-MISSING (§61.9)", () => {
  const SRC =
    `<endpoint path="/fsp" method="POST">\n` +
    `    <FleetStatus : fleetStatus()>\n` +
    `</endpoint>\n`;

  test("an <endpoint> with no accepts= fires E-ENDPOINT-ACCEPTS-MISSING (parser stage)", () => {
    expect(tabCodes(SRC)).toContain("E-ENDPOINT-ACCEPTS-MISSING");
  });

  test("the Error lands in result.errors, never result.warnings", () => {
    const r = compile(SRC);
    expect(errCodes(r, "E-ENDPOINT-ACCEPTS-MISSING").length).toBe(1);
    expect(warnCodes(r, "E-ENDPOINT-ACCEPTS-MISSING").length).toBe(0);
  });
});

// ===========================================================================
describe("<endpoint> parser — valid declaration now mounts a server handler (W4 supersedes the W2 no-emission contract)", () => {
  test("a valid <endpoint> compiles exit-clean and emits a server route handler", () => {
    // The full SCOPE example: the enum + arm functions declared so the fixture
    // is genuinely valid; a sibling <p>hello</p> confirms the file emitted.
    // W2 emitted NOTHING for the endpoint; W4 (endpoint-decl-codegen) now mounts
    // the handler — the route path `/fsp` is the codegen marker. (The full W4
    // server-shape assertions live in endpoint-decl-codegen.test.js; here we just
    // confirm the parser feeds a genuinely-valid node that the codegen emits.)
    const r = compile(
      `\${ type FspMethod:enum = { FleetStatus, Dispatch(prompt: string, project: string), DeltaSince(seq: int) } }\n` +
      `\${ fn fleetStatus() { "ok" } }\n` +
      `\${ fn dispatch(p, pr) { "ok" } }\n` +
      `\${ fn deltasSince(s) { "ok" } }\n` +
      `<endpoint path="/fsp" method="POST" accepts=FspMethod>\n` +
      `    <FleetStatus : fleetStatus()>\n` +
      `    <Dispatch prompt proj : dispatch(prompt, proj)>\n` +
      `    <DeltaSince seq : deltasSince(seq)>\n` +
      `</endpoint>\n` +
      `<p>hello</p>\n`
    );
    // No E-ENDPOINT-* errors on the valid declaration.
    const epErrs = (r.errors ?? []).filter(e => (e.code ?? "").startsWith("E-ENDPOINT-"));
    expect(epErrs).toEqual([]);
    // The endpoint route handler is mounted in the SERVER bundle at the verbatim
    // `path=` (§61.7). The route NEVER leaks into the CLIENT bundle (§61.6 skip).
    let serverHasRoute = false;
    let sawClient = false;
    for (const [, entry] of (r.outputs ?? new Map())) {
      if (typeof entry?.serverJs === "string" && entry.serverJs.includes("/fsp")) {
        serverHasRoute = true;
        expect(entry.serverJs).toContain("_scrml_route_endpoint_");
      }
      if (typeof entry?.clientJs === "string") {
        sawClient = true;
        expect(entry.clientJs).not.toContain("/fsp");
        expect(entry.clientJs).not.toContain("_scrml_route_endpoint");
      }
      // The sibling `<p>hello</p>` SHOULD render — confirms the file emitted.
      if (typeof entry?.html === "string") {
        expect(entry.html).toContain("hello");
      }
    }
    expect(serverHasRoute).toBe(true);
    expect(sawClient).toBe(true);
  });
});
