# auth.map.md
# project: scrml
# updated: 2026-11-08T16:47:39Z  commit: f92d1a8fb
# The repo has no auth of its own (a compiler). This map covers the auth/session/CSRF/protect surface the compiler EMITS into user programs, and the stdlib auth modules.
# compiler/src (impl#1) auth code is unchanged fa0e875b4..f92d1a8fb; S475 touched only the bootstrap.

## Strategy
Type: session (compiler-owned session store, SPEC §20.5) + compiler-auto middleware via `<program>` attributes (SPEC §40.2: `auth=`, `loginRedirect=`, `csrf=`, `sessionExpiry=`; `role=` closed-form predicate §40.1.1)
Library: none external; emitted code. stdlib/auth (JWT, password, flows, rate limit, TOTP) and stdlib/oauth (Google, GitHub, Discord, Microsoft, PKCE) for app-level use
Config: `<program …>` attributes, parsed into FileAST.authConfig (types/ast.ts AuthConfig :1510: auth, loginRedirect, csrf, sessionExpiry) and middlewareConfig (MiddlewareConfig :1522: cors, log, ratelimit, headers, idempotencyStore)
SPEC: §40 Middleware and Request Pipeline (:33905; §40.9 closure analysis / minimal playable surface), §20.5 Session Context (:25176), §6.6.9 E-REACTIVE-003 (:3955), §52 State Authority, §11 `protect=` (content folded elsewhere), §53.10 refinement + protect

## Roles / Permission Levels
Roles are user-declared (a role enum) and referenced by `auth="role:X"` / `role=`. compiler/src/auth-graph.ts builds the AuthGraph (auth sites, role enum, per-gate classification, auth-redirect cross-ref); types in compiler/src/types/auth-graph.ts (AuthGate, AuthSiteKind, RoleEnum, RoleClassification). reachability/ + reachability-solver.ts compute the per-role playable surface (ChunkPlan, RolePlayableSurface).

## Guards / Middleware (impl#1 emitters and analyzers)
auth-graph.ts — compiler/src — auth-site enumeration, role resolution, redirect cross-ref
protect-analyzer.ts (PAError) — compiler/src — `protect=` field analysis
codegen/protect-flow.ts, codegen/protect-egress.ts — §14.8.9 provenance flow; keeps protected fields off the wire
codegen/server-session-guard.ts — backstop for E-SESSION-AMBIENT-SERVER: `@session` in a server fn must not read the client request body
codegen/session-store-emit.ts — the one emitted session-store declaration (shared text with protect-flow's recognizer)
codegen/session-config-resolve.ts — session config resolution
codegen/tenant-egress.ts, tenant-sql-subset.ts, tenant-startup-check.ts, tenant-schema-hazards.ts — multi-tenant isolation
codegen/server-reached-exports.ts, route-splitter.ts, route-inference.ts — which functions become server routes
codegen/url-attr-guard.ts, attr-injection-sink.ts, runtime-url-guard.js — executable-sink / URL guards
diagnostic-secrets.ts — keeps secret values out of diagnostics
static-serve-policy.js — the one static-serve policy (§47.13); scrml-boot dev imports it
commands/refusal-gate.js — refuses writing a build that has refusals (compile/build)

## Bootstrap (impl#2) equivalents
CSRF double-submit: runtime.js `CSRF_COOKIE` = "scrml_csrf", `CSRF_HEADER` = "X-CSRF-Token" (:4726); server-runtime.js checks the pair.
server-runtime.js `tenantGate` :1196, `route` :1130; analyze.scrml `placePass` :32043 decides placement; `<host>` allowlist (host-surface.scrml) + url.scrml sink rules.

## Token Lifecycle
Issued: emitted session store on login flows (app code; stdlib/auth/flows.scrml: verifyMagicLink, verifyEmail, verifyResetToken; stdlib/auth/jwt.scrml: signJwt / verifyJwt / decodeJwt, JwtError)
Validated: emitted middleware per `auth=` gate; server fns read `@session` from the server-side store only (E-SESSION-AMBIENT-SERVER)
Refresh: none built in
Expiry: `sessionExpiry=` on `<program>` (e.g. "7d"; route-inference.ts :359)

## Tests
compiler/tests/integration/{page-auth-required-gates-page,program-auth-required-gates-member-pages}.test.js, integration/security-*-pack/, unit/ratelimit-per-route-scope.test.js; conformance/cases/{auth,protect,tenant,middleware}/; bootstrap slice-m4 server-* tests.

---

# Carried detail (pre-f92d1a8fb body sections)
The sections below are the previous map generation's body (mostly impl#1, `compiler/src`), carried rather than lost. They were NOT re-read line by line. Each carries a verification line from f92d1a8fb: code identifiers checked to exist, `symbol` :line anchors re-derived by grep, cited paths checked, cited gaps whose marker is no longer `open`, and STALE-RISK flags for the CI/bot facts that changed in S468–S475. Where a carried section disagrees with a refreshed section above, the refreshed section wins.

## (carried) Strategy
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 3/3 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
Type: session-cookie auth (declarative, `<program>`-attribute driven, now backed by a compiler-owned `session` server builtin) + stdlib JWT (HS256 self-signed) + JWKS RS256 (external-IdP verification) + OAuth2 (5 providers) + magic-link/email-verify/password-reset (token-store flows).
Library: no external auth package — hand-rolled on Bun Web Crypto (`crypto.subtle`) + Bun's `Bun.password` (argon2).
Config: `<program auth="required|optional" login-redirect=... csrf="auto|on|off" session-expiry="1h" session-secure="true|false">` attributes. **NOTE — three separate, non-unified config shapes** (a pre-existing architecture, not introduced this window): `compute-program-config.ts`'s own `AuthConfig` interface [:28] (ProgramConfig-level, `{auth, loginRedirect, csrf, sessionExpiry, sessionSecure}` — `sessionSecure` is the raw `"true"`/`"false"` string), `route-inference.ts`'s `AuthMiddleware` interface [:294] (route-inference OUTPUT, `sessionSecure?: boolean` coerced), and `types/ast.ts`'s own `AuthConfig` [:1503] (the FileAST-level copy consumed elsewhere, `{auth, loginRedirect, csrf, sessionExpiry}` — did NOT gain `sessionSecure` this window). Codegen (`emit-server.ts`) reads the `AuthMiddleware` entry OR, for a no-auth session app, the raw `session-secure` attribute directly off the `<program>`/`<page>` node.

## (carried) §20.5 `session` server builtin (NEW this window — S265/S266, i29e/#29-E, #99 + #104)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 9/9 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

The write half of the session model: a server function can now `session.set(key, value)` / `session.destroy()` in addition to the pre-existing read-only `@currentUser`/`@session` projections. `session` is a RESERVED identifier bound into scope automatically inside a server-escalated function body (`type-system.ts`'s `annotateNodes`, `scopeChain.bind("session", ...)` when `boundary === "server"`) — referencing `session` also AUTO-ESCALATES the enclosing function to server (mirrors the SSE `route` auto-injection and the §38.6 channel-builtin injection).

**API surface** (§20.5, `compiler/SPEC.md:15738-15743` — the fenced `session` object shape under
`### 20.5 Session Context` at `:15719`; the write half `#### 20.5.1` is at `:15792`):

⛑ **S391 — THIS ANCHOR WAS WRONG *FROM BIRTH*, AND IT IS THE THIRD SUCH FINDING THIS PASS
(invariant 77).** It read `SPEC.md:14566-14571`. That range is **§19.9.x error handling** — at
`0dd659a1` line 14566 was *"4. The client code handles the error via match, `?`, `!{}`, or
`<errorBoundary>`"*, and the range now resolves to `#### 19.9.2 HTTP Status Code Mapping`. **It has
never pointed at §20.5.** A mechanical delta-refresh would have carried it forward forever: it
shifts by the correct +6 like every other citation in the file, and lands on the wrong section just
as accurately as before. Re-derived by `grep -n 'session\.isAuth' compiler/SPEC.md` and reading the
enclosing heading. **The TABLE BELOW WAS SPOT-CHECKED AGAINST THE REAL FENCE AND IS CORRECT** —
`session.userId` `string | not`, `session.isAuth` `boolean`, `session.role` `string | not`,
`session.get(key)`, `session.set(key, v)`, `session.destroy()` all match. **Only the pointer was
wrong, which is exactly why it survived: the content it introduced was right.**

| Member | Type | Purpose |
|---|---|---|
| session.userId | string \| not | authenticated user ID, `not` if not logged in |
| session.isAuth | boolean | true if the request carries a valid session |
| session.role | string \| not | authenticated user's role, `not` if unset |
| session.get(key) | any | retrieve a custom session value |
| session.set(key, v) | void | store a custom session value (reserved-key guarded, see below) |
| session.destroy() | void | end the session (delete record + clear cookie) |

`session` has NO per-member type refinement yet (`asIs` at the type level) — a developer must narrow before use.

**Cookie mechanism** (`compiler/src/codegen/emit-server.ts`): `_secureCookieMode` (`authMiddlewareEntry.sessionSecure !== false && !== "false"`, default true) decides `_sessionCookieName`: secure mode -> `__Host-scrml_sid` (browser-enforced: forbids Domain attribute + requires Secure + Path=/), always emitted `Secure`; opt-out (`session-secure="false"`) -> plain `scrml_sid`, no `Secure` (for a conscious TLS-less deployment, e.g. a bare-http LAN mesh). The reader (`_scrml_read_session_id`) is MODE-GATED to the mode-appropriate cookie name ONLY — no cross-name fallback (closing a cookie-tossing / session-fixation vector where a sibling subdomain sets the plain name to force-auth a visitor into an attacker session). `_scrml_session_begin(req)` loads the incoming session record; TTL is `session-expiry`-derived `_scrml_session_max_age` (seconds), threaded into both the cookie `Max-Age` and the durable-store TTL. `_scrml_warn_insecure_cookie` (secure mode only) logs a once-per-process warning when a Secure cookie is set over bare http on a non-local host.

**Reserved-key guard (B5).** `session.set("csrfToken", …)` writes the compiler-owned §40.2 CSRF synchronizer-token key — a literal write is a COMPILE ERROR (`E-SESSION-RESERVED-KEY`, fired in `codegen/emit-expr.ts:emitCall`); a dynamic-key write with a runtime `"csrfToken"` key is refused at RUNTIME as a no-op by `_scrml_session_begin`'s setter guard. `userId`/`role` and preference keys remain writable.

**Context gate.** `session.*` is valid ONLY inside a web-app server route-handler function body — an SSE `server function*`, an `<endpoint>` arm, a `<machine>` method, a serverLoad cell, an in-process server-fn helper, or a headless `kind="tool"` program have no cookie-session request/response context and fire `E-SESSION-CONTEXT`. A bare `session` VALUE-use (returned/assigned/passed as an argument rather than accessed via member/index/call) fires `E-SESSION-VALUE`. A `session` reference outside ANY server-escalated body (client-side, bare top-level `${ }`) fires `E-SCOPE-012` (reserved -> LIVE this window) — client-side session display uses the `@session` projection instead. See error.map.md for all four codes.

**Landed in two passes** (both PA-run adversarial S239 gates each caught HIGH auth holes a green suite shipped — see hand-off.md/changelog.md for the full narrative, not reproduced here): (1) the base primitive (`1e63bbb1`, #99) — an unanchored cookie-parse fix (5 sites, was session-fixation + logout-DoS), 5 context-gate false-negatives closed (`session["k"]`, `session?.x`, `session?.set()`, bare `session`, file-scope shadow), role decoupled from auth. (2) pass-2 hardening (`510cef8d`, #104) — the `__Host-`/`session-secure=` opt-out + the reserved-key guard (B4/B5) described above, PLUS a coordinator-found cross-name-fallback re-open fixed in the same pass (see "Cookie mechanism" above).

## (carried) §20.5 SESSION — the handler-prologue binding is a PROXY, and that is a confidentiality decision (NEW #435, GH #357)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 17/17 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**A `session` reference that survives into EMITTED TEXT needs an in-scope `session`, or it is a free
variable -> HTTP 500 `ReferenceError` on every authenticated call.** The shape that got there: a
`?{ … ${session.userId} … }` SQL interpolation carries its query as a **STRING** — params are captured
verbatim and rewritten only for `@name` sigils — so `session` in it is sigil-less AND invisible to the
emit-expr member/index lowering that handles every other `session.*` use. Adopter-reported as GH #357.

Three parts landed together in `emit-server.ts`:
1. **`_SESSION_BARE_TEXT_RE`** — the shared text-level detector, `/(^|[^\w$.])session\s*[.[]/`. **The
   left-guard `[^\w$.]` is load-bearing**: it stops `_scrml_session_store`, `sessionId`,
   `_scrml_read_session_id` and `_scrml_req._scrml_sess` from matching. No `g` flag (stateless for
   repeated `.test()` in emitter loops).
2. **`astSqlQueryUsesSession`**, ORed into `_anySessionBuiltin` so an interpolation-only use FORCES the
   session infra on (store, cookie wrap, prologue binding). Permissive by design — a false positive
   only emits unused infra.
3. **A conditional handler-scope SPLICE** of `const session = _scrml_session_bind(_scrml_req._scrml_sess)`,
   at the same insertion point as the `@currentUser` binding (so it is visible inside the nested
   `_scrml_result` IIFE the baseline-CSRF path emits), `_webAppShape`-gated.

**The binding SHALL be the Proxy, NEVER `const session = _scrml_req._scrml_sess`.** That object is an
accessor: getters `userId`/`role`/`isAuth`, methods `get`/`set`/`destroy`, **and RAW own-properties
`sid`/`_rec`/`_changes` — where `_rec` holds the full stored record INCLUDING the §40.2 `csrfToken`.**
A raw bind would turn the dynamic-key form into a raw property read at the wrong level:
`session["sid"]` discloses the live session id and `session["_rec"]` the whole record plus the CSRF
token, **at HTTP 200** — the exact defeat of the synchronizer-token defense this compiler owns. It
would also make `session[customKey]` read `undefined` instead of the record value.

The Proxy preserves BOTH accessor shapes so the bare binding **AGREES with the AST lowering, which is
KEPT** (three security gates match the literal `_scrml_req._scrml_sess.`; retiring it for a bare bind
blinds them):
| access | routes to |
|---|---|
| `session.userId` / `.role` / `.isAuth` | the getter (reads `_rec` via `this`) |
| `session.set` / `.get` / `.destroy` | the bound method |
| every OTHER key — `.customKey`, `[expr]` | `.get(key)` -> **`Object.hasOwn(_rec, key) ? (_rec[key] ?? null) : null`** — OWN-PROPERTY only since #452 (see below) |

Two implementation facts that are load-bearing, not stylistic: **`Reflect.get(t, k, t)` uses the TARGET
as receiver** (the getters read `this._rec`; a Proxy receiver re-enters the trap on `_rec` -> `t.get("_rec")`
-> null -> TypeError), and **`set()` returns false** so an assignment through the binding is a loud
strict-mode TypeError rather than a silent shadow write to the session object. Symbol keys pass through.

### Session read-side — TWO OPEN gaps, both ROUTED TO BRYAN. Read before touching the accessor.

- **`g-session-get-reserved-key-read-disclosure` (MED — re-scored from HIGH S325; still open, still
  ROUTED-TO-BRYAN). ⚠ THIS ENTRY MOVED TWICE THIS WINDOW AND THE LEDGER RECORDS ONLY ONE OF THE MOVES.**
  - **What is now CLOSED (silently, as a side-landing of #452):** the PROTOTYPE-CHAIN read. `get(key)`
    is `Object.hasOwn(this._rec, key) ? (this._rec[key] ?? null) : null` at `emit-server.ts:2692` — ⛑ **S384: `:2593` was ALREADY WRONG pre-window (it named a `lines.push("  };")`); RE-DERIVED BY GREP, not shifted.**
    Pre-fix and MEASURED on the emitted helper: `.get("__proto__")` returned `Object.prototype`, and
    `.get("constructor")` / `.get("toString")` / `.get("hasOwnProperty")` / `.get("valueOf")` /
    `.get("isPrototypeOf")` each returned a FUNCTION — `_rec` is `{ ...rec }`, a plain object, so the
    whole `Object.prototype` surface was reachable from a request-controlled key. A function value
    flowing into a `?{ … ${session.get(k)} … }` bind was an **HTTP 500 SQL TypeError reachable from a
    request parameter**; that is closed too. **`Object.hasOwn` and NOT `this._rec.hasOwnProperty(key)`
    is load-bearing:** `_rec` is built from `session.set` writes, so it can carry an own key literally
    named `hasOwnProperty`, which would shadow the method on the one record that attacks it. This is
    the entry's own remediation candidate **(iii)** — *"`hasOwnProperty` + prototype guard only, no key
    policy … arguably a plain bug fix needing no ruling"*, annotated *"(iii) is separable and should not
    wait on the ruling"*. It did not wait. **The ledger entry does not say so** — its `locus=` still
    reads `:2568(accessor .get — \`return this._rec[key] ?? null\`, no allowlist/denylist/hasOwnProperty)`
    and its prose still asserts *"`.get()` is one line — `return this._rec[key] ?? null` — with no
    allowlist, denylist, or `hasOwnProperty`"*. **Both are false at this HEAD.** See
    non-compliance.report.md S326-N2.
  - **What is still OPEN, and it is the part that needs a ruling:** the OWN-KEY read policy. Every own
    key of `_rec` is still readable by an attacker-chosen key — including the compiler-owned §40.2
    `csrfToken`, and including any adopter-written secret (`apiKey` came back verbatim as
    `sk-live-PROBE-SECRET-9f3c`). The §20.5 reserved-key guard is **WRITE-side only**
    (`session.set("csrfToken", …)` -> `E-SESSION-RESERVED-KEY`; a dynamic-key runtime write is a no-op).
    The question bryan owes is *should a request-controlled key reach a session read at all* — not
    "read-null vs error on csrfToken". The `csrfToken`-denylist framing is **security theater for the
    same-origin threat model and the map should not repeat it**: the compiler already publishes that
    token same-origin through three measured channels (`GET /_scrml/session`, un-auth'd and un-CSRF'd;
    the `<meta name="csrf-token">` SSR tag; a non-`HttpOnly` `scrml_csrf` cookie on the 403 retry). A
    synchronizer token MUST be same-origin readable — that IS the mechanism.
  - **REACHABILITY CHANGED this window and the direction is worse, not better.** Before #452 the
    `auth=` shape of this leak reached **no wire at all** — a bare handler return produced Bun's
    constant welcome page and the value went only to stderr. #452 fixes that by design and thereby takes
    this leak **from log-only to WIRE-LIVE**: MEASURED, `server function peek(k) { return { v:
    session.get(k) } }` under `auth="required"` returns `{"v":"<live csrf token>"}` at 200
    `application/json`, key taken from the request body. **Severity stayed MED deliberately** — a
    reachability change makes an entry more REAL, not more SEVERE, and the attacker model is unchanged
    (same-origin XSS or an adopter echoing a request-controlled key; POST-only; CSRF-gated;
    `Access-Control-Allow-Credentials` is never emitted anywhere in the compiler).
- **`g-session-context-scan-bare-form-sound` (MED, open).** `E-SESSION-CONTEXT`'s scan was widened to
  match the new bare form during #435, **regressed §20.5 conformance** (it string-matched the compiler's
  own emitted comments and generated guards), and was **TRIMMED before landing** — caught by the PA
  adversarial fix-vs-prefix pass after the agent had reported clean. The sound implementation needs a
  **lowering-site RECORD, not a text scan**, and it is a newly-REJECTING surface, so it is bryan's call.

## (carried) §52.15.1 `@currentUser` + `<channel auth=>` — the DANGLING-REFERENCE class (NEW #440)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 7/7 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

Same class as #357: **a runtime reference emitted with its binding/definition gated NARROWER than the
reference.** Compiles clean, zero diagnostics, `ReferenceError` -> HTTP 500 at request time.

- **`@currentUser` in a plain or SSE handler.** §52.15.1 says the ambient is resolved server-side from
  the session middleware, so a read REQUIRES the resolver. `_needsSessionInfra`'s detector matched only
  the `?{ … @currentUser … }` SQL shape, so a DIRECT expression read (`return { id: @currentUser.id }`,
  lowered to `IdentExpr{name:"@currentUser"}`) in an app with no `auth=`, no serverLoad and no `?{}`
  left `_scrml_current_user` unemitted while the handler splice still bound it. **`astReadsCurrentUserAmbient`**
  is the superset that catches both lowerings. The §36 SSE `function*` path additionally never spliced
  the binding at all — now spliced at handler scope before the nested generator closure, byte-identical
  construction to the route-handler path.
- **`<channel auth=>` with no `<program auth>`.** The WS-upgrade guard references `_scrml_auth_check(req)`,
  which calls `_scrml_session_middleware(req)`; both definitions were gated on `authMiddlewareEntry`, so
  a channel-auth-only program dangled the reference and 500'd at upgrade. `_hasChannelAuth` now forces
  `_needsSessionInfra`, and an `else if` arm emits **ONLY** the auth-check function — never the CSRF
  helpers, session-destroy, or the `@session`-projection routes, which stay `<program auth>`-specific.
  A channel-auth-only program's route surface is byte-identical to before. `loginRedirect` uses the RI
  default `/login` since no auth middleware supplies one.

**The store invariant was PROBED, not assumed:** widening `_needsSessionInfra` does NOT over-emit. A
read-only `@currentUser` program emits the in-memory Map + middleware + resolver and **not** the durable
on-disk store (§20.5 i29e — only an app that actually `session.set`/`.destroy`s gets the durable store).
Conformance fix-vs-prefix **1443/0** from a fresh PA process, executed handlers 500 -> 200.

**Standing rule for this family: every detector is PERMISSIVE BY DESIGN — a false POSITIVE only emits
unused session infra; a false NEGATIVE re-opens a 500.**

## (carried) §40.3 THE REQUEST ONION — one per compiled server, wrapping TOP-LEVEL dispatch (NEW, #654)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 13/13 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**Where a request-pipeline task STARTS.** Not at per-route emit. The chain is:

| Step | File | What it decides |
|---|---|---|
| 1. WHICH onion | `compiler/src/commands/select-request-onion.js` | `selectRequestOnion(serverModules)` → `{ onion, error }`. Zero candidates → `null` (no onion, byte-identical pre-onion output). One → mount it. **More than one → `E-MW-007`.** |
| 2. WHAT the onion IS (codegen) | `compiler/src/codegen/emit-server.ts` — gate `_scrml_hasMW` **`:2946`**, wrapper `function _scrml_mw_wrap(downstream)` **`:3105`**, exports `_scrml_mw_pipeline` **`:3242`** and `_scrml_mw_declared_in` **`:3259`** (⚑ CORRECTED S380 — all four shifted +12: the §52.13 protected-document guard export was inserted at `:2780-2790`, above every one of these) | Emits the onion and its mount CONTRACT. Nothing more. |
| 2b. HOW dispatch is split and wrapped (host, **NOT codegen**) | `compiler/src/commands/build.js:567-581` — `async function _scrml_dispatch(req, server)` **`:570`**, `function _scrml_onion_dispatch(req, server)` **`:577`** (⚑ CORRECTED S380 — both shifted +56: the §52.13 protected-document-registry code (`discoverServerRoutes` + `generateServerEntry` additions, `build.js:226-245`/`:319-390`) landed above the dispatch split) (`return _scrml_mw_pipeline_0(downstream)(req)`) | ⚑ **CORRECTED S376 — THIS ROW USED TO SAY `emit-server.ts:~454-521` AND THAT IS A WRONG FILE, NOT A DRIFTED LINE.** `grep -rn '_scrml_onion_dispatch\|_scrml_dispatch' compiler/src/codegen/` returns **NOTHING**; both symbols are emitted by the HOST. `emit-server.ts:~454-521` is §20.5/§52 `@currentUser`-query-gate code, unrelated to the onion. Wrong since #654 (`b74f7363`) — every window since. structure.map.md carried the identical error and is corrected there too. |
| 3. WHO mounts it (prod) | `compiler/src/commands/build.js:22, 299-317, 365-369` (⚑ CORRECTED S380 — was `284-302, 343-347`; +15/+22 respectively, same §52.13 insertion) | Scans emitted modules for `_scrml_mw_pipeline`; imports the winner under the ALIAS `_scrml_mw_pipeline_0` (every hosting module exports the same NAME). Throws with `err.scrmlCode` / `err.scrmlSources` on conflict. |
| 4. WHO mounts it (dev) | `compiler/src/commands/dev.js:32` (import), `:207` (`registeredOnions` decl), `:321-447` (`loadServerRoutes`, mounts the onion every recompile) | Rebuilds `registeredOnions` on every recompile; **mounts the SAME onion the built server does**, deliberately — a dev/prod split here is the exact defect the work removed. ⚑ **RE-VERIFIED against current HEAD `c1f93dfb` (post-#738 rewrite) — see the resolved PROVENANCE CAVEAT above.** Conflict prints via `formatOnionConflict` at `:410`. **ARCHITECTURE: `loadServerRoutes` now runs inside a respawned CHILD process** (`runDevChildServer`, `:1294`), so a fresh process import is always current (no cache-bust needed); the onion dispatches via `runThroughOnions(req, (request) => devDispatch(...))` at `:1233`, inside `buildServeConfig`'s `fetch` — the CHILD's `Bun.serve()` config, not the parent proxy's. |

**WHAT COUNTS AS DECLARING AN ONION** (the gate is `_scrml_hasMW` in emit-server; a non-pipeline module exports no `_scrml_mw_pipeline` at all, so the selector never sees it):

- **DOES declare one:** a `handle()`, or a `<program>` attribute that emits a pipeline STAGE — `cors=`, `log=` other than `"off"`, `ratelimit=`, `headers="strict"`.
- **Does NOT:** `batch-in-list-cap=` (§8.10.6 SQL batching), `idempotency-store=` / `idempotency-ttl=` (§19.9.6), `cors-max-age=` (inert without `cors=`), `channel-reconnect=` (§38.3.1). **They share the same config bag as the stage attributes — reading "the `<program>` carries an attribute" as "it hosts an onion" is the mistake this list exists to prevent.**

**WHY NOT COMPOSE MULTIPLE ONIONS** — the reasoning is in the module docblock and it is empirical, not aesthetic: composing means (a) every module's `handle()` PRE runs on every other module's page (**measured: two modules, two requests, four log lines, alpha's `handle()` stamping beta's document**), and (b) composition order is module-discovery order, which is **FILENAME-SORTED** — so renaming `api.scrml` to `zapi.scrml` would silently change which `handle()` won a contested path. Precedence must be readable off the source, and `<program>` is that.

**In the canonical v0.3 shape the question never arises:** the entry file declares `<program>` (with the middleware attributes and/or `handle()`), and `pages/*.scrml` route files declare `<page>`, which emits no onion.

**Introspection surface (dev only, and it exists so the behaviour is assertable):** `getRegisteredOnions()`, `getRegisteredRoutes()`, `runThroughOnions()`, `devDispatch`, `loadServerRoutes` — all exported from `commands/dev.js`. Post-#738, the process-topology surface is also exported: `serveDevInfra(pathname, req)` (dev-infra dispatch shared between the parent proxy and the child), `runDevChildServer(serveDir, opts)` (the child app server), `launchingProcessGone(launchPpid)` (orphan detection), and `CHILD_READY_PREFIX` (the child-ready stdout handshake).

### §40.3.3 pipeline ORDER at this HEAD

`[CORS preflight] → [logging] → [rate limit] → handle() PRE → _scrml_dispatch → handle() POST`

- **Stage 1 is the CORS preflight and it SHORT-CIRCUITS** (`emit-server.ts:3179`, `if (_scrml_mw_req.method === 'OPTIONS')`; ⛑ CORRECTED S384 from `:3127`, **+52** — #749's map/set runtime import + Part-A opts block land above it. It was `:3115` before S380's §52.13 shift). It reaches neither logging nor rate-limit, and **it does not reach `handle()`** — deliberately: a preflight carries no credentials, so an auth-enforcing `handle()` would reject it and the browser's real request would never be sent.
- **`ratelimit=` is PER-ROUTE** (`:3061-3084`, §4.15/§40.2; ⛑ CORRECTED S384 from `:3009-3032`, same **+52** shift; `:2997-3020` before S380) — it counts only requests a route serves, not the HTML/CSS/runtime/bundle sub-requests of one page load.

## (carried) §52.13 — an `auth="required"` scope also gates its OWN served `.html` document (NEW, S380, #728)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 13/13 code identifiers found in source; symbol line anchors: 0 confirmed, 4 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-auth-required-does-not-protect-the-served-html-document=resolved._

**Before this, `auth="required"` only guarded server FUNCTIONS.** The page's own statically-rendered
document is served by the build's `_server.js` static-file dispatch (or `scrml dev`'s static path),
which has no auth context at all — an unauthenticated `GET /secure.html` returned 200 with the fully
rendered markup, leaking whatever the page's initial server-render put there
(`g-auth-required-does-not-protect-the-served-html-document`).

**The fix threads one guard through all three layers, codegen -> build host -> dev host:**

| Layer | File | What it does |
|---|---|---|
| 1. EXPORT the guard | `compiler/src/codegen/emit-server.ts:2832-2842` (⛑ S384 +52, was `:2780-2790`) | Any module whose scope is `auth="required"` now ALSO emits `export const _scrml_protected_document = { guard: (req) => _scrml_auth_check(req) };` (`:2841`; ⛑ S384 +52, was `:2789`) — reuses the SAME check the per-route gate calls, so document and function share one verdict. |
| 2. DISCOVER + REGISTER (build) | `compiler/src/commands/build.js` — `discoverServerRoutes` excludes the export from `routeNames` and derives `protectedDocument` (the module's served `.html` path) via regex at `:245`; `generateServerEntry` collects `protectedDocs` (`:420-324`), imports each guard under a unique alias `_scrml_pd_<n>` (the export name collides across modules, `:370-373`), and builds a LOWERCASED `rel -> guard` map `_SCRML_PROTECTED_DOCS` (`:501-390`) | Static dispatch consults the map BEFORE cache headers / ETag are computed (`:538-545`) — an unauthenticated request 302s to `loginRedirect` and never reaches the file read or a 304. |
| 3. MIRROR (dev) | `compiler/src/commands/dev.js` — ⛑ **REWRITTEN BY #823 (`2d8dd8cb`); the anchor this row carried until S395 (`devDispatch`'s inline static-file gate at `:1046-1048`) NO LONGER EXISTS — it was deleted, not moved.** Module-level `registeredProtectedDocs` Map declared `:215`, reset `:325`, set per module in `loadServerRoutes` `:417`. **Protection is now decided at EXACTLY ONE SITE:** `gateProtectedDoc(req, rel)` (`:979`), called once from the static candidate loop at `:1141` as `gateProtectedDoc(req, relative(serveDir, candidate))`. | Identical mechanism to prod, so `scrml dev` and the built server agree — the same principle §40.3's onion work established. ⛑ **THE FIX WAS TO DELETE A SERVING PATH, NOT TO ADD A SECOND GATE.** Root resolution used to live in its own branch AFTER the loop and returned HTML from two paths that never consulted the registry, so an `auth="required"` document **not named `index.html` was served in full to an unauthenticated `GET /`** (`g-dev-root-path-fallback-serves-a-protected-document-unauthenticated`). Root's candidates now flow through the same gated loop via `staticCandidates` -> `rootFallbackCandidates` (`:1221`/`:1003`). ⚠ **THREE PROPERTIES ARE LOAD-BEARING AND EASY TO UNDO:** (a) the gate runs on the **RESOLVED** file, not the raw request path — an earlier revision gated both and the two deciders disagreed three ways (answering for deleted documents, overriding a resolution that would have served a different PUBLIC document, and ignoring candidate priority); (b) the gate call sits **OUTSIDE both `try` blocks**, because while it sat inside a wide `try` a throwing auth guard produced a silent 404 and could fall through to serve a DIFFERENT file; (c) dev and prod key on the SAME string — `relative(serveDir, candidate)` lowercased, matching `build.js`'s `_SCRML_PROTECTED_DOCS.get(rel.toLowerCase())` (`build.js:541`). **`devDispatch` runs inside the respawned CHILD process** (`runDevChildServer`), so `registeredProtectedDocs` is rebuilt fresh per respawn and a stale guard cannot survive one. |

**Case-insensitivity is deliberate and OVER-protects, never under-protects.** Both sides lowercase the
map key AND the lookup key. On a case-insensitive filesystem the OS resolves `GET /SECURE.html` to
`secure.html`, but the SERVE_DIR-relative path used for cache/ETag logic keeps the REQUEST's original
casing — a case-EXACT map would miss on that request and leak the document. Gating every case variant
of a protected path is the safe direction to be wrong in (matches error.map.md's §14.8.11
graceful-degrade precedent: over-restrict, never under-restrict).

**Scope: documents only, not assets.** The guard mounts on the `.html` entry document path
specifically — CSS/JS/other static assets under the same route are unaffected by this change (they
carry no page content to leak and were already `no-cache`/immutable per their own contract, see
build.map.md's "Content-addressed build assets" section).

## (carried) `<program>`-level declarative auth config
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
| Field | Values | Purpose |
|---|---|---|
| auth | "required" \| "optional" | gates the whole program |
| loginRedirect | path string | unauthenticated redirect target |
| csrf | "auto" \| "on" \| "off" | CSRF middleware mode — see below |
| sessionExpiry | duration string ("1h","2h") | session cookie TTL |
| session-secure (NEW this window) | "true" \| "false" (default "true") | `__Host-scrml_sid`+always-Secure vs plain `scrml_sid`+no-Secure; registered on BOTH `<program>` and `<page>` (attribute-registry.js, html-elements.js) |

Companion `MiddlewareConfig` (types/ast.ts:1515): cors, log, ratelimit, headers, idempotencyStore, idempotencyTTL. Both extracted from `<program>` attributes by ast-builder.js/compute-program-config.ts and consumed by auth-graph.ts + codegen/emit-server.ts.

## (carried) §64.9 headless serve-target carve-out
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
A `<program kind="tool" serve=PORT>` (§64.9, the listener-owning headless serve-harness — see domain.map.md) has NO cookie session. Program-level `auth="required"`/`"optional"` OR a per-channel `<channel auth="required"/"optional">` on a `serve=` tool is **E-TOOL-SERVE-AUTH-UNSUPPORTED** — fail-closed rejected at compile time rather than silently emitting an unguarded route/WS-upgrade. Bearer-token auth for headless targets is explicitly a later (unimplemented) unit. The NEW `session` builtin is likewise unreachable from a `serve=` headless body (E-SESSION-CONTEXT).

## (carried) scrml:auth stdlib module (stdlib/auth/, compiler/runtime/stdlib/auth.js)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
| File | Exports | Notes |
|---|---|---|
| flows.scrml | requestMagicLink/verifyMagicLink, requestEmailVerify/verifyEmailVerify, requestPasswordReset/verifyPasswordReset | request*/verify* pairs; single-use (get-then-delete) tokens; namespace-per-purpose store keying prevents cross-purpose replay; neutral `{ok:true}` responses regardless of address validity (enumeration resistance); caller injects the mailer, no built-in SMTP |
| jwt.scrml | signJwt/verifyJwt (HS256, Bun crypto.subtle), verifyJwtJwks (RS256 against a `.well-known/jwks.json` URL — alg-pinned BEFORE any JWKS fetch to prevent alg-confusion), decodeJwt (pure) | server-only by inference (importing scrml:auth escalates the caller, §12.2 Trigger 3) except decodeJwt. `secret` is ALWAYS a caller-supplied argument — this compiler repo has no env-var-based signing secret of its own (see config.map.md correction) |
| password.scrml | hashPassword/verifyPassword (Bun.password argon2id), generatePassword(length, opts) | generatePassword uses REJECTION SAMPLING over crypto.getRandomValues for uniform charset selection; pure, browser-safe |
| templates/login.scrml | scaffolded `scrml generate` login page | inline server fn (cross-file `?{}`-using server fns can't cross a file boundary) |

## (carried) scrml:oauth stdlib module (stdlib/oauth/, compiler/runtime/stdlib/oauth/)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
Providers: discord, github, google, microsoft (each a thin provider-specific wrapper) + pkce.scrml (PKCE code-verifier/challenge generation, shared by all 4). Unchanged this window; distinct from the §20.5 session-establishment primitive (OAuth verifies identity, session.set persists it).

## (carried) Server-only-stdlib client leak — the placement backstop, and the ONE position it now refuses (§12.2 Trigger 3 / §6.6.19)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 7/7 code identifiers found in source; symbol line anchors: 0 confirmed, 1 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

**This is a CONFIDENTIALITY boundary, not a performance one, and the whole design follows from which
direction is safe to be wrong in.** `ESCALATION_SERVER_ONLY_MODULES` (`route-inference.ts:656`) is
the placement set — **NOT** `SERVER_ONLY_SCRML_MODULES` (`:685`), which feeds async classification
where over-inclusion is free. Members and the limb each satisfies:

`scrml:auth` (a: `Bun.password` argon2id) · `scrml:crypto` (a: `Bun.CryptoHasher`, `Bun.password`) ·
`scrml:cron` (a) · `scrml:fs` (a: `node:fs`) · `scrml:process` (a) · `scrml:redis` (a: the **BARE**
`bun` specifier, no colon — a `bun:`-only scan misses it) · `scrml:store` (a: `bun:sqlite`) ·
`scrml:path` (a) · `scrml:mcp` (a, host surface in the `.js` shim) · **`scrml:oauth` (b:
CREDENTIAL HANDLING — zero host reach, but it puts `client_secret` in the token-exchange body three
times and its own header reads "SERVER-SIDE ONLY")**.

**Limb (b) exists because a host-reach-only criterion was FALSIFIED in review inside the same
session.** `scrml:oauth` was cleared as client-safe on the reasoning that PKCE lets the flow run in a
browser — true of the public-client half of a module that ships both halves. A clean compile shipped
a real client secret into the browser bundle. **The criterion was the defect, not the list.** The
normative criterion sits ABOVE the list in SPEC on purpose: a hand-maintained derived list rots
silently and nothing fails when it does. **Re-evaluate the criterion rather than editing the list
from memory, and when a module resists classification, prefer the server** — over-inclusion costs a
round trip, under-inclusion ships a secret to a browser.

**When the trigger FIRES it emits NO diagnostic, and that is by design.** A function silently moving
to the server is the SUCCESS path. "My function vanished from the client bundle and there are zero
errors and zero warnings" is the expected shape, not a bug report.

**The position it CANNOT reach, and what happens there now.** §12.4 makes route inference
per-function, so a non-function position is not reached by the trigger at all:

| Position | At `4f034e13` | Changed since `616688ea`? |
|---|---|---|
| `function` body | escalates (Trigger 3), silently, no diagnostic | no |
| `const <name> = …` **derived cell** RHS, **AT ANY DEPTH** | **REFUSED — `E-DERIVED-SERVER-ONLY-REACH` (§6.6.19, #486 + #500).** Not escalated: a derived recompute is synchronous lazy-pull (§6.6.3) and cannot become a round trip | **YES — #500. See the six positions below.** |
| `<name> = …` **mutable-cell initialiser** | **OPEN — leaks, no diagnostic** | no |
| **markup interpolation** | **OPEN — leaks, no diagnostic** | no |

⚠ **THE DERIVED-CELL ROW WAS TRUE-BUT-INCOMPLETE AT `616688ea`, AND THE INCOMPLETENESS WAS A LIVE
LEAK.** #486 shipped the refusal; the collector behind it (`collectDerivedCellDecls`,
`route-inference.ts:3730`) descended exactly `node.body` and `node.children` while its own doc comment
claimed it found derived cells *"at any depth"*. **Six positions were measured still leaking**, each
at exit 0 with ZERO `.server.js` and a real `Bun.password.hash(pw, { algorithm: "argon2id" })` in the
shipped browser runtime:

| Leaking position (pre-#500) | Why the field-listed walk missed it |
|---|---|
| `for`-loop `lift` body | the body sits under an `expr` wrapper — `…expr.node.children[0].body[0]` |
| `while`-loop `lift` body | same wrapper shape |
| `<each>` row body | per-item template children are not `node.body`/`node.children` at that level |
| `<engine>` state-child body | state children hang off an engine-specific property |
| loop nested inside a conditional | the conditional's arm is reached only through the same wrapper |
| any of the above inside a `kind="tool"` program | the §64 carve-out is what must hold there instead — it is a WHOLE-FILE predicate applied by the caller, so it is depth-independent by construction |

**The fix inverted the walk's default** rather than adding `expr` to the list: every array- and
object-valued property is descended, and exclusions live in a two-clause deny-list
(`skipDerivedWalkKey`, `:3677` — `span`, plus `_`-prefixed side tables). **Adding `expr` to a list of
two would have closed the reported shape and left the class open at the next unenumerated property.**
Measured: the deny-list is not load-bearing for the RESULT (68 cells collected with the shipped list,
68 without `parent`/`loc`/`spans`, 68 with no deny-list at all) — only for the work done. Termination
is an identity `seen` set plus a 512 depth cap, because the walk now descends ESTree expression trees
that nest one level per term. **`collectDerivedCellDecls` is EXPORTED for tests** precisely so the
termination and single-visit properties can be asserted against it directly; driving them through
`runRI` conflates them with every other walk in the stage (a synthetic cyclic AST blows the stack
inside `collectFileLevelBindingRoots`, `:2600`, which has no `seen` set at all — a separate,
unfixed fragility worth knowing about before you write such a test).

Reach is **REFERENCE, not call**, at ANY depth — inside a lambda, a nested `function` decl, or
escape-hatch raw text. Matching only top-level CALLS was proven evadable four ways, each shipping the
module and its secrets to the browser at exit 0: `["PEPPER"].map(p => hashPassword(p))`, a nested
`function` decl, a bare callback reference, and `let f = hashPassword; f(x)`. **On a confidentiality
boundary, over-firing costs a relocation and under-firing costs a leak.** Accepted residuals, named
rather than hidden: a binding shadowed ONLY inside a nested lambda still fires, and a word-boundary
scan of escape-hatch raw text can match inside a string literal in that text — both over-fires.

**`kind="tool"` programs (§64) are carved out of the §6.6.19 refusal** — no client boundary, no leak
— mirroring the carve-out Trigger 3 already takes for `print()`/`println()`. **The carve-out is
applied by the Step 3b CALLER (`isToolProgram`, read off the top-level `<program>`) BEFORE the walk
runs, not inside it**, which is what makes it depth-independent and is why the structural-walk change
did not have to re-derive it.

## (carried) Protected-field egress backstop (§14.8.9, NOT stdlib — compiler-enforced) — ⛑ **REWRITTEN S405 (#896). IT IS THREE LIMBS, NOT ONE.**
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 15/15 code identifiers found in source; symbol line anchors: 0 confirmed, 3 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep. Cited gaps whose marker is no longer open: g-sql-row-protect-leak=resolved._

`<db src=... protect="col1,col2">` (or `authority=` collections) marks columns that must never reach
the client bundle. **PA-stage analysis** is `compiler/src/protect-analyzer.ts` (PAError); the
**acorn-EXACT, fail-closed emit-time backstop** on the CLIENT bundle is
`compiler/src/codegen/egress-field-scan.ts` (`E-CG-001`). ⛔ **THE SERVER->CLIENT EGRESS FLOOR IS A
SEPARATE, THREE-LIMB MECHANISM IN `compiler/src/codegen/protect-egress.ts`, AND THE THREE HAVE
DELIBERATELY DIFFERENT STRENGTHS. THE MODULE DOCSTRING (`:37-51`) SAYS SO: *"Read the strengths; they
are not interchangeable."***

| limb | code | mechanism | site | strength |
|---|---|---|---|---|
| 1 | **`E-PROTECT-004`** | per-body **SOURCE-TEXT co-occurrence LINT** for `_{}` (§23) and `asIs` (§14.1.1) | `protect-egress.ts:449` (`detectProtectedRawEgress`) | ⚠ **CONSERVATIVE, DEFEATED BY FUNCTION EXTRACTION (measured), NOT A GUARANTEE** |
| 2 | **`E-PROTECT-005`** | HARD compile **ERROR at EMISSION** on an author-serialized response **BODY** (§40) | raised `emit-server.ts:2061`; gate `_protectResponseGate` `:3157`; detector `findAuthoredResponseConstruction` `protect-egress.ts:754` | **STRUCTURAL — extraction does NOT defeat it.** ⚑ **FILE-scoped, not query-scoped, deliberately** |
| 3 | **runtime refusal** | `_scrml_protect_redact` / `_scrml_protect_opaque_refusal()` | `SERVER_PROTECT_HELPER`, `protect-egress.ts:221+` | **`instanceof Response` is EXACT — no spelling problem, no extraction hole. THIS IS THE GUARANTEE.** |

⚑ **THE UNIT OF ALL THREE IS THE BODY, NOT THE `Response`.** A null-body `Response` — a redirect, a
`204`, `Response.error()` — carries no payload, so limbs 2 and 3 both permit it. **`W-PROTECT-005`
covers the narrow seam where the compile limb can prove that and the runtime limb cannot** (Bun gives
a redirect a 0-byte `ReadableStream` rather than a null body, and a secret-carrying
`new Response("s3cret", {status:302, headers:{Location}})` is indistinguishable from one at the exit
— MEASURED). **THE ADOPTER CONTRACT IN ONE SENTENCE: a `protect=` app keeps full control of STATUS
and HEADERS and gives up authoring the BODY.**

**THE MEDIATION MARK — the compile/runtime seam.** `const _SCRML_MEDIATED =
Symbol.for("scrml.protect.mediated")` + `function _scrml_protect_mediated(response)`
(`protect-egress.ts:245`). Both limbs were asking *is this `Response` AUTHOR-owned or
COMPILER-owned?* — the compile gate by **PROVENANCE**, the runtime guard by **SHAPE**
(`.body === null`). **Every disagreement was a defect:** `Response.redirect(...)` (author-owned,
payload-free) and the §53.9.4 `E-CONTRACT-001-RT` 400 (compiler-owned, body-carrying — the guard
turned the compiler's own 400 into a 500). Marked at `emit-server.ts:1904` (`_markMediatedResponses`
`:1890`, which **THROWS at emit time** if the emitter it wraps stopped producing a `Response`); read
**provenance-first** at `_opaqueResultGuard` (def `:1948`, the mediated read at `:1957`) and in the redactor. ⚠ Gated on
`_protectActive` (`:2705`) — unconditional emission dragged the 127-line helper into `protect=`-free
apps (~66% of the module, all dead). Mechanical seam test:
`compiler/tests/integration/g-sql-row-protect-leak.test.js:628`.

**SINKS — which ones guard a top-level `Response`, stated exactly.** Guarded: **both server-fn arms ·
the §61 `<endpoint>` envelope · `/__mountHydrate`** (the last as of #896). **NOT guarded:
`/__serverLoad`** — and that is **safe for a REASON, not by luck**: its `_scrml_rows` /
`_scrml_result` / `_scrml_cv` are values the COMPILER built from a lowered `?{}`, so no author
construction reaches it. ⛔ **DO NOT EXTEND THAT REASON TO `/__mountHydrate` — a previous source
comment did, and it was FALSE.** Each `_scrml_mh_v<i>` is an AUTHOR `server @var` loader result;
`JSON.stringify` ignores the Symbol-keyed descriptor, so `passwordHash` crossed the wire in cleartext
on `POST /__mountHydrate` while the SSR compose handler forty lines below redacted the same two
values. Fixed at `emit-server.ts:5531` / `:5561` per value via `_egressRedact`, plus
`_mountHydrateOpaqueGuard` (`:3072`) on both arms — which refuses **ANY** `Response` cell value,
deliberately not reusing the three-way test, because a hydration cell is DATA and a `Response` is
never a valid value for one.

⛔ **THE MISS IS THE REUSABLE LESSON: `/__mountHydrate` slipped past THREE independent completeness
proofs that all enumerated over the REDACTOR** (its call sites / SPEC's list of the boundaries it
covers / the ways to bypass it). **A sink that never ADOPTED the redactor is outside all three frames
AT ONCE, so their agreement measured nothing. The obligation is over the DATA, so the enumeration has
to be over the SERIALIZER.**

**SOUNDNESS BOUND (§14.8.9 normative — DO NOT OVER-CLAIM).** Complete for explicit-column flows of
statically-resolvable SQL, **by ORIGIN**. NOT covered: derived/implicit flows
(`{ hasPw: row.pw != "" }` — a value of independent identity carries no descriptor), covert channels,
and member-extraction into a re-keyed fresh literal (`{ secret: row.pw }`). Unresolvable dynamic SQL
is stripped **WHOLESALE (fail-closed)**, never accept-unknown.

⚑ **THE OPAQUE REFUSAL IS TAGGED, NOT JUST THROWN** — `_scrml_e.__scrml_protect_opaque = true` — so a
caller can tell a confidentiality refusal apart from an ordinary failure. Without the tag, the §37 SSE
stream wrapper's generic `catch` swallowed the refusal and ended the stream with a **silent 200**.

## (carried) §14.8.10 — TENANT-ROW ISOLATION, and the day two adjacent security floors disagreed about what a `<schema>` IS (NEW section, S405, #900)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 11/11 code identifiers found in source; symbol line anchors: 0 confirmed, 5 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._

⛔ **A raw-DDL `<schema>` + no-`<db>` app had a SILENTLY INERT tenant isolation floor at exit 0** — no
`_scrml_tenant_tag`, no `_scrml_tenant_redact`, **no diagnostic** — because §14.8.9 had been taught the
raw `CREATE TABLE` `<schema>` form and §14.8.10 had not. **Reproduced end-to-end: executed with
ambient tenant `A`, the wire carried `{"id":2,"name":"THEIRS","tenant_id":"B"}` — a live cross-tenant
isolation escape, executed, not theoretical.** ⚑ **The 4-app matrix isolates it to an INTERSECTION,
which is sharper than "schema-only apps are inert":** DSL+no-`<db>` ACTIVE · **raw-DDL+no-`<db>`
INERT** · raw-DDL+`<db>` ACTIVE · DSL+`<db>` ACTIVE.

**A table is tenant-scoped iff its column list includes `tenant_id`** — §14.8.10: *"the column's
presence is the declaration… There is no per-table opt-in attribute."* `buildTenantContext`
(`codegen/tenant-egress.ts:127`) reads BOTH registries: the §14.8.9 ProtectContext's `schemaByTable`
(every `<db>`-bound table) AND `extractDesiredSchema`'s `tables` (threaded from
`emit-server.ts:1769`). ⚠ **`class TenantTableSet extends Set<string>` (`:84`) case-folds on EXACTLY
`add` / `has` / `delete`** — a read that bypasses those three sees the FOLDED form and does not fold
the probe.

**FIXED BY ONE SHARED RECOGNIZER, NOT A SECOND BETTER ONE** — `compiler/src/schema-differ.js`
(`parseSchemaBlock` `:68` · `harvestCreateTables` `:83` · `harvestRawCreateTableDecls` `:86` ·
`harvestRawCreateTables` `:91` · `parseRawCreateTableColumns` `:1404`), imported by
`protect-analyzer.ts` (`:65-77`) and `gauntlet-phase1-checks.js` (`:69-80`).
**`W-SCHEMA-NO-TABLES-DECLARED` (`gauntlet-phase1-checks.js:803`) is the STANDING DETECTOR for the
next such divergence** — and its recognition is the UNION of both forms **using those same
functions**, because a third recognizer inside the detector would reintroduce, in the detector, the
divergence it exists to catch. Full treatment: `domain.map.md` §14.8.10 section.

## (carried) Historical: jwt-auth-bypass (2026-07-11, fixed, carried for context)
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 0/0 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
`scrml:auth/jwt`'s exports were silently dropped at compile in a specific comment-shape case, so the async-export seed never saw them → misclassified sync → a server fn emitted `verifyJwt(...)` UNAWAITED → the always-truthy Promise defeated `if (!result.valid)` → accept-all auth bypass. Both parser root causes are fixed; the standing defense-in-depth is api.js's STDLIB-EXPORT-SEED (fails CLOSED on any unresolvable server-only `scrml:*` re-export — see dependencies.map.md). No auth-surface API change.

## (carried) CSRF
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 2/2 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
`<meta>` synchronizer token + `/_scrml/session` projection. `csrf="auto"` (default) emits `_scrml_get_csrf_token()` (SameSite=Strict double-submit cookie) + `_scrml_fetch_with_csrf_retry` client helpers when the program has no explicit auth middleware entry (codegen/emit-client.ts). Not applicable to a §64.9 headless `serve=` target (no cookie session at all). The §20.5.1 `csrfToken` session key (above) is the SAME synchronizer token, now also protected against a literal-write mass-assignment bypass.

## (carried) Token Lifecycle
> _Carried from the pre-f92d1a8fb map; checked at f92d1a8fb: 6/6 code identifiers found in source; symbol line anchors: 0 confirmed, 0 re-derived to the current definition. Bare `file:line` anchors were NOT re-derived — grep._
Issued: JWT via `signJwt` (HS256, server-only) or an external IdP (RS256, verified not issued by this compiler); the §20.5 session record is issued by `_scrml_session_begin` on first authenticated request.
Validated: `verifyJwt` (HS256, local secret) or `verifyJwtJwks` (RS256, fetches + caches the IdP's JWKS, algorithm pinned); the session cookie is validated by mode-gated exact-name cookie match + durable-store lookup.
Refresh: not implemented in stdlib — caller-managed. Session TTL is `session-expiry`-driven, not silently refreshed on activity.
Expiry: `sessionExpiry` on `<program>` for the session cookie `Max-Age` + durable-store TTL; JWT `exp` claim is caller-set at sign time.
Magic-link/verify/reset tokens: TTL-bound (caller-supplied, embedded in the stored record as an authoritative `expiresAt`), single-use, namespace-scoped.

## Section audit (auth.map.md, pre-f92d1a8fb → this file)
| old section | disposition |
|---|---|
| dated `S4xx — … DELTA` / `ZERO DIFF FOR THIS MAP` blocks and the stacked header stamps | dropped: dated stamp blocks |
| Strategy | carried above as "(carried) …" (3/3 ids; anchors 0 ok/0 re-derived; flags 0) |
| §20.5 `session` server builtin (NEW this window — S265/S266, i29e/#29-E, #99 + #104) | carried above as "(carried) …" (9/9 ids; anchors 0 ok/0 re-derived; flags 0) |
| §20.5 SESSION — the handler-prologue binding is a PROXY, and that is a confidentiality decision (NEW #435, GH #357) | carried above as "(carried) …" (17/17 ids; anchors 0 ok/0 re-derived; flags 0) |
| §52.15.1 `@currentUser` + `<channel auth=>` — the DANGLING-REFERENCE class (NEW #440) | carried above as "(carried) …" (7/7 ids; anchors 0 ok/0 re-derived; flags 0) |
| §40.3 THE REQUEST ONION — one per compiled server, wrapping TOP-LEVEL dispatch (NEW, #654) | carried above as "(carried) …" (13/13 ids; anchors 0 ok/0 re-derived; flags 0) |
| §52.13 — an `auth="required"` scope also gates its OWN served `.html` document (NEW, S380, #728) | carried above as "(carried) …" (13/13 ids; anchors 0 ok/4 re-derived; flags 0) |
| `<program>`-level declarative auth config | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 0) |
| §64.9 headless serve-target carve-out | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| scrml:auth stdlib module (stdlib/auth/, compiler/runtime/stdlib/auth.js) | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| scrml:oauth stdlib module (stdlib/oauth/, compiler/runtime/stdlib/oauth/) | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| Server-only-stdlib client leak — the placement backstop, and the ONE position it now refuses (§12.2 Trigger 3 / §6.6.19) | carried above as "(carried) …" (7/7 ids; anchors 0 ok/1 re-derived; flags 0) |
| Protected-field egress backstop (§14.8.9, NOT stdlib — compiler-enforced) — ⛑ **REWRITTEN S405 (#896). IT IS THREE LIMBS, NOT ONE.** | carried above as "(carried) …" (15/15 ids; anchors 0 ok/3 re-derived; flags 0) |
| §14.8.10 — TENANT-ROW ISOLATION, and the day two adjacent security floors disagreed about what a `<schema>` IS (NEW section, S405, #900) | carried above as "(carried) …" (11/11 ids; anchors 0 ok/5 re-derived; flags 0) |
| Historical: jwt-auth-bypass (2026-07-11, fixed, carried for context) | carried above as "(carried) …" (0/0 ids; anchors 0 ok/0 re-derived; flags 0) |
| CSRF | carried above as "(carried) …" (2/2 ids; anchors 0 ok/0 re-derived; flags 0) |
| Token Lifecycle | carried above as "(carried) …" (6/6 ids; anchors 0 ok/0 re-derived; flags 0) |
| Tags | replaced by the new footer |
| Links | replaced by the new footer |

## Tags
#scrml #map #auth #session #csrf #protect #tenant #security

## Links
- [primary.map.md](./primary.map.md)
- [domain.map.md](./domain.map.md)
- [config.map.md](./config.map.md)
- [master-list.md](../../master-list.md)
- [pa.md](../../pa.md)
