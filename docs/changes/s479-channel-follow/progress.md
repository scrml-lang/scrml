# s479-channel-follow — progress

Base: origin/s479-channel-relay-fold (9c1c15487) — PR #1967 was in the merge queue, not merged, at start.

Items (brief priority order):
1. SECURITY — fixed-length tape `replace` with another length accepted by relay + clients. Fix in runtime.js `channelJudge`.
2. `__seen` on client frames; relay closes a refused sender no relayed frame after `__seen` explains.
3. Over-budget frame → `__refused` (unread) instead of close; close only sustained abuse.
4. Ruled §3.B item 5: reconnect backoff (doubling, ±20% jitter, 30 s cap, reset on open, 0 disables).
5. Ruled §3.B item 6: `<program trusted-proxies=N>` (default 0) — client IP = Nth-from-last XFF; X-Forwarded-Host/-Proto too; §40.2.4 ratelimit text.
6. Record only: IPv6 /64 INTERIM stays a gap note.

Base conformance: PASS 645 / FAIL 12 / CRASH 0 (~/.cache/scrml/review/s479-channel-follow/conf-base.json).

## Log
- (start) branch s479-channel-follow from origin/s479-channel-relay-fold.
- Item 1: NOT built — owner question. The local write `@fx = [2, 5]` on `int[replace]` compiles with no check; §6's `Item[replace]=[]` example and 8 conformance cases fill fixed tapes with any length. Filed g-boot-fixed-tape-replace-length-unruled-s479 (rec: replace is not bound by a fixed length; `T[n..=n, replace]` pins). Tests pin relay == client == local (follow test A).
- Item 2: `__seen` built (runtime.js send, server-runtime.js channelFrame/message), range + monotone check, refusedAt rule. Residue: an understated `__seen` escapes the close (recorded in relay-fold residue item 1).
- Item 3: over-budget → `{__type:"__refused", __why}` unread; connection bucket debt to -burst then close; address bucket never closes; client retires oldest sent pending + pacer.starve().
- Item 4: channelBackoff + retries reset on open.
- Item 5: trusted-proxies (analyze E-MW-009, CoreChannel.trustedProxies, print-server desc, server-runtime forwardedEntry/originOk/addressOf); SPEC §40.2 + §39.2.4.
- Tests: slice-m4/channel-follow-s479.test.js (18), harness channel-seen-harness.js; existing channel tests updated for __seen / rate refusal / Origin at N=0.
- e2e differential (~/.cache/scrml/review/s479-channel-follow/diff-e2e.mjs, + bx bounded replace): seeds 11, 12 × 6000 ops — 0 findings.
- (S480) merged origin/main 25c06747e (58b45b26f; only conflict generated severity.scrml, regenerated); merged-base conformance PASS 708 / FAIL 4 / CRASH 0 (same 4 FAILs as main's docs/bootstrap-conformance.md). Ruled S480: §38.4.2 + §66.11.2 amended (replace not bound by a FIXED length); gap g-boot-fixed-tape-replace-length-unruled-s479 resolved; test comments updated.
