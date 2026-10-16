// 删除远端分支（默认 codex/p1-correction-review，已获老板批准）
const { execSync } = require('child_process');
const BR = process.argv[2] || 'codex/p1-correction-review';
const TOKEN = execSync('printf "host=github.com\\nprotocol=https\\n\\n" | git credential fill', {
  encoding: 'utf8',
  env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }),
}).match(/^password=(.+)$/m)[1].trim();
(async () => {
  const del = await fetch('https://api.github.com/repos/RINLou/habitpet/git/refs/heads/' + encodeURIComponent(BR), {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'habitpet-tidy' },
    signal: AbortSignal.timeout(20000),
  });
  console.log('远端删除', BR + ':', del.status === 204 ? 'OK (204)' : del.status + ' ' + (await del.text()).slice(0, 150));
  const refs = await (await fetch('https://api.github.com/repos/RINLou/habitpet/git/refs/heads', {
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'habitpet-tidy' },
    signal: AbortSignal.timeout(20000),
  })).json();
  console.log('远端分支终态:');
  for (const x of refs) console.log('  -', x.ref.replace('refs/heads/', ''), '->', x.object.sha.slice(0, 8));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
