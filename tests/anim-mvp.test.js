// tests/anim-mvp.test.js — 焰狼动画 MVP 回归断言（review-fix 可复现测试）
// 运行前提：server 已在 127.0.0.1:3000（与 test_smoke.js 相同前提）
// 用法：node tests/anim-mvp.test.js
// 覆盖：
//   [阶段保护] juvenile / awaken / 非 firam 不挂载精灵；adult 正常挂载
//   [尺寸契约] contract.runtimeCell 与实际 frame PNG 的 IHDR 尺寸一致
//   [事件优先级] 高优先级抢占、低优先级排队、播完回 idle、pending 冲刷
//   [首载竞态] 契约未就绪时 queueEvent 不丢失
//   [失败降级] 帧加载失败 → 恢复静态 WebP、会话禁用
//   [降级开关] reduced-motion / 低核数低内存 → 不挂载
//   [定时器] 全程活跃 interval ≤ 1（不泄漏）
//   [SW 离线] sw.js ASSETS 清单逐项 200
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://127.0.0.1:3000';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function curEv(d) { return d.playing && d.playing.hero ? d.playing.hero.event : null; }
function pendEv(d) { return d.pending && d.pending.hero ? d.pending.hero.event : null; }
function httpStatus(p) {
  return new Promise(res => {
    http.get(BASE_URL + p, r => { r.resume(); res(r.statusCode); }).on('error', () => res(0));
  });
}
function pngSize(p) {
  return new Promise((res, rej) => {
    http.get(BASE_URL + p, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return rej(new Error('not png'));
        res({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
      });
    }).on('error', rej);
  });
}

// —— DOM 桩 ——
function makeEl(tag, attrs) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    className: '',
    children: [],
    parentNode: null,
    style: {},
    _attrs: attrs || {},
    classList: {
      _s: new Set(),
      contains(c) { return this._s.has(c); },
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); }
    },
    getAttribute(n) { return (n in this._attrs) ? this._attrs[n] : null; },
    setAttribute(n, v) { this._attrs[n] = String(v); },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) {
      const i = el.children.indexOf(c);
      if (i >= 0) el.children.splice(i, 1);
      c.parentNode = null;
    },
    querySelector(sel) {
      if (sel === '.pa-sprite') return el.children.find(c => c.className === 'pa-sprite') || null;
      if (sel === 'img:not(.pa-sprite)') return el.children.find(c => c.tagName === 'IMG' && c.className !== 'pa-sprite') || null;
      return null;
    }
  };
  return el;
}
function querySelectorAll(root, sel) { return sel === '[data-anim="hero"]' ? root._heroes : []; }

// —— 加载 player.js 到受控沙箱 ——
function makeSandbox(opts) {
  const activeIntervals = new Set();
  const sandbox = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); activeIntervals.add(id); return id; },
    clearInterval: id => { clearInterval(id); activeIntervals.delete(id); },
  };
  sandbox.window = sandbox;
  sandbox.document = {
    createElement: tag => makeEl(tag),
    querySelectorAll: sel => querySelectorAll(null, sel),
  };
  sandbox.navigator = opts && opts.navigator ? opts.navigator : { hardwareConcurrency: 8, deviceMemory: 8 };
  sandbox.matchMedia = q => ({ matches: !!(opts && opts.reduceMotion) });
  const failActions = (opts && opts.failActions) || {};
  sandbox.fetch = (url) => {
    const u = String(url);
    const p = u.startsWith('http') ? u.slice(BASE_URL.length) : u;
    const m = p.match(/\/anim\/firam\/(\w+)\//);
    if (m && failActions[m[1]]) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    return fetch(BASE_URL + p).then(r => ({ ok: r.ok, status: r.status, json: () => r.json() }));
  };
  sandbox.Image = function () {
    this.style = {};
    Object.defineProperty(this, 'src', {
      set(v) {
        const u = String(v);
        const p = u.startsWith('http') ? u.slice(BASE_URL.length) : u;
        const m = p.match(/\/anim\/firam\/(\w+)\//);
        const fail = m && failActions[m[1]];
        if (fail) setTimeout(() => this.onerror && this.onerror(new Error('404 ' + u)), 5);
        else httpStatus(p).then(s => { if (s === 200) { this.onload && this.onload(); } else this.onerror && this.onerror(new Error(s)); });
      }
    });
  };
  sandbox._activeIntervals = activeIntervals;
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(ROOT, 'public', 'anim', 'player.js'), 'utf8');
  vm.runInContext(code, sandbox, { filename: 'player.js' });
  return sandbox;
}

async function main() {
  // 冒烟：服务可达
  ok(await httpStatus('/') === 200, 'server reachable at ' + BASE_URL);

  // ========== [阶段保护]（step-2）==========
  console.log('[阶段保护]');
  {
    const sb = makeSandbox();
    const PetAnim = sb.window.PetAnim;
    await PetAnim.ready();
    ok(sb.window.PetAnim._debug().contractLoaded, '契约加载成功');
    ok(sb.window.PetAnim._debug().canonicalStage === 'adult', 'canonicalStage = adult');

    const juv = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'juvenile' });
    juv.appendChild(makeEl('img'));
    await PetAnim._mount(juv);
    ok(!juv.querySelector('.pa-sprite'), '幼体(juvenile)：不挂载精灵帧');
    ok(!juv.children.find(c => c.className !== 'pa-sprite').style.display, '幼体：原静态 WebP 可见');

    const awk = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'awaken' });
    awk.appendChild(makeEl('img'));
    await PetAnim._mount(awk);
    ok(!awk.querySelector('.pa-sprite'), '觉醒(awaken)：不挂载精灵帧');

    const other = makeEl('div', { 'data-anim': 'hero', 'data-species': 'luna', 'data-stage': 'adult' });
    other.appendChild(makeEl('img'));
    await PetAnim._mount(other);
    ok(!other.querySelector('.pa-sprite'), '非 firam(luna)：不挂载精灵帧');

    const adult = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'adult' });
    const orig = makeEl('img');
    adult.appendChild(orig);
    await PetAnim._mount(adult);
    ok(!!adult.querySelector('.pa-sprite'), '成体(adult)：挂载精灵帧');
    ok(orig.style.display === 'none', '成体：原 WebP 隐藏但保留（降级恢复用）');
    ok(PetAnim._debug().timerActive, '成体：idle 循环在播');

    ok(PetAnim.canAnimate('firam', 'adult') === true, 'canAnimate(firam,adult)=true');
    ok(PetAnim.canAnimate('firam', 'juvenile') === false, 'canAnimate(firam,juvenile)=false');
    ok(PetAnim.canAnimate('firam', 'awaken') === false, 'canAnimate(firam,awaken)=false');
    ok(PetAnim.canAnimate('luna', 'adult') === false, 'canAnimate(luna,adult)=false');

    // 失败恢复静态（阶段保护元素的原始 img 都还在）
    ok(!!juv.querySelector('img:not(.pa-sprite)'), '幼体原始 img 未被销毁');
  }

  // ========== [尺寸契约]（step-2）==========
  console.log('[尺寸契约]');
  {
    const contract = await (await fetch(BASE_URL + '/anim/firam/contract.json')).json();
    ok(contract.sourceCell && contract.sourceCell.width === 512, 'contract.sourceCell=512（生成/QC 基准）');
    ok(contract.runtimeCell && contract.runtimeCell.width === 256, 'contract.runtimeCell=256');
    const f = await pngSize('/anim/firam/idle/frame-0.png');
    ok(f.width === contract.runtimeCell.width && f.height === contract.runtimeCell.height,
      `实际帧尺寸 ${f.width}x${f.height} 与 runtimeCell 一致`);
    const f6 = await pngSize('/anim/firam/levelUp/frame-5.png');
    ok(f6.width === contract.runtimeCell.width, 'levelUp 帧尺寸一致');
  }

  // ========== [事件优先级 + 回 idle + 定时器]（step-3）==========
  console.log('[事件优先级]');
  {
    const sb = makeSandbox();
    const PetAnim = sb.window.PetAnim;
    const adult = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'adult' });
    adult.appendChild(makeEl('img'));
    await PetAnim._mount(adult);
    await sleep(150);
    ok(curEv(PetAnim._debug()) === 'idle', '挂载后播放 idle');

    PetAnim.queueEvent('hero', 'feed_success');       // 10 > 0 立即播
    await sleep(120);
    ok(curEv(PetAnim._debug()) === 'feed_success', 'feed_success(10) 抢占 idle(0)');

    PetAnim.queueEvent('hero', 'level_up');           // 20 > 10 抢占
    await sleep(120);
    ok(curEv(PetAnim._debug()) === 'level_up', 'level_up(20) 抢占 feed_success(10)');

    PetAnim.queueEvent('hero', 'feed_success');       // 10 <= 20 排队
    ok(pendEv(PetAnim._debug()) === 'feed_success', 'feed_success(10) 在 level_up 播放期间排队');

    PetAnim.queueEvent('hero', 'return');             // 15 <= 20 排队，且 15>10 覆盖 pending
    ok(pendEv(PetAnim._debug()) === 'return', '同队列按优先级保留更高者(return 15 > feed 10)');

    // 等 level_up(750ms) 播完 → 回 idle → 冲刷 pending 播 return(tired 循环 3s)
    await sleep(1400);
    ok(curEv(PetAnim._debug()) === 'return', 'level_up 播完回 idle 并冲刷 pending 播 return');
    ok(!pendEv(PetAnim._debug()), 'pending 已清空');

    // return maxDurationMs=3000 + idle 切换 → 最终回到 idle 且无排队
    await sleep(3400);
    const d = PetAnim._debug();
    ok(!curEv(d) || curEv(d) === 'idle', 'return 播完回到 idle');
    ok(!pendEv(d), '无残留 pending');
    ok(d.animDisabled === false, '全程无失败降级');
    ok(sb._activeIntervals.size <= 1, `活跃 interval ≤ 1（实际 ${sb._activeIntervals.size}），无泄漏`);
  }

  // ========== [首载竞态]（step-3）==========
  console.log('[首载竞态]');
  {
    const sb = makeSandbox();
    const PetAnim = sb.window.PetAnim;
    PetAnim.ready(); // 不等待，契约在途中
    PetAnim.queueEvent('hero', 'level_up'); // 契约未就绪时抛事件
    ok(pendEv(PetAnim._debug()) === 'level_up', '契约未就绪时 level_up 入 pending 不丢失');
    const adult = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'adult' });
    adult.appendChild(makeEl('img'));
    await PetAnim._mount(adult);
    await sleep(200);
    ok(curEv(PetAnim._debug()) === 'level_up', '挂载完成后冲刷，level_up 正常播放');
    await sleep(1200);
    const d = PetAnim._debug();
    ok((!curEv(d) || curEv(d) === 'idle') && d.timerActive, 'level_up 播完回 idle');
  }

  // ========== [失败降级]（step-3）==========
  console.log('[失败降级]');
  {
    const sb = makeSandbox({ failActions: { eat: true } });
    const PetAnim = sb.window.PetAnim;
    const adult = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'adult' });
    const orig = makeEl('img');
    adult.appendChild(orig);
    await PetAnim._mount(adult);
    await sleep(150);
    ok(!!adult.querySelector('.pa-sprite'), '挂载正常（idle 可用）');
    PetAnim.queueEvent('hero', 'feed_success'); // eat 帧将 404
    await sleep(300);
    const d = PetAnim._debug();
    ok(d.animDisabled === true, 'eat 帧失败 → 会话级降级启用');
    ok(d.failedActions.eat === true, 'eat 标记为不可用');
    ok(!adult.querySelector('.pa-sprite'), '精灵层已移除');
    ok(orig.style.display !== 'none', '原静态 WebP 恢复可见');
    ok(sb._activeIntervals.size === 0, '降级后无残留定时器');
    PetAnim.queueEvent('hero', 'level_up'); // 禁用后事件不再触发播放
    await sleep(150);
    ok(!adult.querySelector('.pa-sprite'), '禁用状态下后续事件保持静态');
  }

  // ========== [降级开关]（step-5 前置）==========
  console.log('[降级开关]');
  {
    const sbRm = makeSandbox({ reduceMotion: true });
    await sbRm.window.PetAnim.ready();
    const elRm = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'adult' });
    elRm.appendChild(makeEl('img'));
    await sbRm.window.PetAnim._mount(elRm);
    ok(!elRm.querySelector('.pa-sprite'), 'prefers-reduced-motion：不挂载');

    const sbLow = makeSandbox({ navigator: { hardwareConcurrency: 2, deviceMemory: 2 } });
    await sbLow.window.PetAnim.ready();
    const elLow = makeEl('div', { 'data-anim': 'hero', 'data-species': 'firam', 'data-stage': 'adult' });
    elLow.appendChild(makeEl('img'));
    await sbLow.window.PetAnim._mount(elLow);
    ok(!elLow.querySelector('.pa-sprite'), '低核数+低内存：不挂载');
    ok(sbLow.window.PetAnim.isEnabled() === false, 'isEnabled()=false（低性能）');
  }

  // ========== [SW 离线清单]（step-5 前置）==========
  console.log('[SW 离线清单]');
  {
    const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
    const m = sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\];/);
    ok(!!m, 'sw.js 含 ASSETS 清单');
    const urls = (m[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)).filter(u => u.startsWith('/'));
    ok(urls.length >= 30, `清单含 ${urls.length} 项`);
    let bad = [];
    for (const u of urls) { if (await httpStatus(u) !== 200) bad.push(u); }
    ok(bad.length === 0, 'ASSETS 全部可被服务端 200 命中' + (bad.length ? '，失败：' + bad.join(',') : ''));
    const animCount = urls.filter(u => u.includes('/anim/')).length;
    ok(animCount >= 24, `anim 资源已纳入离线（${animCount} 项）`);
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('测试执行异常：', e); process.exit(1); });
