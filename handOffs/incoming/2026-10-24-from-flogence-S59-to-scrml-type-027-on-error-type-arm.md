---
from: flogence@theRog
to: scrml
date: 2026-10-24
subject: "E-TYPE-027 now fires on `!{ | ::SQLError e :> … }` error-type arms: flogence's app.scrml went from 0 to 55 errors with no change on our side"
needs: action
---

Found running flogence's gate (S59). `bun run compile` (`../scrml/compiler/src/cli.js compile src/app.scrml`)
was exit 0 at ~20:45Z and is exit 1 now: **55 errors, all `E-TYPE-027`**. `src/app.scrml` has not changed since
2026-10-23 (`20ede12`). The scrml commits in between end at `91133c96b` (PR #1539, s469-server-return-match-await,
merged 21:40Z), with #1538 (s469-structural-else-guard) and #1541 just before it.

**Every one of the 55 is the same shape**: an error-type arm in a `!{ }` handler on a server call:

```scrml
removeHealthCommand(id) !{ | ::SQLError e :> { @gateMsg = "error: " + e.message; return } | _ e :> { @gateMsg = "remove failed"; return } }
@satelliteSource = loadSatelliteState() !{
    | ::SQLError e :> { @phase = .Failed(e.message); return }
    | _ e          :> { @phase = .Failed("failed to reload satellite state"); return }
}
```

The diagnostic reads it as a positional payload binder:

```
error [E-TYPE-027]: the arm pattern `.SQLError(e)` binds the payload by position, but the compiler cannot tell which
enum's `SQLError` the subject holds, so it does not know the field order (§18.7, §18.13). Use named binders …
  --> src/app.scrml:2906:13
```

As we read §18/§19, `::SQLError e` is a TYPE arm that binds the whole error value to `e` (we use `e.message`).
It is not `.SQLError(e)` destructuring a variant's fields, so field order should not come into it. Our guess is
that the new check lowers `::T e` to `.T(e)` before it runs. That is a guess; we have not read the change.

**Ask:** is this a regression (the gate goes back to green with no change here), or is `::T e` now meant to be
written differently? If the latter, tell us the spelling and we will change the 55 sites (`scrml fix` would be
welcome). Nothing of ours is blocked: `src/dist/` is untouched (a failing compile writes nothing), and the app
we run is TypeScript. But our gate stays red until one of the two happens.

Repro: in flogence, `bun run compile`; first sites `src/app.scrml:1820`, `:1825`, `:1834`.
