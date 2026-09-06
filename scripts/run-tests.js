#!/usr/bin/env node
// run-tests.js — npm test 启动器：干净 checkout 一条命令可复现（P1 修正单要求）
// 临时数据目录 + 随机端口 + spawn server + 等 ready + 跑 test_smoke.js（含 P1 worker 时间旅行子进程）+ 清理
// 用法：npm test   或   node scripts/run-tests.js
// 说明：
//   - HABITPET_DATA_DIR 指向 os.tmpdir() 下新建目录，主服务 / P1 worker / 迁移幂等校验全部落在这里，不碰真实 data/
//   - P1_PORT 传给 test_smoke.js → test_p1_worker.js，worker 时间旅行实例用独立随机端口
//   - HABITPET_NO_RANDOM=1 保证随机事件确定性（RNG 固定 0.99）
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 600) return;   // 端口已有 HTTP 响应即视为就绪
    } catch (e) { /* 尚未就绪，继续等 */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server 未在 ' + timeoutMs + 'ms 内就绪: ' + url);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'habitpet-test-'));
  const port = await freePort();
  const workerPort = await freePort();
  const env = Object.assign({}, process.env, {
    PORT: String(port),
    P1_PORT: String(workerPort),
    HABITPET_DATA_DIR: tmp,
    HABITPET_NO_RANDOM: '1',
    HABITPET_NO_TIMER: '1'   // 关闭 60s 整库落盘定时器：避免与 worker 子进程互相覆盖数据文件 / 并发写 DB_TMP 崩溃
  });
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => process.stdout.write('[server] ' + d));
  server.stderr.on('data', d => process.stderr.write('[server] ' + d));
  let code = 1;
  try {
    await waitReady('http://127.0.0.1:' + port + '/', 15000);
    console.log('== 服务器就绪（端口 ' + port + '，数据目录 ' + tmp + '，worker 端口 ' + workerPort + '） ==');
    const run = spawnSync(process.execPath, ['test_smoke.js'], {
      cwd: ROOT,
      env: Object.assign({}, env, { BASE_URL: 'http://127.0.0.1:' + port }),
      encoding: 'utf8',
      timeout: 600000
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.error) console.error('LAUNCHER-ERR', run.error.message);
    code = run.status === 0 ? 0 : 1;
  } catch (e) {
    console.error('LAUNCHER-ERR', e.message);
    code = 1;
  } finally {
    try { server.kill(); } catch (e) { /* 已退出 */ }
    await new Promise(r => setTimeout(r, 500));   // 等端口释放，避免下一次运行撞车
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }
  process.exit(code);
})();
