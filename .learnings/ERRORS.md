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
- **Resolved**: 2026-09-08T19:25:00+08:00
- **Notes**: Do not stop or replace the existing service. Reuse it for `npm run test:anim`; use `npm test` for isolated server regression.

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
