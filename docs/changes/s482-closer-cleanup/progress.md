# s482-closer-cleanup — progress

Brief: ~/.cache/scrml/review/s482-briefs/closer-cleanup.md. Base origin/main a81d8cc80 (#2087 merged).
Scratch: ~/.cache/scrml/review/s482-closer/ (probes p/, harness probe.mjs).
Ruling: user-voice-scrml.md "⭐ RULED — the `/}` "terse closer" is the retired trailing-slash closer; Appendix E
governs (S482)". Appendix E: "Any source file using bare `/` or trailing content`/` closers SHALL be rejected by the
compiler with a diagnostic pointing to §4.4. The diagnostic SHALL include a hint: "Did you mean `</>`?""

## 1 — SPEC
- Migrated to `</>` (re-grepped at HEAD): 26 example lines — 6962 7003 11065 11121 11122 11273 11275 11302 11303
  17867 17881 17934 18027 18076 18079 18269 22695 22746 22748 24484 29975 29977(bare /) 30615 30850 47724(bare /)
  47884(bare /) — plus the prose at 11281 and the E-LIFT-001 expected-output rendering at 11290 (`<ul>${ ... /`).
  Beyond the audit's 22: 11302/11303 (the E-LIFT-001 "Fix:" block) and 47724/47884 (bare `/` closing a `<machine>`
  in two diagnostic-message examples; only the closer changed — `<machine>` is H2, another lane).
- The E-LIFT-001 worked example never closed its `${` — added the `}` before `</>` (11276).
- :14 banner — dated S482 correction note ("all examples updated" was false).
- §34 E-SYNTAX-050 row — S482 note: `/}` is the same retired form; hint; where the code fires.
- Untouched: Appendix E's migration table, the §34 row's own text, labelled negatives.

## 2 — Conformance
- error-boundary/terse-fallback-closer → terse-fallback-closer-neg (corpus convention: 501 `-neg` dirs), expects
  E-SYNTAX-050. impl#1 xfail (g-impl1-terse-closer-accepted-s482, signature `missing:E-SYNTAX-050`).
- `</>` twin: error-boundary/no-renders-falls-to-fallback already asserts the same rendering (same source, `</>`,
  eb-fallback text + eb-notfound count 0 + header/footer) — kept as is.
- loop-007-*-neg (the 2 empty-code cases): NOT closer-related (`while` forms, H4) — left for the lint lane.

## 3 — Bootstrap
- lex.scrml: the terse `/}` branch is gone. markupExtentFrom takes a mode (0 value, 1 attribute value, 2 retired
  probe). New export retiredValueCloserAt (mode 2): the offset of a `/` right before a `}` at the outer element's
  level (balanced braces, outside a `//` comment), else -1.
- parse.scrml retiredCloserValue (called first in markupAttrValue): one E-SYNTAX-050 at the `/`, with the hint;
  the value through its `}` is consumed and never read as code.
- parse.scrml retiredCloserIn (end of parseKids): when an element is left UNCLOSED (end of input, or a closer naming
  another element), its first own text run with a `/` standing where a closer would (end of line, before `;`, or the
  run's end before a tag / end of input) gets E-SYNTAX-050 + hint; the reader's E-PARSE-* stays. A `/` in text is
  otherwise text (a/b, and/or, URLs, `/</>`, `a/<b>`): never refused — tested.
- severity.scrml regenerated (E-SYNTAX-050 → Error; answer-neutral with the fail-closed default).

## 4 — #2087 review items
- LOW-B fixed: legacy-read test is now (a) a closer naming a different element (name stack, attribute mode) or
  (b) an outer-level unbalanced `}` right after the opener's `>` or after an operator. `{<p>a } b</p>}`,
  `{<div>oops }</div>}`, b20 slot form → one by-name refusal over the whole value again.
- NIT-3 (` //}`): with the terse closer gone there is no conflict left — ` //` is a §27.1 comment (the walker now
  skips the whole line, closers included); `{<p>a //}>y</div>` is not a value (same cascade as #2087 head). Recorded.
- NIT-4 fixed: skippedDecls keeps the open-group stack in its own loop (one pass); inArrowBodyIn removed.

## 6 — impl#1
- Not edited. Gap g-impl1-terse-closer-accepted-s482 (MED, carried) filed in docs/known-gaps.md.

## Tests
- slice-m4/closer-cleanup-s482.test.js (new); parser-lows-s482.test.js terse case → E-SYNTAX-050.

## 5 — Samples NOT migrated (lint lane ratchets them): 161 lines by this lane's scan (audit said 164)
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-keyed-reconcile-051.scrml:7: lift <div class="card">${card.title}/
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-lift-else-empty-049.scrml:10: lift <li class="empty">No items./
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-lift-else-empty-049.scrml:8: lift <li>${item}/
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-lift-markup-048.scrml:6: lift <li>${item}/
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-lift-outside-logic-109.scrml:5: lift <li>${x}/
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-lift-without-key-primitive-100.scrml:6: lift <li>${n}/
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-for-object-iteration-052.scrml:7: lift <div>${card.title}/
- samples/compilation-tests/gauntlet-s19-phase2-control-flow/phase2-if-as-expr-in-markup-interp-105.scrml:11: lift <p class="label">${label}/
- samples/contact-directory.scrml:234: <p>No contacts found./
- samples/contact-directory.scrml:243: <span class="contact-name">${contact.name}/
- samples/contact-directory.scrml:244: <span class="contact-tag">${contact.category}/
- samples/contact-directory.scrml:247: <span>${contact.email}/
- samples/contact-directory.scrml:248: <span>${contact.phone}/
- samples/debate-lin-lift-edge-cases.scrml:34: lift <p class="token-display">Authenticated: ${token}/
- samples/debate-lin-lift-edge-cases.scrml:64: <span>${item.id}/
- samples/debate-lin-lift-edge-cases.scrml:65: <span>${item.name}/
- samples/debate-lin-lift-edge-cases.scrml:95: <h3>Secure Content/
- samples/debate-lin-lift-edge-cases.scrml:96: <p>Session established./
- samples/debate-lin-lift-pipeline.scrml:48: <h2>Your Orders/
- samples/debate-lin-lift-pipeline.scrml:52: <span>${order.id}/
- samples/debate-lin-lift-pipeline.scrml:53: <span class="total">${order.total}/
- samples/debate-lin-lift-pipeline.scrml:54: <span class="status">${order.status}/
- samples/file-manager-r11.scrml:131: lift <span class="crumb">${crumb}/
- samples/file-manager-r11.scrml:180: <span class="icon">${fileIcon(file.type)}/
- samples/file-manager-r11.scrml:183: <td>${formatSize(file.size)}/
- samples/file-manager-r11.scrml:184: <td>${file.type}/
- samples/file-manager-r11.scrml:185: <td>${file.modified}/
- samples/file-manager-r11.scrml:186: <td>${sel ? "X" : "O"}/
- samples/gauntlet-r11-elixir-chat.scrml:97: <span class="msg-user">${msg.user}/
- samples/gauntlet-r11-elixir-chat.scrml:98: <span class="msg-timestamp">${msg.timestamp}/
- samples/gauntlet-r11-elixir-chat.scrml:99: <p class="msg-text">${msg.text}/
- samples/gauntlet-r11-go-url-shortener.scrml:247: <td class="short-code-cell">${url.short_code}/
- samples/gauntlet-r11-go-url-shortener.scrml:248: <td class="long-url-cell">${url.long_url}/
- samples/gauntlet-r11-go-url-shortener.scrml:249: <td class="clicks-cell">${url.clicks}/
- samples/gauntlet-r11-go-url-shortener.scrml:251: <button onclick=deleteUrl(url.short_code) class="btn-delete">Delete/
- samples/gauntlet-r11-task-dashboard.scrml:266: <h3 class="task-title">${task.title}/
- samples/gauntlet-r11-task-dashboard.scrml:268: <button class="btn btn-edit" onclick=openEditForm(task)>Edit/
- samples/gauntlet-r11-task-dashboard.scrml:269: <button class="btn btn-delete" onclick=removeTask(task.id)>Delete/
- samples/gauntlet-r11-task-dashboard.scrml:273: <span class=statusClass(task.status)>${task.status}/
- samples/gauntlet-r11-task-dashboard.scrml:274: <span class=priorityClass(task.priority)>${task.priority}/
- samples/gauntlet-r11-zig-buildconfig.scrml:250: <h1>Zig Build Configuration Manager/
- samples/gauntlet-r11-zig-buildconfig.scrml:251: <p>Defined targets: ${@targetCount}/
- samples/gauntlet-r11-zig-buildconfig.scrml:255: <h2>New Build Target/
- samples/gauntlet-r11-zig-buildconfig.scrml:258: <label>Target Name/
- samples/gauntlet-r11-zig-buildconfig.scrml:269: <label>Platform/
- samples/gauntlet-r11-zig-buildconfig.scrml:277: <option value="Linux">Linux x64/
- samples/gauntlet-r11-zig-buildconfig.scrml:278: <option value="MacOS">macOS ARM64/
- samples/gauntlet-r11-zig-buildconfig.scrml:279: <option value="Windows">Windows x64/
- samples/gauntlet-r11-zig-buildconfig.scrml:280: <option value="WASM">WASM freestanding/
- samples/gauntlet-r11-zig-buildconfig.scrml:285: <label>Optimization/
- samples/gauntlet-r11-zig-buildconfig.scrml:287: <option value="Debug">Debug/
- samples/gauntlet-r11-zig-buildconfig.scrml:288: <option value="ReleaseSafe">ReleaseSafe/
- samples/gauntlet-r11-zig-buildconfig.scrml:289: <option value="ReleaseFast">ReleaseFast/
- samples/gauntlet-r11-zig-buildconfig.scrml:290: <option value="ReleaseSmall">ReleaseSmall/
- samples/gauntlet-r11-zig-buildconfig.scrml:295: <label>Extra Flags/
- samples/gauntlet-r11-zig-buildconfig.scrml:299: <button onclick=addTarget()>Add Target/
- samples/gauntlet-r11-zig-buildconfig.scrml:304: <h2>Build Targets/
- samples/gauntlet-r11-zig-buildconfig.scrml:307: <p if=@targetCount class="targets-count">${@targetCount} target(s) configured/
- samples/gauntlet-r11-zig-buildconfig.scrml:308: <p if=@targetCount class="empty-hint">Use the form above to add your first target./
- samples/gauntlet-r11-zig-buildconfig.scrml:314: <strong>${t.name}/
- samples/gauntlet-r11-zig-buildconfig.scrml:315: <span>${t.platform}/
- samples/gauntlet-r11-zig-buildconfig.scrml:316: <span>${t.optimization}/
- samples/gauntlet-r11-zig-buildconfig.scrml:317: <button onclick=removeTarget(t.id)>Remove/
- samples/gauntlet-r11-zig-buildconfig.scrml:320: <code>${buildCommand(t)}/
- samples/gauntlet-r11-zig-buildconfig.scrml:324: <button onclick=startEditFlags(t.id, t.flags)>Edit Flags/
- samples/gauntlet-r11-zig-buildconfig.scrml:337: <h2>Edit Flags/
- samples/gauntlet-r11-zig-buildconfig.scrml:340: <button onclick=saveFlags()>Save Flags/
- samples/gauntlet-r11-zig-buildconfig.scrml:341: <button onclick=cancelEditFlags()>Cancel/
- samples/gauntlet-r11-zig-buildconfig.scrml:362: <h2>Platform Details/
- samples/gauntlet-r11-zig-buildconfig.scrml:363: <p>${platformDescription(@newPlatform)}/
- samples/gauntlet-r11-zig-buildconfig.scrml:372: lift <p class="platform-detail">${details}/
- samples/gauntlet-r11-zig-buildconfig.scrml:378: <h2>Optimization Details/
- samples/gauntlet-r11-zig-buildconfig.scrml:379: <p>${optimizationDescription(@newOptimization)}/
- samples/gauntlet-r11-zig-buildconfig.scrml:388: lift <p class="opt-detail">${optDetails}/
- samples/gauntlet-r11-zig-buildconfig.scrml:394: <h2>Export Configuration/
- samples/gauntlet-r11-zig-buildconfig.scrml:406: <p if=@exportStatus class="status-text">Status: ${@exportStatus}/
- samples/gauntlet-r11-zig-buildconfig.scrml:409: <button onclick=handleExport()>Export as JSON/
- samples/gauntlet-r11-zig-buildconfig.scrml:412: <h3>Generated JSON/
- samples/gauntlet-r11-zig-buildconfig.scrml:413: <pre class="json-output">${@exportedJson}/
- samples/gauntlet-r11-zig-buildconfig.scrml:430: <p>scrml ${ bun.eval("'0.5.1-draft'") } / Build Config Tool v1.0/
- samples/gauntlet-r11/rust-state-machine.scrml:196: lift <li class="history-entry">${entry.label}/
- samples/gauntlet-r13/bun-sql-operations.scrml:33: lift <option value=${cat.id}>${cat.name}/
- samples/gauntlet-r13/bun-sql-operations.scrml:44: <span>${task.title} (${task.category})/
- samples/gauntlet-r13/bun-sql-operations.scrml:45: <button onclick=toggleTask(task.id, task.done)>Toggle/
- samples/gauntlet-r13/elixir-pipeline.scrml:37: <td>${job.name}/
- samples/gauntlet-r13/elixir-pipeline.scrml:38: <td>${job.status}/
- samples/gauntlet-r13/elixir-pipeline.scrml:40: <button onclick=runJob(job.id)>Run/
- samples/gauntlet-r13/go-api-service.scrml:34: <td>${entry.title}/
- samples/gauntlet-r13/go-api-service.scrml:36: <button onclick=deleteEntry(entry.id)>Delete/
- samples/gauntlet-r13/htmx-forms.scrml:51: lift <li class="error">${err}/
- samples/gauntlet-r13/rails-crud-admin.scrml:55: <td>${p.name}/
- samples/gauntlet-r13/rails-crud-admin.scrml:56: <td>$${p.price}/
- samples/gauntlet-r13/rails-crud-admin.scrml:57: <td>${p.stock}/
- samples/gauntlet-r13/rails-crud-admin.scrml:59: <button onclick=startEdit(p.id, p.name, p.price)>Edit/
- samples/gauntlet-r13/rails-crud-admin.scrml:60: <button onclick=deleteProduct(p.id)>Delete/
- samples/gauntlet-r13/react-auth-dashboard.scrml:49: lift <li>${user.name}/
- samples/gauntlet-r13/svelte-enum-filter.scrml:40: lift <li>${item.text}/
- samples/gauntlet-r13/vue-component-app.scrml:43: <span>${item.text}/
- samples/gauntlet-r13/vue-component-app.scrml:44: <button onclick=removeItem(item.id)>x/
- samples/gauntlet-r13/zig-minimal.scrml:29: <button onclick=remove(item.id)>x/
- samples/gauntlet-r14/bun-sql-operations.scrml:43: lift <option value=${cat.id}>${cat.name}/
- samples/gauntlet-r14/bun-sql-operations.scrml:55: <span>${task.title} (${task.category})/
- samples/gauntlet-r14/bun-sql-operations.scrml:56: <button onclick=toggleTask(task.id, task.done)>Toggle/
- samples/gauntlet-r14/elixir-pipeline.scrml:58: <td>${job.name}/
- samples/gauntlet-r14/elixir-pipeline.scrml:59: <td>${job.status}/
- samples/gauntlet-r14/elixir-pipeline.scrml:61: <button onclick=runJob(job.id)>Run/
- samples/gauntlet-r14/elixir-pipeline.scrml:62: <button onclick=completeJob(job.id)>Complete/
- samples/gauntlet-r14/elixir-pipeline.scrml:63: <button onclick=deleteJob(job.id)>Delete/
- samples/gauntlet-r14/elixir-pipeline.scrml:74: lift <li>[${log.job_id}] ${log.message}/
- samples/gauntlet-r14/go-api-service.scrml:45: <td>${entry.title}/
- samples/gauntlet-r14/go-api-service.scrml:46: <td>${entry.body}/
- samples/gauntlet-r14/go-api-service.scrml:48: <button onclick=deleteEntry(entry.id)>Delete/
- samples/gauntlet-r14/htmx-forms.scrml:76: lift <li class="error">${err}/
- samples/gauntlet-r14/odin-gamelike.scrml:87: lift <li>${m}/
- samples/gauntlet-r14/rails-crud-admin.scrml:60: <td>${p.name}/
- samples/gauntlet-r14/rails-crud-admin.scrml:61: <td>$${p.price}/
- samples/gauntlet-r14/rails-crud-admin.scrml:62: <td>${p.stock}/
- samples/gauntlet-r14/rails-crud-admin.scrml:64: <button onclick=startEdit(p.id, p.name, p.price, p.stock)>Edit/
- samples/gauntlet-r14/rails-crud-admin.scrml:65: <button onclick=deleteProduct(p.id)>Delete/
- samples/gauntlet-r14/react-auth-dashboard.scrml:59: <button onclick=removeUser(user.id)>Remove/
- samples/gauntlet-r14/solid-reactive-signals.scrml:60: lift <li>${val}/
- samples/gauntlet-r14/svelte-enum-filter.scrml:52: lift <li>${item.text}/
- samples/gauntlet-r14/vue-component-app.scrml:65: <span>${item.text}/
- samples/gauntlet-r14/vue-component-app.scrml:66: <button onclick=startEditing(item.id, item.text)>Edit/
- samples/gauntlet-r14/vue-component-app.scrml:67: <button onclick=removeItem(item.id)>x/
- samples/gauntlet-r14/zig-minimal.scrml:47: <button onclick=toggleDone(item.id)>Toggle/
- samples/gauntlet-r14/zig-minimal.scrml:48: <button onclick=remove(item.id)>x/
- samples/gauntlet-r15/stress-db-markup-onclick.scrml:41: <span>${item.name}/
- samples/gauntlet-r15/stress-db-markup-onclick.scrml:42: <button onclick=toggleItem(item.id, item.done)>Toggle/
- samples/gauntlet-r15/stress-db-markup-onclick.scrml:43: <button onclick=removeItem(item.id)>Remove/
- samples/gauntlet-r18/svelte-dev.scrml:72: lift <li>${entry}/
- samples/gauntlet-s19-phase4/nested-comments.scrml:108: lift <p class="muted" if=(depth == 0)>No replies yet./
- samples/gauntlet-s19-phase4/nested-comments.scrml:143: lift <p class="empty">Be the first to comment./
- samples/gauntlet-s19-phase4/nested-comments.scrml:90: ${render footer() ?? <span class="muted">no actions/}
- samples/kanban-r11.scrml:183: <p class="card-text">${card.text}/
- samples/kanban-r11.scrml:215: <p class="card-text">${card.text}/
- samples/kanban-r11.scrml:250: <p class="card-text">${card.text}/
- samples/quiz-app.scrml:122: <span class="option-letter">${String.fromCharCode(65 + i)}./
- samples/quiz-app.scrml:123: <span class="option-text">${option}/
- samples/react-dev-lin-lift-edge-cases.scrml:107: <h3>Secure Content/
- samples/react-dev-lin-lift-edge-cases.scrml:108: <p>Session established./
- samples/react-dev-lin-lift-edge-cases.scrml:40: lift <p class="token-display">Authenticated: ${token}/
- samples/react-dev-lin-lift-edge-cases.scrml:75: <span>${item.id}/
- samples/react-dev-lin-lift-edge-cases.scrml:76: <span>${item.name}/
- samples/react-dev-lin-lift-pipeline.scrml:38: <h2>Your Orders/
- samples/react-dev-lin-lift-pipeline.scrml:42: <span>${order.id}/
- samples/react-dev-lin-lift-pipeline.scrml:43: <span class="total">${order.total}/
- samples/react-dev-lin-lift-pipeline.scrml:44: <span class="status">${order.status}/
- samples/rust-dev-lin-lift-edge-cases.scrml:145: <h2>Edge Case 3: lin consumed at render boundary/
- samples/rust-dev-lin-lift-edge-cases.scrml:146: <button onclick=renderSecureWidget()>Render Widget/
- samples/rust-dev-lin-lift-edge-cases.scrml:148: <p>Widget: ${@widgetHtml}/
- samples/rust-dev-lin-lift-edge-cases.scrml:50: <h2>Edge Case 1: lin in if/else with lift/
- samples/rust-dev-lin-lift-edge-cases.scrml:51: <button onclick=processWithBranch()>Process/
- samples/rust-dev-lin-lift-edge-cases.scrml:52: <p>Result: ${@routeResult}/
- samples/rust-dev-lin-lift-edge-cases.scrml:94: <h2>Edge Case 2: lin consumed before loop, not inside/
- samples/rust-dev-lin-lift-edge-cases.scrml:95: <button onclick=processBatch()>Process Batch/
- samples/rust-dev-lin-lift-edge-cases.scrml:98: lift <li>${result}/
- samples/rust-dev-lin-lift-pipeline.scrml:75: <h1>Order Processing Pipeline/
- samples/rust-dev-lin-lift-pipeline.scrml:76: <p>Order ID: ${@orderId}/
- samples/rust-dev-lin-lift-pipeline.scrml:78: <button onclick=runPipeline()>Process Order/
- samples/rust-dev-lin-lift-pipeline.scrml:80: <p>${@pipelineResult}/
