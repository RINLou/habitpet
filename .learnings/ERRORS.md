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
