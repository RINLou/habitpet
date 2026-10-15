'use strict';
// 灵汐云 → 新库 每日同步 + 一键迁移（v11）
// 目标：老板全家的历史数据（灵汐云 lingxi-mainland-api）绝不丢失。
// 机制：
//   1) 每日拉取快照：登录灵汐云 → /api/sync/full 全量家庭数据 → 存 MIRROR_DIR/lingxi-<date>.json
//   2) 一键迁移 applyMigration：把快照合并进新库家庭（孩子/账本/图鉴/照片全覆盖，数值取max，永不删除）
// 配置（env 或 .env）：LINGXI_URL / LINGXI_USER / LINGXI_PASS
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const LINGXI_URL = (process.env.LINGXI_URL || 'https://lingxi-mainland-api.app.workbuddy.host').replace(/\/+$/, '');
const LINGXI_USER = process.env.LINGXI_USER || '';
const LINGXI_PASS = process.env.LINGXI_PASS || '';
const MIRROR_DIR = path.join(
  process.env.HABITPET_DATA_DIR || path.join(__dirname, '..', 'data'),
  'lingxi_mirror'
);
const STATE_FILE = path.join(MIRROR_DIR, 'state.json');
const CREDS_FILE = path.join(MIRROR_DIR, 'credentials.json');

// 凭据来源优先级：DATA_DIR/lingxi_mirror/credentials.json（admin 接口注入，随数据持久化）→ env/.env
// （云端沙箱部署不上传 .env，所以线上主要靠 credentials.json）
function loadCreds() {
  try {
    const c = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    if (c && c.user && c.pass) return c;
  } catch (e) { /* 无文件 */ }
  if (LINGXI_USER && LINGXI_PASS) return { user: LINGXI_USER, pass: LINGXI_PASS };
  return null;
}

function dateKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function ensureDir() { fs.mkdirSync(MIRROR_DIR, { recursive: true }); }

function requestJson(base, pathname, body, method, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const u = new URL(base + pathname);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: method || (data ? 'POST' : 'GET'),
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
        headers || {}
      ),
      timeout: 25000
    }, res => {
      let s = '';
      res.on('data', c => { s += c; });
      res.on('end', () => {
        if (res.statusCode === 200 && pathname.startsWith('/api/photo')) return resolve({ raw: s });   // 照片是 data-uri 文本
        try { resolve(JSON.parse(s)); } catch (e) { reject(new Error('bad json from ' + pathname + ': ' + s.slice(0, 120))); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout ' + pathname)); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// —— 拉取灵汐云全量数据（家庭 + 打卡照片）——————————————————————
async function pullSnapshot(opts) {
  const base = (opts && opts.url) || LINGXI_URL;
  const creds = (opts && opts.user) ? { user: opts.user, pass: opts.pass } : loadCreds();
  if (!creds) { const e = new Error('灵汐云凭据未配置（LINGXI_USER/LINGXI_PASS 或 credentials.json）'); e.code = 'NO_CRED'; throw e; }
  const user = creds.user, pass = creds.pass;

  const login = await requestJson(base, '/api/login', { username: user, password: pass });
  if (!login || !login.token) throw new Error('灵汐云登录失败: ' + JSON.stringify(login).slice(0, 120));
  const token = login.token;

  const full = await requestJson(base, '/api/sync/full', { token });
  const family = full && (full.family || (full.state && full.state.family) || full.f);
  if (!family || !family.children) throw new Error('灵汐云 sync/full 无家庭数据: ' + JSON.stringify(full).slice(0, 120));

  // 打卡照片：家庭级 evidenceIds + 各孩子 pending 中带照片的事件
  const ids = new Set(family.evidenceIds || []);
  for (const c of Object.values(family.children || {})) {
    for (const ev of (c.pending || [])) if (ev.hasPhoto) ids.add(ev.id);
  }
  const photos = {};
  for (const id of ids) {
    try {
      const r = await requestJson(base, '/api/photo?id=' + encodeURIComponent(id) + '&token=' + encodeURIComponent(token), undefined, 'GET', { Authorization: 'Bearer ' + token });
      if (r && r.raw && r.raw.startsWith('data:image/')) photos[id] = r.raw;
    } catch (e) { /* 单张失败不阻塞 */ }
  }

  const snap = { pulledAt: new Date().toISOString(), source: base, schemaVersion: family.schemaVersion || null, family, photos };
  ensureDir();
  fs.writeFileSync(path.join(MIRROR_DIR, 'lingxi-' + dateKey() + '.json'), JSON.stringify(snap));
  fs.writeFileSync(path.join(MIRROR_DIR, 'lingxi-latest.json'), JSON.stringify(snap));
  try {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    st.lastPull = snap.pulledAt; st.lastPullDate = dateKey(); st.lastError = null;
    fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2));
  } catch (e) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastPull: snap.pulledAt, lastPullDate: dateKey(), lastError: null }, null, 2));
  }
  return snap;
}

// —— 每日守门：日期变了才拉（由 store 定时器每 6 小时唤起）—————————
async function dailyPull() {
  ensureDir();
  let st = {};
  try { st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { /* 首次 */ }
  if (st.lastPullDate === dateKey()) return { skipped: true, lastPullDate: st.lastPullDate };
  try {
    const snap = await pullSnapshot();
    return { ok: true, pulledAt: snap.pulledAt, children: Object.keys(snap.family.children || {}).length };
  } catch (e) {
    try {
      const st2 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      st2.lastError = String(e.message || e); st2.lastErrorAt = new Date().toISOString();
      fs.writeFileSync(STATE_FILE, JSON.stringify(st2, null, 2));
    } catch (e2) { /* ignore */ }
    if (e.code === 'NO_CRED') return { skipped: true, reason: 'no-credentials' };
    throw e;
  }
}

function readLatest() {
  try { return JSON.parse(fs.readFileSync(path.join(MIRROR_DIR, 'lingxi-latest.json'), 'utf8')); }
  catch (e) { return null; }
}
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveCreds(user, pass) {
  ensureDir();
  fs.writeFileSync(CREDS_FILE, JSON.stringify({ user: String(user), pass: String(pass), savedAt: new Date().toISOString() }));
  try { fs.chmodSync(CREDS_FILE, 0o600); } catch (e) { /* Windows 忽略 */ }
  return { ok: true, user: String(user) };
}
function listSnapshots() {
  ensureDir();
  return fs.readdirSync(MIRROR_DIR).filter(f => /^lingxi-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
    .map(f => { const s = fs.statSync(path.join(MIRROR_DIR, f)); return { file: f, size: s.size }; });
}

// —— 一键迁移：灵汐家庭 → 新库家庭（合并策略：数值取max、历史全并入、永不删除）———
function maxNum(a, b) { return Math.max(Number(a) || 0, Number(b) || 0); }

function mergeLedger(dst, src) {
  if (!Array.isArray(dst)) return;
  const have = new Set(dst.map(x => x.id));
  let added = 0;
  for (const e of (src || [])) if (!have.has(e.id)) { dst.push(e); added++; }
  dst.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  if (dst.length > 2000) dst.length = 2000;
  return added;
}

function applyMigration(store, targetFamily, snap, opts) {
  const lf = snap.family;
  const summary = { created: [], merged: [], ledgerAdded: 0, photosCopied: 0, notes: [] };

  // 1) 家庭账本 / rewards / evidenceIds
  summary.ledgerAdded += mergeLedger(targetFamily.ledger, lf.ledger) || 0;
  const rHave = new Set((targetFamily.rewards || []).map(r => r.id));
  for (const r of (lf.rewards || [])) if (!rHave.has(r.id)) (targetFamily.rewards = targetFamily.rewards || []).push(r);
  const eHave = new Set(targetFamily.evidenceIds || []);
  for (const id of (lf.evidenceIds || [])) if (!eHave.has(id)) { (targetFamily.evidenceIds = targetFamily.evidenceIds || []).push(id); }

  // 2) 孩子逐个合并
  for (const lc of Object.values(lf.children || {})) {
    let tc = Object.values(targetFamily.children || {}).find(c => c.name === lc.name);
    let isNew = false;
    if (!tc) {
      tc = store.addChild(targetFamily, lc.name, lc.grade || 'G3');
      summary.created.push(lc.name); isNew = true;
    } else summary.merged.push(lc.name);

    if (isNew) {
      // 新建孩子：忠实照抄灵汐数值（新家庭默认 initialIntimacy 会虚高，不能用 max）
      tc.xp = Number(lc.xp) || 0; tc.level = Number(lc.level) || 1;
      tc.intimacy = Number(lc.intimacy) || tc.intimacy;
      tc.points = Number(lc.points) || 0;
      tc.feedStreak = Number(lc.feedStreak) || 0;
    } else {
      // 已有孩子：数值取 max（绝不回退）
      tc.xp = maxNum(tc.xp, lc.xp); tc.level = maxNum(tc.level, lc.level);
      tc.intimacy = maxNum(tc.intimacy, lc.intimacy);
      tc.points = maxNum(tc.points, lc.points);
      tc.feedStreak = maxNum(tc.feedStreak, lc.feedStreak);
    }
    if ((lc.pet && lc.pet.stats)) {
      if (!tc.pet) { tc.pet = JSON.parse(JSON.stringify(lc.pet)); }
      else for (const k of Object.keys(lc.pet.stats || {})) tc.pet.stats[k] = maxNum(tc.pet.stats[k], lc.pet.stats[k]);
      tc.pet.freePoints = maxNum(tc.pet.freePoints, lc.pet.freePoints);
      if (!tc.pet.nickname && lc.pet.nickname) tc.pet.nickname = lc.pet.nickname;
    }
    // 申报队列 / 毕业图鉴 / 自豪周
    const pHave = new Set((tc.pending || []).map(x => x.id));
    for (const ev of (lc.pending || [])) if (!pHave.has(ev.id)) (tc.pending = tc.pending || []).push(ev);
    const dHave = new Set((tc.pokedex || []).map(x => (x.speciesId + '|' + x.archivedAt)));
    for (const en of (lc.pokedex || [])) if (!dHave.has(en.speciesId + '|' + en.archivedAt)) (tc.pokedex = tc.pokedex || []).unshift(en);
    if (lc.prideWeekKey && !tc.prideWeekKey) tc.prideWeekKey = lc.prideWeekKey;
    // 月度统计：逐月取 max
    if (lc.monthStats) {
      tc.monthStats = tc.monthStats || {};
      for (const mk of Object.keys(lc.monthStats)) {
        tc.monthStats[mk] = tc.monthStats[mk] || {};
        for (const k of Object.keys(lc.monthStats[mk])) {
          const v = lc.monthStats[mk][k];
          tc.monthStats[mk][k] = typeof v === 'number' ? maxNum(tc.monthStats[mk][k], v) : (tc.monthStats[mk][k] || v);
        }
      }
    }
    // 冒险/引导：目标没有才复制（目标是四章超集，绝不覆盖新进度）
    if (!tc.adventure && lc.adventure) tc.adventure = JSON.parse(JSON.stringify(lc.adventure));
    if (!tc.onboarding && lc.onboarding) tc.onboarding = JSON.parse(JSON.stringify(lc.onboarding));
    if (lc.complaints) {
      tc.complaints = tc.complaints || [];
      const cHave = new Set((Array.isArray(tc.complaints) ? tc.complaints : []).map(x => x.id));
      for (const cm of lc.complaints) if (!cHave.has(cm.id)) tc.complaints.push(cm);
    }
    if (lc.rules) {
      tc.rules = tc.rules || {};
      for (const k of Object.keys(lc.rules)) if (tc.rules[k] === undefined) tc.rules[k] = lc.rules[k];
    }
    if (Array.isArray(lc.customRules) && lc.customRules.length) {
      const crHave = new Set((tc.customRules || []).map(x => x.id));
      for (const cr of lc.customRules) if (!crHave.has(cr.id)) (tc.customRules = tc.customRules || []).push(cr);
    }
    if (lc.awakenedSemesters) {
      tc.awakenedSemesters = tc.awakenedSemesters || [];
      for (const s of lc.awakenedSemesters) if (!tc.awakenedSemesters.includes(s)) tc.awakenedSemesters.push(s);
    }
  }

  // 3) 家庭规则/配置：缺的补上
  if (lf.rules) {
    targetFamily.rules = targetFamily.rules || {};
    for (const k of Object.keys(lf.rules)) if (targetFamily.rules[k] === undefined) targetFamily.rules[k] = lf.rules[k];
  }
  if (lf.config) {
    targetFamily.config = targetFamily.config || {};
    for (const k of Object.keys(lf.config)) if (targetFamily.config[k] === undefined && k !== 'semester') targetFamily.config[k] = lf.config[k];
  }

  // 4) 打卡照片落盘（DATA_DIR/photos/<id>.img，与 server.js PHOTO_DIR 一致）
  const photoDir = path.join(process.env.HABITPET_DATA_DIR || path.join(__dirname, '..', 'data'), 'photos');
  try {
    fs.mkdirSync(photoDir, { recursive: true });
    for (const [id, dataUri] of Object.entries(snap.photos || {})) {
      const f = path.join(photoDir, id + '.img');
      if (!fs.existsSync(f)) { fs.writeFileSync(f, dataUri); summary.photosCopied++; }
    }
  } catch (e) { summary.notes.push('照片落盘失败: ' + (e.message || e)); }

  return summary;
}

module.exports = { pullSnapshot, dailyPull, applyMigration, readLatest, readState, listSnapshots, loadCreds, saveCreds, LINGXI_URL, MIRROR_DIR, MIRROR_FILE: CREDS_FILE, mergeLedger, dateKey };
