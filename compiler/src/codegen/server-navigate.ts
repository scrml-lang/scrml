/**
 * SPEC §20.1 / §20.2 — `navigate(path)` in a SERVER-escalated function (S473).
 *
 * §20.1: "If the calling function is server-escalated: `navigate(path)` compiles to a 302
 * redirect (hard navigation)." Before S473 the server lowering reused the CLIENT runtime's
 * `_scrml_navigate(path)` (`window.location.href = path`), which does not exist in the server
 * bundle: the call threw `ReferenceError` AFTER the body's `?{}` writes had run, so the client
 * saw an error for a write that had committed, and resubmitted it.
 *
 * THE LOWERING. `navigate(path)` on the server becomes `_scrml_server_navigate(path, origin)`.
 * It ENDS the server function: it throws a navigation SIGNAL (never an error), and every route
 * handler catches it around its body (`_scrml_nav_settle`) and answers with the navigation.
 * A throw rather than a `return` because the call can sit at any depth — inside a `match` arm
 * (lowered as a nested function), inside an in-process peer callable another server function
 * awaited, inside a nested block — and every one of them must end the request, not just the
 * innermost function. The implicit per-handler transaction (§8.9.2) COMMITS: the body finished
 * by navigating, not by failing. A `transaction { }` block the call leaves rolls back, exactly
 * as a `return` out of it does (§19.10.3, S453/B1a).
 *
 * THE WIRE. SPEC §20.1 fixes the 302; it is silent on how scrml's own fetch wrapper learns of it
 * (a browser `fetch` FOLLOWS a 302 by itself and would hand the wrapper the target page's HTML).
 * Reading taken here:
 *   - a request from scrml's client fetch wrapper carries `X-Scrml-Fetch: 1`; it is answered
 *     `204` with `X-Scrml-Navigate: <target>`. The wrapper performs the hard navigation
 *     (`location.assign`) and never settles, so the caller's following statements do not run;
 *   - any other client (a direct HTTP request) gets a real `302` with `Location: <target>`.
 *
 * PATH SAFETY. §20.1 calls the path "a developer-defined URL string" and says no more. The
 * target is admitted only when it is
 *   - a same-site absolute path: begins with `/`, and the next character is not `/` or `\`
 *     (`//host` and `/\host` are other hosts to a browser), or
 *   - an absolute http(s) URL whose ORIGIN the developer wrote literally at the call site
 *     (`navigate("https://idp.example/authorize?state=${s}")`): the compiler reads that origin
 *     from the literal text and the runtime checks the final URL has exactly that origin.
 * Anything else — a data-supplied absolute URL (open redirect), `//evil`, `javascript:`, a
 * relative `posts` / `?x` (which would resolve against the server function's endpoint, not the
 * page) — is refused. C0 controls and DEL are refused outright (CR/LF would split the
 * `Location` header; tab/newline are stripped by URL parsers, turning `/\t/evil` into `//evil`).
 * Non-ASCII is percent-encoded, as a header value must be ASCII. A refusal is a host error: the
 * request fails (500) and the implicit transaction rolls back.
 */

import type { ExprNode } from "../types/ast.ts";

/** The server-side lowering of `navigate(path)` (throws the navigation signal). */
export const SERVER_NAVIGATE_FN = "_scrml_server_navigate";

/** The route handler's catch around its body: navigation signal → Response. */
export const NAV_SETTLE_FN = "_scrml_nav_settle";

/** The client fetch-wrapper helper that performs the navigation a server function ended with. */
export const CLIENT_FOLLOW_NAV_FN = "_scrml_follow_server_navigate";

/** Request header scrml's own fetch wrapper sends: "answer a navigation with the header, not a 302". */
export const NAV_REQUEST_HEADER = "X-Scrml-Fetch";

/** Response header carrying the navigation target to scrml's fetch wrapper. */
export const NAV_RESPONSE_HEADER = "X-Scrml-Navigate";

/**
 * The text appended to a route handler's body IIFE (`})()` + this + `;`). emit-server.ts emits
 * it on every handler and strips it again (generateServerJs post-pass) from a server bundle in
 * which no `_scrml_server_navigate(` call was emitted, so an app without a server-side
 * navigate() is byte-unchanged.
 */
export const NAV_SETTLE_CATCH = `.catch((_scrml_e) => ${NAV_SETTLE_FN}(_scrml_e, _scrml_req))`;

/**
 * The origin an absolute http(s) navigate target is FIXED to by its literal source text, or null.
 *
 * `prefix` is the literal text the target starts with; `complete` says whether it is the whole
 * target (a plain string literal) or only its start (a template's text before the first `${`,
 * the left operand of a `+`). A partial prefix fixes the origin only when the authority is
 * already terminated (`/`, `?` or `#`) inside it — `https://good.example${x}` does not, since
 * `x` could continue the host name. The runtime re-checks the final URL against this origin,
 * so a mistaken answer here can only refuse, never admit.
 */
export function fixedOriginOfLiteral(prefix: string, complete: boolean): string | null {
  if (typeof prefix !== "string") return null;
  const text = complete ? prefix : (prefix.match(/^https?:\/\/[^/?#\\\s]+[/?#]/i)?.[0] ?? null);
  if (text === null || !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** The literal text a navigate target ExprNode starts with, and whether it is the whole target. */
function literalPrefixOf(node: any): { text: string; complete: boolean } | null {
  if (!node || typeof node !== "object") return null;
  if (node.kind === "lit" && node.litType === "string" && typeof node.value === "string") {
    return { text: node.value, complete: true };
  }
  if (node.kind === "lit" && node.litType === "template") {
    const raw = typeof node.raw === "string" ? node.raw.replace(/^`/, "").replace(/`$/, "") : "";
    const cut = raw.indexOf("${");
    if (cut === -1 && node.hasInterpolation !== true && typeof node.value === "string") {
      return { text: node.value, complete: true };
    }
    return { text: cut === -1 ? raw : raw.slice(0, cut), complete: false };
  }
  if (node.kind === "binary" && node.op === "+") {
    const left = literalPrefixOf(node.left);
    return left === null ? null : { text: left.text, complete: false };
  }
  return null;
}

/** The fixed origin of a navigate target ExprNode (see `fixedOriginOfLiteral`). */
export function navigateFixedOrigin(node: ExprNode | null | undefined): string | null {
  const prefix = literalPrefixOf(node);
  return prefix === null ? null : fixedOriginOfLiteral(prefix.text, prefix.complete);
}

/** The fixed origin of a navigate target given as emitted/source TEXT (the string fallback). */
export function navigateFixedOriginOfText(text: string): string | null {
  const t = (text ?? "").trim();
  const q = t[0];
  if (q === '"' || q === "'") {
    // A whole quoted literal: complete when it closes at the end with no `+` tail.
    const close = t.indexOf(q, 1);
    if (close === t.length - 1 && !t.slice(1, close).includes("\\")) return fixedOriginOfLiteral(t.slice(1, close), true);
    if (close > 0) return fixedOriginOfLiteral(t.slice(1, close), false);
    return null;
  }
  if (q === "`") {
    const body = t.slice(1);
    const cut = body.indexOf("${");
    const end = body.indexOf("`");
    if (cut === -1 && end === body.length - 1 && !body.includes("\\")) return fixedOriginOfLiteral(body.slice(0, end), true);
    const stop = cut === -1 ? end : (end === -1 ? cut : Math.min(cut, end));
    return stop > 0 ? fixedOriginOfLiteral(body.slice(0, stop), false) : null;
  }
  return null;
}

/** The emitted server call for `navigate(<pathExpr>)`. */
export function serverNavigateCall(pathExpr: string, fixedOrigin: string | null): string {
  return `${SERVER_NAVIGATE_FN}(${pathExpr}, ${fixedOrigin === null ? "null" : JSON.stringify(fixedOrigin)})`;
}

/**
 * The server-bundle helpers, injected once (generateServerJs post-pass) when the bundle calls
 * `_scrml_server_navigate(`. Plain declarations under the reserved `_scrml_` prefix; host
 * globals through `_scrml_g` like the rest of the server bundle.
 */
export const SERVER_NAVIGATE_HELPER_LINES: readonly string[] = [
  "",
  "// --- §20.1 (S473): navigate() in a server function is a hard navigation (compiler-generated) ---",
  "// navigate(path) ENDS the server function: _scrml_server_navigate throws a navigation signal",
  "// (marked with _SCRML_NAVIGATE, carrying the already-checked target) and the route handler",
  "// catches it around its body (_scrml_nav_settle), so the statements after the call never run.",
  "// The handler's implicit transaction commits — the body finished by navigating, not by failing.",
  "// The signal is an Error only so that one reaching a server context with no route handler to",
  "// answer it (a page loader, a stream) fails that request with this message, not an opaque value.",
  "const _SCRML_NAVIGATE = _scrml_g.Symbol.for(\"scrml.navigate\");",
  "function _scrml_server_navigate(path, fixedOrigin) {",
  "  const target = _scrml_nav_target(path, fixedOrigin);",
  "  throw _scrml_g.Object.assign(",
  "    new _scrml_g.Error(\"scrml: navigate(\" + _scrml_g.JSON.stringify(target) + \") ended this server function, but it was not reached through a server-function route, so nothing could answer it with a navigation (SPEC §20.1)\"),",
  "    { [_SCRML_NAVIGATE]: target },",
  "  );",
  "}",
  "// The navigation target, or a refusal. Admitted: a same-site path (\"/x\" — not \"//x\" or \"/\\x\",",
  "// which a browser reads as another host), or an http(s) URL whose origin the source wrote",
  "// literally at the call site (`fixedOrigin`). Never data-chosen: no open redirect. Control",
  "// characters are refused (CR/LF would split the Location header); non-ASCII is percent-encoded.",
  "function _scrml_nav_target(path, fixedOrigin) {",
  "  const target = _scrml_g.String(path);",
  "  let admitted = false;",
  "  if (!/[\\x00-\\x1f\\x7f]/.test(target)) {",
  "    if (target[0] === \"/\" && target[1] !== \"/\" && target[1] !== \"\\\\\") {",
  "      admitted = true;",
  "    } else if (fixedOrigin !== null && /^https?:\\/\\//i.test(target)) {",
  "      try {",
  "        admitted = new _scrml_g.URL(target).origin === fixedOrigin;",
  "      } catch {",
  "        admitted = false;",
  "      }",
  "    }",
  "  }",
  "  if (!admitted) {",
  "    throw new _scrml_g.Error(",
  "      \"scrml: navigate() refused the target \" + _scrml_g.JSON.stringify(target) + \": a server-side navigate() \" +",
  "      \"goes to a path that begins with a single \\\"/\\\", or to an http(s) URL whose origin is written \" +",
  "      \"literally in the navigate() call (SPEC §20.1)\",",
  "    );",
  "  }",
  "  return target.replace(/[^\\x21-\\x7e]+/gu, (run) => _scrml_g.encodeURI(run));",
  "}",
  "// The route handler's catch around its body. A navigation signal becomes the response; any",
  "// other rejection is rethrown unchanged. scrml's own fetch wrapper sends X-Scrml-Fetch: 1 and",
  "// gets 204 + X-Scrml-Navigate (fetch would follow a 302 by itself and hand the wrapper the",
  "// target page's HTML); every other client gets the 302 redirect.",
  "function _scrml_nav_settle(err, req) {",
  "  if (err === null || typeof err !== \"object\" || !_scrml_g.Object.hasOwn(err, _SCRML_NAVIGATE)) throw err;",
  "  const target = err[_SCRML_NAVIGATE];",
  `  if (req.headers.get("${NAV_REQUEST_HEADER}") === "1") {`,
  `    return new _scrml_g.Response(null, { status: 204, headers: { "${NAV_RESPONSE_HEADER}": target, "Cache-Control": "no-store" } });`,
  "  }",
  "  return new _scrml_g.Response(null, { status: 302, headers: { \"Location\": target, \"Cache-Control\": \"no-store\" } });",
  "}",
];

/**
 * The client helper the fetch wrappers call when a server function's response names a
 * navigation (`X-Scrml-Navigate`). Emitted per file (emit-client.ts) only when that file's
 * server bundle navigates.
 */
export const CLIENT_FOLLOW_NAV_HELPER_LINES: readonly string[] = [
  "// --- §20.1 (S473): a server function ended with navigate() (compiler-generated) ---",
  `// Its response names the target in ${NAV_RESPONSE_HEADER}. Perform the hard navigation; the`,
  "// returned promise never settles, so the code awaiting the call does not run on while the page",
  "// is replaced. The server already admitted the target; it is re-checked here as a same-site",
  "// path or an http(s) URL before it reaches location.",
  `function ${CLIENT_FOLLOW_NAV_FN}(resp) {`,
  `  const target = resp.headers.get("${NAV_RESPONSE_HEADER}");`,
  "  const sameSite = target[0] === \"/\" && target[1] !== \"/\" && target[1] !== \"\\\\\";",
  "  if (/[\\x00-\\x1f\\x7f]/.test(target) || !(sameSite || /^https?:\\/\\//i.test(target))) {",
  "    throw new _scrml_g.Error(\"scrml: refused the navigation target \" + _scrml_g.JSON.stringify(target) + \" (SPEC §20.1)\");",
  "  }",
  "  _scrml_g.location.assign(target);",
  "  return new _scrml_g.Promise(() => {});",
  "}",
  "",
];
