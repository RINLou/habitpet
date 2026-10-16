// 分支整理：main 快进到生产 tip + 删除已完全合并的分支
const { execSync } = require('child_process');
const API = 'https://api.github.com';
const REPO = 'RINLou/habitpet';
const TIP = '96c66eb7bfc62b541992d299bb2b3c5eb09e5724'; // merge/lingxi-base 生产 tip

function getToken() {
  if (process.env.GH_PAT) return process.env.GH_PAT;
  const out = execSync('printf "host=github.com\\nprotocol=https\\n\\n" | git credential fill', {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }),
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('未找到 GitHub 凭据');
  return m[1].trim();
}

async function gh(p, method, body) {
  const r = await fetch(API + p, {
    method,
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'habitpet-tidy' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  return { ok: r.ok, status: r.status, j };
}

(async () => {
  // 1) main 快进（非强制；仅当是 ff 才成功）
  const mainRef = await gh('/repos/' + REPO + '/git/ref/heads/main', 'GET');
  console.log('main 当前:', mainRef.j.object.sha);
  const ff = await gh('/repos/' + REPO + '/git/refs/heads/main', 'PATCH', { sha: TIP, force: false });
  if (ff.ok) console.log('main 已快进 ->', ff.j.object.sha);
  else console.log('main 快进失败（非 ff?）:', ff.status, JSON.stringify(ff.j).slice(0, 200));

  // 2) 删除已完全合并的 codex/story-release-ready
  const del = await gh('/repos/' + REPO + '/git/refs/heads/codex%2Fstory-release-ready', 'DELETE');
  console.log('删除 codex/story-release-ready:', del.ok ? 'OK' : del.status + ' ' + JSON.stringify(del.j).slice(0, 150));

  // 3) 列最终分支状态
  const refs = await gh('/repos/' + REPO + '/git/refs/heads', 'GET');
  console.log('远端分支终态:');
  for (const r of refs.j) console.log('  -', r.ref.replace('refs/heads/', ''), '->', r.object.sha.slice(0, 8));
  console.log('DONE');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
