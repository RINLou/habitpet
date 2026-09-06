#!/usr/bin/env node
// accept-360.js — 手机端（360px 视口）P1 计划卡/回归提示 浏览器验收脚本（手动运行，不进 CI）
// 依赖：playwright-core（npm i -D playwright-core）+ 本机 Chrome（或 CHROME_PATH 指定）
// 场景 #3 过期温和重开 / #4 回归提示一次 + 饿晕共存（详见 docs/ONBOARDING_CONTRACT.md）
//
// 分步用法（fixture 需要先停服，改的是数据文件本身）：
//   1) node scripts/accept-360.js setup            —— API 造号 + 记录基线 → .accept-360-state.json
//   2) 停服 → node scripts/accept-360.js fixture:expired   （或 fixture:fainted）
//   3) 起服 → node scripts/accept-360.js expired   （或 fainted）跑 360px 浏览器断言
//
// 环境变量：BASE_URL（默认 http://127.0.0.1:3000）、CHROME_PATH、HABITPET_DATA_DIR（默认 <repo>/data）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = process.env.BASE_URL || 'http://127.0.0.1:3000';
const STATE_FILE = path.join(ROOT, '.accept-360-state.json');

async function api(pathname, body, token) {
  const res = await fetch(B + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {})
  });
  return res.json();
}
function dayKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// —— 第 1 步：造号 + 基线 ——
async function setup() {
  const rnd = 'acc360' + (Date.now() % 1000000);
  const reg = await api('/api/register', { username: rnd, password: 'pass123', familyName: '360验收家', securityQ: 'Q', securityA: 'A' });
  if (!reg.ok || !reg.token) throw new Error('注册失败: ' + JSON.stringify(reg));
  const add = await api('/api/child', { name: '验收娃', grade: 'G1' }, reg.token);
  const bc = await api('/api/child/bindcode', { childId: add.childId }, reg.token);
  const bind = await api('/api/bind', { code: bc.code });
  if (!bind.ok || !bind.token) throw new Error('绑定失败');
  const sel = await api('/api/pet/select', { speciesId: 'firam' }, bind.token);
  if (!sel.ok) throw new Error('选宠失败: ' + JSON.stringify(sel));
  const me = await api('/api/me', {}, bind.token);
  const state = { username: rnd, token: bind.token, childId: add.childId, intimacy: me.intimacy, xp: me.xp, feedStreak: me.feedStreak, ts: Date.now() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('SETUP-OK 基线已写入', STATE_FILE, JSON.stringify(state));
}

// —— 第 2 步：数据文件造场景（必须先停服）——
function fixture(mode) {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const dataDir = process.env.HABITPET_DATA_DIR || path.join(ROOT, 'data');
  const dbFile = path.join(dataDir, 'habitpet.json');
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const fam = Object.values(db.families).find(f => f.children && f.children[state.childId]);
  if (!fam) throw new Error('找不到 childId=' + state.childId + ' 的家庭');
  const child = fam.children[state.childId];
  const now = Date.now();
  if (mode === 'expired') {
    // active 且 8 天前开始 → 服务端读 me 时惰性滚转为 expired；4 天前访问 → gap≥3 触发回归提示
    child.onboarding = Object.assign({}, child.onboarding, {
      status: 'active', planId: 'homework',
      startedOn: dayKey(new Date(now - 8 * 86400000)),
      completedOn: [], completedAt: null, finishedOn: null, lastDismissedOn: null, history: []
    });
  } else if (mode === 'fainted') {
    child.fainted = true;
    child.faintedAt = new Date(now).toISOString();
    child.feedDate = dayKey(new Date(now - 5 * 86400000));   // 饿了 5 天，复活卡可见
  } else {
    throw new Error('未知 fixture 场景: ' + mode);
  }
  child.lastSeenAt = new Date(now - 4 * 86400000).toISOString();
  child.returnNudge = { lastShownForGap: null, pendingGapKey: null };
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  console.log('FIXTURE-OK ' + mode + '（数据文件 ' + dbFile + '，请现在启动服务器）');
}

// —— 第 3 步：360px 浏览器断言 ——
async function browser(mode) {
  let pw;
  try { pw = require('playwright-core'); }
  catch (e) { throw new Error('需要 playwright-core：npm i -D playwright-core 后重试'); }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const launchOpts = { headless: true };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  else launchOpts.channel = 'chrome';   // 自动找本机安装的 Chrome
  const browser = await pw.chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });   // 手机端最小宽度
  const R = {};
  const loadChild = async () => {
    await page.goto(B, { waitUntil: 'networkidle' });
    await page.evaluate(([t]) => { localStorage.setItem('hp_token', t); localStorage.setItem('hp_role', 'child'); localStorage.setItem('hp_guide_seen', '1'); }, [state.token]);
    await page.goto(B, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  };

  if (mode === 'expired') {
    await loadChild();
    const cardText = await page.evaluate(() => { const el = document.querySelector('.onboarding-card'); return el ? el.innerText : ''; });
    R.expiredCard = cardText.includes('这周已经走过') && cardText.includes('从今天重新开始');
    R.noFailWord = !cardText.includes('失败') && !cardText.includes('断签');
    R.nudgeShown = await page.evaluate(() => { const el = document.getElementById('fx'); return !!el && el.innerText.includes('好久不见'); });
    await page.evaluate(() => { const b = document.querySelector('#fx .fx-btn'); if (b) b.click(); });
    await page.waitForTimeout(300);
    R.nudgeClosedByBtn = await page.evaluate(() => !document.getElementById('fx'));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    R.nudgeOnceAfterReload = await page.evaluate(() => !document.getElementById('fx'));
    const tab2 = await page.$('.tabs .tab:nth-child(2)');
    if (tab2) { await tab2.click(); await page.waitForTimeout(500); R.nudgeOnceAfterTab = await page.evaluate(() => !document.getElementById('fx')); await (await page.$('.tabs .tab:nth-child(1)')).click(); await page.waitForTimeout(400); }
    else R.nudgeOnceAfterTab = 'no-tabs-found';
    const me2 = await api('/api/me', {}, state.token);
    R.serverAckSticky = me2.returnNudge && me2.returnNudge.show === false;
    R.noScoreChange = me2.intimacy === state.intimacy && me2.xp === state.xp && me2.feedStreak === state.feedStreak;   // 红线：温和重开不动分
    R.expiredStatus = me2.onboarding && me2.onboarding.status === 'expired';
  }

  if (mode === 'fainted') {
    await loadChild();
    R.nudgeShown = await page.evaluate(() => { const el = document.getElementById('fx'); return !!el && el.innerText.includes('好久不见'); });
    let gone = false;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(420); if (await page.evaluate(() => !document.getElementById('fx'))) { gone = true; break; } }
    R.autoDismissed = gone;   // 饿晕时回归弹层 3.5s 自动淡出，不遮复活 CTA
    R.reviveVisible = await page.evaluate(() => document.body.innerText.includes('饿晕') && document.body.innerText.includes('复活'));
    await page.waitForTimeout(1200);
    R.noRepeat = await page.evaluate(() => !document.getElementById('fx'));
    const me3 = await api('/api/me', {}, state.token);
    R.serverAckSticky = me3.returnNudge && me3.returnNudge.show === false;
  }

  console.log('ACCEPT360 ' + JSON.stringify(R));
  const shot = path.join(ROOT, '.accept-360-' + mode + '.png');
  await page.screenshot({ path: shot });
  console.log('截图:', shot);
  await browser.close();
  const bad = Object.entries(R).filter(([, v]) => v === false);
  if (bad.length) { console.error('ACCEPT360-FAIL', bad.map(([k]) => k).join(',')); process.exit(1); }
  console.log('ACCEPT360-ALL-PASS');
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === 'setup') return void await setup();
  if (cmd && cmd.startsWith('fixture:')) return void fixture(cmd.split(':')[1]);
  if (cmd === 'expired' || cmd === 'fainted') return void await browser(cmd);
  console.log('用法: node scripts/accept-360.js setup | fixture:expired | fixture:fainted | expired | fainted');
  process.exit(2);
})().catch(e => { console.error('ACCEPT360-ERR', e.message); process.exit(1); });
