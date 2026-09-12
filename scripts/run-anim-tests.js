#!/usr/bin/env node
'use strict';
// 动画验收启动器：不要依赖开发机恰好有一个 3000 服务在跑。
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
    server.on('error', reject);
  });
}
async function ready(url) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    try { if ((await fetch(url)).status < 600) return; } catch (e) { /* 等待服务 */ }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error('动画验收服务未就绪：' + url);
}
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'habitpet-anim-test-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), HABITPET_DATA_DIR: temp, HABITPET_NO_TIMER: '1' };
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => process.stdout.write('[server] ' + chunk));
  server.stderr.on('data', chunk => process.stderr.write('[server] ' + chunk));
  let code = 1;
  try {
    const base = 'http://127.0.0.1:' + port;
    await ready(base + '/');
    const run = spawnSync(process.execPath, ['tests/anim-mvp.test.js'], { cwd: ROOT, env: { ...env, BASE_URL: base }, encoding: 'utf8', timeout: 120000 });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.error) throw run.error;
    code = run.status === 0 ? 0 : 1;
  } catch (error) {
    console.error('ANIM-TEST-LAUNCHER-ERR', error.message);
  } finally {
    try { server.kill(); } catch (e) { /* 已退出 */ }
    await new Promise(resolve => setTimeout(resolve, 300));
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (e) { /* 临时目录清理失败不掩盖测试结果 */ }
  }
  process.exit(code);
})();
