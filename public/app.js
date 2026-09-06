/* app.js — 养成好习惯 App 前端（孩子端 + 家长端） */
'use strict';

const $ = s => document.querySelector(s);
let token = localStorage.getItem('hp_token') || '';
let role = localStorage.getItem('hp_role') || '';
let me = null;        // 孩子端状态
let fam = null;       // 家长端状态
let curTab = 'pet';
let curBattle = null, battleTimer = null;
let lastPetLevel = null;
let pinCache = '', pinCacheAt = 0;                // 敏感操作 PIN 内存缓存（5 分钟）

// —— PWA 安装引导：安卓一键安装 / iOS 图文引导 ——
let installEvt = null;                            // 浏览器暂存的安装事件（安卓）
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => {
  installEvt = null;
  localStorage.setItem('hp_installed', '1');
  toast('📲 安装成功，桌面见！');
});
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function installLink() {
  if (isStandalone() || localStorage.getItem('hp_installed') || localStorage.getItem('hp_install_skip')) return '';
  if (!/android|iphone|ipad|ipod/i.test(navigator.userAgent)) return '';
  return '<a href="#" onclick="doInstall();return false">📲 装App</a> · ';
}
async function doInstall() {
  if (installEvt) {                               // 安卓：系统原生安装框
    installEvt.prompt();
    try { const r = await installEvt.userChoice; if (r && r.outcome === 'accepted') localStorage.setItem('hp_installed', '1'); } catch (_) {}
    installEvt = null;
    return;
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return openIosGuide();
  toast('当前浏览器不支持一键安装，可用浏览器菜单里的「添加到主屏幕」');
}
function openIosGuide() {                         // iOS：系统不允许自动安装，图文引导手动添加
  openModal(`<h3>📲 把小灵伴装到桌面</h3>
    <div class="warnbox">三步搞定，装好后点桌面图标就能全屏玩～</div>
    <div class="item"><div class="t"><div class="n">① 点浏览器底部中间的「分享」按钮</div><div class="s">一个方框加向上箭头 ⬆️ 的图标</div></div></div>
    <div class="item"><div class="t"><div class="n">② 往下滑，找到「添加到主屏幕」</div><div class="s">认准灰色小图标 ➕</div></div></div>
    <div class="item"><div class="t"><div class="n">③ 点右上角「添加」</div><div class="s">桌面上就会出现金色愿望球图标啦</div></div></div>
    <button class="btn" onclick="localStorage.setItem('hp_installed','1');closeModal();toast('装好后桌面见！ 🌟')">我装好了</button>
    <button class="btn ghost" onclick="localStorage.setItem('hp_install_skip','1');closeModal()">下次再说，不再提醒</button>`);
}

// ============================================================
// v5 灵汐大陆：立绘 / 事件演出 / 随机彩蛋（配 audio.js 使用）
// ============================================================
const ART_BY_SPECIES = { firam:'firam.png', volt:'volt.png', tidal:'tidal.png', night:'night.png', luna:'luna.png', mount:'mount.png', thorn:'thorn.png', rime:'rime.png', kirin:'kirin.png', dragon:'dragon.png' };
const ART_BY_EMOJI = { '🐺':'firam.png', '🦅':'volt.png', '🐢':'tidal.png', '🐆':'night.png', '🦊':'luna.png', '🐻':'mount.png', '🦎':'thorn.png', '🐧':'rime.png', '🦌':'kirin.png', '🐉':'dragon.png' };
const STAGE_POS = { juvenile: 0, adult: 1, awaken: 2 };   // 三段进化图：左幼体/中成体/右觉醒
// stageKey='orb' 用愿望球；有 stageKey 裁对应 1/3；没有则展示完整单图
function petArtById(sid, stageKey, cls, idle) {
  const file = ART_BY_SPECIES[sid];
  if (!file) return `<div class="pet-art ${cls || ''}"><div class="p-art-fallback">❔</div></div>`;
  if (stageKey === 'orb') return `<div class="pet-art ${cls || ''}"><img class="pos-single" src="img/wishball.png" alt=""></div>`;
  const pos = STAGE_POS[stageKey];
  if (pos === undefined) return `<div class="pet-art ${cls || ''}"><img class="pos-single" src="img/${file}" alt=""></div>`;
  return `<div class="pet-art ${cls || ''}${idle ? ' idle' : ''}"><img class="pos-${pos}" src="img/${file}" alt=""${idle ? ` style="animation-delay:-${(Math.random() * 3).toFixed(1)}s"` : ''}></div>`;
}
function petArt(emoji, stageKey, cls, idle) {
  const file = ART_BY_EMOJI[emoji];
  if (!file) return `<div class="pet-art ${cls || ''}"><div class="p-art-fallback">${emoji || '⚪'}</div></div>`;
  return petArtById(Object.keys(ART_BY_SPECIES).find(k => ART_BY_SPECIES[k] === file), stageKey, cls, idle);
}
// 战斗立绘：Boss 用荒野挑战者图，真人/AI 分身按种族+形态裁切
function battleArt(f) {
  if (f.side === 'boss') return `<div class="pet-art"><img class="pos-single" src="img/boss.png" alt=""></div>`;
  return petArt(f.emoji, f.stageKey, '', true);
}

// —— 重大事件全屏演出（进化/觉醒/毕业/奖励 + 随机奇遇）——
function showFx(opt) {
  closeFx();
  const d = document.createElement('div');
  d.id = 'fx';
  d.innerHTML = `<div class="fx-card">
    ${opt.img ? `<img class="fx-img" src="${opt.img}" alt="">` : ''}
    <div class="fx-title">${esc(opt.title || '')}</div>
    ${opt.sub ? `<div class="fx-sub">${opt.sub}</div>` : ''}
    <button class="btn fx-btn" onclick="closeFx()">${esc(opt.btn || '太棒了！')}</button>
  </div>`;
  d.addEventListener('click', e => { if (e.target.id === 'fx') closeFx(); });
  document.body.appendChild(d);
  if (opt.sound && Sfx[opt.sound]) Sfx[opt.sound]();
  if (opt.speak) Sfx.speak(opt.speak);
  if (opt.auto) setTimeout(() => closeFx(), opt.auto);
}
function closeFx() { const d = document.getElementById('fx'); if (d) d.remove(); }
function lvlBurst(text) {
  const d = document.createElement('div');
  d.className = 'lvl-burst'; d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1800);
}
function toggleMute() {
  const m = Sfx.toggle();
  document.querySelectorAll('.mute-btn').forEach(b => { b.textContent = m ? '🔇' : '🔊'; });
}

// —— 随机彩蛋：流星 / 每日星运 / 灵汐风闻 ——
setInterval(() => {
  if (document.hidden || Math.random() > 0.4) return;
  const s = document.createElement('div');
  s.className = 'shooting-star';
  s.style.top = (4 + Math.random() * 18) + 'vh';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1700);
}, 22000);
const FORTUNES = ['今日心光充盈，适合大干一场！', '星象说：认真投喂的立愿者运气不会差', '月神今天心情很好，也许会有奇遇……', '今日宜申报：考试的好消息会被星辰听见', '流星今日频繁，留意屏幕上划过的光芒', '大陆风闻：有立愿者连续打卡七天，月神赏了心光', '今日忌懒散：宠物会偷偷模仿你的样子', '星海潮汐平稳，适合挑战一下 Boss', '愿望球微微发烫，它在期待今晚的投喂', '你的灵伴在星海图鉴里偷偷练习招式'];
const WHISPERS = ['灵伴说：今天的作业香味它闻到了', '月神在月牙上打盹，可没看见你摸鱼哦', '灵汐大陆今日晴，适合努力', '听说连续投喂 7 天，月神会发额外心光', '毕业的宠物正在星海里为你加油', '浊气最怕的，就是按时完成作业的你', '灵伴其实听得懂你念的书哦', '愿望球今晚发光了，是个好兆头', '有人在对战大厅议论你的对战码', '星星今天眨得很勤，好事将近'];
function pickDaily(list, seed) {
  const d = new Date();
  const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ':' + (seed || '');
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

// —— 基础工具 ————————————————————————————————
let loadingCount = 0;
function setLoading(on) {
  const el = $('#loading');
  if (!el) return;
  loadingCount += on ? 1 : -1;
  el.classList.toggle('hidden', loadingCount <= 0);
}
async function api(path, body) {
  setLoading(true);
  try {
    // token 同时放头和请求体：部分反向代理会剥离 Authorization 头
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ ...(body || {}), token }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401 && !['/api/login', '/api/register', '/api/bind'].includes(path)) doLogout();
    return d;
  } catch (e) { return { error: '网络异常，请重试' }; }
  finally { setLoading(false); }
}
async function getJSON(path) {
  try { const r = await fetch(path); return await r.json(); } catch (e) { return { error: '网络异常' }; }
}
let toastTimer = null;
function toast(msg, isErr, long) {
  const t = $('#toast'); t.textContent = msg;
  t.className = isErr ? 'err' : ''; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), long ? 4200 : 2600);
}
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal') && $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function doLogout() {
  token = ''; role = ''; me = null; fam = null; curBattle = null; pinCache = '';
  if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
  localStorage.removeItem('hp_token'); localStorage.removeItem('hp_role');
  renderAuth();
}
function fmt(ts) { return new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// 拍照/选图 → 压缩 base64（3Mbps 带宽友好）
function pickPhoto() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return resolve(null);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    };
    inp.click();
  });
}

// —— 五维雷达图 ————————————————————————————————
function radarSVG(stats) {
  const keys = [['atk', '攻'], ['wis', '慧'], ['spd', '敏'], ['def', '防'], ['hp', '体']];
  const max = 45, cx = 90, cy = 88, R = 66;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; const r = R * Math.min(1, v / max); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  let grid = '';
  for (const f of [0.33, 0.66, 1]) { let pts = ''; for (let i = 0; i < 5; i++) { const [x, y] = pt(i, max * f); pts += x + ',' + y + ' '; } grid += `<polygon points="${pts}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`; }
  let axis = '', labels = '';
  keys.forEach(([k, name], i) => {
    const [x, y] = pt(i, max); axis += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e5e7eb"/>`;
    const [lx, ly] = pt(i, max * 1.22);
    labels += `<text x="${lx}" y="${ly}" font-size="11" fill="#6b7280" text-anchor="middle" dominant-baseline="central">${name} ${stats[k]}</text>`;
  });
  let val = ''; keys.forEach(([k], i) => { const [x, y] = pt(i, stats[k]); val += x + ',' + y + ' '; });
  return `<svg width="180" height="176" viewBox="0 0 180 176">${grid}${axis}<polygon points="${val}" fill="rgba(91,108,255,.35)" stroke="#5b6cff" stroke-width="2"/>${labels}</svg>`;
}

// 敏感操作 PIN 二次确认：结算 / 改规则 / 撤销账本 / 删投诉。
// 前端缓存 5 分钟免重复输入；服务端每次独立校验，安全不降级。
// 用 App 内弹窗而非 prompt()——手机部分浏览器/内置网页禁用 prompt，会"点了没反应"。
function withPin() {
  if (pinCache && Date.now() - pinCacheAt < 5 * 60 * 1000) return Promise.resolve(pinCache);
  return new Promise(resolve => {
    window._pinResolve = resolve;
    openModal(`<h3>🔐 家长 PIN 确认</h3>
      <div class="lead">此操作较敏感，请输入家长 PIN</div>
      <input id="pin_v" type="password" inputmode="numeric" placeholder="家长 PIN" onkeydown="if(event.key==='Enter')pinOk()">
      <div class="row"><button class="btn" style="margin-top:0" onclick="pinOk()">确认</button><button class="btn ghost" style="margin-top:0" onclick="pinCancel()">取消</button></div>`);
    setTimeout(() => { const el = $('#pin_v'); el && el.focus(); }, 60);
  });
}
function pinOk() {
  const v = $('#pin_v').value;
  if (!v) return toast('要填 PIN', true);
  pinCache = v; pinCacheAt = Date.now();
  closeModal();
  const f = window._pinResolve; window._pinResolve = null; f && f(v);
}
function pinCancel() {
  closeModal();
  const f = window._pinResolve; window._pinResolve = null; f && f(null);
}
// 通用确认/输入弹窗（替代 confirm/prompt，同理）
function askConfirm(msg, onOk, title) {
  window._askOk = onOk;
  openModal(`<h3>${esc(title || '⚠️ 确认操作')}</h3><div class="warnbox">${esc(msg)}</div>
    <div class="row"><button class="btn" style="margin-top:0" onclick="askOk()">确定</button><button class="btn ghost" style="margin-top:0" onclick="closeModal()">取消</button></div>`);
}
function askOk() { const f = window._askOk; window._askOk = null; closeModal(); f && f(); }
function askText(title, placeholder, onOk, opt) {
  opt = opt || {};
  window._askOk = onOk;
  openModal(`<h3>${esc(title)}</h3>
    ${opt.tip ? `<div class="lead">${esc(opt.tip)}</div>` : ''}
    <input id="ask_v" value="${opt.value != null ? esc(opt.value) : ''}" placeholder="${esc(placeholder || '')}" maxlength="${opt.max || 100}" onkeydown="if(event.key==='Enter')askTextOk()">
    <div class="row"><button class="btn" style="margin-top:0" onclick="askTextOk()">确定</button><button class="btn ghost" style="margin-top:0" onclick="closeModal()">取消</button></div>`);
  setTimeout(() => { const el = $('#ask_v'); el && el.focus(); }, 60);
}
function askTextOk() {
  const v = $('#ask_v').value;
  const f = window._askOk; window._askOk = null;
  closeModal(); f && f(v);
}
async function pinApi(path, body) {
  const pin = await withPin();
  if (pin === null) return null;
  const r = await api(path, { ...(body || {}), pin });
  if (r.error && /PIN/.test(r.error)) { pinCache = ''; pinCacheAt = 0; }
  return r;
}

// —— 启动 ————————————————————————————————————
async function boot() {
  if (!token) return renderAuth();
  if (role === 'child') {
    const r = await api('/api/me');
    if (r.id) { me = r; renderChild(); } else renderAuth();
  } else if (role === 'parent') {
    const r = await api('/api/family');
    if (r.id) { fam = r; renderParent(); } else renderAuth();
  } else renderAuth();
}

// ============================================================
// 认证视图
// ============================================================
let authTab = 'login', authIdentity = 'parent';
function renderAuth() {
  $('#app').innerHTML = `
    <div class="topbar"><div class="title">🐾 养成好习惯</div><div class="who">宠物大冒险</div></div>
    <div class="tabs">
      <div class="tab ${authTab === 'login' ? 'on' : ''}" onclick="authTab='login';renderAuth()">登录</div>
      <div class="tab ${authTab === 'reg' ? 'on' : ''}" onclick="authTab='reg';renderAuth()">注册家庭</div>
    </div>
    ${authTab === 'login' ? `
      <div class="tabs">
        <div class="tab ${authIdentity === 'parent' ? 'on' : ''}" onclick="authIdentity='parent';renderAuth()">👨‍👩‍👧 我是家长</div>
        <div class="tab ${authIdentity === 'child' ? 'on' : ''}" onclick="authIdentity='child';renderAuth()">🧒 我是孩子</div>
      </div>
      ${authIdentity === 'parent' ? `
      <div class="card">
        <label>账号名</label><input id="lg_u" placeholder="家长账号">
        <label>密码</label><input id="lg_p" type="password" placeholder="密码">
        <button class="btn" onclick="doLogin()">登录</button>
        <div class="muted-line" style="text-align:center"><a href="#" onclick="forgotFlow();return false">忘记密码或 PIN？</a></div>
      </div>` : `
      <div class="card">
        <div class="okbox">在孩子手机上输入家长给的 8 位绑定码即可绑定（30 分钟内有效，绑定后本机长期免登录）</div>
        <label>绑定码</label><input id="bd_c" inputmode="numeric" maxlength="8" placeholder="8 位数字">
        <button class="btn" onclick="doBind()">绑定</button>
      </div>`}` : `
      <div class="card">
        <label>账号名（3-32位字母/数字/下划线）</label><input id="rg_u" placeholder="字母/数字/下划线，3-32 位">
        <label>密码（至少6位）</label><input id="rg_p" type="password">
        <label>家庭名称</label><input id="rg_n" placeholder="例如 幸福之家">
        <label>密保问题（忘记密码/PIN 时用于找回）</label><input id="rg_sq" placeholder="例如 我的小学叫什么">
        <label>密保答案</label><input id="rg_sa" placeholder="答案（不分大小写）">
        <button class="btn" onclick="doRegister()">创建家庭</button>
        <div class="muted-line">注册后你就是本家庭的家长管理员；密保问题务必填写，忘了密码只能靠它找回</div>
      </div>`}
  `;
}
// 找回流程：App 内弹窗分步进行（不用 prompt/confirm，手机部分浏览器会禁用它们导致"点了没反应"）
async function forgotFlow() {
  openModal(`<h3>🔑 找回密码或 PIN</h3>
    <div class="lead">第一步：输入你的家长账号名</div>
    <input id="fg_u" placeholder="家长账号">
    <button class="btn" onclick="forgotStep2()">下一步</button>`);
}
async function forgotStep2() {
  const u = $('#fg_u').value.trim();
  if (!u) return toast('先填账号名', true);
  const r = await api('/api/forgot/question', { username: u });
  if (r.error) return toast(r.error, true);
  forgotUser = u;
  openModal(`<h3>🔑 找回密码或 PIN</h3>
    <div class="okbox">密保问题：${esc(r.question)}</div>
    <label>密保答案</label><input id="fg_a" placeholder="答案（不分大小写）">
    <label>重置为</label>
    <div class="row" style="margin-top:0">
      <input id="fg_v" placeholder="新密码（≥6位）或新 PIN（4-8位数字）" style="margin-top:0">
    </div>
    <div class="row">
      <button class="btn" style="margin-top:0" onclick="forgotSubmit('password')">重置登录密码</button>
      <button class="btn ghost" style="margin-top:0" onclick="forgotSubmit('pin')">重置 PIN</button>
    </div>`);
}
let forgotUser = '';
async function forgotSubmit(mode) {
  const a = $('#fg_a').value.trim(), v = $('#fg_v').value;
  if (!a || !v) return toast('答案和新密码/PIN 都要填', true);
  const rr = await api('/api/forgot/reset', { username: forgotUser, answer: a, mode, value: v });
  if (rr.error) return toast(rr.error, true);
  closeModal();
  toast('重置成功，去登录吧');
}
async function doLogin() {
  const r = await api('/api/login', { username: $('#lg_u').value, password: $('#lg_p').value });
  if (r.error) return toast(r.error, true);
  token = r.token; role = 'parent'; fam = r.family;
  localStorage.setItem('hp_token', token); localStorage.setItem('hp_role', role);
  renderParent();
}
async function doRegister() {
  const r = await api('/api/register', { username: $('#rg_u').value, password: $('#rg_p').value, familyName: $('#rg_n').value, securityQ: $('#rg_sq').value, securityA: $('#rg_sa').value });
  if (r.error) return toast(r.error, true);
  token = r.token; role = 'parent'; fam = r.family;
  localStorage.setItem('hp_token', token); localStorage.setItem('hp_role', role);
  toast('家庭创建成功！先添加孩子吧');
  renderParent();
}
async function doBind() {
  const r = await api('/api/bind', { code: $('#bd_c').value });
  if (r.error) return toast(r.error, true);
  token = r.token; role = 'child';
  localStorage.setItem('hp_token', token); localStorage.setItem('hp_role', role);
  await refreshMe(); renderChild();
}

// ============================================================
// 孩子端
// ============================================================
async function refreshMe() { const r = await api('/api/me'); if (r.id) { celebratePet(me?.pet, r.pet); me = r; } }
// v5: 升级/进化/觉醒/毕业 全事件演出（插画+音乐+台词）
function celebratePet(oldPet, newPet) {
  if (!oldPet || !newPet) {
    if (oldPet && !newPet) showFx({
      img: 'img/graduate.png', title: '🎓 毕业巡礼',
      sub: `${esc(oldPet.nickname)} 化作流星回归星海。别难过——它的形态已刻进图鉴，永不磨灭。下学期，再结一段新的缘分吧！`,
      btn: '再见了，伙伴', sound: 'heal', speak: '毕业巡礼，灵伴回归星海'
    });
    return;
  }
  if (newPet.level <= oldPet.level) return;
  const stageChanged = oldPet.stageKey !== newPet.stageKey;
  if (stageChanged && newPet.stageKey === 'awaken') {
    showFx({ img: 'img/awaken.png', title: '✦ 觉醒时刻 ✦', sub: `${esc(newPet.nickname)} 突破凡躯，觉醒为 <b>${esc(newPet.stage)}</b>！亲密度获取 +3%，并解锁「学期大奖」申请权！`, btn: '吾王降临', sound: 'evolve', speak: `${newPet.nickname}，觉醒！` });
  } else if (stageChanged) {
    showFx({ img: 'img/evo.png', title: '⚡ 进化！', sub: `${esc(oldPet.stage)} → <b>${esc(newPet.stage)}</b>！星辰之力涌入了 ${esc(newPet.nickname)} 的身体`, btn: '华丽蜕变！', sound: 'evolve', speak: `哇，${newPet.nickname} 进化成 ${newPet.stage} 了！` });
  } else {
    lvlBurst(`⬆️ Lv${newPet.level}！`);
    Sfx.levelup();
  }
}

function renderChild() {
  if (!me.pet) return renderSpeciesPicker();
  const paused = me.paused;
  if (!localStorage.getItem('hp_guide_seen')) { localStorage.setItem('hp_guide_seen', '1'); openGuide(); }
  const fk = 'hp_fortune_' + new Date().toDateString();
  if (!localStorage.getItem(fk)) { localStorage.setItem(fk, '1'); setTimeout(() => toast('🔭 今日星运：' + pickDaily(FORTUNES, me.id), false, true), 900); }
  $('#app').innerHTML = `
    <div class="topbar">
      <div class="title">${esc(me.name)}${me.holidayMode ? ' 🏖️' : ''}</div>
      <div class="who">${paused ? '⏸️ 暂停计中' : '❤️ 亲密度 ' + me.intimacy} · 下月零花钱 ¥${me.nextAllowance}<br><span class="mute-btn" style="cursor:pointer" onclick="toggleMute()">${Sfx.muted ? '🔇' : '🔊'}</span> · ${installLink()}<a href="#" onclick="openGuide();return false">📖 玩法</a> · <a href="#" onclick="refreshMe().then(renderChild);return false">刷新</a> · <a href="#" style="color:#6b7280" onclick="doLogout();return false">退出</a></div>
    </div>
    ${paused ? `<div class="warnbox">暂停计期间：不重置、不计连击、不扣分，好好休息 💤</div>` : ''}
    ${me.fainted ? `<div class="warnbox">💀 你的宠物饿晕了！去「宠物」页复活它才能继续对战和领经验</div>` : ''}
    <div class="tabs">
      ${[['pet', '🐾 宠物'], ['report', '📝 申报'], ['battle', '⚔️ 对战'], ['shop', '🎁 兑换'], ['book', '📖 图鉴']].map(([k, n]) =>
        `<div class="tab ${curTab === k ? 'on' : ''}" onclick="switchChildTab('${k}')">${n}</div>`).join('')}
    </div>
    <div id="tabbody"></div>
  `;
  const b = $('#tabbody');
  if (curTab === 'pet') b.innerHTML = childPetTab();
  else if (curTab === 'report') b.innerHTML = childReportTab();
  else if (curTab === 'battle') renderChildBattleTab(b);
  else if (curTab === 'shop') b.innerHTML = childShopTab();
  else b.innerHTML = childBookTab();
}

// 切换孩子端 Tab：离开对战时清轮询，防定时器泄漏污染其他 Tab
function switchChildTab(k) {
  if (curTab === 'battle' && k !== 'battle') { stopPoll(); curBattle = null; }
  curTab = k; renderChild();
}

// —— 新手说明（首次进入自动弹，之后点「📖 玩法」回看）——
function openGuide() {
  const r = me ? me.rules : {};
  openModal(`<h3>📖 玩法说明</h3>
    <div class="lead">你的宠物靠「经验值」长大（升级→进化→觉醒），家里的「亲密度」是零花钱货币（1分=1元）。两个值都只来自真实的好习惯！</div>
    <div class="item"><div class="t"><div class="n">🐾 宠物页</div><div class="s">每天 ${r.feed !== undefined ? r.feed : 1} 分投喂（作业完成才算喂饭）、看五维属性、自由加点、改名字</div></div></div>
    <div class="item"><div class="t"><div class="n">📝 申报页</div><div class="s">考试≥${me.rules.examMin ?? 80} +${r.exam !== undefined ? r.exam : 50} · 默写/出门测≥${me.rules.quizMin ?? 80}% +${r.quiz !== undefined ? r.quiz : 10} · 自豪的事每周1次 +${r.pride !== undefined ? r.pride : 10}（家长审核后到账）</div></div></div>
    <div class="item"><div class="t"><div class="n">⚔️ 对战页</div><div class="s">打 Boss / 兄妹切磋 / 好友对战，赢经验不花亲密度（每天限 ${me ? me.battleDailyLimit : 5} 场）；输了对战也不扣亲密度</div></div></div>
    <div class="item"><div class="t"><div class="n">🎁 兑换页</div><div class="s">用亲密度换奖励；现金直接锁进下月零花钱，其他奖励家长核销后生效</div></div></div>
    <div class="item"><div class="t"><div class="n">📖 图鉴页</div><div class="s">兄弟姐妹榜 + 历届毕业宠物</div></div></div>
    <div class="warnbox">⚠️ 每月 1 号亲密度重置为初始值（上月没被投诉再加无投诉奖 +${r.noComplaint !== undefined ? r.noComplaint : 100}）；被投诉 −${r.complaint !== undefined ? r.complaint : 50}（家长可取消退分）。宠物 3 天不投喂会饿肚子 −10 亲密度，5 天会饿晕，要花亲密度或降级复活！</div>
    <div class="muted-line">学期结束时宠物毕业进图鉴，下学期重挑新伙伴。连续觉醒还能解锁隐藏神宠 S/SS！</div>
    <button class="btn" onclick="closeModal()">开始冒险！</button>`);
}

// —— 选宠物（学期初）————————————————————————
async function renderSpeciesPicker() {
  const r = await getJSON('/api/species');
  const el = me.eligibility || { s: false, ss: false };
  const normal = r.species.filter(s => !s.hidden);
  const hidden = r.species.filter(s => s.hidden);
  $('#app').innerHTML = `
    <div class="topbar"><div class="title">挑选你的伙伴！</div><div class="who"><a href="#" onclick="doLogout();return false">退出</a></div></div>
    <div class="card">
      <div class="pet-art idle" style="width:92px;height:92px;margin-bottom:8px"><img class="pos-single" src="img/wishball.png" alt=""></div>
      <div class="lead">伙伴从「愿望球」里诞生，完成好习惯它会一路进化——学期结束毕业进图鉴，下学期再挑新的～</div>
      <div class="species-grid mt8">
        ${normal.map(s => `
          <div class="species" onclick="pickSpecies('${s.id}')">
            ${petArtById(s.id, null, 'tri')}
            <div class="nm">${esc(s.name)}</div>
            <div class="el">${s.elementName}系 · ${s.evo.join('→')}</div>
          </div>`).join('')}
      </div>
      <h3 class="mt8">🔒 隐藏神宠（解锁后可选）</h3>
      <div class="muted-line">S 级：任一学期觉醒（Lv20）解锁；SS 级：连续两个学期觉醒解锁。亲密度获取 +5%！</div>
      <div class="species-grid mt8">
        ${hidden.map(s => {
          const ok = s.tier === 'S' ? el.s : el.ss;
          return `
          <div class="species ${ok ? '' : 'locked'}" ${ok ? `onclick="pickSpecies('${s.id}')"` : ''}>
            ${petArtById(s.id, null, 'tri')}${ok ? '' : '<div class="lockmask">🔒</div>'}
            <div class="nm">${esc(s.name)} <span class="badge ${ok ? 'g' : ''}">${s.tier}</span></div>
            <div class="el">${ok ? s.elementName + '系 · ' + s.evo.join('→') : s.tier === 'S' ? '需任一学期觉醒' : '需连续两学期觉醒'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
async function pickSpecies(id) {
  const r = await api('/api/pet/select', { speciesId: id });
  if (r.error) return toast(r.error, true);
  me = r.state; curTab = 'pet';
  Sfx.evolve(); Sfx.speak('愿望球打开了，新伙伴加入！');
  renderChild();
  showFx({ img: 'img/wishball.png', title: '✦ 愿望球开启 ✦', sub: `<b>${esc(me.pet.nickname)}</b> 加入了你的冒险！完成作业投喂它，它会一路进化`, btn: '一起加油！', sound: 'levelup', speak: '愿望球打开了，新伙伴加入！' });
}

// —— 宠物 Tab ————————————————————————————————
function childPetTab() {
  const p = me.pet;
  const xpPct = Math.min(100, Math.round((p.xp - p.xpCur) / Math.max(1, p.xpNext - p.xpCur) * 100));
  const fed = me.fedToday;
  const isNew = me.feedStreak === 0 && me.pokedex.length === 0 && me.intimacy === me.rules.initialIntimacy;
  const welcome = isNew ? `
    <div class="okbox">
      <b>欢迎来到宠物大冒险！</b><br>
      每天按时完成作业可以投喂一次，考试、默写考好了可以申报加分，宠物会升级进化。月底用亲密度换零花钱或奖励 💪
    </div>` : '';
  let milestoneHtml = '';
  if (p.stageKey === 'awaken' && !me.milestone.used) {
    const hasPending = me.milestone.applications.some(a => a.status === 'pending');
    milestoneHtml = `<div class="okbox">🏆 宠物已觉醒！你获得一次「学期大奖申请权」${hasPending ? '（申请审核中…）' : ''}</div>
      ${hasPending ? '' : `<button class="btn warn" onclick="applyMilestone()">申请学期大奖</button>`}`;
  }
  // 饿死机制：昏迷复活 / 饿肚子预警
  let hungerHtml = '';
  if (me.fainted) {
    hungerHtml = `
    <div class="card" style="border-color:var(--bad)">
      <h3>💀 ${esc(p.nickname)} 饿晕了！</h3>
      <div class="warnbox">5 天没投喂，宠物昏迷中：不能对战、不能领经验。选一种方式复活：</div>
      <div class="row mt8">
        <button class="btn warn" onclick="doRevive('level')">⬇️ 降 5 级复活</button>
        <button class="btn ${me.intimacy < 50 ? '' : 'ok'}" ${me.intimacy < 50 ? 'disabled' : ''} onclick="doRevive('intimacy')">❤️ 扣 50 亲密度复活${me.intimacy < 50 ? '（亲密度不足）' : ''}</button>
      </div>
    </div>`;
  } else if (me.hungerDays >= 3) {
    hungerHtml = `<div class="warnbox">🍖 宠物已经 ${me.hungerDays} 天没吃饭，饿晕倒计时中！今天 ${me.fedToday ? '已投喂 ✓' : '快去投喂！'}</div>`;
  } else if (me.hungerDays === 2) {
    hungerHtml = `<div class="muted-line">⏰ 提醒：明天再不投喂，宠物就要饿肚子扣分啦</div>`;
  }
  return `${welcome}
    <div class="card pet-hero">
      ${me.fainted ? petArt(p.emoji, p.stageKey, 'fainted', false) : petArt(p.emoji, p.stageKey, '', true)}
      <div class="name">${esc(p.nickname)} <span class="stage">Lv${p.level} · ${p.stage}</span></div>
      <div class="lead">${p.speciesName} · ${p.elementName}系 · 学期：${esc(me.semester.name)}${p.tier ? ' · ' + p.tier + '级神宠（亲密度+5%）' : (p.stageKey === 'awaken' ? ' · 觉醒加成：亲密度+3%' : '')}</div>
      <div class="xpbar"><i style="width:${xpPct}%"></i></div>
      <div class="muted-line">经验 ${p.xp} / 下一级 ${p.xpNext}</div>
      <div class="whisper">🌙 ${pickDaily(WHISPERS, me.id)}</div>
      <button class="btn" ${fed || me.paused || me.fainted ? 'disabled' : ''} onclick="doFeed()">${me.fainted ? '💀 昏迷中，先复活' : fed ? '今天已投喂 🍖' : '🍖 完成作业，投喂 +' + me.rules.feed}</button>
      <div class="muted-line">连续打卡 ${me.feedStreak} 天（每满 7 天额外 +${me.rules.streak}）${me.weeklyCap > 0 ? ` · 本周已加 ${me.weekEarned}/${me.weeklyCap}` : ''}</div>
    </div>
    ${hungerHtml}
    ${milestoneHtml}
    <div class="card">
      <h3>📊 五维能力</h3>
      <div class="radar">${radarSVG(p.stats)}</div>
      ${p.freePoints > 0 ? `
        <div class="okbox">有 ${p.freePoints} 点自由加点！</div>
        <div class="row">
          <select id="al_stat" style="margin-top:0">
            <option value="atk">攻</option><option value="def">防</option><option value="hp">体</option><option value="spd">敏</option><option value="wis">慧</option>
          </select>
          <input id="al_pts" type="number" min="1" max="${p.freePoints}" value="1" style="margin-top:0">
          <button class="btn sm" onclick="doAllocate()">加点</button>
        </div>` : '<div class="muted-line">升级获得自由加点，可以把伙伴培养成你的风格</div>'}
    </div>
    <div class="card skills">
      <h3>✨ 技能</h3>
      ${p.skills.map(s => `
        <div class="item ${s.unlocked ? 'unlocked' : ''}">
          <div class="t"><div class="n">${esc(s.name)}<small>威力 ${s.power}</small></div></div>
          ${s.unlocked ? '<span class="badge g">已掌握</span>' : `<span class="badge">Lv${s.unlockLv} 解锁</span>`}
        </div>`).join('')}
      <button class="btn ghost" onclick="renamePet()">✏️ 给伙伴改名</button>
    </div>`;
}
async function doFeed() {
  Sfx.tap();
  const oldPet = me.pet;
  const r = await api('/api/feed', {});
  if (r.error) return toast(r.error, true);
  me = r.state;
  Sfx.feed();
  if (r.feedEvent) {
    // 随机灵汐奇遇：专属插画 + 金币音 + 台词
    const ev = r.feedEvent;
    const gain = [ev.xp ? '+' + ev.xp + ' 经验' : '', ev.intimacy ? '+' + ev.intimacy + ' 亲密度' : ''].filter(Boolean).join('，');
    showFx({ img: 'img/reward.png', title: `${ev.icon} 灵汐奇遇 · ${ev.name}`, sub: `${esc(ev.desc)}${gain ? '（' + gain + '）' : ''}`, btn: '运气爆棚！', auto: 4500, sound: 'coin', speak: '灵汐奇遇，' + ev.name + '！' });
  } else {
    toast(r.streakBonus ? `投喂成功 +${me.rules.feed}，连续 ${me.feedStreak} 天额外 +${r.streakBonus}！` : `投喂成功！亲密度 +${me.rules.feed}`);
  }
  celebratePet(oldPet, me.pet);
  renderChild();
}
async function doAllocate() {
  const r = await api('/api/pet/allocate', { stat: $('#al_stat').value, points: +$('#al_pts').value });
  if (r.error) return toast(r.error, true);
  me = r.state; renderChild();
}
function renamePet() {
  openModal(`<h3>给伙伴改名</h3>
    <input id="pn" maxlength="10" placeholder="${esc(me.pet.nickname)}">
    <button class="btn" onclick="doRename()">保存</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function doRename() {
  const r = await api('/api/pet/nickname', { nickname: $('#pn').value });
  if (r.error) return toast(r.error, true);
  me = r.state; closeModal(); renderChild();
}
async function doRevive(mode) {
  const ask = mode === 'level' ? '确认降 5 级复活？（经验/等级回退，五维成长点不回收）' : '确认消耗 50 亲密度复活？';
  askConfirm(ask, async () => {
    const r = await api('/api/pet/revive', { mode });
    if (r.error) return toast(r.error, true);
    me = r.state; toast('宠物复活啦！记得每天投喂 🍖'); renderChild();
  }, '✨ 复活确认');
}
function applyMilestone() {
  openModal(`<h3>申请学期大奖</h3>
    <div class="lead">说说你想要什么、以及这学期你有多努力～家长审核通过才算数</div>
    <textarea id="ms_note" rows="3" placeholder="例如：这学期我每天都按时完成作业，想要一次漂流"></textarea>
    <button class="btn warn" onclick="doApplyMilestone()">提交申请</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function doApplyMilestone() {
  const r = await api('/api/milestone/apply', { note: $('#ms_note').value });
  if (r.error) return toast(r.error, true);
  me = r.state; closeModal(); toast('申请已提交，等家长审核'); renderChild();
}

// —— 申报 Tab ————————————————————————————————
function childReportTab() {
  const prideType = me.holidayMode ? 'holiday' : 'pride';
  const prideLabel = me.holidayMode ? '假期课外成就' : '自豪的事';
  const prideUsed = me.prideUsedThisWeek;
  return `
    <div class="card">
      <h3>📝 我要申报</h3>
      <div class="item"><div class="t"><div class="n">考试 ≥${me.rules.examMin ?? 80} 分</div><div class="s">仅正式考试（单元测及以上），小测走默写</div></div><button class="btn sm" onclick="openSubmit('exam')">+${me.rules.exam}</button></div>
      <div class="item"><div class="t"><div class="n">默写/出门测 ≥${me.rules.quizMin ?? 80}%</div><div class="s">拍张默写本照片更好过审</div></div><button class="btn sm" onclick="openSubmit('quiz')">+${me.rules.quiz}</button></div>
      <div class="item"><div class="t"><div class="n">${prideLabel}</div><div class="s">每周限 1 次${prideUsed ? '（本周已用）' : ''}</div></div><button class="btn sm" ${prideUsed ? 'disabled' : ''} onclick="openSubmit('${prideType}')">+${me.rules.pride}</button></div>
    </div>
    <div class="card">
      <h3>⏳ 我的申报记录</h3>
      ${me.pending.length ? me.pending.slice(0, 15).map(e => `
        <div class="item">
          <div class="t"><div class="n">${esc(e.label)}${e.note ? '：' + esc(e.note) : ''}</div><div class="s">${fmt(e.ts)}${e.reason ? ' · 驳回：' + esc(e.reason) : ''}</div></div>
          ${e.status === 'pending' ? '<span class="badge a">待审核</span>' : e.status === 'approved' ? '<span class="badge g">已通过</span>' : '<span class="badge r">被驳回</span>'}
        </div>`).join('') : '<div class="muted-line">还没有申报记录</div>'}
    </div>`;
}
let submitEvidence = null;
function openSubmit(type) {
  const map = {
    exam: [`考试 ≥${me.rules.examMin ?? 80} 分`, '哪一科、多少分'],
    quiz: [`默写/出门测 ≥${me.rules.quizMin ?? 80}%`, '内容与成绩'],
    pride: ['自豪的事', '例如：自己整理书包还帮妈妈洗碗'],
    holiday: ['假期课外成就', '例如：学会游泳 / 读完一本书']
  };
  const [t, ph] = map[type];
  submitEvidence = null;
  openModal(`<h3>${t}</h3>
    <div class="lead">填一句说明${type === 'pride' || type === 'holiday' ? '' : '，最好拍照留证（家长要审核）'}</div>
    <textarea id="subNote" rows="3" placeholder="${ph}"></textarea>
    <button class="btn ghost" id="photoBtn" onclick="addPhoto()">📷 ${type === 'pride' || type === 'holiday' ? '拍照（可选）' : '拍照佐证（推荐）'}</button>
    <button class="btn" onclick="sendSubmit('${type}')">提交审核</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function addPhoto() {
  const b64 = await pickPhoto();
  if (b64) { submitEvidence = b64; $('#photoBtn').textContent = '✅ 已附加照片'; }
}
async function sendSubmit(type) {
  const r = await api('/api/submit', { type, note: $('#subNote').value, evidence: submitEvidence });
  if (r.error) return toast(r.error, true);
  me = r.state; closeModal(); toast('已提交，等家长通过～'); renderChild();
}

// —— 对战 Tab ————————————————————————————————
function renderChildBattleTab(b) {
  if (curBattle) return renderArena();
  const others = me.siblings.filter(s => s.id !== me.id);
  b.innerHTML = `
    <div class="card">
      <h3>⚔️ 对战大厅</h3>
      <div class="lead">对战经验随对手等级浮动：赢 = +6+对方等级，输 = +2+对方等级÷2（每天最多 ${me.battleDailyLimit} 场，今天已打 ${me.battlesToday} 场）。经验只升宠物，绝不花亲密度！</div>
      <div class="item"><div class="t"><div class="n">🌲 挑战荒野 Boss</div><div class="s">单人闯关，Boss 等级随你</div></div><button class="btn sm" onclick="startBattle('boss')">出发</button></div>
      ${others.map(o => `
        <div class="item"><div class="t"><div class="n">🤝 与 ${esc(o.name)} 联手打 Boss</div><div class="s">TA 的分身 AI 帮你打，不用等 TA 在线</div></div><button class="btn sm ok" onclick="startBattle('coop','${o.id}')">组队</button></div>
        <div class="item"><div class="t"><div class="n">⚔️ 与 ${esc(o.name)} 切磋</div><div class="s">打 TA 宠物的 AI 分身（他 ${o.petEmoji} Lv${o.level}），单挑即打即结算</div></div><button class="btn sm bad" onclick="startBattle('sibling','${o.id}')">开打</button></div>`).join('') || '<div class="muted-line">还没有兄弟姐妹可以约战（等家长添加）</div>'}
    </div>
    <div class="card">
      <h3>👥 好友对战</h3>
      <div class="okbox">我的对战码：<b style="font-size:22px;letter-spacing:4px">${me.friendCode}</b>（发给同学，TA 输入这个码就能加你好友/约战）</div>
      <div class="row mt8"><input id="fr_code" inputmode="numeric" maxlength="6" placeholder="输入对方 6 位对战码" style="margin-top:0"><button class="btn sm" onclick="doAddFriend()">加好友</button></div>
      ${(me.invites || []).length ? `
        <h3 class="mt8">📬 收到的对战邀请</h3>
        ${me.invites.map(inv => `
          <div class="item">
            <div class="t"><div class="n">${inv.from.emoji} ${esc(inv.from.name)} Lv${inv.from.level}（${esc(inv.from.speciesName)}）</div><div class="s">向你发起对战</div></div>
            <button class="btn sm ok" onclick="acceptInvite('${inv.id}')">应战</button>
            <button class="btn sm ghost" onclick="declineInvite('${inv.id}')">拒绝</button>
          </div>`).join('')}` : ''}
      <h3 class="mt8">🎮 我的好友（${(me.friends || []).length}/20）</h3>
      ${(me.friends || []).length ? me.friends.map(fr => `
        <div class="item">
          <div class="t"><div class="n">${fr.emoji} ${esc(fr.name)} Lv${fr.level} ${fr.online ? '<span class="badge g">在线</span>' : ''}</div><div class="s">最近活跃：${fr.lastSeenAt ? fmt(fr.lastSeenAt) : '未知'}</div></div>
          <button class="btn sm bad" ${fr.online ? '' : 'disabled'} onclick="inviteFriend('${fr.friendCode}','${esc(fr.name)}')">邀请对战</button>
          <button class="btn sm ghost" onclick="delFriend('${fr.familyId}','${fr.childId}')">删除</button>
        </div>`).join('') : '<div class="muted-line">还没有好友，输入同学的对战码加一个吧</div>'}
      <div class="muted-line">好友对战是真人对决：轮流出招，对方要在线应战。家长可在家长端查看好友列表。</div>
    </div>`;
}
async function doAddFriend() {
  const code = $('#fr_code').value.trim();
  if (!code) return toast('先输入对战码', true);
  const r = await api('/api/friend/add', { code });
  if (r.error) return toast(r.error, true);
  me = r.state; toast('加好友成功！'); renderChild();
}
async function delFriend(familyId, childId) {
  askConfirm('删除该好友？删除后需要重新互加好友码', async () => {
    const r = await api('/api/friend/del', { familyId, childId });
    if (r.error) return toast(r.error, true);
    me = r.state; renderChild();
  }, '👋 删除好友');
}
async function inviteFriend(code, name) {
  const r = await api('/api/battle/invite', { code });
  if (r.error) return toast(r.error, true);
  toast(`已向 ${name} 发起对战邀请，等 TA 应战（10 分钟内有效）`);
}
async function acceptInvite(inviteId) {
  const r = await api('/api/battle/invite/accept', { inviteId });
  if (r.error) return toast(r.error, true);
  me = r.state; curBattle = r.battle; renderArena(); startPoll();
}
async function declineInvite(inviteId) {
  const r = await api('/api/battle/invite/decline', { inviteId });
  if (r.error) return toast(r.error, true);
  me = r.state; renderChild();
}
async function startBattle(mode, opponentId) {
  const r = await api('/api/battle/start', { mode, opponentId });
  if (r.error) return toast(r.error, true);
  curBattle = r.battle; renderArena(); startPoll();
}
function startPoll() {
  if (battleTimer) clearInterval(battleTimer);
  battleTimer = setInterval(async () => {
    if (!curBattle) return stopPoll();
    const r = await api('/api/battle/state', { battleId: curBattle.id });
    if (r.battle) {
      const wasActive = curBattle.status === 'active';
      curBattle = r.battle;
      if (curBattle.status === 'finished' && wasActive) { stopPoll(); battleEndJingle(curBattle); await refreshMe(); toast('战斗结束！经验已到账'); }
      // 状态签名没变就不重画，避免每 2 秒闪一次"假刷新"
      if (arenaSigOf(curBattle) !== arenaSig) renderArena();
    } else if (r.error && /不存在/.test(r.error)) {
      // 战斗已失效（过期清理/重启丢失）：回大厅而不是卡死/白屏
      curBattle = null; stopPoll();
      toast('战斗已失效，回到对战大厅', true);
      renderChild();
    }
  }, 2000);
}
function stopPoll() { if (battleTimer) { clearInterval(battleTimer); battleTimer = null; } }
let prevHp = {};   // 上一帧各 fighter 的 HP，用于动画判定
let arenaSig = ''; // 当前渲染过的战场状态签名（防无效重绘）
function arenaSigOf(bt) {
  return JSON.stringify([bt.round, bt.status, bt.winner, bt.turn, bt.fighters.map(f => f.hp), (bt.log || [])[0] || '']);
}
function renderArena() {
  const bt = curBattle;
  arenaSig = arenaSigOf(bt);
  // 守卫：状态异常一律回大厅，绝不能白屏
  if (!bt || !Array.isArray(bt.fighters) || !bt.fighters.length) {
    curBattle = null; stopPoll();
    return renderChildBattleTab($('#tabbody'));
  }
  const meF = bt.fighters.find(f => f.childId === me.id && !f.isAI);
  if (!meF) { curBattle = null; stopPoll(); return renderChildBattleTab($('#tabbody')); }
  const myIdx = bt.fighters.indexOf(meF);
  const isFriend = bt.mode === 'friend';
  const myTurn = bt.status !== 'active' || (isFriend ? bt.turn === myIdx : true);
  const hpPct = f => Math.max(0, Math.round(f.hp / f.hpMax * 100));
  $('#tabbody').innerHTML = `
    <div class="card arena">
      <h3>${bt.mode === 'sibling' ? '⚔️ 兄妹对决（AI 分身）' : bt.mode === 'friend' ? '🔥 好友对决' : bt.mode === 'coop' ? '🤝 联手作战' : '🌲 Boss 挑战'} <span class="badge">第 ${bt.round} 回合</span></h3>
      ${bt.fighters.map((f, i) => `
        <div class="fighter ${i === myIdx ? 'me' : ''}" id="fig${i}">
          <div class="emoji">${battleArt(f)}</div>
          <div class="info">
            <div class="fname">${esc(f.name)} · Lv${f.level}${f.isAI ? '（AI分身）' : i === myIdx ? '（我）' : ''} ${bt.status === 'finished' && ((bt.mode === 'sibling' || bt.mode === 'friend') && bt.winner === i) || (bt.mode !== 'sibling' && bt.mode !== 'friend' && f.childId && bt.winner === 'kids') || (bt.mode !== 'sibling' && bt.mode !== 'friend' && !f.childId && bt.winner === 'boss') ? '👑' : ''}</div>
            <div class="hpbar"><i class="${hpPct(f) < 30 ? 'low' : ''}" style="width:${hpPct(f)}%"></i></div>
            <div class="muted-line">HP ${f.hp}/${f.hpMax} · 攻${f.stats.atk} 防${f.stats.def} 体${f.stats.hp} 敏${f.stats.spd} 慧${f.stats.wis}</div>
          </div>
        </div>${i < bt.fighters.length - 1 ? '<div class="vs">VS</div>' : ''}`).join('')}
      ${bt.status === 'active' ? (myTurn ? `
        <div class="mt8">${meF.skills.map((s, i) => `<button class="btn ${i === 0 ? '' : 'ghost'}" onclick="battleMove(${i})">${esc(s.name)} <small>${s.power}威力</small></button>`).join('')}</div>`
        : '<div class="warnbox mt8">等待对方出招…（页面会自动刷新）</div>') : `
        <div class="okbox mt8">战斗结束！${bt.mode === 'sibling' || bt.mode === 'friend' ? (bt.winner === myIdx ? '你赢了！经验已到账' : '虽败犹荣，也有经验拿') : (bt.winner === 'kids' ? '击败 Boss！' : 'Boss 太强了，下次再来')}</div>
        <button class="btn" onclick="curBattle=null;stopPoll();prevHp={};refreshMe().then(renderChild)">返回对战大厅</button>`}
      <div class="blog">${bt.log.map(l => `<p>${esc(l)}</p>`).join('') || '<p>战斗开始！</p>'}</div>
    </div>`;
  playBattleAnim(bt);
}
// 受击动画：血量下降的 fighter 抖动 + 飘伤害数字 + 音效（暴击金红大字/闪避飘字）
function playBattleAnim(bt) {
  const drops = [];
  bt.fighters.forEach((f, i) => {
    const old = prevHp[f.childId || ('ai' + i)];
    if (old !== undefined && f.hp < old) drops.push({ idx: i, dmg: old - f.hp });
  });
  const lastLog = (bt.log && bt.log[0]) || '';
  const isCrit = lastLog.includes('暴击');
  const isMiss = lastLog.includes('闪避');
  if (isMiss) Sfx.dodge();
  prevHp = {};
  bt.fighters.forEach((f, i) => { prevHp[f.childId || ('ai' + i)] = f.hp; });
  drops.forEach(({ idx, dmg }) => {
    const el = document.getElementById('fig' + idx);
    if (!el) return;
    el.classList.add('hit-shake');
    const num = document.createElement('div');
    num.className = 'dmg-float' + (isCrit ? ' crit' : '');
    num.textContent = (isCrit ? '暴击 -' : '-') + dmg;
    el.style.position = 'relative';
    el.appendChild(num);
    if (isCrit) Sfx.crit(); else Sfx.hit();
    setTimeout(() => { el.classList.remove('hit-shake'); num.remove(); }, 900);
  });
}
// 战斗结束号角（按我方胜负）
function battleEndJingle(bt) {
  const meF = (bt.fighters || []).find(f => f.childId === me.id && !f.isAI);
  if (!meF) return;
  const win = (bt.mode === 'sibling' || bt.mode === 'friend') ? bt.winner === bt.fighters.indexOf(meF) : bt.winner === 'kids';
  if (win) { Sfx.victory(); Sfx.speak('战斗胜利！经验到账！'); }
  else { Sfx.defeat(); Sfx.speak('虽败犹荣，下次再战'); }
}
async function battleMove(idx) {
  const r = await api('/api/battle/move', { battleId: curBattle.id, skillIndex: idx });
  if (r.error) {
    if (/不存在/.test(r.error)) { curBattle = null; stopPoll(); toast('战斗已失效，回到对战大厅', true); return renderChild(); }
    return toast(r.error, true);
  }
  if (r.battle) {
    const wasActive = curBattle.status === 'active';
    curBattle = r.battle;
    if (r.finished && wasActive) { stopPoll(); await refreshMe(); toast('战斗结束！经验已到账'); }
  }
  renderArena();
}

// —— 兑换 Tab ————————————————————————————————
function childShopTab() {
  return `
    <div class="card">
      <h3>🎁 奖励商店</h3>
      <div class="lead">亲密度 ${me.intimacy} 分可以兑换（现金会锁进下月零花钱）</div>
      ${me.rewards.map(r => `
        <div class="item">
          <div class="t"><div class="n">${esc(r.name)}</div><div class="s">${esc(r.desc || '')}</div></div>
          <button class="btn sm ${r.type === 'cash' ? 'warn' : 'ok'}" ${me.intimacy < r.cost ? 'disabled' : ''} onclick="doRedeem('${r.id}')">${r.cost}分</button>
        </div>`).join('')}
    </div>
    <div class="card">
      <h3>📋 我的兑换</h3>
      ${me.redemptions.length ? me.redemptions.map(r => {
        const st = r.status || (r.fulfilled ? 'fulfilled' : 'held');
        return `
        <div class="item">
          <div class="t"><div class="n">${esc(r.name)}</div><div class="s">${fmt(r.ts)}${r.type === 'cash' ? ' · 已锁进下月零花钱' : ''}</div></div>
          ${st === 'fulfilled' ? '<span class="badge g">' + (r.type === 'cash' ? '已锁定' : '已核销') + '</span>'
            : st === 'requested' ? '<span class="badge a">已申请核销，等家长确认</span>'
            : `<button class="btn sm ok" onclick="requestRedeem('${r.id}')">申请核销</button>`}
        </div>`;
      }).join('') : '<div class="muted-line">还没有兑换记录</div>'}
    </div>`;
}
async function requestRedeem(id) {
  const r = await api('/api/redeem/request', { redemptionId: id });
  if (r.error) return toast(r.error, true);
  me = r.state; toast('已申请核销，家长确认后就能用啦'); renderChild();
}
async function doRedeem(id) {
  const r = await api('/api/redeem', { rewardId: id });
  if (r.error) return toast(r.error, true);
  me = r.state; Sfx.coin(); toast('兑换成功！等家长发放～'); renderChild();
}

// —— 图鉴 Tab ————————————————————————————————
function childBookTab() {
  return `
    <div class="card">
      <h3>🏆 兄弟姐妹榜 <span class="badge">规则各自独立·娱乐为主</span></h3>
      ${me.siblings.slice().sort((a, b) => b.intimacy - a.intimacy).map((s, i) => `
        <div class="item"><div class="t"><div class="n">${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${s.petEmoji} ${esc(s.name)}</div></div><div class="s">亲密度 ${s.intimacy} · Lv${s.level}</div></div>`).join('')}
    </div>
    <div class="card">
      <h3>📖 我的图鉴（${me.pokedex.length}）</h3>
      ${me.pokedex.length ? me.pokedex.map(p => `
        <div class="item">
          ${petArt(p.emoji, null, 'xs')}
          <div class="t"><div class="n">${esc(p.speciesName)} <span class="badge g">Lv${p.level} 毕业</span></div><div class="s">${esc(p.semester)} · 攻${p.stats.atk} 防${p.stats.def} 体${p.stats.hp} 敏${p.stats.spd} 慧${p.stats.wis}</div></div>
        </div>`).join('') : '<div class="muted-line">第一只毕业宠物等你养成！学期结束它就会光荣毕业</div>'}
    </div>`;
}

// ============================================================
// 家长端
// ============================================================
let pTab = 'overview';
function renderParent() {
  if (!fam.pinChanged) return renderForcePin();   // v4: 首次登录强制修改 PIN
  $('#app').innerHTML = `
    <div class="topbar">
      <div class="title">👨‍👩‍👧‍👦 ${esc(fam.name)}</div>
      <div class="who">${esc(fam.username)} · ${fam.children.length} 个孩子<br>${installLink()}<a href="#" onclick="refreshFam().then(renderParent);return false">刷新</a> · <a href="#" style="color:#6b7280" onclick="doLogout();return false">退出</a></div>
    </div>
    <div class="tabs">
      ${[['overview', '总览'], ['inbox', '审核'], ['ops', '操作'], ['rewards', '奖励'], ['ledger', '账本'], ['settings', '设置']].map(([k, n]) =>
        `<div class="tab ${pTab === k ? 'on' : ''}" onclick="pTab='${k}';renderParent()">${n}${k === 'inbox' && totalPending() ? ` (${totalPending()})` : ''}</div>`).join('')}
    </div>
    <div id="ptab"></div>`;
  const b = $('#ptab');
  if (pTab === 'overview') b.innerHTML = parentOverview();
  else if (pTab === 'inbox') b.innerHTML = parentInbox();
  else if (pTab === 'ops') b.innerHTML = parentOps();
  else if (pTab === 'rewards') b.innerHTML = parentRewards();
  else if (pTab === 'ledger') b.innerHTML = parentLedger();
  else b.innerHTML = parentSettings();
}
function totalPending() { return fam.children.reduce((s, c) => s + c.pending.filter(e => e.status === 'pending').length, 0); }
async function refreshFam() { const r = await api('/api/family'); if (r.id) fam = r; }

// 首次登录强制修改 PIN（不可跳过）
function renderForcePin() {
  $('#app').innerHTML = `
    <div class="topbar"><div class="title">🔐 安全设置</div><div class="who"><a href="#" style="color:#6b7280" onclick="doLogout();return false">退出</a></div></div>
    <div class="card" style="margin-top:40px">
      <h3>首次登录，请修改初始 PIN</h3>
      <div class="warnbox">初始 PIN 是 1234，孩子猜得到！必须改成你自己的 PIN 才能继续使用</div>
      <label>初始 PIN</label><input id="fp_old" type="password" value="1234" readonly>
      <label>新 PIN（4-8 位数字，别再用 1234）</label><input id="fp_new" type="password" inputmode="numeric" maxlength="8" placeholder="例如 8642">
      <label>再输一遍</label><input id="fp_new2" type="password" inputmode="numeric" maxlength="8">
      <button class="btn" onclick="doForcePin()">确认修改并进入</button>
    </div>`;
}
async function doForcePin() {
  const nw = $('#fp_new').value, nw2 = $('#fp_new2').value;
  if (!/^\d{4,8}$/.test(nw)) return toast('新 PIN 需 4-8 位数字', true);
  if (nw === '1234') return toast('不许还用 1234！', true);
  if (nw !== nw2) return toast('两次输入不一致', true);
  const r = await api('/api/pin/change', { oldPin: '1234', newPin: nw });
  if (r.error) return toast(r.error, true);
  fam.pinChanged = true; toast('PIN 已修改，欢迎使用！'); renderParent();
}

// PIN 不再拦门：仅在敏感操作（结算/改规则/撤销/删投诉）时由 withPin 弹出二次确认

function parentOverview() {
  return fam.children.map(c => `
    <div class="card">
      <h3>${c.pet ? c.pet.emoji : '🥚'} ${esc(c.name)} <span class="badge">${esc(c.grade || '')}</span> ${c.paused ? '<span class="badge a">暂停计</span>' : ''}</h3>
      <div class="stat-grid">
        <div class="stat"><div class="v">${c.intimacy}</div><div class="k">亲密度（月度）</div></div>
        <div class="stat"><div class="v">${c.pet ? 'Lv' + c.level : '—'}</div><div class="k">${c.pet ? c.pet.stage + ' · ' + esc(c.pet.nickname) : '未选宠物'}</div></div>
        <div class="stat"><div class="v">¥${c.nextAllowance}</div><div class="k">下月零花钱（基础${c.allowanceBase}${c.allowanceLocked ? '+锁定' + c.allowanceLocked.amount : ''}）</div></div>
        <div class="stat"><div class="v">${c.feedStreak}</div><div class="k">连续投喂</div></div>
      </div>
      ${c.pausedDays >= 7 ? `<div class="warnbox mt8">⏸️ 暂停计已开 ${c.pausedDays} 天，病好了记得关！</div>` : ''}
      ${c.milestone.applications.filter(a => a.status === 'pending').length ? `
        <div class="okbox mt8">🏆 学期大奖申请：${esc(c.milestone.applications.find(a => a.status === 'pending').note)}</div>
        <div class="row"><button class="btn sm ok" onclick="decideMilestone('${c.id}','approve')">通过</button><button class="btn sm bad" onclick="decideMilestone('${c.id}','reject')">驳回</button></div>` : ''}
      <div class="row mt8">
        <button class="btn sm ghost" onclick="genBind('${c.id}')">📱 生成绑定码</button>
        <button class="btn sm ${c.paused ? 'ok' : 'warn'}" onclick="togglePause('${c.id}',${!c.paused})">${c.paused ? '恢复计分' : '⏸️ 暂停计（生病）'}</button>
        <button class="btn sm ghost" onclick="unbindChild('${c.id}')">🔓 解绑设备（${c.devices || 0}）</button>
        <button class="btn sm ghost" onclick="editChild('${c.id}')">✏️ 编辑</button>
        <button class="btn sm bad" onclick="deleteChild('${c.id}')">🗑️ 删除</button>
      </div>
    </div>`).join('') + `
    <div class="card">
      <h3>➕ 添加孩子</h3>
      <div class="row"><input id="nc_name" placeholder="名字" style="margin-top:0"><input id="nc_grade" placeholder="年级" style="margin-top:0"></div>
      <button class="btn" onclick="addChild()">添加</button>
    </div>`;
}
function editChild(childId) {
  const c = fam.children.find(x => x.id === childId);
  if (!c) return;
  openModal(`<h3>✏️ 编辑孩子信息</h3>
    <label>名字</label><input id="ce_name" value="${esc(c.name)}" maxlength="12">
    <label>年级</label><input id="ce_grade" value="${esc(c.grade || '')}" maxlength="12">
    <button class="btn" onclick="doEditChild('${childId}')">保存</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function doEditChild(childId) {
  const r = await api('/api/child/edit', { childId, name: $('#ce_name').value, grade: $('#ce_grade').value });
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); toast('已保存'); renderParent();
}
async function deleteChild(childId) {
  const c = fam.children.find(x => x.id === childId);
  if (!c) return;
  askConfirm(`⚠️ 彻底删除「${c.name}」？宠物/积分/兑换全部清空且不可恢复（历史账本保留留痕）。`, async () => {
    const r = await pinApi('/api/child/delete', { childId });
    if (!r) return; if (r.error) return toast(r.error, true);
    fam = r.family; toast('已删除（历史账本保留）'); renderParent();
  }, '🗑️ 删除孩子');
}
async function addChild() {
  const r = await api('/api/child', { name: $('#nc_name').value, grade: $('#nc_grade').value });
  if (r.error) return toast(r.error, true);
  fam = r.family; renderParent();
}
async function genBind(childId) {
  const r = await api('/api/child/bindcode', { childId });
  if (r.error) return toast(r.error, true);
  openModal(`<h3>孩子端绑定</h3>
    <div class="okbox">在孩子手机上打开 App → 「我是孩子」→ 输入下面的码</div>
    <div style="text-align:center;font-size:40px;font-weight:800;letter-spacing:8px;padding:16px">${r.code}</div>
    <div class="lead" style="text-align:center">8 位码 · 30 分钟内有效 · 一次性</div>
    <div class="muted-line" style="text-align:center">绑定后该手机长期免登录；换手机/丢手机可在总览「解绑设备」</div>
    <button class="btn" onclick="closeModal()">知道了</button>`);
}
async function unbindChild(childId) {
  askConfirm('解绑该孩子的全部登录设备？孩子手机下次打开需要重新输绑定码（换手机/丢手机时用）', async () => {
    const r = await api('/api/child/unbind', { childId });
    if (r.error) return toast(r.error, true);
    fam = r.family; toast(`已解绑 ${r.revoked} 台设备`); renderParent();
  }, '📵 解绑设备');
}
async function togglePause(childId, on) {
  const r = await api('/api/pause', { childId, on });
  if (r.error) return toast(r.error, true);
  fam = r.family; renderParent();
}
async function decideMilestone(childId, decision) {
  const r = await api('/api/milestone/approve', { childId, decision });
  if (r.error) return toast(r.error, true);
  fam = r.family; toast(decision === 'approve' ? '已通过，记得兑现大奖' : '已驳回（申请权保留，可重提）'); renderParent();
}

function parentInbox() {
  let any = false;
  const html = fam.children.map(c => c.pending.filter(e => e.status === 'pending').map(e => {
    any = true;
    return `<div class="card">
      <h3>${esc(c.name)} · ${esc(e.label)} <span class="badge a">+${e.points}</span></h3>
      <div class="lead">${esc(e.note || '（无说明）')} · ${fmt(e.ts)}</div>
      ${e.hasPhoto ? `<img class="photo-thumb" src="/api/photo?id=${e.id}&token=${token}" onclick="window.open(this.src)">` : '<div class="muted-line">无照片佐证</div>'}
      <div class="row mt8">
        <button class="btn sm ok" onclick="approve('${e.id}','approve')">✅ 通过 +${e.points}</button>
        <button class="btn sm bad" onclick="approve('${e.id}','reject')">❌ 驳回</button>
      </div>
    </div>`;
  }).join('')).join('');
  return any ? html : '<div class="card"><div class="muted-line">没有待审核的申报，清净～</div></div>';
}
async function approve(id, decision) {
  if (decision === 'reject') {
    askText('驳回申报', '驳回原因（孩子可见，可留空）', async reason => {
      const r = await api('/api/approve', { eventId: id, decision, reason: reason || '' });
      if (r.error) return toast(r.error, true);
      fam = r.family; toast('已驳回'); renderParent();
    }, { tip: '驳回原因会展示给孩子' });
  } else {
    const r = await api('/api/approve', { eventId: id, decision });
    if (r.error) return toast(r.error, true);
    fam = r.family; toast('已通过，分数到账 ✅'); renderParent();
  }
}

function parentOps() {
  return `
    <div class="card">
      <h3>✏️ 手动加减分</h3>
      ${fam.children.map(c => `
        <div class="item">
          <div class="t"><div class="n">${esc(c.name)}（当前 ${c.intimacy}）</div></div>
          <button class="btn sm" onclick="manual('${c.id}', 1)">加分</button>
          <button class="btn sm bad" onclick="manual('${c.id}', -1)">减分</button>
        </div>`).join('')}
    </div>
    <div class="card">
      <h3>📣 录入投诉</h3>
      <div class="warnbox">投诉次数不限，扣分可自定义（1~200）；当月存在未取消的投诉，则当月无投诉奖作废。误录可「取消」退分（留痕），或彻底删除（需 PIN）。</div>
      ${fam.children.map(c => `
        <div class="item">
          <div class="t"><div class="n">${esc(c.name)}</div><div class="s">本月有效投诉 ${activeComplaintCount(c)} 条 · 默认扣 ${c.rules.complaint} 分</div></div>
          <button class="btn sm bad" onclick="openComplaint('${c.id}')">➕ 录入投诉</button>
        </div>
        ${complaintRecords(c)}`).join('')}
    </div>`;
}
function openComplaint(childId) {
  const c = fam.children.find(x => x.id === childId);
  if (!c) return;
  openModal(`<h3>📣 录入投诉（${esc(c.name)}）</h3>
    <label>投诉来源</label>
    <select id="cm_src" onchange="document.getElementById('cm_cust').style.display=this.value==='other'?'block':'none'">
      <option value="teacher">老师</option>
      <option value="grandparent">爷爷奶奶</option>
      <option value="other">其他（自填）</option>
    </select>
    <div id="cm_cust" style="display:none"><label>来源名称</label><input id="cm_srcname" maxlength="10" placeholder="例如 补习班老师 / 邻居"></div>
    <label>扣分（默认 ${c.rules.complaint}，可改 1~200）</label><input id="cm_d" type="number" min="1" max="200" value="${c.rules.complaint}">
    <label>事由（可选）</label><input id="cm_r" placeholder="例如 上课讲话 / 作业没写完">
    <button class="btn bad" onclick="doComplaint('${childId}')">确认录入</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function doComplaint(childId) {
  const srcSel = $('#cm_src');
  const r = await api('/api/complaint', {
    childId, source: srcSel.value, srcName: $('#cm_srcname') ? $('#cm_srcname').value : '',
    delta: +$('#cm_d').value, reason: $('#cm_r').value
  });
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); toast('已录入 −' + $('#cm_d').value + ' 亲密度'); renderParent();
}
function curMonthKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function activeComplaintCount(c) {
  const mk = curMonthKey();
  return (c.complaints || []).filter(x => x.status === 'active' && x.ts && x.ts.startsWith(mk)).length;
}
function complaintRecords(c) {
  const list = (c.complaints || []).slice().reverse().slice(0, 10);
  if (!list.length) return '';
  return list.map(x => {
    const srcName = x.src === 'teacher' ? '老师' : x.src === 'grandparent' ? '爷爷奶奶' : (x.srcName || '其他');
    return `
    <div class="item" style="padding-left:12px">
      <div class="t"><div class="n">${esc(srcName)}投诉 −${x.delta}${x.reason ? '：' + esc(x.reason) : ''}</div><div class="s">${fmt(x.ts)}${x.status === 'cancelled' ? ' · 已取消（分已退）' : ''}</div></div>
      ${x.status === 'active' ? `
        <button class="btn sm ghost" onclick="editComplaint('${c.id}','${x.id}')">改</button>
        <button class="btn sm ok" onclick="cancelComplaint('${c.id}','${x.id}')">取消退分</button>
        <button class="btn sm bad" onclick="delComplaint('${c.id}','${x.id}')">删除</button>` : ''}
    </div>`;
  }).join('');
}
async function manual(childId, sign) {
  const quick = (fam.customRules || []).filter(r => sign > 0 ? r.delta > 0 : r.delta < 0);
  openModal(`<h3>手动${sign > 0 ? '加' : '减'}分</h3>
    ${quick.length ? `<div class="lead">快捷项（按设置里配置的分值直接记）：</div>${quick.map(r => `<button class="btn ghost" onclick="quickRule('${childId}','${r.id}')">${esc(r.name)}（${r.delta > 0 ? '+' : ''}${r.delta}）</button>`).join('')}` : ''}
    <label>自定义分值</label><input id="mn_n" type="number" min="1">
    <label>原因（账本留痕）</label><input id="mn_r" placeholder="例如 主动帮忙做家务">
    <button class="btn" onclick="doManual('${childId}', ${sign})">确认</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function doManual(childId, sign) {
  const n = Math.abs(Math.round(+$('#mn_n').value));
  if (!n) return toast('请输入分值', true);
  const r = await api('/api/manual', { childId, delta: sign * n, reason: $('#mn_r').value });
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); toast(`已${sign > 0 ? '加' : '减'} ${n} 分`); renderParent();
}
async function quickRule(childId, ruleId) {
  const r = await api('/api/manual', { childId, ruleId });
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); toast('已按快捷项记分'); renderParent();
}
async function complaint(childId, source) {
  askText('录入投诉', '投诉事由（可选）', async reason => {
    const r = await api('/api/complaint', { childId, source, reason: reason || '' });
    if (r.error) return toast(r.error, true);
    fam = r.family; toast('已录入，-' + fam.rules.complaint + ' 亲密度'); renderParent();
  }, { tip: '取消则不录入、不扣分' });
}
function editComplaint(childId, recId) {
  const c = fam.children.find(x => x.id === childId);
  const rec = (c.complaints || []).find(x => x.id === recId);
  if (!rec) return;
  openModal(`<h3>编辑投诉</h3>
    <label>来源</label><select id="cp_src"><option value="teacher" ${rec.src === 'teacher' ? 'selected' : ''}>老师</option><option value="grandparent" ${rec.src === 'grandparent' ? 'selected' : ''}>爷爷奶奶</option><option value="other" ${rec.src === 'other' ? 'selected' : ''}>其他</option></select>
    <label>来源名称（选"其他"时生效）</label><input id="cp_srcn" value="${esc(rec.srcName || '')}" maxlength="10">
    <label>扣分</label><input id="cp_d" type="number" min="0" value="${rec.delta}">
    <label>事由</label><input id="cp_r" value="${esc(rec.reason)}">
    <div class="muted-line">改扣分会自动补/退差额并写账本</div>
    <button class="btn" onclick="doEditComplaint('${childId}','${recId}')">保存</button>
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function doEditComplaint(childId, recId) {
  const r = await api('/api/complaint/edit', { childId, recId, src: $('#cp_src').value, srcName: $('#cp_srcn').value, delta: +$('#cp_d').value, reason: $('#cp_r').value });
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); toast('投诉已更新'); renderParent();
}
async function cancelComplaint(childId, recId) {
  askConfirm('取消该投诉并退还扣分？（留痕可查，不影响账目对齐）', async () => {
    const r = await api('/api/complaint/cancel', { childId, recId });
    if (r.error) return toast(r.error, true);
    fam = r.family; toast('已取消并退分'); renderParent();
  }, '↩️ 取消投诉');
}
async function delComplaint(childId, recId) {
  askConfirm('彻底删除该投诉记录（退回扣分）？删除后不可恢复。', async () => {
    const r = await pinApi('/api/complaint/delete', { childId, recId });
    if (!r) return; if (r.error) return toast(r.error, true);
    fam = r.family; toast('已删除并退分'); renderParent();
  }, '🗑️ 删除投诉');
}

function parentRewards() {
  return `
    <div class="card">
      <h3>🎁 奖励目录</h3>
      ${fam.rewards.map(r => `
        <div class="item">
          <div class="t"><div class="n">${esc(r.name)} <span class="badge">${r.type === 'cash' ? '现金' : r.type === 'ticket' ? '券' : '实物'}</span></div><div class="s">${r.cost} 分 · ${esc(r.desc || '')}</div></div>
          <button class="btn sm ghost" onclick="editReward('${r.id}')">改</button>
        </div>`).join('')}
      <button class="btn ghost" onclick="editReward(null)">➕ 新增奖励</button>
    </div>
    <div class="card">
      <h3>📦 待发放 / 核销确认</h3>
      <div class="muted-line">「申请核销中」是孩子主动要用的，优先处理；也可以直接主动核销</div>
      ${fam.children.map(c => c.redemptions.filter(r => (r.status || (r.fulfilled ? 'fulfilled' : 'held')) !== 'fulfilled')
        .sort((a, b) => (a.status === 'requested' ? -1 : 1) - (b.status === 'requested' ? -1 : 1))
        .map(r => `
        <div class="item">
          <div class="t"><div class="n">${esc(c.name)} · ${esc(r.name)}</div><div class="s">${fmt(r.ts)}${r.type === 'cash' ? ' · 已锁进下月零花钱' : ''}</div></div>
          ${r.status === 'requested' ? '<span class="badge a">孩子申请核销中</span>' : ''}
          <button class="btn sm ok" onclick="fulfill('${r.id}')">已发放</button>
        </div>`).join('')).join('') || '<div class="muted-line">没有待发放的奖励</div>'}
    </div>`;
}
function editReward(id) {
  const r = id ? fam.rewards.find(x => x.id === id) : null;
  openModal(`<h3>${r ? '编辑' : '新增'}奖励</h3>
    <label>名称</label><input id="rw_n" value="${r ? esc(r.name) : ''}" placeholder="例如 周末游乐园">
    <label>所需亲密度（现金类 1分=1元）</label><input id="rw_c" type="number" value="${r ? r.cost : 50}">
    <label>类型</label><select id="rw_t"><option value="ticket" ${r && r.type === 'ticket' ? 'selected' : ''}>券/特权</option><option value="cash" ${r && r.type === 'cash' ? 'selected' : ''}>现金（锁下月零花钱）</option><option value="thing" ${r && r.type === 'thing' ? 'selected' : ''}>实物</option></select>
    <label>说明</label><input id="rw_d" value="${r ? esc(r.desc || '') : ''}">
    <button class="btn" onclick="saveReward('${id || ''}')">保存</button>
    ${r ? `<button class="btn bad" onclick="delReward('${r.id}')">删除该奖励</button>` : ''}
    <button class="btn ghost" onclick="closeModal()">取消</button>`);
}
async function saveReward(id) {
  const p = { name: $('#rw_n').value, cost: +$('#rw_c').value, type: $('#rw_t').value, desc: $('#rw_d').value };
  if (id) p.id = id;
  const r = await api('/api/reward', p);
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); renderParent();
}
async function delReward(id) {
  const r = await api('/api/reward', { delete: true, id });
  if (r.error) return toast(r.error, true);
  fam = r.family; closeModal(); renderParent();
}
async function fulfill(id) {
  const r = await api('/api/fulfill', { redemptionId: id });
  if (r.error) return toast(r.error, true);
  fam = r.family; toast('已标记发放 ✅'); renderParent();
}

function parentLedger() {
  const mk = curMonthKey();
  return `<div class="card">
    <h3>📒 账本（每笔留痕，当月可撤销）</h3>
    <div class="muted-line">撤销会反向调整亲密度/经验并留下对冲记录；经验可回退，但宠物五维成长点不回收。系统结算与跨月账目不可撤销。</div>
    ${fam.ledger.slice(0, 100).map(l => {
      const canUndo = !l.reversed && l.by !== 'system' && l.ts && l.ts.startsWith(mk) && l.childName;
      return `
      <div class="item">
        <div class="t"><div class="n">${l.childName ? esc(l.childName) + ' · ' : ''}${esc(l.reason)}</div><div class="s">${fmt(l.ts)} · ${l.by === 'parent' ? '家长' : l.by === 'child' ? '孩子' : '系统'}</div></div>
        ${canUndo ? `<button class="btn sm ghost" onclick="undoLedger('${l.id}')">撤销</button>` : l.reversed ? '<span class="badge r">已撤销</span>' : ''}
        <div style="font-weight:700;color:${l.delta > 0 ? 'var(--ok)' : l.delta < 0 ? 'var(--bad)' : 'var(--muted)'}">${l.delta > 0 ? '+' + l.delta : l.delta === 0 ? '·' : l.delta}</div>
      </div>`;
    }).join('') || '<div class="muted-line">还没有记录</div>'}
  </div>`;
}
async function undoLedger(id) {
  askConfirm('撤销该笔账目？将反向调整亲密度/经验（宠物五维成长点不回收），并留下对冲记录。', async () => {
    const r = await pinApi('/api/ledger/undo', { ledgerId: id });
    if (!r) return; if (r.error) return toast(r.error, true);
    fam = r.family; toast('已撤销'); renderParent();
  }, '↩️ 撤销账目');
}

let rulesChildId = '';   // v4: 每孩子独立规则，当前编辑的孩子
function parentSettings() {
  const c = fam.config;
  if (!rulesChildId || !fam.children.find(x => x.id === rulesChildId)) rulesChildId = fam.children[0]?.id || '';
  const rc = fam.children.find(x => x.id === rulesChildId) || fam.children[0];
  const rl = rc ? rc.rules : fam.rules;
  return `
    <div class="card">
      <h3>⚙️ 分值规则（每个孩子独立设置）</h3>
      <div class="tabs" style="margin-bottom:8px">
        ${fam.children.map(x => `<div class="tab ${x.id === rulesChildId ? 'on' : ''}" onclick="rulesChildId='${x.id}';renderParent()">${esc(x.name)}</div>`).join('')}
      </div>
      ${rc ? `
      ${[['feed', '每日作业投喂'], ['streak', '连续7天奖励'], ['quiz', '默写/出门测奖励'], ['exam', '考试奖励'], ['examMin', '考试门槛（分）'], ['quizMin', '默写门槛（%）'], ['pride', '自豪/假期成就'], ['noComplaint', '当月无投诉奖'], ['complaint', '投诉扣分']].map(([k, n]) => `
        <label>${n}</label><input id="rl_${k}" type="number" value="${rl[k] !== undefined ? rl[k] : fam.rules[k]}">`).join('')}
      <div class="muted-line">只对 ${esc(rc.name)} 生效；保存属敏感操作，需输入 PIN 确认</div>
      <button class="btn" onclick="saveRules()">保存 ${esc(rc.name)} 的规则</button>` : '<div class="muted-line">先添加孩子</div>'}
    </div>
    <div class="card">
      <h3>➕ 自定义快捷加减分项（${rc ? esc(rc.name) : ''}专属）</h3>
      <div class="muted-line">在「手动加减分」时一键选用，分值可正可负</div>
      ${rc && (rc.customRules || []).length ? rc.customRules.map(r => `
        <div class="item">
          <div class="t"><div class="n">${esc(r.name)}</div><div class="s">${r.delta > 0 ? '+' : ''}${r.delta} 分</div></div>
          <button class="btn sm bad" onclick="delCustomRule('${r.id}')">删除</button>
        </div>`).join('') : '<div class="muted-line">还没有自定义项</div>'}
      <div class="row"><input id="cr_n" placeholder="项目名称" style="margin-top:0"><input id="cr_d" type="number" placeholder="分值（可负）" style="margin-top:0"><button class="btn sm" onclick="addCustomRule()">添加</button></div>
    </div>
    <div class="card">
      <h3>🏫 基础配置</h3>
      <label>月初亲密度</label><input id="cf_init" type="number" value="${c.initialIntimacy}">
      <label>基础零花钱（下月零花钱 = 基础 + 锁定加成）</label><input id="cf_base" type="number" value="${c.baseAllowance}">
      <label>投喂时段（小时，假期模式自动全天）</label>
      <div class="row"><input id="cf_sh" type="number" value="${c.feedWindow.startHour}" style="margin-top:0"><span>点 至</span><input id="cf_eh" type="number" value="${c.feedWindow.endHour}" style="margin-top:0"><span>点</span></div>
      <label>每周加分上限（0 = 不限制）</label><input id="cf_cap" type="number" value="${c.weeklyCap}">
      <label>每日对战场次上限</label><input id="cf_bt" type="number" value="${c.battleDailyLimit}">
      <label>随机奇遇概率（0~1，0 = 关闭，如 0.12 = 12%）</label><input id="cf_rev" type="number" min="0" max="1" step="0.01" value="${c.randomEventChance !== undefined ? c.randomEventChance : 0.12}">
      <label>学期名称</label><input id="cf_semn" value="${esc(c.semester.name)}">
      <label>开学日期（到日自动开新学期，留空则手动）</label><input id="cf_semd" type="date" value="${c.semester.startDate || ''}">
      <button class="btn" onclick="saveConfig()">保存配置</button>
      <button class="btn ghost" onclick="toggleHoliday()">${c.holidayMode ? '🏖️ 关闭假期模式' : '🏖️ 开启假期模式'}</button>
    </div>
    <div class="card">
      <h3>🔔 结算与月报</h3>
      <div class="muted-line">月度结算每月1号自动执行（无投诉奖发放+亲密度重置），手动仅用于纠错</div>
      <button class="btn ghost" onclick="settleMonth()">手动触发月度结算</button>
      <button class="btn warn" onclick="settleSemester()">🎓 学期结算（宠物毕业进图鉴）</button>
      <button class="btn ok" onclick="showReport()">📄 生成月报（可复制发微信）</button>
    </div>
    <div class="card">
      <h3>🔐 修改 PIN</h3>
      <div class="muted-line">初始 PIN 是 1234；首次登录已强制修改。忘了 PIN 可在登录页用密保问题找回</div>
      <div class="row"><input id="pc_old" type="password" placeholder="旧 PIN" style="margin-top:0"><input id="pc_new" type="password" placeholder="新 PIN（4-8位数字）" style="margin-top:0"></div>
      <button class="btn" onclick="changePin()">修改</button>
    </div>
    <div class="card">
      <h3>🛡️ 密保问题（找回密码/PIN）</h3>
      <div class="muted-line">${fam.securityQ ? '当前问题：' + esc(fam.securityQ) : '还没设置！忘记密码时只能靠它自助找回，强烈建议设置'}</div>
      <label>密保问题</label><input id="sq_q" value="${esc(fam.securityQ || '')}" maxlength="60" placeholder="例如 我的小学叫什么">
      <label>密保答案</label><input id="sq_a" maxlength="60" placeholder="${fam.securityQ ? '留空表示不修改答案' : '答案（不分大小写）'}">
      <button class="btn" onclick="saveSecurity()">保存密保</button>
    </div>`;
}
async function saveSecurity() {
  const q = $('#sq_q').value.trim(), a = $('#sq_a').value.trim();
  if (!q) return toast('问题不能为空', true);
  if (!a && !fam.securityQ) return toast('答案不能为空', true);
  const r = await api('/api/security', { question: q, answer: a });
  if (r.error) return toast(r.error, true);
  fam = r.family; toast('密保已保存'); renderParent();
}
async function saveRules() {
  const p = { core: {}, childId: rulesChildId }; ['feed', 'streak', 'quiz', 'exam', 'examMin', 'quizMin', 'pride', 'noComplaint', 'complaint'].forEach(k => p.core[k] = +$('#rl_' + k).value);
  const r = await pinApi('/api/rules', p);
  if (!r) return; if (r.error) return toast(r.error, true);
  fam = r.family; toast('规则已保存'); renderParent();
}
async function addCustomRule() {
  const name = $('#cr_n').value.trim(), delta = Math.round(+$('#cr_d').value);
  if (!name || !delta) return toast('需填名称和非 0 分值', true);
  const r = await pinApi('/api/rules', { customAdd: { name, delta }, childId: rulesChildId });
  if (!r) return; if (r.error) return toast(r.error, true);
  fam = r.family; toast('自定义项已添加'); renderParent();
}
async function delCustomRule(id) {
  const r = await pinApi('/api/rules', { customDel: id, childId: rulesChildId });
  if (!r) return; if (r.error) return toast(r.error, true);
  fam = r.family; toast('已删除'); renderParent();
}
async function saveConfig() {
  try {
    const r = await api('/api/config', {
      initialIntimacy: +$('#cf_init').value, baseAllowance: +$('#cf_base').value,
      feedWindow: { startHour: +$('#cf_sh').value, endHour: +$('#cf_eh').value },
      weeklyCap: +$('#cf_cap').value, battleDailyLimit: +$('#cf_bt').value,
      randomEventChance: +$('#cf_rev').value,
      semesterName: $('#cf_semn').value, semesterStartDate: $('#cf_semd').value
    });
    if (r.error) return toast(r.error, true);
    fam = r.family; toast('配置已保存');
  } catch (e) {
    console.error('saveConfig 失败', e);
    toast('保存失败：' + e.message, true);
  }
}
async function toggleHoliday() {
  const r = await api('/api/config', { holidayMode: !fam.config.holidayMode });
  if (r.error) return toast(r.error, true);
  fam = r.family; toast(fam.config.holidayMode ? '假期模式已开启：投喂全天可领，申报切换为假期成就' : '已恢复日常模式'); renderParent();
}
async function settleMonth() {
  askConfirm('确认手动触发月度结算？将发放无投诉奖并重置亲密度（通常无需手动）', async () => {
    const r = await pinApi('/api/settle/month', {});
    if (!r) return; if (r.error) return toast(r.error, true);
    fam = r.family; toast('月度结算完成'); renderParent();
  }, '🗓️ 月度结算');
}
async function settleSemester() {
  askConfirm('学期结算：所有宠物毕业进图鉴、经验清零、新学期重挑宠物。确认？', async () => {
    const r = await pinApi('/api/settle/semester', {});
    if (!r) return; if (r.error) return toast(r.error, true);
    fam = r.family; toast(`学期结算完成，${r.entries} 只宠物毕业进图鉴 🎓`); renderParent();
  }, '🎓 学期结算');
}
async function showReport() {
  const r = await api('/api/report');
  if (r.error) return toast(r.error, true);
  openModal(`<h3>📄 本月月报</h3>
    <textarea id="rep" rows="14" readonly>${esc(r.text)}</textarea>
    <button class="btn ok" onclick="copyReport()">一键复制（发微信）</button>
    <button class="btn ghost" onclick="closeModal()">关闭</button>`);
}
function copyReport() {
  const ta = $('#rep'); ta.select();
  if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => toast('已复制，去粘贴发微信吧'));
  else { document.execCommand('copy'); toast('已复制'); }
}
async function changePin() {
  const r = await api('/api/pin/change', { oldPin: $('#pc_old').value, newPin: $('#pc_new').value });
  if (r.error) return toast(r.error, true);
  fam.pinChanged = true; toast('PIN 已修改'); renderParent();
}

boot();
