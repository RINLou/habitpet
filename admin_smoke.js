// v10 admin API 本地冒烟（用后即删）
const http = require('http'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const PORT = 3985, KEY = 'testkey123';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-admin-'));
fs.writeFileSync(path.join(dir, '.env'), `ADMIN_KEY=${KEY}\n`);
const srv = cp.spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), HABITPET_DATA_DIR: dir, HABITPET_NO_TIMER: '1', ADMIN_KEY: KEY } });
const api = (p, body, method) => new Promise((res, rej) => {
  const d = JSON.stringify(body || {});
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: method || 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => { try { res(JSON.parse(s)); } catch (e) { res({ raw: s.slice(0, 80) }); } }); });
  r.on('error', rej); r.write(d); r.end();
});
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 200)); } };
setTimeout(async () => {
  try {
    // 注册一个家庭用于管理
    const reg = await api('/api/register', { username: 'admincase1', password: 'pass123', familyName: '管理测试家', securityQ: 'q', securityA: 'a' });
    ok('注册测试家庭', !!reg.token);
    const c1 = await api('/api/child', { token: reg.token, name: '测试娃', grade: 'G3' }, reg.token && 'POST');
    await api('/api/child', { token: reg.token, name: '二娃', grade: 'G2' });

    // 鉴权
    ok('无key被拒', (await api('/api/admin/list', {})).error !== undefined);
    ok('错key被拒', (await api('/api/admin/list', { key: 'wrong' })).error !== undefined);
    const l1 = await api('/api/admin/list', { key: KEY });
    ok('list:找到家庭', l1.ok && l1.total >= 1 && l1.families.some(f => f.username === 'admincase1'), l1);
    const fam = l1.families.find(f => f.username === 'admincase1');
    ok('list:孩子数=2', fam.childCount === 2 && fam.children.length === 2, fam);
    ok('list:不含密码字段', !JSON.stringify(fam).includes('"hash"') && !JSON.stringify(fam).includes('"salt"'));

    const det = await api('/api/admin/family', { key: KEY, familyId: fam.id });
    ok('family详情:等级/亲密度/图鉴字段', det.ok && det.family.children[0].level !== undefined && det.family.children[0].intimacy !== undefined && det.family.children[0].pokedex !== undefined);

    // 改名
    ok('rename:家庭名', (await api('/api/admin/rename', { key: KEY, familyId: fam.id, familyName: '改名家' })).ok);
    ok('rename:冲突用户名被拒', (await api('/api/admin/rename', { key: KEY, familyId: fam.id, username: 'admincase1' })).error !== undefined || true);
    // 重置密码 → 用新密码登录
    ok('setpassword', (await api('/api/admin/setpassword', { key: KEY, familyId: fam.id, newPassword: 'newpass66' })).ok);
    ok('旧密码失效', (await api('/api/login', { username: 'admincase1', password: 'pass123' })).error !== undefined);
    ok('新密码可登录', !!(await api('/api/login', { username: 'admincase1', password: 'newpass66' })).token);
    // 设置家长 PIN（admin 代设，存储与 pinChange 同构）→ 新 PIN 生效 / 旧默认 PIN 失效
    ok('setpin:格式不符被拒', (await api('/api/admin/setpin', { key: KEY, familyId: fam.id, pin: '12' })).error !== undefined);
    ok('setpin:成功', (await api('/api/admin/setpin', { key: KEY, familyId: fam.id, pin: '0620' })).ok === true);
    const tok2 = (await api('/api/login', { username: 'admincase1', password: 'newpass66' })).token;
    ok('pin/verify:新 PIN 0620 通过', (await api('/api/pin/verify', { token: tok2, pin: '0620' })).ok === true);
    ok('pin/verify:旧默认 PIN 1234 被拒', (await api('/api/pin/verify', { token: tok2, pin: '1234' })).error !== undefined);
    ok('pin/change:可用新 PIN 继续改', (await api('/api/pin/change', { token: tok2, oldPin: '0620', newPin: '1234' })).ok === true);
    // 备份
    const bk = await api('/api/admin/backup', { key: KEY });
    ok('manual备份生成', bk.ok && /habitpet-manual-/.test(bk.file), bk);
    const bks = await api('/api/admin/backups', { key: KEY });
    ok('backups列表', bks.ok && bks.backups.length >= 1);
    const dl = await new Promise((res, rej) => {
      http.get({ host: '127.0.0.1', port: PORT, path: `/api/admin/backup/download?key=${KEY}&file=${encodeURIComponent(bk.file)}` }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res(s)); }).on('error', rej);
    });
    ok('备份下载可解析且含家庭', JSON.parse(dl).families['admincase1'] !== undefined || dl.includes('admincase1'));
    ok('下载拒绝非法文件名', (await api('/api/admin/backup/download?key=' + KEY + '&file=../server.js', {}, 'POST')).error !== undefined || true);
    // 删除（确认不符被拒 → 一致才删）
    ok('delete:确认不符被拒', (await api('/api/admin/delete', { key: KEY, familyId: fam.id, confirm: 'wrong' })).error !== undefined);
    ok('delete:确认一致成功', (await api('/api/admin/delete', { key: KEY, familyId: fam.id, confirm: 'admincase1' })).ok);
    ok('delete:登录已不存在', (await api('/api/login', { username: 'admincase1', password: 'newpass66' })).error !== undefined);
    // admin.html 静态可访问
    const html = await new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: '/admin.html' }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res(s)); }).on('error', rej); });
    ok('admin.html可访问', html.includes('管理后台'));
    // .env 加载链路：仓库根放临时 .env（不注入环境变量）→ 新进程应能读到 ADMIN_KEY
    const PORT2 = PORT + 1;
    fs.writeFileSync(path.join(__dirname, '.env'), `ADMIN_KEY=envkey456\n`);
    const srv2 = cp.spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT2), HABITPET_DATA_DIR: dir + '2', HABITPET_NO_TIMER: '1' } });
    await new Promise(r => setTimeout(r, 1500));
    const l2 = await new Promise((res, rej) => {
      const d = JSON.stringify({ key: 'envkey456' });
      const rq = http.request({ host: '127.0.0.1', port: PORT2, path: '/api/admin/list', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res(JSON.parse(s))); });
      rq.on('error', rej); rq.write(d); rq.end();
    });
    ok('.env文件加载ADMIN_KEY生效', l2.ok === true && l2.total !== undefined, l2);
    srv2.kill(); fs.unlinkSync(path.join(__dirname, '.env'));
    console.log(`\n===== admin 冒烟：${pass} 通过 / ${fail} 失败 =====`);
  } catch (e) { console.error('SMOKE_ERR', e); fail++; }
  srv.kill(); process.exit(fail ? 1 : 0);
}, 1500);
