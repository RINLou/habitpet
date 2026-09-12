## [ERR-20260908-001] animation_test_port_conflict

**Logged**: 2026-09-08T19:25:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Starting a second local server for animation tests failed because port 3000 was already occupied.

### Error
```
Error: listen EADDRINUSE: address already in use :::3000
```

### Context
- Command attempted: `node server.js`
- The existing local application service already owned port 3000.

### Resolution
- **Resolved**: 2026-09-13T00:00:00+08:00
- **Notes**: `npm run test:anim` now uses `scripts/run-anim-tests.js` to allocate an isolated random port and temporary data directory; no pre-existing local service is required.

### Metadata
- Reproducible: yes
- Related Files: `tests/anim-mvp.test.js`, `scripts/run-tests.js`

---

## [ERR-20260908-002] playwright_chrome_missing

**Logged**: 2026-09-08T19:27:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Playwright CLI could not launch its default Chrome channel because Chrome is not installed at the expected user path.

### Error
```
Chromium distribution 'chrome' is not found at C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe
```

### Context
- Command attempted: `playwright-cli -s=story open http://127.0.0.1:3105`
- The local source server was running normally on port 3105.

### Suggested Fix
Use an installed Edge executable when available, or use the in-app browser automation surface for the responsive check.

### Resolution
- **Resolved**: 2026-09-08T19:35:00+08:00
- **Notes**: Playwright CLI launched successfully with `--browser msedge`; the 360px story-choice and album flows were then verified.

### Metadata
- Reproducible: yes
- Related Files: `scripts/accept-360.js`

---

## [ERR-20260913-001] chapter_node_metadata_compatibility

**Logged**: 2026-09-13T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
Adding a chapterId guard to companion story beats broke callers that use exported first-chapter NODE_CATALOG nodes without runtime metadata.

### Error
```
TypeError: Cannot read properties of null (reading 'phase')
```

### Resolution
- Treat a missing node.chapterId as the legacy first chapter; require an explicit non-first chapter ID before suppressing a first-chapter companion beat.
- Keep new runtime nodes explicitly tagged, while preserving the documented NODE_CATALOG export contract.

### Metadata
- Reproducible: yes
- Related Files: lib/adventure.js, tests/adventure-mvp.test.js

---

## [ERR-20260913-002] github_push_connection_reset

**Logged**: 2026-09-13T00:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
GitHub push for the release branch was reset by the network after the local commit completed.

### Error
```
fatal: unable to access 'https://github.com/RINLou/habitpet.git/': Recv failure: Connection was reset
```

### Context
- Branch: codex/story-release-ready
- Commit: 4473ac9
- A previous push in this workspace also returned an empty remote reply.

### Suggested Fix
Retry from a stable network connection; verify the remote branch before treating the work as published.

### Metadata
- Reproducible: unknown
- Related Files: .git/config

---

## [ERR-20260913-004] release_patch_context_drift

**Logged**: 2026-09-13T10:05:00+08:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary
A broad release patch assumed an exact copy of the old offline-route block and was rejected before any file changed.

### Error
```
apply_patch verification failed: Failed to find expected lines in public/lib/local.js
```

### Resolution
- Split release edits into narrow, independently verifiable patches and re-read the target before replacing generated/offline compatibility code.

### Metadata
- Reproducible: yes
- Related Files: public/lib/local.js

---

## [ERR-20260913-005] local_browser_dependency_missing

**Logged**: 2026-09-13T10:15:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The repository's 360px acceptance helper cannot start because playwright-core is not installed locally.

### Error
```
NOT_INSTALLED
```

### Resolution
- Use the approved Playwright CLI through npx with the installed Edge executable for this release check; do not add a permanent browser dependency solely for a one-off acceptance run.

### Metadata
- Reproducible: yes
- Related Files: scripts/accept-360.js

---

## [ERR-20260913-006] apk_asset_sync_timestamp_collision

**Logged**: 2026-09-13T10:25:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: release

### Summary
The first APK asset copy trusted timestamps and skipped a same-size local.js whose content had changed, leaving the retired WorkBuddy endpoint in the APK copy.

### Error
```
webview-apk/assets/www/lib/local.js still contained workbuddy.link after a normal robocopy /E sync
```

### Resolution
- Re-synced with robocopy /IS and verified SHA-256 equality for app.js, local.js, index.html, sw.js, adventure UMD and runtime config.
- The release builder always copies public/ into a fresh staging directory, so it cannot reuse the historical asset timestamp.

### Metadata
- Reproducible: yes
- Related Files: scripts/build-apk.ps1, webview-apk/assets/www/lib/local.js

---

## [ERR-20260913-007] powershell_bash_operator

**Logged**: 2026-09-13T10:25:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
A PowerShell verification command used the Bash-only `||` operator.

### Error
```
The term 'exit' is not recognized as a name of a cmdlet
```

### Resolution
- Use explicit PowerShell conditionals for optional no-match checks.

### Metadata
- Reproducible: yes
- Related Files: webview-apk/assets/www

---

## [ERR-20260913-008] web_tool_response_shape

**Logged**: 2026-09-13T10:40:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
An orchestration wrapper assumed a web-tool response shape that was not present and attempted to map an undefined value.

### Error
```
TypeError: Cannot read properties of undefined (reading 'map')
```

### Resolution
- Treat the returned value as an opaque tool result and emit only validated text fields.

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md

---

## [ERR-20260913-009] accessibility_value_assignment

**Logged**: 2026-09-13T10:45:00+08:00
**Priority**: low
**Status**: resolved
**Area**: browser-test

### Summary
The browser automation accessibility node exposed an input without a settable value property.

### Error
```
Accessibility element has no settable value
```

### Resolution
- Focus the field and send keyboard input; retain that interaction pattern for the mobile-width smoke check.

### Metadata
- Reproducible: yes
- Related Files: scripts/accept-360.js

---

## [ERR-20260913-010] aapt_unicode_path

**Logged**: 2026-09-13T10:55:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: release

### Summary
The retained aapt binary could start from the WorkBuddy toolchain but failed to open an Android platform jar whose absolute path contained Chinese characters.

### Error
```
Unable to open android.jar: Illegal byte sequence
```

### Resolution
- Copy all aapt inputs, including manifest, resources, Java source and android.jar, into an ASCII-only temporary staging root before invoking Android tools.

### Metadata
- Reproducible: yes
- Related Files: scripts/build-apk.ps1

---

## [ERR-20260913-011] powershell_nested_parse_encoding

**Logged**: 2026-09-13T10:55:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
A nested PowerShell parser check decoded the UTF-8 script using the legacy console code page and produced false syntax errors for Chinese messages.

### Error
```
Unexpected token ... The string is missing the terminator
```

### Resolution
- Do not use an unqualified nested Get-Content parser check for UTF-8 scripts; execute the script with safe validation inputs instead.

### Metadata
- Reproducible: yes
- Related Files: scripts/build-apk.ps1

---

## [ERR-20260913-012] legacy_d8_java21_bootstrap

**Logged**: 2026-09-13T11:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: release

### Summary
The retained d8.bat wrapper passes the Java 8 java.ext.dirs option, which JDK 21 rejects before D8 starts.

### Error
```
-Djava.ext.dirs=... is not supported. Use -classpath instead.
```

### Resolution
- Invoke the same bundled d8.jar main class directly with the configured JDK, and stage the jar under the ASCII-only build root.

### Metadata
- Reproducible: yes
- Related Files: scripts/build-apk.ps1

---

## [ERR-20260913-013] d8_directory_input

**Logged**: 2026-09-13T11:05:00+08:00
**Priority**: low
**Status**: resolved
**Area**: release

### Summary
Direct invocation of the bundled D8 accepts class or archive files, not the containing classes directory.

### Error
```
Unsupported source file type: .../classes
```

### Resolution
- Enumerate generated .class files recursively and pass those explicit files to D8.

### Metadata
- Reproducible: yes
- Related Files: scripts/build-apk.ps1

---

## [ERR-20260913-014] guarded_temp_cleanup_rejected

**Logged**: 2026-09-13T11:10:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tooling

### Summary
The execution environment rejected a guarded Remove-Item cleanup command before it ran.

### Error
```
Rejected by policy
```

### Resolution
- Leave the generated verification artifact in already-ignored dist/ and add the APK staging directory to .gitignore so no temporary build output can enter source control.

### Metadata
- Reproducible: environment-specific
- Related Files: .gitignore

---

## [ERR-20260913-015] github_push_connection_reset

**Logged**: 2026-09-13T11:20:00+08:00
**Priority**: medium
**Status**: investigating
**Area**: delivery

### Summary
The first attempt to push the release candidate branch to GitHub lost its HTTPS connection before the remote confirmed receipt.

### Error
```
Recv failure: Connection was reset
```

### Resolution
- Retry the idempotent branch push once; if it still fails, retain the local commit hash and hand off that exact commit to WorkBuddy for delivery.

### Metadata
- Reproducible: unknown
- Related Files: .git/refs/heads/codex/story-release-ready

---
