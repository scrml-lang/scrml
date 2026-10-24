/**
 * stdlib-failable-errors.ts — S469 r2 (g-server-return-match-failable-subject-unawaited-s469).
 *
 * The DECLARED error enum of every failable (`!`) export of the standard library, by import
 * specifier, so a `!{}` arm on a call of one binds its payload by that enum's field order.
 *
 * Why a table: an import from `scrml:<module>` does not reach the type checker as a parsed
 * declaration (`importedFnDecls` covers `.scrml` files of the program only), so a handler on
 * `kvGet(store, k) !{ .ParseFailed(m) :> … }` had no field list for `ParseFailed`. The payload binder
 * planner refuses rather than guesses (E-TYPE-027); before, it bound the whole `.data` — the runtime's
 * keyed `{ message }` object, not the message. The runtime shims build each payload keyed by these
 * same fields (compiler/runtime/stdlib/*.js).
 *
 * KEPT IN STEP with stdlib/: `compiler/tests/unit/stdlib-failable-errors-s469.test.js` reads every
 * `export type <X>Error:enum` and every `export function f(…) ! -> <X>` in stdlib/ and asserts this
 * table equals them (a new failable export, a renamed field or a moved function turns it red).
 */

/** Variant name → declared field names ([] = unit). */
export type ErrorEnumFields = Readonly<Record<string, readonly string[]>>;

const JWT_ERROR: ErrorEnumFields = { DecodeFailed: ["message"] };
const PASSWORD_ERROR: ErrorEnumFields = { VerifyFailed: ["reason"] };
const KV_ERROR: ErrorEnumFields = { ParseFailed: ["message"] };
const OAUTH_ERROR: ErrorEnumFields = { ParseFailed: ["message"] };
const CRYPTO_ERROR: ErrorEnumFields = { VerifyFailed: ["message"] };
const HOST_ERROR: ErrorEnumFields = { Thrown: ["message", "name"] };
const PARSE_ERROR: ErrorEnumFields = {
  MissingDiscriminator: [],
  UnknownVariant: ["tag"],
  InvalidPayload: ["field", "reason"],
  Malformed: ["reason"],
};

/** Import specifier → exported failable function name → its declared error enum's fields. */
export const STDLIB_FAILABLE_ERRORS: Readonly<Record<string, Readonly<Record<string, ErrorEnumFields>>>> = {
  "scrml:auth": { decodeJwt: JWT_ERROR, verifyPassword: PASSWORD_ERROR },
  "scrml:auth/jwt": { decodeJwt: JWT_ERROR },
  "scrml:auth/password": { verifyPassword: PASSWORD_ERROR },
  "scrml:store": { get: KV_ERROR },
  "scrml:store/kv": { get: KV_ERROR },
  "scrml:oauth": { parseGoogleIdToken: OAUTH_ERROR },
  "scrml:oauth/google": { parseIdToken: OAUTH_ERROR },
  "scrml:crypto": { verifyHash: CRYPTO_ERROR },
  "scrml:host": { safeCall: HOST_ERROR, safeCallAsync: HOST_ERROR },
  "scrml:data": { parseVariant: PARSE_ERROR },
  "scrml:data/parse": { parseVariant: PARSE_ERROR },
};

/** The `__matchSubjectVariants` shape (`{ name, fields }`) of a stdlib export's error enum, or null. */
export function stdlibFailableErrorVariants(source: string, importedName: string): Array<{ name: string; fields: string[] }> | null {
  const e = STDLIB_FAILABLE_ERRORS[source]?.[importedName];
  if (!e) return null;
  return Object.entries(e).map(([name, fields]) => ({ name, fields: [...fields] }));
}
